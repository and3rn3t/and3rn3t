/**
 * "Currently coding" activity picker, shared by the Worker's /activity route and the
 * client fallback in currently.js (used when the Worker is unreachable).
 */

// Event types we care about.
const INTERESTING_TYPES = new Set([
    'PushEvent',
    'PullRequestEvent',
    'CreateEvent',
    'ReleaseEvent',
    'WatchEvent',
]);

// Repos to skip (e.g. this portfolio repo — too noisy).
export const SKIP_REPOS = new Set(['and3rn3t/and3rn3t']);

/** Pick the most interesting recent event, skipping noise. */
export function pickEvent(events) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

    // First pass: preferred repos only (skip portfolio noise).
    for (const event of events) {
        const repo = event.repo?.name ?? '';
        if (SKIP_REPOS.has(repo) || !INTERESTING_TYPES.has(event.type)) continue;
        if (buildActivity(event, repo)) return event;
    }

    // Second pass: if non-skipped events are absent/stale, include portfolio repo
    // when it has recent activity (within 7 days).
    for (const event of events) {
        const repo = event.repo?.name ?? '';
        if (!INTERESTING_TYPES.has(event.type)) continue;
        const age = new Date(event.created_at ?? 0).getTime();
        if (age < cutoff) break;
        if (buildActivity(event, repo)) return event;
    }

    return null;
}

/** Shape a GitHub event into the widget's activity object, or null if it isn't one. */
export function buildActivity(event, repo) {
    const repoName = repo.split('/').pop();
    const repoUrl = `https://github.com/${repo}`;
    const pushedAt = event.created_at ?? null;
    const base = { repo, repoName, repoUrl, pushedAt };

    if (event.type === 'PushEvent') {
        const commits = event.payload?.commits ?? [];
        const commit =
            [...commits].reverse().find(c => !c.message?.startsWith('Merge')) ?? commits.at(-1);
        const branch = (event.payload?.ref ?? '').replace('refs/heads/', '') || 'main';
        return { ...base, type: 'push', message: commit?.message?.split('\n')[0] ?? null, branch };
    }

    if (event.type === 'PullRequestEvent') {
        const pr = event.payload?.pull_request;
        return { ...base, type: 'pr', message: pr?.title ?? null, branch: pr?.head?.ref ?? null };
    }

    if (event.type === 'CreateEvent') {
        const refType = event.payload?.ref_type;
        if (refType !== 'repository' && refType !== 'branch') return null;
        const message =
            refType === 'repository'
                ? `Created repo ${repoName}`
                : `Created branch ${event.payload?.ref}`;
        return { ...base, type: 'create', message, branch: null };
    }

    if (event.type === 'ReleaseEvent') {
        return {
            ...base,
            type: 'release',
            message: `Released ${event.payload?.release?.tag_name}`,
            branch: null,
        };
    }

    if (event.type === 'WatchEvent') {
        return { ...base, type: 'star', message: `Starred ${repoName}`, branch: null };
    }

    return null;
}
