# Quality Assurance Checklist
## Expense Tracker - Post-Improvement Testing

**Version**: 2.2.0+improvements  
**Date**: 2025-11-02  
**Tester**: _____________  
**Browser**: _____________  
**Device**: _____________

---

## 🔍 Pre-Test Setup

- [ ] Clear browser cache and localStorage
- [ ] Open browser developer console (F12)
- [ ] Check for JavaScript errors (should be none)
- [ ] Confirm app loads successfully

---

## 💰 1. Monetary Calculations

### Test 1.1: Basic Addition
- [ ] Set budget to €1000
- [ ] Add expense: €333.33
- [ ] Add expense: €333.33
- [ ] Add expense: €333.34
- [ ] **Expected**: Total = €1000.00 (exactly, no floating-point errors)
- [ ] **Result**: ✅ / ❌

### Test 1.2: Floating Point Edge Case
- [ ] Add expense: €0.10
- [ ] Add expense: €0.20
- [ ] **Expected**: Total = €0.30 (not 0.30000000000004)
- [ ] **Result**: ✅ / ❌

### Test 1.3: Currency Formatting
- [ ] Check amounts display with thousands separator
- [ ] Example: €1,234.56
- [ ] **Expected**: Commas in thousands place, 2 decimals
- [ ] **Result**: ✅ / ❌

### Test 1.4: Large Numbers
- [ ] Set budget to €999,999
- [ ] Add expense: €123,456.78
- [ ] **Expected**: Correct calculation and formatting
- [ ] **Result**: ✅ / ❌

---

## 🔄 2. Rollover Logic

### Test 2.1: Positive Rollover
**Setup**: Set budget to €1000, add expenses totaling €700

- [ ] Go to Settings → Check for Rollover Now
- [ ] **Expected**: Modal shows €300 rollover from previous month
- [ ] Choose "Add to Budget"
- [ ] **Expected**: Current budget shows €1,300
- [ ] **Result**: ✅ / ❌

### Test 2.2: Negative Balance (Exact Overspending)
**Setup**: Budget €1000

- [ ] Add expense: €1200
- [ ] Check budget status
- [ ] **Expected**: Shows "€200 over budget" with warning
- [ ] Go to next month (manually trigger rollover)
- [ ] **Expected**: Prompt to deduct from reserve or carry as debt
- [ ] Choose "Carry to next month"
- [ ] **Expected**: Next month shows: €800 (€1000 - €200 debt)
- [ ] **Result**: ✅ / ❌

### Test 2.3: Multiple Consecutive Negative Months
**Month 1**: Budget €1000, Spend €1200 (debt: €200)
**Month 2**: Budget €800 (after debt), Spend €900 (additional debt: €100)

- [ ] After Month 1: Carry €200 debt
- [ ] Month 2 effective budget = €800
- [ ] Add expenses totaling €900
- [ ] **Expected**: Month 2 ends with €100 over budget
- [ ] **Expected**: Total accumulated debt = €300
- [ ] **Result**: ✅ / ❌

### Test 2.4: Partial Payment
**Month 1**: Debt of €500
**Month 2**: Budget €1000, Spend €700

- [ ] Month 2 effective budget starts at €500
- [ ] Spend only €400
- [ ] **Expected**: €100 surplus
- [ ] **Expected**: Debt reduced from €500 to €400
- [ ] **Result**: ✅ / ❌

### Test 2.5: Reserve Fund Coverage
- [ ] Save €1000 to Reserve Fund
- [ ] Create debt of €200
- [ ] **Expected**: Prompt to deduct from Reserve Fund (current: €1000)
- [ ] Accept deduction
- [ ] **Expected**: Reserve Fund = €800, no debt carried forward
- [ ] **Result**: ✅ / ❌

### Test 2.6: Rounding Edge Case
- [ ] Budget: €100.50
- [ ] Spend: €75.27
- [ ] **Expected**: Rollover = €25.23 (exact)
- [ ] **Result**: ✅ / ❌

---

## 📄 3. Pagination

### Test 3.1: Basic Navigation
**Setup**: Add 25 expenses

- [ ] Pagination controls visible
- [ ] Shows "Page 1 of 2"
- [ ] Click "Next" button
- [ ] **Expected**: Page 2 of 2, previous 15 items hidden
- [ ] Click "Previous" button
- [ ] **Expected**: Back to Page 1
- [ ] **Result**: ✅ / ❌

### Test 3.2: First/Last Buttons
**Setup**: Add 50 expenses (creates 4 pages at 15 items/page)

