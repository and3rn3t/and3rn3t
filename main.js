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
        return await start(await load());
    } catch (err) {
        debug.warn(`[App] ${label} skipped:`, err);
        return undefined;
    }
}

/** Run `task` when the browser is idle, at the latest after `timeout` ms. */
const whenIdle = (task, timeout = 1500) => globalThis.requestIdleCallback(task, { timeout });

/**
 * Run `task` once, as soon as `element` is within `margin` of the viewport, or after `timeout` ms,
 * whichever comes first. For features that serve a part of the page the visitor may never scroll
 * to.
 */
function whenNear(element, task, { margin = '800px', timeout = 4000 } = {}) {
    let done = false;
    const run = () => {
        if (done) return;
        done = true;
        observer?.disconnect();
        task();
    };
    const observer =
        element && 'IntersectionObserver' in globalThis
            ? new IntersectionObserver(entries => entries.some(e => e.isIntersecting) && run(), {
                  rootMargin: margin,
              })
            : null;
    observer?.observe(element);
    // A real timer, not requestIdleCallback's `timeout`: that is a deadline, so the task would run
    // at the first idle moment even with the section nowhere near. `done` stops a second run.
    setTimeout(run, timeout);
}

/**
 * Features that are not needed to read the page, each started on its own once the page is up.
 * Nothing here waits for anything else, so a slow one (the Worker, a font) holds up nothing.
 */
function startFeatures(uiManager) {
    // The live numbers (the projects, experience and writing are already in the page): only
    // when the About band is close, or after a while
    whenNear(document.getElementById('github-band'), () => uiManager.loadGitHubStats());

    // Contact tabs and the form (the guestbook and Turnstile load when its tab opens). Until
    // the form's script runs it is a plain POST, which works.
    whenNear(document.getElementById('contact'), () => {
        startOptional(
            'Contact tabs',
            () => import('./modules/contact-tabs.js'),
            m => {
                m.contactTabs.init();
                appState.managers.contactTabs = m.contactTabs;
            }
        );
        startOptional(
            'Contact form',
            () => import('./modules/contact-form.js'),
            m => {
                m.contactForm.init();
                appState.managers.contactForm = m.contactForm;
            }
        );
    });

    // The hero's flow field: decorative, so it starts after the page is up
    whenIdle(initHeroEnhancements, 1000);

    // The command palette (Cmd/Ctrl-K, "/") and keyboard help (?, g h/a/p/c) are purely local,
    // so there is no network to wait for; the shim makes a key pressed before they load work
    whenIdle(() => {
        loadPalette();
        loadKeyboardHelp();
    }, 1000);
    installGlobalShortcuts();

    // "Currently coding" and the view counter call the Worker; both fall back on their own
    whenIdle(() => {
        startOptional(
            'Currently widget',
            () => import('./modules/currently.js'),
            async m => {
                await m.currentlyWidget.init('#currently-coding');
                appState.managers.currently = m.currentlyWidget;
            }
        );
        startOptional(
            'Edge receipt',
            () => import('./modules/edge.js'),
            m => m.initEdge()
        );
        startOptional(
            'View counter',
            () => import('./modules/views.js'),
            async m => {
                await m.viewCounter.init();
                appState.managers.views = m.viewCounter;
            }
        );
    }, 2000);

    // WebMCP: the page's own actions, offered to an AI agent in the visitor's browser. Only a
    // browser that supports it (document.modelContext) is sent the module at all.
    whenIdle(() => {
        if (!globalThis.document.modelContext && !globalThis.navigator.modelContext) return;
        startOptional(
            'WebMCP',
            () => import('./modules/webmcp.js'),
            async m => {
                appState.managers.webmcp = await m.registerWebMcp(
                    m.findModelContext(),
                    m.pageDeps()
                );
            }
        );
    }, 1000);

    // Old #post/<slug> and #project/<slug> links: only load the redirect when there is one
    watchLegacyLinks();

    // Hidden Konami-code dev-mode easter egg (opt-in, dismissible).
    whenIdle(
        () =>
            startOptional(
                'Easter egg',
                () => import('./modules/easter-egg.js'),
                m => m.easterEgg.init()
            ),
        3000
    );

    // Periodically drop expired GitHub API cache entries
    setInterval(
        async () => {
            const { githubAPI } = await import('./modules/github-api.js');
            githubAPI.clearExpiredCache();
        },
        10 * 60 * 1000
    );
}

let palettePromise;
/** Load and start the command palette (once), resolving to it. */
function loadPalette() {
    palettePromise ??= startOptional(
        'Command palette',
        () => import('./modules/command-palette.js'),
        m => {
            m.commandPalette.init();
            appState.managers.palette = m.commandPalette;
            return m.commandPalette;
        }
    );
    return palettePromise;
}

let keyboardHelpPromise;
/** Load and start keyboard help (once), resolving to it. */
function loadKeyboardHelp() {
    keyboardHelpPromise ??= startOptional(
        'Keyboard help',
        () => import('./modules/keyboard-help.js'),
        m => {
            m.keyboardHelp.init();
            appState.managers.keyboardHelp = m.keyboardHelp;
            return m.keyboardHelp;
        }
    );
    return keyboardHelpPromise;
}

