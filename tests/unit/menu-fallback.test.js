import { beforeEach, describe, expect, it } from 'vitest';
import { initMenuFallback } from '../../modules/menu-fallback.js';

// jsdom has no popover, so this is the browser the fallback is for
describe('the menu for a browser without popover', () => {
    let button;
    let menu;
    const open = () => menu.classList.contains('active');

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="mobile-menu" aria-controls="nav-menu">Menu</button>
            <ul id="nav-menu"><li><a href="#a">A</a></li><li><a href="#b">B</a></li></ul>
            <p id="elsewhere">Elsewhere</p>`;
        button = document.getElementById('mobile-menu');
        menu = document.getElementById('nav-menu');
        initMenuFallback();
    });

    it('starts closed and says so, because the markup leaves the attribute out', () => {
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(open()).toBe(false);
    });

    it('the button toggles the menu and aria-expanded follows', () => {
        button.click();
        expect(open()).toBe(true);
        expect(button.classList.contains('active')).toBe(true);
        expect(button.getAttribute('aria-expanded')).toBe('true');
        button.click();
        expect(open()).toBe(false);
        expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('a link tap closes it', () => {
        button.click();
        menu.querySelector('a').click();
        expect(open()).toBe(false);
    });

    it('Escape closes it and returns focus to the button, and does nothing when closed', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.activeElement).not.toBe(button);
        button.click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(open()).toBe(false);
        expect(document.activeElement).toBe(button);
    });

    it('a click outside closes it, and a click inside does not', () => {
        button.click();
        menu.click();
        expect(open()).toBe(true);
        document.getElementById('elsewhere').click();
        expect(open()).toBe(false);
    });

    it('does nothing on a page without the menu', () => {
        document.body.innerHTML = '<p>No menu</p>';
        expect(() => initMenuFallback()).not.toThrow();
    });
});