- [ ] Click "Last" button (⏭)
- [ ] **Expected**: Jump to Page 4 of 4
- [ ] Click "First" button (⏮)
- [ ] **Expected**: Jump to Page 1 of 4
- [ ] **Result**: ✅ / ❌

### Test 3.3: Page Size Selector
- [ ] Change page size to 20
- [ ] **Expected**: Pagination recalculates (e.g., 50 items = 3 pages)
- [ ] **Expected**: Selection saved (refresh page, should still be 20)
- [ ] Change to 50
- [ ] **Expected**: All 50 items visible, no pagination
- [ ] **Result**: ✅ / ❌

### Test 3.4: Deletion on Last Page
**Setup**: 31 items (3 pages at 15/page, last page has 1 item)

- [ ] Navigate to Page 3
- [ ] Delete the only item on this page
- [ ] **Expected**: Automatically navigate to Page 2 (not broken)
- [ ] **Expected**: No JavaScript errors
- [ ] **Result**: ✅ / ❌

### Test 3.5: Smooth Scrolling
- [ ] Navigate to Page 2
- [ ] **Expected**: Page smoothly scrolls to top of expense list
- [ ] No jarring jumps
- [ ] **Result**: ✅ / ❌

---

## 🗂️ 4. Recent Expenses UI

### Test 4.1: Vertical Spacing
- [ ] Add 5 expenses
- [ ] **Expected**: Each item has comfortable spacing (~80px min height)
- [ ] Items don't feel cramped
- [ ] **Result**: ✅ / ❌

### Test 4.2: Long Notes Display
- [ ] Add expense with long description (150+ characters)
- [ ] **Expected**: Description truncated to ~2 lines with "..." indicator
- [ ] Click on note
- [ ] **Expected**: Expands to show full text
- [ ] **Result**: ✅ / ❌

### Test 4.3: Note Wrapping
- [ ] Add expense with single 50-character word (e.g., "aaaaaaaaa...")
- [ ] **Expected**: Word breaks appropriately, no horizontal overflow
- [ ] **Result**: ✅ / ❌

### Test 4.4: Mobile View
**On mobile device or narrow browser window (<768px)**

- [ ] Expense items stack vertically
- [ ] All text readable
- [ ] Actions buttons accessible
- [ ] **Result**: ✅ / ❌

---

## 💾 5. Persistence & Backups

### Test 5.1: Data Persistence
- [ ] Add 3 expenses
- [ ] Set budget to €2000
- [ ] Refresh page (F5)
- [ ] **Expected**: All 3 expenses still visible
- [ ] **Expected**: Budget still €2000
- [ ] **Result**: ✅ / ❌

### Test 5.2: Automatic Backups
- [ ] Open DevTools → Application → Local Storage
- [ ] Add an expense
- [ ] Check for `familyExpenses_backup` key
- [ ] **Expected**: Backup key exists with timestamp and data
- [ ] **Result**: ✅ / ❌

### Test 5.3: Corruption Recovery
**⚠️ Destructive test - backup data first!**

- [ ] Open DevTools → Console
- [ ] Run: `localStorage.setItem('familyExpenses', 'invalid json{')`
- [ ] Refresh page
- [ ] **Expected**: Notification about restoration from backup
- [ ] **Expected**: App still functional
- [ ] **Expected**: Expenses restored from backup
- [ ] **Result**: ✅ / ❌

### Test 5.4: Backup Export
- [ ] Go to Settings
- [ ] Click "Export Backups" button
- [ ] **Expected**: JSON file downloads
- [ ] Open JSON file
- [ ] **Expected**: Contains `timestamp`, `version`, and `data` keys
- [ ] **Result**: ✅ / ❌

### Test 5.5: Storage Quota Handling
**Difficult to test - simulate by filling localStorage**

- [ ] App should show notification if quota exceeded
- [ ] Should not lose existing data
- [ ] **Result**: ✅ / ❌ / ⏭️ Skipped

---

## ♿ 6. Accessibility

### Test 6.1: Keyboard Navigation
- [ ] Press Tab from expense amount field
- [ ] **Expected**: Focus moves to category dropdown
- [ ] Continue tabbing through all form fields
- [ ] **Expected**: Logical tab order
- [ ] **Result**: ✅ / ❌

### Test 6.2: ARIA Labels
- [ ] Use screen reader (NVDA/JAWS/VoiceOver)
- [ ] Navigate to pagination controls
- [ ] **Expected**: Announces "Pagination navigation"
- [ ] **Expected**: Buttons announce "First page", "Next page", etc.
- [ ] **Result**: ✅ / ❌ / ⏭️ Skipped (no screen reader)

