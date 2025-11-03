# Comprehensive GitHub Copilot Instructions
*Combined instructions for Matthew Anderson (@and3rn3t)'s Portfolio Development*

## Project Overview & Architecture

### Project Type & Core Identity
This is Matthew Anderson's **static GitHub Pages portfolio** with dynamic GitHub API integration and automated content generation. It serves as a modern, interactive showcase featuring real-time GitHub statistics, project highlights, and professional information.

**Core Stack:** Vanilla HTML5/CSS3/JavaScript ES6+ | GitHub API | GitHub Actions  
**Key Pattern:** API-driven content with fallback static data in `projects-data.json`

### Data Flow Architecture
```
GitHub API → script.js functions → DOM updates → Intersection Observer animations
projects-data.json → Enhanced metadata → Project cards with rich descriptions
GitHub Actions → Automated metrics/snake → Static assets updated every 6h
```

## 📁 Key Files & Responsibilities

### Critical Files
- **`script.js`**: 1357 lines, 7 main API functions, handles all GitHub integration
- **`projects-data.json`**: Enhanced project metadata with categories/highlights/tech stacks  
- **`styles.css`**: 2218 lines with CSS variables, dark/light themes, responsive grid
- **`index.html`**: Main portfolio page with comprehensive sections
- **`.github/workflows/`**: 3 automated workflows for metrics, snake animation, pages deployment

### File Structure
```
├── index.html - Main portfolio page
├── styles.css - Custom styling with CSS variables
├── script.js - Interactive functionality and GitHub API integration
├── projects-data.json - Structured project information and metadata
├── README.md - Repository documentation and project showcase
└── .github/workflows/ - CI/CD automation for metrics and deployment
```

## 🎨 Design Principles & Development Standards

### Code Style Guidelines
- **HTML5**: Use semantic elements with proper document structure
- **CSS**: Follow BEM methodology for class naming where applicable
- **JavaScript**: Use modern ES6+ with const/let, arrow functions, async/await
- **Indentation**: 2 spaces for HTML/CSS, 4 spaces for JS
- **Functions**: Keep pure and modular where possible

### CSS Architecture & Guidelines
- **CSS Custom Properties**: Use for consistent theming (`--primary-color`, `--bg-primary`, etc.)
- **Naming**: BEM-style naming (`.project-card`, `.skill-category`, `.contact-method`)
- **Responsive**: Mobile-first approach with container max-width: 1200px
- **Theming**: Dark theme toggle via body class (`dark-theme`)
- **Layout**: Use Flexbox and Grid, maintain consistent spacing (8px base unit)
- **Performance**: Use efficient selectors, prioritize `transform`/`opacity` for animations

### JavaScript Patterns & Guidelines
- **Modern Syntax**: Use async/await, destructuring, template literals
- **API Integration**: Implement proper error handling and retry logic
- **Performance**: Prefer `Date.now()` over `new Date()`, use `for...of` instead of `.forEach()`
- **Compatibility**: Use `globalThis` instead of `window`
- **Naming**: Use descriptive variable and function names
- **Error Handling**: Implement graceful fallbacks for failed API requests

## 🚀 Essential Patterns & Core Features

### GitHub API Integration Pattern
```javascript
// Standard pattern used throughout script.js
async function loadGitHubData() {
    try {
        const response = await fetch('https://api.github.com/users/and3rn3t/repos?sort=stars&per_page=100');
        const data = await response.json();
        // Enhanced with projects-data.json metadata
        const projectMeta = projectsData?.projects?.find(p => p.name === repo.name);
        
        const displayName = metadata?.displayName || repo.name;
        const description = metadata?.description || repo.description;
        const longDescription = metadata?.longDescription; // Rich content only in JSON
    } catch (error) {
        console.error('Error:', error);
        showDemoProjects(container); // Always provide fallback
    }
}
```

### Animation System
- **Intersection Observer**: Scroll animations (opacity: 0 → 1, translateY: 30px → 0)
- **Transitions**: 0.6s ease on `.highlight-item`, `.skill-category`, `.project-card`
- **Navbar Effects**: Scroll effects with `scrolled` class at 50px threshold
- **Performance**: Use `transform`/`opacity` for 60fps performance

### Interactive Elements
- Smooth scroll navigation with offset for fixed navbar
- Mobile-responsive hamburger menu
- Theme toggle (dark/light mode)
- Animated loading states and transitions
- SEO-optimized meta tags and structured data

## 🛠️ Development Guidelines & Best Practices

