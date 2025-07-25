/**
 * Performance Test Suite - Automated performance testing scenarios
 * 
 * This module provides comprehensive testing for:
 * - Large file handling
 * - Memory stress testing
 * - CodeMirror editor performance
 * - AI Chat responsiveness
 * - File tree operations
 */

import { perfMonitor } from './PerformanceMonitor.js';

export class PerformanceTestSuite {
    constructor() {
        this.testResults = [];
        this.isRunning = false;
        this.currentTest = null;
        
        console.log('🧪 Performance Test Suite initialized');
        
        // Add to global window for debugging
        window.perfTestSuite = this;
    }
    
    /**
     * Run all performance tests
     */
    async runAllTests() {
        if (this.isRunning) {
            console.warn('⚠️ Tests already running');
            return;
        }
        
        this.isRunning = true;
        this.testResults = [];
        
        console.log('🧪 Starting comprehensive performance tests...');
        
        try {
            // Editor performance tests
            await this.testEditorPerformance();
            
            // Memory usage tests
            await this.testMemoryUsage();
            
            // File operations tests
            await this.testFileOperations();
            
            // AI Chat tests
            await this.testChatPerformance();
            
            // Bundle size analysis
            await this.testBundleSize();
            
            console.log('✅ All performance tests completed');
            this.generateTestReport();
            
        } catch (error) {
            console.error('❌ Performance tests failed:', error);
        } finally {
            this.isRunning = false;
            this.currentTest = null;
        }
    }
    
    /**
     * Test CodeMirror editor performance
     */
    async testEditorPerformance() {
        this.currentTest = 'Editor Performance';
        console.log('🧪 Testing CodeMirror editor performance...');
        
        const testResult = {
            testName: 'Editor Performance',
            startTime: Date.now(),
            results: {}
        };
        
        try {
            // Test large text insertion
            await this.testLargeTextInsertion();
            
            // Test rapid typing simulation
            await this.testRapidTyping();
            
            // Test file switching
            await this.testFileSwitching();
            
            // Test split view performance
            await this.testSplitView();
            
            testResult.results.success = true;
            testResult.duration = Date.now() - testResult.startTime;
            
        } catch (error) {
            testResult.results.success = false;
            testResult.results.error = error.message;
            testResult.duration = Date.now() - testResult.startTime;
            
            console.error('❌ Editor performance test failed:', error);
        }
        
        this.testResults.push(testResult);
    }
    
    /**
     * Test large text insertion performance
     */
    async testLargeTextInsertion() {
        console.log('🧪 Testing large text insertion...');
        
        const largeText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(1000);
        
        // Get active editor
        const activeEditor = window.paneManager?.getActiveEditor();
        if (!activeEditor) {
            console.warn('⚠️ No active editor found for large text test');
            return;
        }
        
        perfMonitor.startMeasure('large_text_insertion');
        
        // Insert large text
        const startTime = Date.now();
        activeEditor.dispatch({
            changes: {
                from: 0,
                to: activeEditor.state.doc.length,
                insert: largeText
            }
        });
        
        const duration = Date.now() - startTime;
        perfMonitor.endMeasure('large_text_insertion');
        
        console.log(`📊 Large text insertion: ${duration}ms`);
        
        // Clear the text
        activeEditor.dispatch({
            changes: {
                from: 0,
                to: activeEditor.state.doc.length,
                insert: ''
            }
        });
    }
    
    /**
     * Test rapid typing simulation
     */
    async testRapidTyping() {
        console.log('🧪 Testing rapid typing simulation...');
        
        const activeEditor = window.paneManager?.getActiveEditor();
        if (!activeEditor) {
            console.warn('⚠️ No active editor found for rapid typing test');
            return;
        }
        
        perfMonitor.startMeasure('rapid_typing');
        
        const startTime = Date.now();
        let position = 0;
        
        // Simulate rapid typing
        for (let i = 0; i < 100; i++) {
            const char = String.fromCharCode(65 + (i % 26)); // A-Z
            activeEditor.dispatch({
                changes: { from: position, insert: char }
            });
            position++;
            
            // Small delay to simulate typing
            await new Promise(resolve => setTimeout(resolve, 1));
        }
        
        const duration = Date.now() - startTime;
        perfMonitor.endMeasure('rapid_typing');
        
        console.log(`📊 Rapid typing simulation: ${duration}ms`);
        
        // Clear the text
        activeEditor.dispatch({
            changes: {
                from: 0,
                to: activeEditor.state.doc.length,
                insert: ''
            }
        });
    }
    
