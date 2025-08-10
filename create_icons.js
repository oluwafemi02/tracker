// Simple icon generator for PWA
const fs = require('fs');
const path = require('path');

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
}

// Simple SVG icon
const createSVGIcon = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="${size * 0.15}" fill="url(#grad)"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.6}" 
        fill="white" text-anchor="middle" dominant-baseline="central" font-weight="bold">$</text>
</svg>`;

// Create basic SVG icons for different sizes
const sizes = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];

sizes.forEach(size => {
    const svgContent = createSVGIcon(size);
    fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.svg`), svgContent);
    
    // Also create favicon files
    if (size === 16) {
        fs.writeFileSync(path.join(iconsDir, 'favicon-16x16.svg'), svgContent);
    }
    if (size === 32) {
        fs.writeFileSync(path.join(iconsDir, 'favicon-32x32.svg'), svgContent);
    }
    if (size === 192) {
        fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.svg'), svgContent);
    }
});

// Create shortcut icons
const shortcutSVG = createSVGIcon(96);
fs.writeFileSync(path.join(iconsDir, 'shortcut-add.svg'), shortcutSVG);
fs.writeFileSync(path.join(iconsDir, 'shortcut-dashboard.svg'), shortcutSVG);
fs.writeFileSync(path.join(iconsDir, 'shortcut-settings.svg'), shortcutSVG);
fs.writeFileSync(path.join(iconsDir, 'shortcut-recurring.svg'), shortcutSVG);

// Create a simple safari pinned tab icon
const safariIcon = `
<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <path fill="#000000" d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm2.5 10.5h-1v1h-3v-1h-1V9h1V6h1v3h2v1.5z"/>
</svg>`;
fs.writeFileSync(path.join(iconsDir, 'safari-pinned-tab.svg'), safariIcon);

console.log('✅ Icons created successfully!');