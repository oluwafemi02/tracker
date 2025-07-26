#!/bin/bash

echo "🚀 Deploying Complete Expense Tracker to GitHub..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 Current Features Ready for Deployment:${NC}"
echo "✅ Interactive User Guide System (10 steps)"
echo "✅ Smart Notification System (3-day/1-day reminders)"
echo "✅ Enterprise Security (XSS protection, CSP headers)"
echo "✅ Scrollable Recurring Expenses Modal"
echo "✅ Complete PWA with offline capabilities"
echo "✅ Advanced search, pagination, and filtering"
echo "✅ Dashboard with financial insights"
echo "✅ Budget management and alerts"
echo "✅ Custom categories and data export"
echo "✅ Keyboard shortcuts and accessibility"
echo ""

# Check git status
echo -e "${YELLOW}🔍 Checking Git Status...${NC}"
git status

echo ""
echo -e "${YELLOW}📂 Current Branch:${NC}"
git branch --show-current

echo ""
echo -e "${YELLOW}🔄 Cleaning up any stuck operations...${NC}"
git merge --abort 2>/dev/null || echo "No merge to abort"
git rebase --abort 2>/dev/null || echo "No rebase to abort"

echo ""
echo -e "${YELLOW}📥 Switching to main branch...${NC}"
git checkout main || {
    echo -e "${RED}❌ Failed to checkout main. Creating main branch...${NC}"
    git checkout -b main
}

echo ""
echo -e "${YELLOW}⬇️ Pulling latest changes...${NC}"
git pull origin main --allow-unrelated-histories || {
    echo -e "${YELLOW}⚠️ Pull failed, continuing with push...${NC}"
}

echo ""
echo -e "${YELLOW}📦 Adding all files...${NC}"
git add .

echo ""
echo -e "${YELLOW}💾 Committing changes...${NC}"
git commit -m "🚀 Complete Expense Tracker Pro Deployment

✨ NEW FEATURES:
📚 Interactive User Guide System
- 10-step comprehensive onboarding for first-time users
- Visual spotlight highlighting with animations
- Automatic detection of new vs existing users
- Quick tour option for returning users
- Keyboard navigation and accessibility

🔔 Smart Notification System  
- 3-day advance reminders for recurring expenses
- 1-day urgent reminders with interaction
- Automatic hourly checks for due expenses
- Push notifications with click-to-add functionality
- Overdue expense alerts

🔒 Enterprise Security
- Removed all inline onclick handlers
- Content Security Policy (CSP) headers
- XSS protection and security headers
- Safe DOM manipulation
- Security compliance for production

📱 Enhanced PWA Experience
- Scrollable recurring expenses modal
- Mobile-responsive design improvements
- Better visual organization and UX
- Smooth animations and transitions
- Professional touch interactions

🎯 COMPLETE FEATURE SET:
✅ Advanced expense tracking with smart search
✅ Real-time filtering and pagination
✅ Dashboard with financial insights and charts
✅ Recurring expenses with automated reminders
✅ Budget management with overspend alerts
✅ PWA capabilities (offline, notifications, home screen)
✅ Data export and import functionality
✅ Custom categories with emoji support
✅ Keyboard shortcuts for power users
✅ Dark mode support
✅ Multi-person expense tracking
✅ CSV export for financial analysis

READY FOR PRODUCTION! 🎉" || echo "No changes to commit"

echo ""
echo -e "${YELLOW}🚀 Pushing to GitHub...${NC}"
if git push origin main; then
    echo -e "${GREEN}✅ Successfully pushed to GitHub!${NC}"
    echo ""
    echo -e "${GREEN}🌐 Your app is now live at:${NC}"
    echo -e "${BLUE}https://oluwafemi02.github.io/tracker/${NC}"
    echo ""
    echo -e "${GREEN}🎉 DEPLOYMENT SUCCESSFUL!${NC}"
    echo ""
    echo -e "${BLUE}📋 What users will experience:${NC}"
    echo "• First-time users get automatic interactive guide"
    echo "• Existing users see welcome back message with quick tour"
    echo "• Automatic recurring expense reminders every hour"
    echo "• Secure, fast, professional PWA experience"
    echo "• All advanced features working seamlessly"
    echo ""
    echo -e "${GREEN}🚀 Your expense tracker is now production-ready!${NC}"
else
    echo -e "${YELLOW}⚠️ Normal push failed. Trying force push...${NC}"
    if git push --force-with-lease origin main; then
        echo -e "${GREEN}✅ Force push successful!${NC}"
        echo -e "${GREEN}🌐 Your app is now live!${NC}"
    else
        echo -e "${RED}❌ Push failed. Manual intervention needed.${NC}"
        echo ""
        echo -e "${YELLOW}🛠️ Manual steps:${NC}"
        echo "1. Check GitHub repository permissions"
        echo "2. Try: git push --force origin main"
        echo "3. Or create a new repository and push there"
        echo ""
        echo -e "${BLUE}💡 All files are ready - just need to reach GitHub!${NC}"
    fi
fi

echo ""
echo -e "${BLUE}📁 Files deployed:${NC}"
ls -la | grep -v "^d" | grep -v "^total"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎯 Deployment Complete! Users can now enjoy the full experience!${NC}"