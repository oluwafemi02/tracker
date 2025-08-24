// Configuration File for Expense Tracker PWA
// Centralized configuration for easy management

const CONFIG = {
    // Environment
    ENV: window.location.hostname === 'localhost' ? 'development' : 'production',
    
    // App Info
    APP_NAME: 'ExpenseTracker Pro',
    APP_VERSION: '2.2.0',
    
    // Feature Flags
    FEATURES: {
        ANALYTICS_ENABLED: true,
        ERROR_LOGGING_ENABLED: true,
        CONSOLE_LOGS_ENABLED: window.location.hostname === 'localhost',
        DEMO_MODE_ENABLED: true,
        PAYMENT_TEST_MODE: true
    },
    
    // API Endpoints (when ready)
    API: {
        BASE_URL: window.location.hostname === 'localhost' 
            ? 'http://localhost:3000/api' 
            : 'https://api.expensetracker.com',
        TIMEOUT: 30000 // 30 seconds
    },
    
    // Storage Keys
    STORAGE_KEYS: {
        EXPENSES: 'familyExpenses',
        BUDGET: 'monthlyBudget',
        RECURRING: 'recurringExpenses',
        CUSTOM_CATEGORIES: 'customCategories',
        PREMIUM_LICENSE: 'premium_license',
        SUBSCRIPTION_DATA: 'subscription_data',
        ANALYTICS_EVENTS: 'analytics_events',
        ERROR_LOGS: 'error_logs',
        EMAIL_SUBSCRIBERS: 'email_subscribers'
    },
    
    // Limits
    LIMITS: {
        FREE: {
            MAX_PROJECTS: 1,
            MAX_CUSTOM_CATEGORIES: 5,
            MAX_RECURRING_EXPENSES: 10,
            HISTORY_DAYS: 90,
            MAX_EXPORT_ROWS: 1000
        },
        PREMIUM: {
            MAX_PROJECTS: -1, // unlimited
            MAX_CUSTOM_CATEGORIES: -1,
            MAX_RECURRING_EXPENSES: -1,
            HISTORY_DAYS: -1,
            MAX_EXPORT_ROWS: -1
        }
    },
    
    // Security
    SECURITY: {
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION: 900000, // 15 minutes
        SESSION_TIMEOUT: 3600000, // 1 hour
        ENCRYPTION_ENABLED: false // Enable when implementing
    },
    
    // Performance
    PERFORMANCE: {
        DEBOUNCE_DELAY: 300,
        THROTTLE_DELAY: 1000,
        CACHE_DURATION: 86400000, // 24 hours
        MAX_CACHE_SIZE: 50 * 1024 * 1024, // 50MB
        LAZY_LOAD_THRESHOLD: 50
    },
    
    // Third Party Services (add keys when ready)
    SERVICES: {
        GOOGLE_ANALYTICS_ID: '', // Add your GA ID
        SENTRY_DSN: '', // Add your Sentry DSN
        LEMONSQUEEZY_STORE: '', // Add your store ID
        STRIPE_PUBLIC_KEY: '', // Add your Stripe key
        FIREBASE_CONFIG: null // Add Firebase config object
    },
    
    // Development Tools
    DEV: {
        SHOW_PERFORMANCE_METRICS: window.location.hostname === 'localhost',
        ENABLE_REDUX_DEVTOOLS: false,
        LOG_ANALYTICS_EVENTS: window.location.hostname === 'localhost',
        MOCK_PAYMENT_RESPONSES: true
    }
};

// Helper functions
const isDevelopment = () => CONFIG.ENV === 'development';
const isProduction = () => CONFIG.ENV === 'production';

// Safe console wrapper
const safeConsole = {
    log: (...args) => {
        if (CONFIG.FEATURES.CONSOLE_LOGS_ENABLED) {
            console.log(...args);
        }
    },
    error: (...args) => {
        // Always log errors
        console.error(...args);
    },
    warn: (...args) => {
        if (CONFIG.FEATURES.CONSOLE_LOGS_ENABLED) {
            console.warn(...args);
        }
    },
    info: (...args) => {
        if (CONFIG.FEATURES.CONSOLE_LOGS_ENABLED) {
            console.info(...args);
        }
    }
};

// Performance monitoring
const performanceMonitor = {
    marks: new Map(),
    
    start(label) {
        if (CONFIG.DEV.SHOW_PERFORMANCE_METRICS) {
            performance.mark(`${label}-start`);
            this.marks.set(label, performance.now());
        }
    },
    
    end(label) {
        if (CONFIG.DEV.SHOW_PERFORMANCE_METRICS && this.marks.has(label)) {
            performance.mark(`${label}-end`);
            performance.measure(label, `${label}-start`, `${label}-end`);
            
            const duration = performance.now() - this.marks.get(label);
            safeConsole.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
            
            this.marks.delete(label);
        }
    }
};

// Export for use in other files
window.CONFIG = CONFIG;
window.safeConsole = safeConsole;
window.performanceMonitor = performanceMonitor;