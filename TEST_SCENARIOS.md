# 🧪 Comprehensive Test Scenarios
## Expense Tracker PWA - Critical Path Testing

**Version:** 2.0  
**Date:** 2025-11-01  
**Test Coverage:** Core functionality, Edge cases, Performance, Data integrity

---

## 1. EXPENSE MANAGEMENT TESTS

### 1.1 Add Expense - Happy Path
```
GIVEN user is on the main expense tab
WHEN user fills out expense form:
  - Amount: $50.00
  - Category: Groceries
  - Description: Weekly shopping
  - Date: Today
AND clicks "Add Expense"
THEN expense should be added to list
AND total should update immediately
AND notification "Expense added successfully" should appear
```

### 1.2 Add Expense - Validation Tests
```
Test Case 1: Negative Amount
INPUT: Amount = -50
EXPECTED: Error message "Amount must be positive"
STATUS: Should prevent submission

Test Case 2: Zero Amount
INPUT: Amount = 0
EXPECTED: Error message "Amount must be greater than 0"
STATUS: Should prevent submission

Test Case 3: Very Large Amount (>$10,000)
INPUT: Amount = 50000
EXPECTED: Warning modal "Large amount detected. Confirm?"
STATUS: Should show confirmation before saving

Test Case 4: Missing Category
INPUT: Amount = 50, Category = ""
EXPECTED: Error "Category is required"
STATUS: Should prevent submission

Test Case 5: Future Date (>7 days)
INPUT: Date = 30 days from now
EXPECTED: Warning "Future date detected. Continue?"
STATUS: Should show confirmation

Test Case 6: Very Long Description (>500 chars)
INPUT: Description with 600 characters
EXPECTED: Truncate to 500 chars or show warning
STATUS: Should enforce limit
```

### 1.3 Edit Expense
```
GIVEN expense exists in list
WHEN user clicks expense item
AND modal opens with pre-filled data
AND user changes amount from $50 to $75
AND clicks "Save"
THEN expense should be updated in list
AND total should reflect new amount
AND pagination should maintain current page
AND notification "Expense updated" should appear
```

### 1.4 Delete Expense
```
Test Case 1: Delete Regular Expense
GIVEN regular expense exists
WHEN user clicks delete button
THEN modern modal should appear (NOT native confirm)
AND modal should show: "Delete this expense?"
WHEN user clicks "Confirm"
THEN expense should be removed
AND total should update
AND notification "Expense deleted" should appear

Test Case 2: Delete Recurring Expense
GIVEN recurring expense exists
WHEN user clicks delete
THEN modal should offer options:
  - Delete only this occurrence
  - Delete all future occurrences
WHEN user selects option
THEN appropriate expenses should be deleted
```

---

## 2. BUDGET MANAGEMENT TESTS

### 2.1 Set Monthly Budget
```
GIVEN user is on settings tab
WHEN user enters budget amount: $2000
AND clicks "Save Budget"
THEN budget should be saved
AND dashboard should show budget progress
AND notifications should be based on new budget
```

### 2.2 Budget Adherence Tracking
```
Test Case 1: Under Budget (Good)
GIVEN budget = $2000
AND total expenses = $1500 (75%)
THEN progress bar should show green
AND message "Within budget"

Test Case 2: Near Budget Limit (Warning)
GIVEN budget = $2000
AND total expenses = $1900 (95%)
THEN progress bar should show yellow
AND warning notification should appear

Test Case 3: Over Budget (Critical)
GIVEN budget = $2000
AND total expenses = $2500 (125%)
THEN progress bar should show red
AND notification "Over budget by $500"
```

---

## 3. RECURRING EXPENSES TESTS

### 3.1 Create Recurring Expense
```
GIVEN user enables "Recurring" checkbox
AND selects frequency: "Monthly"
AND sets amount: $500
AND category: "Rent"
AND start date: First of month
WHEN user saves
THEN recurring template should be created
AND first occurrence should be added to expenses
AND badge should show "🔄 Monthly"
```

### 3.2 Auto-Processing Recurring Expenses
```
GIVEN recurring expense: $100 weekly from 2 weeks ago
WHEN user opens app
THEN system should auto-process missed occurrences
AND add 2 expenses (one for each week)
AND notification "2 recurring expenses added"
```

