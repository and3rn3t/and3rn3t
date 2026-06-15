# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: palette.spec.js >> Esc closes the command palette
- Location: tests/e2e/palette.spec.js:20:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#global-search-modal.visible') to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#home"
  - navigation "Main navigation" [ref=e4]:
    - generic [ref=e5]:
      - link "@and3rn3t" [ref=e6] [cursor=pointer]:
        - /url: "#home"
      - list [ref=e7]:
        - listitem [ref=e8]:
          - link "Home" [ref=e9] [cursor=pointer]:
            - /url: "#home"
        - listitem [ref=e10]:
          - link "About" [ref=e11] [cursor=pointer]:
            - /url: "#about"
        - listitem [ref=e12]:
          - link "Experience" [ref=e13] [cursor=pointer]:
            - /url: "#experience"
        - listitem [ref=e14]:
          - link "Projects" [ref=e15] [cursor=pointer]:
            - /url: "#projects"
        - listitem [ref=e16]:
          - link "Writing" [ref=e17] [cursor=pointer]:
            - /url: "#writing"
        - listitem [ref=e18]:
          - link "Contact" [ref=e19] [cursor=pointer]:
            - /url: "#contact"
  - generic [ref=e25]:
    - heading "Hi, I'm Matthew Anderson" [level=1] [ref=e26]
    - heading "Software Engineer at Deere & Company" [level=2] [ref=e27]: Software Engineer at Deere & Company
    - paragraph [ref=e29]: Software engineer at John Deere. Building things at the intersection of health tech, home automation, and data in my spare time.
    - generic [ref=e30]:
      - link "View My Work" [ref=e31] [cursor=pointer]:
        - /url: "#projects"
      - link "Get In Touch" [ref=e32] [cursor=pointer]:
        - /url: "#contact"
      - link " Resume" [ref=e33] [cursor=pointer]:
        - /url: /resume.pdf
        - generic [ref=e34]: 
        - text: Resume
    - generic [ref=e35]:
      - link "" [ref=e36] [cursor=pointer]:
        - /url: https://github.com/and3rn3t
        - generic [ref=e37]: 
      - link "" [ref=e38] [cursor=pointer]:
        - /url: https://linkedin.com/in/matthew-anderson
        - generic [ref=e39]: 
      - link "" [ref=e40] [cursor=pointer]:
        - /url: mailto:contact@matthewanderson.dev
        - generic [ref=e41]: 
  - generic [ref=e43]:
    - heading "About Me" [level=2] [ref=e44]
    - generic [ref=e46]:
      - paragraph [ref=e47]: Software engineer at Deere & Company with a genuine interest in technology, home automation, and gadgetry. I tinker with health tech, IoT, data engineering, and the occasional game project — driven by curiosity and the satisfaction of building things that are actually useful.
      - generic [ref=e48]:
        - generic [ref=e49]:
          - generic [ref=e50]: 
          - heading "Clean Code" [level=3] [ref=e51]
          - paragraph [ref=e52]: Writing maintainable, scalable, and efficient code
        - generic [ref=e53]:
          - generic [ref=e54]: 
          - heading "IoT & Automation" [level=3] [ref=e55]
          - paragraph [ref=e56]: Passionate about smart home technologies and automation
        - generic [ref=e57]:
          - generic [ref=e58]: 
          - heading "Innovation" [level=3] [ref=e59]
          - paragraph [ref=e60]: Always exploring new technologies and creative solutions
  - generic [ref=e62]:
    - heading "Experience" [level=2] [ref=e63]
    - generic [ref=e64]:
      - generic [ref=e65]:
        - heading "Work" [level=3] [ref=e66]:
          - generic [ref=e67]: 
          - text: Work
        - generic "Work history" [ref=e68]:
          - generic [ref=e69]:
            - generic [ref=e70]: 
            - paragraph [ref=e71]: Loading experience...
      - generic [ref=e72]:
        - heading "Education" [level=3] [ref=e73]:
          - generic [ref=e74]: 
          - text: Education
        - generic "Education history" [ref=e75]:
          - generic [ref=e76]:
            - generic [ref=e77]: 
            - paragraph [ref=e78]: Loading education...
        - generic [ref=e79]:
          - paragraph [ref=e80]: Want the full picture?
          - link "Download Resume" [ref=e81] [cursor=pointer]:
            - /url: /resume.pdf
            - generic [ref=e82]: 
            - text: Download Resume
  - generic [ref=e84]:
    - heading "Featured Projects" [level=2] [ref=e85]
    - generic [ref=e86]:
      - paragraph [ref=e87]: A curated selection of projects spanning health tech, home automation, data engineering, and more.
      - generic [ref=e89]:
        - generic [ref=e90]: 
        - paragraph [ref=e91]: Loading projects...
    - link "View All Projects on GitHub " [ref=e93] [cursor=pointer]:
      - /url: https://github.com/and3rn3t
      - text: View All Projects on GitHub
      - generic [ref=e94]: 
  - generic [ref=e96]:
    - heading "Skills & Technologies" [level=2] [ref=e97]
    - generic [ref=e98]:
      - generic [ref=e99]:
        - heading "Frontend" [level=3] [ref=e100]
        - generic [ref=e101]:
          - generic [ref=e102]: HTML5
          - generic [ref=e103]: CSS3
          - generic [ref=e104]: JavaScript
          - generic [ref=e105]: React
          - generic [ref=e106]: Responsive Design
      - generic [ref=e107]:
        - heading "Backend" [level=3] [ref=e108]
        - generic [ref=e109]:
          - generic [ref=e110]: Python
          - generic [ref=e111]: Node.js
          - generic [ref=e112]: PostgreSQL
          - generic [ref=e113]: REST APIs
          - generic [ref=e114]: Database Design
      - generic [ref=e115]:
        - heading "Tools & Technologies" [level=3] [ref=e116]
        - generic [ref=e117]:
          - generic [ref=e118]: Git
          - generic [ref=e119]: Docker
          - generic [ref=e120]: Linux
          - generic [ref=e121]: IoT
          - generic [ref=e122]: Home Automation
  - generic [ref=e124]:
    - heading "Writing" [level=2] [ref=e125]
    - paragraph [ref=e126]: Technical posts on the projects I build — health tech, IoT, data, and whatever else captures my attention.
    - generic "Blog posts"
  - generic [ref=e128]:
    - heading "GitHub Statistics" [level=2] [ref=e129]
    - generic [ref=e131]:
      - generic [ref=e132]: 
      - paragraph [ref=e133]: Loading stats...
    - generic [ref=e134]:
      - heading "Contribution Activity" [level=3] [ref=e135]
      - generic [ref=e137]:
        - generic [ref=e138]: 
        - paragraph [ref=e139]: Loading contributions...
    - generic [ref=e140]:
      - heading "Most Used Languages" [level=3] [ref=e141]
      - generic [ref=e143]:
        - generic [ref=e144]: 
        - paragraph [ref=e145]: Loading language stats...
    - generic [ref=e146]:
      - heading "Recent Activity" [level=3] [ref=e147]
      - generic "Recent GitHub activity"
  - generic [ref=e149]:
    - heading "Get In Touch" [level=2] [ref=e150]
    - generic [ref=e151]:
      - paragraph [ref=e152]: Open to interesting problems — whether that's a new role, a side project collaboration, or just a conversation about health tech, home automation, or data engineering.
      - generic [ref=e153]:
        - generic [ref=e154]:
          - generic [ref=e155]:
            - generic [ref=e156]: Name *
            - textbox "Name *" [ref=e157]:
              - /placeholder: Your full name
            - alert [ref=e158]
          - generic [ref=e159]:
            - generic [ref=e160]: Email *
            - textbox "Email *" [ref=e161]:
              - /placeholder: your.email@example.com
            - alert [ref=e162]
        - generic [ref=e163]:
          - generic [ref=e164]: Subject *
          - textbox "Subject *" [ref=e165]:
            - /placeholder: What would you like to discuss?
          - alert [ref=e166]
        - generic [ref=e167]:
          - generic [ref=e168]: Message *
          - textbox "Message *" [ref=e169]:
            - /placeholder: Tell me about your project, idea, or how we can work together...
          - alert [ref=e170]
        - button "Send Message " [ref=e171] [cursor=pointer]:
          - generic [ref=e172]: Send Message
          - generic [ref=e173]: 
          - text: 
        - status [ref=e174]
      - generic [ref=e175]:
        - link " contact@matthewanderson.dev" [ref=e176] [cursor=pointer]:
          - /url: mailto:contact@matthewanderson.dev
          - generic [ref=e177]: 
          - generic [ref=e178]: contact@matthewanderson.dev
        - link " @and3rn3t" [ref=e179] [cursor=pointer]:
          - /url: https://github.com/and3rn3t
          - generic [ref=e180]: 
          - generic [ref=e181]: "@and3rn3t"
        - link " LinkedIn" [ref=e182] [cursor=pointer]:
          - /url: https://linkedin.com/in/matthew-anderson
          - generic [ref=e183]: 
          - generic [ref=e184]: LinkedIn
  - generic [ref=e186]:
    - heading "Guestbook" [level=2] [ref=e187]
    - paragraph [ref=e188]: Leave a note. Say hello. Tell me what you're building.
    - generic [ref=e189]:
      - generic [ref=e191]:
        - generic [ref=e192]:
          - generic [ref=e193]: Name
          - textbox "Name" [ref=e194]:
            - /placeholder: Your name
        - generic [ref=e195]:
          - generic [ref=e196]: Message
          - textbox "Message" [ref=e197]:
            - /placeholder: What's on your mind?
        - button "Sign guestbook" [ref=e199]:
          - generic [ref=e200]: 
          - text: Sign guestbook
        - status [ref=e201]
      - generic "Guestbook entries" [ref=e203]:
        - generic [ref=e204]:
          - generic [ref=e205]: 
          - paragraph [ref=e206]: Loading entries...
  - contentinfo [ref=e207]:
    - generic [ref=e209]:
      - paragraph [ref=e210]: © 2026 Matthew Anderson. Built with vanilla JS, Vite, and GitHub Actions.
      - generic "Page views" [ref=e211]:
        - generic [ref=e212]: 
        - generic [ref=e213]: "0"
        - text: views
  - generic [ref=e214]:
    - button "Open theme picker" [ref=e215] [cursor=pointer]:
      - generic [ref=e216]: 
    - generic "Theme selection":
      - generic:
        - heading "Choose Theme" [level=3]
        - button "Close theme picker":
          - generic: 
      - menu:
        - menuitem "☀️ Light Default bright theme":
          - generic: ☀️ Light
          - generic: Default bright theme
        - menuitem "🌙 Dark Easy on the eyes":
          - generic: 🌙 Dark
          - generic: Easy on the eyes
      - generic:
        - generic:
          - checkbox "Follow system preference"
          - generic: Follow system preference
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
> 22 |     await page.waitForSelector('#global-search-modal.visible');
     |                ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
  23 |     await page.keyboard.press('Escape');
  24 |     await expect(page.locator('#global-search-modal')).not.toHaveClass(/visible/);
  25 | });
  26 | 
  27 | test('"/" key opens the palette when not in a text field', async ({ page }) => {
  28 |     // Ensure focus is on the body (not an input).
  29 |     await page.locator('body').click();
  30 |     await page.keyboard.press('/');
  31 |     await expect(page.locator('#global-search-modal')).toHaveClass(/visible/);
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