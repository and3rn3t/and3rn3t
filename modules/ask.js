/**
 * Ask the portfolio, on this device (lab experiment `ask`, the command palette): a question in plain
 * words goes to the browser's built-in model (Chrome's Prompt API, `LanguageModel`), which picks the
 * pages that best answer it. Nothing leaves the device.
 *
 * The model SELECTS and the site SPEAKS. The model is given the site's own list of projects and
 * posts (an id, a title, a short summary, tags) and may only answer with ids from that list: the
 * answer is constrained to a JSON schema whose ids are an enum, so it cannot name a page that is not
 * there, and it is checked again after parsing. What the visitor then reads is the hand-written
 * copy of the pages it picked, shown by the palette. The model never writes a sentence about
 * Matt, so there is no sentence for it to get wrong, only a choice that can be a poor one, and the
 * palette says so.
 *
 * The question is sent as the user's message, never as an instruction, and can only change which of
 * the listed ids come back. The first half of this file is pure so tests can run it without a browser.
 */

/** The most pages one question may bring back. */
export const MAX_PICKS = 3;
/** A longer question is cut: the model's context is small, and a question is a sentence. */
export const MAX_QUESTION_CHARS = 200;
/** Shortest question worth asking: below this the palette's plain search is the answer. */
export const MIN_QUESTION_CHARS = 4;

/** What the model is asked to take and give: English text. Must match between availability() and create(). */
export const MODEL_OPTIONS = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

const SUMMARY_CHARS = 110;

/**
 * One line of the list the model reads.
 * @param {{ id: string, title: string, summary: string, tags: string[] }} entry
 * @returns {string}
 */
export function indexLine({ id, title, summary, tags }) {
    return `${id} | ${title} | ${summary} | ${tags.join(', ')}`;
}

/**
 * The projects and posts as the model's list, from the site's own data files.
 * @param {{ projects?: object[] }} projectsData - projects-data.json
 * @param {{ posts?: object[] }} postsData - posts-data.json
 * @returns {{ id: string, kind: 'project' | 'post', title: string, summary: string, tags: string[] }[]}
 */
export function buildEntries(projectsData, postsData) {
    const clean = text =>
        String(text ?? '')
            .replace(/\s+/g, ' ')
            .replaceAll('|', '/')
            .trim()
            .slice(0, SUMMARY_CHARS);
    const projects = (projectsData?.projects ?? []).map(project => ({
        id: `project:${project.name}`,
        kind: 'project',
        title: clean(project.displayName || project.name),
        summary: clean(project.description),
        tags: (project.technologies ?? []).slice(0, 5).map(clean),
    }));
    const posts = (postsData?.posts ?? []).map(post => ({
        id: `post:${post.slug}`,
        kind: 'post',
        title: clean(post.title),
        summary: clean(post.summary),
        tags: (post.tags ?? []).slice(0, 4).map(clean),
    }));
    return [...projects, ...posts];
}

/** The instruction the model starts with. The visitor's question is never part of it. */
export function systemPrompt(entries) {
    return [
        "You help a visitor find pages on a software developer's portfolio.",
        'Below is every project and post, one per line as: id | title | summary | tags.',
        `Given the visitor's question, answer with the ids of up to ${MAX_PICKS} entries that best answer it, most relevant first.`,
        'Answer with an empty list when nothing fits. Use only ids from the list. Do not answer the question yourself.',
        '',
        ...entries.map(indexLine),
    ].join('\n');
}

/**
 * The JSON Schema the answer must match: a list of ids, each one of the ids that exist.
 * @param {string[]} ids
 */
export function pickSchema(ids) {
    return {
        type: 'object',
        properties: {
            picks: { type: 'array', maxItems: MAX_PICKS, items: { type: 'string', enum: ids } },
        },
        required: ['picks'],
        additionalProperties: false,
    };
}

/**
 * The ids in the model's answer, checked against the list again whatever the schema promised.
 * @param {string} text - the model's answer
 * @param {string[]} ids - the ids that exist
 * @returns {{ ids: string[], invalid: number }} the valid ones in order, without repeats, and how many were not on the list
 */
export function parsePicks(text, ids) {
    let picks;
    try {
        picks = JSON.parse(text)?.picks;
    } catch {
        return { ids: [], invalid: 0 };
    }
    if (!Array.isArray(picks)) return { ids: [], invalid: 0 };
    const known = new Set(ids);
    const valid = [];
    let invalid = 0;
    for (const pick of picks) {
        if (typeof pick === 'string' && known.has(pick)) {
            if (!valid.includes(pick)) valid.push(pick);
        } else {
            invalid++;
        }
    }
    return { ids: valid.slice(0, MAX_PICKS), invalid };
}

/** @param {string} question @returns {string} the question as the model gets it */
export function cleanQuestion(question) {
    return String(question ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_QUESTION_CHARS);
}

/**
 * Whether asking is worth offering, without starting anything: the API is there and does not say it
 * cannot run here. 'downloadable' counts: the first ask downloads the model.
 * @param {{ availability: Function } | undefined} languageModel
 * @returns {Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>}
 */
export async function askAvailability(languageModel = globalThis.LanguageModel) {
    if (typeof languageModel?.availability !== 'function') return 'unavailable';
    try {
        const state = await languageModel.availability(MODEL_OPTIONS);
        return ['available', 'downloadable', 'downloading'].includes(state) ? state : 'unavailable';
    } catch {
        return 'unavailable';
    }
}

