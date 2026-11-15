/**
 * NavigationManager: in-page anchor scrolling and the active-section highlight in the nav.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationManager } from '../../modules/navigation.js';

const PAGE = `
    <nav>
        <a id="to-about" href="#about">About</a>
        <a id="to-work" href="#work">Work</a>
        <a id="to-top" href="#top">Top</a>
        <a id="to-bare" href="#">Home</a>
        <a id="to-post" href="#post/hello">A post</a>
        <a id="to-missing" href="#nowhere">Missing</a>
        <a id="outside" href="https://example.com" target="_blank">Out</a>
    </nav>
    <section id="about"></section>
    <section id="work"></section>`;

let observed;
let notify;

/** An IntersectionObserver the test can fire by hand. */
class FakeObserver {
    constructor(callback, options) {
        this.options = options;
        notify = entries => callback(entries);
        observed = this;
        this.targets = [];
    }
    observe(target) {
        this.targets.push(target);
    }
}

const click = selector => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector(selector).dispatchEvent(event);
    return event;
};

describe('NavigationManager', () => {
    let nav;

    beforeEach(() => {
        document.body.innerHTML = PAGE;
        vi.stubGlobal('IntersectionObserver', FakeObserver);
        // jsdom has no layout: scrollIntoView does not exist, scrollTo only warns
        Element.prototype.scrollIntoView = vi.fn();
        vi.stubGlobal('scrollTo', vi.fn());
        vi.spyOn(history, 'pushState').mockImplementation(() => {});
        nav = new NavigationManager();
        nav.init();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete Element.prototype.scrollIntoView;
        // The click handler is added to document and cannot be removed; start from a fresh page
        history.replaceState(null, '', '/');
    });

    describe('init', () => {
        it('finds the in-page links and sections, and only runs once', () => {
            expect(nav.navLinks).toHaveLength(6);
            expect(nav.sections).toHaveLength(2);
            const before = nav.navLinks;
            nav.init();
            expect(nav.navLinks).toBe(before);
        });
    });

    describe('clicking an anchor', () => {
        it('scrolls to the section, focuses it and updates the URL', () => {
            const event = click('#to-about');
            const about = document.getElementById('about');

            expect(event.defaultPrevented).toBe(true);
            expect(about.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
            expect(about.getAttribute('tabindex')).toBe('-1');
            expect(document.activeElement).toBe(about);
            expect(history.pushState).toHaveBeenCalledWith(null, '', '#about');
        });

        it.each(['#to-top', '#to-bare'])('scrolls to the top for %s', selector => {
            expect(click(selector).defaultPrevented).toBe(true);
            expect(globalThis.scrollTo).toHaveBeenCalledWith({ top: 0 });
            expect(history.pushState).not.toHaveBeenCalled();
        });

        it('leaves #post/slug links to their own handler', () => {
            expect(click('#to-post').defaultPrevented).toBe(false);
            expect(history.pushState).not.toHaveBeenCalled();
        });

        it('leaves a link to a section that is not on the page alone', () => {
            expect(click('#to-missing').defaultPrevented).toBe(false);
            expect(history.pushState).not.toHaveBeenCalled();
        });

        it('ignores links that are not in-page anchors', () => {
            expect(click('#outside').defaultPrevented).toBe(false);
            expect(click('section').defaultPrevented).toBe(false);
        });
    });

    describe('the hash in the first URL', () => {
        it('scrolls to that section after a short delay', () => {
            vi.useFakeTimers();
            history.replaceState(null, '', '/#work');
            new NavigationManager().init();
            const work = document.getElementById('work');
            expect(work.scrollIntoView).not.toHaveBeenCalled();
            vi.advanceTimersByTime(100);
            expect(work.scrollIntoView).toHaveBeenCalled();
            vi.useRealTimers();
        });
    });

    describe('the active section', () => {
        const active = () =>
            [...document.querySelectorAll('nav a.active')].map(link => link.getAttribute('href'));

        it('watches every section in a band under the navbar', () => {
            expect(observed.targets.map(section => section.id)).toEqual(['about', 'work']);
            expect(observed.options.rootMargin).toBe('-80px 0px -60% 0px');
        });

        it('marks the link of the section that enters the band', () => {
            notify([{ isIntersecting: true, target: document.getElementById('work') }]);
            expect(active()).toEqual(['#work']);
            expect(document.getElementById('to-work').getAttribute('aria-current')).toBe(
                'location'
            );
        });

        it('moves the mark when another section takes over', () => {
            notify([{ isIntersecting: true, target: document.getElementById('about') }]);
            notify([{ isIntersecting: true, target: document.getElementById('work') }]);
            expect(active()).toEqual(['#work']);
            expect(document.getElementById('to-about').hasAttribute('aria-current')).toBe(false);
        });

        it('ignores a section leaving the band', () => {
            notify([{ isIntersecting: false, target: document.getElementById('about') }]);
            expect(active()).toEqual([]);
            expect(nav.currentSection).toBeNull();
        });

        it('does nothing when the same section is reported again', () => {
            nav.setActiveSection('about');
            const link = document.getElementById('to-about');
            const toggle = vi.spyOn(link.classList, 'add');
            nav.setActiveSection('about');
            expect(toggle).not.toHaveBeenCalled();
        });

        it('does not observe anything on a page with no sections', () => {
            document.body.innerHTML = '<nav><a href="#about">About</a></nav>';
            observed = null;
            new NavigationManager().init();
            expect(observed).toBeNull();
        });
    });
});
