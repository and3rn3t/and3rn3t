/**
 * Activity Feed Module
 *
 * Renders a compact timeline of recent GitHub events into #activity-feed,
 * using the events array already present in github-data.json (no extra fetch).
 * Shows the last 10 interesting events across all repos.
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';

const MAX_EVENTS = 10;
const INTERESTING = new Set(['PushEvent', 'PullRequestEvent', 'CreateEvent', 'ReleaseEvent', 'WatchEvent', 'DeleteEvent']);

const EVENT_ICONS = {
    PushEvent:        'code-commit',
    PullRequestEvent: 'code-pull-request',
    CreateEvent:      'plus-circle',
    ReleaseEvent:     'tag',
    WatchEvent:       'star',
    DeleteEvent:      'trash-alt',
};

class ActivityFeed {
    async init(selector = '#activity-feed') {
        const container = document.querySelector(selector);
        if (!container) return;

        try {
            const data = await githubAPI.loadCachedGitHubData();
            const events = data?.events ?? [];
            const rendered = this.#buildItems(events);
            if (!rendered.length) {
                container.hidden = true;
                return;
            }
            container.innerHTML = `<ol class="activity-list" aria-label="Recent GitHub activity">${rendered.join('')}</ol>`;
            debug.log('[ActivityFeed] Rendered', rendered.length, 'events');
        } catch (err) {
            debug.warn('[ActivityFeed] Failed:', err);
            container.hidden = true;
        }
    }

    #buildItems(events) {
        const items = [];
        for (const event of events) {
            if (!INTERESTING.has(event.type)) continue;
            const repo = event.repo?.name ?? '';
            const repoName = repo.split('/').pop();
            const repoUrl = `https://github.com/${repo}`;
            const desc = this.#describe(event, repoName);
            if (!desc) continue;

            const icon = EVENT_ICONS[event.type] ?? 'circle';
            const rel  = this.#relTime(event.created_at);

            items.push(`
                <li class="activity-item">
                    <span class="activity-icon" aria-hidden="true"><i class="fas fa-${this.#escHtml(icon)}"></i></span>
                    <span class="activity-body">
                        <a href="${this.#escHtml(repoUrl)}" target="_blank" rel="noopener noreferrer" class="activity-repo">${this.#escHtml(repoName)}</a>
                        <span class="activity-desc">${this.#escHtml(desc)}</span>
                    </span>
                    <time class="activity-time" datetime="${this.#escHtml(event.created_at ?? '')}">${this.#escHtml(rel)}</time>
                </li>`);

            if (items.length >= MAX_EVENTS) break;
        }
        return items;
    }

    #describe(event, repoName) {
        switch (event.type) {
            case 'PushEvent': {
                const commits = event.payload?.commits ?? [];
                const commit = [...commits].reverse().find((c) => !c.message?.startsWith('Merge')) ?? commits.at(-1);
                const msg = commit?.message?.split('\n')[0];
                return msg ? `pushed "${msg}"` : `pushed to ${repoName}`;
            }
            case 'PullRequestEvent': {
                const action = event.payload?.action ?? 'updated';
                const title  = event.payload?.pull_request?.title ?? '';
                return title ? `${action} PR: ${title}` : `${action} a pull request`;
            }
            case 'CreateEvent': {
                const refType = event.payload?.ref_type;
                const ref     = event.payload?.ref ?? repoName;
                return refType === 'repository' ? `created repo ${repoName}` : `created ${refType} ${ref}`;
            }
            case 'ReleaseEvent': {
                const tag = event.payload?.release?.tag_name ?? '';
                return `released ${tag}`;
            }
            case 'WatchEvent':
                return `starred ${repoName}`;
            case 'DeleteEvent': {
                const refType = event.payload?.ref_type ?? 'ref';
                const ref     = event.payload?.ref ?? '';
                return `deleted ${refType} ${ref}`;
            }
            default:
                return null;
        }
    }

    #relTime(iso) {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        const mins  = Math.floor(diff / 60_000);
        const hours = Math.floor(diff / 3_600_000);
        const days  = Math.floor(diff / 86_400_000);
        if (mins  <  1) return 'just now';
        if (mins  < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days  <  7) return `${days}d ago`;
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    #escHtml(str) {
        return String(str ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }
}

export const activityFeed = new ActivityFeed();
