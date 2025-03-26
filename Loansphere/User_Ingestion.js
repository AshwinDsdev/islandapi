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
const DATA_URL = "http://localhost:5000/api/users/1"; // Updated API endpoint
// ########## MODIFY THESE LINES AS REQUIRED - END ##########

// Cache in memory
var storedUsersSet = null;     // Will hold the decrypted numbers
let encryptionKey = null;        // AES-GCM key

/**
 * Fetch numbers from remote, encrypt, and store in sharedStorage
 */
async function fetchAndStoreNumbers() {
  console.log("Checking if data needs updating...");
  const { lastUpdated } = await sharedStorage.getLastUpdated(STORE_NAME);
  const now = Date.now();

  // If data is still fresh, no update
  if (
    lastUpdated &&
    now - parseInt(lastUpdated, 10) < DATA_RETENTION_HOURS * 60 * 60 * 1000
  ) {
    console.log("Data is fresh, no update needed.");
    await loadDataIntoMemory(); // Load numbers into memory
    return false; // Return false to indicate no update was performed
  }

  // Otherwise, fetch data from API
  console.log("Fetching new data...");
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);

    const jsonData = await response.json();
    console.log(jsonData, "jsonData");
    const brandData = jsonData;
    console.log(
      `Fetched ${brandData.length} brand records, storing (encrypted in batches)...`
    );
    await storeData(brandData);

    console.log("Data successfully updated.");
    return true; // Return true to indicate data was updated
  } catch (error) {
    console.error("Error fetching data:", error);
    await loadDataIntoMemory(); // Load existing data into memory
    return false; // Return false to indicate no update was performed
  }
}

async function storeData(data) {
    await sharedStorage.clearStore(STORE_NAME);
    storedUsersSet = data; // Store complete objects
    window.storedUsersSet = storedUsersSet; // Update global variable
    const chunkCount = Math.ceil(data.length / CHUNK_SIZE);

    for (let i = 0; i < chunkCount; i++) {
        const startIndex = i * CHUNK_SIZE;
        const endIndex = startIndex + CHUNK_SIZE;
        const batch = data.slice(startIndex, endIndex);

        const encryptedBatch = await encryptBatch(batch);

        const chunkKey = `data-chunk-${i}`;
        const result = await sharedStorage.storeData(STORE_NAME, chunkKey, encryptedBatch, {});
        if (!result.success) {
            throw new Error(`Failed to store chunk #${i}: ${result.error}`);
        }
    }

    // Store meta information
    const metaRecord = { chunkCount };
    const metaRes = await sharedStorage.storeData(STORE_NAME, "data-meta", metaRecord, {});
    if (!metaRes.success) {
        throw new Error(`Failed to store meta info: ${metaRes.error}`);
    }

    // Update the lastUpdated timestamp
    const now = Date.now();
    await sharedStorage.storeData(STORE_NAME, "lastUpdated", now);

    console.log(`Successfully stored ${data.length} brand records in ${chunkCount} chunks.`);
}


async function loadDataIntoMemory() {
    console.log("Loading full brand data into memory...");

    // Retrieve meta information
    const metaRes = await sharedStorage.getData(STORE_NAME, "data-meta");
    if (!metaRes.success || !metaRes.data) {
        console.warn("⚠️ No meta record found. Possibly no data stored.");

        // Set fallback data if no stored data is found
        storedUsersSet = []
        window.storedUsersSet = storedUsersSet;
        return storedUsersSet;
    }

    const { chunkCount } = metaRes.data;
    console.log(`📦 Found ${chunkCount} chunks of stored data.`);

    const allData = [];

    // Retrieve and decrypt all chunks
    for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `data-chunk-${i}`;
        const chunkRes = await sharedStorage.getData(STORE_NAME, chunkKey);
        if (!chunkRes.success || !chunkRes.data) {
            console.warn(`⚠️ Missing chunk #${i}.`);
            continue;
        }

        // Decrypt chunk - this now returns array of objects
        const decryptedArray = await decryptBatch(chunkRes.data);
        allData.push(...decryptedArray);
    }

    // Store the decrypted data in memory
    storedUsersSet = allData.length > 0 ? allData : []
       
    window.storedUsersSet = storedUsersSet; // Update global variable
    console.log("✅ Full brand data loaded into memory:", storedUsersSet.length);
    return storedUsersSet;
}

/**
 * Store numbers (encrypted) in multiple chunks to avoid large message errors.
 * Each chunk is stored under a distinct key in sharedStorage.
 */
async function storeNumbers(numbers) {
    await sharedStorage.clearStore(STORE_NAME);
    storedUsersSet = new Set(numbers);
    window.storedUsersSet = storedUsersSet; // Update global variable
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


async function printStorageContents() {
    console.log("🔍 Fetching stored brand data...");

    // Retrieve meta information
    const metaRes = await sharedStorage.getData(STORE_NAME, "data-meta");
    if (!metaRes.success || !metaRes.data) {
        console.warn("⚠️ No meta record found. Possibly no data stored.");
        return;
    }

    const { chunkCount } = metaRes.data;
    console.log(`📦 Found ${chunkCount} chunks of stored data.`);

    const allData = [];

    // Retrieve and decrypt all chunks
    for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `data-chunk-${i}`;
        const chunkRes = await sharedStorage.getData(STORE_NAME, chunkKey);
        if (!chunkRes.success || !chunkRes.data) {
            console.warn(`⚠️ Missing chunk #${i}.`);
            continue;
        }

        // Decrypt chunk
        const decryptedArray = await decryptBatch(chunkRes.data);
        allData.push(...decryptedArray);
    }
    console.log("📜 Stored Brand Data:", allData);
}

// Function to handle messages from other tabs
function handleChannelMessage(event) {
    if (event.data && event.data.type === 'DATA_UPDATED') {
        console.log("Received data update notification from another tab");

        // If data is included in the message, use it directly
        if (event.data.data) {
            console.log("Using data received from channel");
            storedUsersSet = event.data.data;
            window.storedUsersSet = storedUsersSet;
            console.log("✅ Data loaded from channel message:", storedUsersSet.length);
        } else {
            // Otherwise load from storage
            loadDataIntoMemory();
        }
    }
}

// Main entrypoint (this is where everything starts)
(async () => {
    // Set up channel listener for cross-tab communication
    channel.addEventListener('message', handleChannelMessage);

    // Check if we already have data in sessionStorage
    const metaRes = await sharedStorage.getData(STORE_NAME, "data-meta");
    if (metaRes.success && metaRes.data) {
        console.log("Found existing data in storage, loading into memory...");
        await loadDataIntoMemory();
    } else {
        // If no data in storage, fetch from API
        await fetchAndStoreNumbers();
        // Notify other tabs that data has been updated (include the data)
        if (storedUsersSet) {
            channel.postMessage({
                type: 'DATA_UPDATED',
                data: storedUsersSet
            });
        }
    }

    // Print storage content
    await printStorageContents();

    // Schedule periodic updates
    setInterval(async () => {
        const wasUpdated = await fetchAndStoreNumbers();
        if (wasUpdated && storedUsersSet) {
            // Only notify other tabs if data was actually updated (include the data)
            channel.postMessage({
                type: 'DATA_UPDATED',
                data: storedUsersSet
            });
        }
    }, CHECK_INTERVAL_MS);
})();