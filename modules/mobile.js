/**
 * Mobile Optimization Module
 * Consolidated mobile detection, touch handling, and mobile UI enhancements
 */

import { debug } from './debug.js';

// Constants for touch gestures
const GESTURE_CONFIG = {
    minSwipeDistance: 50,
    maxSwipeTime: 300,
    doubleTapDelay: 300,
    longPressDelay: 500,
    touchMoveThreshold: 10
};

// Viewport breakpoints
const BREAKPOINTS = {
    mobile: 480,
    tablet: 768,
    desktop: 1024
};

export class MobileManager {
    constructor() {
        this.isMobile = false;
        this.isTouch = false;
        this.currentBreakpoint = 'desktop';
        this.orientation = 'portrait';
        this.touchStartPos = null;
        this.touchStartTime = null;
        this.lastTapTime = 0;
        this.longPressTimer = null;
        this.gestureCallbacks = new Map();
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        
        debug.log('[Mobile] Initializing mobile manager...');
        
        this.detectCapabilities();
        this.updateBreakpoint();
        this.updateOrientation();
        this.setupResizeObserver();
        this.setupTouchHandlers();
        this.setupOrientationHandler();
        this.optimizeForMobile();
        
        this.isInitialized = true;
        debug.log('[Mobile] Mobile manager initialized', {
            isMobile: this.isMobile,
            isTouch: this.isTouch,
            breakpoint: this.currentBreakpoint
        });
    }

    // ========================================
    // Detection
    // ========================================

    detectCapabilities() {
        // Touch detection
        this.isTouch = 'ontouchstart' in window || 
                       navigator.maxTouchPoints > 0 ||
                       window.matchMedia('(pointer: coarse)').matches;
        
        // Mobile user agent detection
        const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        const isMobileUA = mobileUA.test(navigator.userAgent);
        
        // Combined detection
        this.isMobile = isMobileUA || (this.isTouch && window.innerWidth <= BREAKPOINTS.tablet);
        
        // Add body classes
        document.body.classList.toggle('touch-device', this.isTouch);
        document.body.classList.toggle('mobile-device', this.isMobile);
    }

