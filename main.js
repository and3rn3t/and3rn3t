/**
 * Main Application Entry Point
 * Coordinates all modules and handles initialization
 *
 * @author Matthew Anderson
 * @version 2.0.0
 */

// Import critical modules only - others loaded dynamically
import { DEBUG_MODE, debug } from './modules/debug.js';
import { errorHandler } from './modules/error-handler.js';
import { initThemeManager } from './modules/theme.js';
import { mobileManager } from './modules/mobile.js';
import { navigationManager } from './modules/navigation.js';

// App configuration
const APP_CONFIG = {
    version: '2.0.0',
    name: 'Matthew Anderson Portfolio',
};

// App state - expose globally for error handler access
const appState = {
    isInitialized: false,
    initStartTime: null,
    managers: {},
    modules: {}, // Lazy-loaded modules
};

// Expose appState for error handler notifications
if (typeof globalThis !== 'undefined') {
    globalThis.appState = appState;
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
            showUser: false,
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

        // Hero enhancements: text reveal runs immediately; WebGL gradient is
        // dynamically imported and self-gates on device capability.
        initHeroEnhancements();

        // Phase 3: Content loading (show progress) - lazy load projects module
        uiManager.showLoadingProgress('content');

        const { projectsManager } = await lazyLoad('./modules/projects.js');

        // Load content in parallel
        await Promise.allSettled([
            projectsManager.init('#projects-grid'),
            uiManager.loadGitHubStats(),
            uiManager.loadSkillsMatrix(),
        ]);

        appState.managers.projects = projectsManager;

        uiManager.hideLoadingProgress('content');
        debug.log('[App] Phase 3: Content loaded');

        // Make body visible (it starts with opacity: 0)
        document.body.classList.add('loaded');

        // Micro-interactions on the freshly-rendered content (count-up, tilt, magnetic).
        try {
            const { initInteractions } = await import('./modules/interactions.js');
            initInteractions();
        } catch (err) {
            debug.warn('[App] Interactions skipped:', err);
        }

        // "Currently coding" widget — calls the CF Worker with static fallback.
        try {
            const { currentlyWidget } = await import('./modules/currently.js');
            await currentlyWidget.init('#currently-coding');
            appState.managers.currently = currentlyWidget;
        } catch (err) {
            debug.warn('[App] Currently widget skipped:', err);
        }

        // Experience / timeline section.
        try {
            const { experienceManager } = await import('./modules/experience.js');
            await experienceManager.init();
            appState.managers.experience = experienceManager;
        } catch (err) {
            debug.warn('[App] Experience module skipped:', err);
        }

        // Testimonials section (stays hidden until data exists).
        try {
            const { testimonialsManager } = await import('./modules/testimonials.js');
            await testimonialsManager.init();
            appState.managers.testimonials = testimonialsManager;
        } catch (err) {
            debug.warn('[App] Testimonials module skipped:', err);
        }

        // Blog / writing section.
        try {
            const { blogManager } = await import('./modules/blog.js');
            await blogManager.init();
            appState.managers.blog = blogManager;
        } catch (err) {
            debug.warn('[App] Blog module skipped:', err);
        }

        // Activity feed (recent GitHub events).
        try {
            const { activityFeed } = await import('./modules/activity-feed.js');
            await activityFeed.init('#activity-feed');
            appState.managers.activityFeed = activityFeed;
        } catch (err) {
            debug.warn('[App] Activity feed skipped:', err);
        }

        // Guestbook — loads entries + wires submission form.
        try {
            const { guestbookManager } = await import('./modules/guestbook.js');
            await guestbookManager.init();
            appState.managers.guestbook = guestbookManager;
        } catch (err) {
            debug.warn('[App] Guestbook skipped:', err);
        }

        // View counter — calls Worker, updates footer count.
        try {
            const { viewCounter } = await import('./modules/views.js');
            await viewCounter.init();
            appState.managers.views = viewCounter;
        } catch (err) {
            debug.warn('[App] View counter skipped:', err);
        }

        // Command palette (Cmd/Ctrl-K) — activates the existing search modal.
        try {
            const { commandPalette } = await import('./modules/command-palette.js');
            commandPalette.init();
            appState.managers.palette = commandPalette;
        } catch (err) {
            debug.warn('[App] Command palette skipped:', err);
        }

        // Keyboard help panel (?) + go-to navigation (g h/a/p/c).
        try {
            const { keyboardHelp } = await import('./modules/keyboard-help.js');
            keyboardHelp.init();
            appState.managers.keyboardHelp = keyboardHelp;
        } catch (err) {
            debug.warn('[App] Keyboard help skipped:', err);
        }

        // Phase 4: Non-critical features (deferred with dynamic imports)
        requestIdleCallback(
            async () => {
                try {
                    const [{ performanceManager }, { analyticsManager }] = await Promise.all([
                        lazyLoad('./modules/performance.js'),
                        lazyLoad('./modules/analytics.js'),
                    ]);

                    performanceManager.init();
                    appState.managers.performance = performanceManager;

                    analyticsManager.init();
                    appState.managers.analytics = analyticsManager;

                    // Additional UI enhancements
                    loadGitHubBadges();

                    // Hidden Konami-code dev-mode easter egg (opt-in, dismissible).
                    try {
                        const { easterEgg } = await import('./modules/easter-egg.js');
                        easterEgg.init();
                    } catch (err) {
                        debug.warn('[App] Easter egg skipped:', err);
                    }

                    debug.log('[App] Phase 4: Analytics & performance initialized');
                } catch (err) {
                    debug.error('[App] Phase 4 error:', err);
                }
            },
            { timeout: 2000 }
        );

        // Setup global event handlers
        setupGlobalEvents();

        // Set up cache cleanup interval (lazy load github-api only when needed)
        setInterval(
            async () => {
                const { githubAPI } = await lazyLoad('./modules/github-api.js');
                clearExpiredCache(githubAPI);
            },
            10 * 60 * 1000
        );

        // Mark initialization complete
        appState.isInitialized = true;

        const initTime = performance.now() - appState.initStartTime;
        debug.log(`[App] Initialization complete in ${initTime.toFixed(2)}ms`);

        // Dispatch ready event
        globalThis.dispatchEvent(
            new CustomEvent('app:ready', {
                detail: { initTime, version: APP_CONFIG.version },
            })
        );
    } catch (error) {
        debug.error('[App] Initialization error:', error);
        handleInitError(error);
    }
}

