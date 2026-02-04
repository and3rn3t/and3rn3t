// Debug mode flag - set to false for production
const DEBUG_MODE = false;

// Debug logging wrapper - only logs when DEBUG_MODE is true
const debug = {
    log: (...args) => DEBUG_MODE && console.log(...args),
    warn: (...args) => DEBUG_MODE && console.warn(...args),
    error: (...args) => console.error(...args) // Always show errors
};

// GitHub API Manager with caching and rate limiting
class GitHubAPIManager {
    baseUrl = 'https://api.github.com';
    username = 'and3rn3t';
    
    constructor() {
        this.cache = new Map();
        this.rateLimitInfo = {
            remaining: 60,
            reset: Date.now() + 3600000,
            limit: 60
        };
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.cachedData = null;
        this.maxRetries = 3;
        this.baseDelay = 1000; // 1 second base delay
    }

    // Enhanced retry logic with exponential backoff
    async executeWithRetry(operation, maxRetries = this.maxRetries) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                // Don't retry for certain error types
                if (error.message.includes('404') || error.message.includes('403')) {
                    throw error;
                }
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Exponential backoff with jitter
                const delay = this.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    // Load pre-fetched GitHub data from workflow
    async loadCachedGitHubData() {
        if (this.cachedData) return this.cachedData;
        
        try {
            const response = await fetch('github-data.json');
            if (response.ok) {
                this.cachedData = await response.json();
                return this.cachedData;
            }
        } catch (error) {
            // Pre-fetched data not available, using direct API
        }
        return null;
    }

    // Cache management with TTL (Time To Live)
    getCacheKey(endpoint, params = {}) {
        return `${endpoint}:${JSON.stringify(params)}`;
    }

    setCache(key, data, ttl = 300000) { // 5 minutes default TTL
        const expiry = Date.now() + ttl;
        this.cache.set(key, { data, expiry });
    }

    getCache(key) {
        const cached = this.cache.get(key);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }
        if (cached) {
            this.cache.delete(key); // Remove expired cache
        }
        return null;
    }

    // Rate limit handling
    updateRateLimit(headers) {
        this.rateLimitInfo.remaining = Number.parseInt(headers.get('X-RateLimit-Remaining') || '60', 10);
        this.rateLimitInfo.limit = Number.parseInt(headers.get('X-RateLimit-Limit') || '60', 10);
        this.rateLimitInfo.reset = Number.parseInt(headers.get('X-RateLimit-Reset') || '0', 10) * 1000;
    }

    async waitForRateLimit() {
        if (this.rateLimitInfo.remaining <= 1) {
            const waitTime = Math.max(0, this.rateLimitInfo.reset - Date.now());
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    // Enhanced fetch with retry logic and exponential backoff
    async fetchWithRetry(url, options = {}, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.waitForRateLimit();
                
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        ...options.headers
                    }
                });

                // Update rate limit info
                this.updateRateLimit(response.headers);

                if (response.ok) {
                    return response;
                }

                // Handle specific HTTP errors
                if (response.status === 403) {
                    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
                    if (rateLimitRemaining === '0') {
                        throw new Error('GitHub API rate limit exceeded');
                    }
                }

                if (response.status === 404) {
                    throw new Error('Resource not found');
                }

                throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }

                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, attempt - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Main API method with caching and enhanced retry
    async fetchGitHubData(endpoint, params = {}, ttl = 300000) {
        const cacheKey = this.getCacheKey(endpoint, params);
        
        // Check cache first
        const cachedData = this.getCache(cacheKey);
        if (cachedData) {
            return cachedData;
        }

        // Build URL with parameters
        const url = new URL(`${this.baseUrl}${endpoint}`);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }

        return await this.executeWithRetry(async () => {
            const response = await this.fetchWithRetry(url.toString());
            const data = await response.json();

            // Cache the result
            this.setCache(cacheKey, data, ttl);

            return data;
        });
    }

    // Convenience methods for common endpoints
    async getUserData() {
        // Try cached data first
        const cachedData = await this.loadCachedGitHubData();
        if (cachedData && cachedData.user) {
            return cachedData.user;
        }
        
        // Fall back to direct API
        return this.fetchGitHubData(`/users/${this.username}`, {}, 600000); // 10 min cache
    }

    async getRepositories(sort = 'stars', per_page = 100) {
        // Try cached data first
        const cachedData = await this.loadCachedGitHubData();
        if (cachedData && cachedData.repositories) {
            let repos = cachedData.repositories;
            
            // Apply client-side sorting if needed
            if (sort === 'stars') {
                repos = repos.sort((a, b) => b.stargazers_count - a.stargazers_count);
            } else if (sort === 'updated') {
                repos = repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            }
            
            // Apply limit
            return repos.slice(0, per_page);
        }
        
        // Fall back to direct API
        return this.fetchGitHubData(`/users/${this.username}/repos`, { sort, per_page });
    }

    async getRecentActivity(per_page = 30) {
        // Try cached data first
        const cachedData = await this.loadCachedGitHubData();
        if (cachedData && cachedData.events) {
            return cachedData.events.slice(0, per_page);
        }
        
        // Fall back to direct API (may be limited for public events)
        try {
            return await this.fetchGitHubData(`/users/${this.username}/events/public`, { per_page });
        } catch (error) {
            return [];
        }
    }

    async getUserEvents(per_page = 30) {
        return this.fetchGitHubData(`/users/${this.username}/events`, { per_page }, 180000); // 3 min cache
    }

    // Get rate limit status
    getRateLimitStatus() {
        return {
            ...this.rateLimitInfo,
            percentage: (this.rateLimitInfo.remaining / this.rateLimitInfo.limit) * 100
        };
    }
}

// Initialize GitHub API manager
const githubAPI = new GitHubAPIManager();

// API Status and debugging utilities
function displayAPIStatus() {
    const status = githubAPI.getRateLimitStatus();
    debug.log('[API] Rate limit status:', {
        remaining: status.remaining,
        limit: status.limit,
        resetTime: new Date(status.reset).toLocaleTimeString(),
        percentage: `${status.percentage.toFixed(1)}%`,
        cacheEntries: githubAPI.cache.size
    });
    
    // Add visual indicator if rate limit is low
    if (status.percentage < 20) {
        debug.warn('[API] GitHub API rate limit is low!');
    }
}

// Enhanced error handler for API failures with user feedback
function handleAPIError(error, context = 'API request') {
    
    const errorMessages = {
        'GitHub API rate limit exceeded': 'Rate limit reached. Data will refresh automatically when limit resets.',
        'Resource not found': 'Some data could not be found. This is normal for newer accounts.',
        'Failed to fetch': 'Network connection issue. Please check your internet connection.'
    };
    
    const userMessage = errorMessages[error.message] || 'Unable to load some GitHub data. Showing cached or fallback content.';
    
    // Show user-friendly error notification
    showErrorNotification(userMessage, context);
    
    return userMessage;
}

// Enhanced global loading progress indicator with task tracking
const loadingManager = {
    activeTasks: new Set(),
    progressBar: null,
    
    addTask(taskName) {
        this.activeTasks.add(taskName);
        this.showProgress();
    },
    
    removeTask(taskName) {
        this.activeTasks.delete(taskName);
        
        if (this.activeTasks.size === 0) {
            this.hideProgress();
        }
    },
    
    showProgress() {
        if (!this.progressBar) {
            this.progressBar = document.createElement('div');
            this.progressBar.id = 'global-loading-progress';
            this.progressBar.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 3px;
                background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899);
                background-size: 200% 100%;
                animation: loading-gradient 2s ease-in-out infinite;
                z-index: 9999;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;
            
            // Add the animation keyframes if not already present
            if (!document.querySelector('#loading-keyframes')) {
                const style = document.createElement('style');
                style.id = 'loading-keyframes';
                style.textContent = `
                    @keyframes loading-gradient {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            document.body.appendChild(this.progressBar);
        }
        
        // Show the progress bar
        setTimeout(() => {
            if (this.progressBar) {
                this.progressBar.style.opacity = '1';
            }
        }, 100);
    },
    
    hideProgress() {
        if (this.progressBar) {
            this.progressBar.style.opacity = '0';
            setTimeout(() => {
                if (this.progressBar && this.progressBar.parentNode) {
                    this.progressBar.parentNode.removeChild(this.progressBar);
                    this.progressBar = null;
                }
            }, 300);
        }
    }
};

// Legacy functions for backwards compatibility
function showGlobalLoadingProgress() {
    loadingManager.addTask('global');
}

function hideGlobalLoadingProgress() {
    loadingManager.removeTask('global');
}

// Show error notification to user
function showErrorNotification(message, context = '') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('api-error-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'api-error-notification';
        notification.className = 'error-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff6b6b;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            max-width: 350px;
            font-size: 14px;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;
        document.body.appendChild(notification);
    }
    
    // Update notification content
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Show notification
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Auto-hide after 8 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 8000);
}

// Enhanced cache management utilities
function clearExpiredCache() {
    const now = Date.now();
    let removedCount = 0;
    const cacheStats = {
        totalEntries: githubAPI.cache.size,
        expiredEntries: 0,
        totalSize: 0
    };
    
    for (const [key, value] of githubAPI.cache.entries()) {
        // Calculate approximate cache size
        cacheStats.totalSize += JSON.stringify(value.data).length;
        
        if (value.expiry < now) {
            githubAPI.cache.delete(key);
            removedCount++;
            cacheStats.expiredEntries++;
        }
    }
    
    // Clear oldest entries if cache gets too large (>5MB estimated)
    if (cacheStats.totalSize > 5000000 && githubAPI.cache.size > 10) {
        const sortedEntries = Array.from(githubAPI.cache.entries())
            .sort((a, b) => a[1].expiry - b[1].expiry);
        
        // Remove oldest 25% of entries
        const toRemove = Math.floor(sortedEntries.length * 0.25);
        for (let i = 0; i < toRemove; i++) {
            githubAPI.cache.delete(sortedEntries[i][0]);
            removedCount++;
        }
    }
    
    if (removedCount > 0) {
    }
    
    return { removedCount, ...cacheStats };
}

// Preload critical GitHub data
async function preloadCriticalData() {
    try {
        
        // Preload user data (long cache)
        await githubAPI.getUserData();
        
        // Preload repositories (medium cache)  
        await githubAPI.getRepositories('stars', 100);
        
    } catch (error) {
    }
}

// Debounced function to prevent too many consecutive API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Manual refresh function for user-initiated updates
const refreshGitHubData = debounce(async function() {
    
    // Clear relevant cache entries to force fresh data
    for (const [key] of githubAPI.cache.entries()) {
        if (key.includes('/users/and3rn3t')) {
            githubAPI.cache.delete(key);
        }
    }
    
    // Show refresh indicator
    const refreshButtons = document.querySelectorAll('.refresh-btn');
    for (const btn of refreshButtons) {
        btn.classList.add('refreshing');
        btn.disabled = true;
    }
    
    try {
        await loadAllGitHubData();
        
        // Show success feedback
        for (const btn of refreshButtons) {
            btn.classList.add('success');
            setTimeout(() => btn.classList.remove('success'), 2000);
        }
        
    } catch (error) {
        handleAPIError(error, 'Manual refresh');
        
        // Show error feedback
        for (const btn of refreshButtons) {
            btn.classList.add('error');
            setTimeout(() => btn.classList.remove('error'), 3000);
        }
    } finally {
        // Reset buttons
        setTimeout(() => {
            for (const btn of refreshButtons) {
                btn.classList.remove('refreshing');
                btn.disabled = false;
            }
        }, 1000);
    }
}, 5000); // Prevent spam refreshing

// Advanced Performance Optimization Manager
class PerformanceOptimizer {
    constructor() {
        this.imageFormats = this.detectImageSupport();
        this.intersectionObserver = null;
        this.performanceMetrics = {
            loadStart: performance.now(),
            firstContentfulPaint: null,
            largestContentfulPaint: null,
            cumulativeLayoutShift: 0
        };
        this.init();
    }

    // Detect modern image format support
    detectImageSupport() {
        const formats = {
            webp: false,
            avif: false
        };

        // Test WebP support
        const webpCanvas = document.createElement('canvas');
        webpCanvas.width = 1;
        webpCanvas.height = 1;
        formats.webp = webpCanvas.toDataURL('image/webp').startsWith('data:image/webp');

        // Test AVIF support (more complex detection needed)
        formats.avif = 'createImageBitmap' in globalThis && 
                      typeof globalThis.createImageBitmap === 'function';

        return formats;
    }

    // Optimize image sources based on browser support
    optimizeImageSource(originalSrc) {
        // For GitHub-generated images, we can't change format, but we can optimize loading
        if (originalSrc.includes('github.com') || 
            originalSrc.includes('vercel.app') || 
            originalSrc.includes('herokuapp.com') ||
            originalSrc.includes('shields.io')) {
            return originalSrc;
        }

        // For custom images, we would serve different formats
        // This is a placeholder for when you add custom images
        const baseSrc = originalSrc.split('.').slice(0, -1).join('.');

        if (this.imageFormats.avif && !originalSrc.includes('svg')) {
            return `${baseSrc}.avif`;
        } else if (this.imageFormats.webp && !originalSrc.includes('svg')) {
            return `${baseSrc}.webp`;
        }

        return originalSrc;
    }

    // Enhanced lazy loading with intersection observer
    initAdvancedLazyLoading() {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    this.loadImageWithFallback(img);
                    observer.unobserve(img);
                }
            }
        }, {
            rootMargin: '50px 0px', // Load images 50px before they come into view
            threshold: 0.01
        });

        // Observe all images with lazy loading
        const lazyImages = document.querySelectorAll('img[loading="lazy"], img[data-src]');
        for (const img of lazyImages) {
            imageObserver.observe(img);
        }

        return imageObserver;
    }

    // Load image with format fallback chain
    async loadImageWithFallback(img) {
        const originalSrc = img.dataset.src || img.src;
        const optimizedSrc = this.optimizeImageSource(originalSrc);

        try {
            // Test if optimized image loads
            await this.preloadImage(optimizedSrc);
            img.src = optimizedSrc;
            img.classList.add('loaded');
        } catch (error) {
            try {
                await this.preloadImage(originalSrc);
                img.src = originalSrc;
                img.classList.add('loaded');
            } catch (fallbackError) {
                img.classList.add('error');
            }
        }
    }

    // Preload image with promise
    preloadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = src;
        });
    }

    // Critical resource preloading
    preloadCriticalResources() {
        const criticalResources = [
            { href: 'styles.css', as: 'style' },
            { href: 'script.js', as: 'script' },
            { href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap', as: 'style' }
        ];

        for (const resource of criticalResources) {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = resource.href;
            link.as = resource.as;
            if (resource.crossorigin) link.crossOrigin = resource.crossorigin;
            document.head.appendChild(link);
        }
    }

    // Measure Core Web Vitals
    measureWebVitals() {
        // Largest Contentful Paint (LCP)
        if ('PerformanceObserver' in globalThis) {
            const lcpObserver = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    this.performanceMetrics.largestContentfulPaint = entry.renderTime || entry.loadTime;
                }
            });
            
            try {
                lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
            } catch (error) {
            }

            // First Contentful Paint (FCP)
            const fcpObserver = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    if (entry.name === 'first-contentful-paint') {
                        this.performanceMetrics.firstContentfulPaint = entry.startTime;
                    }
                }
            });

            try {
                fcpObserver.observe({ entryTypes: ['paint'] });
            } catch (error) {
            }

            // Cumulative Layout Shift (CLS)
            const clsObserver = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    if (!entry.hadRecentInput) {
                        this.performanceMetrics.cumulativeLayoutShift += entry.value;
                    }
                }
            });

            try {
                clsObserver.observe({ entryTypes: ['layout-shift'] });
            } catch (error) {
            }
        }

        // Log performance metrics after page load
        globalThis.addEventListener('load', () => {
            setTimeout(() => {
                const loadTime = performance.now() - this.performanceMetrics.loadStart;
                debug.log('[Performance] Metrics:', {
                    totalLoadTime: `${loadTime.toFixed(2)}ms`,
                    firstContentfulPaint: this.performanceMetrics.firstContentfulPaint ? 
                        `${this.performanceMetrics.firstContentfulPaint.toFixed(2)}ms` : 'Not measured',
                    largestContentfulPaint: this.performanceMetrics.largestContentfulPaint ? 
                        `${this.performanceMetrics.largestContentfulPaint.toFixed(2)}ms` : 'Not measured',
                    cumulativeLayoutShift: this.performanceMetrics.cumulativeLayoutShift.toFixed(4)
                });

                // Performance scoring
                this.scorePerformance();
            }, 1000);
        });
    }

    // Score performance based on Core Web Vitals thresholds
    scorePerformance() {
        const scores = {
            lcp: this.scoreLCP(this.performanceMetrics.largestContentfulPaint),
            fcp: this.scoreFCP(this.performanceMetrics.firstContentfulPaint),
            cls: this.scoreCLS(this.performanceMetrics.cumulativeLayoutShift)
        };

        const overallScore = Object.values(scores).reduce((sum, score) => sum + score, 0) / 3;
        
        debug.log('[Performance] Score:', {
            individual: scores,
            overall: `${(overallScore * 100).toFixed(1)}%`,
            grade: this.getPerformanceGrade(overallScore)
        });
    }

    scoreLCP(lcp) {
        if (!lcp) return 0;
        if (lcp <= 2500) return 1; // Good
        if (lcp <= 4000) return 0.5; // Needs improvement
        return 0; // Poor
    }

    scoreFCP(fcp) {
        if (!fcp) return 0;
        if (fcp <= 1800) return 1; // Good
        if (fcp <= 3000) return 0.5; // Needs improvement
        return 0; // Poor
    }

    scoreCLS(cls) {
        if (cls <= 0.1) return 1; // Good
        if (cls <= 0.25) return 0.5; // Needs improvement
        return 0; // Poor
    }

    getPerformanceGrade(score) {
        if (score >= 0.9) return 'A+ (Excellent)';
        if (score >= 0.75) return 'A (Good)';
        if (score >= 0.5) return 'B (Fair)';
        if (score >= 0.25) return 'C (Needs Improvement)';
        return 'D (Poor)';
    }

    // Optimize font loading
    optimizeFontLoading() {
        // Use font-display: swap for better performance
        const fontFaces = document.querySelectorAll('link[href*="fonts.googleapis.com"]');
        for (const fontFace of fontFaces) {
            if (!fontFace.href.includes('display=swap')) {
                fontFace.href = fontFace.href.replace(/display=[^&]*/, 'display=swap');
                if (!fontFace.href.includes('display=')) {
                    fontFace.href += fontFace.href.includes('?') ? '&display=swap' : '?display=swap';
                }
            }
        }
    }

    // Initialize all performance optimizations
    init() {
        this.measureWebVitals();
        this.optimizeFontLoading();
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.intersectionObserver = this.initAdvancedLazyLoading();
            });
        } else {
            this.intersectionObserver = this.initAdvancedLazyLoading();
        }
    }
}

// Initialize performance optimizer
const performanceOptimizer = new PerformanceOptimizer();

// Enhanced Navigation System
class EnhancedNavigation {
    constructor() {
        this.scrollProgress = document.getElementById('scroll-progress-bar');
        this.keyboardHelp = document.getElementById('keyboard-help');
        
        this.keySequence = '';
        this.keyTimeout = null;
        this.sections = [];
        
        this.init();
    }
    
    init() {
        this.initScrollProgress();
        this.initKeyboardShortcuts();
        this.initSectionTracking();
    }
    
    initScrollProgress() {
        if (!this.scrollProgress) return;
        
        const updateProgress = () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = (scrollTop / docHeight) * 100;
            
            this.scrollProgress.style.width = `${Math.min(progress, 100)}%`;
        };
        
        window.addEventListener('scroll', updateProgress, { passive: true });
        updateProgress(); // Initial call
    }
    
    initSectionTracking() {
        // Track which section is currently in view
        const sections = document.querySelectorAll('section[id]');
        this.sections = Array.from(sections);
    }
    
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Handle escape key
            if (e.key === 'Escape') {
                this.closeAllDialogs();
                return;
            }
            
            // Ignore shortcuts when typing in inputs
            if (e.target.matches('input, textarea, select, [contenteditable]')) {
                return;
            }
            
            // Handle single key shortcuts
            switch (e.key.toLowerCase()) {
                case '?':
                    e.preventDefault();
                    this.toggleKeyboardHelp();
                    break;
                case 't':
                    e.preventDefault();
                    this.toggleTheme();
                    break;
                case 'j':
                    e.preventDefault();
                    this.scrollDown();
                    break;
                case 'k':
                    e.preventDefault();
                    this.scrollUp();
                    break;
                default:
                    this.handleKeySequence(e.key.toLowerCase());
            }
            
            // Handle Ctrl/Cmd combinations
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                generateResume();
            }
        });
        
        // Initialize keyboard help close button
        const closeButton = document.getElementById('keyboard-help-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.toggleKeyboardHelp();
            });
        }
    }
    
    handleKeySequence(key) {
        // Clear previous timeout
        if (this.keyTimeout) {
            clearTimeout(this.keyTimeout);
        }
        
        // Add key to sequence
        this.keySequence += key;
        
        // Check for Go-to shortcuts (g + letter)
        if (this.keySequence.length === 2 && this.keySequence.startsWith('g')) {
            const shortcut = this.keySequence;
            this.keySequence = ''; // Reset
            
            switch (shortcut) {
                case 'gh':
                    this.goToSection('#home');
                    break;
                case 'ga':
                    this.goToSection('#about');
                    break;
                case 'gp':
                    this.goToSection('#projects');
                    break;
                case 'gc':
                    this.goToSection('#contact');
                    break;
                case 'gs':
                    this.goToSection('#skills');
                    break;
            }
            return;
        }
        
        // Reset sequence after 2 seconds
        this.keyTimeout = setTimeout(() => {
            this.keySequence = '';
        }, 2000);
        
        // Reset if sequence gets too long
        if (this.keySequence.length > 2) {
            this.keySequence = '';
        }
    }
    
    goToSection(selector) {
        const target = document.querySelector(selector);
        if (target) {
            const offsetTop = target.offsetTop - 70;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    }
    
    toggleTheme() {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        // Dispatch theme change event
        document.dispatchEvent(new CustomEvent('themeChanged', {
            detail: { theme: isDark ? 'dark' : 'light' }
        }));
    }
    
    toggleKeyboardHelp() {
        this.keyboardHelp.classList.toggle('visible');
    }
    
    scrollDown() {
        window.scrollBy({
            top: window.innerHeight * 0.8,
            behavior: 'smooth'
        });
    }
    
    scrollUp() {
        window.scrollBy({
            top: -window.innerHeight * 0.8,
            behavior: 'smooth'
        });
    }
    
    closeAllDialogs() {
        if (this.keyboardHelp) {
            this.keyboardHelp.classList.remove('visible');
        }
    }
}

// Advanced Content Discovery System
class ContentDiscoverySystem {
    constructor() {
        this.globalSearchModal = document.getElementById('global-search-modal');
        this.globalSearchInput = document.getElementById('global-search-input');
        this.globalSearchClose = document.getElementById('global-search-close');
        this.globalSearchResults = document.getElementById('global-search-results');
        this.searchResultsContent = document.getElementById('search-results-content');
        this.searchResultsEmpty = document.getElementById('search-results-empty');
        this.searchCategories = document.querySelectorAll('.search-category');
        
        this.currentCategory = 'all';
        this.searchTimeout = null;
        this.selectedResultIndex = -1;
        this.searchResults = [];
        this.searchIndex = {};
        
        // Enhanced project search elements
        this.searchResultsSummary = document.getElementById('search-results-summary');
        this.savedSearches = document.getElementById('saved-searches');
        this.relatedProjects = document.getElementById('related-projects');
        this.saveSearchBtn = document.getElementById('save-search');
        this.projectSearch = document.getElementById('project-search');

        this.init();
    }
    
    init() {
        this.buildSearchIndex();
        this.bindGlobalSearchEvents();
        this.bindProjectSearchEnhancements();
        
        // Load saved searches if method exists
        if (typeof this.loadSavedSearches === 'function') {
            this.loadSavedSearches();
        }
        
        // Global keyboard shortcut for search
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.openGlobalSearch();
            }
        });
    }
    
    buildSearchIndex() {
        this.searchIndex = {
            projects: [],
            skills: [],
            content: [],
            technologies: new Set(),
            categories: new Set()
        };
        
        // Index projects (will be populated when GitHub data loads)
        this.indexProjects();
        
        // Index skills
        this.indexSkills();
        
        // Index general content
        this.indexContent();
    }
    
    indexProjects() {
        // This will be called after project data is loaded
        // For now, create placeholder structure
        const projectElements = document.querySelectorAll('.project-card');
        projectElements.forEach(card => {
            const title = card.querySelector('h3, .project-title')?.textContent || '';
            const description = card.querySelector('p, .project-description')?.textContent || '';
            const tech = card.querySelector('.tech-stack')?.textContent || '';
            
            if (title) {
                this.searchIndex.projects.push({
                    title,
                    description,
                    technologies: tech.split(',').map(t => t.trim()),
                    element: card,
                    type: 'project',
                    url: card.querySelector('a')?.href || '#projects'
                });
            }
        });
    }
    
    indexSkills() {
        const skillElements = document.querySelectorAll('.skill-item, .skill-category h3');
        skillElements.forEach(skill => {
            const text = skill.textContent.trim();
            if (text) {
                this.searchIndex.skills.push({
                    title: text,
                    description: `${text} skill and expertise`,
                    type: 'skill',
                    element: skill,
                    url: '#skills'
                });
            }
        });
    }
    
    indexContent() {
        // Index section headings and important content
        const headings = document.querySelectorAll('h1, h2, h3, .section-title');
        headings.forEach(heading => {
            const text = heading.textContent.trim();
            const section = heading.closest('section');
            const sectionId = section?.id || '';
            
            if (text && sectionId) {
                this.searchIndex.content.push({
                    title: text,
                    description: `Navigate to ${text} section`,
                    type: 'content',
                    element: heading,
                    url: `#${sectionId}`
                });
            }
        });
    }
    
    bindGlobalSearchEvents() {
        if (!this.globalSearchInput) return;
        
        // Search input
        this.globalSearchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.performGlobalSearch(e.target.value);
            }, 200);
        });
        
        // Keyboard navigation
        this.globalSearchInput.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.navigateResults(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.navigateResults(-1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    this.selectResult();
                    break;
                case 'Escape':
                    this.closeGlobalSearch();
                    break;
            }
        });
        
        // Category filters
        this.searchCategories.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.searchCategories.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentCategory = e.target.dataset.category;
                this.performGlobalSearch(this.globalSearchInput.value);
            });
        });
        
        // Close button
        if (this.globalSearchClose) {
            this.globalSearchClose.addEventListener('click', () => {
                this.closeGlobalSearch();
            });
        }
        
        // Close on overlay click
        this.globalSearchModal.addEventListener('click', (e) => {
            if (e.target === this.globalSearchModal) {
                this.closeGlobalSearch();
            }
        });
    }
    
    bindProjectSearchEnhancements() {
        if (this.projectSearch && this.saveSearchBtn) {
            // Show/hide save button based on search activity
            this.projectSearch.addEventListener('input', (e) => {
                const hasQuery = e.target.value.trim().length > 0;
                this.saveSearchBtn.classList.toggle('hidden', !hasQuery);
                
                if (hasQuery) {
                    this.showSearchSummary(e.target.value);
                    this.showRelatedProjects(e.target.value);
                } else {
                    this.hideEnhancedResults();
                }
            });
            
            // Save search functionality
            this.saveSearchBtn.addEventListener('click', () => {
                this.saveCurrentSearch();
            });
        }
    }
    
    openGlobalSearch() {
        this.globalSearchModal.classList.add('visible');
        this.globalSearchInput.focus();
        
        // Track analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', 'global_search_opened', {
                event_category: 'search'
            });
        }
    }
    
    closeGlobalSearch() {
        this.globalSearchModal.classList.remove('visible');
        this.globalSearchInput.value = '';
        this.clearSearchResults();
        this.selectedResultIndex = -1;
    }
    
    performGlobalSearch(query) {
        if (!query.trim()) {
            this.clearSearchResults();
            return;
        }
        
        const results = this.searchAllContent(query, this.currentCategory);
        this.displayGlobalSearchResults(results);
        
        // Track search analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', 'search', {
                search_term: query,
                search_category: this.currentCategory
            });
        }
    }
    
    searchAllContent(query, category = 'all') {
        const queryLower = query.toLowerCase();
        const results = [];
        
        // Define search sources based on category
        const searchSources = {
            all: ['projects', 'skills', 'content'],
            projects: ['projects'],
            skills: ['skills'],
            content: ['content']
        };
        
        const sources = searchSources[category] || searchSources.all;
        
        sources.forEach(source => {
            this.searchIndex[source].forEach(item => {
                const titleMatch = item.title.toLowerCase().includes(queryLower);
                const descMatch = item.description.toLowerCase().includes(queryLower);
                const techMatch = item.technologies?.some(tech => 
                    tech.toLowerCase().includes(queryLower)
                ) || false;
                
                if (titleMatch || descMatch || techMatch) {
                    const relevance = this.calculateRelevance(item, queryLower);
                    results.push({ ...item, relevance });
                }
            });
        });
        
        return results.sort((a, b) => b.relevance - a.relevance).slice(0, 10);
    }
}

