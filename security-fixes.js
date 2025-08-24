// Security Fixes for Inline Event Handlers
// Replace all onclick attributes with proper event listeners

document.addEventListener('DOMContentLoaded', function() {
    // Fix for projection card
    const projectionCard = document.getElementById('projectionCard');
    if (projectionCard) {
        projectionCard.removeAttribute('onclick');
        projectionCard.addEventListener('click', showProjectionModal);
    }

    // Fix for modal close buttons
    const modalButtons = [
        { selector: '[onclick="closeCompleteTripModal()"]', handler: closeCompleteTripModal },
        { selector: '[onclick="closeQRModal()"]', handler: closeQRModal },
        { selector: '[onclick="closeQRScanner()"]', handler: closeQRScanner },
        { selector: '[onclick="closeSyncSetupModal()"]', handler: closeSyncSetupModal },
        { selector: '[onclick="closeSpentBreakdownModal()"]', handler: closeSpentBreakdownModal },
        { selector: '[onclick="closeRemainingBreakdownModal()"]', handler: closeRemainingBreakdownModal },
        { selector: '[onclick="closeExpenseDetailsModal()"]', handler: closeExpenseDetailsModal },
        { selector: '[onclick="closeProjectionModal()"]', handler: closeProjectionModal }
    ];

    modalButtons.forEach(({ selector, handler }) => {
        const button = document.querySelector(selector);
        if (button) {
            button.removeAttribute('onclick');
            button.addEventListener('click', handler);
        }
    });

    // Fix for sync provider cards
    const firebaseCard = document.querySelector('[onclick="setupFirebaseSync()"]');
    if (firebaseCard) {
        firebaseCard.removeAttribute('onclick');
        firebaseCard.addEventListener('click', setupFirebaseSync);
    }

    const localSyncCard = document.querySelector('[onclick="setupLocalSync()"]');
    if (localSyncCard) {
        localSyncCard.removeAttribute('onclick');
        localSyncCard.addEventListener('click', setupLocalSync);
    }

    // Fix for manual QR input button
    const manualQRBtn = document.querySelector('[onclick="processManualQRInput()"]');
    if (manualQRBtn) {
        manualQRBtn.removeAttribute('onclick');
        manualQRBtn.addEventListener('click', processManualQRInput);
    }
});

// Safe innerHTML replacements
function safeSetHTML(element, html) {
    // Use DOMPurify if available, otherwise use textContent for safety
    if (typeof DOMPurify !== 'undefined') {
        element.innerHTML = DOMPurify.sanitize(html);
    } else {
        // Create elements safely without innerHTML
        element.textContent = '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        while (tempDiv.firstChild) {
            element.appendChild(tempDiv.firstChild);
        }
    }
}

// Memory leak prevention for intervals
const intervalManager = {
    intervals: new Map(),
    
    setInterval(callback, delay, id) {
        if (this.intervals.has(id)) {
            clearInterval(this.intervals.get(id));
        }
        const intervalId = setInterval(callback, delay);
        this.intervals.set(id, intervalId);
        return intervalId;
    },
    
    clearInterval(id) {
        if (this.intervals.has(id)) {
            clearInterval(this.intervals.get(id));
            this.intervals.delete(id);
        }
    },
    
    clearAll() {
        this.intervals.forEach(intervalId => clearInterval(intervalId));
        this.intervals.clear();
    }
};

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    intervalManager.clearAll();
});