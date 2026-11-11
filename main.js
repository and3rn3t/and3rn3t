/**
 * Main Application Entry Point
 * Coordinates all modules and handles initialization
 *
 * @author Matthew Anderson
 * @version 2.0.0
 */

// Import critical modules only - others loaded dynamically
import { debug } from './modules/debug.js';
import { errorHandler } from './modules/error-handler.js';
import { initThemeManager } from './modules/theme.js';
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
};

// Expose appState for error handler notifications
if (typeof globalThis !== 'undefined') {
    globalThis.appState = appState;
}

/**
 * Import an optional module and start it. A failure only skips that feature.
 * @param {string} label - Name used in the debug log
 * @param {() => Promise<any>} load - Dynamic import
 * @param {(module: any) => any} start - Starts the feature from the loaded module
 */
async function startOptional(label, load, start) {
    try {
        await start(await load());
    } catch (err) {
        debug.warn(`[App] ${label} skipped:`, err);
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
        // Phase 1: Critical path - theme (prevents flash)
        const themeManager = initThemeManager();
        appState.managers.theme = themeManager;

        debug.log('[App] Phase 1: Theme initialized');

        // Phase 2: Navigation and UI setup
        initMobileMenu();
        initNavigation();

        // Load UI module
        const { uiManager } = await import('./modules/ui.js');
        uiManager.init();
        appState.managers.ui = uiManager;

        navigationManager.init();
        appState.managers.navigation = navigationManager;

        debug.log('[App] Phase 2: Navigation & UI initialized');

        // Hero flow field: dynamically imported, and self-gates on device capability.
        initHeroEnhancements();

        // Phase 3: Content loading (show progress)
        uiManager.showLoadingProgress('content');

        const { projectsManager } = await import('./modules/projects.js');

        // Load content in parallel
        await Promise.allSettled([projectsManager.init('#projects'), uiManager.loadGitHubStats()]);

        appState.managers.projects = projectsManager;

        uiManager.hideLoadingProgress('content');
        debug.log('[App] Phase 3: Content loaded');

        // Micro-interactions on the freshly-rendered content (count-up, tilt, magnetic).
        await startOptional(
            'Interactions',
            () => import('./modules/interactions.js'),
            m => m.initInteractions()
        );

        // Contact tabs (the guestbook and Turnstile load when its tab opens), the command
        // palette (Cmd/Ctrl-K) and keyboard help (?, g h/a/p/c) are purely local, so wire
        // them before any network-bound widget so they respond at once.
        await startOptional(
            'Contact tabs',
            () => import('./modules/contact-tabs.js'),
            m => {
                m.contactTabs.init();
                appState.managers.contactTabs = m.contactTabs;
            }
        );
        await startOptional(
            'Command palette',
            () => import('./modules/command-palette.js'),
            m => {
                m.commandPalette.init();
                appState.managers.palette = m.commandPalette;
            }
        );
        await startOptional(
            'Keyboard help',
            () => import('./modules/keyboard-help.js'),
            m => {
                m.keyboardHelp.init();
                appState.managers.keyboardHelp = m.keyboardHelp;
            }
        );

        // Network-bound widgets are independent of each other: run them together so one
        // slow request (e.g. the Worker) doesn't hold up the rest.
        await Promise.all([
            // "Currently coding" — calls the CF Worker with static fallback.
            startOptional(
                'Currently widget',
                () => import('./modules/currently.js'),
                async m => {
                    await m.currentlyWidget.init('#currently-coding');
                    appState.managers.currently = m.currentlyWidget;
                }
            ),
            startOptional(
                'Blog module',
                () => import('./modules/blog.js'),
                m => {
                    m.blogManager.init();
                    appState.managers.blog = m.blogManager;
                }
            ),
            // View counter — calls the Worker, updates the footer count.
            startOptional(
                'View counter',
                () => import('./modules/views.js'),
                async m => {
                    await m.viewCounter.init();
                    appState.managers.views = m.viewCounter;
                }
            ),
        ]);

        // Phase 4: Non-critical features (deferred)
        // Hidden Konami-code dev-mode easter egg (opt-in, dismissible).
        requestIdleCallback(
            () =>
                startOptional(
                    'Easter egg',
                    () => import('./modules/easter-egg.js'),
                    m => m.easterEgg.init()
                ),
            { timeout: 2000 }
        );

        // Setup global event handlers
        setupGlobalEvents();

        // Periodically drop expired GitHub API cache entries
        setInterval(
            async () => {
                const { githubAPI } = await import('./modules/github-api.js');
                githubAPI.clearExpiredCache();
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
 * Start the hero's (capability-gated) animated background. We try the
 * WebAssembly particle flow-field first (compute in WASM, paint in JS); if WASM
 * is unavailable we fall back to the WebGL mesh-gradient shader, and if that
 * also fails the static CSS gradient stays visible. Everything is lazy-loaded
 * and only runs when device capability allows, so first paint is untouched.
 */
async function initHeroEnhancements() {
    try {
        const { canRunHeavyEffects, motion } = await import('./modules/capabilities.js');
        if (!canRunHeavyEffects()) {
            return; // CSS fallback gradient remains visible.
        }
        const canvas = document.getElementById('hero-canvas');
        if (!canvas) {
            return;
        }

        // WASM particle flow-field on a transparent 2D canvas. If WASM can't load, the
        // stylesheet's static glow stays and nothing else is needed.
        try {
            const { mountHeroSim } = await import('./modules/wasm/hero-sim.js');
            const handle = await mountHeroSim(canvas, { reducedMotion: motion.reduced });
            if (handle) {
                appState.managers.heroCanvas = handle;
                canvas.classList.add('is-active');
            }
        } catch (err) {
            debug.warn('[App] WASM hero core skipped:', err);
        }
    } catch (err) {
        debug.warn('[App] Hero canvas skipped:', err);
    }
}

/**
 * Initialize mobile menu toggle. The toggle button reports its state through
 * aria-expanded; Escape and a click outside the menu close it.
 */
function initMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    const navMenu = document.getElementById('nav-menu');

    if (!mobileMenu || !navMenu) return;

    const isOpen = () => navMenu.classList.contains('active');
    const setOpen = open => {
        mobileMenu.classList.toggle('active', open);
        navMenu.classList.toggle('active', open);
        mobileMenu.setAttribute('aria-expanded', String(open));
    };

    mobileMenu.addEventListener('click', () => setOpen(!isOpen()));

    // Close mobile menu when clicking on a link
    for (const link of navMenu.querySelectorAll('a')) {
        link.addEventListener('click', () => setOpen(false));
    }

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !isOpen()) return;
        setOpen(false);
        mobileMenu.focus();
    });

    document.addEventListener('click', event => {
        if (!isOpen() || navMenu.contains(event.target) || mobileMenu.contains(event.target)) {
            return;
        }
        setOpen(false);
    });
}