// Enhanced Visual Animation System
class VisualAnimationSystem {
    constructor() {
        this.observers = new Map();
        this.particles = [];
        this.isInitialized = false;
        
        this.init();
    }
    
    init() {
        if (this.isInitialized) return;
        
        this.setupScrollAnimations();
        this.setupParticleSystem();
        this.setupMicroInteractions();
        this.enhanceExistingElements();
        
        this.isInitialized = true;
    }
    
    setupScrollAnimations() {
        // Enhanced Intersection Observer for scroll animations
        const observerOptions = {
            root: null,
            rootMargin: '-10% 0px -10% 0px',
            threshold: [0, 0.1, 0.3, 0.5]
        };
        
        this.scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry, index) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.classList.add('revealed');
                    }, index * 100); // Staggered animation
                }
            });
        }, observerOptions);
        
        // Observe elements with animation classes
        const animateElements = document.querySelectorAll(
            '.reveal-on-scroll, .slide-in-left, .slide-in-right, .scale-in, .stagger-item'
        );
        
        animateElements.forEach(el => {
            this.scrollObserver.observe(el);
        });
    }
    
    setupParticleSystem() {
        // Create particles container if it doesn't exist
        let particlesContainer = document.querySelector('.particles-container');
        if (!particlesContainer) {
            particlesContainer = document.createElement('div');
            particlesContainer.className = 'particles-container';
            document.querySelector('#hero')?.appendChild(particlesContainer);
        }
        
        // Create particles
        for (let i = 0; i < 50; i++) {
            this.createParticle(particlesContainer);
        }
    }
    
    createParticle(container) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        // Random starting position and animation duration
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDuration = (Math.random() * 10 + 5) + 's';
        particle.style.animationDelay = Math.random() * 5 + 's';
        
        container.appendChild(particle);
        
        // Remove and recreate particle after animation
        particle.addEventListener('animationiteration', () => {
            particle.style.left = Math.random() * 100 + '%';
        });
        
        return particle;
    }
    
    setupMicroInteractions() {
        // Enhanced button interactions
        const buttons = document.querySelectorAll('.btn, .cta-button, .search-button');
        buttons.forEach(btn => {
            btn.classList.add('btn-enhanced');
            
            btn.addEventListener('mouseenter', (e) => {
                e.target.style.setProperty('--mouse-x', e.clientX - e.target.offsetLeft + 'px');
                e.target.style.setProperty('--mouse-y', e.clientY - e.target.offsetTop + 'px');
            });
        });
        
        // Enhanced card hover effects
        const cards = document.querySelectorAll('.project-card, .skill-category');
        cards.forEach(card => {
            card.addEventListener('mouseenter', (e) => {
                this.createHoverRipple(e);
            });
        });
    }
    
    createHoverRipple(e) {
        const card = e.currentTarget;
        const ripple = document.createElement('div');
        
        ripple.style.cssText = `
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            width: 100px;
            height: 100px;
            left: ${e.clientX - card.offsetLeft - 50}px;
            top: ${e.clientY - card.offsetTop - 50}px;
            animation: ripple 0.6s ease-out;
            pointer-events: none;
            z-index: 1;
        `;
        
        card.style.position = 'relative';
        card.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }
    
    enhanceExistingElements() {
        // Add loading states to GitHub API calls
        const githubElements = document.querySelectorAll('.github-stats, .repository-stats');
        githubElements.forEach(el => {
            this.addLoadingState(el);
        });
        
        // Enhance existing stats cards
        const statCards = document.querySelectorAll('.stat-card');
        statCards.forEach((card, index) => {
            card.classList.add('reveal-on-scroll');
            card.style.animationDelay = `${index * 0.1}s`;
        });
        
        // Add focus management
        this.setupFocusManagement();
    }
    
    addLoadingState(element) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    element.classList.add('loaded');
                    observer.disconnect();
                }
            });
        });
        
        observer.observe(element, { childList: true, subtree: true });
    }
    
    setupFocusManagement() {
        // Enhanced keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                document.body.classList.add('keyboard-navigation');
            }
        });
        
        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-navigation');
        });
        
        // Add focus rings to interactive elements
        const focusableElements = document.querySelectorAll(
            'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
        );
        
        focusableElements.forEach(el => {
            if (!el.classList.contains('focus-ring')) {
                el.classList.add('focus-ring');
            }
        });
    }
    
    // Performance monitoring
    monitorPerformance() {
        if ('performance' in globalThis && 'observer' in globalThis.PerformanceObserver) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
                    }
                }
            });
            
            observer.observe({ entryTypes: ['paint'] });
        }
    }
    
    // Cleanup method
    destroy() {
        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
        }
        
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();
        
        // Remove particles
        const particlesContainer = document.querySelector('.particles-container');
        if (particlesContainer) {
            particlesContainer.remove();
        }
        
        this.isInitialized = false;
    }
    
    calculateRelevance(item, query) {
        let score = 0;
        const title = item.title.toLowerCase();
        const description = item.description.toLowerCase();
        
        // Exact title match
        if (title === query) score += 100;
        // Title starts with query
        else if (title.startsWith(query)) score += 80;
        // Title contains query
        else if (title.includes(query)) score += 60;
        
        // Description matches
        if (description.includes(query)) score += 30;
        
        // Technology matches
        if (item.technologies?.some(tech => tech.toLowerCase().includes(query))) {
            score += 40;
        }
        
        // Boost certain types
        if (item.type === 'project') score += 20;
        if (item.type === 'skill') score += 10;
        
        return score;
    }
    
    displayGlobalSearchResults(results) {
        this.searchResults = results;
        this.selectedResultIndex = -1;
        
        if (results.length === 0) {
            this.searchResultsContent.style.display = 'none';
            this.searchResultsEmpty.style.display = 'block';
            return;
        }
        
        this.searchResultsEmpty.style.display = 'none';
        this.searchResultsContent.style.display = 'block';
        
        const html = results.map((result, index) => `
            <div class="search-result-item" data-index="${index}" data-url="${result.url}">
                <div class="search-result-icon">
                    <i class="fas ${this.getResultIcon(result.type)}"></i>
                </div>
                <div class="search-result-content">
                    <div class="search-result-title">${result.title}</div>
                    <div class="search-result-description">${result.description}</div>
                    <div class="search-result-meta">
                        <span class="search-result-category">${result.type}</span>
                        ${result.technologies ? `<span>• ${result.technologies.slice(0, 3).join(', ')}</span>` : ''}
                    </div>
                </div>
            </div>
        `).join('');
        
        this.searchResultsContent.innerHTML = html;
        
        // Bind click events
        this.searchResultsContent.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const url = item.dataset.url;
                this.navigateToResult(url);
            });
        });
    }
    
    getResultIcon(type) {
        const icons = {
            project: 'fa-code',
            skill: 'fa-cogs',
            content: 'fa-file-alt'
        };
        return icons[type] || 'fa-search';
    }
    
    navigateResults(direction) {
        if (this.searchResults.length === 0) return;
        
        // Remove previous highlight
        const previous = this.searchResultsContent.querySelector('.highlighted');
        if (previous) previous.classList.remove('highlighted');
        
        // Update index
        this.selectedResultIndex += direction;
        if (this.selectedResultIndex < 0) this.selectedResultIndex = this.searchResults.length - 1;
        if (this.selectedResultIndex >= this.searchResults.length) this.selectedResultIndex = 0;
        
        // Highlight new result
        const current = this.searchResultsContent.querySelector(`[data-index="${this.selectedResultIndex}"]`);
        if (current) {
            current.classList.add('highlighted');
            current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
    
    selectResult() {
        if (this.selectedResultIndex >= 0 && this.searchResults[this.selectedResultIndex]) {
            const result = this.searchResults[this.selectedResultIndex];
            this.navigateToResult(result.url);
        }
    }
    
    navigateToResult(url) {
        this.closeGlobalSearch();
        
        if (url.startsWith('#')) {
            // Internal navigation
            const target = document.querySelector(url);
            if (target) {
                const offsetTop = target.offsetTop - 70;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        } else {
            // External navigation
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }
    
    clearSearchResults() {
        this.searchResultsContent.innerHTML = '';
        this.searchResultsContent.style.display = 'none';
        this.searchResultsEmpty.style.display = 'block';
    }
    
    showSearchSummary(query) {
        // Implementation for project search summary
        if (this.searchResultsSummary) {
            this.searchResultsSummary.classList.remove('hidden');
            // Update summary content based on current filters and results
        }
    }
    
    showRelatedProjects(query) {
        // Implementation for related projects
        if (this.relatedProjects) {
            this.relatedProjects.classList.remove('hidden');
            // Show projects related to current search
        }
    }
    
    hideEnhancedResults() {
        this.searchResultsSummary?.classList.add('hidden');
        this.relatedProjects?.classList.add('hidden');
    }
    
    saveCurrentSearch() {
        if (!this.projectSearch?.value.trim()) return;

        const search = {
            query: this.projectSearch.value,
            timestamp: Date.now(),
            filters: {
                category: document.getElementById('category-filter')?.value || '',
                technology: document.getElementById('technology-filter')?.value || '',
                status: document.getElementById('status-filter')?.value || ''
            }
        };
        
        let savedSearches = JSON.parse(localStorage.getItem('portfolio_saved_searches') || '[]');
        
        // Avoid duplicates
        if (!savedSearches.some(s => s.query === search.query)) {
            savedSearches.unshift(search);
            savedSearches = savedSearches.slice(0, 10); // Keep only 10 most recent
            localStorage.setItem('portfolio_saved_searches', JSON.stringify(savedSearches));
            this.loadSavedSearches();
        }
    }
    
    loadSavedSearches() {
        const savedSearches = JSON.parse(localStorage.getItem('portfolio_saved_searches') || '[]');
        if (savedSearches.length > 0 && this.savedSearches) {
            this.savedSearches.classList.remove('hidden');
            // Render saved searches
            const list = this.savedSearches.querySelector('#saved-searches-list');
            if (list) {
                list.innerHTML = savedSearches.map(search => `
                    <div class="saved-search-item" data-search='${JSON.stringify(search)}'>
                        ${search.query}
                    </div>
                `).join('');
                
                // Bind click events
                list.querySelectorAll('.saved-search-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const search = JSON.parse(item.dataset.search);
                        this.applySavedSearch(search);
                    });
                });
            }
        }
    }
    
    applySavedSearch(search) {
        if (this.projectSearch) {
            this.projectSearch.value = search.query;
            this.projectSearch.dispatchEvent(new Event('input'));
        }
        
        // Apply filters
        Object.entries(search.filters).forEach(([key, value]) => {
            const element = document.getElementById(`${key}-filter`);
            if (element && value) {
                element.value = value;
                element.dispatchEvent(new Event('change'));
            }
        });
    }
    
    // Method to be called after GitHub projects load to reindex
    reindexProjects(projectsData) {
        this.searchIndex.projects = [];
        
        projectsData.forEach(project => {
            this.searchIndex.projects.push({
                title: project.displayName || project.name,
                description: project.description || project.longDescription || '',
                technologies: project.technologies || project.topics || [],
                type: 'project',
                url: project.html_url || project.homepage || '#projects',
                stars: project.stargazers_count || 0,
                category: project.category || 'Other'
            });
            
            // Add to technology and category sets
            if (project.technologies) {
                project.technologies.forEach(tech => this.searchIndex.technologies.add(tech));
            }
            if (project.category) {
                this.searchIndex.categories.add(project.category);
            }
        });
    }
}

// Initialize enhanced navigation
function initializeEnhancedNavigation() {
    new EnhancedNavigation();
}

// Initialize content discovery system
function initializeContentDiscovery() {
    new ContentDiscoverySystem();
}

// Smooth scrolling and navigation
document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileMenu = document.getElementById('mobile-menu');
    const navMenu = document.getElementById('nav-menu');

    mobileMenu.addEventListener('click', function() {
        mobileMenu.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Close mobile menu when clicking on a link
    const navLinks = document.querySelectorAll('.nav-link');
    for (const link of navLinks) {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            navMenu.classList.remove('active');
        });
    }

    // Navbar scroll effect
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Smooth scroll for anchor links
    for (const anchor of document.querySelectorAll('a[href^="#"]')) {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const offsetTop = target.offsetTop - 70; // Account for fixed navbar
                globalThis.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    }

    // Initialize enhanced navigation features
    initializeEnhancedNavigation();

    // Initialize content discovery system
    initializeContentDiscovery();

    // Initialize API optimizations
    preloadCriticalData();
    
    // Set up periodic cache cleanup (every 10 minutes)
    setInterval(clearExpiredCache, 10 * 60 * 1000);
    
    // Load all GitHub data with optimized coordination
    loadAllGitHubData().catch(error => {
        debug.error('[GitHub] Failed to load data, showing demo projects:', error);
        // Fallback: show demo projects if GitHub data fails to load
        setTimeout(() => {
            const projectsGrid = document.getElementById('projects-grid');
            if (projectsGrid && (!projectsGrid.children.length || projectsGrid.children.length === 1)) {
                debug.log('[GitHub] Loading demo projects as fallback');
                showDemoProjects(projectsGrid);
            }
        }, 2000);
    });
    loadGitHubBadges(); // This uses external services, so keep separate

    // Intersection Observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        }
    }, observerOptions);

    // Observe elements for animation
    const animateElements = document.querySelectorAll('.highlight-item, .skill-category, .project-card');
    for (const el of animateElements) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    }
});

