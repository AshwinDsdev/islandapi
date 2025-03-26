// ########## DO NOT MODIFY THESE LINES ##########
const STORE_NAME = "Loans_Store"; // Name of the object store in sharedStorage
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CHUNK_SIZE = 10000; // Batch size for encryption
const SALT = "static_salt_value";

// Initialize BroadcastChannel for cross-tab communication
let channel;
try {
    channel = new BroadcastChannel("island_channel");
    console.log("BroadcastChannel initialized successfully");
} catch (error) {
    console.error("Failed to initialize BroadcastChannel:", error);
    // Fallback to a dummy channel that does nothing
    channel = {
        postMessage: (msg) => console.log("Would send message if BroadcastChannel was supported:", msg),
        addEventListener: () => console.log("BroadcastChannel not supported in this browser"),
        close: () => {}
    };
}

const sharedStorage = {
    async storeData(storeName, key, value) {
        // Store in both localStorage and sessionStorage
        localStorage.setItem(`${storeName}-${key}`, JSON.stringify(value));
        sessionStorage.setItem(`${storeName}-${key}`, JSON.stringify(value));
        return { success: true };
    },
    async getData(storeName, key) {
        // Try to get from sessionStorage first, then fallback to localStorage
        let data = sessionStorage.getItem(`${storeName}-${key}`);
        if (!data) {
            data = localStorage.getItem(`${storeName}-${key}`);
        }
        return data ? { success: true, data: JSON.parse(data) } : { success: false };
    },
    async clearStore(storeName) {
        // Clear both localStorage and sessionStorage
        Object.keys(localStorage)
            .filter((key) => key.startsWith(`${storeName}-`))
            .forEach((key) => localStorage.removeItem(key));
        Object.keys(sessionStorage)
            .filter((key) => key.startsWith(`${storeName}-`))
            .forEach((key) => sessionStorage.removeItem(key));
    },
    async getLastUpdated(storeName) {
        // Try sessionStorage first, then fallback to localStorage
        let lastUpdated = sessionStorage.getItem(`${storeName}-lastUpdated`);
        if (!lastUpdated) {
            lastUpdated = localStorage.getItem(`${storeName}-lastUpdated`);
        }
        return lastUpdated ? { lastUpdated } : { lastUpdated: null };
    }
};

// ########## DO NOT MODIFY THESE LINES - END ##########

// ########## MODIFY THESE LINES AS REQUIRED ##########
const DATA_RETENTION_HOURS = 24; // How fresh the loan numbers should be kept (24 hours)
const DATA_URL = "http://localhost:5000/api/queues"; // Updated API endpoint
// ########## MODIFY THESE LINES AS REQUIRED - END ##########

// Cache in memory
var storedQueuesSet = null;     // Will hold the decrypted numbers
let encryptionKey = null;        // AES-GCM key

/**
 * Fetch numbers from remote, encrypt, and store in sharedStorage
 * @param {string} dataType - Type of data being fetched (used for storage prefixing)
 * @param {string} url - URL to fetch data from (defaults to DATA_URL)
 */
async function fetchAndStoreNumbers(dataType = 'queues', url = DATA_URL) {
  console.log(`Checking if ${dataType} data needs updating...`);

  // Use the data type prefix for storage keys
  const storePrefix = `${dataType}-`;

  // Get the last updated timestamp for this specific data type
  const lastUpdatedRes = await sharedStorage.getData(STORE_NAME, `${storePrefix}lastUpdated`);
  const lastUpdated = lastUpdatedRes.success ? lastUpdatedRes.data : null;
  const now = Date.now();

  // If data is still fresh, no update
  if (
    lastUpdated &&
    now - parseInt(lastUpdated, 10) < DATA_RETENTION_HOURS * 60 * 60 * 1000
  ) {
    console.log(`${dataType} data is fresh, no update needed.`);
    await loadDataIntoMemory(dataType); // Load data into memory
    return false; // Return false to indicate no update was performed
  }

  // Otherwise, fetch data from API
  console.log(`Fetching new ${dataType} data from ${url}...`);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);

    const jsonData = await response.json();
    console.log(jsonData, "jsonData");
    const fetchedData = jsonData;
    console.log(
      `Fetched ${fetchedData.length} ${dataType} records, storing (encrypted in batches)...`
    );

    // Store with the specific data type
    await storeData(fetchedData, dataType);

    console.log(`${dataType} data successfully updated.`);
    return true; // Return true to indicate data was updated
  } catch (error) {
    console.error(`Error fetching ${dataType} data:`, error);
    await loadDataIntoMemory(dataType); // Load existing data into memory
    return false; // Return false to indicate no update was performed
  }
}

