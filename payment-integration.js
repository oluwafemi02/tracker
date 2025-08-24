// Payment Integration System
// Supports LemonSqueezy (recommended for MVPs) and Stripe

class PaymentManager {
    constructor() {
        this.provider = 'lemonsqueezy'; // or 'stripe'
        this.isTestMode = true; // Switch to false in production
        this.products = {
            monthly: {
                id: null, // Will be set when payment provider is configured
                price: 4.99,
                currency: 'USD',
                interval: 'month'
            },
            yearly: {
                id: null, // Will be set when payment provider is configured
                price: 39.99,
                currency: 'USD',
                interval: 'year',
                savings: 17 // percentage saved
            },
            lifetime: {
                id: null, // Will be set when payment provider is configured
                price: 99.99,
                currency: 'USD',
                interval: null
            }
        };
        
        this.init();
    }

    init() {
        // Check for existing subscription
        this.checkSubscriptionStatus();
        
        // Initialize payment provider when ready
        if (this.provider === 'lemonsqueezy') {
            this.initLemonSqueezy();
        } else if (this.provider === 'stripe') {
            this.initStripe();
        }
    }

    // LemonSqueezy Integration (Recommended for easy setup)
    initLemonSqueezy() {
        console.log('🍋 LemonSqueezy payment integration ready (in progress)');
        
        /* Implementation placeholder:
        // 1. Sign up at lemonsqueezy.com
        // 2. Create products
        // 3. Get your API keys
        
        // Add LemonSqueezy script
        const script = document.createElement('script');
        script.src = 'https://assets.lemonsqueezy.com/lemon.js';
        script.async = true;
        document.head.appendChild(script);
        
        script.onload = () => {
            window.createLemonSqueezy();
            
            // Configure products
            this.products.monthly.id = 'YOUR_MONTHLY_VARIANT_ID';
            this.products.yearly.id = 'YOUR_YEARLY_VARIANT_ID';
        };
        */
    }

    // Stripe Integration (More complex but more control)
    initStripe() {
        console.log('💳 Stripe payment integration ready (in progress)');
        
        /* Implementation placeholder:
        // 1. Sign up at stripe.com
        // 2. Create products and prices
        // 3. Set up webhook endpoints
        
        // Add Stripe script
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.async = true;
        document.head.appendChild(script);
        
        script.onload = () => {
            this.stripe = Stripe('YOUR_PUBLISHABLE_KEY');
            
            // Configure products
            this.products.monthly.id = 'price_XXXXXXXXXX';
            this.products.yearly.id = 'price_YYYYYYYYYY';
        };
        */
    }

    // Check if user has active subscription
    async checkSubscriptionStatus() {
        // Check localStorage for license/subscription
        const subscription = localStorage.getItem('subscription_data');
        
        if (subscription) {
            try {
                const data = JSON.parse(subscription);
                
                // Validate subscription is still active
                if (this.isSubscriptionActive(data)) {
                    this.activatePremiumFeatures(data);
                    return true;
                }
            } catch (e) {
                console.error('Invalid subscription data:', e);
            }
        }
        
        return false;
    }

    isSubscriptionActive(subscriptionData) {
        if (!subscriptionData || !subscriptionData.expiresAt) return false;
        
        const expiryDate = new Date(subscriptionData.expiresAt);
        return expiryDate > new Date();
    }

    // Open checkout for selected plan
    async openCheckout(planType = 'monthly') {
        const plan = this.products[planType];
        
        if (!plan || !plan.id) {
            // Use showNotification if available, otherwise fallback to alert
            if (window.showNotification) {
                window.showNotification('Payment integration is being set up. Please check back soon!', 'info');
            } else {
                alert('Payment integration is being set up. Please check back soon!');
            }
            
            // Track checkout attempt
            if (window.analytics) {
                window.analytics.track('checkout_attempt', {
                    plan: planType,
                    status: 'not_configured'
                });
            }
            
            // For demo purposes
            if (confirm('Would you like to activate a demo subscription for testing?')) {
                this.activateDemoSubscription(planType);
            }
            
            return;
        }

        // Track checkout start
        if (window.analytics) {
            window.analytics.track('checkout_started', {
                plan: planType,
                price: plan.price,
                currency: plan.currency
            });
        }

        if (this.provider === 'lemonsqueezy') {
            this.openLemonSqueezyCheckout(plan);
        } else if (this.provider === 'stripe') {
            this.openStripeCheckout(plan);
        }
    }

    // LemonSqueezy checkout
    openLemonSqueezyCheckout(plan) {
        /* Implementation placeholder:
        LemonSqueezy.Url.Open(plan.id);
        */
        
        console.log('Opening LemonSqueezy checkout for:', plan);
    }

    // Stripe checkout
    async openStripeCheckout(plan) {
        /* Implementation placeholder:
        const response = await fetch('/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                priceId: plan.id,
            }),
        });

        const session = await response.json();

        // Redirect to Stripe Checkout
        const { error } = await this.stripe.redirectToCheckout({
            sessionId: session.id,
        });

        if (error) {
            console.error('Stripe error:', error);
        }
        */
        
        console.log('Opening Stripe checkout for:', plan);
    }