    updateBreakpoint() {
        const width = window.innerWidth;
        let newBreakpoint;
        
        if (width <= BREAKPOINTS.mobile) {
            newBreakpoint = 'mobile';
        } else if (width <= BREAKPOINTS.tablet) {
            newBreakpoint = 'tablet';
        } else {
            newBreakpoint = 'desktop';
        }
        
        if (newBreakpoint !== this.currentBreakpoint) {
            const oldBreakpoint = this.currentBreakpoint;
            this.currentBreakpoint = newBreakpoint;
            
            document.body.classList.remove('breakpoint-mobile', 'breakpoint-tablet', 'breakpoint-desktop');
            document.body.classList.add(`breakpoint-${newBreakpoint}`);
            
            debug.log(`[Mobile] Breakpoint changed: ${oldBreakpoint} -> ${newBreakpoint}`);
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent('breakpointchange', {
                detail: { from: oldBreakpoint, to: newBreakpoint }
            }));
        }
    }

    updateOrientation() {
        const newOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
        
        if (newOrientation !== this.orientation) {
            const oldOrientation = this.orientation;
            this.orientation = newOrientation;
            
            document.body.classList.remove('orientation-portrait', 'orientation-landscape');
            document.body.classList.add(`orientation-${newOrientation}`);
            
            debug.log(`[Mobile] Orientation changed: ${oldOrientation} -> ${newOrientation}`);
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent('orientationchange', {
                detail: { from: oldOrientation, to: newOrientation }
            }));
        }
    }

    // ========================================
    // Observers & Handlers
    // ========================================

    setupResizeObserver() {
        let resizeTimeout;
        
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.updateBreakpoint();
                this.updateOrientation();
            }, 100);
        }, { passive: true });
    }

    setupOrientationHandler() {
        if (screen.orientation) {
            screen.orientation.addEventListener('change', () => {
                this.updateOrientation();
            });
        }
    }

    setupTouchHandlers() {
        if (!this.isTouch) return;
        
        // Global touch handlers for gesture detection
        document.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
        document.addEventListener('touchcancel', () => this.handleTouchCancel(), { passive: true });
        
        debug.log('[Mobile] Touch handlers initialized');
    }

    handleTouchStart(e) {
        if (e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        this.touchStartPos = { x: touch.clientX, y: touch.clientY };
        this.touchStartTime = Date.now();
        
        // Long press detection
        this.longPressTimer = setTimeout(() => {
            if (this.touchStartPos) {
                this.triggerGesture('longpress', {
                    x: this.touchStartPos.x,
                    y: this.touchStartPos.y,
                    target: e.target
                });
            }
        }, GESTURE_CONFIG.longPressDelay);
    }

    handleTouchMove(e) {
        if (!this.touchStartPos) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.touchStartPos.x;
        const deltaY = touch.clientY - this.touchStartPos.y;
        
        // Cancel long press if moved too much
        if (Math.abs(deltaX) > GESTURE_CONFIG.touchMoveThreshold || 
            Math.abs(deltaY) > GESTURE_CONFIG.touchMoveThreshold) {
            clearTimeout(this.longPressTimer);
        }
        
        // Prevent pull-to-refresh on mobile
        if (deltaY > 0 && window.scrollY === 0) {
            // Allow the default behavior for pull-to-refresh
        }
    }

    handleTouchEnd(e) {
        clearTimeout(this.longPressTimer);
        
        if (!this.touchStartPos || !this.touchStartTime) return;
        
        const touch = e.changedTouches[0];
        const endPos = { x: touch.clientX, y: touch.clientY };
        const elapsed = Date.now() - this.touchStartTime;
        
        const deltaX = endPos.x - this.touchStartPos.x;
        const deltaY = endPos.y - this.touchStartPos.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Swipe detection
        if (distance >= GESTURE_CONFIG.minSwipeDistance && elapsed <= GESTURE_CONFIG.maxSwipeTime) {
            const direction = this.getSwipeDirection(deltaX, deltaY);
            this.triggerGesture('swipe', {
                direction,
                distance,
                velocity: distance / elapsed,
                target: e.target
            });
        }
        
        // Double tap detection
        const now = Date.now();
        if (distance < GESTURE_CONFIG.touchMoveThreshold && 
            now - this.lastTapTime < GESTURE_CONFIG.doubleTapDelay) {
            this.triggerGesture('doubletap', {
                x: endPos.x,
                y: endPos.y,
                target: e.target
            });
        }
        this.lastTapTime = now;
        
        this.touchStartPos = null;
        this.touchStartTime = null;
    }

    handleTouchCancel() {
        clearTimeout(this.longPressTimer);
        this.touchStartPos = null;
        this.touchStartTime = null;
    }

    getSwipeDirection(deltaX, deltaY) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        
        if (absX > absY) {
            return deltaX > 0 ? 'right' : 'left';
        } else {
            return deltaY > 0 ? 'down' : 'up';
        }
    }

    // ========================================
    // Gesture API
    // ========================================

    on(gesture, callback) {
        if (!this.gestureCallbacks.has(gesture)) {
            this.gestureCallbacks.set(gesture, []);
        }
        this.gestureCallbacks.get(gesture).push(callback);
    }

    off(gesture, callback) {
        if (!this.gestureCallbacks.has(gesture)) return;
        
        const callbacks = this.gestureCallbacks.get(gesture);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    triggerGesture(gesture, data) {
        const callbacks = this.gestureCallbacks.get(gesture);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    debug.error(`[Mobile] Gesture callback error:`, error);
                }
            });
        }
        
        // Also dispatch a custom event
        window.dispatchEvent(new CustomEvent(`gesture:${gesture}`, { detail: data }));
        debug.log(`[Mobile] Gesture: ${gesture}`, data);
    }

    // ========================================
    // Mobile Optimizations
    // ========================================

    optimizeForMobile() {
        if (!this.isMobile) return;
        
        this.setupSafeAreas();
        this.optimizeButtons();
        this.optimizeInputs();
        this.preventZoom();
        this.setupPullToRefresh();
        
        debug.log('[Mobile] Mobile optimizations applied');
    }

    setupSafeAreas() {
        // Handle iOS safe areas
        const root = document.documentElement;
        
        // Check for safe area support
        if (CSS.supports('padding-bottom: env(safe-area-inset-bottom)')) {
            root.style.setProperty('--safe-area-top', 'env(safe-area-inset-top)');
            root.style.setProperty('--safe-area-bottom', 'env(safe-area-inset-bottom)');
            root.style.setProperty('--safe-area-left', 'env(safe-area-inset-left)');
            root.style.setProperty('--safe-area-right', 'env(safe-area-inset-right)');
        }
    }

    optimizeButtons() {
        // Ensure touch targets are at least 44x44px
        const smallButtons = document.querySelectorAll('button, .btn, [role="button"]');
        smallButtons.forEach(btn => {
            const rect = btn.getBoundingClientRect();
            if (rect.width < 44 || rect.height < 44) {
                btn.style.minWidth = '44px';
                btn.style.minHeight = '44px';
            }
        });
    }

    optimizeInputs() {
        // Prevent zoom on input focus in iOS
        const inputs = document.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            // Ensure font size is at least 16px to prevent zoom
            const fontSize = window.getComputedStyle(input).fontSize;
            if (parseFloat(fontSize) < 16) {
                input.style.fontSize = '16px';
            }
        });
    }

    preventZoom() {
        // Prevent double-tap zoom
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
    }

    setupPullToRefresh() {
        // Add pull-to-refresh indicator for mobile
        if (this.isMobile && 'serviceWorker' in navigator) {
            let startY = 0;
            let pulling = false;
            
            document.addEventListener('touchstart', (e) => {
                if (window.scrollY === 0) {
                    startY = e.touches[0].pageY;
                    pulling = true;
                }
            }, { passive: true });
            
            document.addEventListener('touchmove', (e) => {
                if (!pulling) return;
                
                const currentY = e.touches[0].pageY;
                const pullDistance = currentY - startY;
                
                if (pullDistance > 100 && window.scrollY === 0) {
                    document.body.classList.add('pull-to-refresh');
                }
            }, { passive: true });
            
            document.addEventListener('touchend', () => {
                if (document.body.classList.contains('pull-to-refresh')) {
                    document.body.classList.remove('pull-to-refresh');
                    window.location.reload();
                }
                pulling = false;
            }, { passive: true });
        }
    }

    // ========================================
    // Navigation
    // ========================================

    initMobileNav() {
        const hamburger = document.querySelector('.hamburger, .mobile-menu-toggle');
        const mobileNav = document.querySelector('.nav-links, .mobile-nav');
        
        if (!hamburger || !mobileNav) return;
        
        hamburger.addEventListener('click', () => {
            this.toggleMobileMenu(hamburger, mobileNav);
        });
        
        // Close menu on outside click
        document.addEventListener('click', (e) => {
            if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
                this.closeMobileMenu(hamburger, mobileNav);
            }
        });
        
        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeMobileMenu(hamburger, mobileNav);
            }
        });
        
        // Close menu on navigation
        mobileNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                this.closeMobileMenu(hamburger, mobileNav);
            });
        });
        
        debug.log('[Mobile] Mobile navigation initialized');
    }

    toggleMobileMenu(hamburger, nav) {
        const isOpen = nav.classList.toggle('active');
        hamburger.classList.toggle('active');
        hamburger.setAttribute('aria-expanded', isOpen);
        
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }

    closeMobileMenu(hamburger, nav) {
        nav.classList.remove('active');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    }

    // ========================================
    // Utilities
    // ========================================

    getDeviceInfo() {
        return {
            isMobile: this.isMobile,
            isTouch: this.isTouch,
            breakpoint: this.currentBreakpoint,
            orientation: this.orientation,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            pixelRatio: window.devicePixelRatio || 1
        };
    }

    isSmallScreen() {
        return this.currentBreakpoint === 'mobile';
    }

    isMediumScreen() {
        return this.currentBreakpoint === 'tablet';
    }

    isLargeScreen() {
        return this.currentBreakpoint === 'desktop';
    }

    // Cleanup
    destroy() {
        this.gestureCallbacks.clear();
        clearTimeout(this.longPressTimer);
        this.isInitialized = false;
    }
}

// Create singleton instance
export const mobileManager = new MobileManager();

export default mobileManager;