// GitHub API integration
async function loadGitHubProjects() {
    const projectsGrid = document.getElementById('projects-grid');
    if (!projectsGrid) return;
    
    try {
        // Load project metadata
        let projectsData = null;
        try {
            const projectsDataResponse = await fetch('projects-data.json');
            projectsData = await projectsDataResponse.json();
        } catch (error) {
            debug.warn('[GitHub] Could not load projects-data.json');
        }
        
        // Get repositories using the optimized API manager
        const repos = await githubAPI.getRepositories('stars', 100);
        
        // Filter out fork repositories and archived, then sort by stars
        const featuredRepos = repos
            .filter(repo => !repo.fork && !repo.archived)
            .sort((a, b) => b.stargazers_count - a.stargazers_count)
            .slice(0, 9);
        
        if (featuredRepos.length === 0) {
            showDemoProjects(projectsGrid);
            return;
        }
        
        // Clear loading state and render projects
        projectsGrid.innerHTML = '';
        
        for (const repo of featuredRepos) {
            const projectMeta = projectsData?.projects?.find(p => p.name === repo.name);
            const card = createProjectCard(repo, projectMeta);
            projectsGrid.appendChild(card);
        }
        
        // Animate project cards after loading
        animateProjectCards();
        
    } catch (error) {
        handleAPIError(error, 'Loading GitHub projects');
        showDemoProjects(projectsGrid);
    }
}

function createProjectDetails(longDescription, metadata) {
    const highlightsList = metadata?.highlights ? `
        <ul class="project-highlights">
            ${metadata.highlights.map(highlight => `<li>${highlight}</li>`).join('')}
        </ul>
    ` : '';
    
    return `
        <details class="project-long-description">
            <summary>Learn more about this project...</summary>
            <p>${longDescription}</p>
            ${highlightsList}
        </details>
    `;
}

function createProjectCard(repo, metadata) {
    const card = document.createElement('div');
    card.className = 'project-card';
    
    // Use metadata if available, otherwise fall back to repo data
    const displayName = metadata?.displayName || repo.name;
    const description = metadata?.description || repo.description || 'A coding project showcasing development skills.';
    const longDescription = metadata?.longDescription;
    const category = metadata?.category;
    const status = metadata?.status;
    
    // Get primary language or default
    const language = repo.language || 'Code';
    
    // Format dates
    const updatedDate = new Date(repo.updated_at).toLocaleDateString();
    
    card.innerHTML = `
        <div class="project-header">
            ${category ? `<span class="project-category">${category}</span>` : ''}
            <h3 class="project-title">${displayName}</h3>
            <p class="project-description">${description}</p>
            ${longDescription ? createProjectDetails(longDescription, metadata) : ''}
            
            <div class="project-stats">
                <div class="project-stat" title="Stars">
                    <i class="fas fa-star"></i>
                    <span>${repo.stargazers_count}</span>
                </div>
                <div class="project-stat" title="Forks">
                    <i class="fas fa-code-branch"></i>
                    <span>${repo.forks_count}</span>
                </div>
                <div class="project-stat" title="Open Issues">
                    <i class="fas fa-circle-dot"></i>
                    <span>${repo.open_issues_count}</span>
                </div>
                <div class="project-stat" title="Last Updated">
                    <i class="fas fa-calendar"></i>
                    <span>${updatedDate}</span>
                </div>
            </div>
            
            <div class="project-languages">
                <span class="language-tag primary">${language}</span>
                ${repo.topics ? repo.topics.slice(0, 3).map(topic => 
                    `<span class="language-tag">${topic}</span>`
                ).join('') : ''}
                ${status ? `<span class="status-badge ${status.toLowerCase().replaceAll(/\s+/g, '-')}">${status}</span>` : ''}
            </div>
        </div>
        
        <div class="project-links">
            <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="project-link">
                <i class="fab fa-github"></i>
                View Code
            </a>
            ${repo.homepage ? `
                <a href="${repo.homepage}" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                    <i class="fas fa-external-link-alt"></i>
                    Live Demo
                </a>
            ` : `
                <a href="${repo.html_url}/blob/main/README.md" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                    <i class="fas fa-file-alt"></i>
                    Documentation
                </a>
            `}
        </div>
    `;
    
    return card;
}

function showDemoProjects(container) {
    const demoProjects = [
        {
            name: "Smart Home Dashboard",
            description: "A comprehensive home automation dashboard built with React and Python, featuring real-time IoT device monitoring and control.",
            language: "React",
            topics: ["IoT", "Python", "Dashboard"],
            stars: 15,
            forks: 3,
            updated: "2024-01-15",
            github: "https://github.com/and3rn3t",
            demo: null
        },
        {
            name: "Full-Stack E-Commerce",
            description: "Modern e-commerce platform with React frontend, Node.js backend, and PostgreSQL database. Features include user authentication and payment processing.",
            language: "JavaScript",
            topics: ["React", "Node.js", "PostgreSQL"],
            stars: 23,
            forks: 7,
            updated: "2024-01-10",
            github: "https://github.com/and3rn3t",
            demo: "#"
        },
        {
            name: "Python Data Analyzer",
            description: "Advanced data analysis tool built with Python, featuring data visualization, statistical analysis, and machine learning capabilities.",
            language: "Python",
            topics: ["Data Science", "ML", "Visualization"],
            stars: 31,
            forks: 12,
            updated: "2024-01-05",
            github: "https://github.com/and3rn3t",
            demo: null
        }
    ];
    
    container.innerHTML = '';
    
    for (const project of demoProjects) {
        const card = document.createElement('div');
        card.className = 'project-card';
        
        card.innerHTML = `
            <div class="project-header">
                <h3 class="project-title">${project.name}</h3>
                <p class="project-description">${project.description}</p>
                
                <div class="project-stats">
                    <div class="project-stat">
                        <i class="fas fa-star"></i>
                        <span>${project.stars}</span>
                    </div>
                    <div class="project-stat">
                        <i class="fas fa-code-branch"></i>
                        <span>${project.forks}</span>
                    </div>
                    <div class="project-stat">
                        <i class="fas fa-calendar"></i>
                        <span>${new Date(project.updated).toLocaleDateString()}</span>
                    </div>
                </div>
                
                <div class="project-languages">
                    <span class="language-tag">${project.language}</span>
                    ${project.topics.map(topic => 
                        `<span class="language-tag">${topic}</span>`
                    ).join('')}
                </div>
            </div>
            
            <div class="project-links">
                <a href="${project.github}" target="_blank" rel="noopener noreferrer" class="project-link">
                    <i class="fab fa-github"></i>
                    View Code
                </a>
                ${project.demo ? `
                    <a href="${project.demo}" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                        <i class="fas fa-external-link-alt"></i>
                        Live Demo
                    </a>
                ` : `
                    <a href="${project.github}" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                        <i class="fas fa-file-alt"></i>
                        Learn More
                    </a>
                `}
            </div>
        `;
        
        container.appendChild(card);
    }
}

// Enhanced scroll animations
function initScrollAnimations() {
    const animationElements = document.querySelectorAll('.hero-content, .about-text, .skills-grid, .animate-on-scroll');

    const animationObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        }
    }, {
        threshold: 0.1
    });

    for (const el of animationElements) {
        // Check if element is already in viewport on page load
        const rect = el.getBoundingClientRect();
        const isInViewport = (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );

        // If element is in viewport, animate it immediately
        if (isInViewport || rect.top < window.innerHeight) {
            el.classList.add('animate-in');
        }

        animationObserver.observe(el);
    }
}

// Typing effect for hero section
function initTypingEffect() {
    const texts = [
        "Full-Stack Developer",
        "Technology Enthusiast", 
        "IoT Specialist",
        "Problem Solver"
    ];
    
    let textIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    const typingSpeed = 100;
    const deletingSpeed = 50;
    const pauseDuration = 2000;
    
    const heroSubtitle = document.querySelector('.hero-subtitle');
    
    function typeEffect() {
        const currentText = texts[textIndex];
        
        if (isDeleting) {
            heroSubtitle.textContent = currentText.substring(0, charIndex - 1);
            charIndex--;
        } else {
            heroSubtitle.textContent = currentText.substring(0, charIndex + 1);
            charIndex++;
        }
        
        let timeout = isDeleting ? deletingSpeed : typingSpeed;
        
        if (!isDeleting && charIndex === currentText.length) {
            timeout = pauseDuration;
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            textIndex = (textIndex + 1) % texts.length;
        }
        
        setTimeout(typeEffect, timeout);
    }
    
    // Start typing effect after a short delay
    setTimeout(typeEffect, 1000);
}

// Enhanced project loading with intelligent retry and exponential backoff
function enhancedProjectLoad() {
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 1000; // Start with 1 second
    
    async function loadWithRetry() {
        try {
            // Show API status before making requests
            displayAPIStatus();
            
            await loadGitHubProjects();
            
            // Reset retry count on success
            if (retryCount > 0) {
                retryCount = 0;
            }
            
        } catch (error) {
            handleAPIError(error, 'Enhanced project loading');
            retryCount++;
            
            if (retryCount < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s, 8s...
                const delay = baseDelay * Math.pow(2, retryCount - 1);
                
                // Add jitter to prevent thundering herd
                const jitteredDelay = delay + Math.random() * 1000;
                
                setTimeout(loadWithRetry, jitteredDelay);
            } else {
                showDemoProjects(document.getElementById('projects-grid'));
                
                // Show final API status for debugging
                displayAPIStatus();
            }
        }
    }
    
    loadWithRetry();
}

// Parallel loading of all GitHub data with coordination
async function loadAllGitHubData() {
    const loadingIndicators = {
        projects: document.querySelector('.projects-loading'),
        stats: document.querySelector('.stats-loading'), 
        activity: document.querySelector('.activity-loading')
    };
    
    // Show loading states
    for (const indicator of Object.values(loadingIndicators)) {
        if (indicator) indicator.style.display = 'block';
    }
    
    // Show global loading progress
    showGlobalLoadingProgress();
    
    try {
        // Load core data in parallel with smart coordination
        const results = await Promise.allSettled([
            loadGitHubProjects(),
            loadGitHubStats()
        ]);
        
        // Check results and log any failures
        const failed = results.filter(result => result.status === 'rejected');
        if (failed.length > 0) {
        }
        
        displayAPIStatus();
        
    } catch (error) {
        handleAPIError(error, 'Loading all GitHub data');
    } finally {
        // Hide loading indicators
        for (const indicator of Object.values(loadingIndicators)) {
            if (indicator) indicator.style.display = 'none';
        }
        
        // Hide global loading progress
        hideGlobalLoadingProgress();
    }
}

// Initialize enhanced features when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initScrollAnimations();
    initTypingEffect();
    
    // Immediate fallback for projects section
    setTimeout(() => {
        const projectsGrid = document.getElementById('projects-grid');
        if (projectsGrid) {
            const hasContent = projectsGrid.children.length > 0 && 
                            !projectsGrid.querySelector('.loading');
            if (!hasContent) {
                debug.log('[GitHub] Projects grid empty, loading demo projects immediately');
                showDemoProjects(projectsGrid);
            }
        }
    }, 3000); // Give 3 seconds for GitHub data to load
    
    // Add some interactive features
    const skillItems = document.querySelectorAll('.skill-item');
    for (const item of skillItems) {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-3px) scale(1.05)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    }
    
    // Add parallax effect to hero section
    globalThis.addEventListener('scroll', function() {
        const scrolled = globalThis.pageYOffset;
        const parallaxElements = document.querySelectorAll('.hero');
        
        for (const element of parallaxElements) {
            const speed = 0.5;
            element.style.transform = `translateY(${scrolled * speed}px)`;
        }
    });
});

// Contact form handling (if needed in the future)
function handleContactForm() {
    const contactMethods = document.querySelectorAll('.contact-method');
    
    for (const method of contactMethods) {
        method.addEventListener('click', function(e) {
            // Add click tracking or analytics here if needed
        });
    }
}

// Initialize contact handling
document.addEventListener('DOMContentLoaded', handleContactForm);

// GitHub Stats Integration
async function loadGitHubStats() {
    const statsGrid = document.getElementById('stats-grid');
    const contributionGraph = document.getElementById('contribution-graph');
    const languageStats = document.getElementById('main-language-stats');
    
    if (!statsGrid) {
        return;
    }
    
    try {
        // Fetch user data and repositories using optimized API
        const [userData, repos] = await Promise.all([
            githubAPI.getUserData(),
            githubAPI.getRepositories('updated', 100)
        ]);
        
        // Calculate total stars and forks
        const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
        const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
        
        // Display stats
        const statsHTML = `
            <div class="stat-card">
                <i class="fas fa-code-branch"></i>
                <div class="stat-content">
                    <h3>${userData.public_repos}</h3>
                    <p>Public Repositories</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-users"></i>
                <div class="stat-content">
                    <h3>${userData.followers}</h3>
                    <p>Followers</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-user-friends"></i>
                <div class="stat-content">
                    <h3>${userData.following}</h3>
                    <p>Following</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-star"></i>
                <div class="stat-content">
                    <h3>${totalStars}</h3>
                    <p>Total Stars</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-code-branch"></i>
                <div class="stat-content">
                    <h3>${totalForks}</h3>
                    <p>Total Forks</p>
                </div>
            </div>
        `;
        
        statsGrid.innerHTML = statsHTML;
        
        // Load language statistics
        loadLanguageStats(repos, languageStats);
        
        // Load contribution graph (using GitHub readme stats API)
        contributionGraph.innerHTML = `
            <div class="contribution-widget">
                <img src="https://ghchart.rshah.org/f5576c/and3rn3t" alt="GitHub Contribution Graph" />
            </div>
        `;
        
    } catch (error) {
        if (statsGrid) {
            statsGrid.innerHTML = '<p class="error-message">Unable to load GitHub statistics at this time.</p>';
        }
        if (contributionGraph) {
            contributionGraph.innerHTML = '';
        }
        if (languageStats) {
            languageStats.innerHTML = '';
        }
    }
}

// Load language statistics
function loadLanguageStats(repos, languageStats = null) {
    if (!languageStats) {
        languageStats = document.getElementById('main-language-stats');
    }

    // Count languages across all repos
    const languages = {};
    for (const repo of repos) {
        if (repo.language) {
            languages[repo.language] = (languages[repo.language] || 0) + 1;
        }
    }
    
    // Sort by count
    const sortedLanguages = Object.entries(languages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    
    const total = sortedLanguages.reduce((sum, [, count]) => sum + count, 0);
    
    // Language colors
    const languageColors = {
        'JavaScript': '#f1e05a',
        'Python': '#3572A5',
        'HTML': '#e34c26',
        'CSS': '#563d7c',
        'TypeScript': '#2b7489',
        'Java': '#b07219',
        'Go': '#00ADD8',
        'Ruby': '#701516',
        'PHP': '#4F5D95',
        'C++': '#f34b7d',
        'C': '#555555',
        'Shell': '#89e051',
        'C#': '#178600',
        'Swift': '#ffac45',
        'Kotlin': '#F18E33',
        'Rust': '#dea584'
    };
    
    if (!languageStats) {
        return;
    }
    
    languageStats.innerHTML = `
        <div class="language-bars">
            ${sortedLanguages.map(([language, count]) => {
                const percentage = ((count / total) * 100).toFixed(1);
                const color = languageColors[language] || '#8b949e';
                return `
                    <div class="language-item">
                        <div class="language-info">
                            <span class="language-name">
                                <span class="language-dot" style="background-color: ${color}"></span>
                                ${language}
                            </span>
                            <span class="language-percentage">${percentage}%</span>
                        </div>
                        <div class="language-bar">
                            <div class="language-bar-fill" style="width: ${percentage}%; background-color: ${color}"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Load recent GitHub activity
// Load GitHub profile badges
// Optimized GitHub badges loading with performance considerations
function loadGitHubBadges() {
    const badgesGrid = document.getElementById('badges-grid');
    if (!badgesGrid) return;
    
    // Add loading state
    badgesGrid.innerHTML = '<div class="loading-spinner"></div>';
    
    const badges = [
        {
            name: 'Profile Views',
            url: 'https://komarev.com/ghpvc/?username=and3rn3t&style=for-the-badge&color=blueviolet',
            alt: 'Profile views counter'
        },
        {
            name: 'GitHub Stats',
            url: 'https://github-readme-stats.vercel.app/api?username=and3rn3t&show_icons=true&theme=radical&hide_border=true',
            alt: 'GitHub stats card'
        },
        {
            name: 'Top Languages',
            url: 'https://github-readme-stats.vercel.app/api/top-langs/?username=and3rn3t&layout=compact&theme=radical&hide_border=true',
            alt: 'Top languages card'
        },
        {
            name: 'GitHub Streak',
            url: 'https://github-readme-streak-stats.herokuapp.com/?user=and3rn3t&theme=radical&hide_border=true',
            alt: 'GitHub streak stats'
        },
        {
            name: 'Contribution Graph',
            url: 'https://github-readme-activity-graph.vercel.app/graph?username=and3rn3t&theme=react-dark&hide_border=true',
            alt: 'Activity graph'
        },
        {
            name: 'GitHub Trophies',
            url: 'https://github-profile-trophy.vercel.app/?username=and3rn3t&theme=radical&no-frame=true&no-bg=false&margin-w=4',
            alt: 'GitHub trophies'
        }
    ];
    
    // Load badges with intersection observer for better performance
    const loadBadgeWithObserver = (badge, container) => {
        const badgeElement = document.createElement('div');
        badgeElement.className = 'badge-card';
        badgeElement.innerHTML = `
            <h3 class="badge-title">${badge.name}</h3>
            <div class="badge-image">
                <img data-src="${badge.url}" 
                     alt="${badge.alt}" 
                     loading="lazy"
                     class="badge-img loading-placeholder" 
                     width="400" 
                     height="200" />
            </div>
        `;
        container.appendChild(badgeElement);
        
        // Use performance optimizer to load image
        const img = badgeElement.querySelector('img');
        performanceOptimizer.intersectionObserver.observe(img);
    };
    
    // Clear loading state and add badges
    badgesGrid.innerHTML = '';
    for (const badge of badges) {
        loadBadgeWithObserver(badge, badgesGrid);
    }
}

// ========================================
// ADVANCED THEME MANAGER
// ========================================

class ThemeManager {
    constructor() {
        this.themes = ['light', 'dark'];
        this.currentTheme = this.getInitialTheme();
        this.followSystem = localStorage.getItem('followSystemTheme') === 'true';
        
        this.initializeElements();
        this.applyTheme(this.currentTheme, false);
        this.setupEventListeners();
        this.setupSystemThemeListener();
    }
    
    initializeElements() {
        this.toggle = document.getElementById('theme-toggle');
        this.menu = document.getElementById('theme-picker-menu');
        this.closeBtn = document.getElementById('theme-picker-close');
        this.options = document.querySelectorAll('.theme-option');
        this.systemCheckbox = document.getElementById('follow-system-theme');
        
        if (this.systemCheckbox) {
            this.systemCheckbox.checked = this.followSystem;
        }
    }
    
    getInitialTheme() {
        // Check if user wants to follow system preference
        if (localStorage.getItem('followSystemTheme') === 'true') {
            return this.getSystemTheme();
        }
        
        // Otherwise use saved preference or default to light
        return localStorage.getItem('theme') || 'light';
    }
    
    getSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }
    
    setupEventListeners() {
        // Toggle button opens/closes menu
        if (this.toggle) {
            this.toggle.addEventListener('click', () => {
                this.toggleMenu();
            });
        }
        
        // Close button
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                this.closeMenu();
            });
        }
        
        // Theme options
        this.options.forEach(option => {
            option.addEventListener('click', (e) => {
                const theme = e.currentTarget.dataset.theme;
                this.applyTheme(theme);
                this.closeMenu();
            });
        });
        
        // System preference checkbox
        if (this.systemCheckbox) {
            this.systemCheckbox.addEventListener('change', (e) => {
                this.followSystem = e.target.checked;
                localStorage.setItem('followSystemTheme', this.followSystem);
                
                if (this.followSystem) {
                    this.applyTheme(this.getSystemTheme());
                }
            });
        }
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.theme-picker-container')) {
                this.closeMenu();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Don't trigger if typing in input
            const isTyping = document.activeElement.tagName === 'INPUT' || 
                           document.activeElement.tagName === 'TEXTAREA';
            
            if (isTyping) return;
            
            // Press 'T' to toggle theme menu
            if (e.key === 't' || e.key === 'T') {
                e.preventDefault();
                this.toggleMenu();
            }
            
            // Press 'Escape' to close menu
            if (e.key === 'Escape' && this.menu?.classList.contains('active')) {
                this.closeMenu();
            }
        });
    }
    
    setupSystemThemeListener() {
        if (!window.matchMedia) return;
        
        const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        darkModeQuery.addEventListener('change', (e) => {
            if (this.followSystem) {
                const theme = e.matches ? 'dark' : 'light';
                this.applyTheme(theme, false);
            }
        });
    }
    
    toggleMenu() {
        if (this.menu) {
            this.menu.classList.toggle('active');
        }
    }
    
    closeMenu() {
        if (this.menu) {
            this.menu.classList.remove('active');
        }
    }
    
    applyTheme(theme, savePreference = true) {
        // Remove all theme classes
        document.body.classList.remove('dark-theme');
        
        // Apply new theme class (except for light which is default)
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        }
        
        this.currentTheme = theme;
        
        // Save preference
        if (savePreference) {
            localStorage.setItem('theme', theme);
        }
        
        // Update active state on options
        this.options.forEach(option => {
            if (option.dataset.theme === theme) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
        
        // Trigger custom event for other components
        document.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme, followSystem: this.followSystem } 
        }));
        
        // Update meta theme-color
        this.updateMetaThemeColor(theme);
    }
    
    updateMetaThemeColor(theme) {
        let metaTheme = document.querySelector('meta[name="theme-color"]');
        if (!metaTheme) {
            metaTheme = document.createElement('meta');
            metaTheme.name = 'theme-color';
            document.head.appendChild(metaTheme);
        }
        
        const colors = {
            'light': '#fefefe',
            'dark': '#1a0e0a'
        };
        
        metaTheme.content = colors[theme] || colors.light;
    }
}

// Initialize theme manager
let themeManager;

