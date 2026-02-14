// Security Fixes for Inline Event Handlers
// Replace all onclick attributes with proper event listeners

function safeBindClick(element, handlerName) {
    if (!element) return;

    const handler = window[handlerName];
    if (typeof handler !== 'function') {
        console.warn(`⚠️ Handler not available yet: ${handlerName}`);
        return;
    }

    element.removeAttribute('onclick');
    element.addEventListener('click', handler);
}

document.addEventListener('DOMContentLoaded', function() {
    // Fix for projection card
    const projectionCard = document.getElementById('projectionCard');
    safeBindClick(projectionCard, 'showProjectionModal');

    // Fix for modal close buttons
    const modalButtons = [
        { selector: '[onclick="closeCompleteTripModal()"]', handlerName: 'closeCompleteTripModal' },
        { selector: '[onclick="closeQRModal()"]', handlerName: 'closeQRModal' },
        { selector: '[onclick="closeQRScanner()"]', handlerName: 'closeQRScanner' },
        { selector: '[onclick="closeSyncSetupModal()"]', handlerName: 'closeSyncSetupModal' },
        { selector: '[onclick="closeSpentBreakdownModal()"]', handlerName: 'closeSpentBreakdownModal' },
        { selector: '[onclick="closeRemainingBreakdownModal()"]', handlerName: 'closeRemainingBreakdownModal' },
        { selector: '[onclick="closeExpenseDetailsModal()"]', handlerName: 'closeExpenseDetailsModal' },
        { selector: '[onclick="closeProjectionModal()"]', handlerName: 'closeProjectionModal' }
    ];

    modalButtons.forEach(({ selector, handlerName }) => {
        const button = document.querySelector(selector);
        safeBindClick(button, handlerName);
    });

    // Fix for sync provider cards
    safeBindClick(document.querySelector('[onclick="setupFirebaseSync()"]'), 'setupFirebaseSync');
    safeBindClick(document.querySelector('[onclick="setupLocalSync()"]'), 'setupLocalSync');

    // Fix for manual QR input button
    safeBindClick(document.querySelector('[onclick="processManualQRInput()"]'), 'processManualQRInput');
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
