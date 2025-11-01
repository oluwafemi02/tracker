/**
 * Storage Manager - Safe localStorage operations with quota monitoring
 * Prevents data loss and handles storage errors gracefully
 */

class StorageManager {
    constructor() {
        this.QUOTA_WARNING_THRESHOLD = 0.8; // Warn at 80% capacity
        this.QUOTA_CRITICAL_THRESHOLD = 0.95; // Critical at 95%
        this.MAX_BACKUP_COUNT = 5;
        this.storageKey = 'app_storage_stats';
    }

    /**
     * Get storage usage information
     */
    async getStorageInfo() {
        try {
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const estimate = await navigator.storage.estimate();
                return {
                    usage: estimate.usage,
                    quota: estimate.quota,
                    percentUsed: (estimate.usage / estimate.quota) * 100,
                    available: estimate.quota - estimate.usage
                };
            }
        } catch (e) {
            console.warn('Could not estimate storage:', e);
        }
        
        // Fallback: estimate based on localStorage size
        return this.estimateLocalStorageUsage();
    }

    /**
     * Estimate localStorage usage (fallback method)
     */
    estimateLocalStorageUsage() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
        
        // localStorage typically has 5-10MB limit
        const estimatedQuota = 5 * 1024 * 1024; // 5MB conservative estimate
        
        return {
            usage: total * 2, // UTF-16 = 2 bytes per char
            quota: estimatedQuota,
            percentUsed: (total * 2 / estimatedQuota) * 100,
            available: estimatedQuota - (total * 2)
        };
    }

    /**
     * Check if storage operation is safe
     */
    async canStore(dataSize) {
        const info = await this.getStorageInfo();
        return info.available > dataSize * 1.2; // 20% safety margin
    }

    /**
     * Safe setItem with quota checking and backup
     */
    async setItem(key, value, options = {}) {
        const { backup = true, critical = false } = options;
        
        try {
            // Create backup if enabled
            if (backup && localStorage.getItem(key)) {
                this.createBackup(key, localStorage.getItem(key));
            }

            // Check storage availability
            const dataSize = new Blob([value]).size;
            const storageInfo = await this.getStorageInfo();
            
            if (storageInfo.percentUsed > this.QUOTA_CRITICAL_THRESHOLD * 100) {
                if (critical) {
                    // For critical data, try to free space
                    await this.cleanupOldBackups();
                } else {
                    throw new Error('Storage quota exceeded');
                }
            }

            // Attempt to save
            localStorage.setItem(key, value);
            
            // Check if save was successful
            if (localStorage.getItem(key) !== value) {
                throw new Error('Storage verification failed');
            }

            // Warn if approaching quota
            if (storageInfo.percentUsed > this.QUOTA_WARNING_THRESHOLD * 100) {
                this.notifyStorageWarning(storageInfo);
            }

            return { success: true, storageInfo };
            
        } catch (error) {
            // Attempt to restore from backup
            if (backup) {
                this.restoreFromBackup(key);
            }
            
            return {
                success: false,
                error: error.message,
                code: error.name === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' : 'STORAGE_ERROR'
            };
        }
    }

    /**
     * Safe getItem with validation
     */
    getItem(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value !== null ? value : defaultValue;
        } catch (error) {
            console.error(`Error reading ${key}:`, error);
            return defaultValue;
        }
    }

    /**
     * Safe JSON parse with validation
     */
    getJSON(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            if (value === null) return defaultValue;
            return JSON.parse(value);
        } catch (error) {
            console.error(`Error parsing JSON for ${key}:`, error);
            return defaultValue;
        }
    }

    /**
     * Safe JSON stringify and save
     */
    async setJSON(key, data, options = {}) {
        try {
            const jsonString = JSON.stringify(data);
            return await this.setItem(key, jsonString, options);
        } catch (error) {
            return {
                success: false,
                error: 'JSON serialization failed: ' + error.message,
                code: 'JSON_ERROR'
            };
        }
    }

    /**
     * Transaction-safe batch save with rollback
     */
    async transaction(operations) {
        const backups = new Map();
        const completed = [];

        try {
            // Create backups for all keys
            for (const op of operations) {
                if (op.type === 'set') {
                    const existing = localStorage.getItem(op.key);
                    if (existing) {
                        backups.set(op.key, existing);
                    }
                }
            }

            // Execute all operations
            for (const op of operations) {
                if (op.type === 'set') {
                    const result = await this.setJSON(op.key, op.value, { backup: false });
                    if (!result.success) {
                        throw new Error(`Failed to set ${op.key}: ${result.error}`);
                    }
                    completed.push(op.key);
                } else if (op.type === 'remove') {
                    localStorage.removeItem(op.key);
                    completed.push(op.key);
                }
            }

            return { success: true, completed };

        } catch (error) {
            // Rollback all changes
            console.warn('Transaction failed, rolling back...', error);
            
            for (const key of completed) {
                if (backups.has(key)) {
                    localStorage.setItem(key, backups.get(key));
                } else {
                    localStorage.removeItem(key);
                }
            }

            return {
                success: false,
                error: error.message,
                rolledBack: completed
            };
        }
    }

    /**
     * Create backup of data
     */
    createBackup(key, value) {
        try {
            const backupKey = `backup_${key}_${Date.now()}`;
            localStorage.setItem(backupKey, value);
            
            // Clean old backups
            this.cleanupOldBackups(key);
        } catch (error) {
            console.warn('Backup creation failed:', error);
        }
    }

    /**
     * Restore from most recent backup
     */
    restoreFromBackup(key) {
        try {
            const backups = this.getBackups(key);
            if (backups.length > 0) {
                const latest = backups[backups.length - 1];
                localStorage.setItem(key, latest.value);
                return true;
            }
        } catch (error) {
            console.error('Backup restoration failed:', error);
        }
        return false;
    }

    /**
     * Get all backups for a key
     */
    getBackups(key) {
        const backups = [];
        const prefix = `backup_${key}_`;
        
        for (let storageKey in localStorage) {
            if (storageKey.startsWith(prefix)) {
                const timestamp = parseInt(storageKey.replace(prefix, ''));
                backups.push({
                    key: storageKey,
                    timestamp,
                    value: localStorage.getItem(storageKey)
                });
            }
        }
        
        return backups.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Clean up old backups
     */
    cleanupOldBackups(key = null) {
        try {
            if (key) {
                const backups = this.getBackups(key);
                if (backups.length > this.MAX_BACKUP_COUNT) {
                    const toRemove = backups.slice(0, backups.length - this.MAX_BACKUP_COUNT);
                    toRemove.forEach(backup => localStorage.removeItem(backup.key));
                }
            } else {
                // Clean all old backups
                const allBackups = [];
                for (let storageKey in localStorage) {
                    if (storageKey.startsWith('backup_')) {
                        const parts = storageKey.split('_');
                        const timestamp = parseInt(parts[parts.length - 1]);
                        allBackups.push({ key: storageKey, timestamp });
                    }
                }
                
                // Remove backups older than 7 days
                const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                allBackups
                    .filter(b => b.timestamp < weekAgo)
                    .forEach(b => localStorage.removeItem(b.key));
            }
        } catch (error) {
            console.warn('Backup cleanup failed:', error);
        }
    }

    /**
     * Notify user about storage warnings
     */
    notifyStorageWarning(storageInfo) {
        const percent = storageInfo.percentUsed.toFixed(1);
        const available = (storageInfo.available / 1024 / 1024).toFixed(1);
        
        if (typeof window.showNotification === 'function') {
            if (storageInfo.percentUsed > this.QUOTA_CRITICAL_THRESHOLD * 100) {
                window.showNotification(
                    `⚠️ Storage almost full (${percent}%)! Please export your data.`,
                    'error'
                );
            } else if (storageInfo.percentUsed > this.QUOTA_WARNING_THRESHOLD * 100) {
                window.showNotification(
                    `⚠️ Storage ${percent}% full. ${available}MB remaining.`,
                    'warning'
                );
            }
        }
    }

    /**
     * Export all data for backup
     */
    exportAllData() {
        const data = {};
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key) && !key.startsWith('backup_')) {
                data[key] = localStorage.getItem(key);
            }
        }
        return data;
    }

    /**
     * Import data from backup
     */
    async importAllData(data) {
        const operations = Object.entries(data).map(([key, value]) => ({
            type: 'set',
            key,
            value: JSON.parse(value)
        }));
        
        return await this.transaction(operations);
    }

    /**
     * Clear all data with confirmation backup
     */
    async clearAll(createBackup = true) {
        try {
            if (createBackup) {
                const allData = this.exportAllData();
                const backupKey = `full_backup_${Date.now()}`;
                sessionStorage.setItem(backupKey, JSON.stringify(allData));
            }
            
            localStorage.clear();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Create global instance
window.storageManager = new StorageManager();
