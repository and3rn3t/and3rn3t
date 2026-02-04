/**
 * Theme Manager Module
 * Handles dark/light theme switching with system preference support
 */

import { debug } from './debug.js';

export class ThemeManager {
    constructor() {
        this.themes = ['light', 'dark'];
        this.currentTheme = this.getInitialTheme();
        this.followSystem = localStorage.getItem('followSystemTheme') === 'true';
        
        this.toggle = null;
        this.menu = null;
        this.closeBtn = null;
        this.options = [];
        this.systemCheckbox = null;
        
        this.init();
    }
    
    init() {
        this.initializeElements();
        this.applyTheme(this.currentTheme, false);
        this.setupEventListeners();
        this.setupSystemThemeListener();
        debug.log('[Theme] Manager initialized with theme:', this.currentTheme);
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
        
        debug.log('[Theme] Applied theme:', theme);
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
    
    // Public API
    getTheme() {
        return this.currentTheme;
    }
    
    isDark() {
        return this.currentTheme === 'dark';
    }
    
    toggle() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
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
