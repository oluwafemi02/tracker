/**
 * Logger - Environment-based logging with sensitive data protection
 * Replaces console.* statements with proper production-ready logging
 */

class Logger {
    constructor() {
        this.LOG_LEVELS = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3,
            NONE: 4
        };

        // Detect environment
        this.environment = this.detectEnvironment();
        
        // Set log level based on environment
        this.currentLevel = this.environment === 'production' 
            ? this.LOG_LEVELS.WARN 
            : this.LOG_LEVELS.DEBUG;

        // Store recent logs for debugging
        this.logBuffer = [];
        this.maxBufferSize = 100;

        // Sensitive data patterns to redact
        this.sensitivePatterns = [
            /password/i,
            /token/i,
            /secret/i,
            /apikey/i,
            /credit.?card/i,
            /ssn/i,
            /account.?number/i
        ];

        // Initialize remote logging if configured
        this.remoteLoggingEnabled = false;
        this.remoteLogQueue = [];
    }

    detectEnvironment() {
        // Check for common production indicators
        if (window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('dev') ||
            window.location.hostname.includes('test')) {
            return 'development';
        }
        return 'production';
    }

    shouldLog(level) {
        return this.LOG_LEVELS[level] >= this.currentLevel;
    }

    redactSensitiveData(data) {
        if (typeof data === 'string') {
            return data;
        }

        if (typeof data !== 'object' || data === null) {
            return data;
        }

        const redacted = Array.isArray(data) ? [...data] : { ...data };

        for (const key in redacted) {
            // Check if key matches sensitive patterns
            const isSensitive = this.sensitivePatterns.some(pattern => 
                pattern.test(key)
            );

            if (isSensitive) {
                redacted[key] = '[REDACTED]';
            } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
                redacted[key] = this.redactSensitiveData(redacted[key]);
            }
        }

        return redacted;
    }

    formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        const formattedData = data ? this.redactSensitiveData(data) : null;

        return {
            timestamp,
            level,
            message,
            data: formattedData,
            environment: this.environment,
            url: window.location.href,
            userAgent: navigator.userAgent.substring(0, 100) // Truncate for privacy
        };
    }

    addToBuffer(logEntry) {
        this.logBuffer.push(logEntry);
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift();
        }
    }

    async sendToRemote(logEntry) {
        if (!this.remoteLoggingEnabled) return;

        this.remoteLogQueue.push(logEntry);

        // Batch send logs (debounced)
        if (!this.sendTimeout) {
            this.sendTimeout = setTimeout(() => {
                this.flushRemoteLogs();
            }, 5000);
        }
    }

    async flushRemoteLogs() {
        if (this.remoteLogQueue.length === 0) return;

        const logs = [...this.remoteLogQueue];
        this.remoteLogQueue = [];
        this.sendTimeout = null;

        // Send to configured endpoint (e.g., Sentry, LogRocket, custom endpoint)
        if (window.errorLogger && window.errorLogger.logBatch) {
            try {
                await window.errorLogger.logBatch(logs);
            } catch (error) {
                // Fail silently - don't break app for logging issues
                console.error('Remote logging failed:', error);
            }
        }
    }

    debug(message, data = null) {
        if (!this.shouldLog('DEBUG')) return;

        const logEntry = this.formatMessage('DEBUG', message, data);
        this.addToBuffer(logEntry);

        if (console.debug) {
            console.debug(`[DEBUG] ${message}`, data || '');
        }
    }

    info(message, data = null) {
        if (!this.shouldLog('INFO')) return;

        const logEntry = this.formatMessage('INFO', message, data);
        this.addToBuffer(logEntry);

        if (console.info) {
            console.info(`[INFO] ${message}`, data || '');
        }
    }

    warn(message, data = null) {
        if (!this.shouldLog('WARN')) return;

        const logEntry = this.formatMessage('WARN', message, data);
        this.addToBuffer(logEntry);

        console.warn(`[WARN] ${message}`, data || '');
        this.sendToRemote(logEntry);
    }

    error(message, error = null, context = {}) {
        if (!this.shouldLog('ERROR')) return;

        const errorData = {
            message: error?.message,
            stack: error?.stack,
            ...context
        };

        const logEntry = this.formatMessage('ERROR', message, errorData);
        this.addToBuffer(logEntry);

        console.error(`[ERROR] ${message}`, error || '', context);
        this.sendToRemote(logEntry);

        // Track in analytics
        if (window.analytics) {
            window.analytics.trackError(error || new Error(message), context);
        }
    }

    // Specialized logging methods
    
    performance(label, duration, details = {}) {
        if (!this.shouldLog('INFO')) return;

        const logEntry = this.formatMessage('PERFORMANCE', `${label}: ${duration}ms`, details);
        this.addToBuffer(logEntry);

        if (this.environment === 'development') {
            console.log(`⚡ [PERFORMANCE] ${label}: ${duration}ms`, details);
        }
    }

    userAction(action, details = {}) {
        if (!this.shouldLog('DEBUG')) return;

        const logEntry = this.formatMessage('USER_ACTION', action, details);
        this.addToBuffer(logEntry);

        if (this.environment === 'development') {
            console.log(`👤 [USER] ${action}`, details);
        }

        // Track in analytics
        if (window.analytics) {
            window.analytics.track(action, details);
        }
    }

    apiCall(method, url, duration, status, error = null) {
        const level = error ? 'ERROR' : 'INFO';
        
        if (!this.shouldLog(level)) return;

        const logEntry = this.formatMessage(level, `API ${method} ${url}`, {
            method,
            url,
            duration,
            status,
            error: error?.message
        });
        
        this.addToBuffer(logEntry);

        if (error) {
            console.error(`[API ERROR] ${method} ${url}:`, error);
        } else if (this.environment === 'development') {
            console.log(`[API] ${method} ${url} - ${status} (${duration}ms)`);
        }
    }

    // Get logs for debugging or support
    getLogs(level = null) {
        if (level) {
            return this.logBuffer.filter(log => log.level === level);
        }
        return [...this.logBuffer];
    }

    // Export logs for support tickets
    exportLogs() {
        const logs = this.getLogs();
        const blob = new Blob([JSON.stringify(logs, null, 2)], { 
            type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Clear log buffer
    clearLogs() {
        this.logBuffer = [];
    }

    // Set log level programmatically
    setLevel(level) {
        if (this.LOG_LEVELS[level] !== undefined) {
            this.currentLevel = this.LOG_LEVELS[level];
        }
    }

    // Enable/disable remote logging
    enableRemoteLogging(enabled = true) {
        this.remoteLoggingEnabled = enabled;
    }
}

// Create global instance
window.logger = new Logger();

// Create convenient global functions
window.logDebug = (msg, data) => window.logger.debug(msg, data);
window.logInfo = (msg, data) => window.logger.info(msg, data);
window.logWarn = (msg, data) => window.logger.warn(msg, data);
window.logError = (msg, error, context) => window.logger.error(msg, error, context);
window.logPerformance = (label, duration, details) => window.logger.performance(label, duration, details);
window.logUserAction = (action, details) => window.logger.userAction(action, details);
