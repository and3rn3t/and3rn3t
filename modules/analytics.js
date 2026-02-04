/**
 * Analytics Module
 * Consolidated analytics tracking with privacy-first approach
 */

import { debug } from './debug.js';

// Analytics events configuration
const EVENT_CATEGORIES = {
    NAVIGATION: 'navigation',
    ENGAGEMENT: 'engagement',
    INTERACTION: 'interaction',
    ERROR: 'error',
    PERFORMANCE: 'performance'
};

const STORAGE_KEY = 'portfolio_analytics';
const SESSION_KEY = 'portfolio_session';

export class AnalyticsManager {
    constructor() {
        this.isInitialized = false;
        this.sessionId = null;
        this.sessionStart = null;
        this.pageViews = 0;
        this.events = [];
        this.userJourney = [];
        this.engagementData = {
            scrollDepth: 0,
            timeOnPage: 0,
            interactions: 0
        };
        this.observers = new Map();
    }

    init() {
        if (this.isInitialized) return;
        
        debug.log('[Analytics] Initializing analytics manager...');
        
        this.initSession();
        this.trackPageView();
        this.setupEngagementTracking();
        this.setupScrollTracking();
        this.setupInteractionTracking();
        this.setupVisibilityTracking();
        this.setupExitIntent();
        
        this.isInitialized = true;
        debug.log('[Analytics] Analytics manager initialized');
    }

    // ========================================
    // Session Management
    // ========================================

    initSession() {
        // Check for existing session
        const existingSession = sessionStorage.getItem(SESSION_KEY);
        
        if (existingSession) {
            try {
                const session = JSON.parse(existingSession);
                this.sessionId = session.id;
                this.sessionStart = session.start;
                this.pageViews = session.pageViews || 0;
            } catch (e) {
                this.createNewSession();
            }
        } else {
            this.createNewSession();
        }
        
        debug.log('[Analytics] Session:', {
            id: this.sessionId,
            pageViews: this.pageViews
        });
    }

    createNewSession() {
        this.sessionId = this.generateId();
        this.sessionStart = Date.now();
        this.pageViews = 0;
        
        this.saveSession();
    }

