// Premium UI Update Fix
// Add this script to index.html to fix the export button states

(function() {
    // Function to update premium UI state
    function updatePremiumUIState() {
        if (!window.premiumManager) {
            setTimeout(updatePremiumUIState, 500);
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
            }
        }
    }
    
    // Override the demo activation to update UI immediately
    function overrideDemoActivation() {
        if (!window.premiumManager || !window.premiumManager.redirectToCheckout) {
            setTimeout(overrideDemoActivation, 500);
            return;
        }
        
        const originalRedirect = window.premiumManager.redirectToCheckout;
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
                    window.showNotification('🎉 Demo Premium license activated! Export features are now available.', 'success');
                }
            }
        };
    }
    
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(updatePremiumUIState, 1000);
        setTimeout(overrideDemoActivation, 500);
    });
    
    // Also run immediately if DOM is already loaded
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        setTimeout(updatePremiumUIState, 500);
        setTimeout(overrideDemoActivation, 500);
    }
})();
