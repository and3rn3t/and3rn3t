/**
 * Main Application Entry Point
 * Coordinates all modules and handles initialization
 * 
 * @author Matthew Anderson
 * @version 2.0.0
 */

// Import critical modules only - others loaded dynamically
import { DEBUG_MODE, debug } from './modules/debug.js';
import { errorHandler, ErrorType } from './modules/error-handler.js';
import { initThemeManager } from './modules/theme.js';
import { mobileManager } from './modules/mobile.js';
import { navigationManager } from './modules/navigation.js';

// App configuration
const APP_CONFIG = {
    version: '2.0.0',
    name: 'Matthew Anderson Portfolio'
};

// App state - expose globally for error handler access
const appState = {
    isInitialized: false,
    initStartTime: null,
    managers: {},
    modules: {} // Lazy-loaded modules
};

// Expose appState for error handler notifications
if (typeof window !== 'undefined') {
    window.appState = appState;
}

/**
 * Lazy load a module with error handling
 * @param {string} modulePath - Path to the module
 * @returns {Promise<any>} - The loaded module
 */
async function lazyLoad(modulePath) {
    if (appState.modules[modulePath]) {
        return appState.modules[modulePath];
    }
    try {
        const module = await import(modulePath);
        appState.modules[modulePath] = module;
        return module;
    } catch (error) {
        await errorHandler.handle(error, {
            context: { modulePath },
            showUser: false
        });
        throw error;
    }
}

/**
 * Initialize all application modules
 */
async function initializeApp() {
    if (appState.isInitialized) {
        debug.warn('[App] Already initialized');
        return;
    }
    
    appState.initStartTime = performance.now();
    debug.log(`[App] Initializing ${APP_CONFIG.name} v${APP_CONFIG.version}...`);
    
    try {
        // Phase 1: Critical path - theme and mobile (prevents flash/layout shifts)
        const themeManager = initThemeManager();
        appState.managers.theme = themeManager;
        
        mobileManager.init();
        appState.managers.mobile = mobileManager;
        
        debug.log('[App] Phase 1: Theme & mobile initialized');
        
        // Phase 2: Navigation and UI setup
        initMobileMenu();
        initNavigation();
        
        // Lazy load UI module
        const { uiManager } = await lazyLoad('./modules/ui.js');
        uiManager.init();
        appState.managers.ui = uiManager;
        
        navigationManager.init();
        appState.managers.navigation = navigationManager;
        
        debug.log('[App] Phase 2: Navigation & UI initialized');
        
        // Phase 3: Content loading (show progress) - lazy load projects module
        uiManager.showLoadingProgress('content');
        
        const { projectsManager } = await lazyLoad('./modules/projects.js');
        
        // Load content in parallel
        await Promise.allSettled([
            projectsManager.init('#projects-grid'),
            uiManager.loadGitHubStats(),
            uiManager.loadSkillsMatrix()
        ]);
        
        appState.managers.projects = projectsManager;
        
        uiManager.hideLoadingProgress('content');
        debug.log('[App] Phase 3: Content loaded');
        
        // Make body visible (it starts with opacity: 0)
        document.body.classList.add('loaded');
        
        // Phase 4: Non-critical features (deferred with dynamic imports)
        requestIdleCallback(async () => {
            try {
                const [{ performanceManager }, { analyticsManager }] = await Promise.all([
                    lazyLoad('./modules/performance.js'),
                    lazyLoad('./modules/analytics.js')
                ]);
                
                performanceManager.init();
                appState.managers.performance = performanceManager;
                
                analyticsManager.init();
                appState.managers.analytics = analyticsManager;
                
                // Additional UI enhancements
                loadGitHubBadges();
                
                debug.log('[App] Phase 4: Analytics & performance initialized');
            } catch (err) {
                debug.error('[App] Phase 4 error:', err);
            }
        }, { timeout: 2000 });
        
        // Setup global event handlers
        setupGlobalEvents();
        
        // Set up cache cleanup interval (lazy load github-api only when needed)
        setInterval(async () => {
            const { githubAPI } = await lazyLoad('./modules/github-api.js');
            clearExpiredCache(githubAPI);
        }, 10 * 60 * 1000);
        
        // Mark initialization complete
        appState.isInitialized = true;
        
        const initTime = performance.now() - appState.initStartTime;
        debug.log(`[App] Initialization complete in ${initTime.toFixed(2)}ms`);
        
        // Dispatch ready event
        window.dispatchEvent(new CustomEvent('app:ready', {
            detail: { initTime, version: APP_CONFIG.version }
        }));
        
    } catch (error) {
        debug.error('[App] Initialization error:', error);
        handleInitError(error);
    }
}

/**
 * Initialize mobile menu toggle
 */
function initMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    const navMenu = document.getElementById('nav-menu');
    
    if (!mobileMenu || !navMenu) return;
    
    mobileMenu.addEventListener('click', () => {
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
}

/**
 * Initialize navigation behaviors
 */
function initNavigation() {
    const navbar = document.getElementById('navbar');
    
    // Navbar scroll effect
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }, { passive: true });
    }
    
    // Smooth scroll for anchor links
    for (const anchor of document.querySelectorAll('a[href^="#"]')) {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const offsetTop = target.offsetTop - 70;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    }
}

