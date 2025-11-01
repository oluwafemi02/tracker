/**
 * Modal Manager - Modern, accessible modal system
 * Replaces blocking confirm() dialogs with professional UX
 */

class ModalManager {
    constructor() {
        this.modals = new Map();
        this.currentModal = null;
        this.init();
    }

    init() {
        // Add global styles for modals
        this.injectStyles();
        
        // Handle ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentModal) {
                this.close(this.currentModal);
            }
        });
    }

    injectStyles() {
        if (document.getElementById('modal-manager-styles')) return;
        
        const styles = `
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: fadeIn 0.2s ease-out;
                padding: 1rem;
            }

            .modal-container {
                background: var(--card-bg, #ffffff);
                border-radius: var(--border-radius-lg, 16px);
                box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
                max-width: 500px;
                width: 100%;
                max-height: 90vh;
                overflow: hidden;
                animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                display: flex;
                flex-direction: column;
            }

            .modal-header {
                padding: 1.5rem;
                border-bottom: 1px solid var(--border-color, #e2e8f0);
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .modal-icon {
                width: 48px;
                height: 48px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                flex-shrink: 0;
            }

            .modal-icon.info { background: #dbeafe; }
            .modal-icon.warning { background: #fef3c7; }
            .modal-icon.danger { background: #fee2e2; }
            .modal-icon.success { background: #d1fae5; }

            .modal-title-container {
                flex: 1;
            }

            .modal-title {
                font-size: 1.25rem;
                font-weight: 600;
                color: var(--text-primary, #1e293b);
                margin: 0;
            }

            .modal-subtitle {
                font-size: 0.875rem;
                color: var(--text-secondary, #64748b);
                margin: 0.25rem 0 0 0;
            }

            .modal-body {
                padding: 1.5rem;
                overflow-y: auto;
                flex: 1;
            }

            .modal-message {
                color: var(--text-primary, #1e293b);
                line-height: 1.6;
                margin: 0;
            }

            .modal-details {
                margin-top: 1rem;
                padding: 1rem;
                background: var(--background-alt, #f1f5f9);
                border-radius: 8px;
                font-size: 0.875rem;
                color: var(--text-secondary, #64748b);
            }

            .modal-footer {
                padding: 1rem 1.5rem;
                border-top: 1px solid var(--border-color, #e2e8f0);
                display: flex;
                gap: 0.75rem;
                justify-content: flex-end;
            }

            .modal-btn {
                padding: 0.625rem 1.25rem;
                border-radius: 8px;
                font-weight: 500;
                font-size: 0.9375rem;
                border: none;
                cursor: pointer;
                transition: all 0.2s;
                min-width: 80px;
            }

            .modal-btn:focus {
                outline: 2px solid var(--primary-color, #6366f1);
                outline-offset: 2px;
            }

            .modal-btn.primary {
                background: var(--primary-gradient, linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%));
                color: white;
            }

            .modal-btn.primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
            }

            .modal-btn.danger {
                background: var(--danger-gradient, linear-gradient(135deg, #ef4444 0%, #dc2626 100%));
                color: white;
            }

            .modal-btn.danger:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
            }

            .modal-btn.secondary {
                background: transparent;
                color: var(--text-secondary, #64748b);
                border: 1px solid var(--border-color, #e2e8f0);
            }

            .modal-btn.secondary:hover {
                background: var(--hover-bg, #f8fafc);
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(20px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            @media (max-width: 640px) {
                .modal-container {
                    max-width: 100%;
                    margin: 0.5rem;
                }
                
                .modal-footer {
                    flex-direction: column-reverse;
                }
                
                .modal-btn {
                    width: 100%;
                }
            }
        `;

        const styleEl = document.createElement('style');
        styleEl.id = 'modal-manager-styles';
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    /**
     * Show a confirmation dialog (replaces confirm())
     */
    confirm(options) {
        return new Promise((resolve) => {
            const {
                title = 'Confirm Action',
                message = 'Are you sure?',
                details = null,
                confirmText = 'Confirm',
                cancelText = 'Cancel',
                type = 'warning', // info, warning, danger, success
                confirmStyle = 'primary',
                icon = this.getDefaultIcon(type)
            } = options;

            const modalId = `modal-${Date.now()}`;
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', `${modalId}-title`);

            overlay.innerHTML = `
                <div class="modal-container">
                    <div class="modal-header">
                        <div class="modal-icon ${type}">
                            ${icon}
                        </div>
                        <div class="modal-title-container">
                            <h2 class="modal-title" id="${modalId}-title">${this.escapeHtml(title)}</h2>
                        </div>
                    </div>
                    <div class="modal-body">
                        <p class="modal-message">${this.escapeHtml(message)}</p>
                        ${details ? `<div class="modal-details">${this.escapeHtml(details)}</div>` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn secondary" data-action="cancel">
                            ${this.escapeHtml(cancelText)}
                        </button>
                        <button class="modal-btn ${confirmStyle}" data-action="confirm">
                            ${this.escapeHtml(confirmText)}
                        </button>
                    </div>
                </div>
            `;

            // Event handlers
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.handleResponse(modalId, false, resolve);
                }
            });

            overlay.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.action;
                    this.handleResponse(modalId, action === 'confirm', resolve);
                    
                    // Track analytics
                    if (window.analytics) {
                        window.analytics.track('modal_interaction', {
                            type: 'confirm',
                            action,
                            title
                        });
                    }
                });
            });

            document.body.appendChild(overlay);
            this.modals.set(modalId, overlay);
            this.currentModal = modalId;

            // Focus the confirm button
            setTimeout(() => {
                const confirmBtn = overlay.querySelector('[data-action="confirm"]');
                confirmBtn?.focus();
            }, 100);
        });
    }

    /**
     * Show an alert dialog
     */
    alert(options) {
        return new Promise((resolve) => {
            const {
                title = 'Alert',
                message = '',
                details = null,
                okText = 'OK',
                type = 'info',
                icon = this.getDefaultIcon(type)
            } = options;

            const modalId = `modal-${Date.now()}`;
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.setAttribute('role', 'alertdialog');
            overlay.setAttribute('aria-modal', 'true');

            overlay.innerHTML = `
                <div class="modal-container">
                    <div class="modal-header">
                        <div class="modal-icon ${type}">
                            ${icon}
                        </div>
                        <div class="modal-title-container">
                            <h2 class="modal-title">${this.escapeHtml(title)}</h2>
                        </div>
                    </div>
                    <div class="modal-body">
                        <p class="modal-message">${this.escapeHtml(message)}</p>
                        ${details ? `<div class="modal-details">${this.escapeHtml(details)}</div>` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn primary" data-action="ok">
                            ${this.escapeHtml(okText)}
                        </button>
                    </div>
                </div>
            `;

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target.closest('[data-action="ok"]')) {
                    this.handleResponse(modalId, true, resolve);
                }
            });

            document.body.appendChild(overlay);
            this.modals.set(modalId, overlay);
            this.currentModal = modalId;

            // Focus the OK button
            setTimeout(() => {
                overlay.querySelector('[data-action="ok"]')?.focus();
            }, 100);
        });
    }

    /**
     * Show a prompt dialog
     */
    prompt(options) {
        return new Promise((resolve) => {
            const {
                title = 'Input Required',
                message = '',
                defaultValue = '',
                placeholder = '',
                inputType = 'text',
                confirmText = 'OK',
                cancelText = 'Cancel',
                required = false
            } = options;

            const modalId = `modal-${Date.now()}`;
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';

            overlay.innerHTML = `
                <div class="modal-container">
                    <div class="modal-header">
                        <div class="modal-icon info">
                            ✏️
                        </div>
                        <div class="modal-title-container">
                            <h2 class="modal-title">${this.escapeHtml(title)}</h2>
                        </div>
                    </div>
                    <div class="modal-body">
                        <p class="modal-message">${this.escapeHtml(message)}</p>
                        <input 
                            type="${inputType}" 
                            class="modal-input" 
                            value="${this.escapeHtml(defaultValue)}" 
                            placeholder="${this.escapeHtml(placeholder)}"
                            ${required ? 'required' : ''}
                            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; margin-top: 1rem; font-size: 1rem;"
                        />
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn secondary" data-action="cancel">
                            ${this.escapeHtml(cancelText)}
                        </button>
                        <button class="modal-btn primary" data-action="confirm">
                            ${this.escapeHtml(confirmText)}
                        </button>
                    </div>
                </div>
            `;

            const input = overlay.querySelector('.modal-input');
            
            overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                const value = input.value.trim();
                if (required && !value) {
                    input.focus();
                    input.style.borderColor = '#ef4444';
                    return;
                }
                this.handleResponse(modalId, value || null, resolve);
            });

            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
                this.handleResponse(modalId, null, resolve);
            });

            // Submit on Enter key
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    overlay.querySelector('[data-action="confirm"]').click();
                }
            });

            document.body.appendChild(overlay);
            this.modals.set(modalId, overlay);
            this.currentModal = modalId;

            // Focus input
            setTimeout(() => {
                input.focus();
                input.select();
            }, 100);
        });
    }

    handleResponse(modalId, value, resolve) {
        const overlay = this.modals.get(modalId);
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease-out';
            setTimeout(() => {
                overlay.remove();
                this.modals.delete(modalId);
                if (this.currentModal === modalId) {
                    this.currentModal = null;
                }
                resolve(value);
            }, 200);
        }
    }

    close(modalId) {
        const overlay = this.modals.get(modalId);
        if (overlay) {
            overlay.remove();
            this.modals.delete(modalId);
            if (this.currentModal === modalId) {
                this.currentModal = null;
            }
        }
    }

    getDefaultIcon(type) {
        const icons = {
            info: 'ℹ️',
            warning: '⚠️',
            danger: '🚨',
            success: '✅',
            question: '❓'
        };
        return icons[type] || icons.info;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create global instance
window.modalManager = new ModalManager();

// Backwards compatibility: override native confirm/alert
if (typeof window.ENABLE_MODAL_OVERRIDE !== 'undefined' && window.ENABLE_MODAL_OVERRIDE) {
    window.nativeConfirm = window.confirm;
    window.nativeAlert = window.alert;
    
    window.confirm = async function(message) {
        return await window.modalManager.confirm({
            title: 'Confirm',
            message: message
        });
    };
    
    window.alert = async function(message) {
        return await window.modalManager.alert({
            title: 'Alert',
            message: message
        });
    };
}
