//LOAN INGESTION LATEST

// ########## DO NOT MODIFY THESE LINES ##########
const STORE_NAME = "LoanNumbers"; // Name of the object store in sharedStorage
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CHUNK_SIZE = 10000; // Batch size for encryption
const DOWNLOAD_CHUNK_SIZE = 30 * 1024 * 1024; // 30MB
const SALT = "static_salt_value";
const channel = new BroadcastChannel("island_channel");
const sharedStorage = {
  async storeData(storeName, key, value) {
    const db = await openDatabase(storeName);
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.put(value, key);
    await tx.complete;
    return { success: true };
  },
  async getData(storeName, key) {
    const db = await openDatabase(storeName);
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const data = await store.get(key);
    return data ? { success: true, data } : { success: false };
  },
  async clearStore(storeName) {
    const db = await openDatabase(storeName);
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    await tx.complete;
    return { success: true };
  },
  async getLastUpdated(storeName) {
    const db = await openDatabase(storeName);
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const lastUpdated = await store.get("lastUpdated");
    return lastUpdated ? { success: true, lastUpdated } : { success: true, lastUpdated: null };
  },
  async deleteData(storeName, key) {
    try {
      const db = await openDatabase(storeName);
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.delete(key);
      await tx.complete;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

async function waitForListener(maxRetries = 20, initialDelay = 100) {
  testChannel = channel;
  return new Promise((resolve, reject) => {
    let attempts = 0;
    let delay = initialDelay;
    let timeoutId;
    let listener = (event) => {
      if (event.data.action === "pong") {
        console.log("✅ Listener detected!");
        testChannel.removeEventListener("message", listener);
        clearTimeout(timeoutId);
        resolve(true);
      }
    };

    function sendPing() {
      if (attempts >= maxRetries) {
        console.warn("❌ No listener detected after maximum retries.");
        testChannel.removeEventListener("message", listener);
        clearTimeout(timeoutId);
        reject(new Error("Listener not found"));
        return;
      }

      console.log(`🔄 Sending ping attempt ${attempts + 1}/${maxRetries}...`);
      testChannel.postMessage({ action: "ping" });

      testChannel.addEventListener("message", listener);

      // Retry if no response within `delay` ms
      timeoutId = setTimeout(() => {
        attempts++;
        delay *= 2; // Exponential backoff (100ms → 200ms → 400ms...)
        sendPing();
      }, delay);
    }

    sendPing(); // Start the first attempt
  });
}

/**
 * Request a batch of numbers from the storage script
 */
async function checkNumbersBatch(numbers) {
  return new Promise((resolve) => {
    const listener = (event) => {
      if (event.data.action === "response_numbers") {
        resolve(event.data.result);
        channel.removeEventListener("message", listener);
      }
    };

    channel.addEventListener("message", listener);
    channel.postMessage({ action: "check_numbers", numbers });
  });
}

async function openDatabase(storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(storeName, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore(storeName);
    };
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}
// ########## DO NOT MODIFY THESE LINES - END ##########

async function downloadFileInChunks(
  fileUrl,
  oldEtag,
  chunkSize = 1024 * 1024,
  onProgress
) {
  const response = await fetch(fileUrl, { method: "HEAD" });
  console.log("HEAD response:", response);
  if (!response.ok)
    throw new Error(`Failed to get file info: ${response.statusText}`);

  const contentLength = parseInt(response.headers.get("content-length"), 10);
  const etag = response.headers.get("etag");
  console.log(contentLength, " Content-Length header value");

  if (etag !== oldEtag) {
    console.log("File has changed, re-downloading...");
  } else {
    console.log("File is unchanged, no need to download.");
    return { data: null, etag, downloaded: false };
  }

  if (isNaN(contentLength)) throw new Error("Content-Length header missing");

  let receivedBytes = 0;
  let fileData = new Uint8Array(contentLength);

  for (let start = 0; start < contentLength; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, contentLength - 1);

    const chunkResponse = await fetch(fileUrl, {
      headers: { Range: `bytes=${start}-${end}` },
    });

    if (!chunkResponse.ok)
      throw new Error(`Failed to fetch chunk: ${chunkResponse.statusText}`);

    const chunk = new Uint8Array(await chunkResponse.arrayBuffer());
    fileData.set(chunk, start);
    receivedBytes += chunk.length;

    if (onProgress) onProgress(receivedBytes, contentLength);
  }

  return { data: fileData, etag, downloaded: true };
}

// ########## MODIFY THESE LINES AS REQUIRED ##########
const DATA_RETENTION_HOURS = 24; // How fresh the loan numbers should be kept (24 hours)
// const DATA_URL = "http://localhost:8081/random_numbers.txt"; // To be replaced with the real URL
const DATA_URL = "./LoanNum.csv";
// ########## MODIFY THESE LINES AS REQUIRED - END##########

// Cache in memory
let storedNumbersSet = null; // Will hold the decrypted numbers
let encryptionKey = null; // AES-GCM key

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
 * Encrypt a batch of numbers (CSV) using AES-GCM.
 */
async function encryptBatch(numbers) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // random IV

  const encodedData = new TextEncoder().encode(numbers.join(",")); // CSV
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedData
  );

  return {
    encryptedData: btoa(
      String.fromCharCode(...new Uint8Array(encryptedBuffer))
    ),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

/**
 * Decrypt a previously encrypted batch of numbers.
 */
async function decryptBatch(encryptedObject) {
  const key = await getEncryptionKey();
  const encryptedBuffer = new Uint8Array(
    [...atob(encryptedObject.encryptedData)].map((char) => char.charCodeAt(0))
  );
  const iv = new Uint8Array(
    [...atob(encryptedObject.iv)].map((char) => char.charCodeAt(0))
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encryptedBuffer
  );
  const decryptedString = new TextDecoder().decode(decryptedBuffer);
  return decryptedString.split(",");
}

/**
 * Gets the meta-data record from sharedStorage.
 */
async function getMeta() {
  const metaRes = await sharedStorage.getData(STORE_NAME, "numbers-meta", {});
  if (metaRes?.success && metaRes?.data) {
    return metaRes.data;
  }
  return null;
}


/**
 * Store numbers (encrypted) in multiple chunks to avoid large message errors.
 * Each chunk is stored under a distinct key in sharedStorage.
 */
async function storeNumbers(numbers, etag) {
  const meta = await getMeta();
  const oldEtag = meta?.etag;
  const inProgress = meta?.inProgress;

  if (etag === oldEtag) {
    console.log("Data is unchanged, no need to store.");
    return;
  } else if (inProgress) {
    console.warn("Data is already in progress, overwriting.");
  }

  await sharedStorage.clearStore(STORE_NAME);

  storedNumbersSet = new Set(numbers);
  // Expose to window object for external scripts
  window.storedNumbersSet = storedNumbersSet;
  console.log(storedNumbersSet, "Stored Numbers Set");
  const chunkCount = Math.ceil(numbers.length / CHUNK_SIZE);

  // Store a small "meta" record with total chunk info
  // This helps you know how many chunks to retrieve later
  const metaRecord = { chunkCount, inProgress: true, etag };
  let metaRes = await sharedStorage.storeData(
    STORE_NAME,
    "numbers-meta",
    metaRecord,
    {}
  );
  if (!metaRes.success) {
    throw new Error(`Failed to store meta info: ${metaRes.error}`);
  }

  for (let i = 0; i < chunkCount; i++) {
    const startIndex = i * CHUNK_SIZE;
    const endIndex = startIndex + CHUNK_SIZE;
    const batch = numbers.slice(startIndex, endIndex);

    const encryptedBatch = await encryptBatch(batch);

    const chunkKey = `numbers-chunk-${i}`;
    const result = await sharedStorage.storeData(
      STORE_NAME,
      chunkKey,
      encryptedBatch,
      {}
    );
    if (!result.success) {
      throw new Error(`Failed to store chunk #${i}: ${result.error}`);
    }
  }

  // Update inProgress key to false
  metaRecord.inProgress = false;
  await sharedStorage.storeData(STORE_NAME, "numbers-meta", metaRecord, {});
  if (!metaRes.success) {
    throw new Error(`Failed to store meta info: ${metaRes.error}`);
  }

  console.log(
    `Successfully stored ${numbers.length} numbers in ${chunkCount} chunks.`
  );
}

/**
 * Wait for the in-progress operation to complete or to timeout (default 1 minute).
 */
function awaitForInProgress(timeout = 60 * 1000) {
  return new Promise((resolve) => {
    let meta;
    const checkInterval = setInterval(async () => {
      meta = await getMeta();
      if (!meta?.inProgress) {
        clearInterval(checkInterval);
        resolve(meta);
      }
    }, 1000);

    setTimeout(() => {
      console.warn("Timeout reached while waiting for in-progress operation.");
      clearInterval(checkInterval);
      resolve(meta); // Do not reject, just return the last known state
    }, timeout);
  });
}

/**
 * Fetch numbers from remote, encrypt, and store in sharedStorage
 */
async function fetchAndStoreNumbers() {
  console.log("Checking if data needs updating...");
  const meta = await awaitForInProgress();
  const etag = meta?.etag;

  // For backward compatibility with the old implementation
  const { lastUpdated } = await sharedStorage.getLastUpdated(STORE_NAME);
  const now = Date.now();

  // If data is still fresh based on time (old method), no update
  if (
    lastUpdated &&
    now - parseInt(lastUpdated, 10) < DATA_RETENTION_HOURS * 60 * 60 * 1000 &&
    !etag // Only use time-based check if we don't have etag yet
  ) {
    console.log("Data is fresh (time-based), no update needed.");
    return loadNumbersIntoMemory();
  }

  try {
    // Fetch data from url
    console.log("Fetching new data...");
    const file = await downloadFileInChunks(
      DATA_URL,
      etag,
      DOWNLOAD_CHUNK_SIZE,
      (received, total) => {
        console.log(`Downloaded: ${((received / total) * 100).toFixed(2)}%`);
      }
    );

    if (!file.downloaded) {
      // If data is still fresh, no update needed
      return loadNumbersIntoMemory();
    }

    const fileData = file.data;
    const textData = new TextDecoder().decode(fileData);

    // Process the text data to extract loan numbers
    const numbers = textData
      .trim()
      .split(/\r?\n/)
      .map((n) => n.replace(/"/g, ""))
      .filter(Boolean);

    console.log(
      `Fetched ${numbers.length} numbers, storing (encrypted in batches)...`
    );
    await storeNumbers(numbers, file.etag);

    console.log("Data successfully updated.");
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

/**
 * Load encrypted numbers from sharedStorage into memory
 */
async function loadNumbersIntoMemory() {
  if (storedNumbersSet) return; // already loaded

  // 1) Read meta info
  const metaRes = await sharedStorage.getData(STORE_NAME, "numbers-meta", {});
  if (!metaRes.success || !metaRes.data) {
    console.warn("No meta record found. Possibly no data stored.");
    storedNumbersSet = new Set();
    return;
  }
  const { chunkCount } = metaRes.data;

  const allDecryptedNumbers = [];

  // 2) For each chunk, retrieve & decrypt
  for (let i = 0; i < chunkCount; i++) {
    const chunkKey = `numbers-chunk-${i}`;
    const chunkRes = await sharedStorage.getData(STORE_NAME, chunkKey, {});
    if (!chunkRes.success || !chunkRes.data) {
      console.warn(`Missing chunk #${i}.`);
      continue; // skip or handle error
    }

    const decryptedArray = await decryptBatch(chunkRes.data);
    allDecryptedNumbers.push(...decryptedArray);
  }

  // 3) Convert to a Set for quick membership checks
  storedNumbersSet = new Set(allDecryptedNumbers);
  // Expose to window object for external scripts
  window.storedNumbersSet = storedNumbersSet;
  console.log(storedNumbersSet, "Stored Numbers Set");

  console.log(
    `Loaded ${storedNumbersSet.size} numbers into memory (in chunks).`
  );
}

/**
 * Check batch of numbers in memory
 */
async function checkNumbersInMemory(numbersToCheck) {
  console.log("Checking numbers in memory...");
  if (!storedNumbersSet) {
    console.log("No data in stored in memory, pulling from source...");
    await loadNumbersIntoMemory();
  }
  return numbersToCheck.filter((num) => storedNumbersSet.has(num));
}

// Main entrypoint (this is where everything starts)
(async () => {
  await fetchAndStoreNumbers();

  // If page has been opened for a while, we still want to make sure the loan numbers are fresh
  setInterval(() => fetchAndStoreNumbers(), CHECK_INTERVAL_MS);

  // Opening communication channel
  channel.onmessage = async (event) => {
    if (event.data.action === "ping") {
      console.log("âœ… Received ping, responding with pong...");
      channel.postMessage({ action: "pong" });
      return;
    }

    if (event.data.action === "check_numbers") {
      console.log("Received batch for lookup:", event?.data?.numbers);
      const result = await checkNumbersInMemory(event.data.numbers);
      channel.postMessage({ action: "response_numbers", result });
    }
  };
})();
