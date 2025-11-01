/**
 * Data Validator - Comprehensive data validation and integrity checks
 * Ensures data quality and prevents corrupted data from breaking the app
 */

class DataValidator {
    constructor() {
        this.validationRules = new Map();
        this.setupDefaultRules();
    }

    setupDefaultRules() {
        // Expense validation rules
        this.addRule('expense', {
            id: { type: 'string', required: true },
            amount: { type: 'number', required: true, min: 0.01, max: 1000000 },
            category: { type: 'string', required: true, minLength: 1, maxLength: 50 },
            description: { type: 'string', required: false, maxLength: 500 },
            date: { type: 'date', required: true },
            person: { type: 'string', required: false, maxLength: 100 },
            currency: { type: 'string', required: false, pattern: /^[A-Z]{3}$/ },
            isRecurring: { type: 'boolean', required: false }
        });

        // Budget validation rules
        this.addRule('budget', {
            amount: { type: 'number', required: true, min: 1, max: 10000000 },
            currency: { type: 'string', required: true, pattern: /^[A-Z]{3}$/ },
            month: { type: 'number', required: false, min: 0, max: 11 },
            year: { type: 'number', required: false, min: 2020, max: 2100 }
        });

        // Recurring expense validation rules
        this.addRule('recurring', {
            id: { type: 'string', required: true },
            amount: { type: 'number', required: true, min: 0.01 },
            frequency: { 
                type: 'string', 
                required: true, 
                enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
            },
            startDate: { type: 'date', required: true },
            endDate: { type: 'date', required: false },
            isActive: { type: 'boolean', required: true }
        });
    }

    addRule(dataType, rules) {
        this.validationRules.set(dataType, rules);
    }

    validate(dataType, data) {
        const rules = this.validationRules.get(dataType);
        if (!rules) {
            return { valid: true, errors: [] };
        }

        const errors = [];

        for (const [field, rule] of Object.entries(rules)) {
            const value = data[field];

            // Check required fields
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push({
                    field,
                    message: `${field} is required`,
                    type: 'required'
                });
                continue;
            }

            // Skip validation if field is not required and not provided
            if (!rule.required && (value === undefined || value === null || value === '')) {
                continue;
            }

            // Type validation
            if (rule.type) {
                const typeValid = this.validateType(value, rule.type);
                if (!typeValid) {
                    errors.push({
                        field,
                        message: `${field} must be of type ${rule.type}`,
                        type: 'type',
                        expected: rule.type,
                        received: typeof value
                    });
                    continue;
                }
            }

            // Number validations
            if (rule.type === 'number') {
                if (rule.min !== undefined && value < rule.min) {
                    errors.push({
                        field,
                        message: `${field} must be at least ${rule.min}`,
                        type: 'min',
                        min: rule.min,
                        value
                    });
                }
                if (rule.max !== undefined && value > rule.max) {
                    errors.push({
                        field,
                        message: `${field} must be at most ${rule.max}`,
                        type: 'max',
                        max: rule.max,
                        value
                    });
                }
            }

            // String validations
            if (rule.type === 'string') {
                if (rule.minLength !== undefined && value.length < rule.minLength) {
                    errors.push({
                        field,
                        message: `${field} must be at least ${rule.minLength} characters`,
                        type: 'minLength',
                        minLength: rule.minLength,
                        length: value.length
                    });
                }
                if (rule.maxLength !== undefined && value.length > rule.maxLength) {
                    errors.push({
                        field,
                        message: `${field} must be at most ${rule.maxLength} characters`,
                        type: 'maxLength',
                        maxLength: rule.maxLength,
                        length: value.length
                    });
                }
                if (rule.pattern && !rule.pattern.test(value)) {
                    errors.push({
                        field,
                        message: `${field} format is invalid`,
                        type: 'pattern',
                        pattern: rule.pattern.toString()
                    });
                }
            }

            // Enum validation
            if (rule.enum && !rule.enum.includes(value)) {
                errors.push({
                    field,
                    message: `${field} must be one of: ${rule.enum.join(', ')}`,
                    type: 'enum',
                    validValues: rule.enum,
                    value
                });
            }

            // Date validation
            if (rule.type === 'date') {
                const dateValid = this.validateDate(value);
                if (!dateValid) {
                    errors.push({
                        field,
                        message: `${field} must be a valid date`,
                        type: 'date',
                        value
                    });
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            data: errors.length === 0 ? this.sanitize(dataType, data) : null
        };
    }

    validateType(value, type) {
        switch (type) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value) && isFinite(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'date':
                return this.validateDate(value);
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                return true;
        }
    }

    validateDate(value) {
        if (!value) return false;
        const date = new Date(value);
        return date instanceof Date && !isNaN(date.getTime());
    }

    sanitize(dataType, data) {
        const sanitized = { ...data };

        // Remove any unexpected fields
        const rules = this.validationRules.get(dataType);
        if (rules) {
            for (const key in sanitized) {
                if (!rules[key]) {
                    delete sanitized[key];
                }
            }
        }

        // Sanitize strings (trim, escape)
        for (const key in sanitized) {
            if (typeof sanitized[key] === 'string') {
                sanitized[key] = sanitized[key].trim();
            }
        }

        return sanitized;
    }

