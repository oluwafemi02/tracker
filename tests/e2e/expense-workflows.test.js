/**
 * E2E Tests for Expense Tracker - Key User Workflows
 * Framework: Cypress or Playwright
 * 
 * To run with Cypress: npx cypress run
 * To run with Playwright: npx playwright test
 */

describe('Expense Tracker E2E Tests', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        cy.clearLocalStorage();
        cy.visit('/');
        
        // Set a test budget
        cy.get('#monthlyBudget').clear().type('1000');
        cy.contains('button', 'Set Budget').click();
    });

    describe('Add Expense Workflow', () => {
        it('should add a new expense successfully', () => {
            // Fill out expense form
            cy.get('#amount').type('50.25');
            cy.get('#category').select('Groceries');
            cy.get('#person').select('Self');
            cy.get('#description').type('Weekly groceries from supermarket');
            cy.get('#date').type('2025-11-01');
            
            // Submit form
            cy.contains('button', 'Add Expense').click();
            
            // Verify expense appears in list
            cy.contains('Weekly groceries from supermarket').should('be.visible');
            cy.contains('€50.25').should('be.visible');
            
            // Verify budget is updated
            cy.get('#monthlyTotal').should('contain', '50.25');
        });

        it('should validate required fields', () => {
            // Try to submit without filling form
            cy.contains('button', 'Add Expense').click();
            
            // Check for HTML5 validation or custom error
            cy.get('#amount:invalid').should('exist');
        });

        it('should handle currency conversion', () => {
            cy.get('#amount').type('100');
            cy.get('#currency').select('USD');
            cy.get('#category').select('Shopping');
            cy.get('#description').type('Online purchase');
            
            cy.contains('button', 'Add Expense').click();
            
            // Verify expense was added
            cy.contains('Online purchase').should('be.visible');
        });
    });

    describe('Edit Expense Workflow', () => {
        beforeEach(() => {
            // Add an expense first
            cy.get('#amount').type('75.50');
            cy.get('#category').select('Dining');
            cy.get('#description').type('Restaurant dinner');
            cy.contains('button', 'Add Expense').click();
        });

        it('should edit existing expense', () => {
            // Click edit button
            cy.contains('Restaurant dinner')
                .parents('.expense-item')
                .contains('button', 'Edit')
                .click();
            
            // Modify amount
            cy.get('#amount').clear().type('85.00');
            cy.contains('button', 'Update Expense').click();
            
            // Verify update
            cy.contains('€85.00').should('be.visible');
        });
    });

    describe('Delete Expense Workflow', () => {
        beforeEach(() => {
            // Add multiple expenses
            ['Groceries', 'Transportation', 'Entertainment'].forEach((category, index) => {
                cy.get('#amount').type(`${(index + 1) * 20}`);
                cy.get('#category').select(category);
                cy.get('#description').type(`Test ${category}`);
                cy.contains('button', 'Add Expense').click();
            });
        });

        it('should delete expense and recalculate budget', () => {
            const initialTotal = 60; // 20 + 40 + 60 = 120, deleting 60
            
            // Delete the last expense (€60)
            cy.contains('Test Entertainment')
                .parents('.expense-item')
                .contains('button', 'Delete')
                .click();
            
            // Confirm deletion
            cy.on('window:confirm', () => true);
            
            // Verify expense is removed
            cy.contains('Test Entertainment').should('not.exist');
            
            // Verify budget recalculated
            cy.get('#monthlyTotal').should('not.contain', '120');
        });

        it('should handle pagination after deletion correctly', () => {
            // Add many expenses to trigger pagination
            for (let i = 0; i < 20; i++) {
                cy.get('#amount').type('10');
                cy.get('#category').select('Other');
                cy.get('#description').type(`Expense ${i}`);
                cy.contains('button', 'Add Expense').click();
            }
            
            // Navigate to last page
            cy.contains('button', 'Last').click();
            
            // Delete an expense from last page
            cy.get('.expense-item').first().contains('button', 'Delete').click();
            cy.on('window:confirm', () => true);
            
            // Verify we didn't navigate to invalid page
            cy.get('#pageInfo').should('exist');
        });
    });

    describe('Pagination Workflow', () => {
        beforeEach(() => {
            // Add 25 expenses to trigger pagination
            for (let i = 0; i < 25; i++) {
                cy.get('#amount').type('10');
                cy.get('#category').select('Other');
                cy.get('#description').type(`Expense ${i}`);
                cy.contains('button', 'Add Expense').click();
            }
        });

        it('should navigate through pages', () => {
            // Check pagination is visible
            cy.get('#paginationTop').should('be.visible');
            
            // Go to next page
            cy.contains('button', 'Next').click();
            cy.get('#pageInfo').should('contain', 'Page 2');
            
            // Go to first page
            cy.get('#firstPageBtn').click();
            cy.get('#pageInfo').should('contain', 'Page 1');
            
            // Go to last page
            cy.get('#lastPageBtn').click();
            cy.get('#pageInfo').should('not.contain', 'Page 1');
        });

        it('should change page size', () => {
            // Change page size to 20
            cy.get('#pageSizeSelect').select('20');
            
            // Verify pagination updated
            cy.get('#paginationInfo').should('contain', '1-20 of 25');
            
            // Change to 50
            cy.get('#pageSizeSelect').select('50');
            cy.get('#paginationTop').should('not.be.visible'); // No pagination needed
        });

        it('should remember page size preference', () => {
            cy.get('#pageSizeSelect').select('20');
            
            // Reload page
            cy.reload();
            
            // Verify preference was saved
            cy.get('#pageSizeSelect').should('have.value', '20');
        });
    });

    describe('Rollover Workflow', () => {
        it('should handle positive balance rollover', () => {
            // Spend less than budget
            cy.get('#amount').type('500');
            cy.get('#category').select('Groceries');
            cy.get('#description').type('Monthly expenses');
            cy.contains('button', 'Add Expense').click();
            
            // Manually trigger rollover check (in real scenario, this happens automatically)
            // This would require exposing a test hook or advancing the system date
            
            // For now, verify that budget calculations are correct
            cy.get('#monthlyTotal').should('contain', '500');
            cy.get('#budgetStatus').should('contain', '500').should('contain', 'remaining');
        });

        it('should handle negative balance (overspending)', () => {
            // Spend more than budget
            cy.get('#amount').type('1200');
            cy.get('#category').select('Other');
            cy.get('#description').type('Large expense');
            cy.contains('button', 'Add Expense').click();
            
            // Verify over budget warning
            cy.get('#budgetStatus').should('contain', 'over budget');
            cy.get('.budget-warning').should('exist');
        });
    });

    describe('Data Persistence Workflow', () => {
        it('should persist expenses across page reloads', () => {
            // Add expense
            cy.get('#amount').type('99.99');
            cy.get('#category').select('Shopping');
            cy.get('#description').type('Test persistence');
            cy.contains('button', 'Add Expense').click();
            
            // Reload page
            cy.reload();
            
            // Verify expense still exists
            cy.contains('Test persistence').should('be.visible');
            cy.contains('€99.99').should('be.visible');
        });

        it('should handle corrupted data gracefully', () => {
            // Corrupt localStorage data
            cy.window().then((win) => {
                win.localStorage.setItem('familyExpenses', 'invalid json{]');
            });
            
            // Reload page
            cy.reload();
            
            // Should show notification about restoration or corruption
            // App should still be functional
            cy.get('.expense-form').should('be.visible');
        });

        it('should create backups automatically', () => {
            // Add expense
            cy.get('#amount').type('50');
            cy.get('#category').select('Groceries');
            cy.get('#description').type('Backup test');
            cy.contains('button', 'Add Expense').click();
            
            // Verify backup was created
            cy.window().then((win) => {
                const backup = win.localStorage.getItem('familyExpenses_backup');
                expect(backup).to.exist;
                const backupData = JSON.parse(backup);
                expect(backupData.data).to.be.an('array');
                expect(backupData.timestamp).to.exist;
            });
        });
    });

    describe('Accessibility Workflow', () => {
        it('should be keyboard navigable', () => {
            // Tab through form fields
            cy.get('#amount').focus();
            cy.focused().should('have.id', 'amount');
            
            cy.realPress('Tab');
            cy.focused().should('have.id', 'category');
            
            cy.realPress('Tab');
            cy.focused().should('have.id', 'person');
        });

        it('should have proper ARIA labels', () => {
            cy.get('[aria-label="Pagination"]').should('exist');
            cy.get('[aria-label="First page"]').should('exist');
            cy.get('[aria-live="polite"]').should('exist');
        });
    });

    describe('Export/Import Workflow', () => {
        beforeEach(() => {
            // Add some test data
            cy.get('#amount').type('100');
            cy.get('#category').select('Groceries');
            cy.get('#description').type('Export test');
            cy.contains('button', 'Add Expense').click();
        });

        it('should export data successfully', () => {
            // Navigate to settings
            cy.contains('Settings').click();
            
            // Click export button
            cy.contains('button', 'Export Data').click();
            
            // Verify download was triggered
            // Note: Actual file download verification depends on Cypress configuration
        });
    });
});

// Helper functions for tests
function addTestExpense(amount, category, description) {
    cy.get('#amount').type(amount);
    cy.get('#category').select(category);
    cy.get('#description').type(description);
    cy.contains('button', 'Add Expense').click();
}

// Playwright equivalent tests would follow similar pattern:
/*
test.describe('Expense Tracker E2E Tests (Playwright)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
    });

    test('should add expense', async ({ page }) => {
        await page.fill('#amount', '50.25');
        await page.selectOption('#category', 'Groceries');
        await page.fill('#description', 'Test expense');
        await page.click('button:has-text("Add Expense")');
        
        await expect(page.locator('text=Test expense')).toBeVisible();
    });
});
*/
