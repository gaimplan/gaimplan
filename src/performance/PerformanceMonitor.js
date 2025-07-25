/**
 * Performance Monitor - Comprehensive performance tracking and analysis
 * 
 * This module provides baseline metrics and profiling capabilities for:
 * - Bundle size analysis
 * - Memory usage tracking
 * - Load time measurements
 * - CodeMirror editor performance
 * - AI Chat responsiveness
 */

export class PerformanceMonitor {
    constructor() {
        this.metrics = {
            bundleSize: {},
            memoryUsage: [],
            loadTimes: {},
            editorMetrics: {},
            chatMetrics: {},
            startTime: Date.now()
        };
        
        this.observers = {
            memory: null,
            performance: null
        };
        
        this.enabled = true;
        this.logLevel = 'info'; // 'debug', 'info', 'warn', 'error'
        
        console.log('📊 Performance Monitor initialized');
        this.initialize();
    }
    
    /**
     * Initialize performance monitoring
     */
    initialize() {
        // Set up memory monitoring
        this.setupMemoryMonitoring();
        
        // Set up performance observer
        this.setupPerformanceObserver();
        
        // Track bundle size
        this.trackBundleSize();
        
        // Start periodic monitoring
        this.startPeriodicMonitoring();
        
        // Add to global window for debugging
        window.perfMonitor = this;
    }
    
    /**
     * Set up memory usage monitoring
     */
    setupMemoryMonitoring() {
        if ('memory' in performance) {
            this.trackMemoryUsage();
            
            // Monitor every 30 seconds
            setInterval(() => {
                this.trackMemoryUsage();
            }, 30000);
        } else {
            console.warn('⚠️ Memory monitoring not supported in this browser');
        }
    }
    
    /**
     * Track current memory usage
     */
    trackMemoryUsage() {
        if (!('memory' in performance)) return;
        
        const memory = performance.memory;
        const timestamp = Date.now();
        
        const memoryData = {
            timestamp,
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            usedMB: Math.round(memory.usedJSHeapSize / 1024 / 1024 * 100) / 100,
            totalMB: Math.round(memory.totalJSHeapSize / 1024 / 1024 * 100) / 100
        };
        
        this.metrics.memoryUsage.push(memoryData);
        
        // Keep only last 100 entries
        if (this.metrics.memoryUsage.length > 100) {
            this.metrics.memoryUsage.shift();
        }
        
        // Log if memory usage is high
        if (memoryData.usedMB > 100) {
            console.warn(`⚠️ High memory usage: ${memoryData.usedMB}MB`);
        }
        
        if (this.logLevel === 'debug') {
            console.debug(`📊 Memory: ${memoryData.usedMB}MB used, ${memoryData.totalMB}MB total`);
        }
    }
    
