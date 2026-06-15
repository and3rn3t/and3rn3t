# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: palette.spec.js >> "/" key opens the palette when not in a text field
- Location: tests/e2e/palette.spec.js:27:1

# Error details

```
Error: expect(locator).toHaveClass(expected) failed

Locator: locator('#global-search-modal')
Expected pattern: /visible/
Received string:  "global-search-modal"
Timeout: 5000ms

Call log:
  - Expect "toHaveClass" with timeout 5000ms
  - waiting for locator('#global-search-modal')
    14 × locator resolved to <div id="global-search-modal" class="global-search-modal">…</div>
       - unexpected value "global-search-modal"

```

```yaml
- link "Skip to main content":
  - /url: "#home"
- navigation "Main navigation":
  - link "@and3rn3t":
    - /url: "#home"
  - list:
    - listitem:
      - link "Home":
        - /url: "#home"
    - listitem:
      - link "About":
        - /url: "#about"
    - listitem:
      - link "Experience":
        - /url: "#experience"
    - listitem:
      - link "Projects":
        - /url: "#projects"
    - listitem:
      - link "Writing":
        - /url: "#writing"
    - listitem:
      - link "Contact":
        - /url: "#contact"
- heading "Hi, I'm Matthew Anderson" [level=1]
- heading "Software Engineer at Deere & Company" [level=2]
- paragraph: Software engineer at John Deere. Building things at the intersection of health tech, home automation, and data in my spare time.
- link "View My Work":
  - /url: "#projects"
- link "Get In Touch":
  - /url: "#contact"
- link " Resume":
  - /url: /resume.pdf
- link "":
  - /url: https://github.com/and3rn3t
- link "":
  - /url: https://linkedin.com/in/matthew-anderson
- link "":
  - /url: mailto:contact@matthewanderson.dev
- heading "About Me" [level=2]
- paragraph: Software engineer at Deere & Company with a genuine interest in technology, home automation, and gadgetry. I tinker with health tech, IoT, data engineering, and the occasional game project — driven by curiosity and the satisfaction of building things that are actually useful.
- text: 
- heading "Clean Code" [level=3]
- paragraph: Writing maintainable, scalable, and efficient code
- text: 
- heading "IoT & Automation" [level=3]
- paragraph: Passionate about smart home technologies and automation
- text: 
- heading "Innovation" [level=3]
- paragraph: Always exploring new technologies and creative solutions
- heading "Experience" [level=2]
- heading "Work" [level=3]
- text: 
- paragraph: Loading experience...
- heading "Education" [level=3]
- text: 
- paragraph: Loading education...
- paragraph: Want the full picture?
- link "Download Resume":
  - /url: /resume.pdf
- heading "Featured Projects" [level=2]
- paragraph: A curated selection of projects spanning health tech, home automation, data engineering, and more.
- text: 
- paragraph: Loading projects...
- link "View All Projects on GitHub ":
  - /url: https://github.com/and3rn3t
- heading "Skills & Technologies" [level=2]
- heading "Frontend" [level=3]
- text: HTML5 CSS3 JavaScript React Responsive Design
- heading "Backend" [level=3]
- text: Python Node.js PostgreSQL REST APIs Database Design
- heading "Tools & Technologies" [level=3]
- text: Git Docker Linux IoT Home Automation
- heading "Writing" [level=2]
- paragraph: Technical posts on the projects I build — health tech, IoT, data, and whatever else captures my attention.
- heading "GitHub Statistics" [level=2]
- text: 
- paragraph: Loading stats...
- heading "Contribution Activity" [level=3]
- text: 
- paragraph: Loading contributions...
- heading "Most Used Languages" [level=3]
- text: 
- paragraph: Loading language stats...
- heading "Recent Activity" [level=3]
- heading "Get In Touch" [level=2]
- paragraph: Open to interesting problems — whether that's a new role, a side project collaboration, or just a conversation about health tech, home automation, or data engineering.
- text: Name *
- textbox "Name *":
  - /placeholder: Your full name
- alert
- text: Email *
- textbox "Email *":
  - /placeholder: your.email@example.com
- alert
- text: Subject *
- textbox "Subject *":
  - /placeholder: What would you like to discuss?
- alert
- text: Message *
- textbox "Message *":
  - /placeholder: Tell me about your project, idea, or how we can work together...
- alert
- button "Send Message "
- status
- link " contact@matthewanderson.dev":
  - /url: mailto:contact@matthewanderson.dev
- link " @and3rn3t":
  - /url: https://github.com/and3rn3t
- link " LinkedIn":
  - /url: https://linkedin.com/in/matthew-anderson
- heading "Guestbook" [level=2]
- paragraph: Leave a note. Say hello. Tell me what you're building.
- text: Name
- textbox "Name":
  - /placeholder: Your name
- text: Message
- textbox "Message":
  - /placeholder: What's on your mind?
- button "Sign guestbook"
- status
- text: 
- paragraph: Loading entries...
- contentinfo:
  - paragraph: © 2026 Matthew Anderson. Built with vanilla JS, Vite, and GitHub Actions.
  - text: 0 views
- button "Open theme picker": 
- heading "Choose Theme" [level=3]
- button "Close theme picker": 
- menu:
  - menuitem "☀️ Light Default bright theme"
  - menuitem "🌙 Dark Easy on the eyes"
- checkbox "Follow system preference"
- text: Follow system preference
```

