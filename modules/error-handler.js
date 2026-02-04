/**
 * Error Handler Module
 * Provides centralized error handling, graceful degradation, and user-friendly error messages
 */

import { DEBUG_MODE, debug } from './debug.js';

// Error types for categorization
export const ErrorType = {
    NETWORK: 'network',
    API: 'api',
    PARSE: 'parse',
    DOM: 'dom',
    VALIDATION: 'validation',
    TIMEOUT: 'timeout',
    UNKNOWN: 'unknown'
};

// Error severity levels
export const ErrorSeverity = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
};

/**
 * Custom application error with extended properties
 */
export class AppError extends Error {
    constructor(message, type = ErrorType.UNKNOWN, severity = ErrorSeverity.ERROR, context = {}) {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.severity = severity;
        this.context = context;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * Error handler singleton
 */
class ErrorHandler {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 50;
        this.listeners = new Set();
        this.fallbackStrategies = new Map();
    }

    /**
     * Register a fallback strategy for a specific error type
     * @param {string} errorType - The error type to handle
     * @param {Function} strategy - The fallback function to execute
     */
    registerFallback(errorType, strategy) {
        this.fallbackStrategies.set(errorType, strategy);
    }

    /**
     * Subscribe to error events
     * @param {Function} listener - Callback function
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Notify all listeners of an error
     * @param {Error} error - The error object
     */
    notifyListeners(error) {
        for (const listener of this.listeners) {
            try {
                listener(error);
            } catch (e) {
                debug.error('[ErrorHandler] Listener error:', e);
            }
        }
    }

    /**
     * Log an error
     * @param {Error|AppError} error - The error to log
     */
    log(error) {
        const logEntry = {
            message: error.message,
            type: error.type || ErrorType.UNKNOWN,
            severity: error.severity || ErrorSeverity.ERROR,
            stack: error.stack,
            context: error.context || {},
            timestamp: error.timestamp || new Date().toISOString()
        };

        this.errorLog.push(logEntry);

        // Keep log size manageable
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.shift();
        }

        // Log to console in debug mode
        if (DEBUG_MODE) {
            debug.error('[ErrorHandler]', logEntry);
        }

        // Notify listeners
        this.notifyListeners(logEntry);

        return logEntry;
    }

    /**
     * Handle an error with fallback strategy
     * @param {Error} error - The error to handle
     * @param {Object} options - Options for error handling
     * @returns {any} Result from fallback strategy or undefined
     */
    async handle(error, options = {}) {
        const {
            showUser = true,
            fallbackValue = null,
            context = {}
        } = options;

        // Create AppError if needed
        const appError = error instanceof AppError 
            ? error 
            : new AppError(error.message, this.classifyError(error), ErrorSeverity.ERROR, context);

        // Log the error
        this.log(appError);

        // Try fallback strategy
        const strategy = this.fallbackStrategies.get(appError.type);
        if (strategy) {
            try {
                return await strategy(appError, context);
            } catch (fallbackError) {
                debug.error('[ErrorHandler] Fallback strategy failed:', fallbackError);
            }
        }

        // Show user-friendly message if requested
        if (showUser && appError.severity !== ErrorSeverity.INFO) {
            this.showUserError(appError);
        }

        return fallbackValue;
    }

    /**
     * Classify an error by type
     * @param {Error} error - The error to classify
     * @returns {string} The error type
     */
    classifyError(error) {
        const message = error.message.toLowerCase();

        if (message.includes('network') || message.includes('fetch') || message.includes('net::')) {
            return ErrorType.NETWORK;
        }
        if (message.includes('json') || message.includes('parse') || message.includes('syntax')) {
            return ErrorType.PARSE;
        }
        if (message.includes('timeout') || message.includes('abort')) {
            return ErrorType.TIMEOUT;
        }
        if (message.includes('api') || message.includes('rate limit') || message.includes('403') || message.includes('404')) {
            return ErrorType.API;
        }
        if (message.includes('element') || message.includes('dom') || message.includes('null')) {
            return ErrorType.DOM;
        }

        return ErrorType.UNKNOWN;
    }

    /**
     * Show a user-friendly error message
     * @param {AppError} error - The error to display
     */
    showUserError(error) {
        const messages = {
            [ErrorType.NETWORK]: 'Unable to connect. Please check your internet connection.',
            [ErrorType.API]: 'There was an issue loading data. Some content may not be available.',
            [ErrorType.TIMEOUT]: 'The request took too long. Please try again.',
            [ErrorType.PARSE]: 'There was an issue processing the data.',
            [ErrorType.DOM]: 'There was a display issue. Try refreshing the page.',
            [ErrorType.UNKNOWN]: 'Something went wrong. Please try again.'
        };

        const userMessage = messages[error.type] || messages[ErrorType.UNKNOWN];

        // Try to use notification system if available
        if (typeof window !== 'undefined' && window.appState?.managers?.ui?.showNotification) {
            const type = error.severity === ErrorSeverity.WARNING ? 'warning' : 'error';
            window.appState.managers.ui.showNotification(userMessage, type, 5000);
        }
    }

    /**
     * Wrap an async function with error handling
     * @param {Function} fn - The async function to wrap
     * @param {Object} options - Options for error handling
     * @returns {Function} The wrapped function
     */
    wrapAsync(fn, options = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                return this.handle(error, options);
            }
        };
    }

    /**
     * Create a try-catch boundary
     * @param {Function} fn - The function to execute
     * @param {any} fallback - Fallback value on error
     * @returns {any} Result or fallback value
     */
    boundary(fn, fallback = null) {
        try {
            return fn();
        } catch (error) {
            this.log(error);
            return fallback;
        }
    }

    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getStats() {
        const stats = {
            total: this.errorLog.length,
            byType: {},
            bySeverity: {},
            recent: this.errorLog.slice(-10)
        };

        for (const entry of this.errorLog) {
            stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
            stats.bySeverity[entry.severity] = (stats.bySeverity[entry.severity] || 0) + 1;
        }

        return stats;
    }

    /**
     * Clear the error log
     */
    clear() {
        this.errorLog = [];
    }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

// Register default fallback strategies
errorHandler.registerFallback(ErrorType.NETWORK, async (error, context) => {
    debug.log('[ErrorHandler] Network fallback - checking offline cache');
    // Could implement offline cache lookup here
    return context.fallbackData || null;
});

errorHandler.registerFallback(ErrorType.API, async (error, context) => {
    debug.log('[ErrorHandler] API fallback - using cached/demo data');
    return context.fallbackData || null;
});
