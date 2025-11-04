# Blog Post Generator
# Creates a new blog post with frontmatter template

param(
    [Parameter(Mandatory=$true)]
    [string]$Title,
    
    [Parameter(Mandatory=$false)]
    [string]$Category = "general",
    
    [Parameter(Mandatory=$false)]
    [string[]]$Tags = @(),
    
    [Parameter(Mandatory=$false)]
    [string]$Excerpt = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$Featured
)

# Configuration
$BlogDir = Join-Path $PSScriptRoot "blog\posts"
$Author = "Matthew Anderson"
$Date = Get-Date -Format "yyyy-MM-dd"

# Ensure blog directory exists
if (-not (Test-Path $BlogDir)) {
    New-Item -ItemType Directory -Path $BlogDir -Force | Out-Null
    Write-Host "✓ Created blog directory: $BlogDir" -ForegroundColor Green
}

# Generate slug from title
$Slug = $Title.ToLower() -replace '[^a-z0-9\s-]', '' -replace '\s+', '-'
$Filename = "$Slug.md"
$FilePath = Join-Path $BlogDir $Filename

# Check if file already exists
if (Test-Path $FilePath) {
    Write-Host "❌ Error: Blog post already exists: $Filename" -ForegroundColor Red
    Write-Host "   Path: $FilePath" -ForegroundColor Yellow
    exit 1
}

# Build tags array for frontmatter
$TagsArray = if ($Tags.Count -gt 0) {
    '["' + ($Tags -join '", "') + '"]'
} else {
    '[]'
}

# Build frontmatter
$FeaturedValue = if ($Featured) { "true" } else { "false" }

$Frontmatter = @"
---
title: "$Title"
date: "$Date"
author: "$Author"
tags: $TagsArray
category: "$Category"
excerpt: "$Excerpt"
featured: $FeaturedValue
---

"@

# Build post content template
$PostContent = @"
# $Title

Write your introduction here...

## Section 1

Content for section 1...

### Subsection

More detailed content...

## Code Example

``````javascript
// Your code example here
function example() {
    console.log('Hello, World!');
}
``````

## Key Takeaways

- Point 1
- Point 2
- Point 3

## Conclusion

Wrap up your post...

---

*Published on $Date*
"@

# Combine frontmatter and content
$FullContent = $Frontmatter + $PostContent

# Write to file
$FullContent | Out-File -FilePath $FilePath -Encoding UTF8 -NoNewline

# Success message
Write-Host ""
Write-Host "✅ Blog post created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Details:" -ForegroundColor Cyan
Write-Host "   Title:    $Title" -ForegroundColor White
Write-Host "   Slug:     $Slug" -ForegroundColor White
Write-Host "   Category: $Category" -ForegroundColor White
Write-Host "   Tags:     $($Tags -join ', ')" -ForegroundColor White
Write-Host "   Featured: $FeaturedValue" -ForegroundColor White
Write-Host "   File:     $Filename" -ForegroundColor White
Write-Host ""
Write-Host "📁 Location:" -ForegroundColor Cyan
Write-Host "   $FilePath" -ForegroundColor Yellow
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Edit the file with your content" -ForegroundColor White
Write-Host "   2. Add images to blog/images/ if needed" -ForegroundColor White
Write-Host "   3. Update feed.xml with new post entry" -ForegroundColor White
Write-Host "   4. Update sitemap.xml with new post URL" -ForegroundColor White
Write-Host "   5. Update script.js postFiles array with filename" -ForegroundColor White
Write-Host "   6. Commit and push to deploy" -ForegroundColor White
Write-Host ""

# Open file in default editor (optional)
$OpenFile = Read-Host "Open file in editor? (Y/n)"
if ($OpenFile -ne 'n' -and $OpenFile -ne 'N') {
    Start-Process $FilePath
    Write-Host "✓ Opened file in default editor" -ForegroundColor Green
}

# Calculate reading time (placeholder)
Write-Host ""
Write-Host "💡 Tip: Reading time will be calculated automatically (avg. 200 words/min)" -ForegroundColor Cyan
Write-Host ""