### Test 6.3: Focus Management
- [ ] Navigate to page 2 via keyboard (Tab to Next, press Enter)
- [ ] **Expected**: Focus managed appropriately
- [ ] **Expected**: No lost focus
- [ ] **Result**: ✅ / ❌

---

## 🎨 7. UI & Layout

### Test 7.1: Card Hover Effects
- [ ] Hover over expense item
- [ ] **Expected**: Smooth hover animation (translateX or translateY)
- [ ] **Expected**: Shadow increases
- [ ] **Result**: ✅ / ❌

### Test 7.2: Budget Card
- [ ] View dashboard
- [ ] **Expected**: Budget card has gradient background
- [ ] Hover over budget card
- [ ] **Expected**: Card slightly lifts (transform)
- [ ] **Result**: ✅ / ❌

### Test 7.3: Typography
- [ ] Card headers (h2/h3) are clearly readable
- [ ] Body text has good line-height (1.6)
- [ ] Hierarchy is clear (sizes: h2 > h3 > p)
- [ ] **Result**: ✅ / ❌

### Test 7.4: Responsive Design
**Test at widths: 1920px, 1280px, 768px, 375px**

- [ ] 1920px (desktop): Everything visible, good use of space
- [ ] 1280px (laptop): Layout adapts well
- [ ] 768px (tablet): Cards stack if needed
- [ ] 375px (mobile): Single column, no horizontal scroll
- [ ] **Result**: ✅ / ❌

---

## 🔧 8. Existing Features (Regression Testing)

### Test 8.1: Add Expense
- [ ] Fill out form completely
- [ ] Click "Add Expense"
- [ ] **Expected**: Expense appears in list
- [ ] **Expected**: Budget updates
- [ ] **Result**: ✅ / ❌

### Test 8.2: Edit Expense
- [ ] Click Edit on an expense
- [ ] Change amount
- [ ] Click "Update Expense"
- [ ] **Expected**: Amount updated in list and budget
- [ ] **Result**: ✅ / ❌

### Test 8.3: Delete Expense
- [ ] Click Delete on an expense
- [ ] Confirm deletion
- [ ] **Expected**: Expense removed
- [ ] **Expected**: Budget recalculated
- [ ] **Result**: ✅ / ❌

### Test 8.4: Export Data
- [ ] Go to Settings → Export Data
- [ ] **Expected**: CSV or JSON downloads
- [ ] **Result**: ✅ / ❌

### Test 8.5: Import Data
- [ ] Export data first
- [ ] Clear localStorage
- [ ] Import the file
- [ ] **Expected**: Data restored
- [ ] **Result**: ✅ / ❌

### Test 8.6: Recurring Expenses
- [ ] Add a monthly recurring expense
- [ ] **Expected**: Shows in upcoming recurring
- [ ] Auto-processes on due date
- [ ] **Result**: ✅ / ❌

### Test 8.7: Travel Tracker
- [ ] Create a trip
- [ ] Add travel expense
- [ ] **Expected**: Trip tracks expenses separately
- [ ] **Result**: ✅ / ❌

### Test 8.8: Dark Mode
- [ ] Toggle dark mode
- [ ] **Expected**: Theme switches
- [ ] **Expected**: All elements readable
- [ ] **Result**: ✅ / ❌

---

## 📊 Test Results Summary

| Category | Pass | Fail | Skipped | Total |
|----------|------|------|---------|-------|
| Monetary Calculations | __ | __ | __ | 4 |
| Rollover Logic | __ | __ | __ | 6 |
| Pagination | __ | __ | __ | 5 |
| Recent Expenses UI | __ | __ | __ | 4 |
| Persistence & Backups | __ | __ | __ | 5 |
| Accessibility | __ | __ | __ | 3 |
| UI & Layout | __ | __ | __ | 4 |
| Regression Tests | __ | __ | __ | 8 |
| **TOTAL** | __ | __ | __ | **39** |

---

## 🐛 Issues Found

| Test # | Issue Description | Severity | Status |
|--------|-------------------|----------|--------|
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

**Severity**: 🔴 Critical / 🟡 High / 🟠 Medium / 🟢 Low

---

## ✅ Sign-off

**Tester Name**: ___________________  
**Date**: ___________________  
**Overall Status**: ✅ Pass / ❌ Fail / ⚠️ Pass with issues  
**Ready for Production**: ☐ Yes / ☐ No / ☐ With fixes

**Notes**:
```
_____________________________________________________
_____________________________________________________
_____________________________________________________
```

---

## 📞 Report Issues

If tests fail:
1. Note the browser/device in Issues Found table
2. Check browser console for errors
3. Attempt rollback if critical issues found
4. Create GitHub issue with details

**Automated Test Command**:
```bash
npm test && npx cypress run
```
