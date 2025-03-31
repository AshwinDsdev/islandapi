// ########## DO NOT MODIFY THESE LINES ##########
const STORE_NAME = "Users_Store"; // Name of the object store in sharedStorage
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CHUNK_SIZE = 10000; // Batch size for encryption
const SALT = "static_salt_value";
const channel = new BroadcastChannel("island_channel");
const sharedStorage = {
    async storeData(storeName, key, value) {
        localStorage.setItem(`${storeName}-${key}`, JSON.stringify(value));
        return { success: true };
    },
    async getData(storeName, key) {
        const data = localStorage.getItem(`${storeName}-${key}`);
        return data ? { success: true, data: JSON.parse(data) } : { success: false };
    },
    async clearStore(storeName) {
        Object.keys(localStorage)
            .filter((key) => key.startsWith(`${storeName}-`))
            .forEach((key) => localStorage.removeItem(key));
    },
    async getLastUpdated(storeName) {
        const lastUpdated = localStorage.getItem(`${storeName}-lastUpdated`);
        return lastUpdated ? { lastUpdated } : { lastUpdated: null };
    }
};

// ########## DO NOT MODIFY THESE LINES - END ##########

// ########## MODIFY THESE LINES AS REQUIRED ##########
const DATA_RETENTION_HOURS = 24; // How fresh the loan numbers should be kept (24 hours)
const DATA_URL = "http://localhost:5000/api/users/1"; // Updated API endpoint
// ########## MODIFY THESE LINES AS REQUIRED - END ##########

// Cache in memory
let storedUsersSet = null;     // Will hold the decrypted user objects
let encryptionKey = null;        // AES-GCM key

/**
 * Fetch user data from remote, encrypt, and store in sharedStorage
 */
async function fetchAndStoreNumbers() {
    console.log("Checking if data needs updating...");
    const {lastUpdated} = await sharedStorage.getLastUpdated(STORE_NAME);
    const now = Date.now();

    // If data is still fresh, no update
    if (lastUpdated && now - parseInt(lastUpdated, 10) < DATA_RETENTION_HOURS * 60 * 60 * 1000) {
        console.log("Data is fresh, no update needed.");
        await loadDataIntoMemory();
        return;
    }

    // Otherwise, fetch data from API
    console.log("Fetching new data...");
    try {
        console.time('Ingestion');
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);

        const jsonData = await response.json();
        const userData = jsonData;

        console.log(`Fetched ${userData.length} user records, storing (encrypted in batches)...`);
        await storeData(userData);
        console.timeEnd('Ingestion');

        console.log("Data successfully updated.");
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

/**
 * Store user data (encrypted) in multiple chunks to avoid large message errors.
 * Each chunk is stored under a distinct key in sharedStorage.
 */
async function storeData(data) {
    await sharedStorage.clearStore(STORE_NAME);
    storedUsersSet = data; // Store complete objects
    window.storedUsersSet = storedUsersSet; // Update global variable
    const chunkCount = Math.ceil(data.length / CHUNK_SIZE);

    let totalEncryptTime = 0;

    for (let i = 0; i < chunkCount; i++) {
        const startIndex = i * CHUNK_SIZE;
        const endIndex = startIndex + CHUNK_SIZE;
        const batch = data.slice(startIndex, endIndex);

        const startTime = performance.now();
        const encryptedBatch = await encryptBatch(batch);
        totalEncryptTime += performance.now() - startTime;

        const chunkKey = `data-chunk-${i}`;
        const result = await sharedStorage.storeData(STORE_NAME, chunkKey, encryptedBatch, {});
        if (!result.success) {
            throw new Error(`Failed to store chunk #${i}: ${result.error}`);
        }
    }
    console.log(`Total encryption time: ${totalEncryptTime}`);

    // Store meta information
    const metaRecord = { chunkCount };
    const metaRes = await sharedStorage.storeData(STORE_NAME, "data-meta", metaRecord, {});
    if (!metaRes.success) {
        throw new Error(`Failed to store meta info: ${metaRes.error}`);
    }

    // Store the last updated timestamp
    const lastUpdatedRes = await sharedStorage.storeData(STORE_NAME, "lastUpdated", Date.now(), {});
    if (!lastUpdatedRes.success) {
        throw new Error(`Failed to store lastUpdated timestamp: ${lastUpdatedRes.error}`);
    }

    console.log(`Successfully stored ${data.length} user records in ${chunkCount} chunks.`);
}

/**
 * Load encrypted user data from sharedStorage into memory
 */
async function loadDataIntoMemory() {
    if (storedUsersSet) return; // already loaded

    console.log("Loading full user data into memory...");

    // 1) Read meta info
    const metaRes = await sharedStorage.getData(STORE_NAME, "data-meta", {});
    if (!metaRes.success || !metaRes.data) {
        console.warn("No meta record found. Possibly no data stored.");
        storedUsersSet = [];
        window.storedUsersSet = storedUsersSet;
        return;
    }
    const { chunkCount } = metaRes.data;

    const allData = [];

    // 2) For each chunk, retrieve & decrypt
    for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `data-chunk-${i}`;
        const chunkRes = await sharedStorage.getData(STORE_NAME, chunkKey, {});
        if (!chunkRes.success || !chunkRes.data) {
            console.warn(`Missing chunk #${i}.`);
            continue; // skip or handle error
        }

        const decryptedArray = await decryptBatch(chunkRes.data);
        allData.push(...decryptedArray);
    }

    // 3) Store the decrypted data in memory
    storedUsersSet = allData.length > 0 ? allData : [];
    window.storedUsersSet = storedUsersSet; // Update global variable
    console.log(`Loaded ${storedUsersSet.length} user records into memory.`);
}

