# Giscus Setup Guide for Blog Comments

## What is Giscus?

Giscus is a comments system powered by GitHub Discussions. It allows visitors to leave comments on your blog posts using their GitHub accounts, with all comments stored in your repository's Discussions.

## Features

- ✅ **GitHub-powered** - Uses GitHub Discussions (no external database)
- ✅ **Theme-aware** - Automatically matches your site theme
- ✅ **No tracking** - Privacy-friendly, no ads
- ✅ **Markdown support** - Full markdown and code syntax highlighting
- ✅ **Reactions** - GitHub reactions (👍, ❤️, 🎉, etc.)
- ✅ **Moderation** - You control the discussions
- ✅ **Free** - Completely free and open source

## Setup Instructions

### Step 1: Enable GitHub Discussions

1. Go to your repository: https://github.com/and3rn3t/and3rn3t
2. Click on **Settings** tab
3. Scroll down to **Features** section
4. Check the box for **Discussions**
5. Click **Set up discussions**

### Step 2: Create a Blog Comments Category

1. Go to **Discussions** tab in your repository
2. Click on **Categories** (gear icon)
3. Click **New category**
4. Create a category with these settings:
   - **Name**: `Blog Comments`
   - **Description**: `Comments for blog posts`
   - **Discussion format**: `Announcement` (only you can create new discussions, others can only comment)
5. Save the category

### Step 3: Install Giscus App

1. Visit: https://github.com/apps/giscus
2. Click **Install**
3. Choose **Only select repositories**
4. Select: `and3rn3t/and3rn3t`
5. Click **Install**

### Step 4: Get Repository Configuration

1. Go to: https://giscus.app
2. Fill in the configuration:
   - **Repository**: `and3rn3t/and3rn3t`
   - **Page ↔️ Discussions Mapping**: `pathname` (already configured)
   - **Discussion Category**: Select `Blog Comments`
   - **Features**: Enable reactions
   - **Theme**: Choose `preferred_color_scheme` (will auto-match)

3. Scroll down to see your **Repository ID** and **Category ID**

### Step 5: Update script.js

In `script.js`, find the `loadComments()` function (around line 9650) and replace:

```javascript
script.setAttribute('data-repo-id', 'YOUR_REPO_ID');
script.setAttribute('data-category-id', 'YOUR_CATEGORY_ID');
```

With your actual IDs from step 4.

### Step 6: Test Comments

1. Open your portfolio locally or deploy it
2. Navigate to a blog post
3. Try posting a test comment
4. Check your GitHub Discussions to see the comment appear

## Configuration Options

### Current Settings (in script.js)

```javascript
'data-repo': 'and3rn3t/and3rn3t'           // Your repository
'data-repo-id': 'YOUR_REPO_ID'              // Get from giscus.app
'data-category': 'Blog Comments'            // Discussion category name
'data-category-id': 'YOUR_CATEGORY_ID'      // Get from giscus.app
'data-mapping': 'pathname'                  // Map by URL pathname
'data-strict': '0'                          // Create discussion if missing
'data-reactions-enabled': '1'               // Enable reactions
'data-emit-metadata': '0'                   // Don't emit metadata
'data-input-position': 'top'                // Comment box at top
'data-theme': 'dark'                        // Match site theme
'data-lang': 'en'                           // English language
'data-loading': 'lazy'                      // Lazy load comments
```

### Alternative Mapping Options

You can change `data-mapping` to:
- `pathname` - Maps to URL path (default, recommended)
- `url` - Maps to full URL
- `title` - Maps to page title
- `og:title` - Maps to Open Graph title
- `specific` - Specific discussion number
- `number` - Discussion number

## Theme Synchronization

The blog system automatically updates Giscus theme when you change your site theme:

1. User changes theme using theme picker
2. `ThemeManager` dispatches `themeChanged` event
3. `BlogManager` listens for event
4. Updates Giscus theme via postMessage API
5. Comments UI updates to match

This is handled by `updateGiscusTheme()` function in `script.js`.

## Moderation

### Managing Comments

1. Go to your repository's **Discussions** tab
2. Find the **Blog Comments** category
3. Each blog post will have its own discussion
4. You can:
   - Reply to comments
   - Edit or delete comments
   - Lock discussions
   - Mark comments as answered
   - Hide inappropriate comments

### Comment Policy

Consider adding a comment policy to your blog posts:
- Be respectful and constructive
- Stay on topic
- No spam or self-promotion
- No harassment or hate speech

## Troubleshooting

### Comments Not Loading

1. **Check GitHub Discussions is enabled**
   - Go to repository Settings > Features
   - Ensure Discussions is checked

2. **Verify Giscus app is installed**
   - Go to: https://github.com/apps/giscus/installations
   - Ensure it's installed for your repository

3. **Check Repository IDs**
   - Go to: https://giscus.app
   - Enter your repository name
   - Copy the exact IDs shown

4. **Check Console Errors**
   - Open browser DevTools (F12)
   - Look for Giscus-related errors
   - Common issues:
     - Invalid repo ID
     - Invalid category ID
     - CORS errors (usually config issue)

### Theme Not Updating

1. **Check ThemeManager is loaded**
   - Open console: `console.log(window.themeManager)`
   - Should show ThemeManager instance

2. **Check Event Listener**
   - Event should fire when theme changes
   - Look for `[Blog] Updated Giscus theme` in console

3. **Check iframe exists**
   - Inspect page for `<iframe class="giscus-frame">`
   - If missing, comments haven't loaded yet

## Privacy & Security

### Data Storage
- Comments stored in GitHub Discussions
- No third-party tracking
- No cookies from Giscus
- User data controlled by GitHub

### User Privacy
- Users must have GitHub account to comment
- Users can delete their own comments
- You (repo owner) can moderate all comments

### Security
- Content Security Policy (CSP) compatible
- HTTPS only
- Cross-origin isolation safe
- No XSS vulnerabilities (GitHub handles sanitization)

## Performance

### Load Impact
- Lazy loaded by default (`data-loading: 'lazy'`)
- Only loads when user scrolls to comments
- ~50KB initial JavaScript
- ~20KB per comment thread
- Minimal performance impact

### Optimization
- Comments load after main content
- Doesn't block page rendering
- Uses GitHub's CDN (fast globally)

## Alternative: Utterances

If you prefer Utterances instead of Giscus:

1. Install: https://github.com/apps/utterances
2. Update `loadComments()` to use utterances script:

```javascript
const script = document.createElement('script');
script.src = 'https://utteranc.es/client.js';
script.setAttribute('repo', 'and3rn3t/and3rn3t');
script.setAttribute('issue-term', 'pathname');
script.setAttribute('theme', 'github-dark');
script.setAttribute('crossorigin', 'anonymous');
script.async = true;
commentsContainer.appendChild(script);
```

**Note:** Utterances uses GitHub Issues instead of Discussions, so each blog post creates a new issue.

## Support

For Giscus-specific issues:
- Documentation: https://giscus.app
- GitHub: https://github.com/giscus/giscus
- Discussions: https://github.com/giscus/giscus/discussions

For blog system issues:
- Check `script.js` BlogManager class
- Review browser console for errors
- Ensure all IDs are correctly configured

---

**Next Steps:**
1. Follow setup instructions above
2. Get your repository and category IDs
3. Update `script.js` with actual IDs
4. Test comments on a blog post
5. Set up moderation workflow
