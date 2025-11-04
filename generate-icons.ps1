# Generate PWA Icons Script
# This script creates placeholder icons for the PWA

$iconSizes = @(72, 96, 128, 144, 152, 192, 384, 512)
$iconsDir = "icons"

# Create icons directory if it doesn't exist
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir | Out-Null
    Write-Host "Created icons directory" -ForegroundColor Green
}

# Function to create SVG icon
function Create-SVGIcon {
    param (
        [int]$size,
        [string]$outputPath
    )
    
    $svg = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $size $size" width="$size" height="$size">
    <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect width="$size" height="$size" fill="url(#grad)" rx="$(($size * 0.15))"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="$(($size * 0.4))" 
          font-weight="bold" fill="white" text-anchor="middle" dy=".35em">MA</text>
</svg>
"@
    
    Set-Content -Path $outputPath -Value $svg -Encoding UTF8
}

# Generate icons
Write-Host "`nGenerating PWA icons..." -ForegroundColor Cyan

foreach ($size in $iconSizes) {
    $filename = "icon-${size}x${size}.svg"
    $filepath = Join-Path $iconsDir $filename
    
    Create-SVGIcon -size $size -outputPath $filepath
    Write-Host "  Created $filename" -ForegroundColor Green
}

# Create favicon
Write-Host "`nGenerating favicon..." -ForegroundColor Cyan
$faviconSVG = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect width="32" height="32" fill="url(#grad)" rx="5"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="14" 
          font-weight="bold" fill="white" text-anchor="middle" dy=".35em">MA</text>
</svg>
"@
Set-Content -Path "favicon.svg" -Value $faviconSVG -Encoding UTF8
Write-Host "  Created favicon.svg" -ForegroundColor Green

# Create maskable icon (with padding for safe zone)
Write-Host "`nGenerating maskable icon..." -ForegroundColor Cyan
$maskableSize = 512
$padding = $maskableSize * 0.1
$innerSize = $maskableSize - ($padding * 2)
$maskableSVG = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $maskableSize $maskableSize" width="$maskableSize" height="$maskableSize">
    <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect width="$maskableSize" height="$maskableSize" fill="url(#grad)"/>
    <rect x="$padding" y="$padding" width="$innerSize" height="$innerSize" fill="none" 
          stroke="rgba(255,255,255,0.2)" stroke-width="2" rx="$(($innerSize * 0.15))"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="200" 
          font-weight="bold" fill="white" text-anchor="middle" dy=".35em">MA</text>
</svg>
"@
Set-Content -Path (Join-Path $iconsDir "icon-maskable-512x512.svg") -Value $maskableSVG -Encoding UTF8
Write-Host "  Created icon-maskable-512x512.svg" -ForegroundColor Green

# Create Apple Touch Icon (180x180)
Write-Host "`nGenerating Apple Touch Icon..." -ForegroundColor Cyan
$appleTouchSVG = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
    <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect width="180" height="180" fill="url(#grad)"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="72" 
          font-weight="bold" fill="white" text-anchor="middle" dy=".35em">MA</text>
</svg>
"@
Set-Content -Path (Join-Path $iconsDir "icon-180x180.svg") -Value $appleTouchSVG -Encoding UTF8
Write-Host "  Created icon-180x180.svg" -ForegroundColor Green

# Create splash screens for iOS
Write-Host "`nGenerating iOS splash screens..." -ForegroundColor Cyan

$splashScreens = @(
    @{width=640; height=1136; name="iphone5"},
    @{width=750; height=1334; name="iphone6"},
    @{width=1242; height=2208; name="iphone6plus"},
    @{width=1125; height=2436; name="iphonex"},
    @{width=1242; height=2688; name="iphonexsmax"},
    @{width=828; height=1792; name="iphonexr"},
    @{width=1536; height=2048; name="ipadpro10"},
    @{width=2048; height=2732; name="ipadpro12"}
)

foreach ($screen in $splashScreens) {
    $filename = "splash-$($screen.name)-$($screen.width)x$($screen.height).svg"
    $filepath = Join-Path $iconsDir $filename
    
    $splashSVG = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $($screen.width) $($screen.height)" 
     width="$($screen.width)" height="$($screen.height)">
    <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect width="$($screen.width)" height="$($screen.height)" fill="url(#grad)"/>
    <text x="50%" y="45%" font-family="Arial, sans-serif" font-size="120" 
          font-weight="bold" fill="white" text-anchor="middle" dy=".35em">MA</text>
    <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="40" 
          fill="white" text-anchor="middle" dy=".35em">Matthew Anderson</text>
</svg>
"@
    
    Set-Content -Path $filepath -Value $splashSVG -Encoding UTF8
    Write-Host "  Created $filename" -ForegroundColor Green
}

Write-Host "`n✅ Icon generation complete!" -ForegroundColor Green
Write-Host "`nGenerated:" -ForegroundColor Cyan
Write-Host "  • $($iconSizes.Count) standard PWA icons" -ForegroundColor White
Write-Host "  • 1 maskable icon" -ForegroundColor White
Write-Host "  • 1 Apple Touch icon" -ForegroundColor White
Write-Host "  • 1 favicon" -ForegroundColor White
Write-Host "  • $($splashScreens.Count) iOS splash screens" -ForegroundColor White
Write-Host "`nNote: These are SVG placeholders. For production, consider:" -ForegroundColor Yellow
Write-Host "  • Converting to PNG format using ImageMagick or similar" -ForegroundColor Yellow
Write-Host "  • Creating custom artwork with a designer" -ForegroundColor Yellow
Write-Host "  • Optimizing file sizes for faster loading" -ForegroundColor Yellow
