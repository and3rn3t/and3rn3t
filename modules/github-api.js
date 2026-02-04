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
            limit: 60
        };
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.cachedData = null;
        this.maxRetries = 3;
        this.baseDelay = 1000; // 1 second base delay
    }

    // Enhanced retry logic with exponential backoff
    async executeWithRetry(operation, maxRetries = this.maxRetries) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                // Don't retry for certain error types
                if (error.message.includes('404') || error.message.includes('403')) {
                    throw error;
                }
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Exponential backoff with jitter
                const delay = this.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    // Load pre-fetched GitHub data from workflow
    async loadCachedGitHubData() {
        if (this.cachedData) return this.cachedData;
        
        try {
            const response = await fetch('github-data.json');
            if (response.ok) {
                this.cachedData = await response.json();
                return this.cachedData;
            }
        } catch (error) {
            debug.warn('[GitHub] Pre-fetched data not available, using direct API');
        }
        return null;
    }

    // Cache management with TTL (Time To Live)
    getCacheKey(endpoint, params = {}) {
        return `${endpoint}:${JSON.stringify(params)}`;
    }

    setCache(key, data, ttl = 300000) { // 5 minutes default TTL
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
        this.rateLimitInfo.remaining = Number.parseInt(headers.get('X-RateLimit-Remaining') || '60', 10);
        this.rateLimitInfo.limit = Number.parseInt(headers.get('X-RateLimit-Limit') || '60', 10);
        this.rateLimitInfo.reset = Number.parseInt(headers.get('X-RateLimit-Reset') || '0', 10) * 1000;
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

    // Enhanced fetch with retry logic and exponential backoff
    async fetchWithRetry(url, options = {}, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.waitForRateLimit();
                
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        ...options.headers
                    }
                });

                // Update rate limit info
                this.updateRateLimit(response.headers);

                if (response.ok) {
                    return response;
                }

                // Handle specific HTTP errors
                if (response.status === 403) {
                    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
                    if (rateLimitRemaining === '0') {
                        throw new Error('GitHub API rate limit exceeded');
                    }
                }

                if (response.status === 404) {
                    throw new Error('Resource not found');
                }

                throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }

                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, attempt - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Main API method with caching and enhanced retry
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
            const response = await this.fetchWithRetry(url.toString());
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
            let repos = cachedData.repositories;
            
            // Apply client-side sorting if needed
            if (sort === 'stars') {
                repos = repos.sort((a, b) => b.stargazers_count - a.stargazers_count);
            } else if (sort === 'updated') {
                repos = repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            }
            
            // Apply limit
            return repos.slice(0, per_page);
        }
        
        // Fall back to direct API
        return this.fetchGitHubData(`/users/${GitHubAPIManager.username}/repos`, { sort, per_page });
    }

    async getRecentActivity(per_page = 30) {
        // Try cached data first
        const cachedData = await this.loadCachedGitHubData();
        if (cachedData && cachedData.events) {
            return cachedData.events.slice(0, per_page);
        }
        
        // Fall back to direct API (may be limited for public events)
        try {
            return await this.fetchGitHubData(`/users/${GitHubAPIManager.username}/events/public`, { per_page });
        } catch (error) {
            return [];
        }
    }

    async getUserEvents(per_page = 30) {
        return this.fetchGitHubData(`/users/${GitHubAPIManager.username}/events`, { per_page }, 180000); // 3 min cache
    }

    // Get rate limit status
    getRateLimitStatus() {
        return {
            ...this.rateLimitInfo,
            percentage: (this.rateLimitInfo.remaining / this.rateLimitInfo.limit) * 100
        };
    }

    // Display API status for debugging
    displayAPIStatus() {
        const status = this.getRateLimitStatus();
        debug.log('[API] Rate limit status:', {
            remaining: status.remaining,
            limit: status.limit,
            resetTime: new Date(status.reset).toLocaleTimeString(),
            percentage: `${status.percentage.toFixed(1)}%`,
            cacheEntries: this.cache.size
        });
        
        if (status.percentage < 20) {
            debug.warn('[API] GitHub API rate limit is low!');
        }
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

    // Clear all cache (for manual refresh)
    clearCache() {
        const size = this.cache.size;
        this.cache.clear();
        debug.log('[GitHub] Cleared all', size, 'cache entries');
    }
}

// Create singleton instance
export const githubAPI = new GitHubAPIManager();

export default githubAPI;
