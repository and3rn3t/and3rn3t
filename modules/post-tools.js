/**
 * Post tools (lab experiment `post-tools`): key points and a translation of a post, made on the
 * visitor's own device by the browser's built-in model (Chrome's Summarizer and Translator APIs).
 * Nothing is sent anywhere. The module is only loaded where one of the APIs exists and the switch
 * is on (modules/post-page.js).
 *
 * What the model writes is the model's, not the author's, and it can be wrong, so every result is
 * labelled and the post stays the source. The first use downloads a large model, so each tool is a
 * button, says so, and shows progress; after that it works offline. A post too long for the
 * model's input limit is not summarised (the start of it would misstate the rest).
 *
 * The first half is pure so tests can run it without a page; everything shown is set with textContent.
 */

/** Languages offered for reading a post in (the Summarizer and Translator both cover these). */
export const TARGET_LANGUAGES = [
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'ja', name: '日本語' },
];

/**
 * The parts of a post worth reading aloud, translating or summarising: paragraphs, headings and
 * list items. Code, tables, figures and anything hidden are left out (a model "translating" code
 * only damages it).
 * @param {ParentNode} root - the post's `.prose` element
 * @returns {{ tag: string, text: string }[]}
 */
export function collectBlocks(root) {
    const blocks = [];
    for (const el of root.querySelectorAll('p, h2, h3, h4, li')) {
        if (el.closest('pre, figure, table, [aria-hidden="true"]')) {
            continue;
        }
        // A list item that holds paragraphs or another list is counted through those
        if (el.tagName === 'LI' && el.querySelector('p, ul, ol')) {
            continue;
        }
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text) {
            blocks.push({ tag: el.tagName.toLowerCase(), text });
        }
    }
    return blocks;
}

/**
 * @param {{ text: string }[]} blocks
 * @returns {string}
 */
export function articleText(blocks) {
    return blocks.map(block => block.text).join('\n\n');
}

/**
 * The language the post is written in, from the page: `<html lang="en-US">` is "en".
 * @param {{ documentElement: { lang?: string } }} doc
 * @returns {string}
 */
export function sourceLanguage(doc) {
    const lang = (doc.documentElement.lang ?? '').split('-')[0].toLowerCase();
    return /^[a-z]{2,3}$/.test(lang) ? lang : 'en';
}

/**
 * What an `availability()` answer means for the visitor.
 * @param {string} value - 'available', 'downloadable', 'downloading' or 'unavailable'
 * @returns {{ usable: boolean, download: boolean }}
 */
export function describeAvailability(value) {
    return {
        usable: value === 'available' || value === 'downloadable' || value === 'downloading',
        download: value === 'downloadable' || value === 'downloading',
    };
}

/**
 * The lines of a plain-text key-points answer, without their bullet marks.
 * @param {string} text
 * @returns {string[]}
 */
export function bulletLines(text) {
    return String(text)
        .split('\n')
        .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
        .filter(Boolean);
}

/**
 * @param {number} loaded - the browser's download progress, 0..1
 * @returns {string}
 */
export function downloadLabel(loaded) {
    const percent = Math.round(Math.min(1, Math.max(0, Number(loaded) || 0)) * 100);
    return `Downloading the model to this device… ${percent}%`;
}