/**
 * Initialize hero text reveal + (capability-gated) animated background.
 * Text effect is cheap and runs right away. For the background we try the
 * WebAssembly particle flow-field first (compute in WASM, paint in JS); if WASM
 * is unavailable we fall back to the WebGL mesh-gradient shader, and if that
 * also fails the static CSS gradient stays visible. Everything is lazy-loaded
 * and only runs when device capability allows, so first paint is untouched.
 */
async function initHeroEnhancements() {
    try {
        const { initHeroText } = await import('./modules/hero-text.js');
        initHeroText();
    } catch (err) {
        debug.warn('[App] Hero text effect skipped:', err);
    }

    try {
        const { canRunHeavyEffects, motion } = await import('./modules/capabilities.js');
        if (!canRunHeavyEffects()) {
            return; // CSS fallback gradient remains visible.
        }
        const canvas = document.getElementById('hero-canvas');
        if (!canvas) {
            return;
        }

        // Primary: WASM particle flow-field (transparent 2D canvas over the
        // gradient). loadSim() throws before touching the canvas context if WASM
        // can't load, so the element stays clean for the WebGL fallback below.
        try {
            const { mountHeroSim } = await import('./modules/wasm/hero-sim.js');
            const wasmHandle = await mountHeroSim(canvas, { reducedMotion: motion.reduced });
            if (wasmHandle) {
                appState.managers.heroCanvas = wasmHandle;
                canvas.classList.add('is-active');
                return;
            }
        } catch (err) {
            debug.warn('[App] WASM hero core skipped, trying WebGL shader:', err);
        }

        // Fallback: WebGL mesh-gradient shader.
        const { initHeroCanvas } = await import('./modules/hero-canvas.js');
        const handle = initHeroCanvas(canvas);
        if (handle) {
            appState.managers.heroCanvas = handle;
        }
    } catch (err) {
        debug.warn('[App] Hero canvas skipped:', err);
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
        globalThis.addEventListener(
            'scroll',
            () => {
                if (globalThis.scrollY > 50) {
                    navbar.classList.add('scrolled');
                } else {
                    navbar.classList.remove('scrolled');
                }
            },
            { passive: true }
        );
    }

    // Smooth scroll for anchor links
    for (const anchor of document.querySelectorAll('a[href^="#"]')) {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const offsetTop = target.offsetTop - 70;
                globalThis.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth',
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
    globalThis.addEventListener('error', async event => {
        debug.error('[App] Uncaught error:', event.error);
        const { analytics } = appState.managers;
        if (analytics && analytics.isInitialized) {
            analytics.trackError(event.error, {
                type: 'uncaught',
                filename: event.filename,
                lineno: event.lineno,
            });
        }
    });

    // Handle unhandled promise rejections
    globalThis.addEventListener('unhandledrejection', async event => {
        debug.error('[App] Unhandled rejection:', event.reason);
        const { analytics } = appState.managers;
        if (analytics && analytics.isInitialized) {
            analytics.trackError(event.reason, {
                type: 'unhandled_rejection',
            });
        }
    });

    // Handle theme changes - reapply hero background
    document.addEventListener('themeChanged', () => {
        const { ui } = appState.managers;
        if (ui && ui.forceHeroBackground) {
            ui.forceHeroBackground();
        }
    });

    // Handle online/offline
    globalThis.addEventListener('online', () => {
        debug.log('[App] Connection restored');
        document.body.classList.remove('offline');
        const { ui } = appState.managers;
        if (ui && ui.showNotification) {
            ui.showNotification('Connection restored', 'success', 3000);
        }
    });

    globalThis.addEventListener('offline', () => {
        debug.log('[App] Connection lost');
        document.body.classList.add('offline');
        const { ui } = appState.managers;
        if (ui && ui.showNotification) {
            ui.showNotification('You are offline', 'warning', 5000);
        }
    });

    // Service worker registration
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
        navigator.serviceWorker
            .register('/sw.js')
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
        context: { phase: 'initialization' },
    });

    // Ensure body is visible even on error
    document.body.classList.add('loaded');

    // Track error via analytics if available
    const { analytics } = appState.managers;
    if (analytics && analytics.isInitialized) {
        analytics.trackError(error, { context: 'initialization' });
    }
}

