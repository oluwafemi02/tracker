/**
 * Unit Tests for Expense Tracker - Monetary Calculations and Rollover Logic
 * Run with: npm test or jest
 */

describe('Monetary Calculation Utilities', () => {
    // Mock roundToCurrency function
    function roundToCurrency(amount, decimals = 2) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.warn('roundToCurrency received non-number:', amount);
            return 0;
        }
        const multiplier = Math.pow(10, decimals);
        return Math.round((amount + Number.EPSILON) * multiplier) / multiplier;
    }

    function addCurrency(...amounts) {
        const sum = amounts.reduce((total, amt) => {
            const num = typeof amt === 'number' ? amt : parseFloat(amt) || 0;
            return total + num;
        }, 0);
        return roundToCurrency(sum);
    }

    function subtractCurrency(a, b) {
        const numA = typeof a === 'number' ? a : parseFloat(a) || 0;
        const numB = typeof b === 'number' ? b : parseFloat(b) || 0;
        return roundToCurrency(numA - numB);
    }

    function multiplyCurrency(amount, multiplier) {
        const numA = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
        const numM = typeof multiplier === 'number' ? multiplier : parseFloat(multiplier) || 0;
        return roundToCurrency(numA * numM);
    }

    describe('roundToCurrency()', () => {
        test('rounds to 2 decimal places by default', () => {
            expect(roundToCurrency(10.555)).toBe(10.56);
            expect(roundToCurrency(10.554)).toBe(10.55);
        });

        test('handles floating point precision errors', () => {
            expect(roundToCurrency(0.1 + 0.2)).toBe(0.3);
            expect(roundToCurrency(0.07 * 100)).toBe(7);
        });

        test('handles negative numbers correctly', () => {
            expect(roundToCurrency(-10.555)).toBe(-10.56);
            expect(roundToCurrency(-0.1 - 0.2)).toBe(-0.3);
        });

        test('returns 0 for invalid inputs', () => {
            expect(roundToCurrency(NaN)).toBe(0);
            expect(roundToCurrency(undefined)).toBe(0);
            expect(roundToCurrency(null)).toBe(0);
        });

        test('handles very large numbers', () => {
            expect(roundToCurrency(999999.999)).toBe(1000000);
            expect(roundToCurrency(123456.789)).toBe(123456.79);
        });
    });

    describe('addCurrency()', () => {
        test('adds two positive amounts correctly', () => {
            expect(addCurrency(10.50, 20.75)).toBe(31.25);
        });

        test('handles floating point addition errors', () => {
            expect(addCurrency(0.1, 0.2)).toBe(0.3);
            expect(addCurrency(1.005, 2.005)).toBe(3.01);
        });

        test('adds multiple amounts', () => {
            expect(addCurrency(10, 20, 30, 40)).toBe(100);
            expect(addCurrency(1.11, 2.22, 3.33)).toBe(6.66);
        });

        test('handles negative amounts', () => {
            expect(addCurrency(100, -50)).toBe(50);
            expect(addCurrency(-10, -20)).toBe(-30);
        });

        test('ignores non-numeric values', () => {
            expect(addCurrency(10, 'invalid', 20)).toBe(30);
            expect(addCurrency(10, null, undefined, 20)).toBe(30);
        });
    });

    describe('subtractCurrency()', () => {
        test('subtracts amounts correctly', () => {
            expect(subtractCurrency(100, 50)).toBe(50);
            expect(subtractCurrency(10.75, 5.25)).toBe(5.50);
        });

        test('handles floating point subtraction errors', () => {
            expect(subtractCurrency(0.3, 0.1)).toBe(0.2);
        });

        test('handles negative results', () => {
            expect(subtractCurrency(50, 100)).toBe(-50);
            expect(subtractCurrency(0, 25.50)).toBe(-25.50);
        });
    });

    describe('multiplyCurrency()', () => {
        test('multiplies amounts correctly', () => {
            expect(multiplyCurrency(10, 2)).toBe(20);
            expect(multiplyCurrency(5.50, 3)).toBe(16.50);
        });

        test('handles decimal multipliers', () => {
            expect(multiplyCurrency(100, 0.1)).toBe(10);
            expect(multiplyCurrency(7.50, 1.5)).toBe(11.25);
        });

        test('handles floating point multiplication errors', () => {
            expect(multiplyCurrency(0.07, 100)).toBe(7);
        });
    });
});