// ── The panel ────────────────────────────────────────────────────────────────

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function button(label, onClick) {
    const node = element('button', 'post-tools__button', label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
}

/** A `monitor` for create(): reports the model's download to `show`. */
const watchDownload = show => monitor => {
    monitor.addEventListener('downloadprogress', event => show(downloadLabel(event.loaded)));
};

/** Add the panel between a post's header and its text. Safe to call more than once. */
export function initPostTools() {
    const head = document.querySelector('.post-head');
    const prose = document.querySelector('.post-head + .prose');
    const hasSummarizer = 'Summarizer' in globalThis;
    const hasTranslator = 'Translator' in globalThis;
    if (!head || !prose || document.querySelector('.post-tools')) {
        return;
    }
    if (!hasSummarizer && !hasTranslator) {
        return;
    }

    const link = element('link');
    link.rel = 'stylesheet';
    link.href = '/styles/post-tools.css';
    document.head.append(link);

    const panel = element('section', 'post-tools');
    panel.setAttribute('aria-labelledby', 'post-tools-title');
    const title = element('h2', 'post-tools__title', 'On this device');
    title.id = 'post-tools-title';
    const note = element(
        'p',
        'post-tools__note',
        'These use the model built into this browser. Nothing is sent anywhere. The first use downloads that model, which is large; after that they work offline. What it writes is the model’s, not the author’s, and it can be wrong: the post is the source.'
    );
    const actions = element('div', 'post-tools__actions');
    const status = element('p', 'post-tools__status');
    status.setAttribute('role', 'status');
    const output = element('div', 'post-tools__output');

    const blocks = collectBlocks(prose);
    let busy = false;
    const controls = [];
    const setBusy = on => {
        busy = on;
        for (const control of controls) {
            control.disabled = on;
        }
    };
    const clear = () => {
        status.textContent = '';
        output.replaceChildren();
    };
    /** Run one tool: one at a time, and any failure is said, never swallowed. */
    const run = async task => {
        if (busy) {
            return;
        }
        setBusy(true);
        clear();
        try {
            await task();
        } catch {
            status.textContent = 'That did not work on this device. Nothing was changed.';
        } finally {
            setBusy(false);
        }
    };

    if (hasSummarizer) {
        const keyPoints = button('Key points', () =>
            run(async () => {
                const availability = describeAvailability(
                    await globalThis.Summarizer.availability()
                );
                if (!availability.usable) {
                    status.textContent = 'This browser cannot run the summarizer on this device.';
                    return;
                }
                status.textContent = availability.download
                    ? 'Getting the model ready on this device…'
                    : 'Reading the post…';
                const summarizer = await globalThis.Summarizer.create({
                    type: 'key-points',
                    format: 'plain-text',
                    length: 'medium',
                    expectedInputLanguages: [sourceLanguage(document)],
                    outputLanguage: sourceLanguage(document),
                    sharedContext: 'A blog post by a software engineer.',
                    monitor: watchDownload(text => {
                        status.textContent = text;
                    }),
                });
                try {
                    const text = articleText(blocks);
                    const quota = summarizer.inputQuota;
                    if (
                        typeof quota === 'number' &&
                        typeof summarizer.measureInputUsage === 'function' &&
                        (await summarizer.measureInputUsage(text)) > quota
                    ) {
                        status.textContent =
                            'This post is too long for the model on this device, so it is not summarised.';
                        return;
                    }
                    const points = bulletLines(await summarizer.summarize(text));
                    status.textContent = 'Key points, made on this device. The post is the source.';
                    const list = element('ul', 'post-tools__points');
                    for (const point of points) {
                        list.append(element('li', '', point));
                    }
                    output.append(list);
                } finally {
                    summarizer.destroy?.();
                }
            })
        );
        controls.push(keyPoints);
        actions.append(keyPoints);
    }

    if (hasTranslator) {
        const select = element('select', 'post-tools__select');
        select.setAttribute('aria-label', 'Language to read the post in');
        for (const { code, name } of TARGET_LANGUAGES) {
            const option = element('option', '', name);
            option.value = code;
            select.append(option);
        }
        const translate = button('Read in this language', () =>
            run(async () => {
                const pair = {
                    sourceLanguage: sourceLanguage(document),
                    targetLanguage: select.value,
                };
                const availability = describeAvailability(
                    await globalThis.Translator.availability(pair)
                );
                if (!availability.usable) {
                    status.textContent = 'This browser cannot translate to that language here.';
                    return;
                }
                status.textContent = availability.download
                    ? 'Getting the model ready on this device…'
                    : 'Translating…';
                const translator = await globalThis.Translator.create({
                    ...pair,
                    monitor: watchDownload(text => {
                        status.textContent = text;
                    }),
                });
                try {
                    const lang = select.value;
                    for (const [index, block] of blocks.entries()) {
                        status.textContent = `Translating… ${index + 1} of ${blocks.length}`;
                        const translated = await translator.translate(block.text);
                        const paragraph = element('p', 'post-tools__line');
                        paragraph.lang = lang;
                        paragraph.append(block.tag === 'li' ? `• ${translated}` : translated);
                        if (/^h\d$/.test(block.tag)) {
                            paragraph.classList.add('post-tools__line--heading');
                        }
                        output.append(paragraph);
                    }
                    status.textContent =
                        'Translated on this device, paragraph by paragraph, without the code. The post is the source.';
                } finally {
                    translator.destroy?.();
                }
            })
        );
        controls.push(select, translate);
        actions.append(select, translate);
    }

    const close = button('Clear', () => {
        if (!busy) {
            clear();
        }
    });
    actions.append(close);

    panel.append(title, note, actions, status, output);
    head.after(panel);
}