/**
 * Load GitHub badges
 */
function loadGitHubBadges() {
    // GitHub badges are loaded via external services in the HTML
    // This function can be extended to dynamically load additional badges
    debug.log('[App] GitHub badges loaded');
}

/**
 * Clear expired cache entries
 * @param {Object} githubAPI - The GitHub API instance
 */
function clearExpiredCache(githubAPI) {
    if (!githubAPI || !githubAPI.cache) return;
    
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, value] of githubAPI.cache.entries()) {
        if (value.expiry < now) {
            githubAPI.cache.delete(key);
            removedCount++;
        }
    }
    
    if (removedCount > 0) {
        debug.log(`[App] Cleared ${removedCount} expired cache entries`);
    }
}

/**
 * Setup global event handlers
 */
function setupGlobalEvents() {
    // Handle global errors
    window.addEventListener('error', async (event) => {
        debug.error('[App] Uncaught error:', event.error);
        const analytics = appState.managers.analytics;
        if (analytics && analytics.isInitialized) {
            analytics.trackError(event.error, {
                type: 'uncaught',
                filename: event.filename,
                lineno: event.lineno
            });
        }
    });
    
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', async (event) => {
        debug.error('[App] Unhandled rejection:', event.reason);
        const analytics = appState.managers.analytics;
        if (analytics && analytics.isInitialized) {
            analytics.trackError(event.reason, {
                type: 'unhandled_rejection'
            });
        }
    });
    
    // Handle theme changes - reapply hero background
    document.addEventListener('themeChanged', () => {
        const ui = appState.managers.ui;
        if (ui && ui.forceHeroBackground) {
            ui.forceHeroBackground();
        }
    });
    
    // Handle online/offline
    window.addEventListener('online', () => {
        debug.log('[App] Connection restored');
        document.body.classList.remove('offline');
        const ui = appState.managers.ui;
        if (ui && ui.showNotification) {
            ui.showNotification('Connection restored', 'success', 3000);
        }
    });
    
    window.addEventListener('offline', () => {
        debug.log('[App] Connection lost');
        document.body.classList.add('offline');
        const ui = appState.managers.ui;
        if (ui && ui.showNotification) {
            ui.showNotification('You are offline', 'warning', 5000);
        }
    });
    
    // Service worker registration
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                debug.log('[App] Service Worker registered:', registration.scope);
            })
            .catch(error => {
                debug.warn('[App] Service Worker registration failed:', error);
            });
    }
}

/**
 * Handle initialization errors gracefully
 */
function handleInitError(error) {
    // Log to error handler
    errorHandler.handle(error, {
        showUser: true,
        context: { phase: 'initialization' }
    });
    
    // Show error to user in development
    if (DEBUG_MODE) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'init-error';
        errorDiv.innerHTML = `
            <h3>⚠️ Initialization Error</h3>
            <p>${error.message}</p>
            <pre>${error.stack}</pre>
        `;
        errorDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 20px;
            border-radius: 8px;
            max-width: 400px;
            z-index: 10000;
            font-family: monospace;
            font-size: 12px;
        `;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => errorDiv.remove(), 10000);
    }
    
    // Ensure body is visible even on error
    document.body.classList.add('loaded');
    
    // Track error via analytics if available
    const analytics = appState.managers.analytics;
    if (analytics && analytics.isInitialized) {
        analytics.trackError(error, { context: 'initialization' });
    }
}

/**
 * Expose public API for external access
 */
window.PortfolioApp = {
    version: APP_CONFIG.version,
    debug: DEBUG_MODE,
    
    // Manager access (lazy-loaded)
    get theme() { return appState.managers.theme; },
    get mobile() { return appState.managers.mobile; },
    get navigation() { return appState.managers.navigation; },
    get projects() { return appState.managers.projects; },
    get performance() { return appState.managers.performance; },
    get analytics() { return appState.managers.analytics; },
    get ui() { return appState.managers.ui; },
    get errors() { return errorHandler; },
    
    // Methods
    isReady() { return appState.isInitialized; },
    
    async refresh() {
        debug.log('[App] Refreshing...');
        const ui = appState.managers.ui;
        const projects = appState.managers.projects;
        
        if (ui) ui.showLoadingProgress('refresh');
        if (projects) await projects.refresh();
        if (ui) {
            await ui.loadGitHubStats();
            ui.hideLoadingProgress('refresh');
            ui.showNotification('Data refreshed', 'success', 3000);
        }
    },
    
    getStats() {
        const perf = appState.managers.performance;
        const analytics = appState.managers.analytics;
        const mobile = appState.managers.mobile;
        
        return {
            version: APP_CONFIG.version,
            initialized: appState.isInitialized,
            performance: perf?.getMetrics?.() || {},
            session: analytics?.getSessionStats?.() || {},
            device: mobile?.getDeviceInfo?.() || {},
            errors: errorHandler.getStats()
        };
    }
};

// Polyfill for requestIdleCallback
window.requestIdleCallback = window.requestIdleCallback || function(cb) {
    const start = Date.now();
    return setTimeout(() => {
        cb({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
        });
    }, 1);
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM already loaded
    initializeApp();
}

// Export for potential module use
export { initializeApp, appState, APP_CONFIG };