async function storeData(data, dataType = 'queues') {
    // Use a unique prefix for this data type to avoid conflicts with other ingestion files
    const storePrefix = `${dataType}-`;

    // Clear only the data for this specific data type
    await clearStoreByPrefix(STORE_NAME, storePrefix);

    // Store in memory
    storedQueuesSet = data; // Store complete objects
    window.storedQueuesSet = storedQueuesSet; // Update global variable

    const chunkCount = Math.ceil(data.length / CHUNK_SIZE);

    for (let i = 0; i < chunkCount; i++) {
        const startIndex = i * CHUNK_SIZE;
        const endIndex = startIndex + CHUNK_SIZE;
        const batch = data.slice(startIndex, endIndex);

        const encryptedBatch = await encryptBatch(batch);

        const chunkKey = `${storePrefix}chunk-${i}`;
        const result = await sharedStorage.storeData(STORE_NAME, chunkKey, encryptedBatch, {});
        if (!result.success) {
            throw new Error(`Failed to store chunk #${i}: ${result.error}`);
        }
    }

    // Store meta information with data type prefix
    const metaRecord = { chunkCount, dataType };
    const metaRes = await sharedStorage.storeData(STORE_NAME, `${storePrefix}meta`, metaRecord, {});
    if (!metaRes.success) {
        throw new Error(`Failed to store meta info: ${metaRes.error}`);
    }

    // Update the lastUpdated timestamp with data type prefix
    const now = Date.now();
    await sharedStorage.storeData(STORE_NAME, `${storePrefix}lastUpdated`, now);

    console.log(`Successfully stored ${data.length} ${dataType} records in ${chunkCount} chunks.`);
}

// Helper function to clear only specific prefixed items from storage
async function clearStoreByPrefix(storeName, prefix) {
    // Clear localStorage items with this prefix
    Object.keys(localStorage)
        .filter((key) => key.startsWith(`${storeName}-${prefix}`))
        .forEach((key) => localStorage.removeItem(key));

    // Clear sessionStorage items with this prefix
    Object.keys(sessionStorage)
        .filter((key) => key.startsWith(`${storeName}-${prefix}`))
        .forEach((key) => sessionStorage.removeItem(key));
}


async function loadDataIntoMemory(dataType = 'queues') {
    console.log(`Loading ${dataType} data into memory...`);

    // Use the data type prefix for storage keys
    const storePrefix = `${dataType}-`;

    // Retrieve meta information with the prefix
    const metaRes = await sharedStorage.getData(STORE_NAME, `${storePrefix}meta`);
    if (!metaRes.success || !metaRes.data) {
        console.warn(`⚠️ No meta record found for ${dataType}. Possibly no data stored.`);

        // Set fallback data if no stored data is found
        storedQueuesSet = [
            { id: 1, loanNumber: "L-001", borrowerName: "John Doe", propertyInfo: "123 Main St", allowedUserTypes: ['onshore', 'offshore'] },
            { id: 2, loanNumber: "L-002", borrowerName: "Jane Smith", propertyInfo: "456 Oak Ave", allowedUserTypes: ['onshore'] },
            { id: 3, loanNumber: "L-003", borrowerName: "Peter Parker", propertyInfo: "789 Elm Blvd", allowedUserTypes: ['onshore', 'offshore'] }
        ];
        window.storedQueuesSet = storedQueuesSet;
        return storedQueuesSet;
    }

    const { chunkCount } = metaRes.data;
    console.log(`📦 Found ${chunkCount} chunks of ${dataType} data.`);

    const allData = [];

    // Retrieve and decrypt all chunks using the prefix
    for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `${storePrefix}chunk-${i}`;
        const chunkRes = await sharedStorage.getData(STORE_NAME, chunkKey);
        if (!chunkRes.success || !chunkRes.data) {
            console.warn(`⚠️ Missing chunk #${i} for ${dataType}.`);
            continue;
        }

        // Decrypt chunk - this now returns array of objects
        const decryptedArray = await decryptBatch(chunkRes.data);
        allData.push(...decryptedArray);
    }

    // Store the decrypted data in memory
    storedQueuesSet = allData.length > 0 ? allData : [
        { id: 1, loanNumber: "L-001", borrowerName: "John Doe", propertyInfo: "123 Main St", allowedUserTypes: ['onshore', 'offshore'] },
        { id: 2, loanNumber: "L-002", borrowerName: "Jane Smith", propertyInfo: "456 Oak Ave", allowedUserTypes: ['onshore'] },
        { id: 3, loanNumber: "L-003", borrowerName: "Peter Parker", propertyInfo: "789 Elm Blvd", allowedUserTypes: ['onshore', 'offshore'] }
    ];
    window.storedQueuesSet = storedQueuesSet; // Update global variable
    console.log(`✅ ${dataType} data loaded into memory:`, storedQueuesSet.length);
    return storedQueuesSet;
}