    /**
     * Test file switching performance
     */
    async testFileSwitching() {
        console.log('🧪 Testing file switching performance...');
        
        const paneManager = window.paneManager;
        if (!paneManager) {
            console.warn('⚠️ No pane manager found for file switching test');
            return;
        }
        
        perfMonitor.startMeasure('file_switching');
        
        const startTime = Date.now();
        
        // Create test files
        const testFiles = [
            { name: 'test1.md', content: '# Test 1\n\nThis is test file 1.' },
            { name: 'test2.md', content: '# Test 2\n\nThis is test file 2.' },
            { name: 'test3.md', content: '# Test 3\n\nThis is test file 3.' }
        ];
        
        // Switch between files rapidly
        for (const file of testFiles) {
            const activePane = paneManager.getActivePane();
            if (activePane && activePane.tabManager) {
                const tabId = activePane.tabManager.createTab(file.name, file.content);
                activePane.tabManager.setActiveTab(tabId);
                
                // Small delay
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        const duration = Date.now() - startTime;
        perfMonitor.endMeasure('file_switching');
        
        console.log(`📊 File switching: ${duration}ms`);
    }
    
    /**
     * Test split view performance
     */
    async testSplitView() {
        console.log('🧪 Testing split view performance...');
        
        const paneManager = window.paneManager;
        if (!paneManager) {
            console.warn('⚠️ No pane manager found for split view test');
            return;
        }
        
        perfMonitor.startMeasure('split_view');
        
        const startTime = Date.now();
        
        // Toggle split view
        paneManager.toggleSplitView();
        
        // Wait for split view to be created
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Toggle back
        paneManager.toggleSplitView();
        
        const duration = Date.now() - startTime;
        perfMonitor.endMeasure('split_view');
        
        console.log(`📊 Split view toggle: ${duration}ms`);
    }
    
    /**
     * Test memory usage patterns
     */
    async testMemoryUsage() {
        this.currentTest = 'Memory Usage';
        console.log('🧪 Testing memory usage patterns...');
        
        const testResult = {
            testName: 'Memory Usage',
            startTime: Date.now(),
            results: {}
        };
        
        try {
            const initialMemory = perfMonitor.getCurrentMetrics().currentMemory;
            
            // Create memory stress
            await this.createMemoryStress();
            
            // Wait for garbage collection
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const finalMemory = perfMonitor.getCurrentMetrics().currentMemory;
            const memoryIncrease = finalMemory - initialMemory;
            
            testResult.results = {
                success: true,
                initialMemory,
                finalMemory,
                memoryIncrease,
                memoryLeakDetected: memoryIncrease > 10 // More than 10MB increase
            };
            
            if (memoryIncrease > 10) {
                console.warn(`⚠️ Potential memory leak detected: ${memoryIncrease}MB increase`);
            }
            
        } catch (error) {
            testResult.results = {
                success: false,
                error: error.message
            };
        }
        
        testResult.duration = Date.now() - testResult.startTime;
        this.testResults.push(testResult);
    }
    
    /**
     * Create memory stress for testing
     */
    async createMemoryStress() {
        console.log('🧪 Creating memory stress...');
        
        // Create large arrays
        const largeArrays = [];
        for (let i = 0; i < 10; i++) {
            largeArrays.push(new Array(100000).fill('test data'));
        }
        
        // Create DOM elements
        const container = document.createElement('div');
        for (let i = 0; i < 1000; i++) {
            const element = document.createElement('div');
            element.textContent = `Test element ${i}`;
            container.appendChild(element);
        }
        
        // Add to DOM temporarily
        document.body.appendChild(container);
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Clean up
        document.body.removeChild(container);
        
        // Clear references
        largeArrays.length = 0;
    }
    
    /**
     * Test file operations performance
     */
    async testFileOperations() {
        this.currentTest = 'File Operations';
        console.log('🧪 Testing file operations...');
        
        const testResult = {
            testName: 'File Operations',
            startTime: Date.now(),
            results: {}
        };
        
        try {
            // Test file tree refresh
            await this.testFileTreeRefresh();
            
            // Test file search
            await this.testFileSearch();
            
            testResult.results.success = true;
            
        } catch (error) {
            testResult.results.success = false;
            testResult.results.error = error.message;
        }
        
        testResult.duration = Date.now() - testResult.startTime;
        this.testResults.push(testResult);
    }
    
    /**
     * Test file tree refresh performance
     */
    async testFileTreeRefresh() {
        console.log('🧪 Testing file tree refresh...');
        
        perfMonitor.startMeasure('file_tree_refresh');
        
        const startTime = Date.now();
        
        // Simulate file tree refresh
        const refreshButton = document.querySelector('.refresh-button');
        if (refreshButton) {
            refreshButton.click();
            
            // Wait for refresh to complete
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const duration = Date.now() - startTime;
        perfMonitor.endMeasure('file_tree_refresh');
        
        console.log(`📊 File tree refresh: ${duration}ms`);
    }
    
    /**
     * Test file search performance
     */
    async testFileSearch() {
        console.log('🧪 Testing file search...');
        
        perfMonitor.startMeasure('file_search');
        
        const startTime = Date.now();
        
        // Simulate file search (if search functionality exists)
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.value = 'test';
            searchInput.dispatchEvent(new Event('input'));
            
            // Wait for search results
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        const duration = Date.now() - startTime;
        perfMonitor.endMeasure('file_search');
        
        console.log(`📊 File search: ${duration}ms`);
    }
    
    /**
     * Test AI Chat performance
     */
    async testChatPerformance() {
        this.currentTest = 'AI Chat Performance';
        console.log('🧪 Testing AI Chat performance...');
        
        const testResult = {
            testName: 'AI Chat Performance',
            startTime: Date.now(),
            results: {}
        };
        
        try {
            // Test chat panel toggle
            await this.testChatPanelToggle();
            
            // Test chat input responsiveness
            await this.testChatInputResponsiveness();
            
            testResult.results.success = true;
            
        } catch (error) {
            testResult.results.success = false;
            testResult.results.error = error.message;
        }
        
        testResult.duration = Date.now() - testResult.startTime;
        this.testResults.push(testResult);
    }
    
    /**
     * Test chat panel toggle performance
     */
    async testChatPanelToggle() {
        console.log('🧪 Testing chat panel toggle...');
        
        const chatPanel = window.chatPanel;
        if (!chatPanel) {
            console.warn('⚠️ No chat panel found for toggle test');
            return;
        }
        
        perfMonitor.startMeasure('chat_panel_toggle');
        
        const startTime = Date.now();
        
        // Toggle chat panel
        chatPanel.toggleVisibility();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        chatPanel.toggleVisibility();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const duration = Date.now() - startTime;
        perfMonitor.endMeasure('chat_panel_toggle');
        
        console.log(`📊 Chat panel toggle: ${duration}ms`);
    }
    
    /**
     * Test chat input responsiveness
     */
    async testChatInputResponsiveness() {
        console.log('🧪 Testing chat input responsiveness...');
        
        const chatInput = document.querySelector('.chat-input');
        if (!chatInput) {
            console.warn('⚠️ No chat input found for responsiveness test');
            return;
        }
        
        perfMonitor.startMeasure('chat_input_responsiveness');
        
        const startTime = Date.now();
        
        // Simulate rapid typing in chat input
        chatInput.focus();
        chatInput.value = 'Test message for performance testing';
        chatInput.dispatchEvent(new Event('input'));
        
        const duration = Date.now() - startTime;
        perfMonitor.endMeasure('chat_input_responsiveness');
        
        console.log(`📊 Chat input responsiveness: ${duration}ms`);
        
        // Clear input
        chatInput.value = '';
    }
    
    /**
     * Test bundle size analysis
     */
    async testBundleSize() {
        this.currentTest = 'Bundle Size Analysis';
        console.log('🧪 Analyzing bundle size...');
        
        const testResult = {
            testName: 'Bundle Size Analysis',
            startTime: Date.now(),
            results: {}
        };
        
        try {
            const bundleMetrics = perfMonitor.metrics.bundleSize;
            const totalSize = bundleMetrics.total || 0;
            
            testResult.results = {
                success: true,
                totalBundleSize: totalSize,
                bundleSizeOptimal: totalSize < 1000, // Less than 1MB
                individualBundles: bundleMetrics
            };
            
            if (totalSize > 1000) {
                console.warn(`⚠️ Large bundle size detected: ${totalSize}KB`);
            }
            
        } catch (error) {
            testResult.results = {
                success: false,
                error: error.message
            };
        }
        
        testResult.duration = Date.now() - testResult.startTime;
        this.testResults.push(testResult);
    }
    
    /**
     * Generate comprehensive test report
     */
    generateTestReport() {
        console.log('📊 Generating performance test report...');
        
        const report = {
            timestamp: new Date().toISOString(),
            testResults: this.testResults,
            summary: {
                totalTests: this.testResults.length,
                passedTests: this.testResults.filter(r => r.results.success).length,
                failedTests: this.testResults.filter(r => !r.results.success).length,
                totalDuration: this.testResults.reduce((sum, r) => sum + r.duration, 0)
            },
            performanceMetrics: perfMonitor.getCurrentMetrics()
        };
        
        console.log('📊 Performance Test Report:', report);
        
        // Save to localStorage for later analysis
        localStorage.setItem('gaimplan-performance-test-report', JSON.stringify(report));
        
        return report;
    }
    
    /**
     * Export test report
     */
    exportTestReport() {
        const report = this.generateTestReport();
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `gaimplan-performance-test-report-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('📊 Performance test report exported');
    }
    
    /**
     * Get test status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            currentTest: this.currentTest,
            completedTests: this.testResults.length
        };
    }
}

// Initialize global test suite
export const perfTestSuite = new PerformanceTestSuite();