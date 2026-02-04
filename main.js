/**
 * Main Application Entry Point
 * Coordinates all modules and handles initialization
 * 
 * @author Matthew Anderson
 * @version 2.0.0
 */

// Import all modules
import { DEBUG_MODE, debug } from './modules/debug.js';
import { githubAPI } from './modules/github-api.js';
import { initThemeManager } from './modules/theme.js';
import { performanceManager } from './modules/performance.js';
import { mobileManager } from './modules/mobile.js';
import { analyticsManager } from './modules/analytics.js';
import { projectsManager } from './modules/projects.js';
import { navigationManager } from './modules/navigation.js';
import { uiManager } from './modules/ui.js';

// App configuration
const APP_CONFIG = {
    version: '2.0.0',
    name: 'Matthew Anderson Portfolio'
};

// App state
const appState = {
    isInitialized: false,
    initStartTime: null,
    managers: {}
};

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
        
        uiManager.init();
        appState.managers.ui = uiManager;
        
        navigationManager.init();
        appState.managers.navigation = navigationManager;
        
        debug.log('[App] Phase 2: Navigation & UI initialized');
        
        // Phase 3: Content loading (show progress)
        uiManager.showLoadingProgress('content');
        
        // Load GitHub data in parallel
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
        
        // Phase 4: Non-critical features (deferred)
        requestIdleCallback(() => {
            performanceManager.init();
            appState.managers.performance = performanceManager;
            
            analyticsManager.init();
            appState.managers.analytics = analyticsManager;
            
            // Additional UI enhancements
            uiManager.initResumeButton();
            loadGitHubBadges();
            
            debug.log('[App] Phase 4: Analytics & performance initialized');
        }, { timeout: 2000 });
        
        // Setup global event handlers
        setupGlobalEvents();
        
        // Set up cache cleanup interval
        setInterval(clearExpiredCache, 10 * 60 * 1000);
        
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
 */
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
        debug.log(`[App] Cleared ${removedCount} expired cache entries`);
    }
}

/**
 * Setup global event handlers
 */
function setupGlobalEvents() {
    // Handle global errors
    window.addEventListener('error', (event) => {
        debug.error('[App] Uncaught error:', event.error);
        if (analyticsManager.isInitialized) {
            analyticsManager.trackError(event.error, {
                type: 'uncaught',
                filename: event.filename,
                lineno: event.lineno
            });
        }
    });
    
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        debug.error('[App] Unhandled rejection:', event.reason);
        if (analyticsManager.isInitialized) {
            analyticsManager.trackError(event.reason, {
                type: 'unhandled_rejection'
            });
        }
    });
    
    // Handle theme changes - reapply hero background
    document.addEventListener('themeChanged', () => {
        uiManager.forceHeroBackground();
    });
    
    // Handle online/offline
    window.addEventListener('online', () => {
        debug.log('[App] Connection restored');
        document.body.classList.remove('offline');
        uiManager.showNotification('Connection restored', 'success', 3000);
    });
    
    window.addEventListener('offline', () => {
        debug.log('[App] Connection lost');
        document.body.classList.add('offline');
        uiManager.showNotification('You are offline', 'warning', 5000);
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
    
    // Track error
    if (analyticsManager.isInitialized) {
        analyticsManager.trackError(error, { context: 'initialization' });
    }
}

/**
 * Expose public API for external access
 */
window.PortfolioApp = {
    version: APP_CONFIG.version,
    debug: DEBUG_MODE,
    
    // Manager access
    get theme() { return appState.managers.theme; },
    get mobile() { return appState.managers.mobile; },
    get navigation() { return appState.managers.navigation; },
    get projects() { return appState.managers.projects; },
    get performance() { return appState.managers.performance; },
    get analytics() { return appState.managers.analytics; },
    get ui() { return appState.managers.ui; },
    get github() { return githubAPI; },
    
    // Methods
    isReady() { return appState.isInitialized; },
    
    async refresh() {
        debug.log('[App] Refreshing...');
        uiManager.showLoadingProgress('refresh');
        await projectsManager.refresh();
        await uiManager.loadGitHubStats();
        uiManager.hideLoadingProgress('refresh');
        uiManager.showNotification('Data refreshed', 'success', 3000);
    },
    
    getStats() {
        return {
            version: APP_CONFIG.version,
            initialized: appState.isInitialized,
            performance: performanceManager.getMetrics?.() || {},
            session: analyticsManager.getSessionStats?.() || {},
            device: mobileManager.getDeviceInfo?.() || {}
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
