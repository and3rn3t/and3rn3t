# Blog System Documentation

This directory contains the blog system for Matthew Anderson's portfolio.

## 📁 Directory Structure

```
blog/
├── posts/              # Markdown blog posts
│   ├── welcome-to-my-blog.md
│   ├── building-modern-pwa.md
│   └── ...
├── images/             # Blog post images
│   └── ...
└── README.md          # This file
```

## ✍️ Creating a New Blog Post

### Method 1: Using PowerShell Script (Recommended)

```powershell
# Basic usage
.\new-blog-post.ps1 -Title "My New Post"

# With all options
.\new-blog-post.ps1 `
    -Title "Building a REST API" `
    -Category "tutorial" `
    -Tags @("nodejs", "express", "api") `
    -Excerpt "Learn how to build a RESTful API with Node.js" `
    -Featured
```

**Parameters:**
- `-Title` (required): Post title
- `-Category` (optional): Category (default: "general")
  - Options: "general", "tutorial", "showcase", "opinion"
- `-Tags` (optional): Array of tags
- `-Excerpt` (optional): Short description
- `-Featured` (optional): Mark as featured post

### Method 2: Manual Creation

1. Create a new `.md` file in `blog/posts/`
2. Add frontmatter (see template below)
3. Write your content in markdown
4. Add to `script.js` postFiles array
5. Update `feed.xml` and `sitemap.xml`

## 📝 Blog Post Template

```markdown
---
title: "Your Post Title"
date: "2025-11-04"
author: "Matthew Anderson"
tags: ["tag1", "tag2", "tag3"]
category: "tutorial"
excerpt: "Brief description of your post"
featured: false
---

# Your Post Title

Introduction paragraph...

## Section Heading

Content here...

### Code Example

\`\`\`javascript
function example() {
    console.log('Hello, World!');
}
\`\`\`

## Conclusion

Wrap up...

---

*Published on November 4, 2025*
```

## 🎨 Adding Images

1. Add images to `blog/images/`
2. Reference in markdown: `![Alt text](/blog/images/your-image.png)`
3. Images are automatically optimized by GitHub Actions

**Best Practices:**
- Use descriptive filenames
- Optimize images before upload (< 500KB)
- Provide alt text for accessibility
- Use WebP format when possible

## 🔧 Post Configuration

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Post title (used in URL slug) |
| `date` | string | Yes | Publication date (YYYY-MM-DD) |
| `author` | string | Yes | Author name |
| `tags` | array | No | Array of tags for categorization |
| `category` | string | No | Post category (general/tutorial/showcase) |
| `excerpt` | string | No | Short description for previews |
| `featured` | boolean | No | Mark as featured (shows first) |
| `image` | string | No | Hero image URL |
| `modified` | string | No | Last modified date (YYYY-MM-DD) |

### Categories

- **general**: General thoughts and updates
- **tutorial**: Step-by-step guides
- **showcase**: Project showcases
- **opinion**: Opinion pieces

### Tags

Use descriptive, lowercase tags:
- Technology: `javascript`, `python`, `react`, `nodejs`
- Topics: `web-development`, `performance`, `security`, `testing`
- Concepts: `tutorial`, `best-practices`, `tips`, `career`

## 📊 Markdown Features

### Headings
```markdown
# H1 - Main Title
## H2 - Section
### H3 - Subsection
```

### Text Formatting
```markdown
**Bold text**
*Italic text*
`Inline code`
```

### Lists
```markdown
- Unordered item
- Another item

1. Ordered item
2. Another item
```

### Links
```markdown
[Link text](https://example.com)
```

### Code Blocks
````markdown
```javascript
function example() {
    return 'syntax highlighted';
}
```
````

### Tables
```markdown
| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
```

### Horizontal Rule
```markdown
---
```

## 🚀 Deployment Process