/**
 * Store numbers (encrypted) in multiple chunks to avoid large message errors.
 * Each chunk is stored under a distinct key in sharedStorage.
 */
async function storeNumbers(numbers) {
    await sharedStorage.clearStore(STORE_NAME);
    storedQueuesSet = new Set(numbers);
    window.storedQueuesSet = storedQueuesSet; // Update global variable
    const chunkCount = Math.ceil(numbers.length / CHUNK_SIZE);

    for (let i = 0; i < chunkCount; i++) {
        const startIndex = i * CHUNK_SIZE;
        const endIndex = startIndex + CHUNK_SIZE;
        const batch = numbers.slice(startIndex, endIndex);

        const encryptedBatch = await encryptBatch(batch);

        const chunkKey = `numbers-chunk-${i}`;
        const result = await sharedStorage.storeData(STORE_NAME, chunkKey, encryptedBatch, {});
        if (!result.success) {
            throw new Error(`Failed to store chunk #${i}: ${result.error}`);
        }
    }

    // Store meta information
    const metaRecord = { chunkCount };
    const metaRes = await sharedStorage.storeData(STORE_NAME, "numbers-meta", metaRecord, {});
    if (!metaRes.success) {
        throw new Error(`Failed to store meta info: ${metaRes.error}`);
    }

    console.log(`Successfully stored ${numbers.length} numbers in ${chunkCount} chunks.`);
}

/**
 * Encrypt a batch of numbers (CSV) using AES-GCM.
 */
async function encryptBatch(data) {
    console.log("Encrypting batch with full data objects"); 
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // Generate a random IV

    const encodedData = new TextEncoder().encode(JSON.stringify(data)); // Convert array of objects to JSON string
    const encryptedBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedData);

    return {
        encryptedData: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
        iv: btoa(String.fromCharCode(...iv))
    };
}


/**
 * Generate a consistent AES-GCM key using PBKDF2
 */
async function getEncryptionKey() {
    if (encryptionKey) return encryptionKey;

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode("fixed-secret-passphrase"),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    encryptionKey = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode(SALT),
            iterations: 100000,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    return encryptionKey;
}

/**
 * Decrypt a previously encrypted batch of numbers.
 */
async function decryptBatch(encryptedObject) {
    try {
        console.log("Decrypting batch of full data objects"); 
        const key = await getEncryptionKey();
        const encryptedBuffer = new Uint8Array(
            [...atob(encryptedObject.encryptedData)].map((char) => char.charCodeAt(0))
        );
        const iv = new Uint8Array([...atob(encryptedObject.iv)].map((char) => char.charCodeAt(0)));

        const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedBuffer);
        const decryptedString = new TextDecoder().decode(decryptedBuffer);
        return JSON.parse(decryptedString); // Parse JSON to get array of objects
    } catch (error) {
        console.error("Decryption failed:", error);
        return [];
    }
}


async function printStorageContents(dataType = 'queues') {
    console.log(`🔍 Fetching stored ${dataType} data...`);

    // Use the data type prefix for storage keys
    const storePrefix = `${dataType}-`;

    // Retrieve meta information
    const metaRes = await sharedStorage.getData(STORE_NAME, `${storePrefix}meta`);
    if (!metaRes.success || !metaRes.data) {
        console.warn(`⚠️ No meta record found for ${dataType}. Possibly no data stored.`);
        return;
    }

    const { chunkCount } = metaRes.data;
    console.log(`📦 Found ${chunkCount} chunks of stored ${dataType} data.`);

    const allData = [];

    // Retrieve and decrypt all chunks
    for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `${storePrefix}chunk-${i}`;
        const chunkRes = await sharedStorage.getData(STORE_NAME, chunkKey);
        if (!chunkRes.success || !chunkRes.data) {
            console.warn(`⚠️ Missing chunk #${i} for ${dataType}.`);
            continue;
        }

        // Decrypt chunk
        const decryptedArray = await decryptBatch(chunkRes.data);
        allData.push(...decryptedArray);
    }
    console.log(`📜 Stored ${dataType} Data:`, allData);
}