/**
 * Ask the model which pages answer a question.
 * @param {object} input
 * @param {string} input.question
 * @param {ReturnType<typeof buildEntries>} input.entries
 * @param {{ availability: Function, create: Function }} [input.languageModel]
 * @param {AbortSignal} [input.signal]
 * @param {(fraction: number) => void} [input.onDownload] - progress of the model's first download, 0..1
 * @returns {Promise<{ status: 'ok', ids: string[], invalid: number }
 *   | { status: 'unavailable' | 'too-long' | 'error' | 'cancelled' }>}
 */
export async function askPortfolio({
    question,
    entries,
    languageModel = globalThis.LanguageModel,
    signal,
    onDownload,
}) {
    const text = cleanQuestion(question);
    if (!text || entries.length === 0) return { status: 'error' };
    if ((await askAvailability(languageModel)) === 'unavailable') return { status: 'unavailable' };

    const ids = entries.map(entry => entry.id);
    let session;
    try {
        session = await languageModel.create({
            ...MODEL_OPTIONS,
            initialPrompts: [{ role: 'system', content: systemPrompt(entries) }],
            signal,
            monitor(monitor) {
                monitor.addEventListener('downloadprogress', event => onDownload?.(event.loaded));
            },
        });
        const answer = await session.prompt(text, {
            responseConstraint: pickSchema(ids),
            signal,
        });
        return { status: 'ok', ...parsePicks(answer, ids) };
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') return { status: 'cancelled' };
        // The list, the schema and the question did not fit the model's context
        if (error?.name === 'QuotaExceededError') return { status: 'too-long' };
        return { status: 'error' };
    } finally {
        try {
            session?.destroy?.();
        } catch {
            // Already gone
        }
    }
}

/** What the palette says about the result. A choice made by a model can be a poor one, and it says that. */
export const NOTES = {
    picked: 'Picked on this device by the browser’s built-in model, from the site’s own list. It can be wrong.',
    none: 'Nothing on the site seems to answer that. Here is a plain search instead.',
    asking: 'Asking the model on this device…',
    downloading: 'Getting the model ready on this device (a large, one-time download)…',
    unavailable: 'This browser cannot run the model on this device.',
    tooLong: 'That did not fit the model on this device.',
    error: 'That did not work on this device.',
};

/** @param {number} fraction @returns {string} */
export function downloadNote(fraction) {
    const percent = Math.round(Math.min(1, Math.max(0, Number(fraction) || 0)) * 100);
    return `${NOTES.downloading} ${percent}%`;
}

// ── In the command palette ───────────────────────────────────────────────────

/** @param {string} path @returns {Promise<any>} */
const fetchJson = path => fetch(path).then(response => response.json());

/**
 * Wire asking into the palette (modules/command-palette.js), which keeps only a thin hook so that
 * visitors without the switch and the API are not sent any of this.
 * @param {object} palette
 * @returns {Promise<{ decorate: (query: string) => void, run: (question: string) => Promise<void>, clear: () => void } | null>}
 *   null when the browser says it cannot run the model
 */
export async function attachAsk(palette) {
    if ((await askAvailability()) === 'unavailable') return null;
    let controller = null;
    let entries = null;
    let noteElement = null;

    /** The note sits above the list, outside it: it is not an option. */
    const drawNote = () => {
        if (!palette.note) {
            noteElement?.remove();
            noteElement = null;
            return;
        }
        if (!noteElement) {
            noteElement = document.createElement('p');
            noteElement.className = 'palette-note';
            palette.resultsContent.before(noteElement);
        }
        noteElement.textContent = palette.note;
        if (palette.statusEl) palette.statusEl.textContent = palette.note;
    };

    /** @param {string} note @param {object[] | null} items - the answer, or null to go back to the plain search */
    const show = (note, items) => {
        palette.note = note;
        palette.pinned = items;
        palette.render();
    };

    return {
        decorate(query) {
            // Offered above the plain results, for a question that is a sentence
            if (!palette.pinned && query.trim().length >= MIN_QUESTION_CHARS) {
                palette.filtered.unshift({
                    type: 'ask',
                    icon: 'search',
                    title: `Ask: ${query.trim()}`,
                    subtitle: 'Let the browser’s model pick the pages that answer it',
                });
            }
            drawNote();
        },

        clear() {
            controller?.abort();
            controller = null;
        },

        async run(question) {
            controller?.abort();
            const mine = new AbortController();
            controller = mine;
            show(NOTES.asking, []);
            let finished = false;
            try {
                entries ??= Promise.all([
                    fetchJson('/projects-data.json'),
                    fetchJson('/posts-data.json'),
                ]).then(([projects, posts]) => buildEntries(projects, posts));
                const result = await askPortfolio({
                    question,
                    entries: await entries,
                    signal: mine.signal,
                    // A progress report that arrives after the answer must not replace it
                    onDownload: fraction => {
                        if (!finished && !mine.signal.aborted) show(downloadNote(fraction), []);
                    },
                });
                finished = true;
                if (mine.signal.aborted) return;
                if (result.status === 'ok') {
                    // The pages it picked, as the palette's own items: they open the real page
                    const items = result.ids
                        .map(id => palette.items.find(item => item.id === id))
                        .filter(Boolean);
                    show(items.length ? NOTES.picked : NOTES.none, items.length ? items : null);
                    return;
                }
                const notes = { unavailable: NOTES.unavailable, 'too-long': NOTES.tooLong };
                show(notes[result.status] ?? NOTES.error, null);
            } catch {
                if (!mine.signal.aborted) show(NOTES.error, null);
            }
        },
    };
}
