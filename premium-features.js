// Premium Features Management System
// Add this to your index.html or as a separate module

class PremiumManager {
    constructor() {
        this.features = {
            FREE: {
                maxProjects: 1,
                exportFormats: ['csv', 'json'],
                chartTypes: ['basic'],
                customCategories: 5,
                recurringExpenses: 10,
                historyDays: 90,
                budgetAlerts: true,
                darkMode: true,
                offlineSupport: true
            },
            PREMIUM: {
                maxProjects: -1, // unlimited
                exportFormats: ['csv', 'json', 'excel', 'pdf'],
                chartTypes: ['basic', 'advanced', 'custom'],
                customCategories: -1, // unlimited
                recurringExpenses: -1, // unlimited
                historyDays: -1, // unlimited
                budgetAlerts: true,
                darkMode: true,
                offlineSupport: true,
                cloudSync: true,
                prioritySupport: true,
                advancedAnalytics: true,
                multiCurrency: true,
                dataBackup: true,
                apiAccess: true
            }
        };

        this.currentTier = 'FREE';
        this.trialEndDate = null;
        this.licenseKey = null;
        
        this.init();
    }

    init() {
        // Check for existing license
        const savedLicense = localStorage.getItem('premium_license');
        if (savedLicense) {
            this.validateLicense(savedLicense);
        }

        // Check for trial
        const trialEnd = localStorage.getItem('premium_trial_end') || localStorage.getItem('trial_end_date');
        if (trialEnd) {
            this.trialEndDate = new Date(trialEnd);
            if (this.isTrialActive()) {
                this.currentTier = 'PREMIUM';
                localStorage.setItem('premium_tier', 'PREMIUM');
            }
        }
    }

