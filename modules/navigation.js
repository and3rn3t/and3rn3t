/**
 * Navigation Module
 * In-page anchor scrolling and active-section highlighting
 */

import { debug } from './debug.js';

// Plain in-page section anchors (#about); excludes #post/<slug> and #project/<slug>
const SECTION_HASH = /^#[A-Za-z][\w-]*$/;

// Navigation configuration
const CONFIG = {
    scrollOffset: 80, // roughly the fixed navbar; keep in step with --nav-height in styles.css
    activeClass: 'active',
};

export class NavigationManager {
    constructor() {
        this.navLinks = [];
        this.sections = [];
        this.currentSection = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;

        debug.log('[Navigation] Initializing navigation manager...');

        this.navLinks = document.querySelectorAll('nav a[href^="#"], .nav-links a[href^="#"]');
        this.sections = document.querySelectorAll('section[id]');

        this.setupSmoothScrolling();
        this.setupActiveStates();

        this.isInitialized = true;
        debug.log('[Navigation] Navigation manager initialized');
    }

    // ========================================
    // Smooth Scrolling
    // ========================================

    setupSmoothScrolling() {
        // Handle anchor links
        document.addEventListener('click', e => {
            const link = e.target.closest('a[href^="#"]');
            if (!link) return;

            const targetId = link.getAttribute('href');
            if (targetId === '#' || targetId === '#top') {
                e.preventDefault();
                this.scrollToTop();
                return;
            }

            // Only plain #section-id links; #post/slug and #project/slug have their own handlers
            if (!SECTION_HASH.test(targetId)) return;

            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                this.scrollToElement(target);

                // Update URL without jumping
                history.pushState(null, '', targetId);
            }
        });

        // Handle initial hash on page load
        if (SECTION_HASH.test(globalThis.location.hash)) {
            setTimeout(() => {
                const target = document.querySelector(globalThis.location.hash);
                if (target) {
                    this.scrollToElement(target);
                }
            }, 100);
        }
    }

    // Smooth vs. instant comes from CSS scroll-behavior (off under prefers-reduced-motion);
    // the fixed-navbar offset comes from scroll-margin-top on the sections.
    scrollToElement(element) {
        element.scrollIntoView({ block: 'start' });

        // Focus the element for accessibility
        element.setAttribute('tabindex', '-1');
        element.focus({ preventScroll: true });
    }

    scrollToTop() {
        globalThis.scrollTo({ top: 0 });
    }

    scrollToSection(sectionId) {
        const section = document.querySelector(`#${sectionId}`);
        if (section) {
            this.scrollToElement(section);
        }
    }

    // ========================================
    // Active States
    // ========================================

    setupActiveStates() {
        if (this.sections.length === 0 || this.navLinks.length === 0) return;

        // Use Intersection Observer for section tracking
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.setActiveSection(entry.target.id);
                    }
                });
            },
            {
                // A band just under the navbar; a section is current while it overlaps the band.
                // (A height-based threshold never fires for sections taller than the band.)
                threshold: 0,
                rootMargin: `-${CONFIG.scrollOffset}px 0px -60% 0px`,
            }
        );

        this.sections.forEach(section => {
            observer.observe(section);
        });
    }

    setActiveSection(sectionId) {
        if (this.currentSection === sectionId) return;

        this.currentSection = sectionId;

        // Update nav links
        this.navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href === `#${sectionId}`) {
                link.classList.add(CONFIG.activeClass);
                link.setAttribute('aria-current', 'location');
            } else {
                link.classList.remove(CONFIG.activeClass);
                link.removeAttribute('aria-current');
            }
        });

        debug.log('[Navigation] Active section:', sectionId);
    }

    // ========================================
    // Utilities
    // ========================================

    getSections() {
        return Array.from(this.sections).map(s => ({
            id: s.id,
            title: s.querySelector('h2, h3')?.textContent || s.id,
            isActive: s.id === this.currentSection,
        }));
    }

    getCurrentSection() {
        return this.currentSection;
    }

    // Cleanup
    destroy() {
        this.navLinks = [];
        this.sections = [];
        this.isInitialized = false;
    }
}

// Create singleton instance
export const navigationManager = new NavigationManager();

export default navigationManager;
