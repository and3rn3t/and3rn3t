/**
 * Navigation Module
 * Site navigation, smooth scrolling, search functionality, and content discovery
 */

import { debug } from './debug.js';
import { analyticsManager } from './analytics.js';

// Navigation configuration
const CONFIG = {
    scrollOffset: 80,
    scrollBehavior: 'smooth',
    activeClass: 'active',
    stickyClass: 'sticky',
    searchDebounce: 300
};

export class NavigationManager {
    constructor() {
        this.nav = null;
        this.navLinks = [];
        this.sections = [];
        this.searchInput = null;
        this.currentSection = null;
        this.isSticky = false;
        this.scrollTimer = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        
        debug.log('[Navigation] Initializing navigation manager...');
        
        this.nav = document.querySelector('nav, .nav, header');
        this.navLinks = document.querySelectorAll('nav a[href^="#"], .nav-links a[href^="#"]');
        this.sections = document.querySelectorAll('section[id]');
        this.searchInput = document.querySelector('#search, .search-input');
        
        this.setupSmoothScrolling();
        this.setupStickyNav();
        this.setupActiveStates();
        this.setupSearch();
        this.setupKeyboardNav();
        this.setupBackToTop();
        
        this.isInitialized = true;
        debug.log('[Navigation] Navigation manager initialized');
    }

    // ========================================
    // Smooth Scrolling
    // ========================================

    setupSmoothScrolling() {
        // Handle anchor links
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href^="#"]');
            if (!link) return;
            
            const targetId = link.getAttribute('href');
            if (targetId === '#' || targetId === '#top') {
                e.preventDefault();
                this.scrollToTop();
                return;
            }
            
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                this.scrollToElement(target);
                
                // Update URL without jumping
                history.pushState(null, '', targetId);
                