// storeNumbers function removed as we're using storeData instead

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


// printStorageContents function removed as it's not used in the New_Ingestion.js pattern

/**
 * Check batch of user data in memory
 */
async function checkUsersInMemory(usersToCheck) {
    if (!storedUsersSet) {
        await loadDataIntoMemory();
    }
    // Assuming we're checking against some identifier in the user objects
    return usersToCheck.filter(user =>
        storedUsersSet.some(storedUser => storedUser.id === user.id)
    );
}

// Opening communication channel
channel.onmessage = async (event) => {
    console.log("Received message:", event.data);

    if (event.data.action === "ping") {
        console.log("✅ Received ping, responding with pong...");
        channel.postMessage({ action: "pong" });
        return;
    }

    if (event.data.action === "check_users") {
        console.log("Received users for lookup:", event.data.users);
        const result = await checkUsersInMemory(event.data.users);
        channel.postMessage({
            action: "response_users_check",
            result
        });
    }

    // Preserve existing tab communication functionality
    if (event.data.action === "tab_opened") {
        console.log("New tab opened, sending user data...");
        if (!storedUsersSet) {
            console.log("No data in memory, loading...");
            await loadDataIntoMemory();
        }
        channel.postMessage({
            action: "response_users",
            result: storedUsersSet,
            tabId: Date.now(),
        });
    }

    if (event.data.action === "request_users") {
        console.log("Another tab requested user data.");
        if (!storedUsersSet) {
            console.log("No data in memory, loading...");
            await loadDataIntoMemory();
        }
        channel.postMessage({
            action: "response_users",
            result: storedUsersSet,
            tabId: Date.now(),
        });
    }

    if (event.data.action === "response_users") {
        console.log("Received user data from another tab:", event.data.result);
        if (event.data.result) {
            // Ensure we're working with an array
            const userData = Array.isArray(event.data.result)
                ? event.data.result
                : typeof event.data.result === "object" && event.data.result !== null
                ? Array.from(event.data.result)
                : [];

            if (userData.length > 0) {
                // Store the received data in memory
                storedUsersSet = userData;
                window.storedUsersSet = storedUsersSet; // Update global variable
                console.log(
                    "✅ User data received from another tab and loaded into memory:",
                    storedUsersSet.length
                );
            } else {
                console.warn("Received empty user data array from another tab");
                // If we received empty data, try to load from storage
                if (!storedUsersSet) {
                    loadDataIntoMemory();
                }
            }
        } else {
            console.warn("Received undefined or null user data from another tab");
            // If we received undefined data, try to load from storage
            if (!storedUsersSet) {
                loadDataIntoMemory();
            }
        }
    }
};

/**
 * Notify other tabs that this tab has opened and request user data
 */
function notifyTabOpened() {
    console.log("Notifying other tabs that this tab has opened...");

    // Create a unique ID for this tab
    const tabId = Date.now();

    // First, notify other tabs that we're here
    channel.postMessage({
        action: "tab_opened",
        tabId: tabId
    });

    // Then, explicitly request users data from any existing tabs
    setTimeout(() => {
        channel.postMessage({
            action: "request_users",
            tabId: tabId
        });
    }, 500); // Small delay to ensure other tabs have time to process the tab_opened message
}

// Main entrypoint (this is where everything starts)
(async() => {
    try {
        // First, notify other tabs that we're here and request data
        notifyTabOpened();

        // Fetch and store user data
        await fetchAndStoreNumbers();

        // Double-check that we have data in memory
        if (!storedUsersSet) {
            console.log("No data in memory after initialization, loading from storage...");
            await loadDataIntoMemory();
        }
    } catch(e) {
        console.error(e);
        throw e;
    }

    // If page has been opened for a while, we still want to make sure the user data is fresh
    setInterval(fetchAndStoreNumbers, CHECK_INTERVAL_MS);

    // Test communication
    setTimeout(() => {
        console.log("Sending test ping...");
        channel.postMessage({ action: "ping" });
    }, 2000);
})();