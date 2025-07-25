use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use serde::{Serialize, Deserialize};

/// Metrics for graph sync operations (serializable)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncMetrics {
    /// Average time to sync a single note (in milliseconds)
    pub avg_sync_time_ms: u64,
    /// Total number of successful syncs
    pub sync_count: u64,
    /// Total number of sync errors
    pub error_count: u64,
    /// Time of last successful sync (Unix timestamp)
    pub last_sync_timestamp: Option<i64>,
    /// Average queue wait time (in milliseconds)
    pub avg_queue_wait_ms: u64,
    /// Maximum queue size reached
    pub max_queue_size: usize,
    /// Current queue size
    pub current_queue_size: usize,
}

impl Default for SyncMetrics {
    fn default() -> Self {
        Self {
            avg_sync_time_ms: 0,
            sync_count: 0,
            error_count: 0,
            last_sync_timestamp: None,
            avg_queue_wait_ms: 0,
            max_queue_size: 0,
            current_queue_size: 0,
        }
    }
}

/// Internal metrics state (not serializable)
struct InternalMetrics {
    avg_sync_time: Duration,
    sync_count: u64,
    error_count: u64,
    last_sync: Option<Instant>,
    avg_queue_wait: Duration,
    max_queue_size: usize,
    current_queue_size: usize,
}

/// Tracks performance metrics for graph sync operations
pub struct MetricsTracker {
    metrics: Arc<Mutex<InternalMetrics>>,
    sync_times: Arc<Mutex<Vec<Duration>>>,
    queue_wait_times: Arc<Mutex<Vec<Duration>>>,
}

impl MetricsTracker {
    /// Creates a new metrics tracker
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(Mutex::new(InternalMetrics {
                avg_sync_time: Duration::ZERO,
                sync_count: 0,
                error_count: 0,
                last_sync: None,
                avg_queue_wait: Duration::ZERO,
                max_queue_size: 0,
                current_queue_size: 0,
            })),
            sync_times: Arc::new(Mutex::new(Vec::with_capacity(100))),
            queue_wait_times: Arc::new(Mutex::new(Vec::with_capacity(100))),
        }
    }
    
    /// Records a successful sync operation
    pub async fn record_sync(&self, duration: Duration) {
        let mut metrics = self.metrics.lock().await;
        let mut sync_times = self.sync_times.lock().await;
        
        // Update sync count and last sync time
        metrics.sync_count += 1;
        metrics.last_sync = Some(Instant::now());
        
        // Add to rolling window of sync times
        sync_times.push(duration);
        if sync_times.len() > 100 {
            sync_times.remove(0);
        }
        
        // Calculate new average
        if !sync_times.is_empty() {
            let total: Duration = sync_times.iter().sum();
            metrics.avg_sync_time = total / sync_times.len() as u32;
        }
    }
    
    /// Records a sync error
    pub async fn record_error(&self) {
        let mut metrics = self.metrics.lock().await;
        metrics.error_count += 1;
    }
    
    /// Records queue wait time
    pub async fn record_queue_wait(&self, duration: Duration) {
        let mut metrics = self.metrics.lock().await;
        let mut wait_times = self.queue_wait_times.lock().await;
        
        // Add to rolling window of wait times
        wait_times.push(duration);
        if wait_times.len() > 100 {
            wait_times.remove(0);
        }
        
        // Calculate new average
        if !wait_times.is_empty() {
            let total: Duration = wait_times.iter().sum();
            metrics.avg_queue_wait = total / wait_times.len() as u32;
        }
    }
    
    /// Updates the current queue size
    pub async fn update_queue_size(&self, size: usize) {
        let mut metrics = self.metrics.lock().await;
        metrics.current_queue_size = size;
        if size > metrics.max_queue_size {
            metrics.max_queue_size = size;
        }
    }
    
    /// Gets a snapshot of current metrics
    pub async fn get_metrics(&self) -> SyncMetrics {
        let internal = self.metrics.lock().await;
        SyncMetrics {
            avg_sync_time_ms: internal.avg_sync_time.as_millis() as u64,
            sync_count: internal.sync_count,
            error_count: internal.error_count,
            last_sync_timestamp: internal.last_sync.map(|instant| {
                let elapsed = instant.elapsed();
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                now - elapsed.as_secs() as i64
            }),
            avg_queue_wait_ms: internal.avg_queue_wait.as_millis() as u64,
            max_queue_size: internal.max_queue_size,
            current_queue_size: internal.current_queue_size,
        }
    }
    
    /// Resets all metrics
    pub async fn reset(&self) {
        let mut metrics = self.metrics.lock().await;
        *metrics = InternalMetrics {
            avg_sync_time: Duration::ZERO,
            sync_count: 0,
            error_count: 0,
            last_sync: None,
            avg_queue_wait: Duration::ZERO,
            max_queue_size: 0,
            current_queue_size: 0,
        };
        
        let mut sync_times = self.sync_times.lock().await;
        sync_times.clear();
        
        let mut wait_times = self.queue_wait_times.lock().await;
        wait_times.clear();
    }
}

/// Performance monitoring for the update queue
pub struct QueuePerformanceMonitor {
    tracker: Arc<MetricsTracker>,
}

impl QueuePerformanceMonitor {
    pub fn new(tracker: Arc<MetricsTracker>) -> Self {
        Self { tracker }
    }
    
    /// Monitors a sync operation
    pub async fn monitor_sync<F, T>(&self, operation: F) -> Result<T, String>
    where
        F: std::future::Future<Output = Result<T, String>>,
    {
        let start = Instant::now();
        
        match operation.await {
            Ok(result) => {
                self.tracker.record_sync(start.elapsed()).await;
                Ok(result)
            }
            Err(e) => {
                self.tracker.record_error().await;
                Err(e)
            }
        }
    }
    
    /// Monitors queue wait time
    pub async fn monitor_queue_wait(&self, wait_start: Instant) {
        self.tracker.record_queue_wait(wait_start.elapsed()).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_metrics_tracking() {
        let tracker = MetricsTracker::new();
        
        // Record some syncs
        tracker.record_sync(Duration::from_millis(100)).await;
        tracker.record_sync(Duration::from_millis(200)).await;
        tracker.record_sync(Duration::from_millis(150)).await;
        
        let metrics = tracker.get_metrics().await;
        assert_eq!(metrics.sync_count, 3);
        assert_eq!(metrics.avg_sync_time_ms, 150);
        
        // Record an error
        tracker.record_error().await;
        let metrics = tracker.get_metrics().await;
        assert_eq!(metrics.error_count, 1);
    }
}