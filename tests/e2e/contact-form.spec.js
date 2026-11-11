/**
 * The contact form (issue #231): an inline submit with Formspree stubbed, inline validation,
 * the busy state, failures, the no-JS fallback; plus the copy button and the footer.
 */
import { test, expect } from './fixtures.js';
import { WORKER_BASE } from '../../modules/config.js';

const FORMSPREE = /formspree\.io/;

const fill = async (page, overrides = {}) => {
    const values = {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'Hello there',
        message: 'A message that is long enough.',
        ...overrides,
    };
    for (const [field, value] of Object.entries(values)) {
        await page.locator(`#contact-form [name="${field}"]`).fill(value);
    }
};

const ok = route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });

/** Record every Formspree request and answer with `respond`. */
const stubFormspree = async (page, respond = ok) => {
    const requests = [];
    await page.route(FORMSPREE, route => {
        requests.push(route.request());
        return respond(route);
    });
    return requests;
};

test.describe('with JavaScript', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // The submit handler is attached by an optional module; wait for it, or the form would
        // fall back to a native POST.
        await page.waitForFunction(() => Boolean(globalThis.appState?.managers?.contactForm));
    });

    test.describe('sending', () => {
        test('sends the message inline and stays on the page', async ({ page }) => {
            const requests = await stubFormspree(page);
            await fill(page);
            await page.locator('#submit-button').click();

            const status = page.locator('#form-status');
            await expect(status).toContainText('Thanks, your message was sent');
            await expect(status).toContainText('ada@example.com');
            await expect(status).toHaveAttribute('data-state', 'success');

            expect(requests).toHaveLength(1);
            const [request] = requests;
            expect(request.method()).toBe('POST');
            expect(request.headers().accept).toContain('application/json');
            const body = request.postData();
            for (const value of ['Ada Lovelace', 'ada@example.com', 'Hello there', 'long enough']) {
                expect(body).toContain(value);
            }

            // Still on the portfolio, with the form emptied and no field marked
            expect(new URL(page.url()).origin).toBe(new URL('/', page.url()).origin);
            await expect(page.locator('#contact-form [name="message"]')).toHaveValue('');
            await expect(page.locator('#contact-form [aria-invalid="true"]')).toHaveCount(0);
        });

        test('shows it is busy, and ignores a second submit while one is in flight', async ({
            page,
        }) => {
            const requests = await stubFormspree(page, async route => {
                await new Promise(resolve => setTimeout(resolve, 700));
                return ok(route);
            });
            await fill(page);
            const button = page.locator('#submit-button');

            await button.click();
            await expect(button).toHaveAttribute('aria-busy', 'true');
            await expect(button).toContainText('Sending');
            await expect(button.locator('.spinner')).toBeVisible();

            // Another click and Enter in a field, while the first is still going
            // force: Playwright treats aria-disabled as "not enabled" and would wait for the first
            // request to finish; a person's click lands straight away
            await button.click({ force: true });
            await page.locator('#contact-form [name="subject"]').press('Enter');

            await expect(page.locator('#form-status')).toContainText('Thanks');
            expect(requests).toHaveLength(1);
            await expect(button).toHaveAttribute('aria-busy', 'false');
            await expect(button).toContainText('Send message');
        });

        test('keeps keyboard focus on the button while it is busy', async ({ page }) => {
            // aria-disabled rather than disabled: a disabled button would drop focus and strand
            // a keyboard user
            await stubFormspree(page, async route => {
                await new Promise(resolve => setTimeout(resolve, 400));
                return ok(route);
            });
            await fill(page);
            await page.locator('#submit-button').focus();
            await page.keyboard.press('Enter');
            await expect(page.locator('#submit-button')).toHaveAttribute('aria-busy', 'true');
            await expect(page.locator('#submit-button')).toBeFocused();
            await expect(page.locator('#form-status')).toContainText('Thanks');
        });

        test('includes the honeypot in what it sends, and the honeypot is out of sight', async ({
            page,
        }) => {
            const requests = await stubFormspree(page);
            await fill(page);
            await page.locator('#submit-button').click();
            await expect(page.locator('#form-status')).toContainText('Thanks');
            expect(requests[0].postData()).toContain('_gotcha');

            const trap = page.locator('.trap');
            await expect(trap).toHaveAttribute('aria-hidden', 'true');
            const box = await trap.boundingBox();
            expect(box.width).toBeLessThanOrEqual(1);
            await expect(page.locator('#website-url')).toHaveAttribute('tabindex', '-1');
        });
    });

    test.describe('validation', () => {
        test('an empty submit marks every field, focuses the first, and sends nothing', async ({
            page,
        }) => {
            const requests = await stubFormspree(page);
            await page.locator('#submit-button').click();

            for (const [field, message] of [
                ['name', 'Please enter your name.'],
                ['email', 'Please enter your email address.'],
                ['subject', 'Please add a subject.'],
                ['message', 'Please write a message.'],
            ]) {
                await expect(page.locator(`#${field}-error`)).toHaveText(message);
                await expect(page.locator(`#contact-form [name="${field}"]`)).toHaveAttribute(
                    'aria-invalid',
                    'true'
                );
            }
            await expect(page.locator('#contact-form [name="name"]')).toBeFocused();
            await expect(page.locator('#form-status')).toContainText('Please fix the fields');
            expect(requests).toHaveLength(0);
        });

        test('says what is wrong with an email address', async ({ page }) => {
            await fill(page, { email: 'not-an-email' });
            await page.locator('#submit-button').click();
            await expect(page.locator('#email-error')).toHaveText(
                "That doesn't look like an email address."
            );
            await expect(page.locator('#name-error')).toBeHidden();
            await expect(page.locator('#contact-form [name="email"]')).toBeFocused();
            await expect(page.locator('#form-status')).toContainText('Please fix the field below');
        });

        test('says what is wrong with a message that is too short', async ({ page }) => {
            await fill(page, { message: 'Hi' });
            await page.locator('#submit-button').click();
            await expect(page.locator('#message-error')).toHaveText(
                'Your message should be at least 10 characters.'
            );
        });

        test('an error clears as soon as the field is fixed', async ({ page }) => {
            await page.locator('#submit-button').click();
            await expect(page.locator('#name-error')).toBeVisible();
            await page.locator('#contact-form [name="name"]').fill('Ada');
            await expect(page.locator('#name-error')).toBeHidden();
            await expect(page.locator('#contact-form [name="name"]')).toHaveAttribute(
                'aria-invalid',
                'false'
            );
            // The others are untouched
            await expect(page.locator('#email-error')).toBeVisible();
        });

        test('each error is tied to its field for screen readers', async ({ page }) => {
            await page.locator('#submit-button').click();
            for (const field of ['name', 'email', 'subject', 'message']) {
                await expect(page.locator(`#contact-form [name="${field}"]`)).toHaveAttribute(
                    'aria-describedby',
                    `${field}-error`
                );
            }
        });
    });

    test.describe('failures', () => {
        test('a field Formspree rejects is marked, and the visitor is taken to it', async ({
            page,
        }) => {
            await stubFormspree(page, route =>
                route.fulfill({
                    status: 422,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        errors: [
                            { field: 'email', code: 'TYPE_EMAIL', message: 'should be an email' },
                        ],
                    }),
                })
            );
            await fill(page);
            await page.locator('#submit-button').click();
            await expect(page.locator('#email-error')).toBeVisible();
            await expect(page.locator('#contact-form [name="email"]')).toBeFocused();
            await expect(page.locator('#form-status')).toHaveAttribute('data-state', 'error');
        });

        for (const [label, respond] of [
            ['a server error', route => route.fulfill({ status: 500, body: 'oops' })],
            ['no network', route => route.abort()],
        ]) {
            test(`${label}: says so, offers the email address, and keeps what was typed`, async ({
                page,
            }) => {
                await stubFormspree(page, respond);
                await fill(page);
                await page.locator('#submit-button').click();

                const status = page.locator('#form-status');
                await expect(status).toContainText("couldn't be sent");
                await expect(status).toHaveAttribute('data-state', 'error');
                await expect(status.locator('a')).toHaveAttribute(
                    'href',
                    'mailto:and3rn3t@icloud.com'
                );

                // Nothing is lost, and it can be tried again
                await expect(page.locator('#contact-form [name="message"]')).toHaveValue(
                    'A message that is long enough.'
                );
                await expect(page.locator('#submit-button')).toHaveAttribute('aria-busy', 'false');
            });
        }
    });

    test.describe('the copy button', () => {
        test('copies the address and says so', async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
            const copy = page.locator('[data-copy]');
            await copy.click();
            await expect(copy).toHaveText('Copied');
            expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
                'and3rn3t@icloud.com'
            );
            // ...and goes back to saying Copy
            await expect(copy).toHaveText('Copy', { timeout: 5000 });
        });

        test('goes back to saying Copy after a second click while it still says Copied', async ({
            page,
            context,
        }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
            const copy = page.locator('[data-copy]');
            await copy.click();
            await expect(copy).toHaveText('Copied');
            // The second click lands inside the first one's two-second window
            await copy.click();
            await expect(copy).toHaveText('Copied');
            await expect(copy).toHaveText('Copy', { timeout: 5000 });
            // ...and stays that way: the first click's timer must not fire late and change it
            await page.waitForTimeout(2500);
            await expect(copy).toHaveText('Copy');
        });

        test('selects the address when the clipboard is refused', async ({ page }) => {
            await page.evaluate(() => {
                navigator.clipboard.writeText = () => Promise.reject(new Error('refused'));
            });
            await page.locator('[data-copy]').click();
            expect(await page.evaluate(() => String(globalThis.getSelection()))).toBe(
                'and3rn3t@icloud.com'
            );
        });
    });

    test.describe('the guestbook, in its new markup', () => {
        test('both status messages are live regions, so changes are announced', async ({
            page,
        }) => {
            for (const id of ['form-status', 'guestbook-status']) {
                const status = page.locator(`#${id}`);
                await expect(status, id).toHaveAttribute('role', 'status');
                // role=status is aria-live=polite and atomic by default; say it where it is read
                expect(
                    await status.evaluate(el => el.getAttribute('aria-live') ?? 'polite'),
                    id
                ).toBe('polite');
            }
        });

        test('renders entries as text, never as markup', async ({ page }) => {
            await page.route(`${WORKER_BASE}/guestbook`, route =>
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    headers: { 'access-control-allow-origin': '*' },
                    body: JSON.stringify([
                        {
                            name: '<b>Eve</b>',
                            message: '<img src=x onerror=alert(1)>',
                            date: '2026-01-02T03:04:05Z',
                        },
                    ]),
                })
            );
            await page.locator('#contact-tab-guestbook').click();
            const entry = page.locator('#guestbook-entries .guestbook__entry');
            await expect(entry).toHaveCount(1);
            await expect(entry.locator('.guestbook__name')).toHaveText('<b>Eve</b>');
            await expect(entry.locator('img')).toHaveCount(0);
        });

        test('says there are no entries yet', async ({ page }) => {
            await page.locator('#contact-tab-guestbook').click();
            await expect(page.locator('#guestbook-entries .guestbook__empty')).toContainText(
                'No entries yet'
            );
        });
    });

    test.describe('the footer', () => {
        test('shows the view count and the current year', async ({ page }) => {
            const footer = page.locator('footer.site-footer');
            await expect(footer.locator('[data-view-widget]')).toBeVisible();
            await expect(footer.locator('[data-view-count]')).toHaveText('1,234');
            await expect(footer.locator('#current-year')).toHaveText(
                String(new Date().getFullYear())
            );
        });

        test('links to the source and the feed', async ({ page }) => {
            const footer = page.locator('footer.site-footer');
            await expect(footer.getByRole('link', { name: 'Source' })).toHaveAttribute(
                'href',
                'https://github.com/and3rn3t/and3rn3t'
            );
            await expect(footer.getByRole('link', { name: 'RSS' })).toHaveAttribute(
                'href',
                '/feed.xml'
            );
        });

        test('"Back to top" returns to the top; there is no floating button', async ({ page }) => {
            await expect(page.locator('.back-to-top')).toHaveCount(0);
            await page.locator('footer').scrollIntoViewIfNeeded();
            expect(await page.evaluate(() => globalThis.scrollY)).toBeGreaterThan(1000);
            await page.getByRole('link', { name: 'Back to top' }).click();
            await expect.poll(() => page.evaluate(() => globalThis.scrollY)).toBeLessThan(100);
        });
    });
});

