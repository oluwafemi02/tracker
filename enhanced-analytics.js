/**
 * Enhanced Analytics - Comprehensive business intelligence and user behavior tracking
 * Extends basic analytics with actionable insights
 */

class EnhancedAnalytics {
    constructor() {
        this.sessionStart = Date.now();
        this.sessionEvents = [];
        this.userJourney = [];
        this.featureUsage = new Map();
        this.performanceMetrics = [];
        
        this.init();
    }

    init() {
        // Track session start
        this.trackEvent('session_start', {
            timestamp: this.sessionStart,
            referrer: document.referrer,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            deviceType: this.getDeviceType()
        });

        // Track page visibility
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.trackEvent('session_backgrounded');
            } else {
                this.trackEvent('session_foregrounded');
            }
        });

        // Track page unload
        window.addEventListener('beforeunload', () => {
            this.trackSessionEnd();
        });

        // Monitor performance
        this.monitorPerformance();
    }

    getDeviceType() {
        const width = window.innerWidth;
        if (width < 768) return 'mobile';
        if (width < 1024) return 'tablet';
        return 'desktop';
    }

    trackEvent(eventName, properties = {}) {
        const event = {
            name: eventName,
            timestamp: Date.now(),
            properties: {
                ...properties,
                sessionDuration: Date.now() - this.sessionStart,
                pageUrl: window.location.pathname
            }
        };

        this.sessionEvents.push(event);
        this.userJourney.push(eventName);

        // Track feature usage
        if (eventName.startsWith('feature_')) {
            const count = this.featureUsage.get(eventName) || 0;
            this.featureUsage.set(eventName, count + 1);
        }

        // Send to analytics service if available
        if (window.analytics) {
            window.analytics.track(eventName, properties);
        }

        // Log in development
        if (window.logger) {
            window.logger.userAction(eventName, properties);
        }
    }

    // Business Metrics

    trackExpenseAdded(category, amount, isRecurring = false) {
        this.trackEvent('expense_added', {
            category,
            amount,
            isRecurring,
            amountBucket: this.getAmountBucket(amount)
        });
    }

    trackBudgetSet(amount, previousAmount = null) {
        this.trackEvent('budget_set', {
            amount,
            previousAmount,
            change: previousAmount ? amount - previousAmount : 0,
            changePercent: previousAmount ? ((amount - previousAmount) / previousAmount * 100).toFixed(2) : 0
        });
    }

    trackBudgetAdherence(spent, budget, month) {
        const adherenceRate = (spent / budget) * 100;
        const status = adherenceRate <= 80 ? 'excellent' : 
                      adherenceRate <= 100 ? 'good' : 
                      adherenceRate <= 120 ? 'over' : 'critical';

        this.trackEvent('budget_adherence', {
            month,
            spent,
            budget,
            adherenceRate: adherenceRate.toFixed(2),
            status,
            isOverBudget: spent > budget
        });
    }

    trackCategorySpending(category, amount, percentOfBudget) {
        this.trackEvent('category_spending', {
            category,
            amount,
            percentOfBudget: percentOfBudget.toFixed(2)
        });
    }

    trackRecurringExpense(action, frequency, amount) {
        this.trackEvent('recurring_expense', {
            action, // created, modified, stopped
            frequency,
            amount,
            monthlyImpact: this.calculateMonthlyImpact(frequency, amount)
        });
    }

    trackRolloverDecision(decision, amount) {
        this.trackEvent('rollover_decision', {
            decision, // save_reserve, rollover, split, ignore
            amount
        });
    }

    trackExport(format, recordCount) {
        this.trackEvent('data_export', {
            format, // csv, json, excel, pdf
            recordCount,
            isPremium: format === 'excel' || format === 'pdf'
        });
    }

    trackFeatureUsageEvent(feature, details = {}) {
        this.trackEvent(`feature_${feature}`, details);
    }

    // User Behavior Metrics

    trackOnboardingStep(step, completed = false) {
        this.trackEvent('onboarding_step', {
            step,
            completed,
            timeToReach: Date.now() - this.sessionStart
        });
    }

    trackTimeToFirstExpense() {
        const firstExpenseEvent = this.sessionEvents.find(e => e.name === 'expense_added');
        if (firstExpenseEvent) {
            const timeToFirst = firstExpenseEvent.timestamp - this.sessionStart;
            this.trackEvent('time_to_first_expense', {
                duration: timeToFirst,
                durationSeconds: Math.round(timeToFirst / 1000)
            });
        }
    }

    trackFeatureDiscovery(feature) {
        this.trackEvent('feature_discovered', {
            feature,
            sessionTime: Date.now() - this.sessionStart
        });
    }

    trackErrorEncountered(errorType, errorMessage, recoverable = true) {
        this.trackEvent('error_encountered', {
            errorType,
            errorMessage,
            recoverable,
            userJourney: this.userJourney.slice(-5) // Last 5 actions
        });
    }

    trackSearchUsage(searchTerm, resultCount, timeToResult) {
        this.trackEvent('search_used', {
            searchTerm: searchTerm.length, // Don't log actual term for privacy
            resultCount,
            timeToResult,
            hasResults: resultCount > 0
        });
    }

    trackModalInteraction(modalType, action) {
        this.trackEvent('modal_interaction', {
            modalType,
            action // opened, confirmed, cancelled, dismissed
        });
    }

    // Performance Metrics

    monitorPerformance() {
        // Track page load performance
        if (window.performance && window.performance.timing) {
            window.addEventListener('load', () => {
                setTimeout(() => {
                    const timing = window.performance.timing;
                    const loadTime = timing.loadEventEnd - timing.navigationStart;
                    const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
                    
                    this.trackEvent('page_performance', {
                        loadTime,
                        domReady,
                        rating: loadTime < 2000 ? 'excellent' : loadTime < 5000 ? 'good' : 'poor'
                    });
                }, 0);
            });
        }

        // Track interaction performance
        this.trackInteractionPerformance();
    }

    trackInteractionPerformance() {
        // Measure rendering performance
        if (window.PerformanceObserver) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.duration > 100) { // Only track slow interactions
                            this.performanceMetrics.push({
                                type: entry.name,
                                duration: entry.duration,
                                timestamp: Date.now()
                            });

                            if (window.logger) {
                                window.logger.performance(entry.name, entry.duration);
                            }
                        }
                    }
                });
                observer.observe({ entryTypes: ['measure', 'navigation'] });
            } catch (e) {
                // PerformanceObserver not supported
            }
        }
    }

    measureOperation(operationName, operation) {
        const start = performance.now();
        const result = operation();
        const duration = performance.now() - start;
        
        if (window.logger) {
            window.logger.performance(operationName, duration);
        }
        
        return result;
    }

    async measureAsyncOperation(operationName, operation) {
        const start = performance.now();
        const result = await operation();
        const duration = performance.now() - start;
        
        if (window.logger) {
            window.logger.performance(operationName, duration);
        }
        
        return result;
    }

    // Insights & Reports

    getSessionSummary() {
        const duration = Date.now() - this.sessionStart;
        const eventCount = this.sessionEvents.length;
        const uniqueFeatures = new Set(
            this.sessionEvents
                .filter(e => e.name.startsWith('feature_'))
                .map(e => e.name)
        ).size;

        return {
            duration,
            durationMinutes: Math.round(duration / 60000),
            eventCount,
            uniqueFeatures,
            topFeatures: this.getTopFeatures(5),
            userJourney: this.userJourney,
            performanceIssues: this.performanceMetrics.filter(m => m.duration > 500).length
        };
    }

    getTopFeatures(limit = 10) {
        return Array.from(this.featureUsage.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([feature, count]) => ({ feature, count }));
    }

    getEngagementScore() {
        const summary = this.getSessionSummary();
        let score = 0;

        // Time spent (max 30 points)
        score += Math.min(30, summary.durationMinutes * 2);

        // Feature usage (max 40 points)
        score += Math.min(40, summary.uniqueFeatures * 8);

        // Event count (max 30 points)
        score += Math.min(30, summary.eventCount * 2);

        return Math.min(100, score);
    }

    getUserInsights() {
        const expenseEvents = this.sessionEvents.filter(e => e.name === 'expense_added');
        const budgetEvents = this.sessionEvents.filter(e => e.name === 'budget_set');
        
        return {
            isActiveUser: expenseEvents.length > 5,
            hasBudget: budgetEvents.length > 0,
            usesRecurring: this.sessionEvents.some(e => e.name === 'recurring_expense'),
            usesExport: this.sessionEvents.some(e => e.name === 'data_export'),
            engagementScore: this.getEngagementScore(),
            mostUsedFeature: this.getTopFeatures(1)[0],
            sessionQuality: this.getSessionQuality()
        };
    }

    getSessionQuality() {
        const summary = this.getSessionSummary();
        
        if (summary.performanceIssues > 5) return 'poor';
        if (summary.uniqueFeatures > 5 && summary.durationMinutes > 2) return 'excellent';
        if (summary.uniqueFeatures > 2) return 'good';
        return 'fair';
    }

    trackSessionEnd() {
        const summary = this.getSessionSummary();
        const insights = this.getUserInsights();

        this.trackEvent('session_end', {
            ...summary,
            ...insights
        });

        // Save session data for cohort analysis
        this.saveSessionData(summary, insights);
    }

    saveSessionData(summary, insights) {
        try {
            const sessions = JSON.parse(localStorage.getItem('analyticsessions') || '[]');
            sessions.push({
                date: new Date().toISOString().split('T')[0],
                timestamp: this.sessionStart,
                summary,
                insights
            });

            // Keep last 30 sessions
            const recentSessions = sessions.slice(-30);
            localStorage.setItem('analytics_sessions', JSON.stringify(recentSessions));
        } catch (e) {
            // Fail silently
        }
    }

    // Helper Methods

    getAmountBucket(amount) {
        if (amount < 10) return '0-10';
        if (amount < 50) return '10-50';
        if (amount < 100) return '50-100';
        if (amount < 500) return '100-500';
        if (amount < 1000) return '500-1000';
        return '1000+';
    }

    calculateMonthlyImpact(frequency, amount) {
        const multipliers = {
            daily: 30,
            weekly: 4.33,
            biweekly: 2.17,
            monthly: 1,
            quarterly: 0.33,
            yearly: 0.083
        };
        return (amount * (multipliers[frequency] || 1)).toFixed(2);
    }

    // Export analytics data
    exportAnalyticsData() {
        const sessions = JSON.parse(localStorage.getItem('analytics_sessions') || '[]');
        const data = {
            currentSession: this.getSessionSummary(),
            userInsights: this.getUserInsights(),
            historicalSessions: sessions,
            featureUsage: Object.fromEntries(this.featureUsage),
            performanceMetrics: this.performanceMetrics
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { 
            type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Create global instance
window.enhancedAnalytics = new EnhancedAnalytics();