### 3.3 Recurring Calculation Accuracy
```
Test Case 1: Daily Recurring
Frequency: Daily
Amount: $5
Month: 30 days
EXPECTED: 30 occurrences = $150

Test Case 2: Weekly Recurring (mid-month start)
Frequency: Weekly
Amount: $50
Start: 15th of month
Month days remaining: 16
EXPECTED: 2 occurrences = $100

Test Case 3: Monthly Recurring
Frequency: Monthly
Amount: $500
EXPECTED: 1 occurrence = $500

Test Case 4: Biweekly Recurring
Frequency: Biweekly
Amount: $1000
Month: 30 days
EXPECTED: 2 occurrences = $2000
```

---

## 4. ROLLOVER & RESERVE FUND TESTS

### 4.1 Month Rollover - Surplus
```
GIVEN previous month:
  Budget: $2000
  Spent: $1500
  Surplus: $500
WHEN new month begins
THEN rollover modal should appear
AND show options:
  ✓ Add to Reserve Fund
  ✓ Rollover to this month
  ✓ Split 50/50
  ✓ Don't carry over
WHEN user selects "Add to Reserve Fund"
THEN reserve fund increases by $500
AND history is recorded
```

### 4.2 Month Rollover - Deficit
```
GIVEN previous month:
  Budget: $2000
  Spent: $2300
  Deficit: -$300
AND reserve fund: $1000
WHEN new month begins
THEN modal should appear
AND ask: "Deduct $300 from Reserve Fund?"
WHEN user confirms
THEN reserve fund = $700
AND history records deficit coverage
```

### 4.3 Month Rollover - Deficit With Insufficient Reserve
```
GIVEN previous month deficit: -$500
AND reserve fund: $200
WHEN month rollover triggers
THEN modal should show:
  "Reserve can cover $200"
  "Remaining deficit: $300"
AND user can choose to:
  - Partial coverage ($200 from reserve)
  - Ignore deficit
```

---

## 5. STORAGE & DATA INTEGRITY TESTS

### 5.1 Storage Quota Monitoring
```
Test Case 1: Normal Usage (< 80%)
WHEN storage usage < 80%
THEN no warnings
AND all saves succeed

Test Case 2: High Usage (80-95%)
WHEN storage usage reaches 82%
THEN warning notification appears
AND suggests exporting data

Test Case 3: Critical Usage (>95%)
WHEN storage usage > 95%
THEN critical alert appears
AND new saves show error modal
AND auto-backup to sessionStorage activated
```

### 5.2 Transaction-Safe Saves
```
GIVEN expenses array in localStorage
WHEN user saves new expense
BUT localStorage.setItem() fails (quota exceeded)
THEN rollback should occur
AND old data remains intact
AND user sees error: "Save failed - data preserved"
AND automatic retry or export suggestion
```

### 5.3 Data Corruption Recovery
```
GIVEN corrupted expense in array:
  - Missing ID
  - Negative amount
  - Invalid date
WHEN app loads
THEN data validator should detect issues
AND attempt auto-repair:
  - Generate missing IDs
  - Fix negative amounts
  - Set default dates
AND log repairs to console (dev mode)
AND show summary modal to user
```

### 5.4 Backup System
```
GIVEN user triggers destructive operation (clear all data)
WHEN confirmation modal appears
AND user confirms
THEN automatic backup created in sessionStorage
AND backup key: "full_backup_[timestamp]"
AND backup persists until browser closed
AND user can restore if needed
```

---

## 6. MODAL SYSTEM TESTS

### 6.1 Replace All confirm() Dialogs
```
Test all 21 instances:

✓ Delete expense confirmation
✓ Clear all data confirmation
✓ Large amount warning
✓ Future date warning
✓ Recurring delete options
✓ Rollover decisions
✓ Category deletion
✓ Stop recurring expense
✓ Clear exchange rates
✓ Skip onboarding guide
✓ Import data (overwrite warning)
✓ QR code import
✓ Shared link import
✓ Clear cache
✓ Delete trip
✓ Delete travel expense
✓ Demo license activation
✓ Over-budget deduction
✓ Import file confirmation
✓ Transaction verification
✓ Sync conflict resolution

EXPECTED: All should use modalManager.confirm()
NOT: Native confirm() or alert()
```

