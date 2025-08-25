const APP_VERSION = '0.0.2';
const CACHE_NAME = `expense-tracker-v${APP_VERSION}`;
const urlsToCache = [
  '/tracker/',
  '/tracker/index.html',
  '/tracker/manifest.json',
  // Only cache files that exist
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('💾 Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker installed');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - network first for HTML, cache first for others
self.addEventListener('fetch', event => {
  // Skip non-GET requests and Chrome extension requests
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // For HTML files (main app), always try network first to get latest version
  if (event.request.destination === 'document' || event.request.url.includes('index.html') || event.request.url.endsWith('/tracker/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If network succeeds, cache and return the fresh version
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return response;
          }
          return response;
        })
        .catch(() => {
          // If network fails, fall back to cache
          return caches.match(event.request)
            .then(cachedResponse => {
              return cachedResponse || caches.match('/tracker/index.html');
            });
        })
    );
    return;
  }

  // For other resources, use cache first strategy
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version if available
        if (response) {
          return response;
        }
        
        // Otherwise fetch from network
        return fetch(event.request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      }).catch(() => {
        // If both cache and network fail, show offline page for navigation requests
        if (event.request.destination === 'document') {
          return caches.match('/tracker/index.html');
        }
      })
  );
});

// Push event - handle push notifications
self.addEventListener('push', event => {
  console.log('📱 Push notification received:', event);
  
  let options = {
    body: 'You have a new notification from Expense Tracker',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'expense-notification',
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'View App',
        icon: '/icons/action-view.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/action-dismiss.png'
      }
    ],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      options.title = data.title || 'Expense Tracker';
      options.body = data.body || options.body;
      options.icon = data.icon || options.icon;
      options.badge = data.badge || options.badge;
      options.tag = data.tag || options.tag;
      options.data = { ...options.data, ...data.data };
      
      // Handle different notification types
      if (data.type === 'budget-warning') {
        options.body = `⚠️ ${data.body}`;
        options.requireInteraction = true;
      } else if (data.type === 'recurring-reminder') {
        options.body = `🔄 ${data.body}`;
        options.actions = [
          {
            action: 'add-expense',
            title: 'Add Now',
            icon: '/icons/action-add.png'
          },
          {
            action: 'remind-later',
            title: 'Remind Later',
            icon: '/icons/action-later.png'
          }
        ];
      } else if (data.type === 'monthly-summary') {
        options.body = `📊 ${data.body}`;
        options.actions = [
          {
            action: 'view-dashboard',
            title: 'View Dashboard',
            icon: '/icons/action-dashboard.png'
          },
          {
            action: 'dismiss',
            title: 'Dismiss',
            icon: '/icons/action-dismiss.png'
          }
        ];
      }
    } catch (error) {
      console.error('Error parsing push notification data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(options.title || 'Expense Tracker', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification clicked:', event);
  
  event.notification.close();

  let url = '/';
  
  // Handle different actions
  if (event.action === 'view' || event.action === 'view-dashboard') {
    url = '/?tab=dashboard';
  } else if (event.action === 'add-expense') {
    // For recurring expenses, pre-fill the form
    if (event.notification.data && event.notification.data.category) {
      url = `/?action=add&category=${encodeURIComponent(event.notification.data.category)}&amount=${event.notification.data.amount}`;
    } else {
      url = '/?action=add';
    }
  } else if (event.action === 'view-recurring') {
    url = '/?action=recurring';
  } else if (event.action === 'remind-later') {
    // Schedule another notification for later (2 hours)
    scheduleReminderNotification(event.notification.data);
    return;
  } else if (event.action === 'dismiss') {
    return;
  } else if (!event.action) {
    // No action specified, just open the app
    if (event.notification.data && event.notification.data.type === 'recurring-reminder') {
      url = '/?action=recurring';
    }
  }

  event.waitUntil(
    clients.matchAll().then(clientList => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) {
          // Send message to existing client to handle the action
          client.postMessage({
            type: 'notification-action',
            action: event.action || 'open',
            data: event.notification.data,
            url: url
          });
          return client.focus();
        }
      }
      
      // Open new window/tab
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync for offline data synchronization
self.addEventListener('sync', event => {
  console.log('🔄 Background sync event:', event.tag);
  
  if (event.tag === 'expense-sync') {
    event.waitUntil(syncOfflineExpenses());
  } else if (event.tag === 'budget-sync') {
    event.waitUntil(syncBudgetData());
  }
});

// Sync offline expenses when connection is restored
async function syncOfflineExpenses() {
  try {
    console.log('📤 Syncing offline expenses...');
    
    // Get offline data from IndexedDB
    const offlineExpenses = await getOfflineExpenses();
    
    if (offlineExpenses.length > 0) {
      // Send to server or process locally
      await processOfflineExpenses(offlineExpenses);
      
      // Clear offline storage
      await clearOfflineExpenses();
      
      console.log(`✅ Synced ${offlineExpenses.length} offline expenses`);
      
      // Notify user of successful sync
      self.registration.showNotification('Expenses Synced', {
        body: `${offlineExpenses.length} offline expenses have been synced.`,
        icon: '/icons/icon-192x192.png',
        tag: 'sync-complete'
      });
    }
  } catch (error) {
    console.error('❌ Error syncing offline expenses:', error);
  }
}

// Helper functions for offline storage
async function getOfflineExpenses() {
  // Implementation would interact with IndexedDB
  return [];
}

async function processOfflineExpenses(expenses) {
  // Implementation would process the expenses
  console.log('Processing offline expenses:', expenses);
}

async function clearOfflineExpenses() {
  // Implementation would clear offline storage
  console.log('Clearing offline expenses');
}

async function syncBudgetData() {
  console.log('📊 Syncing budget data...');
  // Implementation for budget sync
}

function scheduleReminderNotification(data) {
  // Schedule a reminder notification for later
  console.log('⏰ Scheduling reminder notification for later', data);
  
  setTimeout(() => {
    let title = 'Expense Reminder';
    let body = 'Don\'t forget to add your pending expense!';
    
    if (data && data.category) {
      const icon = '📝'; // Default icon since we can't access categoryIcons here
      title = 'Recurring Expense Reminder';
      body = `${icon} Don't forget: ${data.category} (€${data.amount}) is still pending!`;
    }
    
    self.registration.showNotification(title, {
      body: body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag: 'reminder-later',
      requireInteraction: true,
      actions: [
        {
          action: 'add-expense',
          title: 'Add Now'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ],
      data: data
    });
  }, 2 * 60 * 60 * 1000); // 2 hours later
}

// Message handling for communication with main app
self.addEventListener('message', event => {
  console.log('📨 Message received in SW:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      type: 'VERSION',
      version: CACHE_NAME
    });
  } else if (event.data && event.data.type === 'CACHE_EXPENSE') {
    // Cache expense data for offline use
    cacheExpenseData(event.data.expense);
  }
});

