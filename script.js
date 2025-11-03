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

    // Main API method with caching
    async fetchGitHubData(endpoint, params = {}, ttl = 300000) {
        const cacheKey = this.getCacheKey(endpoint, params);
        
        // Check cache first
        const cachedData = this.getCache(cacheKey);
        if (cachedData) {
            console.log(`Cache hit for ${endpoint}`);
            return cachedData;
        }

        // Build URL with parameters
        const url = new URL(`${this.baseUrl}${endpoint}`);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }

        try {
            const response = await this.fetchWithRetry(url.toString());
            const data = await response.json();
            
            // Cache the result
            this.setCache(cacheKey, data, ttl);
            console.log(`Cached data for ${endpoint}`);
            
            return data;
        } catch (error) {
            console.error(`Failed to fetch ${endpoint}:`, error);
            throw error;
        }
    }

    // Convenience methods for common endpoints
    async getUserData() {
        return this.fetchGitHubData(`/users/${this.username}`, {}, 600000); // 10 min cache
    }

    async getRepositories(sort = 'stars', per_page = 100) {
        return this.fetchGitHubData(`/users/${this.username}/repos`, { sort, per_page });
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

// Enhanced error handler for API failures
function handleAPIError(error, context = 'API request') {
    console.error(`${context} failed:`, error);
    
    const errorMessages = {
        'GitHub API rate limit exceeded': 'Rate limit reached. Data will refresh automatically when limit resets.',
        'Resource not found': 'Some data could not be found. This is normal for newer accounts.',
        'Failed to fetch': 'Network connection issue. Please check your internet connection.'
    };
    
    const userMessage = errorMessages[error.message] || 'Unable to load some GitHub data. Showing cached or fallback content.';
    
    // Could show user-friendly error in UI
    console.info('User message:', userMessage);
    
    return userMessage;
}

// Cache management utilities
function clearExpiredCache() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, value] of githubAPI.cache.entries()) {
        if (value.expiry < now) {
            githubAPI.cache.delete(key);
            removedCount++;
        }
    }
    
    if (removedCount > 0) {
        console.log(`🧹 Cleared ${removedCount} expired cache entries`);
    }
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

    // Initialize API optimizations
    preloadCriticalData();
    
    // Set up periodic cache cleanup (every 10 minutes)
    setInterval(clearExpiredCache, 10 * 60 * 1000);
    
    // Load all GitHub data with optimized coordination
    loadAllGitHubData();
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
    
    try {
        // Load project metadata
        let projectsData = null;
        try {
            const projectsDataResponse = await fetch('projects-data.json');
            projectsData = await projectsDataResponse.json();
        } catch (error) {
            console.warn('Project data file not found, using API data only:', error.message);
        }
        
        // Get repositories using the optimized API manager
        const repos = await githubAPI.getRepositories('stars', 100);
        
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
    const languageStats = document.getElementById('language-stats');
    
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
        statsGrid.innerHTML = `
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
        statsGrid.innerHTML = '<p class="error-message">Unable to load GitHub statistics at this time.</p>';
        contributionGraph.innerHTML = '';
        languageStats.innerHTML = '';
    }
}

// Load language statistics
function loadLanguageStats(repos) {
    const languageStats = document.getElementById('language-stats');
    
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
    const icon = themeToggle.querySelector('i');
    
    // Check for saved theme preference or default to light mode
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.toggle('dark-theme', currentTheme === 'dark');
    updateThemeIcon(icon, currentTheme);
    
    themeToggle.addEventListener('click', function() {
        const isDark = document.body.classList.toggle('dark-theme');
        const theme = isDark ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
        updateThemeIcon(icon, theme);
    });
}

function updateThemeIcon(icon, theme) {
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Initialize theme toggle
document.addEventListener('DOMContentLoaded', function() {
    initThemeToggle();
});

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
    // Press 'T' to toggle theme
    if (e.key === 't' || e.key === 'T') {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            themeToggle.click();
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
            this.elements.clearSearch.style.display = searchTerm ? 'block' : 'none';
        }

        this.applyFiltersAndSort();
    }

    clearSearch() {
        if (this.elements.searchInput) {
            this.elements.searchInput.value = '';
        }
        if (this.elements.clearSearch) {
            this.elements.clearSearch.style.display = 'none';
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
        if (this.elements.clearSearch) this.elements.clearSearch.style.display = 'none';
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
        const endDate = new Date(today);
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

    // Chart creation methods (placeholders for Chart.js integration)
    createBarChart(canvas, id, data) {
        // Placeholder: In a real implementation, this would use Chart.js
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#4A90E2';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Chart Placeholder', canvas.width / 2, canvas.height / 2);
    }

    createPieChart(canvas, id, data) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#4A90E2';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Pie Chart Placeholder', canvas.width / 2, canvas.height / 2);
    }

    createLineChart(canvas, id, data) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#4A90E2';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Line Chart Placeholder', canvas.width / 2, canvas.height / 2);
    }

    createAreaChart(canvas, id, data) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#4A90E2';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Area Chart Placeholder', canvas.width / 2, canvas.height / 2);
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

// Add analytics event tracking (placeholder for future integration)
function trackEvent(category, action, label) {
    // This can be integrated with Google Analytics, Plausible, or other analytics services
    console.log('Event tracked:', { category, action, label });
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

console.log('Portfolio enhancements loaded successfully! 🚀');
console.log('Press "T" to toggle theme');
console.log('Press Ctrl/Cmd + P to print resume');