function initThemeManager() {
    try {
        themeManager = new ThemeManager();
    } catch (error) {
        debug.error('[Theme] Failed to initialize theme manager:', error);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeManager);
} else {
    initThemeManager();
}

// Add stagger animation to project cards
function animateProjectCards() {
    const cards = document.querySelectorAll('.project-card');
    let index = 0;
    for (const card of cards) {
        card.style.animationDelay = `${index * 0.1}s`;
        card.classList.add('fade-in-up');
        index++;
    }
}

// Enhanced keyboard navigation
document.addEventListener('keydown', function(e) {
    // Only trigger shortcuts when not typing in input fields
    const isTyping = document.activeElement.tagName === 'INPUT' || 
                     document.activeElement.tagName === 'TEXTAREA' ||
                     document.activeElement.isContentEditable;
    
    if (isTyping) return;
    
    // Press 'T' to toggle theme
    if (e.key === 't' || e.key === 'T') {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.click();
        }
    }
    
    // Press 'A' to jump to analytics section
    if (e.key === 'a' || e.key === 'A') {
        const analyticsSection = document.getElementById('analytics');
        if (analyticsSection) {
            analyticsSection.scrollIntoView({ behavior: 'smooth' });
            if (globalThis.portfolioAnalytics) {
                globalThis.portfolioAnalytics.trackEvent('keyboard_shortcut_analytics');
            }
        }
    }
    
    // Press 'E' to export analytics data
    if (e.key === 'e' || e.key === 'E') {
        if (globalThis.portfolioAnalytics) {
            globalThis.portfolioAnalytics.exportData();
            globalThis.portfolioAnalytics.trackEvent('keyboard_shortcut_export');
        }
    }
    
    // Press 'D' to toggle analytics dashboard visibility
    if (e.key === 'd' || e.key === 'D') {
        const analyticsMetrics = document.querySelector('.live-analytics-metrics');
        if (analyticsMetrics) {
            analyticsMetrics.style.display = analyticsMetrics.style.display === 'none' ? 'grid' : 'none';
            if (globalThis.portfolioAnalytics) {
                globalThis.portfolioAnalytics.trackEvent('keyboard_shortcut_toggle_dashboard');
            }
        }
    }
});

// Add print functionality (Ctrl/Cmd + P for resume-style print)
globalThis.addEventListener('beforeprint', function() {
    document.body.classList.add('printing');
});

globalThis.addEventListener('afterprint', function() {
    document.body.classList.remove('printing');
});

// Enhanced performance utilities
function addLoadingClasses() {
    document.body.classList.add('loaded');
}

// Initialize critical loading optimizations
function initCriticalOptimizations() {
    // Remove loading state when page is ready
    if (document.readyState === 'complete') {
        addLoadingClasses();
    } else {
        globalThis.addEventListener('load', addLoadingClasses);
    }

    // Optimize third-party script loading
    optimizeThirdPartyScripts();
}

// Optimize third-party script loading
function optimizeThirdPartyScripts() {
    // Defer non-critical scripts until interaction
    const deferredScripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
    ];

    // Load scripts on first user interaction
    const loadDeferredScripts = () => {
        for (const scriptSrc of deferredScripts) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = scriptSrc;
            document.head.appendChild(link);
        }
    };

    // Load on first interaction
    for (const event of ['mousedown', 'touchstart', 'keydown', 'scroll']) {
        document.addEventListener(event, loadDeferredScripts, { once: true, passive: true });
    }
}

    // Initialize critical optimizations immediately
initCriticalOptimizations();


// Performance Budget Monitor
class PerformanceBudget {
    constructor() {
        this.budgets = {
            loadTime: 3000, // 3 seconds
            firstContentfulPaint: 1800, // 1.8 seconds
            largestContentfulPaint: 2500, // 2.5 seconds
            cumulativeLayoutShift: 0.1,
            totalBlockingTime: 300, // 300ms
            firstInputDelay: 100 // 100ms
        };
        this.violations = [];
        this.init();
    }

    checkBudget(metric, value) {
        const budget = this.budgets[metric];
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
                overage: `+${(value - budget).toFixed(2)}${metric.includes('Time') || metric.includes('Paint') ? 'ms' : ''}`
            });
        }
        return isWithinBudget;
    }

    generateReport() {
        const report = {
            totalViolations: this.violations.length,
            violations: this.violations,
            recommendations: this.getRecommendations()
        };
        
        return report;
    }

    getRecommendations() {
        const recommendations = [];
        
        if (this.violations.some(v => v.metric === 'loadTime')) {
            recommendations.push('Consider implementing code splitting and lazy loading');
        }
        if (this.violations.some(v => v.metric === 'firstContentfulPaint')) {
            recommendations.push('Optimize critical rendering path and inline critical CSS');
        }
        if (this.violations.some(v => v.metric === 'largestContentfulPaint')) {
            recommendations.push('Optimize images and defer non-critical resources');
        }
        if (this.violations.some(v => v.metric === 'cumulativeLayoutShift')) {
            recommendations.push('Add size attributes to images and reserve space for dynamic content');
        }
        
        return recommendations;
    }

    init() {
        // Monitor performance metrics
        globalThis.addEventListener('load', () => {
            setTimeout(() => {
                // Check load time
                const navigation = performance.getEntriesByType('navigation')[0];
                if (navigation) {
                    this.checkBudget('loadTime', navigation.loadEventEnd - navigation.loadEventStart);
                }

                // Generate final report
                setTimeout(() => this.generateReport(), 2000);
            }, 1000);
        });
    }
}

// Resource Loading Optimizer  
class ResourceOptimizer {
    constructor() {
        this.criticalResources = [
            'styles.css',
            'script.js',
            'https://fonts.googleapis.com/css2'
        ];
        this.init();
    }

    // Implement resource loading strategies
    optimizeResourceLoading() {
        // Implement intelligent resource loading
        this.preloadCriticalResources();
        this.deferNonCriticalResources();
        this.optimizeImageLoading();
    }

    preloadCriticalResources() {
        for (const resource of this.criticalResources) {
            if (document.querySelector(`link[href*="${resource}"]`)) continue;
            
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = resource;
            link.as = resource.endsWith('.css') ? 'style' : 'script';
            document.head.appendChild(link);
        }
    }

    deferNonCriticalResources() {
        // Defer third-party analytics, social widgets, etc.
        const deferredScripts = document.querySelectorAll('script[data-defer]');
        for (const script of deferredScripts) {
            const newScript = document.createElement('script');
            newScript.src = script.dataset.src;
            newScript.defer = true;
            document.head.appendChild(newScript);
        }
    }

    optimizeImageLoading() {
        // Add loading="lazy" to images below the fold
        const images = document.querySelectorAll('img:not([loading])');
        for (const img of images) {
            const rect = img.getBoundingClientRect();
            if (rect.top > window.innerHeight) {
                img.loading = 'lazy';
            }
        }
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.optimizeResourceLoading());
        } else {
            this.optimizeResourceLoading();
        }
    }
}

// Initialize performance monitoring
const performanceBudget = new PerformanceBudget();
const resourceOptimizer = new ResourceOptimizer();// Add smooth scroll behavior for all internal links
document.addEventListener('DOMContentLoaded', function() {
    for (const anchor of document.querySelectorAll('a[href^="#"]')) {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = target.offsetTop - navHeight;
                globalThis.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    }
});

// Analytics event tracking with Cloudflare Web Analytics support
function trackEvent(category, action, label, value) {
    // Cloudflare Web Analytics automatic tracking
    // Manual events can be tracked if needed in the future
    
    // Console logging for development
    
    // Send custom event data if Cloudflare beacon is available
    if (typeof globalThis.cf_observer !== 'undefined') {
        // Custom events would go here when Cloudflare adds support
    }
    
    // Track performance events
    if (category === 'Performance' && globalThis.performance) {
        const perfData = {
            category,
            action,
            label,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            url: globalThis.location.href
        };
    }
}

// Track project card clicks
document.addEventListener('click', function(e) {
    const projectLink = e.target.closest('.project-link');
    if (projectLink) {
        const projectCard = projectLink.closest('.project-card');
        const projectTitle = projectCard?.querySelector('.project-title')?.textContent;
        trackEvent('Project', 'Click', projectTitle);
    }
});

// Add skills matrix visualization
async function loadSkillsMatrix() {
    try {
        const projectsDataResponse = await fetch('projects-data.json');
        const projectsData = await projectsDataResponse.json();
        
        if (!projectsData.skills) return;
        
        const skillsSection = document.querySelector('#skills .skills-grid');
        if (!skillsSection) return;
        
        // Add a skills matrix section after the basic skills
        const skillsMatrix = document.createElement('div');
        skillsMatrix.className = 'skills-matrix';
        skillsMatrix.innerHTML = `
            <h3 class="subsection-title">Proficiency Levels</h3>
            <div class="skills-matrix-grid">
                ${Object.entries(projectsData.skills.languages).map(([lang, data]) => `
                    <div class="skill-matrix-item">
                        <div class="skill-matrix-header">
                            <span class="skill-name">${lang}</span>
                            <span class="skill-level-label">${data.level}</span>
                        </div>
                        <div class="skill-level-indicator">
                            <div class="skill-level-bar">
                                <div class="skill-level-fill" style="width: ${getLevelPercentage(data.level)}%"></div>
                            </div>
                        </div>
                        <div class="skill-experience">${data.years} years experience</div>
                    </div>
                `).join('')}
            </div>
        `;
        
        skillsSection.parentElement.appendChild(skillsMatrix);
    } catch (error) {
    }
}

function getLevelPercentage(level) {
    const levels = {
        'Beginner': 25,
        'Intermediate': 50,
        'Advanced': 85,
        'Expert': 100
    };
    return levels[level] || 50;
}

// Initialize skills matrix
document.addEventListener('DOMContentLoaded', loadSkillsMatrix);

// Add back to top button
function initBackToTop() {
    const backToTopBtn = document.createElement('button');
    backToTopBtn.className = 'back-to-top';
    backToTopBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    backToTopBtn.setAttribute('aria-label', 'Back to top');
    document.body.appendChild(backToTopBtn);
    
    // Show/hide on scroll
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    });
    
    // Scroll to top on click
    backToTopBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initBackToTop();
});

// Add visitor counter (privacy-friendly, localStorage based)
function updateVisitorCount() {
    const visitCountElement = document.querySelector('.visit-count');
    if (!visitCountElement) return;
    
    let visits = Number.parseInt(localStorage.getItem('visitCount') || '0', 10);
    visits++;
    localStorage.setItem('visitCount', visits.toString());
    
    visitCountElement.textContent = `Visit #${visits}`;
}

// Add GitHub contribution calendar
async function loadContributionCalendar() {
    const calendarContainer = document.getElementById('contribution-graph');
    if (!calendarContainer) return;
    
    // Use the existing contribution graph implementation
    // This is already handled in the existing code
}

// Performance monitoring
if ('PerformanceObserver' in globalThis) {
    const perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') {
            }
        }
    });
    
    try {
        perfObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (error) {
    }
}

// Service Worker registration for PWA support (future enhancement)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function() {
        // Uncomment when service worker is ready
        // navigator.serviceWorker.register('/sw.js');
    });
}

// Backup GitHub stats loader to ensure reliable loading
function backupGitHubStatsLoader() {
    const statsGrid = document.getElementById('stats-grid');
    
    if (statsGrid && statsGrid.innerHTML.includes('Loading stats...')) {
        // Main loader hasn't populated yet, use backup
        loadGitHubStats().catch(error => {
            if (statsGrid) {
                statsGrid.innerHTML = '<div style="color: #ff6b35; padding: 20px;">Unable to load GitHub statistics</div>';
            }
        });
    }
}

// Backup loader runs after main system has had time to load
setTimeout(backupGitHubStatsLoader, 2000);

// Enhanced Contact Form Functionality with reCAPTCHA and Analytics
class ContactFormManager {
    constructor() {
        this.form = document.getElementById('contact-form');
        this.submitButton = document.getElementById('submit-button');
        this.formStatus = document.getElementById('form-status');
        this.recaptchaContainer = document.getElementById('recaptcha-container');
        this.recaptchaWidgetId = null;
        this.isRecaptchaReady = false;
        
        // Configuration
        this.config = {
            maxRetries: 3,
            retryDelay: 1000,
            enableAnalytics: true,
            enableRecaptcha: typeof grecaptcha !== 'undefined'
        };
        
        if (this.form) {
            this.initializeForm();
            this.initializeRecaptcha();
        }
    }
    
    initializeForm() {
        // Add form validation
        this.form.addEventListener('submit', this.handleSubmit.bind(this));
        
        // Add real-time validation
        const inputs = this.form.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearFieldError(input));
            
            // Track form interactions for analytics
            if (this.config.enableAnalytics) {
                input.addEventListener('focus', () => this.trackEvent('form_field_focus', input.name));
            }
        });
        
        // Track form starts
        if (this.config.enableAnalytics) {
            this.trackEvent('form_view');
        }
    }

    async initializeRecaptcha() {
        if (!this.config.enableRecaptcha) {
            return;
        }
        
        // Wait for reCAPTCHA to be ready
        if (typeof grecaptcha === 'undefined') {
            setTimeout(() => this.initializeRecaptcha(), 500);
            return;
        }
        
        try {
            await new Promise(resolve => {
                grecaptcha.ready(resolve);
            });
            
            // For demo purposes - you'll need to replace with your actual site key
            const siteKey = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'; // Test key
            
            this.recaptchaWidgetId = grecaptcha.render(this.recaptchaContainer, {
                sitekey: siteKey,
                theme: document.body.classList.contains('dark-theme') ? 'dark' : 'light',
                callback: () => {
                    this.isRecaptchaReady = true;
                }
            });
            
        } catch (error) {
            this.config.enableRecaptcha = false;
        }
    }

    trackEvent(eventName, fieldName = null) {
        if (!this.config.enableAnalytics) return;
        
        // Track with console for now - integrate with your analytics service
        
        // Example: Google Analytics 4 tracking
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, {
                form_name: 'contact_form',
                field_name: fieldName
            });
        }
    }
    
    async handleSubmit(event) {
        event.preventDefault();
        
        // Validate all fields
        if (!this.validateForm()) {
            this.showStatus('Please correct the errors above.', 'error');
            this.trackEvent('form_validation_failed');
            return;
        }
        
        // Check reCAPTCHA if enabled
        if (this.config.enableRecaptcha && !this.isRecaptchaReady) {
            this.showStatus('Please complete the security verification.', 'error');
            return;
        }
        
        // Show loading state
        this.setLoadingState(true);
        this.showStatus('Sending message...', 'info');
        this.trackEvent('form_submit_started');
        
        try {
            await this.submitWithRetry();
        } catch (error) {
            this.showStatus(
                'There was a problem sending your message. Please try again or contact me directly at contact@matthewanderson.dev',
                'error'
            );
            this.trackEvent('form_submit_failed');
        } finally {
            this.setLoadingState(false);
        }
    }

    async submitWithRetry(attempt = 1) {
        const maxAttempts = this.config.maxRetries;
        
        try {
            const formData = new FormData(this.form);
            
            // Add reCAPTCHA token if available
            if (this.config.enableRecaptcha && this.recaptchaWidgetId !== null) {
                const recaptchaResponse = grecaptcha.getResponse(this.recaptchaWidgetId);
                if (recaptchaResponse) {
                    formData.append('g-recaptcha-response', recaptchaResponse);
                }
            }
            
            // Submit to Formspree
            const response = await fetch(this.form.action, {
                method: 'POST',
                body: formData,
                headers: {
                    Accept: 'application/json'
                }
            });
            
            if (response.ok) {
                this.showStatus('✅ Message sent successfully! I\'ll get back to you soon.', 'success');
                this.form.reset();
                this.trackEvent('form_submit_success');
                
                // Reset reCAPTCHA if enabled
                if (this.config.enableRecaptcha && this.recaptchaWidgetId !== null) {
                    grecaptcha.reset(this.recaptchaWidgetId);
                    this.isRecaptchaReady = false;
                }
                
                return; // Success - no retry needed
            } else {
                // Parse error details from Formspree
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || `Server error: ${response.status}`;
                throw new Error(errorMessage);
            }
            
        } catch (error) {
            
            // Don't retry for certain errors
            if (error.message.includes('403') || error.message.includes('Invalid email')) {
                throw error; // Permanent error
            }
            
            // Retry if attempts remaining
            if (attempt < maxAttempts) {
                const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
                this.showStatus(`Retrying... (${attempt}/${maxAttempts})`, 'info');
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.submitWithRetry(attempt + 1);
            }
            
            throw error; // All attempts exhausted
        }
    }
    
    validateForm() {
        const fields = ['name', 'email', 'subject', 'message'];
        let isValid = true;
        
        fields.forEach(fieldName => {
            const field = document.getElementById(fieldName);
            if (!this.validateField(field)) {
                isValid = false;
            }
        });
        
        return isValid;
    }
    
    validateField(field) {
        const value = field.value.trim();
        const fieldName = field.name;
        let errorMessage = '';
        
        // Skip honeypot field
        if (fieldName === '_gotcha') return true;
        
        // Required field validation
        if (!value) {
            errorMessage = `${this.getFieldLabel(fieldName)} is required.`;
        } else if (fieldName === 'email') {
            // Enhanced email validation
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(value)) {
                errorMessage = 'Please enter a valid email address (e.g., user@example.com).';
            } else if (value.length > 254) {
                errorMessage = 'Email address is too long.';
            }
        } else if (fieldName === 'name') {
            if (value.length < 2) {
                errorMessage = 'Name must be at least 2 characters long.';
            } else if (value.length > 100) {
                errorMessage = 'Name is too long (max 100 characters).';
            } else if (!/^[a-zA-Z\s\-'.]+$/.test(value)) {
                errorMessage = 'Name can only contain letters, spaces, hyphens, and apostrophes.';
            }
        } else if (fieldName === 'subject') {
            if (value.length < 3) {
                errorMessage = 'Subject must be at least 3 characters long.';
            } else if (value.length > 200) {
                errorMessage = 'Subject is too long (max 200 characters).';
            }
        } else if (fieldName === 'message') {
            if (value.length < 10) {
                errorMessage = 'Message must be at least 10 characters long.';
            } else if (value.length > 5000) {
                errorMessage = 'Message is too long (max 5000 characters).';
            }
        }
        
        this.showFieldError(field, errorMessage);
        return !errorMessage;
    }
    
    clearFieldError(field) {
        field.classList.remove('error');
        const errorElement = document.getElementById(`${field.name}-error`);
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.classList.remove('show');
        }
    }
    
    showFieldError(field, message) {
        if (message) {
            field.classList.add('error');
            const errorElement = document.getElementById(`${field.name}-error`);
            if (errorElement) {
                errorElement.textContent = message;
                errorElement.classList.add('show');
            }
        } else {
            this.clearFieldError(field);
        }
    }
    
    getFieldLabel(fieldName) {
        const labels = {
            name: 'Name',
            email: 'Email',
            subject: 'Subject',
            message: 'Message'
        };
        return labels[fieldName] || fieldName;
    }
    
    setLoadingState(loading) {
        if (loading) {
            this.submitButton.classList.add('loading');
            this.submitButton.disabled = true;
        } else {
            this.submitButton.classList.remove('loading');
            this.submitButton.disabled = false;
        }
    }
    
    showStatus(message, type) {
        this.formStatus.textContent = message;
        this.formStatus.className = `form-status ${type}`;
        this.formStatus.style.display = 'block';
        
        // Announce to screen readers
        this.formStatus.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        
        // Auto-hide success and info messages
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                this.formStatus.style.display = 'none';
            }, type === 'success' ? 8000 : 5000);
        }
    }

    // Update reCAPTCHA theme when page theme changes
    updateRecaptchaTheme() {
        if (this.config.enableRecaptcha && this.recaptchaWidgetId !== null) {
            const isDark = document.body.classList.contains('dark-theme');
            // Note: reCAPTCHA theme can't be changed after initialization
            // This is a placeholder for future enhancement
        }
    }
}

// Initialize contact form when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const contactForm = new ContactFormManager();
    
    // Listen for theme changes to update reCAPTCHA
    document.addEventListener('themeChanged', () => {
        contactForm.updateRecaptchaTheme();
    });
});

// Force hero background color to prevent any override issues (theme-aware)
function forceHeroBackground() {
    const heroElement = document.querySelector('.hero, #home, section.hero');
    if (heroElement) {
        // Use CSS variable for theme-aware gradient
        heroElement.style.setProperty('background', 'var(--gradient-primary)', 'important');
        heroElement.style.setProperty('background-image', 'var(--gradient-primary)', 'important');
    }
}

// Apply hero background immediately and after DOM loads
forceHeroBackground();
document.addEventListener('DOMContentLoaded', forceHeroBackground);

// Listen for theme changes and reapply hero background
document.addEventListener('themeChanged', function(e) {
    forceHeroBackground();
});

// Advanced Mobile Optimization System
class MobileOptimizationSystem {
    constructor() {
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchEndX = 0;
        this.touchEndY = 0;
        this.isScrolling = false;
        this.swipeThreshold = 50;
        this.pullToRefreshThreshold = 100;
        this.isPullToRefreshEnabled = false;
        
        this.init();
    }
    
    init() {
        this.detectMobile();
        this.setupTouchGestures();
        this.setupSwipeNavigation();
        this.enhanceMobileNavigation();
        this.setupPullToRefresh();
        this.optimizeTouchTargets();
        this.setupMobileScrolling();
    }
    
    detectMobile() {
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.isTouch = 'ontouchstart' in globalThis || navigator.maxTouchPoints > 0;
        
        if (this.isMobile || this.isTouch) {
            document.body.classList.add('mobile-device', 'touch-device');
        }
    }
    
