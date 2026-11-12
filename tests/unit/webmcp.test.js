/**
 * WebMCP tools (modules/webmcp.js): what an AI agent in the visitor's browser can do on the
 * page. The tools take their dependencies as arguments, so nothing here touches the network or
 * the real theme.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    FIELD_LIMITS,
    createTools,
    findModelContext,
    registerWebMcp,
    revealMessageTab,
    searchItems,
} from '../../modules/webmcp.js';

// jsdom replaces URL, so build the path with join rather than fileURLToPath(new URL(...))
const indexHtml = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');

const PROJECTS = {
    projects: [
        {
            name: 'health',
            displayName: 'Health Analytics Platform',
            description: 'Gait analysis with iPhone LiDAR.',
            longDescription: 'The long write-up.',
            category: 'Health & Wellness',
            technologies: ['TypeScript', 'HealthKit'],
            github_repo: 'and3rn3t/health',
        },
        {
            name: 'minecraft',
            displayName: 'Self-Hosted Minecraft Server',
            description: 'A server on a Raspberry Pi.',
            category: 'Tools & Automation',
            technologies: ['Python', 'Docker'],
            github_repo: 'and3rn3t/minecraft',
        },
    ],
};

function setPage() {
    document.body.innerHTML = `
        <section id="projects"><h2 class="section-title">Selected work</h2></section>
        <section id="contact"><h2 class="section-title">Contact</h2>
            <form id="contact-form">
                <input name="name" /><input name="email" /><input name="subject" />
                <textarea name="message"></textarea>
                <input name="_gotcha" />
            </form></section>
        <ul id="blog-posts">
            <li data-slug="how-this-site-works"><a href="/posts/how-this-site-works/">How This Site Works</a><time>Jul 2026</time></li>
        </ul>`;
}

let navigate;
let manager;
let load;
const tools = () => createTools({ doc: document, load, navigate, theme: () => manager });
const tool = name => tools().find(candidate => candidate.name === name);

beforeEach(() => {
    setPage();
    navigate = vi.fn();
    manager = {
        dark: false,
        isDark() {
            return this.dark;
        },
        toggle: vi.fn(function toggle() {
            this.dark = !this.dark;
        }),
    };
    load = vi.fn(async () => PROJECTS);
});

describe('findModelContext', () => {
    it('prefers document.modelContext, falls back to navigator.modelContext, else null', () => {
        const a = { id: 'document' };
        const b = { id: 'navigator' };
        expect(findModelContext({ modelContext: a }, { modelContext: b })).toBe(a);
        expect(findModelContext({}, { modelContext: b })).toBe(b);
        expect(findModelContext({}, {})).toBeNull();
        expect(findModelContext(undefined, undefined)).toBeNull();
    });
});

describe('searchItems', () => {
    const items = [
        {
            type: 'project',
            title: 'Health Analytics',
            url: '/p/health/',
            summary: 'Gait with LiDAR',
        },
        { type: 'post', title: 'On gait analysis', url: '/posts/gait/', summary: 'Jul 2026' },
        {
            type: 'project',
            title: 'Minecraft',
            url: '/p/mc/',
            summary: 'A server',
            keywords: 'python docker',
        },
    ];

    it('needs every word to match, in the title or the rest', () => {
        expect(searchItems('gait lidar', items).map(r => r.title)).toEqual(['Health Analytics']);
        expect(searchItems('gait python', items)).toEqual([]);
    });

    it('ranks a title match above a summary match', () => {
        expect(searchItems('gait', items).map(r => r.title)).toEqual([
            'On gait analysis',
            'Health Analytics',
        ]);
    });

    it('is case-insensitive, searches keywords, and returns only the public fields', () => {
        expect(searchItems('DOCKER', items)).toEqual([
            { type: 'project', title: 'Minecraft', url: '/p/mc/', summary: 'A server' },
        ]);
    });

    it('returns nothing for an empty or blank query, and honours the limit', () => {
        expect(searchItems('', items)).toEqual([]);
        expect(searchItems('   ', items)).toEqual([]);
        expect(searchItems('a', items, 1)).toHaveLength(1);
    });
});

describe('the tools', () => {
    it('are the five the page offers, each described and with an object schema', () => {
        const all = tools();
        expect(all.map(t => t.name)).toEqual([
            'search_site',
            'list_projects',
            'open_project',
            'set_theme',
            'draft_contact_message',
        ]);
        for (const t of all) {
            expect(t.description.length).toBeGreaterThan(30);
            expect(t.inputSchema.type).toBe('object');
            expect(typeof t.execute).toBe('function');
            // The WebMCP name rule: 1-128 of letters, digits, _ - .
            expect(t.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
        }
    });

    it('mark the lookups read-only, and none as consequential: nothing here sends anything', () => {
        for (const name of ['search_site', 'list_projects']) {
            expect(tool(name).annotations).toEqual({ readOnlyHint: true });
        }
        for (const t of tools()) expect(t.annotations?.consequentialHint).toBeUndefined();
    });
});

describe('search_site', () => {
    it('searches the projects, the posts and the sections of the page', async () => {
        const { results } = await tool('search_site').execute({ query: 'work' });
        expect(results.map(r => `${r.type}:${r.title}`)).toContain('section:Selected work');
        const gait = await tool('search_site').execute({ query: 'lidar' });
        expect(gait.results[0]).toMatchObject({
            type: 'project',
            title: 'Health Analytics Platform',
            url: '/projects/health/',
        });
        const post = await tool('search_site').execute({ query: 'how this site' });
        expect(post.results[0]).toMatchObject({ type: 'post', url: '/posts/how-this-site-works/' });
    });

    it.each([[{}], [{ query: '' }], [{ query: '   ' }], [{ query: 5 }]])(
        'refuses %j',
        async input => {
            await expect(tool('search_site').execute(input)).rejects.toThrow('Give a query.');
        }
    );

    it('says so when the project list cannot be loaded, instead of failing obscurely', async () => {
        load.mockResolvedValue(null);
        await expect(tool('search_site').execute({ query: 'x' })).rejects.toThrow(
            /could not be loaded/
        );
    });
});

describe('list_projects', () => {
    it('lists the projects with their page or repository address', async () => {
        const list = await tool('list_projects').execute({});
        expect(list.map(p => p.name)).toEqual(['health', 'minecraft']);
        expect(list[0].url).toBe('/projects/health/');
        expect(list[1].url).toBe('https://github.com/and3rn3t/minecraft');
    });

    it('filters by category and by technology, ignoring case', async () => {
        const byCategory = await tool('list_projects').execute({ category: 'health & wellness' });
        expect(byCategory.map(p => p.name)).toEqual(['health']);
        const byTech = await tool('list_projects').execute({ technology: 'docker' });
        expect(byTech.map(p => p.name)).toEqual(['minecraft']);
    });

    it('can be called with no arguments at all', async () => {
        expect(await tool('list_projects').execute()).toHaveLength(2);
    });
});

describe('open_project', () => {
    it.each(['health', 'HEALTH', 'Health Analytics Platform'])(
        'opens the page for %s',
        async name => {
            const result = await tool('open_project').execute({ name });
            expect(navigate).toHaveBeenCalledWith('/projects/health/');
            expect(result).toEqual({
                opened: 'Health Analytics Platform',
                url: '/projects/health/',
            });
        }
    );

    it('names the projects when the name is wrong, and goes nowhere', async () => {
        await expect(tool('open_project').execute({ name: 'nope' })).rejects.toThrow(
            'No project called "nope". Projects: health, minecraft.'
        );
        expect(navigate).not.toHaveBeenCalled();
    });
});

describe('set_theme', () => {
    it('switches only when the theme is different', async () => {
        await tool('set_theme').execute({ theme: 'dark' });
        expect(manager.toggle).toHaveBeenCalledTimes(1);
        await tool('set_theme').execute({ theme: 'dark' });
        expect(manager.toggle).toHaveBeenCalledTimes(1);
        expect(await tool('set_theme').execute({ theme: 'light' })).toEqual({ theme: 'light' });
        expect(manager.toggle).toHaveBeenCalledTimes(2);
    });

    it.each([['blue'], [undefined], ['']])('refuses the theme %j', async theme => {
        await expect(tool('set_theme').execute({ theme })).rejects.toThrow(
            'must be "light" or "dark"'
        );
    });

    it('says so when the theme switch is not up yet', async () => {
        manager = undefined;
        await expect(tool('set_theme').execute({ theme: 'dark' })).rejects.toThrow(/not ready/);
    });
});

describe('draft_contact_message', () => {
    const good = {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'Hello there',
        message: 'I would like to talk about a project.',
    };
    const field = name => document.querySelector(`[name="${name}"]`);

    it('fills the real form fields, as typing would, and sends nothing', async () => {
        const submit = vi.fn();
        const inputs = [];
        document.getElementById('contact-form').addEventListener('submit', submit);
        document
            .getElementById('contact-form')
            .addEventListener('input', event => inputs.push(event.target.name));
        const result = await tool('draft_contact_message').execute(good);
        expect(field('name').value).toBe('Ada Lovelace');
        expect(field('message').value).toBe(good.message);
        expect(inputs.sort()).toEqual(['email', 'message', 'name', 'subject']); // the form's own validation hears each
        expect(submit).not.toHaveBeenCalled();
        expect(result).toMatchObject({ drafted: true, sent: false });
        expect(result.next).toMatch(/press "Send message"/);
    });

    // The form carries a hidden field that bots fill in. An agent must never reach it.
    it('never touches the honeypot field', async () => {
        await tool('draft_contact_message').execute({ ...good, _gotcha: 'spam', website: 'x' });
        expect(field('_gotcha').value).toBe('');
        expect(tool('draft_contact_message').inputSchema.properties).not.toHaveProperty('_gotcha');
    });

    it('trims what it is given', async () => {
        await tool('draft_contact_message').execute({ ...good, name: '  Ada Lovelace  ' });
        expect(field('name').value).toBe('Ada Lovelace');
    });

    it.each([
        [{ name: 'A' }, /name must be 2 to 100/],
        [{ subject: 'Hi' }, /subject must be 3 to 200/],
        [{ message: 'short' }, /message must be 10 to 5000/],
        [{ message: 'x'.repeat(5001) }, /message must be 10 to 5000 characters \(got 5001\)/],
        [{ email: 'not-an-email' }, /email must be an email address/],
        [{ email: '' }, /email must be 1 to 254/],
        [{ name: undefined }, /name must be/],
    ])('refuses %j and fills nothing', async (change, message) => {
        await expect(tool('draft_contact_message').execute({ ...good, ...change })).rejects.toThrow(
            message
        );
        expect(field('name').value).toBe('');
        expect(field('message').value).toBe('');
    });

    it('brings the message tab forward before scrolling to the form', async () => {
        const order = [];
        const form = document.getElementById('contact-form');
        form.scrollIntoView = () => order.push('scroll');
        const showMessageTab = () => order.push('tab');
        const drafting = createTools({
            doc: document,
            load,
            navigate,
            theme: () => manager,
            showMessageTab,
        }).find(candidate => candidate.name === 'draft_contact_message');
        await drafting.execute(good);
        expect(order).toEqual(['tab', 'scroll']);
    });

    it('says so on a page with no contact form', async () => {
        document.getElementById('contact-form').remove();
        await expect(tool('draft_contact_message').execute(good)).rejects.toThrow(
            /not on this page/
        );
    });

    // The tool refuses what the form would refuse: the limits must match index.html
    it("uses the limits of the page's own form", () => {
        const attribute = (id, name) => {
            const tag =
                indexHtml.match(
                    new RegExp(`<(?:input|textarea)[^>]*\\bid="${id}"[\\s\\S]*?>`)
                )?.[0] ?? '';
            return Number(tag.match(new RegExp(`${name}="(\\d+)"`))?.[1]) || undefined;
        };
        for (const [id, { min, max }] of Object.entries(FIELD_LIMITS)) {
            expect(attribute(id, 'maxlength'), `${id} maxlength`).toBe(max);
            if (min) expect(attribute(id, 'minlength'), `${id} minlength`).toBe(min);
        }
    });
});

describe('registerWebMcp', () => {
    const deps = () => ({ doc: document, load, navigate, theme: () => manager });

    it('registers every tool with an AbortSignal, and returns their names', async () => {
        const registerTool = vi.fn(async () => undefined);
        const names = await registerWebMcp({ registerTool }, deps(), new EventTarget());
        expect(names).toHaveLength(5);
        for (const [definition, options] of registerTool.mock.calls) {
            expect(definition.name).toBeTruthy();
            expect(options.signal).toBeInstanceOf(AbortSignal);
        }
    });

    it('takes the tools back when the page goes (pagehide aborts the signal)', async () => {
        const registerTool = vi.fn(async () => undefined);
        const lifetime = new EventTarget();
        await registerWebMcp({ registerTool }, deps(), lifetime);
        const { signal } = registerTool.mock.calls[0][1];
        expect(signal.aborted).toBe(false);
        lifetime.dispatchEvent(new Event('pagehide'));
        expect(signal.aborted).toBe(true);
    });

    // Back/forward cache: the same document comes back without main.js running again
    it('keeps the tools when the page only enters the back/forward cache', async () => {
        const registerTool = vi.fn(async () => undefined);
        const lifetime = new EventTarget();
        await registerWebMcp({ registerTool }, deps(), lifetime);
        const { signal } = registerTool.mock.calls[0][1];
        const cached = new Event('pagehide');
        cached.persisted = true;
        lifetime.dispatchEvent(cached);
        expect(signal.aborted).toBe(false);
        lifetime.dispatchEvent(new Event('pagehide')); // a later, real unload still takes them back
        expect(signal.aborted).toBe(true);
    });

    it('keeps going when one tool is refused (a name already taken, say)', async () => {
        const registerTool = vi.fn(async definition => {
            if (definition.name === 'open_project')
                throw new DOMException('taken', 'InvalidStateError');
        });
        const names = await registerWebMcp({ registerTool }, deps(), new EventTarget());
        expect(names).toEqual([
            'search_site',
            'list_projects',
            'set_theme',
            'draft_contact_message',
        ]);
    });
});

describe('revealMessageTab', () => {
    const tabs = () => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<button role="tab" id="contact-tab-message"></button>'
        );
        return { select: vi.fn() };
    };

    it('selects the message tab once the tabs are running', () => {
        const contactTabs = tabs();
        revealMessageTab({ doc: document, tabs: contactTabs });
        expect(contactTabs.select).toHaveBeenCalledWith(
            document.getElementById('contact-tab-message')
        );
    });

    it('drops a pending #guestbook link before the tabs start, so it cannot hide the draft later', () => {
        tabs();
        const replaceState = vi.fn();
        const win = {
            location: { hash: '#guestbook', pathname: '/', search: '?a=1' },
            history: { replaceState },
        };
        revealMessageTab({ doc: document, win });
        expect(replaceState).toHaveBeenCalledWith(null, '', '/?a=1');
    });

    it('leaves any other link alone', () => {
        tabs();
        const replaceState = vi.fn();
        const win = {
            location: { hash: '#projects', pathname: '/', search: '' },
            history: { replaceState },
        };
        revealMessageTab({ doc: document, win });
        expect(replaceState).not.toHaveBeenCalled();
    });
});