async function cacheExpenseData(expense) {
  try {
    // Store expense in IndexedDB for offline access
    console.log('💾 Caching expense data:', expense);
    // Implementation would store in IndexedDB
  } catch (error) {
    console.error('❌ Error caching expense data:', error);
  }
}

// Periodic background sync for budget reminders
self.addEventListener('periodicsync', event => {
  if (event.tag === 'budget-check') {
    event.waitUntil(checkBudgetStatus());
  }
});

async function checkBudgetStatus() {
  console.log('🔍 Checking budget status...');
  
  try {
    // Get current budget and expenses
    // This would typically fetch from your local storage or API
    const currentSpending = await getCurrentMonthSpending();
    const monthlyBudget = await getMonthlyBudget();
    
    if (monthlyBudget > 0 && currentSpending > monthlyBudget * 0.8) {
      const percentUsed = Math.round((currentSpending / monthlyBudget) * 100);
      
      self.registration.showNotification('Budget Alert', {
        body: `You've used ${percentUsed}% of your monthly budget.`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: 'budget-warning',
        requireInteraction: true,
        actions: [
          {
            action: 'view-dashboard',
            title: 'View Details',
            icon: '/icons/action-dashboard.png'
          }
        ]
      });
    }
  } catch (error) {
    console.error('❌ Error checking budget status:', error);
  }
}

async function getCurrentMonthSpending() {
  // Implementation would get current spending
  return 0;
}

async function getMonthlyBudget() {
  // Implementation would get monthly budget
  return 0;
}

console.log('🚀 Service Worker script loaded');