    setupTouchGestures() {
        // Add touch feedback to interactive elements
        const touchElements = document.querySelectorAll('.btn, .project-card, .skill-category, .nav-links a');
        
        touchElements.forEach(element => {
            element.classList.add('touch-feedback');
            
            element.addEventListener('touchstart', (e) => {
                element.classList.add('touched');
                this.handleTouchStart(e);
            }, { passive: true });
            
            element.addEventListener('touchend', () => {
                setTimeout(() => {
                    element.classList.remove('touched');
                }, 300);
                this.handleTouchEnd();
            }, { passive: true });
            
            element.addEventListener('touchmove', (e) => {
                this.handleTouchMove(e);
            }, { passive: true });
        });
    }
    
    handleTouchStart(e) {
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.isScrolling = false;
    }
    
    handleTouchMove(e) {
        if (!this.touchStartX || !this.touchStartY) return;
        
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - this.touchStartX);
        const deltaY = Math.abs(touch.clientY - this.touchStartY);
        
        // Determine if user is scrolling vertically
        if (deltaY > deltaX) {
            this.isScrolling = true;
        }
    }
    
    handleTouchEnd() {
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isScrolling = false;
    }
    
    setupSwipeNavigation() {
        const projectsContainer = document.querySelector('.projects-grid');
        if (!projectsContainer) return;
        
        let currentIndex = 0;
        const projects = projectsContainer.querySelectorAll('.project-card');
        
        // Add swipe indicators for mobile
        if (this.isMobile && projects.length > 1) {
            this.createSwipeIndicators(projectsContainer, projects.length);
        }
        
        projectsContainer.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            this.touchStartX = touch.clientX;
        }, { passive: true });
        
        projectsContainer.addEventListener('touchend', (e) => {
            const touch = e.changedTouches[0];
            this.touchEndX = touch.clientX;
            
            const swipeDistance = this.touchStartX - this.touchEndX;
            
            if (Math.abs(swipeDistance) > this.swipeThreshold && !this.isScrolling) {
                if (swipeDistance > 0 && currentIndex < projects.length - 1) {
                    // Swipe left - next project
                    currentIndex++;
                    this.scrollToProject(projectsContainer, currentIndex);
                } else if (swipeDistance < 0 && currentIndex > 0) {
                    // Swipe right - previous project
                    currentIndex--;
                    this.scrollToProject(projectsContainer, currentIndex);
                }
                
                this.updateSwipeIndicators(currentIndex);
                this.showGestureFeedback(swipeDistance > 0 ? 'Next Project' : 'Previous Project');
            }
        }, { passive: true });
    }
    
    createSwipeIndicators(container, count) {
        const indicators = document.createElement('div');
        indicators.className = 'swipe-indicators';
        
        for (let i = 0; i < count; i++) {
            const indicator = document.createElement('div');
            indicator.className = 'swipe-indicator';
            if (i === 0) indicator.classList.add('active');
            
            indicator.addEventListener('click', () => {
                this.scrollToProject(container, i);
                this.updateSwipeIndicators(i);
            });
            
            indicators.appendChild(indicator);
        }
        
        container.parentNode.insertBefore(indicators, container.nextSibling);
    }
    
    updateSwipeIndicators(activeIndex) {
        const indicators = document.querySelectorAll('.swipe-indicator');
        indicators.forEach((indicator, index) => {
            indicator.classList.toggle('active', index === activeIndex);
        });
    }
    
    scrollToProject(container, index) {
        const project = container.children[index];
        if (project) {
            project.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }
    
    enhanceMobileNavigation() {
        const hamburger = document.querySelector('.hamburger');
        const navLinks = document.querySelector('.nav-links');
        
        if (!hamburger || !navLinks) return;
        
        // Create mobile menu overlay
        const overlay = document.createElement('div');
        overlay.className = 'mobile-menu-overlay';
        document.body.appendChild(overlay);
        
        // Enhanced hamburger functionality
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            overlay.classList.toggle('active');
            hamburger.classList.toggle('active');
            
            // Prevent body scroll when menu is open
            document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
        });
        
        // Close menu when clicking overlay
        overlay.addEventListener('click', () => {
            navLinks.classList.remove('active');
            overlay.classList.remove('active');
            hamburger.classList.remove('active');
            document.body.style.overflow = '';
        });
        
        // Close menu when clicking nav link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                overlay.classList.remove('active');
                hamburger.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }
    
    setupPullToRefresh() {
        if (!this.isMobile) return;
        
        let startY = 0;
        let pullDistance = 0;
        let isPulling = false;
        
        // Create pull-to-refresh indicator
        const pullIndicator = document.createElement('div');
        pullIndicator.className = 'pull-to-refresh';
        pullIndicator.innerHTML = '<span class="icon">↻</span> Pull to refresh';
        document.body.insertBefore(pullIndicator, document.body.firstChild);
        
        document.addEventListener('touchstart', (e) => {
            if (globalThis.scrollY === 0) {
                startY = e.touches[0].clientY;
                isPulling = true;
            }
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            
            pullDistance = e.touches[0].clientY - startY;
            
            if (pullDistance > 0) {
                pullIndicator.style.transform = `translateX(-50%) translateY(${Math.min(pullDistance / 2, 60)}px)`;
                pullIndicator.classList.toggle('visible', pullDistance > 50);
            }
        }, { passive: true });
        
        document.addEventListener('touchend', () => {
            if (isPulling && pullDistance > this.pullToRefreshThreshold) {
                this.performRefresh();
            }
            
            pullIndicator.style.transform = 'translateX(-50%)';
            pullIndicator.classList.remove('visible');
            isPulling = false;
            pullDistance = 0;
        }, { passive: true });
    }
    
    performRefresh() {
        this.showGestureFeedback('Refreshing content...');
        
        // Reload GitHub data
        if (typeof loadGitHubProfile === 'function') {
            loadGitHubProfile();
        }
        if (typeof loadRepositories === 'function') {
            loadRepositories();
        }
        if (typeof loadGitHubStats === 'function') {
            loadGitHubStats();
        }
        
        setTimeout(() => {
            this.showGestureFeedback('Content refreshed!');
        }, 1500);
    }
    
    optimizeTouchTargets() {
        // Enhance touch targets for small elements
        const smallElements = document.querySelectorAll('.skill-tag, .tech-tag, .social-icon');
        
        smallElements.forEach(element => {
            element.classList.add('touch-target');
            
            // Add visual feedback for touches
            element.addEventListener('touchstart', () => {
                element.style.transform = 'scale(0.95)';
            }, { passive: true });
            
            element.addEventListener('touchend', () => {
                element.style.transform = '';
            }, { passive: true });
        });
        
        // Make buttons more touch-friendly
        const buttons = document.querySelectorAll('.btn, .cta-button');
        buttons.forEach(button => {
            button.classList.add('btn-touch');
        });
    }
    
    setupMobileScrolling() {
        // Smooth scroll behavior for mobile
        if (this.isMobile) {
            document.documentElement.style.scrollBehavior = 'smooth';
        }
        
        // Optimize scroll performance
        let ticking = false;
        
        const updateScrollPosition = () => {
            // Update scroll-based animations
            if (typeof updateScrollProgress === 'function') {
                updateScrollProgress();
            }
            ticking = false;
        };
        
        globalThis.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(updateScrollPosition);
                ticking = true;
            }
        }, { passive: true });
    }
    
    showGestureFeedback(message) {
        let feedback = document.querySelector('.gesture-feedback');
        
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.className = 'gesture-feedback';
            document.body.appendChild(feedback);
        }
        
        feedback.textContent = message;
        feedback.classList.add('show');
        
        setTimeout(() => {
            feedback.classList.remove('show');
        }, 2000);
    }
    
    // Enhanced haptic feedback (if supported)
    triggerHaptic(intensity = 'medium') {
        if ('vibrate' in navigator) {
            const patterns = {
                light: [10],
                medium: [20],
                heavy: [30]
            };
            navigator.vibrate(patterns[intensity] || patterns.medium);
        }
    }
    
    // Performance monitoring for mobile
    monitorMobilePerformance() {
        if ('performance' in globalThis) {
            const navigation = performance.getEntriesByType('navigation')[0];
            if (navigation) {
                debug.log('[Mobile] Performance metrics:', {
                    'DOM Content Loaded': navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                    'Load Complete': navigation.loadEventEnd - navigation.loadEventStart,
                    'First Paint': performance.getEntriesByName('first-paint')[0]?.startTime || 'Not available'
                });
            }
        }
    }
}

// Advanced Portfolio Analytics System
class PortfolioAnalyticsSystem {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.userId = this.getUserId();
        this.startTime = Date.now();
        this.events = [];
        this.performanceMetrics = {};
        this.userBehavior = {
            scrollDepth: 0,
            timeOnSections: {},
            interactions: 0,
            currentSection: 'hero'
        };
        
