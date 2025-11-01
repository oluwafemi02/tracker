/**
 * Performance Optimizer - Improve app performance for large datasets
 * Implements debouncing, throttling, lazy loading, and virtual scrolling
 */

class PerformanceOptimizer {
    constructor() {
        this.debounceTimers = new Map();
        this.throttleTimers = new Map();
        this.cachedCalculations = new Map();
        this.cacheTimeout = 5000; // 5 seconds
    }

    /**
     * Debounce function - delays execution until after wait time of inactivity
     */
    debounce(func, wait = 300, immediate = false) {
        return (...args) => {
            const context = this;
            const callNow = immediate && !this.debounceTimers.has(func);
            
            if (this.debounceTimers.has(func)) {
                clearTimeout(this.debounceTimers.get(func));
            }

            const later = () => {
                this.debounceTimers.delete(func);
                if (!immediate) {
                    func.apply(context, args);
                }
            };

            const timeout = setTimeout(later, wait);
            this.debounceTimers.set(func, timeout);

            if (callNow) {
                func.apply(context, args);
            }
        };
    }

    /**
     * Throttle function - ensures function is called at most once per wait time
     */
    throttle(func, wait = 300) {
        return (...args) => {
            const context = this;
            
            if (this.throttleTimers.has(func)) {
                return;
            }

            func.apply(context, args);
            
            const timeout = setTimeout(() => {
                this.throttleTimers.delete(func);
            }, wait);
            
            this.throttleTimers.set(func, timeout);
        };
    }