# Test source

```ts
  1  | /**
  2  |  * Command palette e2e tests (5.3)
  3  |  *
  4  |  * Covers: Cmd/Ctrl-K opens, Esc closes, "/" opens, arrow navigation,
  5  |  * Enter runs, category filter tabs.
  6  |  */
  7  | import { test, expect } from '@playwright/test';
  8  | 
  9  | test.beforeEach(async ({ page }) => {
  10 |     await page.goto('/');
  11 |     // Wait for JS modules to init.
  12 |     await page.waitForFunction(() => typeof globalThis.appState !== 'undefined', { timeout: 5000 }).catch(() => {});
  13 | });
  14 | 
  15 | test('Ctrl+K opens the command palette', async ({ page }) => {
  16 |     await page.keyboard.press('Control+k');
  17 |     await expect(page.locator('#global-search-modal')).toHaveClass(/visible/);
  18 | });
  19 | 
  20 | test('Esc closes the command palette', async ({ page }) => {
  21 |     await page.keyboard.press('Control+k');
  22 |     await page.waitForSelector('#global-search-modal.visible');
  23 |     await page.keyboard.press('Escape');
  24 |     await expect(page.locator('#global-search-modal')).not.toHaveClass(/visible/);
  25 | });
  26 | 
  27 | test('"/" key opens the palette when not in a text field', async ({ page }) => {
  28 |     // Ensure focus is on the body (not an input).
  29 |     await page.locator('body').click();
  30 |     await page.keyboard.press('/');
> 31 |     await expect(page.locator('#global-search-modal')).toHaveClass(/visible/);
     |                                                        ^ Error: expect(locator).toHaveClass(expected) failed
  32 | });
  33 | 
  34 | test('palette closes when backdrop is clicked', async ({ page }) => {
  35 |     await page.keyboard.press('Control+k');
  36 |     await page.waitForSelector('#global-search-modal.visible');
  37 |     // Click outside the inner dialog (on the modal backdrop).
  38 |     const modal = page.locator('#global-search-modal');
  39 |     const box   = await modal.boundingBox();
  40 |     // Click top-left corner — outside the inner dialog.
  41 |     await page.mouse.click(box.x + 5, box.y + 5);
  42 |     await expect(modal).not.toHaveClass(/visible/);
  43 | });
  44 | 
  45 | test('typing filters results', async ({ page }) => {
  46 |     await page.keyboard.press('Control+k');
  47 |     await page.waitForSelector('#global-search-modal.visible');
  48 |     await page.fill('#global-search-input', 'theme');
  49 |     const items = page.locator('.palette-result-item');
  50 |     await expect(items).not.toHaveCount(0);
  51 |     const titles = await items.allTextContents();
  52 |     expect(titles.some(t => /theme/i.test(t))).toBe(true);
  53 | });
  54 | 
  55 | test('ArrowDown + Enter runs the highlighted action', async ({ page }) => {
  56 |     await page.keyboard.press('Control+k');
  57 |     await page.waitForSelector('#global-search-modal.visible');
  58 |     // Navigate to first result.
  59 |     await page.keyboard.press('ArrowDown');
  60 |     // Pressing Enter should execute the action without throwing.
  61 |     // (The palette may close or stay open depending on action type.)
  62 |     await page.keyboard.press('Enter');
  63 |     // Just assert the page is still alive.
  64 |     await expect(page.locator('body')).toBeVisible();
  65 | });
  66 | 
  67 | test('search returns no-matches message for gibberish', async ({ page }) => {
  68 |     await page.keyboard.press('Control+k');
  69 |     await page.waitForSelector('#global-search-modal.visible');
  70 |     await page.fill('#global-search-input', 'xqzwfbnm');
  71 |     const noResults = page.locator('.palette-no-results');
  72 |     await expect(noResults).toBeVisible();
  73 | });
  74 | 
```