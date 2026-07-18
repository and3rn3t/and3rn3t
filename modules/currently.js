/**
 * Currently Coding Widget
 *
 * Fetches the most recent meaningful GitHub activity from the Cloudflare Worker
 * (which itself caches 5 min at the edge). Falls back gracefully to the
 * pre-fetched events in github-data.json if the Worker is unreachable.
 *
 * Renders into any element matching the selector passed to `init()`.
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';
import { WORKER_BASE } from './config.js';
import { escapeHtml } from './utils/html.js';

const WORKER_URL = `${WORKER_BASE}/activity`;

const SKIP_REPOS = new Set(['and3rn3t/and3rn3t']);

const TYPE_LABELS = {
    push: 'pushing to',
    pr: 'opening a PR on',
    create: 'created',
    release: 'released',
    star: 'starred',
};

const TYPE_ICONS = {
    push: 'code-branch',
    pr: 'code-pull-request',
    create: 'plus-circle',
    release: 'tag',
    star: 'star',
};

class CurrentlyWidget {
    container = null;

    async init(selector = '#currently-coding') {
        this.container = document.querySelector(selector);
        if (!this.container) {
            debug.warn('[Currently] Container not found:', selector);
            return;
        }

        const activity = await this.fetchActivity();
        if (!activity) {
            // Nothing to show — hide the slot entirely so it doesn't leave blank space.
            this.container.hidden = true;
            return;
        }

        this.render(activity);
        debug.log('[Currently] Widget rendered:', activity);
    }

    async fetchActivity() {
        // 1. Try the Worker (live, ~5 min cache at CF edge).
        try {
            const resp = await fetch(WORKER_URL, { signal: AbortSignal.timeout(4000) });
            if (resp.ok) {
                const data = await resp.json();
                if (data.repo && !SKIP_REPOS.has(data.repo)) {
                    return data;
                }
            }
        } catch (err) {
            debug.warn('[Currently] Worker unavailable, using static fallback:', err.message);
        }

        // 2. Fall back to pre-fetched events in github-data.json.
        return this.activityFromCache();
    }

    async activityFromCache() {
        try {
            const cached = await githubAPI.loadCachedGitHubData();
            const events = cached?.events ?? [];
            return this.pickActivity(events);
        } catch {
            return null;
        }
    }

    pickActivity(events) {
        const INTERESTING = new Set([
            'PushEvent',
            'PullRequestEvent',
            'CreateEvent',
            'ReleaseEvent',
        ]);
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

        // First pass: skip portfolio repo, prefer recent activity.
        for (const event of events) {
            const repo = event.repo?.name ?? '';
            if (SKIP_REPOS.has(repo) || !INTERESTING.has(event.type)) continue;
            const result = this.buildActivity(event, repo);
            if (result) return result;
        }

        // Second pass: everything outside SKIP_REPOS was stale or absent.
        // If the best available activity (including portfolio repo) is recent,
        // show it rather than leaving the widget blank or showing 2-week-old data.
        for (const event of events) {
            const repo = event.repo?.name ?? '';
            if (!INTERESTING.has(event.type)) continue;
            const age = new Date(event.created_at ?? 0).getTime();
            if (age < cutoff) break; // events are chronological; nothing newer follows
            const result = this.buildActivity(event, repo);
            if (result) return result;
        }

        return null;
    }

    buildActivity(event, repo) {
        const repoName = repo.split('/').pop();
        const repoUrl = `https://github.com/${repo}`;
        const pushedAt = event.created_at ?? null;
        const base = { repo, repoName, repoUrl, pushedAt };

        if (event.type === 'PushEvent') {
            const commits = event.payload?.commits ?? [];
            const commit =
                [...commits].reverse().find(c => !c.message?.startsWith('Merge')) ?? commits.at(-1);
            const branch = (event.payload?.ref ?? '').replace('refs/heads/', '') || 'main';
            return {
                ...base,
                type: 'push',
                message: commit?.message?.split('\n')[0] ?? null,
                branch,
            };
        }
        if (event.type === 'PullRequestEvent') {
            const pr = event.payload?.pull_request;
            return {
                ...base,
                type: 'pr',
                message: pr?.title ?? null,
                branch: pr?.head?.ref ?? null,
            };
        }
        if (event.type === 'CreateEvent') {
            const refType = event.payload?.ref_type;
            if (refType !== 'repository' && refType !== 'branch') return null;
            const message =
                refType === 'repository'
                    ? `Created ${repoName}`
                    : `Created branch ${event.payload?.ref}`;
            return { ...base, type: 'create', message, branch: null };
        }
        if (event.type === 'ReleaseEvent') {
            const tag = event.payload?.release?.tag_name;
            return { ...base, type: 'release', message: `Released ${tag}`, branch: null };
        }
        return null;
    }

    render(activity) {
        if (!this.container) return;

        const verb = TYPE_LABELS[activity.type] ?? 'working on';
        const icon = TYPE_ICONS[activity.type] ?? 'code';
        const relTime = activity.pushedAt ? this._relTime(new Date(activity.pushedAt)) : null;

        const messageHtml = activity.message
            ? `<span class="currently-message">"${escapeHtml(activity.message)}"</span>`
            : '';

        const branchHtml =
            activity.branch && activity.type === 'push'
                ? `<span class="currently-branch"><i class="fas fa-code-branch" aria-hidden="true"></i>${escapeHtml(activity.branch)}</span>`
                : '';

        const timeHtml = relTime
            ? `<span class="currently-time" title="${escapeHtml(activity.pushedAt ?? '')}">${escapeHtml(relTime)}</span>`
            : '';

        this.container.innerHTML = `
            <div class="currently-widget" role="status" aria-live="polite">
                <span class="currently-dot" aria-hidden="true"></span>
                <span class="currently-label">
                    <i class="fas fa-${icon}" aria-hidden="true"></i>
                    Currently ${escapeHtml(verb)}
                    <a href="${escapeHtml(activity.repoUrl)}" target="_blank" rel="noopener noreferrer"
                       class="currently-repo">${escapeHtml(activity.repoName)}</a>
                </span>
                ${messageHtml}
                <span class="currently-meta">${branchHtml}${timeHtml}</span>
            </div>
        `;
    }

    _relTime(date) {
        const diff = Date.now() - date.getTime();
        const m = Math.floor(diff / 60000);
        const h = Math.floor(diff / 3600000);
        const d = Math.floor(diff / 86400000);
        if (m < 2) return 'just now';
        if (m < 60) return `${m}m ago`;
        if (h < 24) return `${h}h ago`;
        if (d < 7) return `${d}d ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
}


export const currentlyWidget = new CurrentlyWidget();
export default currentlyWidget;
