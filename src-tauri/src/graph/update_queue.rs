use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio::time;
use sha2::{Sha256, Digest};

use super::GraphManagerTrait;
use super::sync::sync_single_file;
use super::metrics::{MetricsTracker, QueuePerformanceMonitor};

/// Represents a pending update to be synced to Neo4j
#[derive(Debug, Clone)]
pub struct PendingUpdate {
    pub file_path: PathBuf,
    pub vault_path: PathBuf,
    pub content_hash: String,
    pub file_size: usize,
    pub timestamp: Instant,
}

/// Configuration for the update queue
#[derive(Debug, Clone)]
pub struct UpdateQueueConfig {
    /// Maximum number of updates to batch together
    pub max_batch_size: usize,
    /// Maximum time to wait before processing a batch
    pub batch_interval: Duration,
    /// Minimum time between updates for the same file
    pub debounce_interval: Duration,
    /// Function to calculate debounce delay based on file size
    pub debounce_calculator: fn(usize) -> Duration,
}

impl Default for UpdateQueueConfig {
    fn default() -> Self {
        Self {
            max_batch_size: 10,
            batch_interval: Duration::from_secs(30),
            debounce_interval: Duration::from_secs(2),
            debounce_calculator: calculate_debounce_delay,
        }
    }
}

/// Calculates dynamic debounce delay based on file size
pub fn calculate_debounce_delay(file_size: usize) -> Duration {
    if file_size < 10_000 {
        // Small files: 2 seconds
        Duration::from_secs(2)
    } else if file_size < 100_000 {
        // Medium files: 5 seconds
        Duration::from_secs(5)
    } else {
        // Large files: 10 seconds
        Duration::from_secs(10)
    }
}

/// Manages the queue of pending Neo4j updates
pub struct UpdateQueue {
    /// Queue of pending updates
    queue: Arc<Mutex<VecDeque<PendingUpdate>>>,
    /// Map of file paths to their last update time for debouncing
    last_update_times: Arc<Mutex<std::collections::HashMap<PathBuf, Instant>>>,
    /// Configuration
    config: UpdateQueueConfig,
    /// Graph manager reference
    graph_manager: Arc<dyn GraphManagerTrait>,
    /// Flag to track if processor is running
    processing: Arc<Mutex<bool>>,
    /// Performance metrics tracker
    metrics: Arc<MetricsTracker>,
}