describe('Rollover Logic', () => {
    // Mock functions for testing
    function calculateBalance(budget, expenses) {
        const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        return roundToCurrency(budget - total);
    }

    function roundToCurrency(amount, decimals = 2) {
        if (typeof amount !== 'number' || isNaN(amount)) return 0;
        const multiplier = Math.pow(10, decimals);
        return Math.round((amount + Number.EPSILON) * multiplier) / multiplier;
    }

    describe('Positive Balance Rollover', () => {
        test('calculates positive balance correctly', () => {
            const budget = 1000;
            const expenses = [
                { amount: 200 },
                { amount: 300 },
                { amount: 150 }
            ];
            const balance = calculateBalance(budget, expenses);
            expect(balance).toBe(350);
        });

        test('handles exact budget match', () => {
            const budget = 1000;
            const expenses = [{ amount: 1000 }];
            const balance = calculateBalance(budget, expenses);
            expect(balance).toBe(0);
        });
    });

    describe('Negative Balance Rollover (Overspending)', () => {
        test('calculates negative balance correctly', () => {
            const budget = 1000;
            const expenses = [
                { amount: 600 },
                { amount: 500 }
            ];
            const balance = calculateBalance(budget, expenses);
            expect(balance).toBe(-100);
        });

        test('handles large overspending', () => {
            const budget = 500;
            const expenses = [{ amount: 1250.75 }];
            const balance = calculateBalance(budget, expenses);
            expect(balance).toBe(-750.75);
        });

        test('multiple consecutive negative months accumulate correctly', () => {
            // Scenario: Month 1 overspend
            let budget = 1000;
            let expenses1 = [{ amount: 1200 }];
            let balance1 = calculateBalance(budget, expenses1);
            expect(balance1).toBe(-200);

            // Month 2: Next month's budget reduced by debt
            let effectiveBudget2 = budget - Math.abs(balance1);
            expect(effectiveBudget2).toBe(800);
            
            let expenses2 = [{ amount: 900 }];
            let balance2 = calculateBalance(effectiveBudget2, expenses2);
            expect(balance2).toBe(-100);

            // Month 3: Accumulated debt
            let totalDebt = Math.abs(balance1) + Math.abs(balance2);
            expect(totalDebt).toBe(300);
        });
    });

    describe('Partial Payment Scenarios', () => {
        test('handles partial debt payment in next month', () => {
            // Month 1: Overspend by 200
            const budget = 1000;
            const expenses1 = [{ amount: 1200 }];
            const debt = Math.abs(calculateBalance(budget, expenses1));
            expect(debt).toBe(200);

            // Month 2: Under budget, can partially pay debt
            const expenses2 = [{ amount: 700 }];
            const balance2 = calculateBalance(budget, expenses2);
            expect(balance2).toBe(300);
            
            // Apply surplus to debt
            const remainingDebt = Math.max(0, debt - balance2);
            expect(remainingDebt).toBe(0); // Debt fully paid
        });

        test('handles insufficient funds to clear debt', () => {
            // Month 1: Overspend by 500
            const budget = 1000;
            const expenses1 = [{ amount: 1500 }];
            const debt = Math.abs(calculateBalance(budget, expenses1));
            expect(debt).toBe(500);

            // Month 2: Only 200 surplus
            const expenses2 = [{ amount: 800 }];
            const balance2 = calculateBalance(budget, expenses2);
            expect(balance2).toBe(200);
            
            // Apply surplus to debt
            const remainingDebt = debt - balance2;
            expect(remainingDebt).toBe(300); // Still 300 debt remaining
        });
    });

    describe('Rounding Edge Cases', () => {
        test('handles cents correctly in rollover calculations', () => {
            const budget = 100.50;
            const expenses = [{ amount: 75.27 }];
            const balance = calculateBalance(budget, expenses);
            expect(balance).toBe(25.23);
        });

        test('handles multiple small amounts without accumulation errors', () => {
            const budget = 100;
            const expenses = [
                { amount: 10.01 },
                { amount: 10.02 },
                { amount: 10.03 },
                { amount: 10.04 },
                { amount: 10.05 },
                { amount: 10.06 },
                { amount: 10.07 },
                { amount: 10.08 },
                { amount: 10.09 },
                { amount: 9.55 }
            ];
            const balance = calculateBalance(budget, expenses);
            expect(balance).toBe(0); // Should be exactly 0
        });

        test('rounds final balance to 2 decimals', () => {
            const budget = 100;
            const expenses = [
                { amount: 33.333 },
                { amount: 33.333 },
                { amount: 33.333 }
            ];
            const total = roundToCurrency(expenses.reduce((sum, e) => sum + e.amount, 0));
            const balance = roundToCurrency(budget - total);
            expect(balance).toBe(0.00);
        });
    });

    describe('Reserve Fund Integration', () => {
        test('deducts overspending from reserve fund', () => {
            const reserveFund = 500;
            const debt = 200;
            const newReserve = roundToCurrency(reserveFund - debt);
            expect(newReserve).toBe(300);
        });

        test('handles insufficient reserve fund', () => {
            const reserveFund = 100;
            const debt = 200;
            const canCover = reserveFund >= debt;
            expect(canCover).toBe(false);
        });

        test('accumulates positive balances to reserve', () => {
            let reserveFund = 0;
            reserveFund = roundToCurrency(reserveFund + 150);
            reserveFund = roundToCurrency(reserveFund + 200);
            reserveFund = roundToCurrency(reserveFund + 75.50);
            expect(reserveFund).toBe(425.50);
        });
    });
});

describe('Budget Projections and Calculations', () => {
    function roundToCurrency(amount) {
        const multiplier = Math.pow(10, 2);
        return Math.round((amount + Number.EPSILON) * multiplier) / multiplier;
    }

    test('calculates monthly average correctly', () => {
        const expenses = [100, 200, 150, 250, 300];
        const average = roundToCurrency(expenses.reduce((a, b) => a + b, 0) / expenses.length);
        expect(average).toBe(200);
    });

    test('projects month-end spending', () => {
        const daysElapsed = 10;
        const daysInMonth = 30;
        const currentSpent = 333.33;
        const dailyAverage = currentSpent / daysElapsed;
        const projected = roundToCurrency(dailyAverage * daysInMonth);
        expect(projected).toBe(1000);
    });

    test('calculates budget utilization percentage', () => {
        const budget = 1000;
        const spent = 750;
        const percentage = roundToCurrency((spent / budget) * 100);
        expect(percentage).toBe(75);
    });
});

// Export for potential use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        roundToCurrency,
        addCurrency,
        subtractCurrency,
        multiplyCurrency
    };
}