### When Adding New Features
1. **Maintain Responsiveness**: Test on mobile, tablet, and desktop
2. **Theme Compatibility**: Ensure features work in both light and dark themes
3. **Performance First**: Optimize images, minimize HTTP requests, lazy load resources
4. **Accessibility**: Include proper ARIA labels, semantic markup
5. **SEO Considerations**: Update meta tags and structured data as needed

### Project-Specific Conventions

#### Project Metadata Enhancement
Always reference both GitHub API data AND `projects-data.json` for complete information:
- Use enhanced metadata for display names and descriptions
- Include rich `longDescription` content only available in JSON
- Maintain technology tags from GitHub topics

#### Security & Performance
- **External Links**: All need `rel="noopener"` (current issue to fix)
- **Performance**: Use lazy loading with Intersection Observer
- **API Calls**: Implement retry logic with exponential backoff
- **Images**: Optimize and compress, use appropriate formats

### API Integration Best Practices
- **Rate Limiting**: GitHub API awareness, implement caching strategies
- **Authentication**: Use `GITHUB_TOKEN` for higher limits when possible
- **Fallbacks**: Provide graceful degradation when limits are reached
- **Loading States**: Use loading indicators for better UX
- **Error Handling**: Handle network errors gracefully with fallback content

## 🔧 GitHub Actions Workflows

### Automated Workflows
- **`metrics.yml`**: Updates every 6h, generates comprehensive GitHub metrics
- **`snake.yml`**: Daily contribution snake animation
- **`pages.yml`**: Auto-deployment on main branch push
- All use `GITHUB_TOKEN` for API access

## 📝 Content Management & Guidelines

### Adding New Projects
1. Add metadata to `projects-data.json` with complete schema:
   ```json
   {
     "name": "project-name",
     "displayName": "Project Display Name",
     "description": "Brief description",
     "longDescription": "Detailed technical description...",
     "technologies": ["React", "TypeScript", "Node.js"],
     "highlights": ["Feature 1", "Feature 2"],
     "category": "web-development"
   }
   ```
2. Ensure GitHub repo has topics for technology tags
3. Test both API success and fallback scenarios
4. Update any relevant meta descriptions if needed

### Writing Style
- Professional yet approachable tone
- Technical accuracy with accessible explanations
- Highlight key achievements and innovations
- Use active voice and concise descriptions
- Include clear technology stacks and business value

## 🚨 Important Considerations & Common Issues

### Browser Compatibility
- **Target**: Modern browsers (Chrome 70+, Firefox 65+, Safari 12+, Edge 79+)
- **Fallbacks**: Provide for CSS Grid and Flexbox if needed
- **Testing**: Test JavaScript features across target browsers

### Security & Performance
- **HTTPS**: Use for all external resources
- **CSP**: Implement Content Security Policy headers where possible
- **Sanitization**: Sanitize any user-generated content
- **Rate Limiting**: Monitor GitHub API usage and implement appropriate caching

### Mobile Experience Priorities
- Touch-friendly interaction areas (minimum 44px touch targets)
- Readable typography on small screens
- Optimized navigation for mobile usage patterns
- Test across different device orientations

## 🎯 Common Tasks & Workflows

### Theme/Design Updates
1. Update CSS custom properties in `:root` and `[data-theme="dark"]`
2. Test changes in both light and dark modes
3. Verify mobile responsiveness with new content
4. Check contrast ratios for accessibility (WCAG 2.1 compliant)
5. Update any theme-specific assets

### Performance Optimization Checklist
- Images use lazy loading with Intersection Observer
- API calls have retry logic with exponential backoff
- CSS animations use `transform`/`opacity` for 60fps performance
- Minimize and compress CSS/JS assets
- Use efficient DOM manipulation techniques

### SEO & Discoverability
- Update structured data for schema.org compliance
- Maintain comprehensive meta tag coverage
- Include proper Open Graph and Twitter Card tags
- Update `sitemap.xml` when adding new pages or content

## 💡 Professional Brand Standards

This portfolio represents Matthew Anderson's professional brand and technical expertise. Always maintain:

- **High Code Quality**: Clean, well-documented, and maintainable code
- **Performance Excellence**: Fast loading times and smooth interactions
- **User Experience**: Intuitive navigation and accessibility compliance
- **Technical Innovation**: Showcase of modern development practices
- **Professional Presentation**: Polished design and comprehensive content

---

*This comprehensive guide combines technical implementation details with professional development standards to ensure consistent, high-quality contributions to Matthew Anderson's portfolio project.*