/**
 * Test function to manually send a message to other tabs
 * Can be called from browser console: testBroadcastChannel()
 */
function testBroadcastChannel(customMessage = "Test message") {
    console.log("🔊 Testing BroadcastChannel with message:", customMessage);

    // Send a test message that should be received by all tabs
    channel.postMessage({
        type: 'TEST_MESSAGE',
        message: customMessage,
        timestamp: Date.now()
    });

    console.log("✅ Test message sent. Check console in other tabs for reception.");
    return "If you don't see 'Channel message received:' in other tabs, the BroadcastChannel isn't working properly.";
}

// Make the test function available globally
window.testBroadcastChannel = testBroadcastChannel;

// Function to handle messages from other tabs
function handleChannelMessage(event) {
    console.log("Channel message received:", event.data); // Log all messages for debugging

    if (event.data && event.data.type === 'DATA_UPDATED') {
        console.log("Received data update notification from another tab",event?.data);

        // If data is included in the message, use it directly
        if (event.data.data) {
            console.log("Using data received from channel");

            // Store the received data in memory
            storedQueuesSet = event.data.data;
            window.storedQueuesSet = storedQueuesSet;

            // Also store the data in sessionStorage to persist it
            (async () => {
                console.log("Storing received data in sessionStorage");
                await storeData(event.data.data);
                console.log("✅ Data stored in sessionStorage from channel message");
            })();

            console.log("✅ Data loaded from channel message:", storedQueuesSet.length);
        } else {
            // Otherwise load from storage
            loadDataIntoMemory();
        }
    }
}

// Main entrypoint (this is where everything starts)
(async () => {
    console.log("Tab initialized with channel:", channel.name);

    // Define the data type for this ingestion file
    const dataType = 'queues';

    // Set up channel listener for cross-tab communication
    channel.addEventListener('message', handleChannelMessage);

    // Send a test message to verify channel is working
    // This will help debug if the channel is properly set up
    setTimeout(() => {
        console.log("Sending test message to other tabs");
        channel.postMessage({
            type: 'TAB_INITIALIZED',
            dataType: dataType,
            timestamp: Date.now()
        });
    }, 1000); // Wait 1 second before sending test message

    // Check if we already have data in sessionStorage for this data type
    const storePrefix = `${dataType}-`;
    const metaRes = await sharedStorage.getData(STORE_NAME, `${storePrefix}meta`);
    if (metaRes.success && metaRes.data) {
        console.log(`Found existing ${dataType} data in storage, loading into memory...`);
        await loadDataIntoMemory(dataType);

        // Notify other tabs that this tab has loaded data
        if (storedQueuesSet) {
            console.log(`Broadcasting that this tab has loaded ${dataType} data`);
            channel.postMessage({
                type: 'DATA_UPDATED',
                dataType: dataType,
                data: storedQueuesSet,
                source: 'loaded_from_storage'
            });
        }
    } else {
        // If no data in storage, fetch from API
        await fetchAndStoreNumbers(dataType);
        // Notify other tabs that data has been updated (include the data)
        if (storedQueuesSet) {
            console.log(`Broadcasting newly fetched ${dataType} data to other tabs`);
            channel.postMessage({
                type: 'DATA_UPDATED',
                dataType: dataType,
                data: storedQueuesSet,
                source: 'fetched_from_api'
            });
        }
    }

    // Print storage content
    await printStorageContents(dataType);

    // Schedule periodic updates
    setInterval(async () => {
        const wasUpdated = await fetchAndStoreNumbers(dataType);
        if (wasUpdated && storedQueuesSet) {
            // Only notify other tabs if data was actually updated (include the data)
            console.log(`Broadcasting updated ${dataType} data after interval check`);
            channel.postMessage({
                type: 'DATA_UPDATED',
                dataType: dataType,
                data: storedQueuesSet,
                source: 'interval_update'
            });
        }
    }, CHECK_INTERVAL_MS);
})();