1. **Create/Edit Post**: Write your blog post
2. **Commit Changes**: `git add` and `git commit`
3. **Push to GitHub**: `git push origin main`
4. **Automatic Validation**: GitHub Actions validates:
   - Markdown syntax
   - Frontmatter fields
   - RSS feed format
   - Sitemap format
   - Image sizes
5. **Image Optimization**: Automatically optimizes images
6. **Metadata Update**: Updates RSS lastBuildDate
7. **Deploy**: GitHub Pages deploys automatically

## ✅ Post Checklist

Before publishing, ensure:

- [ ] Frontmatter is complete and valid
- [ ] Title is descriptive and SEO-friendly
- [ ] Excerpt summarizes the post well
- [ ] Tags are relevant and lowercase
- [ ] Code examples are tested
- [ ] Images are optimized (< 500KB)
- [ ] Links are working
- [ ] Grammar and spelling checked
- [ ] Reading time is reasonable (aim for 5-10 min)
- [ ] Added to `script.js` postFiles array
- [ ] Updated `feed.xml` with new entry
- [ ] Updated `sitemap.xml` with new URL

## 🔍 SEO Optimization

### Automatic SEO Features

The blog system automatically adds:
- **Meta tags**: Title, description, author
- **Open Graph**: For social media sharing
- **Twitter Cards**: Rich Twitter previews
- **Structured Data**: BlogPosting schema
- **Canonical URLs**: Prevent duplicate content
- **Reading time**: Calculated automatically

### Manual SEO Checklist

- Use descriptive titles (50-60 characters)
- Write compelling excerpts (150-160 characters)
- Include relevant keywords naturally
- Add alt text to all images
- Use proper heading hierarchy (H1 → H2 → H3)
- Internal linking to other posts
- External links to authoritative sources

## 💬 Comments System

Comments use **Giscus** (GitHub Discussions):

1. Readers comment using GitHub accounts
2. Comments stored in repository Discussions
3. You moderate via GitHub Discussions tab
4. Comments sync with site theme automatically

**Setup**: See `docs/GISCUS_SETUP_GUIDE.md`

## 📱 Social Sharing

Each post includes sharing buttons for:
- Twitter
- LinkedIn
- Facebook
- Copy Link

Shares include:
- Post title
- Excerpt
- Featured image
- Author attribution

## 🎯 Analytics Tracking

Blog posts are tracked with:
- Page views per post
- Reading time completion
- Scroll depth
- Social shares
- Comment engagement
- Conversion goals (e.g., GitHub profile clicks)

View analytics in the Analytics Dashboard section.

## 🐛 Troubleshooting

### Post Not Showing Up

1. Check filename is added to `script.js` postFiles array
2. Verify frontmatter is valid
3. Check browser console for errors
4. Clear browser cache
5. Check GitHub Actions for validation errors

### Images Not Loading

1. Verify image path is correct
2. Check image is in `blog/images/`
3. Ensure image format is supported (JPG, PNG, WebP, SVG)
4. Check file size (< 5MB)

### Comments Not Loading

1. Verify Giscus is configured (see setup guide)
2. Check GitHub Discussions is enabled
3. Verify repo and category IDs in `script.js`
4. Check browser console for errors

### RSS Feed Issues

1. Validate XML syntax
2. Check all required fields are present
3. Verify URLs are absolute
4. Test with RSS validator

## 📚 Resources

- [Markdown Guide](https://www.markdownguide.org/)
- [GitHub Flavored Markdown](https://github.github.com/gfm/)
- [Giscus Documentation](https://giscus.app/)
- [Schema.org BlogPosting](https://schema.org/BlogPosting)
- [RSS 2.0 Specification](https://www.rssboard.org/rss-specification)

## 🆘 Support

For issues or questions:
1. Check this documentation
2. Review browser console errors
3. Check GitHub Actions logs
4. Consult `docs/GISCUS_SETUP_GUIDE.md`
5. Open a GitHub issue

---

**Happy Blogging! ✍️**