    // Start a free trial
    startFreeTrial(days = 7) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + days);
        
        this.trialEndDate = trialEnd;
        localStorage.setItem('trial_end_date', trialEnd.toISOString());
        this.currentTier = 'PREMIUM';
        
        // Track trial start
        if (window.analytics) {
            window.analytics.track('trial_started', { days });
        }
        
        return {
            success: true,
            message: `Your ${days}-day free trial has started!`,
            expiresAt: trialEnd
        };
    }

    // Check if trial is still active
    isTrialActive() {
        if (!this.trialEndDate) return false;
        return new Date() < this.trialEndDate;
    }

    // Get days remaining in trial
    getTrialDaysRemaining() {
        if (!this.isTrialActive()) return 0;
        
        const now = new Date();
        const diffTime = this.trialEndDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return Math.max(0, diffDays);
    }

    // Check if a feature is available
    hasFeature(featureName) {
        const tier = this.features[this.currentTier];
        
        // Check direct features
        if (featureName in tier) {
            return tier[featureName] === true || tier[featureName] === -1 || tier[featureName] > 0;
        }
        
        // Check limits
        return this.checkLimit(featureName);
    }

    // Check numerical limits
    checkLimit(limitName, currentCount = 0) {
        const tier = this.features[this.currentTier];
        
        if (!(limitName in tier)) return true;
        
        const limit = tier[limitName];
        if (limit === -1) return true; // unlimited
        
        return currentCount < limit;
    }

    // Get limit for a feature
    getLimit(limitName) {
        const tier = this.features[this.currentTier];
        return tier[limitName] || 0;
    }

    // Validate license key (mock implementation)
    async validateLicense(licenseKey) {
        // In production, this would call your payment provider's API
        // For now, use a simple validation
        
        // Mock license format: PREMIUM-XXXX-XXXX-XXXX
        if (licenseKey && licenseKey.startsWith('PREMIUM-')) {
            this.licenseKey = licenseKey;
            this.currentTier = 'PREMIUM';
            localStorage.setItem('premium_license', licenseKey);
            localStorage.setItem('premium_tier', 'PREMIUM');
            
            // Also check if this is a trial activation
            if (licenseKey.includes('DEMO')) {
                const trialEndDate = new Date();
                trialEndDate.setDate(trialEndDate.getDate() + 7);
                this.trialEndDate = trialEndDate;
                localStorage.setItem('premium_trial_end', trialEndDate.toISOString());
            }
            
            return true;
        }
        
        return false;
    }

    // Show paywall for premium features
    showPaywall(feature, customMessage = null) {
        const modal = document.createElement('div');
        modal.className = 'premium-paywall-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;

        const trialAvailable = !this.trialEndDate && !this.licenseKey;
        const trialDaysLeft = this.getTrialDaysRemaining();

        modal.innerHTML = `
            <div class="premium-modal-content" style="background: var(--card-bg, white); color: var(--text-primary, #333); border-radius: 16px; padding: 2rem; max-width: 500px; margin: 1rem; position: relative;">
                <button onclick="this.closest('.premium-paywall-modal').remove()" style="position: absolute; top: 1rem; right: 1rem; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary, #666);">×</button>
                
                <div style="text-align: center; margin-bottom: 2rem;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">👑</div>
                    <h2 style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-primary, #333);">Premium Feature</h2>
                    <p style="color: var(--text-secondary, #666); font-size: 1.1rem;">${customMessage || `This feature requires a Premium subscription`}</p>
                </div>

                ${trialDaysLeft > 0 ? `
                    <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                        <p style="color: #92400e; margin: 0;">⏰ Your trial expires in ${trialDaysLeft} days</p>
                    </div>
                ` : ''}

                <div style="background: var(--background-alt, #f3f4f6); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
                    <h3 style="margin-bottom: 1rem; color: var(--text-primary, #333);">Premium includes:</h3>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        <li style="padding: 0.5rem 0; color: var(--text-primary, #333);">✅ Unlimited projects & trips</li>
                        <li style="padding: 0.5rem 0; color: var(--text-primary, #333);">✅ Advanced analytics & charts</li>
                        <li style="padding: 0.5rem 0; color: var(--text-primary, #333);">✅ Excel & PDF exports</li>
                        <li style="padding: 0.5rem 0; color: var(--text-primary, #333);">✅ Cloud sync (coming soon)</li>
                        <li style="padding: 0.5rem 0; color: var(--text-primary, #333);">✅ Priority support</li>
                        <li style="padding: 0.5rem 0; color: var(--text-primary, #333);">✅ All future features</li>
                    </ul>
                </div>

                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    ${trialAvailable ? `
                        <button onclick="window.premiumManager.startTrialFromPaywall()" style="background: #10b981; color: white; border: none; padding: 1rem; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer;">
                            Start 7-Day Free Trial
                        </button>
                    ` : ''}
                    
                    <button onclick="window.premiumManager.redirectToCheckout()" style="background: #6366f1; color: white; border: none; padding: 1rem; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer;">
                        ${trialAvailable ? 'Or Subscribe Now - $4.99/month' : 'Subscribe Now - $4.99/month'}
                    </button>
                    
                    <button onclick="this.closest('.premium-paywall-modal').remove()" style="background: transparent; border: none; color: var(--text-secondary, #666); padding: 0.5rem; cursor: pointer;">
                        Maybe later
                    </button>
                </div>

                <p style="text-align: center; color: var(--text-secondary, #999); font-size: 0.875rem; margin-top: 1rem;">
                    No credit card required for trial • Cancel anytime
                </p>
            </div>
        `;

        document.body.appendChild(modal);

        // Add fade-in animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    // Start trial from paywall
    startTrialFromPaywall() {
        const result = this.startFreeTrial();
        if (result.success) {
            // Close paywall
            document.querySelector('.premium-paywall-modal')?.remove();
            
            // Show success message
            if (window.showNotification) {
                window.showNotification(result.message, 'success');
            }
            
            // Reload features
            window.location.reload();
        }
    }

    // Redirect to checkout (placeholder)
    redirectToCheckout() {
        // Track conversion attempt
        if (window.analytics) {
            window.analytics.track('checkout_started', {
                source: 'paywall',
                tier: 'premium'
            });
        }
        
        // In production, this would redirect to your payment provider
        alert('Payment integration coming soon! For now, enjoy the free version.');
        
        // For development/demo purposes
        const mockLicense = `PREMIUM-${Date.now()}-DEMO-KEY`;
        if (confirm('Would you like to activate a demo Premium license for testing?')) {
            this.validateLicense(mockLicense);
            document.querySelector('.premium-paywall-modal')?.remove();
            window.location.reload();
        }
    }

    // Add premium badge to locked features
    addPremiumBadges() {
        // This would be called on page load to add visual indicators
        const premiumFeatures = document.querySelectorAll('[data-premium-feature]');
        
        premiumFeatures.forEach(element => {
            const featureName = element.getAttribute('data-premium-feature');
            
            if (!this.hasFeature(featureName)) {
                // Add premium badge
                const badge = document.createElement('span');
                badge.className = 'premium-badge';
                badge.style.cssText = `
                    background: linear-gradient(135deg, #fbbf24, #f59e0b);
                    color: #78350f;
                    padding: 0.25rem 0.5rem;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    margin-left: 0.5rem;
                    cursor: pointer;
                `;
                badge.textContent = 'PRO';
                badge.onclick = () => this.showPaywall(featureName);
                
                element.appendChild(badge);
                
                // Disable functionality
                if (element.tagName === 'BUTTON') {
                    element.onclick = (e) => {
                        e.preventDefault();
                        this.showPaywall(featureName);
                    };
                }
            }
        });
    }

    // Export functions for feature checking
    isPremium() {
        return this.currentTier === 'PREMIUM';
    }

    canExportExcel() {
        return this.hasFeature('exportFormats') && this.features[this.currentTier].exportFormats.includes('excel');
    }

    canExportPDF() {
        return this.hasFeature('exportFormats') && this.features[this.currentTier].exportFormats.includes('pdf');
    }

    canUseAdvancedCharts() {
        return this.hasFeature('advancedAnalytics');
    }

    canCreateProject(currentProjectCount) {
        return this.checkLimit('maxProjects', currentProjectCount);
    }
}

// Initialize premium manager
window.premiumManager = new PremiumManager();

// Example usage in your main app:
/*
// Check before using a feature
if (premiumManager.canExportExcel()) {
    exportToExcel();
} else {
    premiumManager.showPaywall('excel_export', 'Export to Excel requires a Premium subscription');
}

// Check project limits
if (premiumManager.canCreateProject(trips.length)) {
    createNewTrip();
} else {
    premiumManager.showPaywall('unlimited_projects', `Free plan is limited to ${premiumManager.getLimit('maxProjects')} project`);
}

// Add badges on load
document.addEventListener('DOMContentLoaded', () => {
    premiumManager.addPremiumBadges();
});
*/