    /**
     * Memoize expensive calculations
     */
    memoize(func, keyGenerator = (...args) => JSON.stringify(args)) {
        return (...args) => {
            const key = keyGenerator(...args);
            
            if (this.cachedCalculations.has(key)) {
                const cached = this.cachedCalculations.get(key);
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.value;
                }
            }

            const result = func(...args);
            this.cachedCalculations.set(key, {
                value: result,
                timestamp: Date.now()
            });

            return result;
        };
    }

    /**
     * Clear cache
     */
    clearCache(pattern = null) {
        if (pattern) {
            for (const [key] of this.cachedCalculations) {
                if (key.includes(pattern)) {
                    this.cachedCalculations.delete(key);
                }
            }
        } else {
            this.cachedCalculations.clear();
        }
    }

    /**
     * Virtual Scrolling Implementation
     */
    createVirtualScroller(container, items, renderItem, options = {}) {
        const {
            itemHeight = 80,
            bufferSize = 5,
            onRender = null
        } = options;

        let scrollTop = 0;
        const containerHeight = container.clientHeight;
        const totalHeight = items.length * itemHeight;
        
        // Create scroll container
        const scrollContainer = document.createElement('div');
        scrollContainer.style.height = `${totalHeight}px`;
        scrollContainer.style.position = 'relative';

        // Create viewport
        const viewport = document.createElement('div');
        viewport.style.position = 'absolute';
        viewport.style.top = '0';
        viewport.style.left = '0';
        viewport.style.right = '0';

        scrollContainer.appendChild(viewport);
        container.innerHTML = '';
        container.appendChild(scrollContainer);

        const render = () => {
            const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
            const endIndex = Math.min(
                items.length,
                Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferSize
            );

            const visibleItems = items.slice(startIndex, endIndex);
            const fragment = document.createDocumentFragment();

            visibleItems.forEach((item, index) => {
                const element = renderItem(item, startIndex + index);
                element.style.position = 'absolute';
                element.style.top = `${(startIndex + index) * itemHeight}px`;
                element.style.left = '0';
                element.style.right = '0';
                element.style.height = `${itemHeight}px`;
                fragment.appendChild(element);
            });

            viewport.innerHTML = '';
            viewport.appendChild(fragment);

            if (onRender) {
                onRender({ startIndex, endIndex, visibleCount: visibleItems.length });
            }
        };

        // Throttle scroll events
        const handleScroll = this.throttle(() => {
            scrollTop = container.scrollTop;
            render();
        }, 16); // ~60fps

        container.addEventListener('scroll', handleScroll);

        // Initial render
        render();

        // Return API
        return {
            refresh: render,
            destroy: () => {
                container.removeEventListener('scroll', handleScroll);
            },
            scrollToIndex: (index) => {
                container.scrollTop = index * itemHeight;
                scrollTop = container.scrollTop;
                render();
            }
        };
    }

    /**
     * Lazy load images
     */
    lazyLoadImages(selector = 'img[data-src]') {
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        imageObserver.unobserve(img);
                    }
                });
            });

            document.querySelectorAll(selector).forEach(img => {
                imageObserver.observe(img);
            });
        } else {
            // Fallback for browsers without IntersectionObserver
            document.querySelectorAll(selector).forEach(img => {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            });
        }
    }

    /**
     * Batch DOM updates
     */
    batchDOMUpdates(updates) {
        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();
            updates.forEach(update => update(fragment));
        });
    }

    /**
     * Optimize search with debouncing and indexing
     */
    createSearchOptimizer(data, searchFields) {
        // Create search index
        const index = new Map();
        
        data.forEach((item, idx) => {
            searchFields.forEach(field => {
                const value = item[field];
                if (value) {
                    const words = value.toLowerCase().split(/\s+/);
                    words.forEach(word => {
                        if (!index.has(word)) {
                            index.set(word, new Set());
                        }
                        index.get(word).add(idx);
                    });
                }
            });
        });

        const search = (query) => {
            if (!query || query.length < 2) return data;

            const terms = query.toLowerCase().split(/\s+/);
            const matchingSets = terms.map(term => {
                const matches = new Set();
                // Find all words that start with the term
                for (const [word, indices] of index) {
                    if (word.startsWith(term)) {
                        indices.forEach(idx => matches.add(idx));
                    }
                }
                return matches;
            });

            // Intersect all matching sets
            let results = matchingSets[0];
            for (let i = 1; i < matchingSets.length; i++) {
                results = new Set([...results].filter(x => matchingSets[i].has(x)));
            }

            return [...results].map(idx => data[idx]);
        };

        return {
            search: this.debounce(search, 150),
            updateIndex: (newData) => {
                // Rebuild index with new data
                data = newData;
                index.clear();
                // ... rebuild logic
            }
        };
    }

    /**
     * Optimize array operations for large datasets
     */
    optimizedFilter(array, predicate, maxResults = null) {
        const results = [];
        for (let i = 0; i < array.length; i++) {
            if (predicate(array[i], i)) {
                results.push(array[i]);
                if (maxResults && results.length >= maxResults) {
                    break;
                }
            }
        }
        return results;
    }

    optimizedMap(array, mapper, batchSize = 100) {
        const results = [];
        for (let i = 0; i < array.length; i += batchSize) {
            const batch = array.slice(i, i + batchSize);
            results.push(...batch.map(mapper));
            
            // Allow UI to breathe between batches
            if (i + batchSize < array.length) {
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve(this.optimizedMap(array.slice(i + batchSize), mapper, batchSize));
                    }, 0);
                });
            }
        }
        return results;
    }

    /**
     * Progressive rendering for large lists
     */
    progressiveRender(container, items, renderItem, options = {}) {
        const {
            batchSize = 20,
            delay = 16, // ~60fps
            onProgress = null,
            onComplete = null
        } = options;

        let currentIndex = 0;
        const fragment = document.createDocumentFragment();

        const renderBatch = () => {
            const endIndex = Math.min(currentIndex + batchSize, items.length);
            
            for (let i = currentIndex; i < endIndex; i++) {
                const element = renderItem(items[i], i);
                fragment.appendChild(element);
            }

            container.appendChild(fragment);
            currentIndex = endIndex;

            if (onProgress) {
                onProgress({
                    current: currentIndex,
                    total: items.length,
                    progress: (currentIndex / items.length) * 100
                });
            }

            if (currentIndex < items.length) {
                setTimeout(renderBatch, delay);
            } else if (onComplete) {
                onComplete();
            }
        };

        renderBatch();

        return {
            cancel: () => {
                currentIndex = items.length; // Stop rendering
            }
        };
    }

    /**
     * Request Idle Callback wrapper with fallback
     */
    scheduleIdleTask(task, options = {}) {
        if ('requestIdleCallback' in window) {
            return requestIdleCallback(task, options);
        } else {
            // Fallback for Safari
            return setTimeout(() => {
                task({ didTimeout: false, timeRemaining: () => 50 });
            }, 1);
        }
    }

    /**
     * Cancel idle task
     */
    cancelIdleTask(id) {
        if ('cancelIdleCallback' in window) {
            cancelIdleCallback(id);
        } else {
            clearTimeout(id);
        }
    }

    /**
     * Monitor and report performance metrics
     */
    measurePerformance(name, fn) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;

        if (window.logger) {
            window.logger.performance(name, duration);
        }

        return { result, duration };
    }

    async measureAsyncPerformance(name, fn) {
        const start = performance.now();
        const result = await fn();
        const duration = performance.now() - start;

        if (window.logger) {
            window.logger.performance(name, duration);
        }

        return { result, duration };
    }

    /**
     * Get performance report
     */
    getPerformanceReport() {
        return {
            cacheSize: this.cachedCalculations.size,
            activeDebounces: this.debounceTimers.size,
            activeThrottles: this.throttleTimers.size,
            memory: performance.memory ? {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            } : null
        };
    }
}

// Create global instance
window.performanceOptimizer = new PerformanceOptimizer();

// Export helpful utilities
window.debounce = (fn, wait) => window.performanceOptimizer.debounce(fn, wait);
window.throttle = (fn, wait) => window.performanceOptimizer.throttle(fn, wait);
window.memoize = (fn) => window.performanceOptimizer.memoize(fn);