    // Bulk validation
    validateBulk(dataType, dataArray) {
        const results = dataArray.map((item, index) => ({
            index,
            ...this.validate(dataType, item)
        }));

        const validItems = results.filter(r => r.valid).map(r => r.data);
        const invalidItems = results.filter(r => !r.valid);

        return {
            valid: invalidItems.length === 0,
            validItems,
            invalidItems,
            totalCount: dataArray.length,
            validCount: validItems.length,
            invalidCount: invalidItems.length
        };
    }

    // Data integrity checks
    checkDataIntegrity(expenses, budget, recurringExpenses = []) {
        const issues = [];

        // Check for duplicate IDs
        const expenseIds = new Set();
        expenses.forEach((expense, index) => {
            if (expenseIds.has(expense.id)) {
                issues.push({
                    type: 'duplicate_id',
                    severity: 'high',
                    message: `Duplicate expense ID found: ${expense.id}`,
                    index
                });
            }
            expenseIds.add(expense.id);
        });

        // Check for orphaned recurring expenses
        const recurringIds = new Set(recurringExpenses.map(r => r.id));
        expenses.forEach((expense, index) => {
            if (expense.parentRecurringId && !recurringIds.has(expense.parentRecurringId)) {
                issues.push({
                    type: 'orphaned_recurring',
                    severity: 'medium',
                    message: `Expense references non-existent recurring template: ${expense.parentRecurringId}`,
                    index
                });
            }
        });

        // Check for future dates
        const today = new Date();
        expenses.forEach((expense, index) => {
            const expenseDate = new Date(expense.date);
            if (expenseDate > today) {
                const daysInFuture = Math.ceil((expenseDate - today) / (1000 * 60 * 60 * 24));
                if (daysInFuture > 7) { // Only flag if more than a week in future
                    issues.push({
                        type: 'future_date',
                        severity: 'low',
                        message: `Expense date is ${daysInFuture} days in the future`,
                        index
                    });
                }
            }
        });

        // Check for very old expenses (potential data corruption)
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        expenses.forEach((expense, index) => {
            const expenseDate = new Date(expense.date);
            if (expenseDate < twoYearsAgo) {
                issues.push({
                    type: 'very_old_expense',
                    severity: 'low',
                    message: `Expense is more than 2 years old: ${expense.date}`,
                    index
                });
            }
        });

        // Check for suspicious amounts
        expenses.forEach((expense, index) => {
            if (expense.amount > 50000) {
                issues.push({
                    type: 'large_amount',
                    severity: 'medium',
                    message: `Unusually large expense amount: ${expense.amount}`,
                    index
                });
            }
            if (expense.amount < 0) {
                issues.push({
                    type: 'negative_amount',
                    severity: 'high',
                    message: `Negative expense amount found: ${expense.amount}`,
                    index
                });
            }
        });

        // Check for invalid currency conversions
        expenses.forEach((expense, index) => {
            if (expense.convertedAmount && expense.exchangeRate) {
                const expected = expense.amount * expense.exchangeRate;
                const diff = Math.abs(expected - expense.convertedAmount);
                if (diff > 0.01) { // Allow for small rounding errors
                    issues.push({
                        type: 'invalid_conversion',
                        severity: 'medium',
                        message: `Currency conversion mismatch`,
                        index,
                        expected,
                        actual: expense.convertedAmount
                    });
                }
            }
        });

        return {
            hasIssues: issues.length > 0,
            issues,
            highSeverity: issues.filter(i => i.severity === 'high').length,
            mediumSeverity: issues.filter(i => i.severity === 'medium').length,
            lowSeverity: issues.filter(i => i.severity === 'low').length
        };
    }

    // Attempt to fix common data issues
    repairData(expenses) {
        const repaired = expenses.map((expense, index) => {
            const fixed = { ...expense };
            const repairs = [];

            // Fix negative amounts
            if (fixed.amount < 0) {
                fixed.amount = Math.abs(fixed.amount);
                repairs.push('fixed_negative_amount');
            }

            // Fix missing required fields with defaults
            if (!fixed.id) {
                fixed.id = `expense_${Date.now()}_${index}`;
                repairs.push('generated_id');
            }

            if (!fixed.category) {
                fixed.category = 'Other';
                repairs.push('default_category');
            }

            if (!fixed.date) {
                fixed.date = new Date().toISOString().split('T')[0];
                repairs.push('default_date');
            }

            // Trim strings
            if (typeof fixed.description === 'string') {
                fixed.description = fixed.description.trim();
            }
            if (typeof fixed.category === 'string') {
                fixed.category = fixed.category.trim();
            }

            return {
                original: expense,
                repaired: fixed,
                repairs,
                wasRepaired: repairs.length > 0
            };
        });

        return {
            repaired: repaired.map(r => r.repaired),
            repairedCount: repaired.filter(r => r.wasRepaired).length,
            details: repaired.filter(r => r.wasRepaired)
        };
    }
}

// Create global instance
window.dataValidator = new DataValidator();