        this.init();
    }
    
    init() {
        this.setupPerformanceMonitoring();
        this.setupUserBehaviorTracking();
        this.setupCustomEventTracking();
        this.setupScrollAnalytics();
        this.setupEngagementMetrics();
        this.setupErrorTracking();
        this.createAnalyticsDashboard();
        
        // Initialize session
        this.trackEvent('session_start', {
            sessionId: this.sessionId,
            userId: this.userId,
            timestamp: this.startTime,
            userAgent: navigator.userAgent,
            viewport: `${globalThis.innerWidth}x${globalThis.innerHeight}`,
            referrer: document.referrer || 'direct'
        });
    }
    
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    getUserId() {
        let userId = localStorage.getItem('portfolio_user_id');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('portfolio_user_id', userId);
        }
        return userId;
    }
    
    setupPerformanceMonitoring() {
        // Core Web Vitals monitoring
        if ('PerformanceObserver' in globalThis) {
            // Largest Contentful Paint
            new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                this.performanceMetrics.lcp = lastEntry.startTime;
                this.trackEvent('performance_lcp', { value: lastEntry.startTime });
            }).observe({ entryTypes: ['largest-contentful-paint'] });
            
            // First Input Delay
            new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach((entry) => {
                    this.performanceMetrics.fid = entry.processingStart - entry.startTime;
                    this.trackEvent('performance_fid', { value: entry.processingStart - entry.startTime });
                });
            }).observe({ entryTypes: ['first-input'] });
            
            // Cumulative Layout Shift
            let clsValue = 0;
            new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach((entry) => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                    }
                });
                this.performanceMetrics.cls = clsValue;
                this.trackEvent('performance_cls', { value: clsValue });
            }).observe({ entryTypes: ['layout-shift'] });
        }
        
        // Navigation timing
        globalThis.addEventListener('load', () => {
            setTimeout(() => {
                const navigation = performance.getEntriesByType('navigation')[0];
                if (navigation) {
                    this.performanceMetrics.loadTime = navigation.loadEventEnd - navigation.loadEventStart;
                    this.performanceMetrics.domContentLoaded = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
                    this.performanceMetrics.ttfb = navigation.responseStart - navigation.requestStart;
                    
                    this.trackEvent('performance_navigation', {
                        loadTime: this.performanceMetrics.loadTime,
                        domContentLoaded: this.performanceMetrics.domContentLoaded,
                        ttfb: this.performanceMetrics.ttfb
                    });
                }
            }, 100);
        });
    }
    
    setupUserBehaviorTracking() {
        // Scroll depth tracking
        let maxScrollDepth = 0;
        const updateScrollDepth = () => {
            const scrollPercent = (globalThis.scrollY / (document.body.scrollHeight - globalThis.innerHeight)) * 100;
            if (scrollPercent > maxScrollDepth) {
                maxScrollDepth = scrollPercent;
                this.userBehavior.scrollDepth = maxScrollDepth;
                
                // Track milestone scroll depths
                if (maxScrollDepth > 25 && !this.scrollMilestones?.milestone25) {
                    this.scrollMilestones = { ...this.scrollMilestones, milestone25: true };
                    this.trackEvent('scroll_depth_25');
                }
                if (maxScrollDepth > 50 && !this.scrollMilestones?.milestone50) {
                    this.scrollMilestones = { ...this.scrollMilestones, milestone50: true };
                    this.trackEvent('scroll_depth_50');
                }
                if (maxScrollDepth > 75 && !this.scrollMilestones?.milestone75) {
                    this.scrollMilestones = { ...this.scrollMilestones, milestone75: true };
                    this.trackEvent('scroll_depth_75');
                }
                if (maxScrollDepth > 90 && !this.scrollMilestones?.milestone90) {
                    this.scrollMilestones = { ...this.scrollMilestones, milestone90: true };
                    this.trackEvent('scroll_depth_90');
                }
            }
        };
        
        let scrollTimeout;
        globalThis.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(updateScrollDepth, 100);
        }, { passive: true });
        
        // Section timing
        const observeSection = (sectionId) => {
            const section = document.getElementById(sectionId);
            if (!section) return;
            
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const now = Date.now();
                        this.userBehavior.currentSection = sectionId;
                        this.sectionStartTime = now;
                        this.trackEvent('section_view', { section: sectionId, timestamp: now });
                    } else if (this.sectionStartTime) {
                        const timeSpent = Date.now() - this.sectionStartTime;
                        this.userBehavior.timeOnSections[sectionId] = 
                            (this.userBehavior.timeOnSections[sectionId] || 0) + timeSpent;
                        this.trackEvent('section_time', { section: sectionId, duration: timeSpent });
                    }
                });
            }, { threshold: 0.5 });
            
            observer.observe(section);
        };
        
        // Observe all sections
        ['hero', 'about', 'github-stats', 'projects', 'analytics', 'skills', 'contact'].forEach(observeSection);
    }
    
    setupCustomEventTracking() {
        // Project interactions
        document.addEventListener('click', (e) => {
            if (e.target.closest('.project-card')) {
                const projectCard = e.target.closest('.project-card');
                const projectName = projectCard.querySelector('h3')?.textContent || 'unknown';
                this.trackEvent('project_click', { project: projectName });
                this.userBehavior.interactions++;
            }
            
            // Navigation clicks
            if (e.target.closest('.nav-link')) {
                const navLink = e.target.closest('.nav-link');
                const section = navLink.getAttribute('href')?.substring(1) || 'unknown';
                this.trackEvent('navigation_click', { section });
            }
            
            // Contact form interactions
            if (e.target.closest('#contact-form')) {
                this.trackEvent('contact_form_interaction');
            }
            
            // Theme toggle
            if (e.target.closest('.theme-toggle')) {
                this.trackEvent('theme_toggle');
            }
            
            // Search interactions
            if (e.target.closest('.search-trigger') || e.target.closest('#global-search-input')) {
                this.trackEvent('search_interaction');
            }
        });
        
        // Form submission tracking
        const contactForm = document.getElementById('contact-form');
        if (contactForm) {
            contactForm.addEventListener('submit', () => {
                this.trackEvent('contact_form_submit');
            });
        }
        
        // GitHub link clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href*="github.com"]');
            if (link) {
                this.trackEvent('github_link_click', { 
                    url: link.href,
                    text: link.textContent?.trim() || 'unknown'
                });
            }
        });
    }
    
    setupScrollAnalytics() {
        // Reading time estimation
        const estimateReadingTime = () => {
            const text = document.body.innerText;
            const words = text.split(/\s+/).length;
            const readingSpeed = 200; // words per minute
            return Math.ceil(words / readingSpeed);
        };
        
        this.estimatedReadingTime = estimateReadingTime();
        this.trackEvent('content_analysis', { 
            estimatedReadingTime: this.estimatedReadingTime,
            wordCount: document.body.innerText.split(/\s+/).length
        });
    }
    
    setupEngagementMetrics() {
        // Time on page
        let startTime = Date.now();
        let isActive = true;
        
        const trackTimeOnPage = () => {
            if (isActive) {
                const timeSpent = Date.now() - startTime;
                this.trackEvent('time_on_page', { duration: timeSpent });
            }
        };
        
        // Track page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                isActive = false;
                trackTimeOnPage();
            } else {
                isActive = true;
                startTime = Date.now();
            }
        });
        
        // Track before page unload
        globalThis.addEventListener('beforeunload', trackTimeOnPage);
        
        // Engagement score calculation
        setInterval(() => {
            const timeSpent = Date.now() - this.startTime;
            const engagementScore = this.calculateEngagementScore(timeSpent);
            this.trackEvent('engagement_score', { score: engagementScore });
        }, 30000); // Every 30 seconds
    }
    
    calculateEngagementScore(timeSpent) {
        let score = 0;
        
        // Time-based scoring (max 40 points)
        score += Math.min(timeSpent / 1000 / 60 * 10, 40); // 10 points per minute, max 40
        
        // Interaction-based scoring (max 30 points)
        score += Math.min(this.userBehavior.interactions * 2, 30); // 2 points per interaction, max 30
        
        // Scroll depth scoring (max 20 points)
        score += (this.userBehavior.scrollDepth / 100) * 20;
        
        // Section diversity scoring (max 10 points)
        const sectionsVisited = Object.keys(this.userBehavior.timeOnSections).length;
        score += Math.min(sectionsVisited * 1.43, 10); // 1.43 points per section, max 10
        
        return Math.round(score);
    }
    
    setupErrorTracking() {
        globalThis.addEventListener('error', (event) => {
            this.trackEvent('javascript_error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            });
        });
        
        globalThis.addEventListener('unhandledrejection', (event) => {
            this.trackEvent('promise_rejection', {
                reason: event.reason?.toString() || 'unknown'
            });
        });
    }
    
    trackEvent(eventName, data = {}) {
        const event = {
            name: eventName,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            userId: this.userId,
            data: data
        };
        
        this.events.push(event);
        
        // Send to console in development
        if (globalThis.location.hostname === 'localhost' || globalThis.location.hostname === '127.0.0.1') {
        }
        
        // Send to Cloudflare Analytics (if available and configured)
        if (globalThis.cf && globalThis.cf.beacon) {
            globalThis.cf.beacon.track(eventName, data);
        }
        
        // Store locally for analytics dashboard
        this.updateAnalyticsDashboard(event);
    }
    
    createAnalyticsDashboard() {
        // Real-time analytics display (if analytics section exists)
        const analyticsSection = document.getElementById('analytics');
        if (!analyticsSection) return;
        
        // Create real-time metrics display
        const metricsContainer = document.createElement('div');
        metricsContainer.className = 'live-analytics-metrics';
        metricsContainer.innerHTML = `
            <div class="metric-card">
                <h4>Session Analytics</h4>
                <div class="metric-row">
                    <span class="metric-label">Session ID:</span>
                    <span class="metric-value" id="session-id">${this.sessionId}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Time on Site:</span>
                    <span class="metric-value" id="time-on-site">0:00</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Scroll Depth:</span>
                    <span class="metric-value" id="scroll-depth">0%</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Interactions:</span>
                    <span class="metric-value" id="interaction-count">0</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Engagement Score:</span>
                    <span class="metric-value" id="engagement-score">0</span>
                </div>
            </div>
            
            <div class="metric-card">
                <h4>Performance Metrics</h4>
                <div class="metric-row">
                    <span class="metric-label">Page Load:</span>
                    <span class="metric-value" id="page-load">Measuring...</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">LCP:</span>
                    <span class="metric-value" id="lcp-metric">Measuring...</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">FID:</span>
                    <span class="metric-value" id="fid-metric">Measuring...</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">CLS:</span>
                    <span class="metric-value" id="cls-metric">Measuring...</span>
                </div>
            </div>
            
            <div class="metric-card">
                <h4>Recent Events</h4>
                <div class="events-log" id="events-log">
                    <div class="event-item">Analytics system initialized</div>
                </div>
            </div>
        `;
        
        // Insert at the beginning of analytics section
        analyticsSection.insertBefore(metricsContainer, analyticsSection.firstChild);
        
        // Start real-time updates
        this.startDashboardUpdates();
    }
    
    startDashboardUpdates() {
        setInterval(() => {
            this.updateDashboardMetrics();
        }, 1000);
    }
    
    updateDashboardMetrics() {
        const timeOnSite = document.getElementById('time-on-site');
        const scrollDepth = document.getElementById('scroll-depth');
        const interactionCount = document.getElementById('interaction-count');
        const engagementScore = document.getElementById('engagement-score');
        
        if (timeOnSite) {
            const elapsed = Date.now() - this.startTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            timeOnSite.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        if (scrollDepth) {
            scrollDepth.textContent = `${Math.round(this.userBehavior.scrollDepth)}%`;
        }
        
        if (interactionCount) {
            interactionCount.textContent = this.userBehavior.interactions.toString();
        }
        
        if (engagementScore) {
            const score = this.calculateEngagementScore(Date.now() - this.startTime);
            engagementScore.textContent = score.toString();
        }
        
        // Update performance metrics
        if (this.performanceMetrics.loadTime) {
            const pageLoad = document.getElementById('page-load');
            if (pageLoad) pageLoad.textContent = `${Math.round(this.performanceMetrics.loadTime)}ms`;
        }
        
        if (this.performanceMetrics.lcp) {
            const lcpMetric = document.getElementById('lcp-metric');
            if (lcpMetric) {
                const lcp = Math.round(this.performanceMetrics.lcp);
                lcpMetric.textContent = `${lcp}ms`;
                
                // Add performance status styling
                lcpMetric.className = 'metric-value';
                if (lcp > 4000) lcpMetric.classList.add('error');
                else if (lcp > 2500) lcpMetric.classList.add('warning');
            }
        }
        
        if (this.performanceMetrics.fid !== undefined) {
            const fidMetric = document.getElementById('fid-metric');
            if (fidMetric) {
                const fid = Math.round(this.performanceMetrics.fid);
                fidMetric.textContent = `${fid}ms`;
                
                fidMetric.className = 'metric-value';
                if (fid > 300) fidMetric.classList.add('error');
                else if (fid > 100) fidMetric.classList.add('warning');
            }
        }
        
        if (this.performanceMetrics.cls !== undefined) {
            const clsMetric = document.getElementById('cls-metric');
            if (clsMetric) {
                const cls = this.performanceMetrics.cls;
                clsMetric.textContent = cls.toFixed(3);
                
                clsMetric.className = 'metric-value';
                if (cls > 0.25) clsMetric.classList.add('error');
                else if (cls > 0.1) clsMetric.classList.add('warning');
            }
        }
    }
    
    updateAnalyticsDashboard(event) {
        const eventsLog = document.getElementById('events-log');
        if (eventsLog && this.events.length <= 50) { // Limit to last 50 events
            const eventItem = document.createElement('div');
            eventItem.className = 'event-item';
            eventItem.innerHTML = `
                <span class="event-time">${new Date(event.timestamp).toLocaleTimeString()}</span>
                <span class="event-name">${event.name}</span>
                ${Object.keys(event.data).length > 0 ? `<span class="event-data">${JSON.stringify(event.data)}</span>` : ''}
            `;
            eventsLog.insertBefore(eventItem, eventsLog.firstChild);
            
            // Remove old events
            while (eventsLog.children.length > 10) {
                eventsLog.removeChild(eventsLog.lastChild);
            }
        }
    }
    
    // Public API for manual event tracking
    track(eventName, data = {}) {
        this.trackEvent(eventName, data);
    }
    
    // Get analytics summary
    getSummary() {
        return {
            sessionId: this.sessionId,
            userId: this.userId,
            timeOnSite: Date.now() - this.startTime,
            events: this.events,
            performance: this.performanceMetrics,
            userBehavior: this.userBehavior,
            engagementScore: this.calculateEngagementScore(Date.now() - this.startTime)
        };
    }
    
    // Export analytics data
    exportData() {
        const summary = this.getSummary();
        const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `portfolio-analytics-${this.sessionId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Enhanced Mobile Navigation Handler
class EnhancedMobileNavigation {
    constructor() {
        this.init();
    }

    init() {
        this.setupHamburgerMenu();
        this.setupMobileMenuAnimation();
        this.handleOrientationChange();
        this.setupTouchFeedback();
    }

    setupHamburgerMenu() {
        const mobileMenu = document.getElementById('mobile-menu');
        const navMenu = document.getElementById('nav-menu');

        if (!mobileMenu || !navMenu) return;

        mobileMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // Close menu when clicking on nav links
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                this.closeMenu();
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (navMenu.classList.contains('active') &&
                !navMenu.contains(e.target) &&
                !mobileMenu.contains(e.target)) {
                this.closeMenu();
            }
        });
    }

    toggleMenu() {
        const mobileMenu = document.getElementById('mobile-menu');
        const navMenu = document.getElementById('nav-menu');
        const body = document.body;

        const isActive = navMenu.classList.toggle('active');
        mobileMenu.classList.toggle('active');

        if (isActive) {
            body.classList.add('nav-open');
            body.style.overflow = 'hidden';
        } else {
            body.classList.remove('nav-open');
            body.style.overflow = '';
        }
    }

    closeMenu() {
        const mobileMenu = document.getElementById('mobile-menu');
        const navMenu = document.getElementById('nav-menu');
        const body = document.body;

        navMenu.classList.remove('active');
        mobileMenu.classList.remove('active');
        body.classList.remove('nav-open');
        body.style.overflow = '';
    }

    setupMobileMenuAnimation() {
        const navMenu = document.getElementById('nav-menu');
        if (!navMenu) return;

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const isActive = navMenu.classList.contains('active');
                    if (isActive) {
                        this.animateMenuItems();
                    }
                }
            });
        });

        observer.observe(navMenu, { attributes: true });
    }

    animateMenuItems() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(20px)';
            setTimeout(() => {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, index * 50);
        });
    }

    handleOrientationChange() {
        let previousOrientation = window.orientation;

        window.addEventListener('orientationchange', () => {
            const currentOrientation = window.orientation;
            if (currentOrientation !== previousOrientation) {
                this.closeMenu();
                previousOrientation = currentOrientation;

                // Recalculate viewport height
                setTimeout(() => {
                    this.updateViewportHeight();
                }, 200);
            }
        });
    }

    updateViewportHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    setupTouchFeedback() {
        const touchTargets = document.querySelectorAll('.btn, .nav-link, .project-link, .contact-method, .skill-item, .topic-tag');

        touchTargets.forEach(target => {
            target.addEventListener('touchstart', function() {
                this.style.transition = 'transform 0.1s ease';
            }, { passive: true });
        });
    }
}

// Enhanced Touch Gesture Handler
class TouchGestureHandler {
    constructor() {
        this.init();
    }

    init() {
        this.setupDoubleTapToTop();
        this.setupSwipeGestures();
        this.preventZoom();
        this.optimizeScrolling();
    }

    setupDoubleTapToTop() {
        let lastTap = 0;
        const navbar = document.querySelector('.navbar');

        if (navbar) {
            navbar.addEventListener('touchend', (e) => {
                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTap;

                if (tapLength < 500 && tapLength > 0) {
                    // Double tap detected
                    window.scrollTo({
                        top: 0,
                        behavior: 'smooth'
                    });
                }

                lastTap = currentTime;
            }, { passive: true });
        }
    }

    setupSwipeGestures() {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;

        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            this.handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
        }, { passive: true });
    }

    handleSwipe(startX, startY, endX, endY) {
        const diffX = startX - endX;
        const diffY = startY - endY;
        const threshold = 50;

        // Only handle horizontal swipes that are more horizontal than vertical
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
            // Swipe logic can be added here for specific components
        }
    }

    preventZoom() {
        // Prevent double-tap zoom on buttons and interactive elements
        const preventZoomElements = document.querySelectorAll('.btn, button, a');

        preventZoomElements.forEach(element => {
            element.addEventListener('touchend', (e) => {
                e.preventDefault();
                element.click();
            });
        });
    }

    optimizeScrolling() {
        // Add momentum scrolling for iOS
        const scrollContainers = document.querySelectorAll('.nav-menu, .global-search-results, .analytics-nav, .contribution-graph, .topics-cloud');

        scrollContainers.forEach(container => {
            container.style.webkitOverflowScrolling = 'touch';
        });
    }
}

// Mobile Performance Monitor
class MobilePerformanceMonitor {
    constructor() {
        this.init();
    }

    init() {
        this.monitorViewport();
        this.lazyLoadImages();
        this.optimizeAnimations();
        this.monitorNetworkStatus();
    }

    monitorViewport() {
        // Update viewport height for mobile browsers with dynamic toolbars
        const updateVH = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };

        updateVH();
        window.addEventListener('resize', updateVH);
        window.addEventListener('orientationchange', () => {
            setTimeout(updateVH, 100);
        });
    }

    lazyLoadImages() {
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const src = img.getAttribute('data-src');
                        if (src) {
                            img.src = src;
                            img.removeAttribute('data-src');
                            img.classList.remove('loading-placeholder');
                            img.classList.add('loaded');
                            imageObserver.unobserve(img);
                        }
                    }
                });
            }, {
                rootMargin: '50px'
            });

            document.querySelectorAll('img[data-src]').forEach(img => {
                imageObserver.observe(img);
            });
        }
    }

    optimizeAnimations() {
        // Reduce motion if user prefers
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (prefersReducedMotion) {
            document.documentElement.style.setProperty('--transition-base', '0.01ms');
            document.documentElement.style.setProperty('--transition-fast', '0.01ms');
            document.documentElement.style.setProperty('--transition-slow', '0.01ms');
        }
    }

    monitorNetworkStatus() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            const effectiveType = connection.effectiveType;

            // Adjust quality based on connection
            if (effectiveType === 'slow-2g' || effectiveType === '2g') {
                // Load lower quality resources
                document.body.classList.add('slow-connection');
            }

            connection.addEventListener('change', () => {
                const newType = connection.effectiveType;
                if (newType === 'slow-2g' || newType === '2g') {
                    document.body.classList.add('slow-connection');
                } else {
                    document.body.classList.remove('slow-connection');
                }
            });
        }
    }
}

// Mobile Form Enhancement
class MobileFormEnhancement {
    constructor() {
        this.init();
    }

    init() {
        this.enhanceInputs();
        this.setupKeyboardHandling();
        this.addAutoComplete();
    }

    enhanceInputs() {
        // Add appropriate input types and attributes for mobile
        const emailInputs = document.querySelectorAll('input[type="email"]');
        emailInputs.forEach(input => {
            input.setAttribute('autocomplete', 'email');
            input.setAttribute('autocapitalize', 'off');
            input.setAttribute('autocorrect', 'off');
        });

        const nameInputs = document.querySelectorAll('input[name="name"]');
        nameInputs.forEach(input => {
            input.setAttribute('autocomplete', 'name');
            input.setAttribute('autocapitalize', 'words');
        });

        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(textarea => {
            textarea.setAttribute('autocapitalize', 'sentences');
        });
    }

    setupKeyboardHandling() {
        // Scroll to input when keyboard appears
        const inputs = document.querySelectorAll('input, textarea');

        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                setTimeout(() => {
                    input.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }, 300);
            });
        });
    }

    addAutoComplete() {
        // Add better autocomplete attributes
        const subjectInput = document.getElementById('subject');
        if (subjectInput) {
            subjectInput.setAttribute('autocomplete', 'off');
        }

        const messageInput = document.getElementById('message');
        if (messageInput) {
            messageInput.setAttribute('autocomplete', 'off');
        }
    }
}

// Initialize all mobile enhancements
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.addEventListener('DOMContentLoaded', () => {
        const enhancedMobileNav = new EnhancedMobileNavigation();
        const touchGestureHandler = new TouchGestureHandler();
        const mobilePerformanceMonitor = new MobilePerformanceMonitor();
        const mobileFormEnhancement = new MobileFormEnhancement();

        // Add mobile-optimized class to body
        document.body.classList.add('mobile-optimized');
    });
}

// Initialize Visual Animation System
const visualAnimations = new VisualAnimationSystem();

// Initialize Mobile Optimization System
const mobileOptimization = new MobileOptimizationSystem();

// Initialize Portfolio Analytics System
const portfolioAnalytics = new PortfolioAnalyticsSystem();

// Make analytics available globally for debugging
globalThis.portfolioAnalytics = portfolioAnalytics;

// Cloudflare Analytics Status Updater
function updateCloudflareStatus() {
    const statusElement = document.getElementById('cf-analytics-status');
    if (!statusElement) return;
    
    const indicator = statusElement.querySelector('.status-indicator');
    const text = statusElement.querySelector('.status-text');
    
    if (!indicator || !text) return;
    
    // Clear all status classes
    statusElement.classList.remove('status-active', 'status-inactive', 'status-loading');
    
    if (globalThis.portfolioAnalytics && globalThis.portfolioAnalytics.cloudflareLoaded) {
        indicator.className = 'status-indicator active';
        indicator.textContent = '●';
        text.textContent = 'Cloudflare Analytics Active';
        statusElement.title = 'Cloudflare Web Analytics is successfully tracking visits';
        statusElement.classList.add('status-active');
    } else if (globalThis.portfolioAnalytics && globalThis.portfolioAnalytics.cloudflareAttempted) {
        indicator.className = 'status-indicator inactive';
        indicator.textContent = '●';
        text.textContent = 'Cloudflare Analytics Unavailable';
        statusElement.title = 'Using local analytics only - Cloudflare service unavailable';
        statusElement.classList.add('status-inactive');
    } else {
        indicator.className = 'status-indicator loading';
        indicator.textContent = '●';
        text.textContent = 'Cloudflare Analytics Loading...';
        statusElement.title = 'Attempting to connect to Cloudflare Web Analytics';
        statusElement.classList.add('status-loading');
    }
}

// Check Cloudflare status periodically
setInterval(updateCloudflareStatus, 1000);

// Initial status check after page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateCloudflareStatus, 2000);
});

// ============================================================================
// PWA Service Worker Registration
// ============================================================================

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });
            
            debug.log('[PWA] Service Worker registered successfully:', registration.scope);
            
            // Handle updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New service worker available
                        showUpdateNotification();
                    }
                });
            });
            
            // Check for updates periodically
            setInterval(() => {
                registration.update();
            }, 60 * 60 * 1000); // Check every hour
            
        } catch (error) {
            debug.error('[PWA] Service Worker registration failed:', error);
        }
    });
    
    // Handle controller change (new service worker activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        debug.log('[PWA] New service worker activated');
    });
    
    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CACHE_UPDATED') {
            debug.log('[PWA] Cache updated:', event.data.url);
        }
    });
}

// Show update notification when new version available
function showUpdateNotification() {
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
        <div class="update-content">
            <div class="update-icon">🔄</div>
            <div class="update-text">
                <strong>Update Available</strong>
                <p>A new version of the portfolio is ready</p>
            </div>
            <button class="update-button" onclick="updateServiceWorker()">Update Now</button>
            <button class="update-dismiss" onclick="this.closest('.update-notification').remove()">Later</button>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Auto-show with animation
    setTimeout(() => notification.classList.add('show'), 100);
}

// Update service worker and reload
globalThis.updateServiceWorker = async function() {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration && registration.waiting) {
        // Tell the waiting service worker to skip waiting
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        
        // Reload the page when the new service worker takes control
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }
};

// ============================================================================
// Touch Gesture Manager
// ============================================================================

class TouchGestureManager {
    constructor() {
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchEndX = 0;
        this.touchEndY = 0;
        this.minSwipeDistance = 50;
        this.pullToRefreshThreshold = 80;
        this.isPulling = false;
        this.currentProjectIndex = 0;
        
        this.init();
    }
    
    init() {
        // Only enable on touch devices
        if (!('ontouchstart' in window)) {
            return;
        }
        
        this.setupSwipeNavigation();
        this.setupPullToRefresh();
        this.ensureMinimumTouchTargets();
        
        debug.log('[Touch] Gesture manager initialized');
    }
    
    setupSwipeNavigation() {
        const projectsGrid = document.querySelector('.projects-grid');
        if (!projectsGrid) return;
        
        let touchStartTime;
        
        projectsGrid.addEventListener('touchstart', (e) => {
            // Ignore multi-touch
            if (e.touches.length !== 1) return;
            
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: true });
        
        projectsGrid.addEventListener('touchend', (e) => {
            if (e.changedTouches.length !== 1) return;
            
            this.touchEndX = e.changedTouches[0].clientX;
            this.touchEndY = e.changedTouches[0].clientY;
            
            const touchDuration = Date.now() - touchStartTime;
            
            // Require quick swipe (less than 300ms)
            if (touchDuration > 300) return;
            
            this.handleSwipe(projectsGrid);
        }, { passive: true });
    }
    
    handleSwipe(projectsGrid) {
        const deltaX = this.touchEndX - this.touchStartX;
        const deltaY = this.touchEndY - this.touchStartY;
        
        // Check if horizontal swipe (more horizontal than vertical)
        if (Math.abs(deltaX) < Math.abs(deltaY)) return;
        
        // Check minimum distance
        if (Math.abs(deltaX) < this.minSwipeDistance) return;
        
        const projects = Array.from(projectsGrid.querySelectorAll('.project-card'));
        if (projects.length === 0) return;
        
        // Swipe left - next project
        if (deltaX < 0 && this.currentProjectIndex < projects.length - 1) {
            this.currentProjectIndex++;
            this.scrollToProject(projects[this.currentProjectIndex]);
            this.showSwipeIndicator('left');
        }
        // Swipe right - previous project
        else if (deltaX > 0 && this.currentProjectIndex > 0) {
            this.currentProjectIndex--;
            this.scrollToProject(projects[this.currentProjectIndex]);
            this.showSwipeIndicator('right');
        }
    }
    
    scrollToProject(projectCard) {
        projectCard.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
        });
        
        // Highlight effect
        projectCard.style.transform = 'scale(1.02)';
        projectCard.style.boxShadow = '0 8px 30px rgba(102, 126, 234, 0.3)';
        
        setTimeout(() => {
            projectCard.style.transform = '';
            projectCard.style.boxShadow = '';
        }, 300);
    }
    
    showSwipeIndicator(direction) {
        const indicator = document.createElement('div');
        indicator.className = 'swipe-indicator';
        indicator.innerHTML = direction === 'left' ? '→' : '←';
        indicator.style.cssText = `
            position: fixed;
            ${direction === 'left' ? 'right: 20px' : 'left: 20px'};
            top: 50%;
            transform: translateY(-50%);
            font-size: 3rem;
            color: var(--primary-color);
            opacity: 0;
            animation: swipeIndicatorFade 0.5s ease-out;
            pointer-events: none;
            z-index: 9999;
        `;
        
        document.body.appendChild(indicator);
        
        setTimeout(() => indicator.remove(), 500);
    }
    
    setupPullToRefresh() {
        let pullDistance = 0;
        let startY = 0;
        let pullIndicator = null;
        
        // Create pull indicator
        const createPullIndicator = () => {
            if (pullIndicator) return pullIndicator;
            
            pullIndicator = document.createElement('div');
            pullIndicator.className = 'pull-to-refresh-indicator';
            pullIndicator.innerHTML = `
                <div class="pull-spinner">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                        <path d="M12 2 L12 6 M12 2 L15 5 M12 2 L9 5" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <div class="pull-text">Pull to refresh</div>
            `;
            pullIndicator.style.cssText = `
                position: fixed;
                top: -100px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                padding: 16px;
                background: var(--bg-primary);
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                transition: top 0.3s ease;
                z-index: 9998;
                color: var(--text-primary);
            `;
            
            document.body.appendChild(pullIndicator);
            return pullIndicator;
        };
        
        document.addEventListener('touchstart', (e) => {
            // Only at top of page
            if (window.scrollY > 0) return;
            
            startY = e.touches[0].clientY;
            this.isPulling = true;
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!this.isPulling || window.scrollY > 0) return;
            
            const currentY = e.touches[0].clientY;
            pullDistance = Math.max(0, currentY - startY);
            
            // Show indicator when pulling
            if (pullDistance > 10) {
                const indicator = createPullIndicator();
                const progress = Math.min(pullDistance / this.pullToRefreshThreshold, 1);
                
                indicator.style.top = `${Math.min(pullDistance - 60, 20)}px`;
                
                const spinner = indicator.querySelector('.pull-spinner svg');
                spinner.style.transform = `rotate(${progress * 360}deg)`;
                
                const text = indicator.querySelector('.pull-text');
                text.textContent = pullDistance >= this.pullToRefreshThreshold 
                    ? 'Release to refresh' 
                    : 'Pull to refresh';
                
                if (pullDistance >= this.pullToRefreshThreshold) {
                    indicator.style.color = 'var(--primary-color)';
                }
            }
        }, { passive: true });
        
        document.addEventListener('touchend', async (e) => {
            if (!this.isPulling) return;
            
            this.isPulling = false;
            
            if (pullDistance >= this.pullToRefreshThreshold && pullIndicator) {
                // Trigger refresh
                pullIndicator.querySelector('.pull-text').textContent = 'Refreshing...';
                pullIndicator.querySelector('.pull-spinner svg').style.animation = 'spin 1s linear infinite';
                
                await this.refreshContent();
                
                // Hide indicator
                pullIndicator.style.top = '-100px';
                setTimeout(() => {
                    if (pullIndicator && pullIndicator.parentNode) {
                        pullIndicator.remove();
                        pullIndicator = null;
                    }
                }, 300);
            } else if (pullIndicator) {
                // Reset indicator
                pullIndicator.style.top = '-100px';
                setTimeout(() => {
                    if (pullIndicator && pullIndicator.parentNode) {
                        pullIndicator.remove();
                        pullIndicator = null;
                    }
                }, 300);
            }
            
            pullDistance = 0;
        }, { passive: true });
    }
    
    async refreshContent() {
        // Refresh GitHub data
        try {
            const projectsGrid = document.querySelector('.projects-grid');
            if (projectsGrid && globalThis.loadGitHubProjects) {
                await globalThis.loadGitHubProjects();
            }
            
            // Show success message
            this.showToast('Content refreshed!');
        } catch (error) {
            debug.error('[Touch] Refresh failed:', error);
            this.showToast('Refresh failed. Please try again.');
        }
    }
    
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'refresh-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--bg-primary);
            color: var(--text-primary);
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 9999;
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
        }, 10);
        
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(100px)';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
    
    ensureMinimumTouchTargets() {
        // Ensure all interactive elements meet 44x44px minimum
        const selectors = [
            'button',
            'a',
            '.nav-link',
            '.theme-toggle',
            '.project-card',
            '.skill-category',
            '.contact-method',
            'input[type="submit"]',
            'input[type="button"]',
            '.filter-btn',
            '.sort-select'
        ];
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                const computedStyle = window.getComputedStyle(element);
                const width = parseFloat(computedStyle.width);
                const height = parseFloat(computedStyle.height);
                
                // If element is too small, add padding
                if (width < 44 || height < 44) {
                    const paddingNeeded = {
                        horizontal: Math.max(0, (44 - width) / 2),
                        vertical: Math.max(0, (44 - height) / 2)
                    };
                    
                    if (paddingNeeded.horizontal > 0 || paddingNeeded.vertical > 0) {
                        element.style.minWidth = '44px';
                        element.style.minHeight = '44px';
                        element.style.display = 'inline-flex';
                        element.style.alignItems = 'center';
                        element.style.justifyContent = 'center';
                    }
                }
            });
        });
        
        debug.log('[Touch] Minimum touch target sizes enforced');
    }
}

// Add swipe indicator animation to styles
if (!document.getElementById('swipe-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'swipe-animation-styles';
    style.textContent = `
        @keyframes swipeIndicatorFade {
            0% { opacity: 0; transform: translateY(-50%) scale(0.8); }
            50% { opacity: 1; transform: translateY(-50%) scale(1); }
            100% { opacity: 0; transform: translateY(-50%) scale(0.8); }
        }
        
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        .pull-spinner {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .pull-text {
            font-size: 0.875rem;
            font-weight: 500;
            white-space: nowrap;
        }
    `;
    document.head.appendChild(style);
}

// Initialize touch gestures when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        globalThis.touchGestureManager = new TouchGestureManager();
    });
} else {
    globalThis.touchGestureManager = new TouchGestureManager();
}

// ============================================================================
// Mobile Performance Optimizer
// ============================================================================

class MobilePerformanceOptimizer {
    constructor() {
        this.lazyLoadObserver = null;
        this.performanceObserver = null;
        this.isMobile = this.detectMobile();
        this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        this.init();
    }
    
    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               window.innerWidth <= 768;
    }
    
    init() {
        debug.log('[Performance] Initializing mobile optimizations...');
        
        this.setupLazyLoading();
        this.optimizeAnimations();
        this.setupVirtualScrolling();
        this.optimizeImages();
        this.deferNonCriticalCSS();
        this.setupPerformanceMonitoring();
        
        // Optimize on resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.isMobile = this.detectMobile();
                this.optimizeAnimations();
            }, 250);
        }, { passive: true });
        
        debug.log('[Performance] Mobile optimizations initialized');
    }
    
    setupLazyLoading() {
        // Intersection Observer for lazy loading
        const observerOptions = {
            root: null,
            rootMargin: '50px',
            threshold: 0.01
        };
        
        this.lazyLoadObserver = new IntersectionObserver((entries) => {
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
                    
                    // Lazy load iframes
                    if (element.tagName === 'IFRAME' && element.dataset.src) {
                        element.src = element.dataset.src;
                        element.removeAttribute('data-src');
                    }
                    
                    element.classList.add('loaded');
                    this.lazyLoadObserver.unobserve(element);
                }
            });
        }, observerOptions);
        
        // Observe all lazy-loadable elements
        this.observeLazyElements();
        
        // Re-observe when new content is added
        const mutationObserver = new MutationObserver(() => {
            this.observeLazyElements();
        });
        
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    observeLazyElements() {
        // Images with data-src
        document.querySelectorAll('img[data-src]:not(.loaded)').forEach(img => {
            this.lazyLoadObserver.observe(img);
        });
        
        // Elements with background images
        document.querySelectorAll('[data-bg-image]:not(.loaded)').forEach(el => {
            this.lazyLoadObserver.observe(el);
        });
        
        // Iframes
        document.querySelectorAll('iframe[data-src]:not(.loaded)').forEach(iframe => {
            this.lazyLoadObserver.observe(iframe);
        });
    }
    
    optimizeAnimations() {
        if (this.isReducedMotion) {
            // Disable animations for users who prefer reduced motion
            document.documentElement.style.setProperty('--animation-duration', '0.01ms');
            document.documentElement.style.setProperty('--transition-duration', '0.01ms');
            return;
        }
        
        if (this.isMobile) {
            // Reduce animation complexity on mobile
            document.documentElement.style.setProperty('--animation-duration', '200ms');
            document.documentElement.style.setProperty('--transition-duration', '200ms');
            
            // Use transform and opacity only for animations
            const style = document.createElement('style');
            style.id = 'mobile-animation-optimizations';
            style.textContent = `
                @media (max-width: 768px) {
                    * {
                        /* Force GPU acceleration for animations */
                        will-change: auto !important;
                    }
                    
                    .project-card:hover,
                    .skill-category:hover,
                    .highlight-item:hover {
                        /* Only use transform and opacity for 60fps */
                        will-change: transform, opacity;
                    }
                    
                    /* Reduce blur effects on mobile */
                    .project-card,
                    .theme-picker-container,
                    .global-search-overlay {
                        backdrop-filter: none;
                        -webkit-backdrop-filter: none;
                    }
                    
                    /* Simplify shadows */
                    .project-card,
                    .skill-category,
                    .highlight-item {
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
                    }
                }
            `;
            
            if (!document.getElementById('mobile-animation-optimizations')) {
                document.head.appendChild(style);
            }
        }
    }
    
    setupVirtualScrolling() {
        const projectsGrid = document.querySelector('.projects-grid');
        if (!projectsGrid) return;
        
        // Only enable virtual scrolling if many projects
        const observer = new MutationObserver(() => {
            const projectCards = projectsGrid.querySelectorAll('.project-card');
            
            if (projectCards.length > 20 && this.isMobile) {
                this.enableVirtualScrolling(projectsGrid, projectCards);
                observer.disconnect();
            }
        });
        
        observer.observe(projectsGrid, {
            childList: true
        });
    }
    
    enableVirtualScrolling(container, items) {
        debug.log('[Performance] Enabling virtual scrolling for', items.length, 'items');
        
        const itemHeight = 400; // Approximate project card height
        const bufferSize = 3; // Render 3 items above and below viewport
        
        let scrollTop = 0;
        let viewportHeight = window.innerHeight;
        
        const updateVisibleItems = () => {
            const scrollTop = window.scrollY;
            const containerTop = container.getBoundingClientRect().top + scrollTop;
            
            const startIndex = Math.max(0, Math.floor((scrollTop - containerTop) / itemHeight) - bufferSize);
            const endIndex = Math.min(
                items.length,
                Math.ceil((scrollTop - containerTop + viewportHeight) / itemHeight) + bufferSize
            );
            
            items.forEach((item, index) => {
                if (index >= startIndex && index <= endIndex) {
                    item.style.display = '';
                    item.classList.add('visible');
                } else {
                    item.style.display = 'none';
                    item.classList.remove('visible');
                }
            });
        };
        
        // Throttled scroll handler
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            
            scrollTimeout = setTimeout(() => {
                updateVisibleItems();
                scrollTimeout = null;
            }, 16); // ~60fps
        }, { passive: true });
        
        // Initial update
        updateVisibleItems();
        
        // Update on resize
        window.addEventListener('resize', () => {
            viewportHeight = window.innerHeight;
            updateVisibleItems();
        }, { passive: true });
    }
    
    optimizeImages() {
        // Convert images to use lazy loading
        document.querySelectorAll('img:not([data-src]):not([loading])').forEach(img => {
            // Skip if already loaded or in viewport
            const rect = img.getBoundingClientRect();
            const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
            
            if (!isInViewport && !img.complete) {
                img.loading = 'lazy';
            }
        });
        
        // Add responsive image sizing
        document.querySelectorAll('img:not([srcset])').forEach(img => {
            if (img.src && !img.dataset.noResponsive) {
                // Add size hints for browser optimization
                if (!img.sizes && img.width) {
                    img.sizes = `(max-width: 768px) ${Math.min(img.width, window.innerWidth)}px, ${img.width}px`;
                }
            }
        });
        
        debug.log('[Performance] Image optimization applied');
    }
    
    deferNonCriticalCSS() {
        // Load non-critical CSS asynchronously
        const deferredStyles = [
            'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
        ];
        
        deferredStyles.forEach(href => {
            const link = document.querySelector(`link[href="${href}"]`);
            if (link && link.rel === 'stylesheet') {
                const newLink = document.createElement('link');
                newLink.rel = 'stylesheet';
                newLink.href = href;
                newLink.media = 'print';
                newLink.onload = function() {
                    this.media = 'all';
                };
                
                link.parentNode.replaceChild(newLink, link);
            }
        });
    }
    
    setupPerformanceMonitoring() {
        // Monitor long tasks
        if ('PerformanceObserver' in window) {
            try {
                this.performanceObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.duration > 50) {
                            debug.warn('[Performance] Long task detected:', entry.duration.toFixed(2), 'ms');
                        }
                    }
                });
                
                this.performanceObserver.observe({ entryTypes: ['longtask'] });
            } catch (e) {
                // Long task observer not supported
            }
        }
        
        // Log performance metrics
        if (window.performance && window.performance.timing) {
            window.addEventListener('load', () => {
                setTimeout(() => {
                    const perfData = window.performance.timing;
                    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
                    const connectTime = perfData.responseEnd - perfData.requestStart;
                    const renderTime = perfData.domComplete - perfData.domLoading;
                    
                    debug.log('[Performance] Page Load Metrics:', {
                        pageLoadTime: `${pageLoadTime}ms`,
                        connectTime: `${connectTime}ms`,
                        renderTime: `${renderTime}ms`
                    });
                    
                    // Track with analytics
                    if (globalThis.portfolioAnalytics) {
                        globalThis.portfolioAnalytics.trackEvent('performance_metrics', {
                            pageLoadTime,
                            connectTime,
                            renderTime,
                            isMobile: this.isMobile
                        });
                    }
                }, 0);
            });
        }
    }
    
    // Debounce utility for performance
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Throttle utility for performance
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

// Initialize mobile performance optimizer
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        globalThis.mobilePerformanceOptimizer = new MobilePerformanceOptimizer();
    });
} else {
    globalThis.mobilePerformanceOptimizer = new MobilePerformanceOptimizer();
}

// ============================================================================
// Enhanced Analytics System
// ============================================================================

class EnhancedAnalytics {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.sessionStartTime = Date.now();
        this.pageViews = 0;
        this.events = [];
        this.userJourney = [];
        this.performanceMetrics = {};
        this.conversionGoals = new Map();
        this.heatmapData = [];
        this.scrollDepth = 0;
        this.maxScrollDepth = 0;
        
        this.init();
    }
    
    init() {
        debug.log('[Analytics] Enhanced analytics system initializing...');
        
        this.setupPageViewTracking();
        this.setupUserBehaviorTracking();
        this.setupConversionTracking();
        this.setupScrollDepthTracking();
        this.setupEngagementTracking();
        this.setupHeatmapTracking();
        this.loadSessionData();
        
        // Track initial page view
        this.trackPageView(window.location.pathname);
        
        debug.log('[Analytics] Enhanced analytics initialized');
        debug.log('[Analytics] Session ID:', this.sessionId);
    }
    
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    setupPageViewTracking() {
        // Track page views and navigation
        let lastPath = window.location.pathname;
        
        // SPA navigation detection
        const observer = new MutationObserver(() => {
            const currentPath = window.location.pathname;
            if (currentPath !== lastPath) {
                this.trackPageView(currentPath);
                lastPath = currentPath;
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Handle popstate for back/forward navigation
        window.addEventListener('popstate', () => {
            this.trackPageView(window.location.pathname);
        });
    }
    
    trackPageView(path) {
        this.pageViews++;
        
        const pageView = {
            type: 'pageview',
            path,
            timestamp: Date.now(),
            referrer: document.referrer,
            title: document.title,
            sessionId: this.sessionId,
            pageNumber: this.pageViews
        };
        
        this.events.push(pageView);
        this.userJourney.push({
            action: 'page_view',
            path,
            timestamp: Date.now()
        });
        
        // Track with existing analytics
        if (globalThis.portfolioAnalytics) {
            globalThis.portfolioAnalytics.trackEvent('page_view', {
                path,
                pageNumber: this.pageViews
            });
        }
        
        debug.log('[Analytics] Page view tracked:', path);
        this.saveSessionData();
    }
    
    setupUserBehaviorTracking() {
        // Track clicks
        document.addEventListener('click', (e) => {
            const target = e.target;
            const elementInfo = this.getElementInfo(target);
            
            this.trackEvent('click', {
                element: elementInfo,
                x: e.clientX,
                y: e.clientY,
                timestamp: Date.now()
            });
            
            // Track specific actions
            if (target.tagName === 'A') {
                this.trackEvent('link_click', {
                    href: target.href,
                    text: target.textContent.trim().substring(0, 100)
                });
            }
            
            if (target.closest('.project-card')) {
                const projectCard = target.closest('.project-card');
                const projectName = projectCard.querySelector('h3')?.textContent || 'Unknown';
                this.trackEvent('project_interaction', {
                    projectName,
                    action: 'click'
                });
            }
            
            if (target.closest('button[type="submit"]')) {
                this.trackConversionGoal('form_submission_attempt');
            }
        }, { passive: true });
        
        // Track form interactions
        document.addEventListener('focus', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                this.trackEvent('form_field_focus', {
                    fieldName: e.target.name || e.target.id,
                    fieldType: e.target.type
                });
            }
        }, { passive: true, capture: true });
        
        // Track time on page before leaving
        window.addEventListener('beforeunload', () => {
            this.trackSessionEnd();
        });
    }
    
    setupConversionTracking() {
        // Define conversion goals
        this.conversionGoals.set('github_profile_click', {
            name: 'GitHub Profile Visit',
            description: 'User clicks GitHub profile link',
            value: 1
        });
        
        this.conversionGoals.set('project_view', {
            name: 'Project Viewed',
            description: 'User views a project',
            value: 0.5
        });
        
        this.conversionGoals.set('contact_form_submit', {
            name: 'Contact Form Submission',
            description: 'User submits contact form',
            value: 5
        });
        
        this.conversionGoals.set('external_project_click', {
            name: 'External Project Link',
            description: 'User clicks to view project on GitHub',
            value: 2
        });
        
        // Track GitHub profile clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href*="github.com/and3rn3t"]');
            if (link) {
                this.trackConversionGoal('github_profile_click');
            }
            
            const projectLink = e.target.closest('.project-card a[href*="github.com"]');
            if (projectLink) {
                this.trackConversionGoal('external_project_click');
            }
        }, { passive: true });
    }
    
    trackConversionGoal(goalId, metadata = {}) {
        const goal = this.conversionGoals.get(goalId);
        if (!goal) return;
        
        const conversion = {
            type: 'conversion',
            goalId,
            goalName: goal.name,
            value: goal.value,
            metadata,
            timestamp: Date.now(),
            sessionId: this.sessionId
        };
        
        this.events.push(conversion);
        this.userJourney.push({
            action: 'conversion',
            goal: goalId,
            timestamp: Date.now()
        });
        
        debug.log('[Analytics] Conversion tracked:', goalId, goal.name);
        
        if (globalThis.portfolioAnalytics) {
            globalThis.portfolioAnalytics.trackEvent('conversion', {
                goal: goalId,
                value: goal.value
            });
        }
        
        this.saveSessionData();
    }
    
    setupScrollDepthTracking() {
        let scrollTimeout;
        const scrollMilestones = [25, 50, 75, 90, 100];
        const reachedMilestones = new Set();
        
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            
            scrollTimeout = setTimeout(() => {
                const scrollPercentage = this.calculateScrollPercentage();
                
                if (scrollPercentage > this.maxScrollDepth) {
                    this.maxScrollDepth = scrollPercentage;
                }
                
                // Track milestones
                scrollMilestones.forEach(milestone => {
                    if (scrollPercentage >= milestone && !reachedMilestones.has(milestone)) {
                        reachedMilestones.add(milestone);
                        this.trackEvent('scroll_depth', {
                            milestone,
                            percentage: scrollPercentage
                        });
                    }
                });
            }, 100);
        }, { passive: true });
    }
    
    calculateScrollPercentage() {
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const trackLength = documentHeight - windowHeight;
        
        return Math.round((scrollTop / trackLength) * 100);
    }
    
    setupEngagementTracking() {
        let engagementScore = 0;
        let lastActivityTime = Date.now();
        let isActive = true;
        
        // Track user activity
        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        
        activityEvents.forEach(eventType => {
            document.addEventListener(eventType, () => {
                lastActivityTime = Date.now();
                if (!isActive) {
                    isActive = true;
                    this.trackEvent('user_returned', {
                        awayDuration: Date.now() - lastActivityTime
                    });
                }
                engagementScore++;
            }, { passive: true });
        });
        
        // Check for inactivity
        setInterval(() => {
            const inactiveTime = Date.now() - lastActivityTime;
            if (inactiveTime > 30000 && isActive) { // 30 seconds
                isActive = false;
                this.trackEvent('user_idle', {
                    lastActivity: lastActivityTime,
                    engagementScore
                });
            }
        }, 10000);
        
        // Track visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.trackEvent('tab_hidden', {
                    timeOnPage: Date.now() - this.sessionStartTime
                });
            } else {
                this.trackEvent('tab_visible', {
                    timeOnPage: Date.now() - this.sessionStartTime
                });
            }
        });
    }
    
    setupHeatmapTracking() {
        // Track clicks for heatmap visualization
        document.addEventListener('click', (e) => {
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            
            this.heatmapData.push({
                x,
                y,
                timestamp: Date.now(),
                page: window.location.pathname
            });
            
            // Limit heatmap data size
            if (this.heatmapData.length > 1000) {
                this.heatmapData = this.heatmapData.slice(-1000);
            }
        }, { passive: true });
    }
    
    getElementInfo(element) {
        return {
            tagName: element.tagName,
            id: element.id || null,
            className: element.className || null,
            text: element.textContent?.trim().substring(0, 50) || null,
            href: element.href || null
        };
    }
    
    trackEvent(eventName, data = {}) {
        const event = {
            type: 'event',
            name: eventName,
            data,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            path: window.location.pathname
        };
        
        this.events.push(event);
        
        // Limit events array size
        if (this.events.length > 500) {
            this.events = this.events.slice(-500);
        }
        
        // Track with existing analytics
        if (globalThis.portfolioAnalytics && eventName !== 'click') {
            globalThis.portfolioAnalytics.trackEvent(eventName, data);
        }
    }
    
    trackSessionEnd() {
        const sessionDuration = Date.now() - this.sessionStartTime;
        
        const sessionSummary = {
            type: 'session_end',
            sessionId: this.sessionId,
            duration: sessionDuration,
            pageViews: this.pageViews,
            eventsCount: this.events.length,
            maxScrollDepth: this.maxScrollDepth,
            userJourney: this.userJourney,
            timestamp: Date.now()
        };
        
        this.events.push(sessionSummary);
        
        debug.log('[Analytics] Session ended:', {
            duration: `${(sessionDuration / 1000).toFixed(1)}s`,
            pageViews: this.pageViews,
            events: this.events.length,
            maxScroll: `${this.maxScrollDepth}%`
        });
        
        this.saveSessionData();
    }
    
    saveSessionData() {
        try {
            const data = {
                sessionId: this.sessionId,
                startTime: this.sessionStartTime,
                pageViews: this.pageViews,
                events: this.events.slice(-100), // Keep last 100 events
                userJourney: this.userJourney.slice(-50),
                maxScrollDepth: this.maxScrollDepth
            };
            
            localStorage.setItem('analytics_session', JSON.stringify(data));
        } catch (error) {
            debug.warn('[Analytics] Failed to save session data:', error);
        }
    }
    
    loadSessionData() {
        try {
            const data = localStorage.getItem('analytics_session');
            if (data) {
                const parsed = JSON.parse(data);
                
                // Check if session is still valid (within 30 minutes)
                const sessionAge = Date.now() - parsed.startTime;
                if (sessionAge < 30 * 60 * 1000) {
                    this.sessionId = parsed.sessionId;
                    this.sessionStartTime = parsed.startTime;
                    this.pageViews = parsed.pageViews || 0;
                    this.events = parsed.events || [];
                    this.userJourney = parsed.userJourney || [];
                    this.maxScrollDepth = parsed.maxScrollDepth || 0;
                    
                    debug.log('[Analytics] Session restored:', this.sessionId);
                } else {
                    localStorage.removeItem('analytics_session');
                }
            }
        } catch (error) {
            debug.warn('[Analytics] Failed to load session data:', error);
        }
    }
    
    // Public API
    getSessionSummary() {
        return {
            sessionId: this.sessionId,
            duration: Date.now() - this.sessionStartTime,
            pageViews: this.pageViews,
            eventsCount: this.events.length,
            maxScrollDepth: this.maxScrollDepth,
            conversions: this.events.filter(e => e.type === 'conversion').length
        };
    }
    
    getHeatmapData() {
        return this.heatmapData;
    }
    
    exportAnalytics() {
        return {
            session: this.getSessionSummary(),
            events: this.events,
            userJourney: this.userJourney,
            heatmap: this.heatmapData,
            timestamp: Date.now()
        };
    }
}

// Initialize enhanced analytics
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        globalThis.enhancedAnalytics = new EnhancedAnalytics();
    });
} else {
    globalThis.enhancedAnalytics = new EnhancedAnalytics();
}

// ============================================================================
// Performance Monitoring System (RUM - Real User Monitoring)
// ============================================================================

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            webVitals: {},
            navigation: {},
            resources: [],
            longTasks: [],
            memoryUsage: []
        };
        this.thresholds = {
            lcp: { good: 2500, needsImprovement: 4000 },
            fid: { good: 100, needsImprovement: 300 },
            cls: { good: 0.1, needsImprovement: 0.25 },
            ttfb: { good: 800, needsImprovement: 1800 },
            fcp: { good: 1800, needsImprovement: 3000 }
        };
        
        this.init();
    }
    
    init() {
        debug.log('[Performance] Monitoring system initializing...');
        
        this.trackWebVitals();
        this.trackNavigationTiming();
        this.trackResourceTiming();
        this.trackLongTasks();
        this.trackMemoryUsage();
        this.setupPerformanceObserver();
        
        debug.log('[Performance] Monitoring system initialized');
    }
    
    trackWebVitals() {
        // Largest Contentful Paint (LCP)
        this.observeLCP();
        
        // First Input Delay (FID)
        this.observeFID();
        
        // Cumulative Layout Shift (CLS)
        this.observeCLS();
        
        // First Contentful Paint (FCP)
        this.observeFCP();
        
        // Time to First Byte (TTFB)
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
                debug.log(`[Performance] LCP: ${lcp.toFixed(0)}ms (${rating})`);
                
                this.reportMetric('lcp', lcp, rating);
            });
            
            observer.observe({ type: 'largest-contentful-paint', buffered: true });
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
                    debug.log(`[Performance] FID: ${fid.toFixed(0)}ms (${rating})`);
                    
                    this.reportMetric('fid', fid, rating);
                });
            });
            
            observer.observe({ type: 'first-input', buffered: true });
        } catch (error) {
            debug.warn('[Performance] FID not supported');
        }
    }
    
    observeCLS() {
        try {
            let clsValue = 0;
            let clsEntries = [];
            
            const observer = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                        clsEntries.push(entry);
                    }
                }
                
                this.metrics.webVitals.cls = clsValue;
                
                const rating = this.getRating('cls', clsValue);
                debug.log(`[Performance] CLS: ${clsValue.toFixed(3)} (${rating})`);
                
                this.reportMetric('cls', clsValue, rating);
            });
            
            observer.observe({ type: 'layout-shift', buffered: true });
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
                        debug.log(`[Performance] FCP: ${fcp.toFixed(0)}ms (${rating})`);
                        
                        this.reportMetric('fcp', fcp, rating);
                    }
                });
            });
            
            observer.observe({ type: 'paint', buffered: true });
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
                debug.log(`[Performance] TTFB: ${ttfb.toFixed(0)}ms (${rating})`);
                
                this.reportMetric('ttfb', ttfb, rating);
            }
        });
    }
    
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
                Download: `${this.metrics.navigation.downloadTime.toFixed(0)}ms`,
                Total: `${this.metrics.navigation.totalLoadTime.toFixed(0)}ms`
            });
            
            this.reportNavigationMetrics();
        });
    }
    
    trackResourceTiming() {
        const processResources = () => {
            const resources = performance.getEntriesByType('resource');
            
            this.metrics.resources = resources.map(resource => ({
                name: resource.name,
                type: this.getResourceType(resource),
                duration: resource.duration,
                size: resource.transferSize || 0,
                cached: resource.transferSize === 0 && resource.decodedBodySize > 0
            }));
            
            // Analyze resources
            const analysis = this.analyzeResources();
            debug.log('[Performance] Resource Analysis:', analysis);
        };
        
        window.addEventListener('load', () => {
            setTimeout(processResources, 1000);
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
            cacheHitRate: `${((cachedSize / totalSize) * 100).toFixed(1)}%`,
            byType
        };
    }
    
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
                    
                    // Report long task
                    if (globalThis.enhancedAnalytics) {
                        globalThis.enhancedAnalytics.trackEvent('long_task', {
                            duration: entry.duration,
                            startTime: entry.startTime
                        });
                    }
                }
            });
            
            observer.observe({ type: 'longtask', buffered: true });
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
        sampleMemory(); // Initial sample
    }
    
    setupPerformanceObserver() {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    // Handle different entry types
                    if (entry.entryType === 'measure') {
                        debug.log(`[Performance] Custom measure: ${entry.name} = ${entry.duration.toFixed(2)}ms`);
                    }
                }
            });
            
            observer.observe({ entryTypes: ['measure', 'mark'] });
        } catch (error) {
            debug.warn('[Performance] Performance observer setup failed');
        }
    }
    
    getRating(metric, value) {
        const threshold = this.thresholds[metric];
        if (!threshold) return 'unknown';
        
        if (value <= threshold.good) return 'good';
        if (value <= threshold.needsImprovement) return 'needs-improvement';
        return 'poor';
    }
    
    reportMetric(name, value, rating) {
        if (globalThis.enhancedAnalytics) {
            globalThis.enhancedAnalytics.trackEvent('web_vital', {
                metric: name,
                value,
                rating
            });
        }
        
        // Store in performance metrics
        this.metrics.webVitals[name] = value;
        this.metrics.webVitals[`${name}_rating`] = rating;
    }
    
    reportNavigationMetrics() {
        if (globalThis.enhancedAnalytics) {
            globalThis.enhancedAnalytics.trackEvent('navigation_timing', this.metrics.navigation);
        }
    }
    
    // Public API
    getMetrics() {
        return {
            webVitals: this.metrics.webVitals,
            navigation: this.metrics.navigation,
            resourceCount: this.metrics.resources.length,
            longTaskCount: this.metrics.longTasks.length,
            memoryUsage: this.getAverageMemoryUsage()
        };
    }
    
    getAverageMemoryUsage() {
        if (this.metrics.memoryUsage.length === 0) return null;
        
        const avg = this.metrics.memoryUsage.reduce((sum, m) => sum + m.used, 0) / this.metrics.memoryUsage.length;
        return {
            average: avg,
            current: this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]?.used || 0
        };
    }
    
    generateReport() {
        const report = {
            timestamp: Date.now(),
            webVitals: this.metrics.webVitals,
            navigation: this.metrics.navigation,
            resources: this.analyzeResources(),
            longTasks: {
                count: this.metrics.longTasks.length,
                averageDuration: this.metrics.longTasks.reduce((sum, t) => sum + t.duration, 0) / this.metrics.longTasks.length || 0
            },
            memory: this.getAverageMemoryUsage(),
            score: this.calculatePerformanceScore()
        };
        
        debug.log('[Performance] Report generated:', report);
        return report;
    }
    
    calculatePerformanceScore() {
        const vitals = this.metrics.webVitals;
        let score = 100;
        
        // Deduct points based on ratings
        if (vitals.lcp_rating === 'needs-improvement') score -= 10;
        if (vitals.lcp_rating === 'poor') score -= 20;
        
        if (vitals.fid_rating === 'needs-improvement') score -= 10;
        if (vitals.fid_rating === 'poor') score -= 20;
        
        if (vitals.cls_rating === 'needs-improvement') score -= 10;
        if (vitals.cls_rating === 'poor') score -= 20;
        
        // Deduct for long tasks
        score -= Math.min(this.metrics.longTasks.length * 2, 20);
        
        return Math.max(0, score);
    }
}

// Initialize performance monitor
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        globalThis.performanceMonitor = new PerformanceMonitor();
    });
} else {
    globalThis.performanceMonitor = new PerformanceMonitor();
}

// ============================================================================
// Error Tracking & Reporting System
// ============================================================================

class ErrorTracker {
    constructor() {
        this.errors = [];
        this.errorCounts = new Map();
        this.maxErrors = 100;
        this.reportedErrors = new Set();
        
        this.init();
    }
    
    init() {
        debug.log('[ErrorTracker] Initializing error tracking...');
        
        this.setupGlobalErrorHandler();
        this.setupUnhandledRejectionHandler();
        this.setupResourceErrorHandler();
        this.setupConsoleErrorTracking();
        
        debug.log('[ErrorTracker] Error tracking initialized');
    }
    
    setupGlobalErrorHandler() {
        window.addEventListener('error', (event) => {
            const error = {
                type: 'javascript_error',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error,
                stack: event.error?.stack,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                url: window.location.href
            };
            
            this.trackError(error);
        });
    }
    
    setupUnhandledRejectionHandler() {
        window.addEventListener('unhandledrejection', (event) => {
            const error = {
                type: 'unhandled_promise_rejection',
                message: event.reason?.message || String(event.reason),
                reason: event.reason,
                stack: event.reason?.stack,
                promise: event.promise,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                url: window.location.href
            };
            
            this.trackError(error);
        });
    }
    
    setupResourceErrorHandler() {
        window.addEventListener('error', (event) => {
            if (event.target !== window) {
                const target = event.target;
                const error = {
                    type: 'resource_load_error',
                    resourceType: target.tagName?.toLowerCase() || 'unknown',
                    src: target.src || target.href,
                    timestamp: Date.now(),
                    url: window.location.href
                };
                
                this.trackError(error);
            }
        }, true); // Use capture phase
    }
    
    setupConsoleErrorTracking() {
        // Store original console.error
        this.originalConsoleError = console.error;
        
        // Wrap console.error to track console errors
        const originalError = this.originalConsoleError;
        console.error = (...args) => {
            // Only track if not already in tracking (prevent recursion)
            if (!this._isTracking) {
                const error = {
                    type: 'console_error',
                    message: args.map(arg => String(arg)).join(' '),
                    arguments: args,
                    timestamp: Date.now(),
                    url: window.location.href,
                    stack: new Error().stack
                };
                
                this.trackError(error, false); // Don't show notification for console errors
            }
            
            originalError.apply(console, args);
        };
    }
    
    trackError(error, showNotification = true) {
        // Prevent recursion
        if (this._isTracking) return;
        this._isTracking = true;
        
        try {
            // Add to errors array
            this.errors.push(error);
            
            // Limit array size
            if (this.errors.length > this.maxErrors) {
                this.errors = this.errors.slice(-this.maxErrors);
            }
            
            // Count error occurrences
            const errorKey = `${error.type}:${error.message}`;
            const count = (this.errorCounts.get(errorKey) || 0) + 1;
            this.errorCounts.set(errorKey, count);
            
            // Log error using original console.error to prevent recursion
            if (this.originalConsoleError) {
                this.originalConsoleError.call(console, `[ErrorTracker] ${error.type}:`, error.message);
            }
        
            // Report to analytics
            if (globalThis.enhancedAnalytics) {
                globalThis.enhancedAnalytics.trackEvent('error_occurred', {
                    type: error.type,
                    message: error.message,
                    count
                });
            }
            
            // Show user-friendly notification (only for first occurrence)
            if (showNotification && count === 1 && !this.reportedErrors.has(errorKey)) {
                this.reportedErrors.add(errorKey);
                this.showErrorNotification(error);
            }
            
            // Store in localStorage for debugging
            this.saveErrorLog();
        } catch (trackingError) {
            // If error tracking fails, log to original console
            if (this.originalConsoleError) {
                this.originalConsoleError.call(console, '[ErrorTracker] Failed to track error:', trackingError);
            }
        } finally {
            this._isTracking = false;
        }
    }
    
    showErrorNotification(error) {
        // Only show for critical errors
        if (error.type === 'resource_load_error') return;
        
        const notification = document.createElement('div');
        notification.className = 'error-notification';
        notification.innerHTML = `
            <div class="error-notification-content">
                <div class="error-icon">⚠️</div>
                <div class="error-text">
                    <strong>Something went wrong</strong>
                    <p>We're working on fixing this issue. You can continue using the site.</p>
                </div>
                <button class="error-dismiss" onclick="this.closest('.error-notification').remove()">✕</button>
            </div>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: -100px;
            left: 50%;
            transform: translateX(-50%);
            background: #fee;
            border: 2px solid #fcc;
            border-radius: 12px;
            padding: 16px;
            max-width: 500px;
            width: 90%;
            z-index: 10001;
            transition: top 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.top = '24px';
        }, 100);
        
        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            notification.style.top = '-100px';
            setTimeout(() => notification.remove(), 300);
        }, 10000);
    }
    
    saveErrorLog() {
        try {
            const errorLog = {
                errors: this.errors.slice(-20), // Keep last 20 errors
                timestamp: Date.now()
            };
            
            localStorage.setItem('error_log', JSON.stringify(errorLog));
        } catch (error) {
            debug.warn('[ErrorTracker] Failed to save error log:', error);
        }
    }
    
    // Public API
    getErrors() {
        return this.errors;
    }
    
    getErrorSummary() {
        const byType = {};
        this.errors.forEach(error => {
            byType[error.type] = (byType[error.type] || 0) + 1;
        });
        
        return {
            totalErrors: this.errors.length,
            byType,
            topErrors: Array.from(this.errorCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([error, count]) => ({ error, count }))
        };
    }
    
    clearErrors() {
        this.errors = [];
        this.errorCounts.clear();
        this.reportedErrors.clear();
        localStorage.removeItem('error_log');
        debug.log('[ErrorTracker] Error log cleared');
    }
    
    exportErrors() {
        return {
            errors: this.errors,
            summary: this.getErrorSummary(),
            timestamp: Date.now()
        };
    }
}

