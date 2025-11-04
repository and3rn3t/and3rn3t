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
                    console.error(`Operation failed after ${maxRetries} attempts:`, error.message);
                    throw error;
                }
                
                // Exponential backoff with jitter
                const delay = this.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
                console.warn(`Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms:`, error.message);
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
                console.log('✅ Using pre-fetched GitHub data from:', this.cachedData.lastUpdated);
                return this.cachedData;
            }
        } catch (error) {
            console.log('ℹ️ Pre-fetched data not available, using direct API:', error.message);
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
                console.warn(`Rate limit exceeded. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
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
                console.warn(`Attempt ${attempt}/${maxRetries} failed:`, error.message);
                
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
            console.log(`✅ Cache hit for ${endpoint}`);
            return cachedData;
        }

        // Build URL with parameters
        const url = new URL(`${this.baseUrl}${endpoint}`);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }

        return await this.executeWithRetry(async () => {
            console.log(`🌐 Fetching ${endpoint}...`);
            const response = await this.fetchWithRetry(url.toString());
            const data = await response.json();
            
            // Cache the result
            this.setCache(cacheKey, data, ttl);
            console.log(`💾 Cached data for ${endpoint}`);
            
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
            console.warn('Recent activity not available:', error.message);
            return [];
        }
    }

    async getUserEvents(per_page = 30) {
        return this.fetchGitHubData(`/users/${this.username}/events`, { per_page }, 180000); // 3 min cache
    }

    async getGists() {
        return this.fetchGitHubData(`/users/${this.username}/gists`, {}, 300000);
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
    console.log('GitHub API Status:', {
        remaining: status.remaining,
        limit: status.limit,
        resetTime: new Date(status.reset).toLocaleTimeString(),
        percentage: `${status.percentage.toFixed(1)}%`,
        cacheEntries: githubAPI.cache.size
    });
    
    // Add visual indicator if rate limit is low
    if (status.percentage < 20) {
        console.warn('⚠️ GitHub API rate limit is running low!');
    }
}

// Enhanced error handler for API failures with user feedback
function handleAPIError(error, context = 'API request') {
    console.error(`${context} failed:`, error);
    
    const errorMessages = {
        'GitHub API rate limit exceeded': 'Rate limit reached. Data will refresh automatically when limit resets.',
        'Resource not found': 'Some data could not be found. This is normal for newer accounts.',
        'Failed to fetch': 'Network connection issue. Please check your internet connection.'
    };
    
    const userMessage = errorMessages[error.message] || 'Unable to load some GitHub data. Showing cached or fallback content.';
    
    // Show user-friendly error notification
    showErrorNotification(userMessage, context);
    console.info('User message:', userMessage);
    
    return userMessage;
}

// Enhanced global loading progress indicator with task tracking
const loadingManager = {
    activeTasks: new Set(),
    progressBar: null,
    
    addTask(taskName) {
        this.activeTasks.add(taskName);
        this.showProgress();
        console.log(`📊 Loading task started: ${taskName} (${this.activeTasks.size} active)`);
    },
    
    removeTask(taskName) {
        this.activeTasks.delete(taskName);
        console.log(`✅ Loading task completed: ${taskName} (${this.activeTasks.size} remaining)`);
        
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
        console.log(`🧹 Cleared ${removedCount} cache entries (${cacheStats.expiredEntries} expired, ${removedCount - cacheStats.expiredEntries} for memory management)`);
    }
    
    return { removedCount, ...cacheStats };
}

// Preload critical GitHub data
async function preloadCriticalData() {
    try {
        console.log('🚀 Preloading critical GitHub data...');
        
        // Preload user data (long cache)
        await githubAPI.getUserData();
        
        // Preload repositories (medium cache)  
        await githubAPI.getRepositories('stars', 100);
        
        console.log('✅ Critical data preloaded successfully');
    } catch (error) {
        console.warn('⚠️ Failed to preload some data:', error.message);
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
    console.log('🔄 Manually refreshing GitHub data...');
    
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
        console.log('✅ Manual refresh completed');
        
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

        console.log('🖼️ Image format support:', formats);
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
            console.warn(`Failed to load optimized image: ${optimizedSrc}, falling back to original`);
            try {
                await this.preloadImage(originalSrc);
                img.src = originalSrc;
                img.classList.add('loaded');
            } catch (fallbackError) {
                console.error(`Failed to load image: ${originalSrc}`, fallbackError);
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
                console.warn('LCP measurement not supported:', error);
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
                console.warn('FCP measurement not supported:', error);
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
                console.warn('CLS measurement not supported:', error);
            }
        }

        // Log performance metrics after page load
        globalThis.addEventListener('load', () => {
            setTimeout(() => {
                const loadTime = performance.now() - this.performanceMetrics.loadStart;
                console.log('🚀 Performance Metrics:', {
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
        
        console.log('📊 Performance Score:', {
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
        this.floatingToc = document.getElementById('floating-toc');
        this.tocToggle = document.getElementById('toc-toggle');
        this.tocContent = document.getElementById('toc-content');
        this.tocLinks = document.querySelector('.toc-links');
        this.keyboardHelp = document.getElementById('keyboard-help');
        
        this.keySequence = '';
        this.keyTimeout = null;
        this.sections = [];
        
        this.init();
    }
    
    init() {
        this.initScrollProgress();
        this.initFloatingToc();
        this.initKeyboardShortcuts();
        this.initSectionTracking();
        
        // Show floating TOC after user scrolls past hero
        window.addEventListener('scroll', () => {
            const heroHeight = document.querySelector('.hero').offsetHeight;
            if (window.scrollY > heroHeight * 0.5) {
                this.floatingToc.classList.add('visible');
            } else {
                this.floatingToc.classList.remove('visible');
            }
        });
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
    
    initFloatingToc() {
        if (!this.tocToggle || !this.tocContent || !this.tocLinks) return;
        
        // Populate TOC with navigation items
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent;
            
            if (href.startsWith('#')) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = href;
                a.textContent = text;
                a.addEventListener('click', this.handleTocClick.bind(this));
                li.appendChild(a);
                this.tocLinks.appendChild(li);
            }
        });
        
        // Toggle TOC
        this.tocToggle.addEventListener('click', () => {
            const isExpanded = this.tocToggle.getAttribute('aria-expanded') === 'true';
            this.tocToggle.setAttribute('aria-expanded', !isExpanded);
        });
        
        // Close TOC when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.floatingToc.contains(e.target)) {
                this.tocToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }
    
    handleTocClick(e) {
        e.preventDefault();
        const target = document.querySelector(e.target.getAttribute('href'));
        if (target) {
            const offsetTop = target.offsetTop - 70;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
            
            // Close TOC after navigation
            this.tocToggle.setAttribute('aria-expanded', 'false');
        }
    }
    
    initSectionTracking() {
        // Track which section is currently in view
        const sections = document.querySelectorAll('section[id]');
        this.sections = Array.from(sections);
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const id = entry.target.id;
                const tocLink = this.tocLinks.querySelector(`a[href="#${id}"]`);
                
                if (entry.isIntersecting) {
                    // Remove active class from all TOC links
                    this.tocLinks.querySelectorAll('a').forEach(link => {
                        link.classList.remove('active');
                    });
                    // Add active class to current section
                    if (tocLink) {
                        tocLink.classList.add('active');
                    }
                }
            });
        }, {
            rootMargin: '-20% 0px -80% 0px'
        });
        
        this.sections.forEach(section => observer.observe(section));
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
                window.print();
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
        this.keyboardHelp.classList.remove('visible');
        this.tocToggle.setAttribute('aria-expanded', 'false');
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
        const projectSearch = document.getElementById('project-search');
        if (projectSearch && this.saveSearchBtn) {
            // Show/hide save button based on search activity
            projectSearch.addEventListener('input', (e) => {
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
                        console.log(`First Contentful Paint: ${entry.startTime}ms`);
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
        const projectSearch = document.getElementById('project-search');
        if (!projectSearch?.value.trim()) return;
        
        const search = {
            query: projectSearch.value,
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
        const projectSearch = document.getElementById('project-search');
        if (projectSearch) {
            projectSearch.value = search.query;
            projectSearch.dispatchEvent(new Event('input'));
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
        console.error('Failed to load GitHub data:', error);
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
    console.log('📁 Loading GitHub projects...');
    const projectsGrid = document.getElementById('projects-grid');
    
    console.log('Projects grid found:', !!projectsGrid);
    
    try {
        // Load project metadata
        let projectsData = null;
        try {
            const projectsDataResponse = await fetch('projects-data.json');
            projectsData = await projectsDataResponse.json();
        } catch (error) {
            console.warn('Project data file not found, using API data only:', error.message);
        }
        
        // Get repositories using the optimized API manager (now with token-enhanced data)
        const repos = await githubAPI.getRepositories('stars', 100);
        
        console.log('📊 Repository data:', { 
            count: repos.length, 
            usingEnhancedData: !!githubAPI.cachedData,
            source: githubAPI.cachedData ? 'Pre-fetched with token' : 'Direct API (limited)'
        });
        
        // Filter out fork repositories and archived, then sort by stars
        const featuredRepos = repos
            .filter(repo => !repo.fork && !repo.archived)
            .sort((a, b) => b.stargazers_count - a.stargazers_count)
            .slice(0, 9);
        
        if (featuredRepos.length === 0) {
            // If no repositories found, show demo projects
            showDemoProjects(projectsGrid);
            return;
        }
        
        // Clear loading state
        projectsGrid.innerHTML = '';
        
        // Initialize search filter system with project data
        try {
            await projectSearchFilter.loadProjectData();
            projectSearchFilter.updateWithGitHubData(featuredRepos);
        } catch (error) {
            console.warn('Search filter initialization failed:', error);
        }
        
        // Create project cards with enhanced data
        const projectCards = featuredRepos.map(repo => {
            const projectMeta = projectsData?.projects?.find(p => p.name === repo.name);
            return { repo, projectMeta, card: createProjectCard(repo, projectMeta) };
        });
        
        // Store original project cards for filtering
        projectSearchFilter.originalCards = projectCards;
        
        // Render initial projects
        renderFilteredProjects(projectCards);
        
        // Animate project cards after loading
        animateProjectCards();
        
    } catch (error) {
        handleAPIError(error, 'Loading GitHub projects');
        showDemoProjects(projectsGrid);
        displayAPIStatus(); // Show current API status for debugging
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
            <a href="${repo.html_url}" target="_blank" class="project-link">
                <i class="fab fa-github"></i>
                View Code
            </a>
            ${repo.homepage ? `
                <a href="${repo.homepage}" target="_blank" class="project-link secondary">
                    <i class="fas fa-external-link-alt"></i>
                    Live Demo
                </a>
            ` : `
                <a href="${repo.html_url}/blob/main/README.md" target="_blank" class="project-link secondary">
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
                <a href="${project.github}" target="_blank" class="project-link">
                    <i class="fab fa-github"></i>
                    View Code
                </a>
                ${project.demo ? `
                    <a href="${project.demo}" target="_blank" class="project-link secondary">
                        <i class="fas fa-external-link-alt"></i>
                        Live Demo
                    </a>
                ` : `
                    <a href="${project.github}" target="_blank" class="project-link secondary">
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
    const animationElements = document.querySelectorAll('.hero-content, .about-text, .skills-grid');
    
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
                console.log('✅ Successfully loaded projects after retry');
                retryCount = 0;
            }
            
        } catch (error) {
            handleAPIError(error, 'Enhanced project loading');
            retryCount++;
            
            if (retryCount < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s, 8s...
                const delay = baseDelay * Math.pow(2, retryCount - 1);
                console.log(`🔄 Retry ${retryCount}/${maxRetries} in ${delay/1000} seconds...`);
                
                // Add jitter to prevent thundering herd
                const jitteredDelay = delay + Math.random() * 1000;
                
                setTimeout(loadWithRetry, jitteredDelay);
            } else {
                console.error('❌ Failed to load projects after all retries');
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
        // Initialize search filter system early
        await projectSearchFilter.loadProjectData().catch(error => {
            console.warn('Project search filter initialization failed:', error);
        });
        
        // Initialize analytics dashboard
        analytics.initialize().catch(error => {
            console.warn('Analytics dashboard initialization failed:', error);
        });
        
        // Load core data in parallel with smart coordination
        const results = await Promise.allSettled([
            loadGitHubProjects(),
            loadGitHubStats(),
            loadGitHubActivity(),
            loadPinnedRepos(),
            loadTopicsCloud(),
            loadGitHubGists()
        ]);
        
        // Check results and log any failures
        const failed = results.filter(result => result.status === 'rejected');
        if (failed.length > 0) {
            console.warn(`${failed.length} GitHub data requests failed:`, failed);
        }
        
        console.log(`✅ Loaded ${results.length - failed.length}/${results.length} GitHub data sections`);
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
            console.log('Contact method clicked:', this.href);
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
        console.error('stats-grid element not found in DOM');
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
            <div class="stat-card">
                <i class="fas fa-download"></i>
                <div class="stat-content">
                    <h3>${userData.public_gists}</h3>
                    <p>Public Gists</p>
                </div>
            </div>
        `;
        
        statsGrid.innerHTML = statsHTML;
        
        // Load language statistics
        loadLanguageStats(repos);
        
        // Load contribution graph (using GitHub readme stats API)
        contributionGraph.innerHTML = `
            <div class="contribution-widget">
                <img src="https://ghchart.rshah.org/f5576c/and3rn3t" alt="GitHub Contribution Graph" />
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading GitHub stats:', error);
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
function loadLanguageStats(repos) {
    const languageStats = document.getElementById('main-language-stats');
    
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
        console.error('main-language-stats element not found');
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
async function loadGitHubActivity() {
    const activityFeed = document.getElementById('activity-feed');
    
    try {
        // Fetch recent events using optimized API
        const events = await githubAPI.getUserEvents(10);
        
        if (events.length === 0) {
            activityFeed.innerHTML = '<p class="no-activity">No recent activity to display.</p>';
            return;
        }
        
        // Display activity items
        const activityItems = events.slice(0, 8).map(event => {
            const date = new Date(event.created_at);
            const timeAgo = getTimeAgo(date);
            
            let action = '';
            let details = '';
            let icon;
            
            switch(event.type) {
                case 'PushEvent': {
                    icon = 'fa-code-commit';
                    const commits = event.payload.commits?.length || 0;
                    action = `Pushed ${commits} commit${commits === 1 ? '' : 's'} to`;
                    details = event.repo.name;
                    break;
                }
                case 'CreateEvent':
                    icon = 'fa-plus-circle';
                    action = `Created ${event.payload.ref_type}`;
                    details = event.repo.name;
                    break;
                case 'WatchEvent':
                    icon = 'fa-star';
                    action = 'Starred';
                    details = event.repo.name;
                    break;
                case 'ForkEvent':
                    icon = 'fa-code-branch';
                    action = 'Forked';
                    details = event.repo.name;
                    break;
                case 'IssuesEvent':
                    icon = 'fa-circle-dot';
                    action = `${event.payload.action} issue in`;
                    details = event.repo.name;
                    break;
                case 'PullRequestEvent':
                    icon = 'fa-code-pull-request';
                    action = `${event.payload.action} pull request in`;
                    details = event.repo.name;
                    break;
                default:
                    icon = 'fa-circle';
                    action = event.type.replace('Event', '');
                    details = event.repo.name;
            }
            
            return `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="activity-content">
                        <p class="activity-action">${action} <strong>${details}</strong></p>
                        <span class="activity-time">${timeAgo}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        activityFeed.innerHTML = `<div class="activity-list">${activityItems}</div>`;
        
    } catch (error) {
        console.error('Error loading GitHub activity:', error);
        activityFeed.innerHTML = '<p class="error-message">Unable to load recent activity.</p>';
    }
}

// Helper function to calculate time ago
function getTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
        }
    }
    
    return 'just now';
}

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