// `g` then a letter jumps to a section, within this long of the `g`
const GO_TO = { h: 'home', a: 'about', p: 'projects', c: 'contact' };
const GO_TO_WINDOW = 1200;

/** Scroll to a section and move focus there, without forcing a visible outline. */
function goToSection(id) {
    const section = document.getElementById(id);
    if (!section) return;
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    section.setAttribute('tabindex', '-1');
    section.focus({ preventScroll: true });
}

/**
 * The keyboard shortcuts that must work from the first moment.
 *
 * `g` then h/a/p/c is handled here, always: it needs nothing but the page, so it is not tied to
 * a module that may still be loading (which would lose both keys, or the prefix).
 *
 * The palette and keyboard help start when the browser is idle, a moment after first paint. A
 * shortcut or click in that gap still works: this loads the module on demand and then opens it.
 * Once a module is up it handles its own keys, so this steps aside for it.
 */
function installGlobalShortcuts() {
    const isTyping = target =>
        /^(input|textarea|select)$/i.test(target?.tagName ?? '') || target?.isContentEditable;
    const dialogOpen = () => Boolean(document.querySelector('dialog[open]'));

    let goToArmed = false;
    let goToTimer = 0;
    const disarm = () => {
        goToArmed = false;
        clearTimeout(goToTimer);
    };

    document.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.isComposing || event.altKey) return;
        const mod = event.metaKey || event.ctrlKey;

        // `g` then a letter. Only the help dialog may be open: any other dialog keeps its keys.
        if (!mod && !isTyping(event.target)) {
            const helpIsTheOnlyDialog = !document.querySelector('dialog[open]:not(#keyboard-help)');
            if (goToArmed) {
                const sectionId = GO_TO[event.key.toLowerCase()];
                disarm();
                if (sectionId && helpIsTheOnlyDialog) {
                    event.preventDefault();
                    // The page behind a modal is inert and cannot take focus: close help first
                    appState.managers.keyboardHelp?.close();
                    goToSection(sectionId);
                }
                return;
            }
            if ((event.key === 'g' || event.key === 'G') && helpIsTheOnlyDialog) {
                goToArmed = true;
                clearTimeout(goToTimer);
                goToTimer = setTimeout(() => (goToArmed = false), GO_TO_WINDOW);
            }
        }

        if (!appState.managers.palette) {
            const opens = mod ? event.key.toLowerCase() === 'k' : event.key === '/';
            if (opens && (mod || !isTyping(event.target))) {
                event.preventDefault();
                loadPalette().then(palette => palette?.open());
                return;
            }
        }
        if (
            !appState.managers.keyboardHelp &&
            !mod &&
            event.key === '?' &&
            !isTyping(event.target) &&
            !dialogOpen()
        ) {
            event.preventDefault();
            // Checked again when the module arrives: a dialog may have opened while it loaded
            loadKeyboardHelp().then(help => {
                if (!dialogOpen()) help?.open();
            });
        }
    });

    document.addEventListener('click', event => {
        if (appState.managers.palette || !event.target.closest?.('[data-open-palette]')) return;
        loadPalette().then(palette => palette?.open());
    });
}

/** Load the redirect for old hash links only if the address has one. */
function watchLegacyLinks() {
    let started = false;
    const check = () => {
        if (started || !/^#(post|project)\//.test(globalThis.location.hash)) return;
        started = true;
        startOptional(
            'Legacy links',
            () => import('./modules/legacy-links.js'),
            m => {
                m.legacyLinks.init();
                appState.managers.legacyLinks = m.legacyLinks;
            }
        );
    };
    check();
    globalThis.addEventListener('hashchange', check);
}

/**
 * Initialize the application. Only what the page needs to be usable runs before `app:ready`
 * (the theme, the menu, navigation and the UI shell); every other feature starts on its own after.
 */
async function initializeApp() {
    if (appState.isInitialized) {
        debug.warn('[App] Already initialized');
        return;
    }

    appState.initStartTime = performance.now();
    debug.log(`[App] Initializing ${APP_CONFIG.name} v${APP_CONFIG.version}...`);

    try {
        // The service worker and the global handlers first: they do not depend on anything
        setupGlobalEvents();

        // Critical path: the theme (prevents a flash), the menu and the scroll effect
        appState.managers.theme = initThemeManager();
        initMobileMenu();
        initNavigation();

        // The UI shell and navigation
        const { uiManager } = await import('./modules/ui.js');
        uiManager.init();
        appState.managers.ui = uiManager;

        navigationManager.init();
        appState.managers.navigation = navigationManager;

        appState.isInitialized = true;
        const initTime = performance.now() - appState.initStartTime;
        debug.log(`[App] Ready in ${initTime.toFixed(2)}ms`);
        globalThis.dispatchEvent(
            new CustomEvent('app:ready', { detail: { initTime, version: APP_CONFIG.version } })
        );

        startFeatures(uiManager);
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

    // Navbar scroll effect
    globalThis.addEventListener(
        'scroll',
        () => navbar?.classList.toggle('scrolled', globalThis.scrollY > 50),
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