// Initialize error tracker
globalThis.errorTracker = new ErrorTracker();

// PWA install prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show custom install button/banner
    showInstallPromotion();
});


function showInstallPromotion() {
    const installBanner = document.createElement('div');
    installBanner.className = 'install-banner';
    installBanner.innerHTML = `
        <div class="install-content">
            <div class="install-icon">📱</div>
            <div class="install-text">
                <strong>Install Portfolio App</strong>
                <p>Add to your home screen for quick access</p>
            </div>
            <button class="install-button" onclick="installPWA()">Install</button>
            <button class="install-dismiss" onclick="this.closest('.install-banner').remove()">✕</button>
        </div>
    `;
    document.body.appendChild(installBanner);
    
    // Auto-show with animation
    setTimeout(() => installBanner.classList.add('show'), 100);
    
    // Store in localStorage to avoid showing repeatedly
    localStorage.setItem('installPromptShown', Date.now().toString());
}

// Install PWA
globalThis.installPWA = async function() {
    if (!deferredPrompt) {
        debug.log('[PWA] Install prompt not available');
        return;
    }
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;
    debug.log(`[PWA] User response to install prompt: ${outcome}`);
    
    // Clear the deferred prompt
    deferredPrompt = null;
    
    // Remove install banner
    const banner = document.querySelector('.install-banner');
    if (banner) {
        banner.remove();
    }
};