/**
 * Expose public API for external access
 */
globalThis.PortfolioApp = {
    version: APP_CONFIG.version,
    debug: DEBUG_MODE,

    // Manager access (lazy-loaded)
    get theme() {
        return appState.managers.theme;
    },
    get mobile() {
        return appState.managers.mobile;
    },
    get navigation() {
        return appState.managers.navigation;
    },
    get projects() {
        return appState.managers.projects;
    },
    get performance() {
        return appState.managers.performance;
    },
    get analytics() {
        return appState.managers.analytics;
    },
    get ui() {
        return appState.managers.ui;
    },
    get errors() {
        return errorHandler;
    },

    // Methods
    isReady() {
        return appState.isInitialized;
    },

    async refresh() {
        debug.log('[App] Refreshing...');
        const { ui } = appState.managers;
        const { projects } = appState.managers;

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
        const { analytics } = appState.managers;
        const { mobile } = appState.managers;

        return {
            version: APP_CONFIG.version,
            initialized: appState.isInitialized,
            performance: perf?.getMetrics?.() || {},
            session: analytics?.getSessionStats?.() || {},
            device: mobile?.getDeviceInfo?.() || {},
            errors: errorHandler.getStats(),
        };
    },
};

// Polyfill for requestIdleCallback
globalThis.requestIdleCallback =
    globalThis.requestIdleCallback ||
    function (cb) {
        const start = Date.now();
        return setTimeout(() => {
            cb({
                didTimeout: false,
                timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
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