    // Handle successful payment (webhook or return URL)
    async handlePaymentSuccess(sessionData) {
        // Store subscription data
        const subscriptionData = {
            id: sessionData.subscriptionId,
            customerId: sessionData.customerId,
            plan: sessionData.plan,
            status: 'active',
            startDate: new Date().toISOString(),
            expiresAt: this.calculateExpiryDate(sessionData.plan),
            paymentMethod: this.provider
        };

        localStorage.setItem('subscription_data', JSON.stringify(subscriptionData));
        
        // Activate premium features
        this.activatePremiumFeatures(subscriptionData);
        
        // Track conversion
        if (window.analytics) {
            window.analytics.track('payment_success', {
                plan: sessionData.plan,
                revenue: this.products[sessionData.plan]?.price || 0
            });
        }

        // Show success message
        if (window.showNotification) {
            window.showNotification('🎉 Welcome to Premium! Your features are now active.', 'success');
        }
    }

    calculateExpiryDate(planType) {
        const now = new Date();
        
        switch(planType) {
            case 'monthly':
                now.setMonth(now.getMonth() + 1);
                break;
            case 'yearly':
                now.setFullYear(now.getFullYear() + 1);
                break;
            case 'lifetime':
                now.setFullYear(now.getFullYear() + 100); // Effectively lifetime
                break;
        }
        
        return now.toISOString();
    }

    // Activate premium features
    activatePremiumFeatures(subscriptionData) {
        // Update premium manager
        if (window.premiumManager) {
            window.premiumManager.currentTier = 'PREMIUM';
            window.premiumManager.licenseKey = subscriptionData.id;
            localStorage.setItem('premium_license', subscriptionData.id);
        }

        // Refresh UI to show premium features
        this.refreshPremiumUI();
    }

    refreshPremiumUI() {
        // Remove premium badges
        document.querySelectorAll('.premium-badge').forEach(badge => {
            badge.style.display = 'none';
        });

        // Enable premium features
        document.querySelectorAll('[data-premium-feature]').forEach(element => {
            element.classList.remove('disabled');
            element.removeAttribute('disabled');
        });

        // Update any UI elements that show subscription status
        const statusElements = document.querySelectorAll('.subscription-status');
        statusElements.forEach(el => {
            el.textContent = 'Premium Active';
            el.classList.add('premium-active');
        });
    }

    // Demo subscription for testing
    activateDemoSubscription(planType) {
        const demoSubscription = {
            id: `DEMO_${Date.now()}`,
            customerId: 'demo_customer',
            plan: planType,
            status: 'active',
            startDate: new Date().toISOString(),
            expiresAt: this.calculateExpiryDate(planType),
            paymentMethod: 'demo',
            isDemo: true
        };

        this.handlePaymentSuccess(demoSubscription);
        
        alert('Demo subscription activated! Premium features are now available for testing.');
    }

    // Cancel subscription
    async cancelSubscription() {
        const subscription = JSON.parse(localStorage.getItem('subscription_data') || '{}');
        
        if (!subscription.id) {
            alert('No active subscription found.');
            return;
        }

        if (confirm('Are you sure you want to cancel your subscription? You\'ll lose access to premium features at the end of your billing period.')) {
            // In production, this would call the payment provider's API
            console.log('Cancelling subscription:', subscription.id);
            
            // Mark as cancelled
            subscription.status = 'cancelled';
            subscription.cancelledAt = new Date().toISOString();
            localStorage.setItem('subscription_data', JSON.stringify(subscription));
            
            // Track cancellation
            if (window.analytics) {
                window.analytics.track('subscription_cancelled', {
                    plan: subscription.plan,
                    reason: 'user_requested'
                });
            }

            alert('Your subscription has been cancelled. You\'ll continue to have access until ' + 
                  new Date(subscription.expiresAt).toLocaleDateString());
        }
    }

    // Get current subscription info
    getSubscriptionInfo() {
        const subscription = JSON.parse(localStorage.getItem('subscription_data') || '{}');
        
        if (!subscription.id) return null;
        
        return {
            ...subscription,
            isActive: this.isSubscriptionActive(subscription),
            daysRemaining: this.calculateDaysRemaining(subscription.expiresAt)
        };
    }

    calculateDaysRemaining(expiryDate) {
        const now = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return Math.max(0, diffDays);
    }
}

// Initialize payment manager
window.paymentManager = new PaymentManager();

// Utility functions for easy access
window.upgradeToPremium = function(plan = 'monthly') {
    if (window.paymentManager) {
        window.paymentManager.openCheckout(plan);
    }
};

window.cancelPremium = function() {
    if (window.paymentManager) {
        window.paymentManager.cancelSubscription();
    }
};

// Handle return from payment provider
window.handlePaymentReturn = function() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // LemonSqueezy parameters
    if (urlParams.get('checkout[status]') === 'paid') {
        window.paymentManager.handlePaymentSuccess({
            subscriptionId: urlParams.get('checkout[custom][subscription_id]'),
            customerId: urlParams.get('checkout[email]'),
            plan: urlParams.get('checkout[custom][plan]') || 'monthly'
        });
    }
    
    // Stripe parameters
    if (urlParams.get('success') === 'true' && urlParams.get('session_id')) {
        // In production, verify session with backend
        window.paymentManager.handlePaymentSuccess({
            subscriptionId: urlParams.get('session_id'),
            customerId: 'stripe_customer',
            plan: urlParams.get('plan') || 'monthly'
        });
    }
    
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
};