impl UpdateQueue {
    /// Creates a new update queue with the given configuration
    pub fn new(graph_manager: Arc<dyn GraphManagerTrait>, config: UpdateQueueConfig) -> Self {
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            last_update_times: Arc::new(Mutex::new(std::collections::HashMap::new())),
            config,
            graph_manager,
            processing: Arc::new(Mutex::new(false)),
            metrics: Arc::new(MetricsTracker::new()),
        }
    }

    /// Adds an update to the queue, applying debouncing logic
    pub async fn add_update(&self, file_path: PathBuf, vault_path: PathBuf, content: &str) -> Result<(), String> {
        let file_size = content.len();
        let content_hash = Self::calculate_content_hash(content);
        
        // Calculate debounce delay based on file size
        let debounce_delay = (self.config.debounce_calculator)(file_size);
        
        // Check if we should debounce this update
        let mut last_times = self.last_update_times.lock().await;
        if let Some(&last_time) = last_times.get(&file_path) {
            let elapsed = Instant::now() - last_time;
            if elapsed < debounce_delay {
                // Skip this update due to debouncing
                return Ok(());
            }
        }
        
        // Update last update time
        last_times.insert(file_path.clone(), Instant::now());
        drop(last_times);
        
        // Create pending update
        let update = PendingUpdate {
            file_path,
            vault_path,
            content_hash,
            file_size,
            timestamp: Instant::now(),
        };
        
        // Add to queue
        let mut queue = self.queue.lock().await;
        
        // Remove any existing update for the same file
        queue.retain(|u| u.file_path != update.file_path);
        
        // Add new update
        queue.push_back(update.clone());
        let queue_size = queue.len();
        drop(queue);
        
        // Update metrics
        self.metrics.update_queue_size(queue_size).await;
        self.metrics.record_queue_wait(update.timestamp.elapsed()).await;
        
        // Update queued
        
        // Start processing if not already running
        self.ensure_processor_running().await;
        
        // Check if we should process immediately due to batch size
        if queue_size >= self.config.max_batch_size {
            self.process_batch().await?;
        }
        
        Ok(())
    }
    
    /// Ensures the background processor is running
    async fn ensure_processor_running(&self) {
        let mut processing = self.processing.lock().await;
        if !*processing {
            *processing = true;
            drop(processing);
            
            // Start background processor
            let queue = self.queue.clone();
            let config = self.config.clone();
            let graph_manager = self.graph_manager.clone();
            let processing_flag = self.processing.clone();
            
            tokio::spawn(async move {
                // Background processor started
                
                loop {
                    // Wait for batch interval
                    time::sleep(config.batch_interval).await;
                    
                    // Check if queue is empty
                    let queue_lock = queue.lock().await;
                    if queue_lock.is_empty() {
                        drop(queue_lock);
                        // Mark processor as not running
                        let mut proc = processing_flag.lock().await;
                        *proc = false;
                        drop(proc);
                        // Processor stopped
                        break;
                    }
                    drop(queue_lock);
                    
                    // Process batch
                    Self::process_batch_static(&queue, &graph_manager, &config).await;
                }
            });
        }
    }
    
    /// Processes a batch of updates
    pub async fn process_batch(&self) -> Result<(), String> {
        Self::process_batch_static(&self.queue, &self.graph_manager, &self.config).await;
        Ok(())
    }
    
    /// Static method to process a batch
    async fn process_batch_static(
        queue: &Arc<Mutex<VecDeque<PendingUpdate>>>,
        graph_manager: &Arc<dyn GraphManagerTrait>,
        config: &UpdateQueueConfig,
    ) {
        let mut queue_lock = queue.lock().await;
        
        // Determine batch size
        let batch_size = std::cmp::min(queue_lock.len(), config.max_batch_size);
        if batch_size == 0 {
            return;
        }
        
        // Extract batch
        let mut batch = Vec::with_capacity(batch_size);
        for _ in 0..batch_size {
            if let Some(update) = queue_lock.pop_front() {
                batch.push(update);
            }
        }
        drop(queue_lock);
        
        let batch_count = batch.len();
        let start_time = Instant::now();
        
        // Process each update in the batch
        let mut success_count = 0;
        let mut error_count = 0;
        
        // Create performance monitor
        let monitor = QueuePerformanceMonitor::new(Arc::new(MetricsTracker::new()));
        
        for update in batch {
            // Record queue wait time
            monitor.monitor_queue_wait(update.timestamp).await;
            
            // Monitor sync operation
            match monitor.monitor_sync(
                sync_single_file(&update.file_path, &update.vault_path, graph_manager)
            ).await {
                Ok(_) => success_count += 1,
                Err(e) => {
                    error_count += 1;
                    // Only log error details, not individual file paths
                }
            }
        }
        
        let elapsed = start_time.elapsed();
        println!(
            "📊 Neo4j sync: {} files (✅ {}, ❌ {}) in {:.2}s", 
            batch_count, success_count, error_count, elapsed.as_secs_f64()
        );
    }
    
    /// Calculates a hash of the content for change detection
    fn calculate_content_hash(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    /// Gets the current queue size
    pub async fn queue_size(&self) -> usize {
        self.queue.lock().await.len()
    }
    
    /// Clears the queue
    pub async fn clear(&self) {
        self.queue.lock().await.clear();
        self.last_update_times.lock().await.clear();
        self.metrics.reset().await;
    }
    
    /// Gets current performance metrics
    pub async fn get_metrics(&self) -> super::metrics::SyncMetrics {
        self.metrics.get_metrics().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_debounce_calculator() {
        // Small file
        assert_eq!(calculate_debounce_delay(5_000), Duration::from_secs(2));
        
        // Medium file
        assert_eq!(calculate_debounce_delay(50_000), Duration::from_secs(5));
        
        // Large file
        assert_eq!(calculate_debounce_delay(500_000), Duration::from_secs(10));
    }
}