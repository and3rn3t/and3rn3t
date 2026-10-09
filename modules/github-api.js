/**
 * GitHub API Manager Module
 * Handles all GitHub API interactions with caching, rate limiting, and retry logic
 */

import { debug } from './debug.js';

export class GitHubAPIManager {
    static baseUrl = 'https://api.github.com';
    static username = 'and3rn3t';

    constructor() {
        this.cache = new Map();
        this.rateLimitInfo = {
            remaining: 60,
            reset: Date.now() + 3600000,
            limit: 60,
        };
        this.cachedData = null;
        this.maxRetries = 3;
        this.baseDelay = 1000; // 1 second base delay
    }

    // Retry with exponential backoff and jitter. Client errors (404, rate limit) are
    // not retried: they fail the same way every time.
    async executeWithRetry(operation, maxRetries = this.maxRetries) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;

                if (error.status === 403 || error.status === 404 || attempt === maxRetries) {
                    throw error;
                }

                // Exponential backoff with jitter
                const delay = this.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    // Load pre-fetched GitHub data from workflow. The in-flight promise is shared so
    // projects, stats and the currently-coding pill trigger a single request.
    loadCachedGitHubData() {
        this.cachedDataPromise ??= (async () => {
            try {
                const response = await fetch('/github-data.json');
                if (response.ok) {
                    this.cachedData = await response.json();
                    return this.cachedData;
                }
            } catch (_error) {
                debug.warn('[GitHub] Pre-fetched data not available, using direct API');
            }
            this.cachedDataPromise = null; // allow a later retry
            return null;
        })();
        return this.cachedDataPromise;
    }

    // Cache management with TTL (Time To Live)
    getCacheKey(endpoint, params = {}) {
        return `${endpoint}:${JSON.stringify(params)}`;
    }

    setCache(key, data, ttl = 300000) {
        // 5 minutes default TTL
        const expiry = Date.now() + ttl;
        this.cache.set(key, { data, expiry });
    }

    getCache(key) {
        const cached = this.cache.get(key);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }
        if (cached) {
            this.cache.delete(key); // Remove expired cache
        }
        return null;
    }

    // Rate limit handling
    updateRateLimit(headers) {
        this.rateLimitInfo.remaining = Number.parseInt(
            headers.get('X-RateLimit-Remaining') || '60',
            10
        );
        this.rateLimitInfo.limit = Number.parseInt(headers.get('X-RateLimit-Limit') || '60', 10);
        this.rateLimitInfo.reset =
            Number.parseInt(headers.get('X-RateLimit-Reset') || '0', 10) * 1000;
    }

    async waitForRateLimit() {
        if (this.rateLimitInfo.remaining <= 1) {
            const waitTime = Math.max(0, this.rateLimitInfo.reset - Date.now());
            if (waitTime > 0) {
                debug.log('[GitHub] Rate limit reached, waiting', waitTime, 'ms');
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    // Single fetch; failures throw an Error carrying the HTTP `status` so
    // executeWithRetry can decide whether retrying makes sense.
    async fetchGitHub(url) {
        await this.waitForRateLimit();
        const response = await fetch(url, {
            headers: { Accept: 'application/vnd.github.v3+json' },
        });
        this.updateRateLimit(response.headers);
        if (response.ok) {
            return response;
        }

        let message = `HTTP ${response.status}: ${response.statusText}`;
        if (response.status === 404) {
            message = 'Resource not found';
        } else if (
            response.status === 403 &&
            response.headers.get('X-RateLimit-Remaining') === '0'
        ) {
            message = 'GitHub API rate limit exceeded';
        }
        throw Object.assign(new Error(message), { status: response.status });
    }

    // Main API method with caching and retry
    async fetchGitHubData(endpoint, params = {}, ttl = 300000) {
        const cacheKey = this.getCacheKey(endpoint, params);

        // Check cache first
        const cachedData = this.getCache(cacheKey);
        if (cachedData) {
            debug.log('[GitHub] Cache hit for', endpoint);
            return cachedData;
        }

        // Build URL with parameters
        const url = new URL(`${GitHubAPIManager.baseUrl}${endpoint}`);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }

        return await this.executeWithRetry(async () => {
            const response = await this.fetchGitHub(url.toString());
            const data = await response.json();

            // Cache the result
            this.setCache(cacheKey, data, ttl);

            return data;
        });
    }

    // Convenience methods for common endpoints
    async getUserData() {
        // Try cached data first
        const cachedData = await this.loadCachedGitHubData();
        if (cachedData && cachedData.user) {
            return cachedData.user;
        }

        // Fall back to direct API
        return this.fetchGitHubData(`/users/${GitHubAPIManager.username}`, {}, 600000); // 10 min cache
    }

    async getRepositories(sort = 'stars', per_page = 100) {
        // Try cached data first
        const cachedData = await this.loadCachedGitHubData();
        if (cachedData && cachedData.repositories) {
            // Sort a copy: the cached array is shared with other modules.
            const repos = [...cachedData.repositories];
            if (sort === 'stars') {
                repos.sort((a, b) => b.stargazers_count - a.stargazers_count);
            } else if (sort === 'updated') {
                repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            }

            // Apply limit
            return repos.slice(0, per_page);
        }

        // Fall back to direct API
        return this.fetchGitHubData(`/users/${GitHubAPIManager.username}/repos`, {
            sort,
            per_page,
        });
    }

    // Pre-fetched contribution calendar (from the daily data workflow). Returns
    // { total, weeks: [{ days: [{ date, count, level }] }] } or null if unavailable.
    async getContributions() {
        const cachedData = await this.loadCachedGitHubData();
        return cachedData?.contributions ?? null;
    }

    // Clear expired cache entries
    clearExpiredCache() {
        const now = Date.now();
        let removedCount = 0;

        for (const [key, value] of this.cache.entries()) {
            if (value.expiry < now) {
                this.cache.delete(key);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            debug.log('[GitHub] Cleared', removedCount, 'expired cache entries');
        }

        return removedCount;
    }
}

// Create singleton instance
export const githubAPI = new GitHubAPIManager();
