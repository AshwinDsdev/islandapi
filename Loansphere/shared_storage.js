/**
 * Session Storage Module
 *
 * This module provides a consistent interface for accessing sessionStorage data
 * across different HTML files in the Loansphere application.
 *
 * It ensures that data loaded in one HTML file is properly stored in sessionStorage
 * and can be accessed by other HTML files when they're opened in the same tab.
 */

// Storage keys
const STORAGE_KEYS = {
    BRANDS: "Brands_Store",
    LOANS: "Loans_Store",
    MESSAGES: "Messages_Store",
    QUEUES: "Queues_Store",
    USERS: "Users_Store"
};

// In-memory cache of loaded data
const dataCache = {
    brands: null,
    loans: null,
    messages: null,
    queues: null,
    users: null
};

/**
 * Initialize the session storage system
 * This should be called when each page loads
 */
function initializeSessionStorage() {
    console.log("Initializing session storage...");

    // Load cached data from sessionStorage if available
    loadCachedData();

    // Set up event listeners for window unload to save data
    window.addEventListener('beforeunload', saveDataToSessionStorage);

    console.log("Session storage initialized");
    return true;
}

/**
 * Load all cached data from sessionStorage into memory
 */
function loadCachedData() {
    try {
        // Check if we have brands data in window object
        if (window.storedNumbersSet) {
            dataCache.brands = window.storedNumbersSet;
            console.log("Brands data already loaded in window object");
        } else {
            // Try to load from sessionStorage
            const brandsData = getDataFromSessionStorage(STORAGE_KEYS.BRANDS);
            if (brandsData && brandsData.length > 0) {
                dataCache.brands = brandsData;
                window.storedNumbersSet = brandsData;
                console.log(`Loaded ${brandsData.length} brands from sessionStorage`);
            } else {
                console.log("No brands data found in sessionStorage");
            }
        }

        // Check for loans data
        if (window.storedLoansSet) {
            dataCache.loans = window.storedLoansSet;
            console.log("Loans data already loaded in window object");
        } else {
            const loansData = getDataFromSessionStorage(STORAGE_KEYS.LOANS);
            if (loansData && loansData.length > 0) {
                dataCache.loans = loansData;
                window.storedLoansSet = loansData;
                console.log(`Loaded ${loansData.length} loans from sessionStorage`);
            } else {
                console.log("No loans data found in sessionStorage");
            }
        }

        // Check for queues data
        if (window.storedQueuesSet) {
            dataCache.queues = window.storedQueuesSet;
            console.log("Queues data already loaded in window object");
        } else {
            const queuesData = getDataFromSessionStorage(STORAGE_KEYS.QUEUES);
            if (queuesData && queuesData.length > 0) {
                dataCache.queues = queuesData;
                window.storedQueuesSet = queuesData;
                console.log(`Loaded ${queuesData.length} queues from sessionStorage`);
            } else {
                console.log("No queues data found in sessionStorage");
            }
        }

        // Check for messages data
        if (window.storedMessagesSet) {
            dataCache.messages = window.storedMessagesSet;
            console.log("Messages data already loaded in window object");
        } else {
            const messagesData = getDataFromSessionStorage(STORAGE_KEYS.MESSAGES);
            if (messagesData && messagesData.length > 0) {
                dataCache.messages = messagesData;
                window.storedMessagesSet = messagesData;
                console.log(`Loaded ${messagesData.length} messages from sessionStorage`);
            } else {
                console.log("No messages data found in sessionStorage");
            }
        }

        // Check for users data
        if (window.storedUsersSet) {
            dataCache.users = window.storedUsersSet;
            console.log("Users data already loaded in window object");
        } else {
            const usersData = getDataFromSessionStorage(STORAGE_KEYS.USERS);
            if (usersData && usersData.length > 0) {
                dataCache.users = usersData;
                window.storedUsersSet = usersData;
                console.log(`Loaded ${usersData.length} users from sessionStorage`);
            } else {
                console.log("No users data found in sessionStorage");
            }
        }

        console.log("Cached data loaded", dataCache);
    } catch (error) {
        console.error("Error loading cached data:", error);
    }
}

/**
 * Save data to sessionStorage before page unload
 */