    saveSession() {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            id: this.sessionId,
            start: this.sessionStart,
            pageViews: this.pageViews
        }));
    }

    generateId() {
        return 'xxxx-xxxx-xxxx'.replace(/x/g, () => 
            Math.floor(Math.random() * 16).toString(16)
        );
    }

    // ========================================
    // Page View Tracking
    // ========================================

    trackPageView(pageName) {
        const page = pageName || window.location.pathname;
        this.pageViews++;
        
        const pageViewEvent = {
            type: 'pageview',
            category: EVENT_CATEGORIES.NAVIGATION,
            page,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            referrer: document.referrer || 'direct'
        };
        
        this.events.push(pageViewEvent);
        this.userJourney.push({
            page,
            timestamp: Date.now()
        });
        
        this.saveSession();
        
        debug.log('[Analytics] Page view:', page);
        
        // Send to analytics if configured
        this.sendToAnalytics(pageViewEvent);
    }

    // ========================================
    // Event Tracking
    // ========================================

    trackEvent(eventName, eventData = {}) {
        const event = {
            type: 'event',
            name: eventName,
            category: eventData.category || EVENT_CATEGORIES.INTERACTION,
            ...eventData,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            page: window.location.pathname
        };
        
        this.events.push(event);
        this.engagementData.interactions++;
        
        debug.log('[Analytics] Event:', eventName, eventData);
        
        this.sendToAnalytics(event);
    }

    trackClick(element, eventData = {}) {
        const data = {
            category: EVENT_CATEGORIES.INTERACTION,
            elementTag: element.tagName,
            elementId: element.id || null,
            elementClass: element.className || null,
            elementText: element.textContent?.substring(0, 50) || null,
            ...eventData
        };
        
        this.trackEvent('click', data);
    }

    trackError(error, context = {}) {
        const errorEvent = {
            type: 'error',
            category: EVENT_CATEGORIES.ERROR,
            message: error.message || String(error),
            stack: error.stack || null,
            ...context,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            page: window.location.pathname
        };
        
        this.events.push(errorEvent);
        
        debug.error('[Analytics] Error tracked:', error);
        
        this.sendToAnalytics(errorEvent);
    }

    trackPerformance(metricName, value, unit = 'ms') {
        const perfEvent = {
            type: 'performance',
            category: EVENT_CATEGORIES.PERFORMANCE,
            metric: metricName,
            value,
            unit,
            timestamp: Date.now(),
            sessionId: this.sessionId
        };
        
        this.events.push(perfEvent);
        
        debug.log(`[Analytics] Performance: ${metricName} = ${value}${unit}`);
        
        this.sendToAnalytics(perfEvent);
    }

    // ========================================
    // Engagement Tracking
    // ========================================

    setupEngagementTracking() {
        // Track time on page
        const startTime = Date.now();
        
        setInterval(() => {
            this.engagementData.timeOnPage = Math.floor((Date.now() - startTime) / 1000);
        }, 1000);
        
        // Track time spent before leaving
        window.addEventListener('beforeunload', () => {
            this.trackEvent('session_end', {
                category: EVENT_CATEGORIES.ENGAGEMENT,
                timeOnPage: this.engagementData.timeOnPage,
                scrollDepth: this.engagementData.scrollDepth,
                interactions: this.engagementData.interactions
            });
        });
    }

    setupScrollTracking() {
        let maxScrollDepth = 0;
        let lastTrackedDepth = 0;
        const depthMilestones = [25, 50, 75, 90, 100];
        
        const trackScroll = () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPercent = Math.round((scrollTop / docHeight) * 100);
            
            if (scrollPercent > maxScrollDepth) {
                maxScrollDepth = scrollPercent;
                this.engagementData.scrollDepth = maxScrollDepth;
                
                // Track milestone depths
                for (const milestone of depthMilestones) {
                    if (scrollPercent >= milestone && lastTrackedDepth < milestone) {
                        this.trackEvent('scroll_depth', {
                            category: EVENT_CATEGORIES.ENGAGEMENT,
                            depth: milestone
                        });
                        lastTrackedDepth = milestone;
                        break;
                    }
                }
            }
        };
        
        // Throttled scroll tracking
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(trackScroll, 100);
        }, { passive: true });
    }

    setupInteractionTracking() {
        // Track button clicks
        document.addEventListener('click', (e) => {
            const target = e.target.closest('button, a, [role="button"], .btn, .card');
            if (target) {
                // Determine click type
                let clickType = 'click';
                if (target.matches('a')) {
                    clickType = target.href?.includes('#') ? 'anchor_click' : 'link_click';
                } else if (target.matches('button, .btn')) {
                    clickType = 'button_click';
                } else if (target.matches('.card, .project-card')) {
                    clickType = 'card_click';
                }
                
                this.trackEvent(clickType, {
                    category: EVENT_CATEGORIES.INTERACTION,
                    element: target.tagName,
                    text: target.textContent?.trim().substring(0, 30),
                    href: target.href || null
                });
            }
        });
        
        // Track form interactions
        document.addEventListener('submit', (e) => {
            if (e.target.matches('form')) {
                this.trackEvent('form_submit', {
                    category: EVENT_CATEGORIES.INTERACTION,
                    formId: e.target.id || null
                });
            }
        });
    }

    setupVisibilityTracking() {
        document.addEventListener('visibilitychange', () => {
            const state = document.visibilityState;
            this.trackEvent('visibility_change', {
                category: EVENT_CATEGORIES.ENGAGEMENT,
                state: state
            });
        });
    }

    setupExitIntent() {
        document.addEventListener('mouseout', (e) => {
            if (e.clientY <= 0 && e.relatedTarget == null) {
                this.trackEvent('exit_intent', {
                    category: EVENT_CATEGORIES.ENGAGEMENT,
                    timeOnPage: this.engagementData.timeOnPage,
                    scrollDepth: this.engagementData.scrollDepth
                });
            }
        });
    }

    // ========================================
    // Section Visibility Tracking
    // ========================================

    trackSectionVisibility(sections) {
        if (!('IntersectionObserver' in window)) return;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const sectionId = entry.target.id || entry.target.className;
                    this.trackEvent('section_view', {
                        category: EVENT_CATEGORIES.ENGAGEMENT,
                        section: sectionId
                    });
                }
            });
        }, { threshold: 0.5 });
        
        sections.forEach(section => {
            if (typeof section === 'string') {
                const el = document.querySelector(section);
                if (el) observer.observe(el);
            } else {
                observer.observe(section);
            }
        });
        
        this.observers.set('sections', observer);
    }

    // ========================================
    // Analytics Sending
    // ========================================

    sendToAnalytics(event) {
        // Cloudflare Analytics / Beacon API
        if (navigator.sendBeacon && window.ANALYTICS_ENDPOINT) {
            try {
                navigator.sendBeacon(window.ANALYTICS_ENDPOINT, JSON.stringify(event));
            } catch (e) {
                debug.warn('[Analytics] Failed to send beacon:', e);
            }
        }
        
        // Google Analytics 4 (if configured)
        if (window.gtag) {
            try {
                if (event.type === 'pageview') {
                    window.gtag('event', 'page_view', {
                        page_path: event.page
                    });
                } else {
                    window.gtag('event', event.name || event.type, {
                        event_category: event.category,
                        ...event
                    });
                }
            } catch (e) {
                debug.warn('[Analytics] Failed to send to GA:', e);
            }
        }
        
        // Store locally for batch sending
        this.storeEvent(event);
    }

    storeEvent(event) {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            stored.push(event);
            
            // Keep only last 100 events
            const trimmed = stored.slice(-100);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        } catch (e) {
            debug.warn('[Analytics] Failed to store event:', e);
        }
    }

    // ========================================
    // Reporting
    // ========================================

    getSessionStats() {
        return {
            sessionId: this.sessionId,
            sessionDuration: Math.floor((Date.now() - this.sessionStart) / 1000),
            pageViews: this.pageViews,
            ...this.engagementData,
            eventCount: this.events.length,
            userJourney: this.userJourney
        };
    }

    getEvents(options = {}) {
        let filtered = [...this.events];
        
        if (options.category) {
            filtered = filtered.filter(e => e.category === options.category);
        }
        
        if (options.type) {
            filtered = filtered.filter(e => e.type === options.type);
        }
        
        if (options.limit) {
            filtered = filtered.slice(-options.limit);
        }
        
        return filtered;
    }

    // ========================================
    // Cleanup
    // ========================================

    destroy() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();
        this.events = [];
        this.userJourney = [];
        this.isInitialized = false;
    }
}

// Export singleton instance
export const analyticsManager = new AnalyticsManager();

// Export event categories for use in other modules
export { EVENT_CATEGORIES };

export default analyticsManager;
