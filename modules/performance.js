/**
 * Performance Monitoring Module
 * Consolidated performance tracking, Web Vitals, and optimization
 */

import { debug } from './debug.js';

// Performance thresholds based on Core Web Vitals
const THRESHOLDS = {
    lcp: { good: 2500, needsImprovement: 4000 },
    fid: { good: 100, needsImprovement: 300 },
    cls: { good: 0.1, needsImprovement: 0.25 },
    ttfb: { good: 800, needsImprovement: 1800 },
    fcp: { good: 1800, needsImprovement: 3000 }
};

// Performance budgets
const BUDGETS = {
    loadTime: 3000,
    firstContentfulPaint: 1800,
    largestContentfulPaint: 2500,
    cumulativeLayoutShift: 0.1,
    totalBlockingTime: 300,
    firstInputDelay: 100
};

export class PerformanceManager {
    constructor() {
        this.metrics = {
            webVitals: {},
            navigation: {},
            resources: [],
            longTasks: [],
            memoryUsage: []
        };
        this.violations = [];
        this.observers = new Map();
        this.isInitialized = false;
        this.isMobile = this.detectMobile();
        this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    init() {
        if (this.isInitialized) return;
        
        debug.log('[Performance] Initializing performance manager...');
        
        this.trackWebVitals();
        this.trackNavigationTiming();
        this.trackResourceTiming();
        this.trackLongTasks();
        this.trackMemoryUsage();
        this.setupLazyLoading();
        this.optimizeAnimations();
        this.optimizeImages();
        
        this.isInitialized = true;
        debug.log('[Performance] Performance manager initialized');
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               window.innerWidth <= 768;
    }

    // ========================================
    // Web Vitals Tracking
    // ========================================

    trackWebVitals() {
        this.observeLCP();
        this.observeFID();
        this.observeCLS();
        this.observeFCP();
        this.observeTTFB();
    }

    observeLCP() {
        try {
            const observer = new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                const lastEntry = entries[entries.length - 1];
                
                const lcp = lastEntry.renderTime || lastEntry.loadTime;
                this.metrics.webVitals.lcp = lcp;
                
                const rating = this.getRating('lcp', lcp);
                this.metrics.webVitals.lcp_rating = rating;
                debug.log(`[Performance] LCP: ${lcp.toFixed(0)}ms (${rating})`);
                
                this.checkBudget('largestContentfulPaint', lcp);
            });
            
            observer.observe({ type: 'largest-contentful-paint', buffered: true });
            this.observers.set('lcp', observer);
        } catch (error) {
            debug.warn('[Performance] LCP not supported');
        }
    }

    observeFID() {
        try {
            const observer = new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                entries.forEach(entry => {
                    const fid = entry.processingStart - entry.startTime;
                    this.metrics.webVitals.fid = fid;
                    
                    const rating = this.getRating('fid', fid);
                    this.metrics.webVitals.fid_rating = rating;
                    debug.log(`[Performance] FID: ${fid.toFixed(0)}ms (${rating})`);
                    
                    this.checkBudget('firstInputDelay', fid);
                });
            });
            
            observer.observe({ type: 'first-input', buffered: true });
            this.observers.set('fid', observer);
        } catch (error) {
            debug.warn('[Performance] FID not supported');
        }
    }

    observeCLS() {
        try {
            let clsValue = 0;
            
            const observer = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                    }
                }
                
                this.metrics.webVitals.cls = clsValue;
                
                const rating = this.getRating('cls', clsValue);
                this.metrics.webVitals.cls_rating = rating;
                debug.log(`[Performance] CLS: ${clsValue.toFixed(3)} (${rating})`);
                
                this.checkBudget('cumulativeLayoutShift', clsValue);
            });
            
            observer.observe({ type: 'layout-shift', buffered: true });
            this.observers.set('cls', observer);
        } catch (error) {
            debug.warn('[Performance] CLS not supported');
        }
    }

    observeFCP() {
        try {
            const observer = new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                entries.forEach(entry => {
                    if (entry.name === 'first-contentful-paint') {
                        const fcp = entry.startTime;
                        this.metrics.webVitals.fcp = fcp;
                        
                        const rating = this.getRating('fcp', fcp);
                        this.metrics.webVitals.fcp_rating = rating;
                        debug.log(`[Performance] FCP: ${fcp.toFixed(0)}ms (${rating})`);
                        
                        this.checkBudget('firstContentfulPaint', fcp);
                    }
                });
            });
            
            observer.observe({ type: 'paint', buffered: true });
            this.observers.set('fcp', observer);
        } catch (error) {
            debug.warn('[Performance] FCP not supported');
        }
    }

    observeTTFB() {
        window.addEventListener('load', () => {
            const navTiming = performance.getEntriesByType('navigation')[0];
            if (navTiming) {
                const ttfb = navTiming.responseStart - navTiming.requestStart;
                this.metrics.webVitals.ttfb = ttfb;
                
                const rating = this.getRating('ttfb', ttfb);
                this.metrics.webVitals.ttfb_rating = rating;
                debug.log(`[Performance] TTFB: ${ttfb.toFixed(0)}ms (${rating})`);
            }
        });
    }

    // ========================================
    // Navigation & Resource Timing
    // ========================================

    trackNavigationTiming() {
        window.addEventListener('load', () => {
            const navTiming = performance.getEntriesByType('navigation')[0];
            if (!navTiming) return;
            
            this.metrics.navigation = {
                dnsLookup: navTiming.domainLookupEnd - navTiming.domainLookupStart,
                tcpConnection: navTiming.connectEnd - navTiming.connectStart,
                tlsNegotiation: navTiming.secureConnectionStart > 0 
                    ? navTiming.connectEnd - navTiming.secureConnectionStart 
                    : 0,
                timeToFirstByte: navTiming.responseStart - navTiming.requestStart,
                downloadTime: navTiming.responseEnd - navTiming.responseStart,
                domInteractive: navTiming.domInteractive,
                domComplete: navTiming.domComplete,
                loadComplete: navTiming.loadEventEnd,
                totalLoadTime: navTiming.loadEventEnd - navTiming.fetchStart
            };
            
            debug.log('[Performance] Navigation Timing:', {
                DNS: `${this.metrics.navigation.dnsLookup.toFixed(0)}ms`,
                TCP: `${this.metrics.navigation.tcpConnection.toFixed(0)}ms`,
                TTFB: `${this.metrics.navigation.timeToFirstByte.toFixed(0)}ms`,
                Total: `${this.metrics.navigation.totalLoadTime.toFixed(0)}ms`
            });
            
            this.checkBudget('loadTime', this.metrics.navigation.totalLoadTime);
        });
    }

    trackResourceTiming() {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const resources = performance.getEntriesByType('resource');
                
                this.metrics.resources = resources.map(resource => ({
                    name: resource.name,
                    type: this.getResourceType(resource),
                    duration: resource.duration,
                    size: resource.transferSize || 0,
                    cached: resource.transferSize === 0 && resource.decodedBodySize > 0
                }));
                
                const analysis = this.analyzeResources();
                debug.log('[Performance] Resource Analysis:', analysis);
            }, 1000);
        });
    }

    getResourceType(resource) {
        const name = resource.name.toLowerCase();
        if (name.includes('.css')) return 'css';
        if (name.includes('.js')) return 'js';
        if (name.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)/)) return 'image';
        if (name.match(/\.(woff|woff2|ttf|otf)/)) return 'font';
        return 'other';
    }

    analyzeResources() {
        const byType = {};
        let totalSize = 0;
        let cachedSize = 0;
        
        this.metrics.resources.forEach(resource => {
            if (!byType[resource.type]) {
                byType[resource.type] = { count: 0, size: 0, duration: 0 };
            }
            
            byType[resource.type].count++;
            byType[resource.type].size += resource.size;
            byType[resource.type].duration += resource.duration;
            
            totalSize += resource.size;
            if (resource.cached) {
                cachedSize += resource.size;
            }
        });
        
        return {
            totalResources: this.metrics.resources.length,
            totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
            cachedSize: `${(cachedSize / 1024).toFixed(2)} KB`,
            cacheHitRate: totalSize > 0 ? `${((cachedSize / totalSize) * 100).toFixed(1)}%` : '0%',
            byType
        };
    }

    // ========================================
    // Long Tasks & Memory
    // ========================================

    trackLongTasks() {
        try {
            const observer = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    this.metrics.longTasks.push({
                        duration: entry.duration,
                        startTime: entry.startTime,
                        timestamp: Date.now()
                    });
                    
                    debug.warn(`[Performance] Long task detected: ${entry.duration.toFixed(0)}ms`);
                }
            });
            
            observer.observe({ type: 'longtask', buffered: true });
            this.observers.set('longtask', observer);
        } catch (error) {
            debug.warn('[Performance] Long task observer not supported');
        }
    }

    trackMemoryUsage() {
        if (!performance.memory) return;
        
        const sampleMemory = () => {
            const memory = {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit,
                timestamp: Date.now()
            };
            
            this.metrics.memoryUsage.push(memory);
            
            // Keep only last 100 samples
            if (this.metrics.memoryUsage.length > 100) {
                this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-100);
            }
            
            // Warn if memory usage is high
            const usagePercent = (memory.used / memory.limit) * 100;
            if (usagePercent > 90) {
                debug.warn(`[Performance] High memory usage: ${usagePercent.toFixed(1)}%`);
            }
        };
        
        // Sample every 10 seconds
        setInterval(sampleMemory, 10000);
        sampleMemory();
    }

    // ========================================
    // Optimizations
    // ========================================

    setupLazyLoading() {
        const observerOptions = {
            root: null,
            rootMargin: '50px',
            threshold: 0.01
        };
        
        const lazyLoadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    
                    // Lazy load images
                    if (element.tagName === 'IMG') {
                        if (element.dataset.src) {
                            element.src = element.dataset.src;
                            element.removeAttribute('data-src');
                        }
                        if (element.dataset.srcset) {
                            element.srcset = element.dataset.srcset;
                            element.removeAttribute('data-srcset');
                        }
                    }
                    
                    // Lazy load background images
                    if (element.dataset.bgImage) {
                        element.style.backgroundImage = `url(${element.dataset.bgImage})`;
                        element.removeAttribute('data-bg-image');
                    }
                    
                    element.classList.add('loaded');
                    lazyLoadObserver.unobserve(element);
                }
            });
        }, observerOptions);
        
        // Observe all lazy-loadable elements
        document.querySelectorAll('img[data-src], [data-bg-image]').forEach(el => {
            lazyLoadObserver.observe(el);
        });
        
        this.observers.set('lazyload', lazyLoadObserver);
    }

    optimizeAnimations() {
        if (this.isReducedMotion) {
            document.documentElement.style.setProperty('--animation-duration', '0.01ms');
            document.documentElement.style.setProperty('--transition-duration', '0.01ms');
            debug.log('[Performance] Reduced motion preferences detected, animations minimized');
            return;
        }
        
        if (this.isMobile) {
            document.documentElement.style.setProperty('--animation-duration', '200ms');
            document.documentElement.style.setProperty('--transition-duration', '200ms');
        }
    }

    optimizeImages() {
        document.querySelectorAll('img:not([loading])').forEach(img => {
            const rect = img.getBoundingClientRect();
            const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
            
            if (!isInViewport && !img.complete) {
                img.loading = 'lazy';
            }
        });
        
        debug.log('[Performance] Image optimization applied');
    }

    // ========================================
    // Budget Checking & Ratings
    // ========================================

    getRating(metric, value) {
        const threshold = THRESHOLDS[metric];
        if (!threshold) return 'unknown';
        
        if (value <= threshold.good) return 'good';
        if (value <= threshold.needsImprovement) return 'needs-improvement';
        return 'poor';
    }

    checkBudget(metric, value) {
        const budget = BUDGETS[metric];
        if (!budget) return true;

        const isWithinBudget = value <= budget;
        if (!isWithinBudget) {
            this.violations.push({
                metric,
                value,
                budget,
                overage: value - budget,
                timestamp: Date.now()
            });
            debug.warn('[Performance] Budget exceeded:', {
                metric,
                actual: value,
                budget: budget,
                overage: `+${(value - budget).toFixed(2)}`
            });
        }
        return isWithinBudget;
    }

    // ========================================
    // Reporting
    // ========================================

    calculatePerformanceScore() {
        const vitals = this.metrics.webVitals;
        let score = 100;
        
        if (vitals.lcp_rating === 'needs-improvement') score -= 10;
        if (vitals.lcp_rating === 'poor') score -= 20;
        
        if (vitals.fid_rating === 'needs-improvement') score -= 10;
        if (vitals.fid_rating === 'poor') score -= 20;
        
        if (vitals.cls_rating === 'needs-improvement') score -= 10;
        if (vitals.cls_rating === 'poor') score -= 20;
        
        score -= Math.min(this.metrics.longTasks.length * 2, 20);
        
        return Math.max(0, score);
    }

    getPerformanceGrade(score) {
        if (score >= 90) return 'A+ (Excellent)';
        if (score >= 75) return 'A (Good)';
        if (score >= 50) return 'B (Fair)';
        if (score >= 25) return 'C (Needs Improvement)';
        return 'D (Poor)';
    }

    generateReport() {
        const score = this.calculatePerformanceScore();
        const report = {
            timestamp: Date.now(),
            score,
            grade: this.getPerformanceGrade(score),
            webVitals: this.metrics.webVitals,
            navigation: this.metrics.navigation,
            resources: this.analyzeResources(),
            longTasks: {
                count: this.metrics.longTasks.length,
                averageDuration: this.metrics.longTasks.length > 0 
                    ? this.metrics.longTasks.reduce((sum, t) => sum + t.duration, 0) / this.metrics.longTasks.length 
                    : 0
            },
            violations: this.violations
        };
        
        debug.log('[Performance] Report generated:', report);
        return report;
    }

    getMetrics() {
        return {
            webVitals: this.metrics.webVitals,
            navigation: this.metrics.navigation,
            resourceCount: this.metrics.resources.length,
            longTaskCount: this.metrics.longTasks.length,
            score: this.calculatePerformanceScore()
        };
    }

    // Cleanup
    destroy() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();
        this.isInitialized = false;
    }
}

// Create singleton instance
export const performanceManager = new PerformanceManager();

export default performanceManager;