test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the form is a plain POST that redirects back, and the notice shows when it lands', async ({
        page,
        baseURL,
    }) => {
        await page.goto('/');
        await expect(page.locator('#contact-form')).toHaveAttribute('method', 'POST');
        await expect(page.locator('#contact-form [name="_next"]')).toHaveAttribute(
            'value',
            'https://andernet.dev/#message-sent'
        );
        await expect(page.locator('[data-copy]')).toBeHidden();
        await expect(page.locator('#message-sent')).toBeHidden();

        const requests = [];
        await page.route(FORMSPREE, route => {
            requests.push(route.request());
            // What Formspree does: send the browser on to _next (here, our own page)
            return route.fulfill({
                status: 303,
                headers: { location: `${baseURL}/#message-sent` },
            });
        });
        await fill(page);
        await page.locator('#submit-button').click();
        await page.waitForURL('**/#message-sent');

        expect(requests).toHaveLength(1);
        expect(requests[0].postData()).toContain('_next');
        // :target shows the confirmation, with no script
        await expect(page.locator('#message-sent')).toBeVisible();
    });

    test('native validation still protects the form', async ({ page }) => {
        await page.goto('/');
        const requests = [];
        await page.route(FORMSPREE, route => {
            requests.push(route);
            return route.abort();
        });
        await page.locator('#submit-button').click();
        expect(requests).toHaveLength(0);
        expect(
            await page
                .locator('#contact-form [name="name"]')
                .evaluate(el => el.validity.valueMissing)
        ).toBe(true);
    });
});
