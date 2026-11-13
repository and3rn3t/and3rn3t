/**
 * Stands in for the "cloudflare:workers" module in Node, where it does not exist (vitest.config.js
 * aliases it here). Only what the Worker's code imports.
 */
export class DurableObject {
    constructor(ctx, env) {
        this.ctx = ctx;
        this.env = env;
    }
}
