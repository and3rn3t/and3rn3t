/**
 * Theme Manager Module
 * Single light/dark toggle. Follows the system preference until the visitor
 * picks a theme, then remembers that choice.
 */

import { debug } from './debug.js';

const STORAGE_KEY = 'theme';
const META_COLORS = { light: '#fefefe', dark: '#1a0e0a' };

function readSaved() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved === 'light' || saved === 'dark' ? saved : null;
    } catch {
        return null;
    }
}

function save(theme) {
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        // Storage blocked (private mode etc.) — the toggle still works per page view.
    }
}

// The old theme picker stored an opt-in "follow system" flag. Following the
// system is now the default, so that flag just means "no saved choice".
function migrateLegacyPreference() {
    try {
        if (localStorage.getItem('followSystemTheme') === 'true') {
            localStorage.removeItem(STORAGE_KEY);
        }
        localStorage.removeItem('followSystemTheme');
    } catch {
        // Ignore — nothing to migrate without storage.
    }
}

export class ThemeManager {
    button = null;
    currentTheme = 'light';
    // Suppress the View Transition on the very first paint (avoids a flash)
    ready = false;

    constructor() {
        this.init();
    }

    init() {
        migrateLegacyPreference();
        this.button = document.getElementById('theme-toggle');

        this.commitTheme(readSaved() ?? this.getSystemTheme());
        this.setupEventListeners();
        this.ready = true;
        debug.log('[Theme] Manager initialized with theme:', this.currentTheme);
    }

    getSystemTheme() {
        return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    setupEventListeners() {
        this.button?.addEventListener('click', () => this.toggle());

        // Press 'T' to toggle the theme (ignored while typing or with modifiers).
        document.addEventListener('keydown', e => {
            if (e.key !== 't' && e.key !== 'T') return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const el = document.activeElement;
            if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
            e.preventDefault();
            this.toggle();
        });

        // Track the OS setting until the visitor makes an explicit choice.
        globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!readSaved()) this.applyTheme(e.matches ? 'dark' : 'light');
        });
    }

    applyTheme(theme) {
        const commit = () => this.commitTheme(theme);

        const supportsViewTransitions = typeof document.startViewTransition === 'function';
        const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        // Animate only for user-initiated swaps on capable, motion-OK browsers
        if (!this.ready || !supportsViewTransitions || reducedMotion) {
            commit();
            return;
        }

        this.setTransitionOrigin();
        document.startViewTransition(commit);
    }

    setTransitionOrigin() {
        const root = document.documentElement;
        const rect = this.button?.getBoundingClientRect();
        root.style.setProperty('--theme-x', rect ? `${rect.left + rect.width / 2}px` : '50%');
        root.style.setProperty('--theme-y', rect ? `${rect.top + rect.height / 2}px` : '50%');
    }

    commitTheme(theme) {
        const isDark = theme === 'dark';
        document.body.classList.toggle('dark-theme', isDark);
        this.currentTheme = theme;
        this.updateButton(isDark);

        // Trigger custom event for other components
        document.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));

        // Update meta theme-color
        let metaTheme = document.querySelector('meta[name="theme-color"]');
        if (!metaTheme) {
            metaTheme = document.createElement('meta');
            metaTheme.name = 'theme-color';
            document.head.appendChild(metaTheme);
        }
        metaTheme.content = META_COLORS[theme] ?? META_COLORS.light;

        debug.log('[Theme] Applied theme:', theme);
    }

    updateButton(isDark) {
        if (!this.button) return;
        const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
        this.button.setAttribute('aria-label', label);
        this.button.title = `${label} (T)`;
        const icon = this.button.querySelector('i');
        if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    // Public API
    getTheme() {
        return this.currentTheme;
    }

    isDark() {
        return this.currentTheme === 'dark';
    }

    toggle() {
        const next = this.isDark() ? 'light' : 'dark';
        save(next);
        this.applyTheme(next);
    }
}

// Factory function to create and initialize theme manager
export function initThemeManager() {
    try {
        return new ThemeManager();
    } catch (error) {
        debug.error('[Theme] Failed to initialize theme manager:', error);
        return null;
    }
}

export default ThemeManager;
