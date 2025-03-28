// ########## DO NOT MODIFY THESE LINES ##########
const STORE_NAME = "Loans_Store"; // Name of the object store in sharedStorage
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
const DATA_URL = "http://localhost:5000/api/queues"; // Updated API endpoint
// ########## MODIFY THESE LINES AS REQUIRED - END ##########

// Cache in memory
var storedQueuesSet = null;     // Will hold the decrypted numbers
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
    return window.storedQueuesSet; // Return the loaded data
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
    return window.storedQueuesSet; // Return the stored data
  } catch (error) {
    console.error("Error fetching data:", error);

    return window.storedQueuesSet;
  }
}

async function storeData(data) {
    await sharedStorage.clearStore(STORE_NAME);
    storedQueuesSet = data; // Store complete objects
    window.storedQueuesSet = storedQueuesSet; // Update global variable
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

    console.log(`Successfully stored ${data.length} brand records in ${chunkCount} chunks.`);
}


async function loadDataIntoMemory() {
    console.log("Loading full brand data into memory...");

    // Retrieve meta information
    const metaRes = await sharedStorage.getData(STORE_NAME, "data-meta");
    if (!metaRes.success || !metaRes.data) {
        console.warn("⚠️ No meta record found. Possibly no data stored.");

        // Set fallback data if no stored data is found
        storedQueuesSet = [
            { id: 1, name: "Pending Applications", type: "my", sortOrder: 1, brandIds: [5, 6, 8], restricted: false },
            { id: 2, name: "Document Review", type: "my", sortOrder: 2, brandIds: [1, 3, 7], restricted: false },
            { id: 3, name: "Underwriting", type: "team", sortOrder: 3, brandIds: [2, 4, 9], restricted: false },
            { id: 4, name: "Closing", type: "team", sortOrder: 4, brandIds: [1, 5, 8], restricted: false }
        ];
        window.storedQueuesSet = storedQueuesSet;
        return storedQueuesSet;
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
    storedQueuesSet = allData.length > 0 ? allData : [
        { id: 1, name: "Pending Applications", type: "my", sortOrder: 1, brandIds: [5, 6, 8], restricted: false },
        { id: 2, name: "Document Review", type: "my", sortOrder: 2, brandIds: [1, 3, 7], restricted: false },
        { id: 3, name: "Underwriting", type: "team", sortOrder: 3, brandIds: [2, 4, 9], restricted: false },
        { id: 4, name: "Closing", type: "team", sortOrder: 4, brandIds: [1, 5, 8], restricted: false }
    ];
    window.storedQueuesSet = storedQueuesSet; // Update global variable
    console.log("✅ Full brand data loaded into memory:", storedQueuesSet.length);
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

/**
 * Check batch of queue data in memory
 */
async function checkQueuesInMemory(queuesToCheck) {
  if (!storedQueuesSet) {
    await loadDataIntoMemory();
  }
  // Assuming we're checking against some identifier in the queue objects
  return queuesToCheck.filter(queue =>
    storedQueuesSet.some(storedQueue => storedQueue.id === queue.id)
  );
}

// Handle messages from other tabs
channel.onmessage = async (event) => {
  console.log("Received message in tab:", event.data); // This will show ALL incoming messages

  if (event.data.action === "ping") {
    console.log("✅ Received ping, responding with pong...");
    channel.postMessage({ action: "pong", tabId: Date.now() });
    return;
  }

  if (event.data.action === "tab_opened") {
    console.log("New tab opened, sending queue data...");
    if (!storedQueuesSet) {
      console.log("No data in memory, loading...");
      await loadDataIntoMemory();
    }
    channel.postMessage({
      action: "response_queues",
      result: storedQueuesSet,
      tabId: Date.now()
    });
  }

  if (event.data.action === "request_queues") {
    console.log("Another tab requested queue data.", storedQueuesSet);
    if (!storedQueuesSet) {
      console.log("No data in memory, loading...");
      await loadDataIntoMemory();
    }
    channel.postMessage({
      action: "response_queues",
      result: storedQueuesSet,
      tabId: Date.now()
    });
  }

  if (event.data.action === "response_queues") {
    console.log("Received queue data from another tab:", event.data.result);
    if (event.data.result && Array.isArray(event.data.result) && event.data.result.length > 0) {
      // Store the received data in memory
      storedQueuesSet = event.data.result;
      window.storedQueuesSet = storedQueuesSet; // Update global variable
      console.log("✅ Queue data received from another tab and loaded into memory:", storedQueuesSet.length);
    }
  }

  if (event.data.action === "check_queues") {
    console.log("Received queues for lookup:", event.data.queues);
    const result = await checkQueuesInMemory(event.data.queues);
    channel.postMessage({
      action: "response_queues_check",
      result: result,
      tabId: Date.now()
    });
  }
};

// Add this to test communication immediately after initialization
setTimeout(() => {
  console.log("Sending test ping...");
  channel.postMessage({ action: "ping" });
}, 2000);

/**
 * Notify other tabs that this tab has opened and request queue data
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

  // Then, explicitly request queues data from any existing tabs
  setTimeout(() => {
    channel.postMessage({
      action: "request_queues",
      tabId: tabId
    });
  }, 500); // Small delay to ensure other tabs have time to process the tab_opened message
}

// Main entrypoint (this is where everything starts)
(async () => {
  console.log("Initializing queue ingestion...");

  try {
    // First, notify other tabs that we're here and request data
    notifyTabOpened();

    console.log("1. Attempting to fetch and store queues...");
    await fetchAndStoreNumbers();

    console.log("2. Checking shared storage content...");
    const meta = await sharedStorage.getData(STORE_NAME, "data-meta");
    console.log("Storage meta:", meta);

    console.log("3. Testing in-memory data...");
    console.log("Current in-memory data:", storedQueuesSet);

    console.log("4. Testing broadcast channel...");
    setTimeout(() => {
      console.log("Sending test ping...");
      channel.postMessage({ action: "ping", from: "main_tab" });
    }, 2000);

  } catch(e) {
    console.error("Initialization failed:", e);
    throw e;
  }

  // Schedule periodic updates
  console.log("Setting up periodic refresh...");
  setInterval(fetchAndStoreNumbers, CHECK_INTERVAL_MS);

  console.log("Queue ingestion initialized successfully");
})();