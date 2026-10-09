/**
 * Error Handler Module
 * Logs errors and, when asked, tells the visitor in plain words via a notification.
 */

import { debug } from './debug.js';

const MESSAGES = {
    network: 'Unable to connect. Please check your internet connection.',
    timeout: 'The request took too long. Please try again.',
    api: 'There was an issue loading data. Some content may not be available.',
    unknown: 'Something went wrong. Please try again.',
};

function classify(error) {
    const message = String(error?.message ?? '').toLowerCase();
    if (message.includes('timeout') || error?.name === 'TimeoutError') return 'timeout';
    if (error?.status || message.includes('rate limit')) return 'api';
    if (message.includes('network') || message.includes('fetch')) return 'network';
    return 'unknown';
}

export const errorHandler = {
    /**
     * @param {Error} error
     * @param {{ showUser?: boolean, context?: object }} [options]
     */
    handle(error, { showUser = true, context = {} } = {}) {
        debug.error('[ErrorHandler]', error?.message ?? error, context);
        if (showUser) {
            globalThis.appState?.managers?.ui?.showNotification?.(
                MESSAGES[classify(error)],
                'error',
                5000
            );
        }
    },
};
