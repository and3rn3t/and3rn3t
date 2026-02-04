# ES6 Module Migration Guide

## Overview

The portfolio codebase has been refactored from a monolithic 7,218-line `script.js` into clean, maintainable ES6 modules.

## New Module Structure

```
/modules/
├── debug.js        # Debug utilities with conditional logging
├── github-api.js   # GitHub API integration with caching
├── theme.js        # Dark/light theme management
├── performance.js  # Web Vitals & performance monitoring
├── mobile.js       # Mobile detection & touch handling
├── analytics.js    # Privacy-first analytics tracking
├── projects.js     # Project loading & display
└── navigation.js   # Site navigation & search

/main.js            # Application entry point
```

## Benefits

### 1. **Consolidated Duplicate Code**
- **Mobile/Touch**: 6 overlapping classes → 1 unified `MobileManager`
- **Performance**: 5 monitoring classes → 1 `PerformanceManager`
- **Analytics**: 2 analytics systems → 1 `AnalyticsManager`

### 2. **Improved Debugging**
- Single `DEBUG_MODE` flag controls all logging
- Consistent `debug.log/warn/error` API
- Performance measurement utilities

### 3. **Better Separation of Concerns**
- Each module handles one responsibility
- Clear imports/exports
- Easier to test and maintain

### 4. **Modern JavaScript**
- ES6 modules with proper imports/exports
- Singleton pattern for managers
- Async/await throughout

## How to Migrate

### Option 1: Full Module Migration (Recommended for Modern Browsers)

Update `index.html`:

```html
<!-- Replace this: -->
<script src="script.js" async></script>

<!-- With this: -->
<script type="module" src="main.js"></script>
```

Also update the preload:
```html
<!-- Replace: -->
<link rel="preload" href="script.js" as="script">

<!-- With: -->
<link rel="modulepreload" href="main.js">
<link rel="modulepreload" href="modules/debug.js">
<link rel="modulepreload" href="modules/theme.js">
```

### Option 2: Keep Both (Transitional)

Keep `script.js` for compatibility and gradually move features:

```html
<!-- Legacy support -->
<script src="script.js" async></script>

<!-- New modules for testing (add nomodule fallback) -->
<script type="module" src="main.js"></script>
```

### Option 3: Bundle for Production

Use a bundler like esbuild, Rollup, or Vite:

```bash
# Install esbuild
npm install -D esbuild

# Bundle modules
npx esbuild main.js --bundle --outfile=bundle.js --format=iife --minify
```

Then use the bundled file:
```html
<script src="bundle.js" async></script>
```

## Module API Reference

### Debug Module
```javascript
import { DEBUG_MODE, debug, measureTime } from './modules/debug.js';

debug.log('Message');    // Only logs if DEBUG_MODE is true
debug.warn('Warning');
debug.error('Error');

const duration = measureTime('operation', () => {
    // Expensive operation
});
```

### Theme Module
```javascript
import { initThemeManager } from './modules/theme.js';

const theme = initThemeManager();
theme.toggle();          // Toggle dark/light
theme.set('dark');       // Set specific theme
theme.get();             // Get current theme
```

### GitHub API Module
```javascript
import { githubAPI } from './modules/github-api.js';

const userData = await githubAPI.getUserData();
const repos = await githubAPI.getRepositories();
const activity = await githubAPI.getRecentActivity();
```

### Performance Module
```javascript
import { performanceManager } from './modules/performance.js';

performanceManager.init();
const metrics = performanceManager.getMetrics();
const report = performanceManager.generateReport();
```

### Mobile Module
```javascript
import { mobileManager } from './modules/mobile.js';

mobileManager.init();
console.log(mobileManager.isMobile);
console.log(mobileManager.getDeviceInfo());

mobileManager.on('swipe', (data) => {
    console.log('Swipe:', data.direction);
});
```

### Analytics Module
```javascript
import { analyticsManager } from './modules/analytics.js';

analyticsManager.init();
analyticsManager.trackEvent('button_click', { button: 'cta' });
analyticsManager.trackPerformance('loadTime', 1234);
```

### Projects Module
```javascript
import { projectsManager } from './modules/projects.js';

await projectsManager.init('#projects-container');
projectsManager.filterProjects('javascript');
projectsManager.searchProjects('react');
```

### Navigation Module
```javascript
import { navigationManager } from './modules/navigation.js';

navigationManager.init();
navigationManager.scrollToSection('projects');
navigationManager.getCurrentSection();
```

## Global API (window.PortfolioApp)

When using the module system, a global API is exposed:

```javascript
// Check if app is ready
PortfolioApp.isReady();

// Access managers
PortfolioApp.theme.toggle();
PortfolioApp.projects.refresh();

// Get stats
console.log(PortfolioApp.getStats());
```

## Browser Support

ES6 modules are supported in:
- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 16+

For older browsers, use the bundled version or include a fallback:

```html
<script type="module" src="main.js"></script>
<script nomodule src="script.js"></script>
```

## Testing

Test the new modules locally:

```bash
# Start a local server (modules require HTTP)
python3 -m http.server 8000

# Or use Node.js
npx serve
```

Then open http://localhost:8000 and check the console for initialization messages.

## Rollback

If issues occur, simply revert to the original `script.js`:

```html
<script src="script.js" async></script>
```

The original file remains intact and fully functional.