function saveDataToSessionStorage() {
    try {
        // Save brands data
        if (window.storedNumbersSet) {
            sessionStorage.setItem(STORAGE_KEYS.BRANDS, JSON.stringify(window.storedNumbersSet));
            console.log(`Saved ${window.storedNumbersSet.length} brands to sessionStorage`);
        }

        // Save loans data
        if (window.storedLoansSet) {
            sessionStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(window.storedLoansSet));
            console.log(`Saved ${window.storedLoansSet.length} loans to sessionStorage`);
        }

        // Save queues data
        if (window.storedQueuesSet) {
            sessionStorage.setItem(STORAGE_KEYS.QUEUES, JSON.stringify(window.storedQueuesSet));
            console.log(`Saved ${window.storedQueuesSet.length} queues to sessionStorage`);
        }

        // Save messages data
        if (window.storedMessagesSet) {
            sessionStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(window.storedMessagesSet));
            console.log(`Saved ${window.storedMessagesSet.length} messages to sessionStorage`);
        }

        // Save users data
        if (window.storedUsersSet) {
            sessionStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(window.storedUsersSet));
            console.log(`Saved ${window.storedUsersSet.length} users to sessionStorage`);
        }
    } catch (error) {
        console.error("Error saving data to sessionStorage:", error);
    }
}

/**
 * Get data from sessionStorage
 */
function getDataFromSessionStorage(key) {
    try {
        const data = sessionStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error(`Error getting data from ${key}:`, error);
        return null;
    }
}

/**
 * Wait for external data to be available
 */
async function waitForExternalData(dataKey, timeout = 5000, interval = 500) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const checkData = () => {
            // Check if data is available in window object
            if (window[dataKey]) {
                return resolve(window[dataKey]);
            }

            // Check if we've exceeded the timeout
            if (Date.now() - startTime > timeout) {
                console.warn(`Timeout waiting for ${dataKey}`);

                // Try to load from sessionStorage as a fallback
                const storageKey = dataKeyToStorageKey(dataKey);
                if (storageKey) {
                    const data = getDataFromSessionStorage(storageKey);
                    if (data) {
                        window[dataKey] = data;
                        return resolve(data);
                    }
                }

                return resolve(null);
            }

            // Try again after interval
            setTimeout(checkData, interval);
        };

        checkData();
    });
}

/**
 * Convert dataKey to storage key
 */
function dataKeyToStorageKey(dataKey) {
    switch (dataKey) {
        case 'storedNumbersSet': return STORAGE_KEYS.BRANDS;
        case 'storedLoansSet': return STORAGE_KEYS.LOANS;
        case 'storedQueuesSet': return STORAGE_KEYS.QUEUES;
        case 'storedMessagesSet': return STORAGE_KEYS.MESSAGES;
        case 'storedUsersSet': return STORAGE_KEYS.USERS;
        default: return null;
    }
}

/**
 * Update data in sessionStorage
 */
function updateSessionStorage(key, data) {
    try {
        sessionStorage.setItem(key, JSON.stringify(data));
        console.log(`Updated ${key} in sessionStorage`);
        return true;
    } catch (error) {
        console.error(`Error updating ${key} in sessionStorage:`, error);
        return false;
    }
}

// Export functions for use in other scripts
window.sessionStorageManager = {
    initialize: initializeSessionStorage,
    waitForData: waitForExternalData,
    getCache: () => dataCache,
    updateStorage: updateSessionStorage
};

// Auto-initialize when script loads
initializeSessionStorage();

// Monkey patch the original ingestion scripts' localStorage functions to use sessionStorage instead
// This ensures that any existing code that uses localStorage will now use sessionStorage
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    // Check if this is a key we want to intercept
    if (key.startsWith('Brands_Store') ||
        key.startsWith('Loans_Store') ||
        key.startsWith('Messages_Store') ||
        key.startsWith('Queues_Store') ||
        key.startsWith('Users_Store')) {

        // Use sessionStorage instead
        console.log(`Intercepted localStorage.setItem for ${key}, using sessionStorage instead`);
        sessionStorage.setItem(key, value);
    } else {
        // Use original localStorage for other keys
        originalSetItem.call(localStorage, key, value);
    }
};

const originalGetItem = localStorage.getItem;
localStorage.getItem = function(key) {
    // Check if this is a key we want to intercept
    if (key.startsWith('Brands_Store') ||
        key.startsWith('Loans_Store') ||
        key.startsWith('Messages_Store') ||
        key.startsWith('Queues_Store') ||
        key.startsWith('Users_Store')) {

        // Use sessionStorage instead
        console.log(`Intercepted localStorage.getItem for ${key}, using sessionStorage instead`);
        return sessionStorage.getItem(key);
    } else {
        // Use original localStorage for other keys
        return originalGetItem.call(localStorage, key);
    }
};