### 6.2 Modal Accessibility
```
Test Case 1: Keyboard Navigation
- Tab through modal buttons
- Focus should be trapped in modal
- ESC key closes modal
- Enter key confirms

Test Case 2: Screen Reader
- Modal should have role="dialog"
- aria-modal="true"
- aria-labelledby pointing to title

Test Case 3: Mobile Usability
- Buttons should be large enough (44px min)
- Full-width buttons on mobile
- No accidental dismissal
```

---

## 7. SEARCH & FILTER TESTS

### 7.1 Search Functionality
```
Test Case 1: Basic Search
INPUT: "grocery"
EXPECTED: All expenses with "grocery" in category or description
RESPONSE TIME: < 150ms (debounced)

Test Case 2: Multi-word Search
INPUT: "weekly shopping"
EXPECTED: Expenses matching both terms
USING: Search index for performance

Test Case 3: Special Characters
INPUT: "rent $500"
EXPECTED: Should handle $ and numbers safely
NO: XSS vulnerabilities

Test Case 4: Empty Search
INPUT: ""
EXPECTED: Show all expenses
AND: Clear search highlighting
```

### 7.2 Filter Performance
```
GIVEN 1000+ expenses in array
WHEN user changes filter
THEN results should appear in < 200ms
USING: Debounced filtering
AND: Optimized array operations
AND: Virtual scrolling (if implemented)
```

---

## 8. ANALYTICS TESTS

### 8.1 Event Tracking
```
Events to verify tracking:

User Actions:
✓ expense_added (with category, amount)
✓ budget_set (with amount, change)
✓ recurring_expense (action, frequency)
✓ feature_used (feature name)
✓ search_used (result count, time)

Business Metrics:
✓ budget_adherence (%, status)
✓ category_spending (category, %)
✓ rollover_decision (type, amount)
✓ data_export (format, count)

Performance:
✓ page_performance (load time)
✓ render_performance (duration)
✓ api_call (method, duration, status)
```

### 8.2 Session Tracking
```
WHEN user opens app
THEN track: session_start

WHEN user interacts
THEN track: all actions with timestamps

WHEN user closes/backgrounds
THEN track: session_end
AND: Save session summary
AND: Calculate engagement score
```

---

## 9. PERFORMANCE TESTS

### 9.1 Large Dataset Performance
```
Test Setup:
- Create 1000 expenses
- Budget: $50,000
- 50 recurring expenses
- 20 categories

Test Metrics:
✓ Initial load: < 2 seconds
✓ Add expense: < 100ms
✓ Search: < 150ms
✓ Filter: < 200ms
✓ Dashboard update: < 300ms
✓ Render list: < 500ms

Expected Optimizations:
- Virtual scrolling for large lists
- Debounced search/filter
- Memoized calculations
- Batched DOM updates
```

### 9.2 Memory Leak Tests
```
Test Process:
1. Open app
2. Add 100 expenses
3. Delete all expenses
4. Repeat 10 times
5. Check memory usage

EXPECTED: Memory should stabilize
NOT: Continuous growth
CHECK: Event listeners cleaned up
CHECK: Timers/intervals cleared
```

---

## 10. EDGE CASES & ERROR SCENARIOS

### 10.1 Network Issues
```
Test Case 1: Offline Mode
GIVEN: Device is offline
WHEN: User adds expense
THEN: Should save to localStorage
AND: Show "Saved locally" notification
AND: No errors

Test Case 2: Slow Connection
GIVEN: 3G connection
WHEN: Loading app
THEN: Service worker serves cached version
AND: App is fully functional
```

### 10.2 Browser Compatibility
```
Test Browsers:
✓ Chrome 90+ (Desktop & Mobile)
✓ Firefox 88+
✓ Safari 14+ (Desktop & iOS)
✓ Edge 90+
✓ Samsung Internet

Features to verify:
- localStorage support
- Service Worker
- IndexedDB (future)
- Notifications API
- CSS Grid/Flexbox
```

