/**
 * Register the service worker (https only, after startup: main.js). register() takes a script
 * address, a Trusted Types sink, so it goes through the policy in utils/html.js. The worker takes
 * over as soon as it installs, so a controller change means the code behind this tab was replaced:
 * say so, and do not reload under the visitor.
 */

import { debug } from './debug.js';
import { trustedScriptUrl } from './utils/html.js';

/** @param {() => void} onUpdate - called once, if a worker replaces one that was already in control */
export async function registerServiceWorker(onUpdate) {
    try {
        const registration = await navigator.serviceWorker.register(trustedScriptUrl('/sw.js'));
        debug.log('[App] Service Worker registered:', registration.scope);
        if (!navigator.serviceWorker.controller) return; // first install, nothing was replaced
        navigator.serviceWorker.addEventListener('controllerchange', onUpdate, { once: true });
    } catch (error) {
        debug.warn('[App] Service Worker registration failed:', error);
    }
}