/**
 * Initialize navigation behaviors
 */
function initNavigation() {
    const navbar = document.getElementById('navbar');
    const progressBar = document.getElementById('scroll-progress-bar');

    // Navbar scroll effect + reading-progress bar
    globalThis.addEventListener(
        'scroll',
        () => {
            navbar?.classList.toggle('scrolled', globalThis.scrollY > 50);
            if (progressBar) {
                const max = document.documentElement.scrollHeight - globalThis.innerHeight;
                const pct = max > 0 ? Math.min(100, (globalThis.scrollY / max) * 100) : 0;
                progressBar.style.width = `${pct}%`;
            }
        },
        { passive: true }
    );
}

/**
 * Setup global event handlers
 */
function setupGlobalEvents() {
    // Handle global errors
    globalThis.addEventListener('error', async event => {
        debug.error('[App] Uncaught error:', event.error);
    });

    // Handle unhandled promise rejections
    globalThis.addEventListener('unhandledrejection', async event => {
        debug.error('[App] Unhandled rejection:', event.reason);
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
                watchForServiceWorkerUpdate();
            })
            .catch(error => {
                debug.warn('[App] Service Worker registration failed:', error);
            });
    }
}

/**
 * The worker takes over as soon as it installs, so a controller change means the
 * code behind this tab was replaced. Say so; don't reload under the visitor.
 */
function watchForServiceWorkerUpdate() {
    if (!navigator.serviceWorker.controller) return; // first install, nothing was replaced
    navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
            const { ui } = appState.managers;
            ui?.showNotification?.('Site updated. Refresh for the latest version.', 'info', 8000);
        },
        { once: true }
    );
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
}

// Polyfill for requestIdleCallback (Safari)
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
