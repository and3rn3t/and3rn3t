# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: interactions.spec.js >> Esc closes the keyboard help panel
- Location: tests/e2e/interactions.spec.js:47:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#keyboard-help')
Expected: visible
Received: hidden
Timeout:  2000ms

Call log:
  - Expect "toBeVisible" with timeout 2000ms
  - waiting for locator('#keyboard-help')
    20 × locator resolved to <div role="dialog" aria-modal="true" id="keyboard-help" aria-hidden="true" class="keyboard-help" aria-label="Keyboard shortcuts">…</div>
       - unexpected value "hidden"

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
  2  |  * Theme toggle + keyboard interactions e2e tests (5.3)
  3  |  *
  4  |  * Covers: dark/light theme switch, `?` keyboard help panel, `g h` navigation.
  5  |  */
  6  | import { test, expect } from '@playwright/test';
  7  | 
  8  | test.beforeEach(async ({ page }) => {
  9  |     await page.goto('/');
  10 | });
  11 | 
  12 | // ── Theme ─────────────────────────────────────────────────────────────────────
  13 | 
  14 | test('theme toggle button is present and interactive', async ({ page }) => {
  15 |     const toggle = page.locator('#theme-toggle, [aria-label*="theme" i]').first();
  16 |     await expect(toggle).toBeVisible();
  17 | });
  18 | 
  19 | test('body gets dark-theme class when dark mode is applied', async ({ page }) => {
  20 |     // Force dark via localStorage so we control the state.
  21 |     await page.evaluate(() => {
  22 |         localStorage.setItem('theme', 'dark');
  23 |         localStorage.removeItem('followSystemTheme');
  24 |     });
  25 |     await page.reload();
  26 |     await expect(page.locator('body')).toHaveClass(/dark-theme/);
  27 | });
  28 | 
  29 | test('body does not have dark-theme class after switching to light', async ({ page }) => {
  30 |     await page.evaluate(() => {
  31 |         localStorage.setItem('theme', 'light');
  32 |         localStorage.removeItem('followSystemTheme');
  33 |     });
  34 |     await page.reload();
  35 |     await expect(page.locator('body')).not.toHaveClass(/dark-theme/);
  36 | });
  37 | 
  38 | // ── `?` keyboard help ─────────────────────────────────────────────────────────
  39 | 
  40 | test('pressing "?" opens the keyboard help panel', async ({ page }) => {
  41 |     await page.locator('body').click();
  42 |     await page.keyboard.press('?');
  43 |     const panel = page.locator('#keyboard-help');
  44 |     await expect(panel).toBeVisible({ timeout: 2000 });
  45 | });
  46 | 
  47 | test('Esc closes the keyboard help panel', async ({ page }) => {
  48 |     await page.locator('body').click();
  49 |     await page.keyboard.press('?');
  50 |     const panel = page.locator('#keyboard-help');
> 51 |     await expect(panel).toBeVisible({ timeout: 2000 });
     |                         ^ Error: expect(locator).toBeVisible() failed
  52 |     await page.keyboard.press('Escape');
  53 |     await expect(panel).not.toBeVisible();
  54 | });
  55 | 
  56 | // ── Navigation shortcuts ───────────────────────────────────────────────────────
  57 | 
  58 | test('"g" then "h" scrolls to the hero/home section', async ({ page }) => {
  59 |     // First scroll down so we're not already at top.
  60 |     await page.evaluate(() => window.scrollTo(0, 500));
  61 |     await page.locator('body').click();
  62 |     await page.keyboard.press('g');
  63 |     await page.keyboard.press('h');
  64 |     // Wait a tick for smooth scroll to begin.
  65 |     await page.waitForTimeout(400);
  66 |     const scrollY = await page.evaluate(() => window.scrollY);
  67 |     expect(scrollY).toBeLessThan(200);
  68 | });
  69 | 
```