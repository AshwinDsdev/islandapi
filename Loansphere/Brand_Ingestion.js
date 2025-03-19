// ########## DO NOT MODIFY THESE LINES ##########
const STORE_NAME = "LoanNumbers"; // Name of the object store in sharedStorage
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
const DATA_URL = "http://localhost:5000/api/brands"; // Updated API endpoint
// ########## MODIFY THESE LINES AS REQUIRED - END ##########

// Cache in memory
let storedNumbersSet = null;     // Will hold the decrypted numbers
let encryptionKey = null;        // AES-GCM key

/**
 * Fetch numbers from remote, encrypt, and store in sharedStorage
 */
async function fetchAndStoreNumbers() {
    console.log("Checking if data needs updating...");
    const { lastUpdated } = await sharedStorage.getLastUpdated(STORE_NAME);
    const now = Date.now();

    // If data is still fresh, no update
    if (lastUpdated && now - parseInt(lastUpdated, 10) < DATA_RETENTION_HOURS * 60 * 60 * 1000) {
        console.log("Data is fresh, no update needed.");
        return loadNumbersIntoMemory();
    }

    // Otherwise, fetch data from API
    console.log("Fetching new data...");
    try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);

        const jsonData = await response.json();
        const numbers = jsonData.map(item => item.id); // Assuming API returns objects with 'id' field

        console.log(`Fetched ${numbers.length} numbers, storing (encrypted in batches)...`);
        await storeNumbers(numbers);

        console.log("Data successfully updated.");
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

/**
 * Store numbers (encrypted) in multiple chunks to avoid large message errors.
 * Each chunk is stored under a distinct key in sharedStorage.
 */
async function storeNumbers(numbers) {
    await sharedStorage.clearStore(STORE_NAME);
    storedNumbersSet = new Set(numbers);
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
async function encryptBatch(numbers) {
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // Generate a random IV

    const encodedData = new TextEncoder().encode(numbers.join(",")); // Convert array to CSV format
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
    const key = await getEncryptionKey();
    const encryptedBuffer = new Uint8Array(
        [...atob(encryptedObject.encryptedData)].map((char) => char.charCodeAt(0))
    );
    const iv = new Uint8Array([...atob(encryptedObject.iv)].map((char) => char.charCodeAt(0)));

    const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedBuffer);
    const decryptedString = new TextDecoder().decode(decryptedBuffer);
    return decryptedString.split(",");
}

async function printStorageContents() {
    console.log("🔍 Fetching stored data...");

    // Retrieve meta information
    const metaRes = await sharedStorage.getData(STORE_NAME, "numbers-meta", {});
    if (!metaRes.success || !metaRes.data) {
        console.warn("⚠️ No meta record found. Possibly no data stored.");
        return;
    }

    const { chunkCount } = metaRes.data;
    console.log(`📦 Found ${chunkCount} chunks of stored numbers.`);

    const allNumbers = [];

    // Retrieve and decrypt all chunks
    for (let i = 0; i < chunkCount; i++) {
        const chunkKey = `numbers-chunk-${i}`;
        const chunkRes = await sharedStorage.getData(STORE_NAME, chunkKey, {});
        if (!chunkRes.success || !chunkRes.data) {
            console.warn(`⚠️ Missing chunk #${i}.`);
            continue;
        }

        // Decrypt chunk
        const decryptedArray = await decryptBatch(chunkRes.data);
        allNumbers.push(...decryptedArray);
    }

    console.log("📜 Stored Numbers:", allNumbers);
}

// Main entrypoint (this is where everything starts)
(async () => {
    await fetchAndStoreNumbers();

    // Print storage content
    // await printStorageContents();

    // Schedule periodic updates
    setInterval(fetchAndStoreNumbers, CHECK_INTERVAL_MS);
})();