                // Track navigation
                analyticsManager.trackEvent('navigation', {
                    type: 'anchor',
                    target: targetId
                });
            }
        });
        
        // Handle initial hash on page load
        if (window.location.hash) {
            setTimeout(() => {
                const target = document.querySelector(window.location.hash);
                if (target) {
                    this.scrollToElement(target);
                }
            }, 100);
        }
    }

    scrollToElement(element, offset = CONFIG.scrollOffset) {
        const elementPosition = element.getBoundingClientRect().top + window.scrollY;
        const offsetPosition = elementPosition - offset;
        
        window.scrollTo({
            top: offsetPosition,
            behavior: CONFIG.scrollBehavior
        });
        
        // Focus the element for accessibility
        element.setAttribute('tabindex', '-1');
        element.focus({ preventScroll: true });
    }

    scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: CONFIG.scrollBehavior
        });
    }

    scrollToSection(sectionId) {
        const section = document.querySelector(`#${sectionId}`);
        if (section) {
            this.scrollToElement(section);
        }
    }

    // ========================================
    // Sticky Navigation
    // ========================================

    setupStickyNav() {
        if (!this.nav) return;
        
        const navTop = this.nav.offsetTop;
        
        window.addEventListener('scroll', () => {
            if (window.scrollY > navTop + 100) {
                if (!this.isSticky) {
                    this.nav.classList.add(CONFIG.stickyClass);
                    document.body.classList.add('has-sticky-nav');
                    this.isSticky = true;
                }
            } else {
                if (this.isSticky) {
                    this.nav.classList.remove(CONFIG.stickyClass);
                    document.body.classList.remove('has-sticky-nav');
                    this.isSticky = false;
                }
            }
        }, { passive: true });
    }

    // ========================================
    // Active States
    // ========================================

    setupActiveStates() {
        if (this.sections.length === 0 || this.navLinks.length === 0) return;
        
        // Use Intersection Observer for section tracking
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.setActiveSection(entry.target.id);
                }
            });
        }, {
            threshold: 0.3,
            rootMargin: `-${CONFIG.scrollOffset}px 0px -50% 0px`
        });
        
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
                link.setAttribute('aria-current', 'true');
            } else {
                link.classList.remove(CONFIG.activeClass);
                link.removeAttribute('aria-current');
            }
        });
        
        debug.log('[Navigation] Active section:', sectionId);
    }

    // ========================================
    // Search Functionality
    // ========================================

    setupSearch() {
        if (!this.searchInput) return;
        
        let debounceTimer;
        
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            
            debounceTimer = setTimeout(() => {
                const query = e.target.value.trim();
                this.handleSearch(query);
            }, CONFIG.searchDebounce);
        });
        
        // Clear search on Escape
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearSearch();
            }
        });
        
        // Search form submission
        const searchForm = this.searchInput.closest('form');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSearch(this.searchInput.value.trim());
            });
        }
    }

    handleSearch(query) {
        if (!query || query.length < 2) {
            this.clearSearchHighlights();
            return;
        }
        
        debug.log('[Navigation] Searching for:', query);
        
        // Dispatch search event for other modules to handle
        window.dispatchEvent(new CustomEvent('search', {
            detail: { query }
        }));
        
        // Track search
        analyticsManager.trackEvent('search', {
            query,
            resultsCount: 0 // Will be updated by handlers
        });
        
        // Highlight matching content
        this.highlightSearchResults(query);
    }

    highlightSearchResults(query) {
        // Remove existing highlights
        this.clearSearchHighlights();
        
        if (!query) return;
        
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        
        // Search in main content areas
        const contentElements = document.querySelectorAll(
            '.project-description, .project-title, section p, section h2, section h3'
        );
        
        contentElements.forEach(el => {
            if (el.textContent.toLowerCase().includes(query.toLowerCase())) {
                el.classList.add('search-match');
                
                // Highlight the text
                const originalHTML = el.innerHTML;
                el.innerHTML = originalHTML.replace(regex, '<mark class="search-highlight">$1</mark>');
                el.dataset.originalHtml = originalHTML;
            }
        });
    }

    clearSearchHighlights() {
        // Restore original HTML
        document.querySelectorAll('.search-match').forEach(el => {
            if (el.dataset.originalHtml) {
                el.innerHTML = el.dataset.originalHtml;
                delete el.dataset.originalHtml;
            }
            el.classList.remove('search-match');
        });
        
        // Remove highlight marks
        document.querySelectorAll('.search-highlight').forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        });
    }

    clearSearch() {
        if (this.searchInput) {
            this.searchInput.value = '';
        }
        this.clearSearchHighlights();
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ========================================
    // Keyboard Navigation
    // ========================================

    setupKeyboardNav() {
        document.addEventListener('keydown', (e) => {
            // Skip if typing in an input
            if (e.target.matches('input, textarea, select')) return;
            
            switch (e.key) {
                case '/':
                    // Focus search
                    if (this.searchInput) {
                        e.preventDefault();
                        this.searchInput.focus();
                    }
                    break;
                    
                case 'Home':
                    e.preventDefault();
                    this.scrollToTop();
                    break;
                    
                case 'End':
                    e.preventDefault();
                    window.scrollTo({
                        top: document.body.scrollHeight,
                        behavior: CONFIG.scrollBehavior
                    });
                    break;
                    
                case 'j':
                    // Next section
                    if (!e.ctrlKey && !e.metaKey) {
                        this.navigateToNextSection();
                    }
                    break;
                    
                case 'k':
                    // Previous section
                    if (!e.ctrlKey && !e.metaKey) {
                        this.navigateToPrevSection();
                    }
                    break;
            }
        });
    }

    navigateToNextSection() {
        const sectionIds = Array.from(this.sections).map(s => s.id);
        const currentIndex = sectionIds.indexOf(this.currentSection);
        
        if (currentIndex < sectionIds.length - 1) {
            this.scrollToSection(sectionIds[currentIndex + 1]);
        }
    }

    navigateToPrevSection() {
        const sectionIds = Array.from(this.sections).map(s => s.id);
        const currentIndex = sectionIds.indexOf(this.currentSection);
        
        if (currentIndex > 0) {
            this.scrollToSection(sectionIds[currentIndex - 1]);
        } else {
            this.scrollToTop();
        }
    }

    // ========================================
    // Back to Top Button
    // ========================================

    setupBackToTop() {
        const btn = document.querySelector('.back-to-top, #back-to-top');
        if (!btn) return;
        
        // Show/hide button based on scroll position
        window.addEventListener('scroll', () => {
            if (window.scrollY > 500) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
            }
        }, { passive: true });
        
        // Handle click
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            this.scrollToTop();
            
            analyticsManager.trackEvent('navigation', {
                type: 'back-to-top'
            });
        });
    }

    // ========================================
    // Utilities
    // ========================================

    getSections() {
        return Array.from(this.sections).map(s => ({
            id: s.id,
            title: s.querySelector('h2, h3')?.textContent || s.id,
            isActive: s.id === this.currentSection
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
