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
    return data
      ? { success: true, data: JSON.parse(data) }
      : { success: false };
  },
  async clearStore(storeName) {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(`${storeName}-`))
      .forEach((key) => localStorage.removeItem(key));
  },
  async getLastUpdated(storeName) {
    const lastUpdated = localStorage.getItem(`${storeName}-lastUpdated`);
    return lastUpdated ? { lastUpdated } : { lastUpdated: null };
  },
};

// ########## DO NOT MODIFY THESE LINES - END ##########

// ########## MODIFY THESE LINES AS REQUIRED ##########
const DATA_RETENTION_HOURS = 24; // How fresh the loan numbers should be kept (24 hours)
const DATA_URL = "http://localhost:5000/api/loans"; // Updated API endpoint
// ########## MODIFY THESE LINES AS REQUIRED - END ##########

// Cache in memory
let storedLoansSet = null; // Will hold the decrypted loan objects
let encryptionKey = null; // AES-GCM key

/**
 * Fetch loan data from remote, encrypt, and store in sharedStorage
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
        const loanData = jsonData;

        console.log(`Fetched ${loanData.length} loan records, storing (encrypted in batches)...`);
        await storeData(loanData);
        console.timeEnd('Ingestion');

        console.log("Data successfully updated.");
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

/**
 * Store loan data (encrypted) in multiple chunks to avoid large message errors.
 * Each chunk is stored under a distinct key in sharedStorage.
 */
async function storeData(data) {
    await sharedStorage.clearStore(STORE_NAME);
    storedLoansSet = data; // Store complete objects
    window.storedLoansSet = storedLoansSet; // Update global variable
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

    console.log(`Successfully stored ${data.length} loan records in ${chunkCount} chunks.`);
}

/**
 * Load encrypted loan data from sharedStorage into memory
 */
async function loadDataIntoMemory() {
    if (storedLoansSet) return; // already loaded

    console.log("Loading full loan data into memory...");

    // 1) Read meta info
    const metaRes = await sharedStorage.getData(STORE_NAME, "data-meta", {});
    if (!metaRes.success || !metaRes.data) {
        console.warn("No meta record found. Possibly no data stored.");
        storedLoansSet = [];
        window.storedLoansSet = storedLoansSet;
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
    storedLoansSet = allData.length > 0 ? allData : [];
    window.storedLoansSet = storedLoansSet; // Update global variable
    console.log(`Loaded ${storedLoansSet.length} loan records into memory.`);
}

// storeNumbers function removed as we're using storeData instead

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
 * Encrypt a batch of loan objects using AES-GCM.
 */
async function encryptBatch(data) {
    console.log("Encrypting batch with full data objects");
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // random IV

    const encodedData = new TextEncoder().encode(JSON.stringify(data)); // JSON stringify for objects
    const encryptedBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedData);

    return {
        encryptedData: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

/**
 * Decrypt a previously encrypted batch of loan objects.
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
 * Check batch of loan data in memory
 */
async function checkLoansInMemory(loansToCheck) {
    if (!storedLoansSet) {
        await loadDataIntoMemory();
    }

    // Ensure storedLoansSet is an array
    const loansArray = Array.isArray(storedLoansSet)
        ? storedLoansSet
        : storedLoansSet instanceof Set
        ? Array.from(storedLoansSet)
        : [];

    // Assuming we're checking against some identifier in the loan objects
    return loansToCheck.filter((loan) =>
        loansArray.some((storedLoan) => storedLoan.id === loan.id)
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

    if (event.data.action === "check_loans") {
        console.log("Received loans for lookup:", event.data.loans);
        const result = await checkLoansInMemory(event.data.loans);
        channel.postMessage({
            action: "response_loans_check",
            result
        });
    }

    // Preserve existing tab communication functionality
    if (event.data.action === "tab_opened") {
        console.log("New tab opened, sending loan data...");
        if (!storedLoansSet) {
            console.log("No data in memory, loading...");
            await loadDataIntoMemory();
        }
        channel.postMessage({
            action: "response_loans",
            result: storedLoansSet,
            tabId: Date.now(),
        });
    }

    if (event.data.action === "request_loans") {
        console.log("Another tab requested loan data.");
        if (!storedLoansSet) {
            console.log("No data in memory, loading...");
            await loadDataIntoMemory();
        }
        channel.postMessage({
            action: "response_loans",
            result: storedLoansSet,
            tabId: Date.now(),
        });
    }

    if (event.data.action === "response_loans") {
        console.log("Received loan data from another tab:", event.data.result);
        if (event.data.result) {
            // Ensure we're working with an array
            const loanData = Array.isArray(event.data.result)
                ? event.data.result
                : typeof event.data.result === "object" && event.data.result !== null
                ? Array.from(event.data.result)
                : [];

            if (loanData.length > 0) {
                // Store the received data in memory
                storedLoansSet = loanData;
                window.storedLoansSet = storedLoansSet; // Update global variable
                console.log(
                    "✅ Loan data received from another tab and loaded into memory:",
                    storedLoansSet.length
                );
            } else {
                console.warn("Received empty loan data array from another tab");
            }
        } else {
            console.warn("Received undefined or null loan data from another tab");
        }
    }
};

/**
 * Notify other tabs that this tab has opened and request loan data
 */
function notifyTabOpened() {
  console.log("Notifying other tabs that this tab has opened...");

  // Create a unique ID for this tab
  const tabId = Date.now();

  // First, notify other tabs that we're here
  channel.postMessage({
    action: "tab_opened",
    tabId: tabId,
  });

  // Then, explicitly request loans data from any existing tabs
  setTimeout(() => {
    channel.postMessage({
      action: "request_loans",
      tabId: tabId,
    });
  }, 500); // Small delay to ensure other tabs have time to process the tab_opened message
}

// Main entrypoint (this is where everything starts)
(async() => {
  try {
    // First, notify other tabs that we're here and request data
    notifyTabOpened();

    // Fetch and store loan data
    await fetchAndStoreNumbers();
  } catch(e) {
    console.error(e);
    throw e;
  }

  // If page has been opened for a while, we still want to make sure the loan data is fresh
  setInterval(fetchAndStoreNumbers, CHECK_INTERVAL_MS);

  // Test communication
  setTimeout(() => {
    console.log("Sending test ping...");
    channel.postMessage({ action: "ping" });
  }, 2000);
})();
