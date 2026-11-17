/**
 * The mobile menu for a browser without the popover attribute: the toggle button reports its state
 * through aria-expanded, and Escape and a click outside the menu close it. Everywhere else the menu
 * is a popover that the browser runs by itself (see index.html and main.js `initMobileMenu`), and this
 * file is never fetched.
 */

export function initMenuFallback() {
    const mobileMenu = document.getElementById('mobile-menu');
    const navMenu = document.getElementById('nav-menu');

    if (!mobileMenu || !navMenu) return;

    const isOpen = () => navMenu.classList.contains('active');
    const setOpen = open => {
        mobileMenu.classList.toggle('active', open);
        navMenu.classList.toggle('active', open);
        mobileMenu.setAttribute('aria-expanded', String(open));
    };
    // The markup leaves this out: with popover the browser reports the state itself
    mobileMenu.setAttribute('aria-expanded', 'false');

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