// Load pinned repositories
async function loadPinnedRepos() {
    const pinnedRepos = document.getElementById('pinned-repos');
    
    try {
        // Fetch all repos and sort by stars to simulate pinned repos
        const repos = await githubAPI.getRepositories('stars', 100);
        
        // Get top starred repositories that are not forks
        const topRepos = repos
            .filter(repo => !repo.fork)
            .sort((a, b) => b.stargazers_count - a.stargazers_count)
            .slice(0, 6);
        
        if (topRepos.length === 0) {
            pinnedRepos.innerHTML = '<p class="no-activity">No pinned repositories to display.</p>';
            return;
        }
        
        pinnedRepos.innerHTML = topRepos.map(repo => `
            <div class="pinned-repo-card">
                <div class="pinned-repo-header">
                    <i class="fas fa-book"></i>
                    <a href="${repo.html_url}" target="_blank" class="pinned-repo-name">${repo.name}</a>
                </div>
                <p class="pinned-repo-desc">${repo.description || 'No description available'}</p>
                <div class="pinned-repo-footer">
                    <div class="pinned-repo-stats">
                        ${repo.language ? `<span class="repo-language"><span class="language-dot"></span>${repo.language}</span>` : ''}
                        <span class="repo-stat"><i class="fas fa-star"></i> ${repo.stargazers_count}</span>
                        <span class="repo-stat"><i class="fas fa-code-branch"></i> ${repo.forks_count}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading pinned repos:', error);
        pinnedRepos.innerHTML = '<p class="error-message">Unable to load pinned repositories.</p>';
    }
}

// Load topics cloud
async function loadTopicsCloud() {
    const topicsCloud = document.getElementById('topics-cloud');
    
    try {
        const repos = await githubAPI.getRepositories('updated', 100);
        
        // Collect all topics
        const topicsCount = {};
        for (const repo of repos) {
            if (repo.topics && repo.topics.length > 0) {
                for (const topic of repo.topics) {
                    topicsCount[topic] = (topicsCount[topic] || 0) + 1;
                }
            }
        }
        
        // Sort by frequency
        const sortedTopics = Object.entries(topicsCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20);
        
        if (sortedTopics.length === 0) {
            topicsCloud.innerHTML = '<p class="no-activity">No topics to display.</p>';
            return;
        }
        
        // Calculate size based on frequency
        const maxCount = sortedTopics[0][1];
        
        topicsCloud.innerHTML = `
            <div class="topics-list">
                ${sortedTopics.map(([topic, count]) => {
                    const size = Math.max(0.8, Math.min(2, count / maxCount * 2));
                    return `<span class="topic-tag" style="font-size: ${size}rem">${topic} (${count})</span>`;
                }).join('')}
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading topics:', error);
        topicsCloud.innerHTML = '<p class="error-message">Unable to load topics.</p>';
    }
}

// Load GitHub Gists
async function loadGitHubGists() {
    const gistsGrid = document.getElementById('gists-grid');
    
    try {
        const gists = await githubAPI.getGists();
        
        if (gists.length === 0) {
            gistsGrid.innerHTML = '<p class="no-activity">No public gists to display.</p>';
            return;
        }
        
        gistsGrid.innerHTML = gists.map(gist => {
            const files = Object.values(gist.files);
            const firstFile = files[0];
            const fileCount = files.length;
            const createdDate = new Date(gist.created_at).toLocaleDateString();
            
            return `
                <div class="gist-card">
                    <div class="gist-header">
                        <i class="fas fa-code"></i>
                        <a href="${gist.html_url}" target="_blank" class="gist-title">
                            ${firstFile.filename}
                        </a>
                    </div>
                    <p class="gist-description">${gist.description || 'No description provided'}</p>
                    <div class="gist-footer">
                        <span class="gist-language">${firstFile.language || 'Text'}</span>
                        ${fileCount > 1 ? `<span class="gist-files">${fileCount} files</span>` : ''}
                        <span class="gist-date">${createdDate}</span>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading gists:', error);
        gistsGrid.innerHTML = '<p class="error-message">Unable to load gists.</p>';
    }
}
// Theme Toggle Functionality
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    
    if (!themeToggle) {
        console.error('❌ Theme toggle button not found! Looking for #theme-toggle');
        return;
    }
    
    const icon = themeToggle.querySelector('i');
    if (!icon) {
        console.error('❌ Theme toggle icon not found! Looking for i element inside theme toggle');
        return;
    }
    
    // Check for saved theme preference or default to light mode
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.toggle('dark-theme', currentTheme === 'dark');
    updateThemeIcon(icon, currentTheme);
    
    console.log('✅ Theme toggle initialized. Current theme:', currentTheme);
    
    themeToggle.addEventListener('click', function() {
        console.log('🎨 Theme toggle clicked');
        const isDark = document.body.classList.toggle('dark-theme');
        const theme = isDark ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
        updateThemeIcon(icon, theme);
        console.log('🎨 Theme changed to:', theme);
        
        // Trigger custom event for other components to listen to
        document.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
    });
}

function updateThemeIcon(icon, theme) {
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Initialize theme toggle with retry mechanism
function attemptThemeToggleInit(attempts = 0) {
    const maxAttempts = 10;
    
    if (attempts >= maxAttempts) {
        console.error('❌ Failed to initialize theme toggle after', maxAttempts, 'attempts');
        return;
    }
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        initThemeToggle();
    } else {
        console.log('⏳ Theme toggle not ready, retrying... (attempt', attempts + 1, ')');
        setTimeout(() => attemptThemeToggleInit(attempts + 1), 100);
    }
}

// Initialize theme toggle
document.addEventListener('DOMContentLoaded', function() {
    attemptThemeToggleInit();
});

// Also try immediate initialization
attemptThemeToggleInit();

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
    console.log('✅ Page loaded, removing loading state');
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
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/css/all.min.css'
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

// Enhanced Project Search and Filter System
class ProjectSearchFilter {
    constructor() {
        this.projects = [];
        this.filteredProjects = [];
        this.categories = [];
        this.technologies = [];
        this.currentFilters = {
            search: '',
            category: '',
            technology: '',
            status: ''
        };
        this.sortConfig = {
            field: 'name',
            direction: 'asc'
        };
        this.viewMode = 'grid';
        this.searchTimeout = null;
        
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.elements = {
            searchInput: document.getElementById('project-search'),
            clearSearch: document.getElementById('clear-search'),
            categoryFilter: document.getElementById('category-filter'),
            technologyFilter: document.getElementById('technology-filter'),
            statusFilter: document.getElementById('status-filter'),
            sortSelect: document.getElementById('sort-select'),
            sortDirection: document.getElementById('sort-direction'),
            gridView: document.getElementById('grid-view'),
            listView: document.getElementById('list-view'),
            resetFilters: document.getElementById('reset-filters'),
            resultsCount: document.getElementById('results-count'),
            projectsGrid: document.getElementById('projects-grid')
        };
    }

    bindEvents() {
        // Search input with debouncing
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.handleSearchInput(e.target.value);
                }, 300);
            });
            
            // Keyboard shortcuts
            this.elements.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.clearSearch();
                }
            });
        }

        // Clear search
        if (this.elements.clearSearch) {
            this.elements.clearSearch.addEventListener('click', () => {
                this.clearSearch();
            });
        }

        // Filter controls
        if (this.elements.categoryFilter) {
            this.elements.categoryFilter.addEventListener('change', (e) => {
                this.currentFilters.category = e.target.value;
                this.applyFiltersAndSort();
            });
        }

        if (this.elements.technologyFilter) {
            this.elements.technologyFilter.addEventListener('change', (e) => {
                this.currentFilters.technology = e.target.value;
                this.applyFiltersAndSort();
            });
        }

        if (this.elements.statusFilter) {
            this.elements.statusFilter.addEventListener('change', (e) => {
                this.currentFilters.status = e.target.value;
                this.applyFiltersAndSort();
            });
        }

        // Sort controls
        if (this.elements.sortSelect) {
            this.elements.sortSelect.addEventListener('change', (e) => {
                this.sortConfig.field = e.target.value;
                this.applyFiltersAndSort();
            });
        }

        if (this.elements.sortDirection) {
            this.elements.sortDirection.addEventListener('click', () => {
                this.toggleSortDirection();
            });
        }

        // View controls
        if (this.elements.gridView) {
            this.elements.gridView.addEventListener('click', () => {
                this.setViewMode('grid');
            });
        }

        if (this.elements.listView) {
            this.elements.listView.addEventListener('click', () => {
                this.setViewMode('list');
            });
        }

        // Reset filters
        if (this.elements.resetFilters) {
            this.elements.resetFilters.addEventListener('click', () => {
                this.resetAllFilters();
            });
        }
        
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Focus search with Ctrl/Cmd + K
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.elements.searchInput?.focus();
            }
            
            // Reset filters with Ctrl/Cmd + R (when search is focused)
            if ((e.ctrlKey || e.metaKey) && e.key === 'r' && 
                document.activeElement === this.elements.searchInput) {
                e.preventDefault();
                this.resetAllFilters();
            }
        });
    }

    async loadProjectData() {
        try {
            const response = await fetch('./projects-data.json');
            const data = await response.json();
            
            this.projects = data.projects || [];
            this.categories = data.categories || [];
            
            // Extract unique technologies
            this.technologies = [...new Set(
                this.projects.flatMap(project => project.technologies || [])
            )].sort((a, b) => a.localeCompare(b));

            this.populateFilterOptions();
            this.filteredProjects = [...this.projects];
            this.updateResultsCount();
            
        } catch (error) {
            console.error('Failed to load project data:', error);
            // Fallback to empty arrays
            this.projects = [];
            this.categories = [];
            this.technologies = [];
            this.filteredProjects = [];
        }
    }

    populateFilterOptions() {
        // Populate category filter
        if (this.elements.categoryFilter) {
            for (const category of this.categories) {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                this.elements.categoryFilter.appendChild(option);
            }
        }

        // Populate technology filter
        if (this.elements.technologyFilter) {
            for (const tech of this.technologies) {
                const option = document.createElement('option');
                option.value = tech;
                option.textContent = tech;
                this.elements.technologyFilter.appendChild(option);
            }
        }
    }

    handleSearchInput(searchTerm) {
        this.currentFilters.search = searchTerm.toLowerCase();
        
        // Show/hide clear button
        if (this.elements.clearSearch) {
            this.elements.clearSearch.classList.toggle('hidden', !searchTerm);
        }

        this.applyFiltersAndSort();
    }

    clearSearch() {
        if (this.elements.searchInput) {
            this.elements.searchInput.value = '';
        }
        if (this.elements.clearSearch) {
            this.elements.clearSearch.classList.add('hidden');
        }
        this.currentFilters.search = '';
        this.applyFiltersAndSort();
    }

    applyFiltersAndSort() {
        // Apply filters
        this.filteredProjects = this.projects.filter(project => {
            // Search filter
            if (this.currentFilters.search) {
                const searchFields = [
                    project.name,
                    project.displayName,
                    project.description,
                    project.longDescription,
                    ...(project.technologies || []),
                    project.category
                ].join(' ').toLowerCase();

                if (!searchFields.includes(this.currentFilters.search)) {
                    return false;
                }
            }

            // Category filter
            if (this.currentFilters.category && project.category !== this.currentFilters.category) {
                return false;
            }

            // Technology filter
            if (this.currentFilters.technology) {
                const projectTech = project.technologies || [];
                if (!projectTech.includes(this.currentFilters.technology)) {
                    return false;
                }
            }

            // Status filter
            if (this.currentFilters.status && project.status !== this.currentFilters.status) {
                return false;
            }

            return true;
        });

        // Apply sorting
        this.sortProjects();
        
        // Update display
        this.updateResultsCount();
        this.renderProjects();
    }

    sortProjects() {
        this.filteredProjects.sort((a, b) => {
            let aVal, bVal;

            switch (this.sortConfig.field) {
                case 'name':
                    aVal = a.displayName || a.name;
                    bVal = b.displayName || b.name;
                    break;
                case 'category':
                    aVal = a.category || '';
                    bVal = b.category || '';
                    break;
                case 'stars':
                    aVal = a.githubData?.stars || 0;
                    bVal = b.githubData?.stars || 0;
                    break;
                case 'updated':
                    aVal = a.githubData?.updated || new Date(0);
                    bVal = b.githubData?.updated || new Date(0);
                    break;
                case 'created':
                    aVal = a.githubData?.created || new Date(0);
                    bVal = b.githubData?.created || new Date(0);
                    break;
                default:
                    aVal = a.name;
                    bVal = b.name;
            }

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            let comparison = 0;
            if (aVal < bVal) comparison = -1;
            else if (aVal > bVal) comparison = 1;

            return this.sortConfig.direction === 'asc' ? comparison : -comparison;
        });
    }

    toggleSortDirection() {
        this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        
        if (this.elements.sortDirection) {
            this.elements.sortDirection.classList.toggle('desc', this.sortConfig.direction === 'desc');
            
            const icon = this.elements.sortDirection.querySelector('i');
            if (icon) {
                icon.className = this.sortConfig.direction === 'asc' 
                    ? 'fas fa-sort-alpha-down' 
                    : 'fas fa-sort-alpha-up';
            }
        }

        this.applyFiltersAndSort();
    }

    setViewMode(mode) {
        this.viewMode = mode;

        // Update button states
        if (this.elements.gridView && this.elements.listView) {
            this.elements.gridView.classList.toggle('active', mode === 'grid');
            this.elements.listView.classList.toggle('active', mode === 'list');
        }

        // Update grid class
        if (this.elements.projectsGrid) {
            this.elements.projectsGrid.classList.toggle('list-view', mode === 'list');
        }
    }

    resetAllFilters() {
        // Reset filter values
        this.currentFilters = {
            search: '',
            category: '',
            technology: '',
            status: ''
        };

        // Reset form elements
        if (this.elements.searchInput) this.elements.searchInput.value = '';
        if (this.elements.clearSearch) this.elements.clearSearch.classList.add('hidden');
        if (this.elements.categoryFilter) this.elements.categoryFilter.value = '';
        if (this.elements.technologyFilter) this.elements.technologyFilter.value = '';
        if (this.elements.statusFilter) this.elements.statusFilter.value = '';

        // Reset sort to default
        this.sortConfig = { field: 'name', direction: 'asc' };
        if (this.elements.sortSelect) this.elements.sortSelect.value = 'name';
        if (this.elements.sortDirection) {
            this.elements.sortDirection.classList.remove('desc');
            const icon = this.elements.sortDirection.querySelector('i');
            if (icon) icon.className = 'fas fa-sort-alpha-down';
        }

        this.applyFiltersAndSort();
    }

    updateResultsCount() {
        if (this.elements.resultsCount) {
            const count = this.filteredProjects.length;
            const projectWord = count === 1 ? 'project' : 'projects';
            this.elements.resultsCount.textContent = `${count} ${projectWord}`;
        }
    }

    renderProjects() {
        if (!this.elements.projectsGrid) return;

        if (this.filteredProjects.length === 0) {
            this.renderNoResults();
            return;
        }

        // For now, trigger the existing project rendering
        // This will be enhanced when we integrate with the existing project display logic
        const event = new CustomEvent('projectsFiltered', {
            detail: { projects: this.filteredProjects, viewMode: this.viewMode }
        });
        document.dispatchEvent(event);
    }

    renderNoResults() {
        if (!this.elements.projectsGrid) return;

        this.elements.projectsGrid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No projects found</h3>
                <p>Try adjusting your search criteria or filters.</p>
            </div>
        `;
    }

    // Integration method for existing project loading
    updateWithGitHubData(githubProjects) {
        // Enhance projects with GitHub data for sorting
        if (githubProjects && Array.isArray(githubProjects)) {
            for (const project of this.projects) {
                const githubMatch = githubProjects.find(gh => 
                    gh.name === project.name || gh.name === project.github_repo?.split('/')[1]
                );
                
                if (githubMatch) {
                    project.githubData = {
                        stars: githubMatch.stargazers_count || 0,
                        forks: githubMatch.forks_count || 0,
                        updated: new Date(githubMatch.updated_at),
                        created: new Date(githubMatch.created_at),
                        language: githubMatch.language
                    };
                }
            }
            
            // Re-apply current filters and sorting
            this.applyFiltersAndSort();
        }
    }
}

// Initialize search and filter system
const projectSearchFilter = new ProjectSearchFilter();

// Advanced GitHub Analytics Dashboard
class GitHubAnalyticsDashboard {
    currentTab = 'overview';
    
    constructor() {
        this.chartInstances = new Map();
        this.analyticsData = {
            overview: null,
            contributions: null,
            languages: null,
            activity: null
        };
        
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.elements = {
            tabs: document.querySelectorAll('.analytics-tab'),
            panels: document.querySelectorAll('.analytics-panel'),
            heatmapYear: document.getElementById('heatmap-year'),
            frequencyPeriod: document.getElementById('frequency-period'),
            
            // Content containers
            overviewStats: document.getElementById('overview-stats'),
            topReposChart: document.getElementById('top-repos-chart'),
            contributionHeatmap: document.getElementById('contribution-heatmap'),
            contributionStats: document.getElementById('contribution-stats'),
            languageStats: document.getElementById('language-stats'),
            dailyActivity: document.getElementById('daily-activity'),
            
            // Canvas elements for charts
            monthlyContributionsChart: document.getElementById('monthly-contributions-chart'),
            languagePieChart: document.getElementById('language-pie-chart'),
            languageTrendsChart: document.getElementById('language-trends-chart'),
            codeFrequencyChart: document.getElementById('code-frequency-chart'),
            commitPatternsChart: document.getElementById('commit-patterns-chart')
        };
    }

    bindEvents() {
        // Tab switching
        for (const tab of this.elements.tabs) {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        }

        // Year selector for contributions
        if (this.elements.heatmapYear) {
            this.elements.heatmapYear.addEventListener('change', (e) => {
                this.updateContributionHeatmap(Number.parseInt(e.target.value, 10));
            });
        }

        // Period selector for code frequency
        if (this.elements.frequencyPeriod) {
            this.elements.frequencyPeriod.addEventListener('change', (e) => {
                this.updateCodeFrequencyChart(e.target.value);
            });
        }
    }

    switchTab(tabName) {
        // Update active tab
        for (const tab of this.elements.tabs) {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        }

        // Update active panel
        for (const panel of this.elements.panels) {
            panel.classList.toggle('active', panel.id === `${tabName}-panel`);
        }

        this.currentTab = tabName;

        // Load data for the selected tab if not already loaded
        this.loadTabData(tabName);
    }

    async loadTabData(tabName) {
        try {
            switch (tabName) {
                case 'overview':
                    if (!this.analyticsData.overview) {
                        await this.loadOverviewData();
                    }
                    break;
                case 'contributions':
                    if (!this.analyticsData.contributions) {
                        await this.loadContributionData();
                    }
                    break;
                case 'languages':
                    if (!this.analyticsData.languages) {
                        await this.loadLanguageData();
                    }
                    break;
                case 'activity':
                    if (!this.analyticsData.activity) {
                        await this.loadActivityData();
                    }
                    break;
            }
        } catch (error) {
            console.error(`Failed to load ${tabName} data:`, error);
            this.showErrorState(tabName);
        }
    }

    async loadOverviewData() {
        console.log('📊 Loading overview analytics data...');
        
        try {
            // Get repository data from GitHub API
            const repos = await githubAPI.getRepositories('updated', 100);
            const user = await githubAPI.getUserInfo();

            // Calculate overview statistics
            const stats = this.calculateOverviewStats(repos, user);
            this.analyticsData.overview = stats;

            // Render overview data
            this.renderOverviewStats(stats);
            this.renderTopRepositoriesChart(repos.slice(0, 10));

        } catch (error) {
            console.error('Failed to load overview data:', error);
            throw error;
        }
    }

    calculateOverviewStats(repos, user) {
        const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
        const totalForks = repos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);
        const languages = new Set(repos.map(repo => repo.language).filter(Boolean));
        const publicRepos = repos.filter(repo => !repo.private).length;

        return {
            totalRepos: publicRepos,
            totalStars,
            totalForks,
            languages: languages.size,
            followers: user.followers || 0,
            following: user.following || 0,
            publicGists: user.public_gists || 0,
            createdAt: user.created_at
        };
    }

    renderOverviewStats(stats) {
        if (!this.elements.overviewStats) return;

        const joinedDate = new Date(stats.createdAt);
        const yearsOnGitHub = new Date().getFullYear() - joinedDate.getFullYear();

        this.elements.overviewStats.innerHTML = `
            <div class="stat-item">
                <span class="stat-value">${stats.totalRepos}</span>
                <span class="stat-label">Public Repos</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${stats.totalStars}</span>
                <span class="stat-label">Total Stars</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${stats.totalForks}</span>
                <span class="stat-label">Total Forks</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${stats.languages}</span>
                <span class="stat-label">Languages</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${stats.followers}</span>
                <span class="stat-label">Followers</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${yearsOnGitHub}+</span>
                <span class="stat-label">Years on GitHub</span>
            </div>
        `;
    }

    renderTopRepositoriesChart(repos) {
        if (!this.elements.topReposChart) return;

        const maxStars = Math.max(...repos.map(repo => repo.stargazers_count || 0));

        this.elements.topReposChart.innerHTML = repos.map(repo => {
            const stars = repo.stargazers_count || 0;
            const width = maxStars > 0 ? (stars / maxStars) * 100 : 0;

            return `
                <div class="repo-bar">
                    <div class="repo-name">${repo.name}</div>
                    <div class="repo-bar-container">
                        <div class="repo-bar-fill" style="width: ${width}%">
                            <span class="repo-stars">${stars} ⭐</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async loadContributionData() {
        console.log('📈 Loading contribution analytics data...');
        
        try {
            // Generate mock contribution data (in a real app, this would come from GitHub's GraphQL API)
            const contributionData = this.generateMockContributionData();
            this.analyticsData.contributions = contributionData;

            // Render contribution visualizations
            this.renderContributionHeatmap(contributionData);
            this.renderContributionStats(contributionData);
            this.renderMonthlyContributionsChart(contributionData);

        } catch (error) {
            console.error('Failed to load contribution data:', error);
            throw error;
        }
    }

    generateMockContributionData(year = 2025) {
        const data = [];
        const startDate = new Date(year, 0, 1);
        const endDate = year === new Date().getFullYear() ? new Date() : new Date(year, 11, 31);
        
        // Generate daily contribution data
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            
            // More likely to contribute on weekdays
            const baseChance = isWeekend ? 0.3 : 0.7;
            const hasContribution = Math.random() < baseChance;
            
            let contributions = 0;
            if (hasContribution) {
                // Random number of contributions (0-15)
                contributions = Math.floor(Math.random() * 15) + 1;
            }

            data.push({
                date: new Date(d),
                contributions,
                level: this.getContributionLevel(contributions)
            });
        }

        return data;
    }

    getContributionLevel(contributions) {
        if (contributions === 0) return 0;
        if (contributions <= 3) return 1;
        if (contributions <= 7) return 2;
        if (contributions <= 12) return 3;
        return 4;
    }

    renderContributionHeatmap(data) {
        if (!this.elements.contributionHeatmap) return;

        // Create heatmap grid
        const heatmapHTML = data.map(day => {
            const dateStr = day.date.toISOString().split('T')[0];
            return `
                <div class="heatmap-day" 
                     data-level="${day.level}"
                     data-date="${dateStr}"
                     title="${day.contributions} contributions on ${dateStr}">
                </div>
            `;
        }).join('');

        this.elements.contributionHeatmap.innerHTML = `
            <div class="contribution-heatmap">
                ${heatmapHTML}
            </div>
        `;
    }

    renderContributionStats(data) {
        if (!this.elements.contributionStats) return;

        const totalContributions = data.reduce((sum, day) => sum + day.contributions, 0);
        const activeDays = data.filter(day => day.contributions > 0).length;
        const maxStreak = this.calculateMaxStreak(data);
        const currentStreak = this.calculateCurrentStreak(data);

        this.elements.contributionStats.innerHTML = `
            <div class="contrib-stat">
                <div class="value">${totalContributions}</div>
                <div class="label">Total Contributions</div>
            </div>
            <div class="contrib-stat">
                <div class="value">${activeDays}</div>
                <div class="label">Active Days</div>
            </div>
            <div class="contrib-stat">
                <div class="value">${maxStreak}</div>
                <div class="label">Longest Streak</div>
            </div>
            <div class="contrib-stat">
                <div class="value">${currentStreak}</div>
                <div class="label">Current Streak</div>
            </div>
        `;
    }

    calculateMaxStreak(data) {
        let maxStreak = 0;
        let currentStreak = 0;

        for (const day of data) {
            if (day.contributions > 0) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 0;
            }
        }

        return maxStreak;
    }

    calculateCurrentStreak(data) {
        let streak = 0;
        
        // Count backwards from today
        for (let i = data.length - 1; i >= 0; i--) {
            if (data[i].contributions > 0) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    renderMonthlyContributionsChart(data) {
        const canvas = this.elements.monthlyContributionsChart;
        if (!canvas) return;

        // Destroy existing chart if it exists
        if (this.chartInstances.has('monthlyContributions')) {
            this.chartInstances.get('monthlyContributions').destroy();
        }

        // Group data by month
        const monthlyData = this.groupContributionsByMonth(data);
        
        // Create chart using Chart.js (placeholder for now)
        this.createBarChart(canvas, 'monthlyContributions', monthlyData);
    }

    groupContributionsByMonth(data) {
        const months = {};
        
        for (const day of data) {
            const monthKey = `${day.date.getFullYear()}-${day.date.getMonth()}`;
            if (!months[monthKey]) {
                months[monthKey] = 0;
            }
            months[monthKey] += day.contributions;
        }

        return Object.entries(months).map(([key, value]) => {
            const [year, month] = key.split('-');
            return {
                label: new Date(year, month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                value
            };
        });
    }

    async loadLanguageData() {
        console.log('💻 Loading language analytics data...');
        
        try {
            const repos = await githubAPI.getRepositories('updated', 100);
            const languageData = this.analyzeLanguageUsage(repos);
            this.analyticsData.languages = languageData;

            this.renderLanguageStats(languageData);
            this.renderLanguagePieChart(languageData);
            this.renderLanguageTrendsChart(languageData);

        } catch (error) {
            console.error('Failed to load language data:', error);
            throw error;
        }
    }

    analyzeLanguageUsage(repos) {
        const languages = {};
        let totalSize = 0;

        // Aggregate language usage
        for (const repo of repos) {
            if (repo.language) {
                const size = repo.size || 1;
                languages[repo.language] = (languages[repo.language] || 0) + size;
                totalSize += size;
            }
        }

        // Convert to array with percentages
        const languageArray = Object.entries(languages)
            .map(([name, size]) => ({
                name,
                size,
                percentage: ((size / totalSize) * 100).toFixed(1),
                color: this.getLanguageColor(name),
                repos: repos.filter(repo => repo.language === name).length
            }))
            .sort((a, b) => b.size - a.size);

        return languageArray;
    }

    getLanguageColor(language) {
        const colors = {
            'JavaScript': '#f7df1e',
            'TypeScript': '#3178c6',
            'Python': '#3776ab',
            'Java': '#ed8b00',
            'C++': '#00599c',
            'C#': '#239120',
            'Go': '#00add8',
            'Rust': '#000000',
            'Swift': '#fa7343',
            'Kotlin': '#7f52ff',
            'PHP': '#777bb4',
            'Ruby': '#cc342d',
            'HTML': '#e34f26',
            'CSS': '#1572b6',
            'Shell': '#89e051'
        };

        return colors[language] || '#6b7280';
    }

    renderLanguageStats(languages) {
        if (!this.elements.languageStats) return;

        const maxSize = Math.max(...languages.map(lang => lang.size));

        this.elements.languageStats.innerHTML = languages.slice(0, 10).map(lang => {
            const width = (lang.size / maxSize) * 100;

            return `
                <div class="language-item">
                    <div class="language-color" style="background-color: ${lang.color}"></div>
                    <div class="language-name">${lang.name}</div>
                    <div class="language-bar">
                        <div class="language-bar-fill" style="width: ${width}%"></div>
                    </div>
                    <div class="language-percentage">${lang.percentage}%</div>
                </div>
            `;
        }).join('');
    }

    renderLanguagePieChart(languages) {
        const canvas = this.elements.languagePieChart;
        if (!canvas) return;

        if (this.chartInstances.has('languagePie')) {
            this.chartInstances.get('languagePie').destroy();
        }

        this.createPieChart(canvas, 'languagePie', languages.slice(0, 8));
    }

    renderLanguageTrendsChart(languages) {
        const canvas = this.elements.languageTrendsChart;
        if (!canvas) return;

        if (this.chartInstances.has('languageTrends')) {
            this.chartInstances.get('languageTrends').destroy();
        }

        // Generate mock trend data
        const trendData = this.generateLanguageTrendData(languages.slice(0, 5));
        this.createLineChart(canvas, 'languageTrends', trendData);
    }

    generateLanguageTrendData(languages) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
        
        return languages.map(lang => ({
            label: lang.name,
            color: lang.color,
            data: months.map(() => Math.floor(Math.random() * 100))
        }));
    }

    async loadActivityData() {
        console.log('⚡ Loading activity analytics data...');
        
        try {
            // Generate mock activity data
            const activityData = this.generateActivityData();
            this.analyticsData.activity = activityData;

            this.renderCodeFrequencyChart(activityData.codeFrequency);
            this.renderCommitPatternsChart(activityData.commitPatterns);
            this.renderDailyActivity(activityData.dailyActivity);

        } catch (error) {
            console.error('Failed to load activity data:', error);
            throw error;
        }
    }

    generateActivityData() {
        return {
            codeFrequency: this.generateCodeFrequencyData(),
            commitPatterns: this.generateCommitPatternData(),
            dailyActivity: this.generateDailyActivityData()
        };
    }

    generateCodeFrequencyData() {
        const weeks = 52;
        const data = [];

        for (let i = 0; i < weeks; i++) {
            data.push({
                week: `Week ${i + 1}`,
                additions: Math.floor(Math.random() * 500) + 50,
                deletions: Math.floor(Math.random() * 200) + 10
            });
        }

        return data;
    }

    generateCommitPatternData() {
        const hours = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            commits: Math.floor(Math.random() * 20) + (i >= 9 && i <= 17 ? 20 : 5)
        }));

        return hours;
    }

    generateDailyActivityData() {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const hours = Array.from({ length: 24 }, (_, i) => i);
        const activity = [];

        for (const day of days) {
            for (const hour of hours) {
                const isWorkHour = hour >= 9 && hour <= 17;
                const isWeekday = !['Sun', 'Sat'].includes(day);
                const intensity = Math.floor(Math.random() * 5);
                
                activity.push({
                    day,
                    hour,
                    intensity: isWorkHour && isWeekday ? Math.min(intensity + 2, 4) : intensity
                });
            }
        }

        return activity;
    }

    renderCodeFrequencyChart(data) {
        const canvas = this.elements.codeFrequencyChart;
        if (!canvas) return;

        if (this.chartInstances.has('codeFrequency')) {
            this.chartInstances.get('codeFrequency').destroy();
        }

        this.createAreaChart(canvas, 'codeFrequency', data);
    }

    renderCommitPatternsChart(data) {
        const canvas = this.elements.commitPatternsChart;
        if (!canvas) return;

        if (this.chartInstances.has('commitPatterns')) {
            this.chartInstances.get('commitPatterns').destroy();
        }

        this.createBarChart(canvas, 'commitPatterns', data);
    }

    renderDailyActivity(data) {
        if (!this.elements.dailyActivity) return;

        const grid = data.map(item => 
            `<div class="activity-hour" 
                  data-intensity="${item.intensity}"
                  title="${item.day} ${item.hour}:00 - ${item.intensity} commits">
             </div>`
        ).join('');

        this.elements.dailyActivity.innerHTML = `
            <div class="activity-heatmap">
                ${grid}
            </div>
        `;
    }

    // Chart creation methods using Chart.js
    createBarChart(canvas, id, data) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded, showing placeholder');
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Chart.js Loading...', canvas.width / 2, canvas.height / 2);
            return;
        }

        const isDark = document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#f4e6d3' : '#2d1810';
        const gridColor = isDark ? '#3e2723' : '#d7c4b8';

        new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: data.labels || ['No Data'],
                datasets: [{
                    label: data.label || 'Data',
                    data: data.values || [0],
                    backgroundColor: ['#8b4513', '#ff6b35', '#800020', '#ff8c42', '#a0522d', '#d2b48c'],
                    borderColor: isDark ? '#2d1810' : '#ffffff',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    createPieChart(canvas, id, data) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded, showing placeholder');
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ff6b35';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Chart.js Loading...', canvas.width / 2, canvas.height / 2);
            return;
        }

        const isDark = document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#f4e6d3' : '#2d1810';

        new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: data.labels || ['No Data'],
                datasets: [{
                    data: data.values || [100],
                    backgroundColor: [
                        '#8b4513', '#ff6b35', '#800020', '#ff8c42', 
                        '#a0522d', '#d2b48c', '#654321', '#bc9a6a'
                    ],
                    borderColor: isDark ? '#2d1810' : '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            color: textColor,
                            padding: 15,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    createLineChart(canvas, id, data) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded, showing placeholder');
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ff6b35';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Chart.js Loading...', canvas.width / 2, canvas.height / 2);
            return;
        }

        const isDark = document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#f4e6d3' : '#2d1810';
        const gridColor = isDark ? '#3e2723' : '#d7c4b8';

        new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: data.labels || ['No Data'],
                datasets: [{
                    label: data.label || 'Trend',
                    data: data.values || [0],
                    borderColor: '#ff6b35',
                    backgroundColor: 'rgba(255, 107, 53, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointBackgroundColor: '#ff6b35',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    createAreaChart(canvas, id, data) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded, showing placeholder');
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#800020';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Chart.js Loading...', canvas.width / 2, canvas.height / 2);
            return;
        }

        const isDark = document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#f4e6d3' : '#2d1810';
        const gridColor = isDark ? '#3e2723' : '#d7c4b8';

        new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: data.labels || ['No Data'],
                datasets: [{
                    label: data.label || 'Area Data',
                    data: data.values || [0],
                    borderColor: '#800020',
                    backgroundColor: 'rgba(128, 0, 32, 0.2)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#800020',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    showErrorState(tabName) {
        const panel = document.getElementById(`${tabName}-panel`);
        if (panel) {
            const cards = panel.querySelectorAll('.analytics-card .card-content');
            for (const card of cards) {
                card.innerHTML = `
                    <div class="error-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Failed to load ${tabName} data</p>
                        <button onclick="analytics.loadTabData('${tabName}')" class="retry-btn">
                            Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    updateContributionHeatmap(year) {
        // Regenerate contribution data for the selected year
        const contributionData = this.generateMockContributionData(year);
        this.renderContributionHeatmap(contributionData);
        this.renderContributionStats(contributionData);
    }

    updateCodeFrequencyChart(period) {
        // Update the code frequency chart based on the selected period
        if (this.analyticsData.activity) {
            const data = this.processCodeFrequencyByPeriod(this.analyticsData.activity.codeFrequency, period);
            this.renderCodeFrequencyChart(data);
        }
    }

    processCodeFrequencyByPeriod(data, period) {
        // Group data by the selected period (weekly, monthly, quarterly)
        switch (period) {
            case 'monthly':
                return this.groupDataByMonth(data);
            case 'quarterly':
                return this.groupDataByQuarter(data);
            default:
                return data; // weekly is default
        }
    }

    groupDataByMonth(data) {
        // Group weekly data into months
        const months = {};
        data.forEach((week, index) => {
            const monthIndex = Math.floor(index / 4);
            if (!months[monthIndex]) {
                months[monthIndex] = { additions: 0, deletions: 0 };
            }
            months[monthIndex].additions += week.additions;
            months[monthIndex].deletions += week.deletions;
        });

        return Object.entries(months).map(([index, values]) => ({
            period: `Month ${Number.parseInt(index, 10) + 1}`,
            ...values
        }));
    }

    groupDataByQuarter(data) {
        // Group weekly data into quarters
        const quarters = {};
        data.forEach((week, index) => {
            const quarterIndex = Math.floor(index / 13);
            if (!quarters[quarterIndex]) {
                quarters[quarterIndex] = { additions: 0, deletions: 0 };
            }
            quarters[quarterIndex].additions += week.additions;
            quarters[quarterIndex].deletions += week.deletions;
        });

        return Object.entries(quarters).map(([index, values]) => ({
            period: `Q${Number.parseInt(index, 10) + 1}`,
            ...values
        }));
    }

    async initialize() {
        console.log('🚀 Initializing GitHub Analytics Dashboard...');
        
        // Load initial tab data
        await this.loadTabData(this.currentTab);
    }
}

// Initialize analytics dashboard
const analytics = new GitHubAnalyticsDashboard();

// Project rendering functions
function renderFilteredProjects(projectCards) {
    const projectsGrid = document.getElementById('projects-grid');
    if (!projectsGrid) return;

    projectsGrid.innerHTML = '';
    
    for (const { card } of projectCards) {
        projectsGrid.appendChild(card);
    }
}

// Listen for filtered projects events
document.addEventListener('projectsFiltered', (event) => {
    const { projects, viewMode } = event.detail;
    const projectsGrid = document.getElementById('projects-grid');
    
    if (!projectsGrid || !projectSearchFilter?.originalCards) return;

    // Filter original cards based on filtered projects
    const filteredCards = projectSearchFilter.originalCards.filter(({ repo, projectMeta }) => {
        return projects.some(project => {
            return project.name === repo.name || 
                   project.name === (projectMeta?.name) ||
                   project.github_repo?.endsWith(`/${repo.name}`);
        });
    });

    // Update view mode
    projectsGrid.classList.toggle('list-view', viewMode === 'list');
    
    // Render filtered cards
    renderFilteredProjects(filteredCards);
    
    // Re-animate if needed
    if (filteredCards.length > 0) {
        setTimeout(() => animateProjectCards(), 100);
    }
});

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
            console.warn(`⚠️ Performance Budget Violation: ${metric}`, {
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
        
        console.log('📊 Performance Budget Report:', report);
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
    console.log('📊 Event tracked:', { category, action, label, value });
    
    // Send custom event data if Cloudflare beacon is available
    if (typeof globalThis.cf_observer !== 'undefined') {
        // Custom events would go here when Cloudflare adds support
        console.log('🌐 Cloudflare analytics active');
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
        console.log('⚡ Performance event:', perfData);
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

// Load Top Starred Projects with detailed stats
async function loadTopStarredProjects() {
    const topProjectsStats = document.getElementById('top-projects-stats');
    
    try {
        // Load project metadata
        let projectsData = null;
        try {
            const projectsDataResponse = await fetch('projects-data.json');
            projectsData = await projectsDataResponse.json();
        } catch (error) {
            console.warn('Project data file not found:', error.message);
        }
        
        // Get repositories sorted by stars
        const repos = await githubAPI.getRepositories('stars', 100);
        
        // Get top 3 starred non-fork, non-archived repositories
        const topRepos = repos
            .filter(repo => !repo.fork && !repo.archived && repo.stargazers_count > 0)
            .sort((a, b) => b.stargazers_count - a.stargazers_count)
            .slice(0, 3);
        
        if (topRepos.length === 0) {
            topProjectsStats.innerHTML = '<p class="no-activity">No starred projects to highlight yet.</p>';
            return;
        }
        
        // Calculate total stats
        const totalStars = topRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
        const totalForks = topRepos.reduce((sum, repo) => sum + repo.forks_count, 0);
        
        topProjectsStats.innerHTML = `
            <div class="top-projects-summary">
                <div class="summary-stat">
                    <i class="fas fa-star"></i>
                    <div class="stat-info">
                        <h4>${totalStars}</h4>
                        <p>Total Stars</p>
                    </div>
                </div>
                <div class="summary-stat">
                    <i class="fas fa-code-branch"></i>
                    <div class="stat-info">
                        <h4>${totalForks}</h4>
                        <p>Total Forks</p>
                    </div>
                </div>
                <div class="summary-stat">
                    <i class="fas fa-trophy"></i>
                    <div class="stat-info">
                        <h4>${topRepos.length}</h4>
                        <p>Top Projects</p>
                    </div>
                </div>
            </div>
            
            <div class="top-projects-list">
                ${topRepos.map((repo, index) => {
                    const projectMeta = projectsData?.projects?.find(p => p.name === repo.name);
                    const displayName = projectMeta?.displayName || repo.name;
                    const description = projectMeta?.longDescription || repo.description || 'No description available';
                    const category = projectMeta?.category || 'Development';
                    const technologies = projectMeta?.technologies || [repo.language].filter(Boolean);
                    
                    return `
                        <div class="top-project-card">
                            <div class="rank-badge">#${index + 1}</div>
                            <div class="top-project-content">
                                <div class="top-project-header">
                                    <span class="project-category-badge">${category}</span>
                                    <h4 class="top-project-title">
                                        <a href="${repo.html_url}" target="_blank">${displayName}</a>
                                    </h4>
                                </div>
                                <p class="top-project-description">${description}</p>
                                
                                ${projectMeta?.highlights ? `
                                    <div class="top-project-highlights">
                                        <strong>Key Features:</strong>
                                        <ul>
                                            ${projectMeta.highlights.slice(0, 3).map(h => `<li>${h}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                                
                                <div class="top-project-tech">
                                    <strong>Technologies:</strong>
                                    ${technologies.slice(0, 5).map(tech => 
                                        `<span class="tech-badge">${tech}</span>`
                                    ).join('')}
                                </div>
                                
                                <div class="top-project-stats">
                                    <span class="stat-badge">
                                        <i class="fas fa-star"></i> ${repo.stargazers_count} stars
                                    </span>
                                    <span class="stat-badge">
                                        <i class="fas fa-code-branch"></i> ${repo.forks_count} forks
                                    </span>
                                    <span class="stat-badge">
                                        <i class="fas fa-circle-dot"></i> ${repo.open_issues_count} issues
                                    </span>
                                    <span class="stat-badge">
                                        <i class="fas fa-clock"></i> Updated ${new Date(repo.updated_at).toLocaleDateString()}
                                    </span>
                                </div>
                                
                                <div class="top-project-links">
                                    <a href="${repo.html_url}" target="_blank" class="btn btn-primary btn-sm">
                                        <i class="fab fa-github"></i> View Repository
                                    </a>
                                    ${repo.homepage ? `
                                        <a href="${repo.homepage}" target="_blank" class="btn btn-secondary btn-sm">
                                            <i class="fas fa-external-link-alt"></i> Live Demo
                                        </a>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading top starred projects:', error);
        topProjectsStats.innerHTML = '<p class="error-message">Unable to load top projects at this time.</p>';
    }
}

// Update the DOMContentLoaded event to include top projects
document.addEventListener('DOMContentLoaded', function() {
    loadTopStarredProjects();
});

// Resume/CV Download functionality
function generateResume() {
    globalThis.print();
}

// Add resume download button to contact section
document.addEventListener('DOMContentLoaded', function() {
    const contactSection = document.querySelector('#contact .contact-methods');
    if (contactSection) {
        const resumeButton = document.createElement('button');
        resumeButton.className = 'contact-method resume-download';
        resumeButton.innerHTML = '<i class="fas fa-file-pdf"></i><span>Download Resume</span>';
        resumeButton.addEventListener('click', generateResume);
        contactSection.appendChild(resumeButton);
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
        console.error('Error loading skills matrix:', error);
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

// Add project filter functionality
function initProjectFilters() {
    const projectsGrid = document.getElementById('projects-grid');
    if (!projectsGrid) return;
    
    // Create filter buttons
    const projectsSection = document.querySelector('#projects');
    if (!projectsSection) return;
    
    const filterContainer = document.createElement('div');
    filterContainer.className = 'project-filters';
    filterContainer.innerHTML = `
        <div class="filter-buttons">
            <button class="filter-btn active" data-filter="all">All Projects</button>
            <button class="filter-btn" data-filter="health">Health</button>
            <button class="filter-btn" data-filter="iot">IoT</button>
            <button class="filter-btn" data-filter="mobile">Mobile</button>
            <button class="filter-btn" data-filter="web">Web</button>
        </div>
    `;
    
    // Insert before projects grid
    projectsGrid.parentElement.insertBefore(filterContainer, projectsGrid);
    
    // Add filter functionality
    const filterButtons = filterContainer.querySelectorAll('.filter-btn');
    for (const btn of filterButtons) {
        btn.addEventListener('click', function() {
            // Update active button
            for (const b of filterButtons) {
                b.classList.remove('active');
            }
            this.classList.add('active');
            
            // Filter projects
            const filter = this.dataset.filter;
            const projectCards = projectsGrid.querySelectorAll('.project-card');
            
            for (const card of projectCards) {
                if (filter === 'all') {
                    card.style.display = 'block';
                } else {
                    const category = card.querySelector('.project-category');
                    const categoryText = category?.textContent.toLowerCase() || '';
                    
                    if (categoryText.includes(filter)) {
                        card.style.display = 'block';
                    } else {
                        card.style.display = 'none';
                    }
                }
            }
        });
    }
}

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

// Initialize project filters when projects are loaded
function initProjectFiltersWhenReady() {
    const projectsGrid = document.getElementById('projects-grid');
    if (!projectsGrid) return;
    
    // Use MutationObserver to detect when projects are loaded
    const observer = new MutationObserver((mutations) => {
        const hasProjects = projectsGrid.querySelectorAll('.project-card').length > 0;
        if (hasProjects) {
            initProjectFilters();
            observer.disconnect();
        }
    });
    
    observer.observe(projectsGrid, { childList: true, subtree: true });
    
    // Fallback timeout in case observer doesn't work
    setTimeout(() => {
        observer.disconnect();
        initProjectFilters();
    }, 5000);
}

document.addEventListener('DOMContentLoaded', function() {
    initBackToTop();
    initProjectFiltersWhenReady();
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
                console.log('LCP:', entry.renderTime || entry.loadTime);
            }
        }
    });
    
    try {
        perfObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (error) {
        console.warn('Performance monitoring not supported:', error.message);
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
            console.error('Backup GitHub stats loader failed:', error);
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
            console.log('ℹ️ reCAPTCHA disabled or not loaded');
            return;
        }
        
        // Wait for reCAPTCHA to be ready
        if (typeof grecaptcha === 'undefined') {
            console.log('⏳ Waiting for reCAPTCHA to load...');
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
                    console.log('✅ reCAPTCHA verified');
                }
            });
            
            console.log('✅ reCAPTCHA initialized');
        } catch (error) {
            console.warn('⚠️ reCAPTCHA initialization failed:', error.message);
            this.config.enableRecaptcha = false;
        }
    }

    trackEvent(eventName, fieldName = null) {
        if (!this.config.enableAnalytics) return;
        
        // Track with console for now - integrate with your analytics service
        console.log(`📊 Form Analytics: ${eventName}${fieldName ? ` - ${fieldName}` : ''}`);
        
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
            console.error('Form submission failed after retries:', error);
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
            console.warn(`Submission attempt ${attempt}/${maxAttempts} failed:`, error.message);
            
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
            console.log(`📱 Theme changed: ${isDark ? 'dark' : 'light'} (reCAPTCHA theme update needed)`);
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
        console.log('✅ Hero background forced to theme-aware brown/maroon gradient');
    }
}

// Apply hero background immediately and after DOM loads
forceHeroBackground();
document.addEventListener('DOMContentLoaded', forceHeroBackground);

// Listen for theme changes and reapply hero background
document.addEventListener('themeChanged', function(e) {
    console.log('🎨 Theme changed event received, updating hero background for theme:', e.detail.theme);
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
                console.log('Mobile Load Performance:', {
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
            console.log(`📊 Analytics Event: ${eventName}`, data);
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

// Initialize Visual Animation System
const visualAnimations = new VisualAnimationSystem();

// Initialize Mobile Optimization System
const mobileOptimization = new MobileOptimizationSystem();

// Initialize Portfolio Analytics System
const portfolioAnalytics = new PortfolioAnalyticsSystem();

// Make analytics available globally for debugging
globalThis.portfolioAnalytics = portfolioAnalytics;

console.log('Portfolio enhancements loaded successfully! 🚀');
console.log('Press "T" to toggle theme');
console.log('Press Ctrl/Cmd + P to print resume');
console.log('Visual animations initialized! ✨');
console.log('Mobile optimizations active! 📱');
console.log('Analytics system tracking user behavior! 📊');
console.log('Access analytics data with: portfolioAnalytics.getSummary()');
