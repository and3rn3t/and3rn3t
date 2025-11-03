# GitHub Copilot Instructions

## Project Architecture
This is a **static GitHub Pages portfolio** with dynamic GitHub API integration and automated content generation.

**Core Stack:** Vanilla HTML5/CSS3/JavaScript ES6+ | GitHub API | GitHub Actions
**Key Pattern:** API-driven content with fallback static data in `projects-data.json`

## Critical Development Context

### Data Flow Architecture
```
GitHub API → script.js functions → DOM updates → Intersection Observer animations
projects-data.json → Enhanced metadata → Project cards with rich descriptions
GitHub Actions → Automated metrics/snake → Static assets updated every 6h
```

### Key Files & Responsibilities
- `script.js`: 1357 lines, 7 main API functions, handles all GitHub integration
- `projects-data.json`: Enhanced project metadata with categories/highlights/tech stacks  
- `styles.css`: 2218 lines with CSS variables, dark/light themes, responsive grid
- `.github/workflows/`: 3 automated workflows for metrics, snake animation, pages deployment

## Essential Patterns

### GitHub API Integration Pattern
```javascript
// Standard pattern used throughout script.js
async function loadGitHubData() {
    try {
        const response = await fetch('https://api.github.com/users/and3rn3t/repos?sort=stars&per_page=100');
        const data = await response.json();
        // Enhanced with projects-data.json metadata
        const projectMeta = projectsData?.projects?.find(p => p.name === repo.name);
    } catch (error) {
        console.error('Error:', error);
        showDemoProjects(container); // Always provide fallback
    }
}
```

### CSS Architecture
- Uses CSS custom properties for theming: `--primary-color`, `--bg-primary`, etc.
- BEM-style naming: `.project-card`, `.skill-category`, `.contact-method`
- Mobile-first responsive with container max-width: 1200px
- Dark theme toggle via body class: `dark-theme`

### Animation System
- Intersection Observer for scroll animations (opacity: 0 → 1, translateY: 30px → 0)
- 0.6s ease transitions on `.highlight-item`, `.skill-category`, `.project-card`
- Navbar scroll effects with `scrolled` class at 50px threshold

## Project-Specific Conventions

### Project Metadata Enhancement
Always reference both GitHub API data AND `projects-data.json` for complete information:
```javascript
const displayName = metadata?.displayName || repo.name;
const description = metadata?.description || repo.description;
const longDescription = metadata?.longDescription; // Rich content only in JSON
```

### Security & Performance
- All external links need `rel="noopener"` (current issue to fix)
- Use `for...of` instead of `.forEach()` (ESLint rule)
- Prefer `Date.now()` over `new Date()` for performance
- Use `globalThis` instead of `window` for modern compatibility

### GitHub Actions Workflows
- `metrics.yml`: Updates every 6h, generates comprehensive GitHub metrics
- `snake.yml`: Daily contribution snake animation
- `pages.yml`: Auto-deployment on main branch push
- All use `GITHUB_TOKEN` for API access

## Common Tasks

### Adding New Projects
1. Add metadata to `projects-data.json` with full schema
2. Ensure GitHub repo has topics for technology tags
3. Test both API success and fallback scenarios

### Performance Optimization
- Images use lazy loading with Intersection Observer
- API calls have retry logic with exponential backoff
- CSS animations use `transform`/`opacity` for 60fps performance

### Theme Development  
- Update CSS custom properties in `:root` and `[data-theme="dark"]`
- Test both light/dark modes with theme toggle
- Ensure sufficient contrast ratios (current WCAG 2.1 compliant)