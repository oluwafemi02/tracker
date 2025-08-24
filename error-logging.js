// Error Logging System
// Supports free local logging and premium cloud logging (Sentry)

class ErrorLogger {
    constructor() {
        this.errors = [];
        this.maxLocalErrors = 50;
        this.sentryEnabled = false;
        this.sentryDSN = null; // Will be set when premium is activated
        
        this.init();
    }

    init() {
        // Check if premium user has Sentry enabled
        if (window.premiumManager && window.premiumManager.hasFeature('errorLogging')) {
            this.initSentry();
        }
        
        // Set up error handlers
        this.setupErrorHandlers();
        
        // Load stored errors
        this.loadStoredErrors();
    }

    initSentry() {
        // Sentry initialization placeholder
        console.log('🐛 Sentry error logging would be initialized here (Premium feature)');
        
        /* Implementation placeholder:
        if (typeof Sentry !== 'undefined') {
            Sentry.init({
                dsn: this.sentryDSN,
                integrations: [
                    new Sentry.BrowserTracing(),
                ],
                tracesSampleRate: 0.1,
                environment: window.location.hostname === 'localhost' ? 'development' : 'production'
            });
            this.sentryEnabled = true;
        }
        */
    }

    setupErrorHandlers() {
        // Global error handler
        window.addEventListener('error', (event) => {
            this.logError({
                type: 'javascript_error',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error ? {
                    name: event.error.name,
                    message: event.error.message,
                    stack: event.error.stack
                } : null,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            });
        });

        // Promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            this.logError({
                type: 'unhandled_promise_rejection',
                reason: event.reason,
                promise: event.promise,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            });
        });

        // Custom error logging for specific scenarios
        this.setupCustomErrorHandlers();
    }

    setupCustomErrorHandlers() {
        // Override console.error to capture logged errors
        const originalConsoleError = console.error;
        console.error = (...args) => {
            this.logError({
                type: 'console_error',
                message: args.join(' '),
                timestamp: new Date().toISOString()
            });
            originalConsoleError.apply(console, args);
        };
    }

    logError(errorData) {
        // Add context
        errorData.context = {
            url: window.location.href,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            screen: {
                width: screen.width,
                height: screen.height
            },
            memory: performance.memory ? {
                used: Math.round(performance.memory.usedJSHeapSize / 1048576),
                total: Math.round(performance.memory.totalJSHeapSize / 1048576),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
            } : null
        };

        // Store locally
        this.errors.push(errorData);
        this.saveErrors();

        // Send to Sentry if premium
        if (this.sentryEnabled && window.Sentry) {
            this.sendToSentry(errorData);
        }

        // Log to analytics
        if (window.analytics) {
            window.analytics.trackError(errorData.message || errorData.type, errorData.type);
        }

        // Console log in development
        if (window.location.hostname === 'localhost') {
            console.log('🚨 Error logged:', errorData);
        }
    }

    sendToSentry(errorData) {
        // Premium Sentry integration
        /* Implementation placeholder:
        if (window.Sentry) {
            Sentry.captureException(new Error(errorData.message), {
                extra: errorData
            });
        }
        */
    }

    saveErrors() {
        // Keep only recent errors
        if (this.errors.length > this.maxLocalErrors) {
            this.errors = this.errors.slice(-this.maxLocalErrors);
        }

        try {
            localStorage.setItem('error_logs', JSON.stringify(this.errors));
        } catch (e) {
            // Handle quota exceeded
            console.warn('Failed to save error logs:', e);
        }
    }

    loadStoredErrors() {
        try {
            const stored = localStorage.getItem('error_logs');
            if (stored) {
                this.errors = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to load error logs:', e);
        }
    }

    getErrors(limit = 10) {
        return this.errors.slice(-limit).reverse();
    }

    clearErrors() {
        this.errors = [];
        localStorage.removeItem('error_logs');
    }

    getErrorSummary() {
        const summary = {
            total: this.errors.length,
            byType: {},
            last24Hours: 0,
            criticalErrors: 0
        };

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        this.errors.forEach(error => {
            // Count by type
            summary.byType[error.type] = (summary.byType[error.type] || 0) + 1;

            // Count last 24 hours
            if (new Date(error.timestamp) > oneDayAgo) {
                summary.last24Hours++;
            }

            // Count critical errors
            if (error.type === 'javascript_error' || error.type === 'unhandled_promise_rejection') {
                summary.criticalErrors++;
            }
        });

        return summary;
    }

    // Export errors for debugging
    exportErrors() {
        const data = {
            errors: this.errors,
            summary: this.getErrorSummary(),
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `error_logs_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize error logger
window.errorLogger = new ErrorLogger();

// Utility function for manual error logging
window.logError = function(message, context = {}) {
    if (window.errorLogger) {
        window.errorLogger.logError({
            type: 'manual_log',
            message: message,
            context: context,
            timestamp: new Date().toISOString()
        });
    }
};