### 10.3 Data Migration
```
Test Case: Old Data Format
GIVEN: User has data from v1.0
WHEN: App loads v2.0
THEN: Data migration should run
AND: Old format converted to new
AND: No data loss
AND: Backup of old format created
```

---

## 11. SECURITY TESTS

### 11.1 XSS Prevention
```
Test Case 1: Malicious Description
INPUT: Description = "<script>alert('xss')</script>"
EXPECTED: Should be escaped/sanitized
DISPLAY: Actual text, not executed

Test Case 2: SQL Injection Attempt (localStorage)
INPUT: Description = "'; DROP TABLE expenses--"
EXPECTED: Stored as plain text
NO: Code execution

Test Case 3: HTML Injection
INPUT: "<img src=x onerror=alert(1)>"
EXPECTED: Escaped properly
USING: escapeHtml() function
```

### 11.2 Data Privacy
```
✓ No console.logs in production
✓ Sensitive data redacted in logs
✓ Analytics doesn't track PII
✓ Export respects user privacy
```

---

## 12. ACCESSIBILITY TESTS

### 12.1 Keyboard Navigation
```
✓ All buttons tabbable
✓ Forms fully keyboard-accessible
✓ Modals trap focus
✓ Skip links present
✓ No keyboard traps
```

### 12.2 Screen Reader Support
```
✓ Semantic HTML used
✓ ARIA labels where needed
✓ Alt text for icons
✓ Live regions for notifications
✓ Meaningful link text
```

### 12.3 Color Contrast
```
✓ Text meets WCAG AA standards
✓ Buttons clearly visible
✓ Focus indicators strong
✓ Error messages stand out
```

---

## 13. PWA FUNCTIONALITY TESTS

### 13.1 Installation
```
WHEN user visits app
THEN install prompt should appear
WHEN user installs
THEN app icon on home screen
AND: Opens in standalone mode
AND: No browser UI visible
```

### 13.2 Offline Functionality
```
GIVEN app is installed
WHEN device goes offline
THEN app still loads
AND: All core features work
AND: "Offline" indicator shown
```

### 13.3 Updates
```
WHEN new version available
THEN notification appears
AND: User can refresh to update
AND: Data persists through update
```

---

## TEST EXECUTION CHECKLIST

### Critical Path (Must Pass)
- [ ] Add/Edit/Delete expenses
- [ ] Budget tracking accuracy
- [ ] Recurring expense calculations
- [ ] Data persistence (localStorage)
- [ ] Modal system (all 21 instances)
- [ ] Search and filter
- [ ] Rollover functionality

### Important (Should Pass)
- [ ] Performance with 100+ expenses
- [ ] Storage quota management
- [ ] Analytics tracking
- [ ] Error handling
- [ ] Data validation
- [ ] Backup/restore

### Nice to Have
- [ ] PWA installation
- [ ] Offline mode
- [ ] Accessibility features
- [ ] Browser compatibility
- [ ] Mobile responsiveness

---

## AUTOMATED TESTING RECOMMENDATIONS

### Unit Tests (Future)
```javascript
// Example test structure
describe('ExpenseManager', () => {
  test('adds expense correctly', () => {
    const expense = createExpense(50, 'Groceries');
    expect(expense.amount).toBe(50);
    expect(expense.category).toBe('Groceries');
  });

  test('validates negative amounts', () => {
    expect(() => createExpense(-50, 'Test')).toThrow();
  });
});
```

### Integration Tests (Future)
```javascript
describe('Full User Flow', () => {
  test('user can add expense and see it in list', async () => {
    // Open app
    // Fill form
    // Submit
    // Verify in list
    // Verify total updated
  });
});
```

### E2E Tests (Future - Playwright/Cypress)
```javascript
test('complete expense tracking workflow', async ({ page }) => {
  await page.goto('/');
  await page.fill('#amount', '50');
  await page.selectOption('#category', 'Groceries');
  await page.click('#addExpenseBtn');
  await expect(page.locator('.expense-item')).toContainText('Groceries');
});
```

---

**Test Status:** Ready for execution  
**Priority:** Critical path first, then important features  
**Estimated Time:** 4-6 hours for manual testing  
**Automation Recommended:** Yes, after critical fixes confirmed working