// Track app install
window.addEventListener('appinstalled', () => {
    debug.log('[PWA] App installed successfully');
    
    // Track with analytics
    if (globalThis.portfolioAnalytics) {
        globalThis.portfolioAnalytics.trackEvent('pwa_install', {
            platform: navigator.platform,
            userAgent: navigator.userAgent
        });
    }
    
    // Hide install promotion
    const banner = document.querySelector('.install-banner');
    if (banner) {
        banner.remove();
    }
});

// Detect if running as PWA
function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://');
}

// Track PWA usage
if (isPWA()) {
    debug.log('[PWA] Running as installed app');
    
    if (globalThis.portfolioAnalytics) {
        globalThis.portfolioAnalytics.trackEvent('pwa_launch', {
            displayMode: 'standalone'
        });
    }
}

// Resume Generator - Creates a professional PDF-style resume
function generateResume() {
    // Gather information from the page and portfolio data
    const resumeData = {
        name: 'Matthew Anderson',
        title: 'Full-Stack Developer',
        email: 'contact@matthewanderson.dev',
        github: 'github.com/and3rn3t',
        linkedin: 'linkedin.com/in/matthew-anderson',
        website: 'andernet.dev',
        summary: `Passionate full-stack developer with expertise in modern web technologies, home automation, 
and IoT solutions. Experienced in building comprehensive, user-focused applications using 
TypeScript, Python, Swift, React, and PostgreSQL. Strong focus on clean code, innovative 
solutions, and cutting-edge development practices.`,
        skills: {
            frontend: ['HTML5', 'CSS3', 'JavaScript', 'TypeScript', 'React', 'Responsive Design'],
            backend: ['Python', 'Node.js', 'PostgreSQL', 'REST APIs', 'Database Design'],
            tools: ['Git', 'Docker', 'Linux', 'IoT', 'Home Automation', 'Swift']
        },
        highlights: [
            'Clean Code: Writing maintainable, scalable, and efficient code',
            'IoT & Automation: Passionate about smart home technologies and automation',
            'Innovation: Always exploring new technologies and creative solutions'
        ]
    };
    
    // Try to get project data from the page
    const projectCards = document.querySelectorAll('.project-card');
    const projects = [];
    projectCards.forEach(card => {
        const title = card.querySelector('.project-title, h3, .card-title')?.textContent?.trim();
        const description = card.querySelector('.project-description, .card-description, p')?.textContent?.trim();
        const stars = card.querySelector('.star-count, [data-stars]')?.textContent?.trim();
        if (title && description) {
            projects.push({ title, description: description.substring(0, 150), stars });
        }
    });
    
    // Create the resume HTML content
    const resumeHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${resumeData.name} - Resume</title>
    <style>
        @page {
            margin: 0.5in;
            size: letter;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 11pt;
            line-height: 1.4;
            color: #333;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 0.5in;
            background: white;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #8b4513;
        }
        .header h1 {
            font-size: 28pt;
            color: #8b4513;
            margin-bottom: 5px;
            font-weight: 600;
        }
        .header h2 {
            font-size: 14pt;
            color: #666;
            font-weight: 400;
            margin-bottom: 10px;
        }
        .contact-info {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 15px;
            font-size: 10pt;
        }
        .contact-info span {
            color: #555;
        }
        .contact-info a {
            color: #8b4513;
            text-decoration: none;
        }
        .section {
            margin-bottom: 18px;
        }
        .section-title {
            font-size: 13pt;
            font-weight: 600;
            color: #8b4513;
            border-bottom: 1px solid #8b4513;
            padding-bottom: 4px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .summary {
            text-align: justify;
            color: #444;
        }
        .skills-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
        }
        .skill-category h4 {
            font-size: 11pt;
            color: #555;
            margin-bottom: 5px;
            font-weight: 600;
        }
        .skill-category ul {
            list-style: none;
            padding-left: 0;
        }
        .skill-category li {
            font-size: 10pt;
            color: #666;
            margin-bottom: 3px;
            padding-left: 12px;
            position: relative;
        }
        .skill-category li::before {
            content: "•";
            color: #8b4513;
            position: absolute;
            left: 0;
        }
        .highlights-list {
            list-style: none;
        }
        .highlights-list li {
            margin-bottom: 8px;
            padding-left: 20px;
            position: relative;
        }
        .highlights-list li::before {
            content: "✓";
            color: #8b4513;
            font-weight: bold;
            position: absolute;
            left: 0;
        }
        .projects-list {
            display: grid;
            gap: 12px;
        }
        .project-item {
            padding: 10px;
            background: #f9f9f9;
            border-left: 3px solid #8b4513;
            border-radius: 0 4px 4px 0;
        }
        .project-item h4 {
            font-size: 11pt;
            color: #333;
            margin-bottom: 4px;
        }
        .project-item p {
            font-size: 10pt;
            color: #666;
        }
        .footer {
            margin-top: 25px;
            padding-top: 10px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: 9pt;
            color: #888;
        }
        @media print {
            body {
                padding: 0;
            }
            .no-print {
                display: none;
            }
        }
    </style>
</head>
<body>
    <header class="header">
        <h1>${resumeData.name}</h1>
        <h2>${resumeData.title}</h2>
        <div class="contact-info">
            <span>📧 <a href="mailto:${resumeData.email}">${resumeData.email}</a></span>
            <span>🌐 <a href="https://${resumeData.website}">${resumeData.website}</a></span>
            <span>💻 <a href="https://${resumeData.github}">${resumeData.github}</a></span>
            <span>💼 <a href="https://${resumeData.linkedin}">${resumeData.linkedin}</a></span>
        </div>
    </header>

    <section class="section">
        <h3 class="section-title">Professional Summary</h3>
        <p class="summary">${resumeData.summary}</p>
    </section>

    <section class="section">
        <h3 class="section-title">Technical Skills</h3>
        <div class="skills-grid">
            <div class="skill-category">
                <h4>Frontend</h4>
                <ul>
                    ${resumeData.skills.frontend.map(skill => `<li>${skill}</li>`).join('')}
                </ul>
            </div>
            <div class="skill-category">
                <h4>Backend</h4>
                <ul>
                    ${resumeData.skills.backend.map(skill => `<li>${skill}</li>`).join('')}
                </ul>
            </div>
            <div class="skill-category">
                <h4>Tools & Technologies</h4>
                <ul>
                    ${resumeData.skills.tools.map(skill => `<li>${skill}</li>`).join('')}
                </ul>
            </div>
        </div>
    </section>

    <section class="section">
        <h3 class="section-title">Core Competencies</h3>
        <ul class="highlights-list">
            ${resumeData.highlights.map(h => `<li>${h}</li>`).join('')}
        </ul>
    </section>

    ${projects.length > 0 ? `
    <section class="section">
        <h3 class="section-title">Featured Projects</h3>
        <div class="projects-list">
            ${projects.slice(0, 4).map(p => `
            <div class="project-item">
                <h4>${p.title}${p.stars ? ` ⭐ ${p.stars}` : ''}</h4>
                <p>${p.description}</p>
            </div>
            `).join('')}
        </div>
    </section>
    ` : ''}

    <section class="section">
        <h3 class="section-title">Education & Continuous Learning</h3>
        <ul class="highlights-list">
            <li>Self-directed learning in modern web development technologies</li>
            <li>Continuous professional development through practical project experience</li>
            <li>Active participation in open-source community</li>
        </ul>
    </section>

    <footer class="footer">
        <p>Generated from andernet.dev • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </footer>

    <div class="no-print" style="position: fixed; bottom: 20px; right: 20px;">
        <button onclick="window.print()" style="padding: 12px 24px; background: #8b4513; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
            📄 Print / Save as PDF
        </button>
        <button onclick="window.close()" style="margin-left: 10px; padding: 12px 24px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
            ✕ Close
        </button>
    </div>
</body>
</html>`;

    // Open the resume in a new window
    const resumeWindow = window.open('', '_blank', 'width=900,height=1100');
    if (resumeWindow) {
        resumeWindow.document.write(resumeHTML);
        resumeWindow.document.close();
        
        // Track the event
        if (globalThis.portfolioAnalytics) {
            globalThis.portfolioAnalytics.trackEvent('resume_generated', {
                projectsIncluded: projects.length,
                timestamp: new Date().toISOString()
            });
        }
    } else {
        // Popup was blocked - offer to download instead
        alert('Pop-up was blocked. Click OK to download the resume directly.');
        downloadResumeAsHTML(resumeHTML);
    }
}

// Fallback: Download resume as HTML file
function downloadResumeAsHTML(htmlContent) {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Matthew_Anderson_Resume.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Make generateResume available globally
globalThis.generateResume = generateResume;