    /**
     * Set up performance observer for load times
     */
    setupPerformanceObserver() {
        if ('PerformanceObserver' in window) {
            try {
                this.observers.performance = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach((entry) => {
                        this.handlePerformanceEntry(entry);
                    });
                });
                
                this.observers.performance.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
            } catch (error) {
                console.warn('⚠️ Performance Observer setup failed:', error);
            }
        }
    }
    
    /**
     * Handle performance observer entries
     */
    handlePerformanceEntry(entry) {
        const { name, entryType, duration, startTime } = entry;
        
        switch (entryType) {
            case 'measure':
                this.metrics.loadTimes[name] = duration;
                if (this.logLevel === 'debug') {
                    console.debug(`📊 Measure "${name}": ${duration.toFixed(2)}ms`);
                }
                break;
                
            case 'navigation':
                this.metrics.loadTimes.navigation = {
                    domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
                    loadComplete: entry.loadEventEnd - entry.loadEventStart,
                    domInteractive: entry.domInteractive - entry.navigationStart,
                    totalLoad: entry.loadEventEnd - entry.navigationStart
                };
                break;
                
            case 'resource':
                // Track large resource loads
                if (duration > 100) {
                    this.metrics.loadTimes[`resource_${name}`] = duration;
                }
                break;
        }
    }
    
    /**
     * Track bundle size and module analysis
     */
    trackBundleSize() {
        // Get all script tags
        const scripts = document.querySelectorAll('script[src]');
        let totalSize = 0;
        
        scripts.forEach(async (script) => {
            try {
                const response = await fetch(script.src);
                const size = response.headers.get('content-length');
                if (size) {
                    const sizeKB = Math.round(parseInt(size) / 1024 * 100) / 100;
                    this.metrics.bundleSize[script.src] = sizeKB;
                    totalSize += sizeKB;
                }
            } catch (error) {
                console.warn(`⚠️ Failed to get size for ${script.src}:`, error);
            }
        });
        
        this.metrics.bundleSize.total = totalSize;
        
        if (this.logLevel === 'info') {
            console.log(`📊 Total bundle size: ${totalSize}KB`);
        }
    }
    
    /**
     * Start periodic monitoring
     */
    startPeriodicMonitoring() {
        // Check for performance issues every 5 minutes
        setInterval(() => {
            this.checkPerformanceIssues();
        }, 300000);
    }
    
    /**
     * Check for performance issues and log warnings
     */
    checkPerformanceIssues() {
        const current = this.getCurrentMetrics();
        
        // Check memory leaks
        if (current.memoryTrend > 0.5) {
            console.warn('⚠️ Potential memory leak detected - memory usage increasing');
        }
        
        // Check for long load times
        Object.entries(this.metrics.loadTimes).forEach(([name, time]) => {
            if (time > 1000) {
                console.warn(`⚠️ Slow operation detected: ${name} took ${time.toFixed(2)}ms`);
            }
        });
    }
    
    /**
     * Track CodeMirror editor performance
     */
    trackEditorMetrics(editorId, action, startTime) {
        const duration = Date.now() - startTime;
        
        if (!this.metrics.editorMetrics[editorId]) {
            this.metrics.editorMetrics[editorId] = {};
        }
        
        if (!this.metrics.editorMetrics[editorId][action]) {
            this.metrics.editorMetrics[editorId][action] = [];
        }
        
        this.metrics.editorMetrics[editorId][action].push({
            timestamp: Date.now(),
            duration
        });
        
        // Keep only last 20 entries per action
        if (this.metrics.editorMetrics[editorId][action].length > 20) {
            this.metrics.editorMetrics[editorId][action].shift();
        }
        
        if (duration > 200) {
            console.warn(`⚠️ Slow editor operation: ${action} in ${editorId} took ${duration}ms`);
        }
        
        if (this.logLevel === 'debug') {
            console.debug(`📊 Editor ${editorId} ${action}: ${duration}ms`);
        }
    }
    
    /**
     * Track AI Chat performance
     */
    trackChatMetrics(action, data) {
        const timestamp = Date.now();
        
        if (!this.metrics.chatMetrics[action]) {
            this.metrics.chatMetrics[action] = [];
        }
        
        this.metrics.chatMetrics[action].push({
            timestamp,
            ...data
        });
        
        // Keep only last 50 entries per action
        if (this.metrics.chatMetrics[action].length > 50) {
            this.metrics.chatMetrics[action].shift();
        }
        
        if (this.logLevel === 'debug') {
            console.debug(`📊 Chat ${action}:`, data);
        }
    }
    
    /**
     * Create performance measure
     */
    startMeasure(name) {
        if (!this.enabled) return;
        
        performance.mark(`${name}_start`);
    }
    
    /**
     * End performance measure
     */
    endMeasure(name) {
        if (!this.enabled) return;
        
        try {
            performance.mark(`${name}_end`);
            performance.measure(name, `${name}_start`, `${name}_end`);
        } catch (error) {
            console.warn(`⚠️ Failed to measure ${name}:`, error);
        }
    }
    
    /**
     * Get current performance metrics
     */
    getCurrentMetrics() {
        const latestMemory = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
        const firstMemory = this.metrics.memoryUsage[0];
        
        return {
            uptime: Date.now() - this.metrics.startTime,
            currentMemory: latestMemory?.usedMB || 0,
            memoryTrend: latestMemory && firstMemory ? 
                (latestMemory.usedMB - firstMemory.usedMB) / firstMemory.usedMB : 0,
            bundleSize: this.metrics.bundleSize.total || 0,
            editorCount: Object.keys(this.metrics.editorMetrics).length,
            chatMessages: this.metrics.chatMetrics.message_sent?.length || 0
        };
    }
    
    /**
     * Generate performance report
     */
    generateReport() {
        const current = this.getCurrentMetrics();
        const report = {
            summary: current,
            memoryUsage: this.metrics.memoryUsage.slice(-10), // Last 10 entries
            loadTimes: this.metrics.loadTimes,
            bundleSize: this.metrics.bundleSize,
            editorMetrics: this.getEditorSummary(),
            chatMetrics: this.getChatSummary()
        };
        
        console.log('📊 Performance Report:', report);
        return report;
    }
    
    /**
     * Get editor performance summary
     */
    getEditorSummary() {
        const summary = {};
        
        Object.entries(this.metrics.editorMetrics).forEach(([editorId, actions]) => {
            summary[editorId] = {};
            
            Object.entries(actions).forEach(([action, measurements]) => {
                const durations = measurements.map(m => m.duration);
                summary[editorId][action] = {
                    count: durations.length,
                    average: durations.reduce((a, b) => a + b, 0) / durations.length,
                    max: Math.max(...durations),
                    min: Math.min(...durations)
                };
            });
        });
        
        return summary;
    }
    
    /**
     * Get chat performance summary
     */
    getChatSummary() {
        const summary = {};
        
        Object.entries(this.metrics.chatMetrics).forEach(([action, measurements]) => {
            summary[action] = {
                count: measurements.length,
                recent: measurements.slice(-5) // Last 5 entries
            };
        });
        
        return summary;
    }
    
    /**
     * Export metrics to file
     */
    exportMetrics() {
        const report = this.generateReport();
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `gaimplan-performance-report-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('📊 Performance report exported');
    }
    
    /**
     * Enable/disable performance monitoring
     */
    toggle(enabled) {
        this.enabled = enabled;
        console.log(`📊 Performance monitoring ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Set log level
     */
    setLogLevel(level) {
        this.logLevel = level;
        console.log(`📊 Log level set to: ${level}`);
    }
}

// Initialize global performance monitor
export const perfMonitor = new PerformanceMonitor();