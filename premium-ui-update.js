// Premium UI Update Functions
// This file handles updating the UI state after premium features are activated

function updatePremiumUIState() {
    if (!window.premiumManager) {
        console.warn('Premium manager not initialized');
        return;
    }
    
    // Update Export Excel button
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    if (exportExcelBtn) {
        if (window.premiumManager.canExportExcel()) {
            exportExcelBtn.classList.remove('btn-warning');
            exportExcelBtn.classList.add('btn-success');
            exportExcelBtn.innerHTML = '📊 Export Excel';
            // Remove any premium badge
            const badge = exportExcelBtn.querySelector('.premium-badge');
            if (badge) badge.remove();
            // Remove disabled state
            exportExcelBtn.disabled = false;
            exportExcelBtn.style.opacity = '1';
            exportExcelBtn.style.cursor = 'pointer';
        } else {
            exportExcelBtn.classList.remove('btn-success');
            exportExcelBtn.classList.add('btn-warning');
        }
    }
    
    // Update Export PDF button
    const exportPDFBtn = document.getElementById('exportPDFBtn');
    if (exportPDFBtn) {
        if (window.premiumManager.canExportPDF()) {
            exportPDFBtn.classList.remove('btn-warning');
            exportPDFBtn.classList.add('btn-success');
            exportPDFBtn.innerHTML = '📄 Export PDF';
            // Remove any premium badge
            const badge = exportPDFBtn.querySelector('.premium-badge');
            if (badge) badge.remove();
            // Remove disabled state
            exportPDFBtn.disabled = false;
            exportPDFBtn.style.opacity = '1';
            exportPDFBtn.style.cursor = 'pointer';
        } else {
            exportPDFBtn.classList.remove('btn-success');
            exportPDFBtn.classList.add('btn-warning');
        }
    }
}

// Override the original redirectToCheckout function to update UI immediately
if (window.premiumManager) {
    const originalRedirectToCheckout = window.premiumManager.redirectToCheckout;
    window.premiumManager.redirectToCheckout = function() {
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
            
            // Update UI immediately
            updatePremiumUIState();
            
            // Show success message
            if (window.showNotification) {
                window.showNotification('🎉 Demo Premium license activated! Enjoy all features for 7 days.', 'success');
            }
            
            // Optionally reload after a short delay to ensure everything is updated
            setTimeout(() => {
                updatePremiumUIState(); // Update again to be sure
            }, 500);
        }
    };
    
    // Also override startTrialFromPaywall
    const originalStartTrial = window.premiumManager.startTrialFromPaywall;
    window.premiumManager.startTrialFromPaywall = function() {
        const result = this.startFreeTrial();
        if (result.success) {
            // Close paywall
            document.querySelector('.premium-paywall-modal')?.remove();
            
            // Show success message
            if (window.showNotification) {
                window.showNotification(result.message, 'success');
            }
            
            // Update UI immediately
            updatePremiumUIState();
            
            // Update again after a short delay
            setTimeout(() => {
                updatePremiumUIState();
            }, 500);
        }
    };
}

// Run on page load
document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit for everything to initialize
    setTimeout(updatePremiumUIState, 1000);
});

// Also update when premium features script loads
if (window.premiumManager) {
    setTimeout(updatePremiumUIState, 100);
}