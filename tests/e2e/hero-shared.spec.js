/**
 * The shared hero (`hero-shared` lab switch, modules/hero-share.js): off unless switched on, and
 * when on it rides the page's one presence socket. The Worker's half is tested in
 * tests/worker/presence.test.js; here the socket is answered by the test.
 */
import { test, expect } from './fixtures.js';

const PRESENCE = /\/presence$/;

// The hero only starts on a device that passes capabilities.js's low-end check, which a CI runner
// does not, and the e2e config forces reduced motion
test.use({ reducedMotion: 'no-preference' });
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    });
});

/** Answer /presence, and keep what the page sent and which sockets it opened. */
async function room(page, first = { count: 2, sharing: 2 }) {
    const seen = { opened: 0, received: [], sockets: [] };
    await page.routeWebSocket(PRESENCE, ws => {
        seen.opened++;
        seen.sockets.push(ws);
        ws.onMessage(message => {
            seen.received.push(String(message));
            // The real object answers an opt-in with the room's state, which is how a page that
            // joins late learns how many are sharing (worker/presence.js broadcasts on "share")
            if (String(message) === 'share') ws.send(JSON.stringify(first));
        });
        ws.send(JSON.stringify(first));
    });
    return seen;
}

const heroReady = page =>
    page.waitForFunction(() => globalThis.appState?.managers?.heroCanvas, null, { timeout: 15000 });

/** Record what the hero is nudged with. */
const recordNudges = page =>
    page.evaluate(() => {
        const hero = globalThis.appState.managers.heroCanvas;
        const real = hero.nudge.bind(hero);
        globalThis.__nudges = [];
        hero.nudge = (...args) => {
            globalThis.__nudges.push(args);
            real(...args);
        };
    });

const overHero = async (page, fx = 0.5, fy = 0.5) => {
    const box = await page.locator('#hero-canvas').boundingBox();
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
};

test.describe('off by default', () => {
    test('a plain visit never loads the module and never opts in', async ({ page }) => {
        const seen = await room(page);
        const requested = [];
        page.on('request', request => requested.push(new URL(request.url()).pathname));
        await page.goto('/');
        await heroReady(page);
        await page.waitForTimeout(2500); // past the idle callbacks
        await overHero(page);
        expect(requested).not.toContain('/modules/hero-share.js');
        expect(seen.received).toEqual([]);
    });
});

test.describe('with ?lab=hero-shared', () => {
    test('opts in over the one presence socket, which "N here now" still counts once', async ({
        page,
    }) => {
        const seen = await room(page);
        await page.goto('/?lab=hero-shared');
        await heroReady(page);
        await expect.poll(() => seen.received).toContain('share');
        expect(seen.opened).toBe(1);
        await expect(page.locator('[data-presence]')).toHaveText('· 2 here now');
    });

    test('sends a coarse position when the pointer moves over the hero and two have opted in', async ({
        page,
    }) => {
        const seen = await room(page);
        await page.goto('/?lab=hero-shared');
        await heroReady(page);
        await expect.poll(() => seen.received).toContain('share');
        await overHero(page, 0.5, 0.5);
        await expect.poll(() => seen.received.filter(m => m.startsWith('g '))).not.toEqual([]);
        for (const message of seen.received.filter(m => m !== 'share' && m !== 'ping')) {
            expect(message).toMatch(/^g \d{1,3} \d{1,3}$/);
        }
    });

    test('sends nothing while you are the only one who opted in', async ({ page }) => {
        const seen = await room(page, { count: 3, sharing: 1 });
        await page.goto('/?lab=hero-shared');
        await heroReady(page);
        await expect.poll(() => seen.received).toContain('share');
        await overHero(page, 0.3, 0.3);
        await overHero(page, 0.7, 0.6);
        await page.waitForTimeout(600);
        expect(seen.received.filter(m => m.startsWith('g '))).toEqual([]);
    });

    test("pulls the hero toward another visitor's gust", async ({ page }) => {
        const seen = await room(page);
        await page.goto('/?lab=hero-shared');
        await heroReady(page);
        await expect.poll(() => seen.sockets.length).toBe(1);
        await recordNudges(page);
        seen.sockets[0].send(JSON.stringify({ g: [255, 0] }));
        await expect.poll(() => page.evaluate(() => globalThis.__nudges)).toEqual([[1, -1, 0.7]]);
    });

    test('a refusal from a full room stops it taking part', async ({ page }) => {
        const seen = await room(page);
        await page.goto('/?lab=hero-shared');
        await heroReady(page);
        await expect.poll(() => seen.sockets.length).toBe(1);
        await recordNudges(page);
        seen.sockets[0].send(JSON.stringify({ share: false }));
        await page.waitForTimeout(100);
        seen.sockets[0].send(JSON.stringify({ g: [10, 10] }));
        await overHero(page);
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => globalThis.__nudges)).toEqual([]);
        expect(seen.received.filter(m => m.startsWith('g '))).toEqual([]);
    });
});
