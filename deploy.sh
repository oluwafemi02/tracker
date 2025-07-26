#!/bin/bash

# 📱 Expense Tracker PWA Deployment Script
# This script helps you deploy your PWA to various hosting platforms

echo "🚀 Deploying Expense Tracker PWA..."

# Check if required files exist
echo "📋 Checking required files..."

required_files=("index.html" "manifest.json" "sw.js")
missing_files=()

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -ne 0 ]; then
    echo "❌ Missing required files: ${missing_files[*]}"
    exit 1
fi

echo "✅ All required files present"

# Check if icons directory exists
if [ ! -d "icons" ]; then
    echo "📁 Creating icons directory..."
    mkdir -p icons
    echo "⚠️  Please add your app icons to the icons/ directory"
    echo "   Required sizes: 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512"
fi

# Validate manifest.json
echo "📄 Validating manifest.json..."
if command -v jq &> /dev/null; then
    if jq empty manifest.json 2>/dev/null; then
        echo "✅ manifest.json is valid JSON"
    else
        echo "❌ manifest.json contains invalid JSON"
        exit 1
    fi
else
    echo "⚠️  jq not found, skipping JSON validation"
fi

echo ""
echo "🌐 Choose deployment option:"
echo "1) GitHub Pages (free)"
echo "2) Netlify (free)"
echo "3) Vercel (free)"
echo "4) Firebase Hosting (free)"
echo "5) Custom server setup"

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo ""
        echo "📖 GitHub Pages Deployment:"
        echo "1. Create a new repository on GitHub"
        echo "2. Upload all files to the repository"
        echo "3. Go to Settings > Pages"
        echo "4. Select 'Deploy from a branch' and choose 'main'"
        echo "5. Your PWA will be available at: https://yourusername.github.io/repository-name"
        echo ""
        echo "💡 Pro tip: Enable HTTPS in GitHub Pages settings for PWA features"
        ;;
    2)
        echo ""
        echo "📖 Netlify Deployment:"
        echo "1. Create account at netlify.com"
        echo "2. Drag and drop your project folder to Netlify"
        echo "3. Or connect your GitHub repository"
        echo "4. Your PWA will be available at: https://random-name.netlify.app"
        echo ""
        echo "💡 Netlify automatically provides HTTPS"
        ;;
    3)
        echo ""
        echo "📖 Vercel Deployment:"
        echo "1. Install Vercel CLI: npm i -g vercel"
        echo "2. Run: vercel"
        echo "3. Follow the prompts"
        echo "4. Your PWA will be available at: https://project-name.vercel.app"
        echo ""
        echo "💡 Vercel automatically provides HTTPS and optimizations"
        ;;
    4)
        echo ""
        echo "📖 Firebase Hosting Deployment:"
        echo "1. Install Firebase CLI: npm install -g firebase-tools"
        echo "2. Run: firebase login"
        echo "3. Run: firebase init hosting"
        echo "4. Select your project directory"
        echo "5. Run: firebase deploy"
        echo ""
        echo "💡 Firebase provides HTTPS and global CDN"
        ;;
    5)
        echo ""
        echo "📖 Custom Server Setup:"
        echo "Requirements for PWA:"
        echo "- ✅ HTTPS (required for service workers)"
        echo "- ✅ Proper MIME types for .json files"
        echo "- ✅ Cache headers for performance"
        echo ""
        echo "Nginx configuration example:"
        echo "location / {"
        echo "    try_files \$uri \$uri/ /index.html;"
        echo "    add_header Cache-Control 'max-age=31536000' always;"
        echo "}"
        echo ""
        echo "location /sw.js {"
        echo "    add_header Cache-Control 'max-age=0, no-cache, no-store, must-revalidate';"
        echo "    add_header Service-Worker-Allowed '/';"
        echo "}"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "📱 Post-Deployment Checklist:"
echo "□ Test installation on iOS Safari (iOS 16.4+)"
echo "□ Verify HTTPS is working"
echo "□ Test offline functionality"
echo "□ Check push notifications (after user grants permission)"
echo "□ Validate with PWA testing tools"
echo ""
echo "🔗 PWA Testing Tools:"
echo "- Lighthouse (Chrome DevTools)"
echo "- PWA Builder (pwabuilder.com)"
echo "- Web App Manifest Validator"
echo ""
echo "✅ Deployment guide complete!"
echo "📱 Your expense tracker PWA is ready for iOS users!"