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

/**
 * Downloads a file in chunks to handle large files efficiently
 */
async function downloadFileInChunks(fileUrl, chunkSize = 1024 * 1024, onProgress) {
    const response = await fetch(fileUrl, { method: 'HEAD' });
    if (!response.ok) throw new Error(`Failed to get file info: ${response.statusText}`);
    
    const contentLength = parseInt(response.headers.get('content-length'), 10);
    if (isNaN(contentLength)) throw new Error('Content-Length header missing');
    
    let receivedBytes = 0;
    let fileData = new Uint8Array(contentLength);
    
    for (let start = 0; start < contentLength; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, contentLength - 1);
        
        const chunkResponse = await fetch(fileUrl, {
            headers: { 'Range': `bytes=${start}-${end}` }
        });
        
        if (!chunkResponse.ok) throw new Error(`Failed to fetch chunk: ${chunkResponse.statusText}`);
        
        const chunk = new Uint8Array(await chunkResponse.arrayBuffer());
        fileData.set(chunk, start);
        receivedBytes += chunk.length;
        
        if (onProgress) onProgress(receivedBytes, contentLength);
    }
    
    return fileData;
}

// ########## MODIFY THESE LINES AS REQUIRED ##########
const DATA_RETENTION_HOURS = 24; // How fresh the loan numbers should be kept (24 hours)
const DATA_URL = "http://localhost:5000/api/loans";
// ########## MODIFY THESE LINES AS REQUIRED - END ##########

// Cache in memory
let storedLoansSet = null; // Will hold the decrypted loan objects
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
 * Encrypt a batch of loan objects using AES-GCM.
 */
async function encryptBatch(data) {
    console.log(`Encrypting batch of ${data.length} items`);
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // random IV

    const encodedData = new TextEncoder().encode(JSON.stringify(data));
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
        console.log("Decrypting batch");
        const key = await getEncryptionKey();
        const encryptedBuffer = new Uint8Array(
            [...atob(encryptedObject.encryptedData)].map((char) => char.charCodeAt(0))
        );
        const iv = new Uint8Array([...atob(encryptedObject.iv)].map((char) => char.charCodeAt(0)));

        const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedBuffer);
        const decryptedString = new TextDecoder().decode(decryptedBuffer);
        
        const jsonData = JSON.parse(decryptedString);
        console.log(`Decrypted ${jsonData.length} loan objects`);
        return jsonData;
    } catch (error) {
        console.error("Decryption failed:", error);
        return [];
    }
}

/**
 * Store loan data (encrypted) in multiple chunks to avoid large message errors.
 * Each chunk is stored under a distinct key in sharedStorage.
 */
async function storeData(data) {
    console.log(`Storing ${data.length} loan records...`);
    await sharedStorage.clearStore(STORE_NAME);
    
    // Store the full loan objects in memory
    storedLoansSet = data;
    window.storedLoansSet = storedLoansSet; // Update global variable
    
    const chunkCount = Math.ceil(data.length / CHUNK_SIZE);
    console.log(`Splitting data into ${chunkCount} chunks of max size ${CHUNK_SIZE}`);

    let totalEncryptTime = 0;

    for (let i = 0; i < chunkCount; i++) {
        const startIndex = i * CHUNK_SIZE;
        const endIndex = startIndex + CHUNK_SIZE;
        const batch = data.slice(startIndex, endIndex);

        console.log(`Processing chunk ${i+1}/${chunkCount}, size: ${batch.length}`);
        const startTime = performance.now();
        const encryptedBatch = await encryptBatch(batch);
        totalEncryptTime += performance.now() - startTime;

        const chunkKey = `data-chunk-${i}`;
        const result = await sharedStorage.storeData(STORE_NAME, chunkKey, encryptedBatch, {});
        if (!result.success) {
            throw new Error(`Failed to store chunk #${i}: ${result.error}`);
        }
    }
    console.log(`Total encryption time: ${totalEncryptTime.toFixed(2)}ms`);

    // Store meta information
    const metaRecord = { chunkCount };
    const metaRes = await sharedStorage.storeData(STORE_NAME, "data-meta", metaRecord, {});
    if (!metaRes.success) {
        throw new Error(`Failed to store meta info: ${metaRes.error}`);
    }

    // Store the last updated timestamp
    const timestamp = Date.now();
    const lastUpdatedRes = await sharedStorage.storeData(STORE_NAME, "lastUpdated", timestamp, {});
    if (!lastUpdatedRes.success) {
        throw new Error(`Failed to store lastUpdated timestamp: ${lastUpdatedRes.error}`);
    }

    console.log(`Successfully stored ${data.length} loan records in ${chunkCount} chunks.`);
    console.log(`Last updated: ${new Date(timestamp).toISOString()}`);
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

    // Otherwise, fetch data from URL
    console.log("Fetching new data...");
    try {
        console.time('Ingestion');
        
        // Try to use chunked download for large files
        let loanData;
        try {
            // First try to use chunked download for large files
            const fileData = await downloadFileInChunks(DATA_URL, 30 * 1024 * 1024, (received, total) => {
                console.log(`Downloaded: ${((received / total) * 100).toFixed(2)}%`);
            });
            const textData = new TextDecoder().decode(fileData);
            
            // Try to parse as JSON first
            try {
                loanData = JSON.parse(textData);
                console.log(`Parsed JSON data with ${loanData.length} loan records`);
            } catch (jsonError) {
                // If not valid JSON, try to parse as CSV
                console.log("Not valid JSON, trying to parse as CSV");
                const loanIds = textData.trim().split(/\r?\n/); // Handle different line endings
                
                // Convert to loan objects with IDs
                loanData = loanIds.filter(id => id && id.trim()).map(id => ({ id: id.trim() }));
                console.log(`Parsed ${loanData.length} loan IDs from CSV`);
            }
        } catch (downloadError) {
            console.log("Chunked download failed, falling back to regular fetch:", downloadError);
            
            // Fall back to regular fetch
            const response = await fetch(DATA_URL);
            if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
            
            // Try to parse as JSON first
            try {
                loanData = await response.json();
                console.log(`Parsed JSON data with ${loanData.length} loan records`);
            } catch (jsonError) {
                // If not valid JSON, try to parse as CSV
                console.log("Not valid JSON, trying to parse as CSV");
                const textData = await response.text();
                const loanIds = textData.trim().split(/\r?\n/); // Handle different line endings
                
                // Convert to loan objects with IDs
                loanData = loanIds.filter(id => id && id.trim()).map(id => ({ id: id.trim() }));
                console.log(`Parsed ${loanData.length} loan IDs from CSV`);
            }
        }

        console.log(`Fetched ${loanData.length} loan records, storing (encrypted in batches)...`);
        await storeData(loanData);
        console.timeEnd('Ingestion');

        console.log("Data successfully updated.");
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

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
        : [];

    // Assuming we're checking against some identifier in the loan objects
    return loansToCheck.filter((loan) =>
        loansArray.some((storedLoan) => storedLoan.id === loan.id)
    );
}

/**
 * Check batch of loan numbers in memory
 */
async function checkNumbersInMemory(numbersToCheck) {
    if (!storedLoansSet) {
        await loadDataIntoMemory();
    }

    // Ensure storedLoansSet is an array
    const loansArray = Array.isArray(storedLoansSet)
        ? storedLoansSet
        : [];

    // Extract all loan numbers from the stored loan objects
    const storedNumbers = loansArray.map(loan => loan.loanNumber || loan.id);
    
    // Filter the numbers to check against our stored numbers
    return numbersToCheck.filter(num => 
        storedNumbers.some(storedNum => 
            storedNum && num && storedNum.toString() === num.toString()
        )
    );
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

/**
 * Wait for a listener to respond to a ping message
 */
async function waitForListener(maxRetries = 20, initialDelay = 100) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        let delay = initialDelay;
        let timeoutId;
        
        // Single listener for all retries (defined outside sendPing)
        const listener = (event) => {
            if (event.data.action === "pong") {
                console.log("✅ Listener detected!");
                channel.removeEventListener("message", listener);
                clearTimeout(timeoutId);
                resolve(true);
            }
        };
        
        // Add listener ONCE at the start
        channel.addEventListener("message", listener);
        
        function sendPing() {
            if (attempts >= maxRetries) {
                console.warn("❌ No listener detected after maximum retries.");
                channel.removeEventListener("message", listener);
                clearTimeout(timeoutId);
                reject(new Error("Listener not found"));
                return;
            }

            console.log(`🔄 Sending ping attempt ${attempts + 1}/${maxRetries}...`);
            channel.postMessage({ action: "ping" });

            // Retry if no response within `delay` ms
            timeoutId = setTimeout(() => {
                attempts++;
                delay *= 2; // Exponential backoff
                sendPing();
            }, delay);
        }

        sendPing(); // Start the first attempt
    });
}
/**
 * Notify other tabs that this tab has opened and request loan data
 */
async function notifyAndRequestData() {
    // Create a unique ID for this tab
    const tabId = Date.now();
    
    // First, notify other tabs that we're here
    console.log("Notifying other tabs that this tab has opened...");
    channel.postMessage({
        action: "tab_opened",
        tabId: tabId,
    });
    
    // Request loans data from any existing tabs
    channel.postMessage({
        action: "request_loans",
        tabId: tabId,
    });
}

/**
 * Legacy function maintained for backward compatibility
 */
function notifyTabOpened() {
    console.log("Using notifyAndRequestData for tab notification");
    notifyAndRequestData();
}

// Set up the message listener first, so it's ready to respond to pings
channel.onmessage = async (event) => {
  console.log("Received message:", event.data);
  
  if (event.data.action === "ping") {
      console.log("✅ Received ping, responding with pong...");
      channel.postMessage({ action: "pong" });
      return;
  }

  // Rest of the message handling will be moved here
  
  if (event.data.action === "check_loans") {
      console.log("Received loans for lookup:", event?.data?.loans?.length || 0, "loans");
      const result = await checkLoansInMemory(event.data.loans);
      channel.postMessage({
          action: "response_loans_check",
          result
      });
  }

  if (event.data.action === "check_numbers") {
      console.log("Received numbers for lookup:", event?.data?.numbers?.length || 0, "numbers");
      const result = await checkNumbersInMemory(event.data.numbers);
      channel.postMessage({ action: "response_numbers", result });
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
      console.log("Received loan data from another tab.");
      if (!storedLoansSet) {
          storedLoansSet = event.data.result;
          window.storedLoansSet = storedLoansSet;
          console.log(`Loaded ${storedLoansSet.length} loan records from another tab.`);
      }
  }
};

// Main entrypoint (this is where everything starts)
(async () => {
  console.log("=== Loan Ingestion Script Starting ===");
  
  try {
    // First, notify other tabs that we're here and request data
    await notifyAndRequestData();
    
    // Add a small delay to ensure other tabs have time to set up their listeners
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Try to detect if there's another tab with the script running
    try {
      const listenerFound = await waitForListener();
      console.log("Listener detection result:", listenerFound);
    } catch (error) {
      console.log("No other tabs detected, this is the first tab");
    }
    
    // Fetch and store loan data
    await fetchAndStoreNumbers();
    
    // Double-check that we have data in memory
    if (!storedLoansSet) {
      console.log("No data in memory after initialization, loading from storage...");
      await loadDataIntoMemory();
    }
    
    // If page has been opened for a while, we still want to make sure the loan data is fresh
    setInterval(fetchAndStoreNumbers, CHECK_INTERVAL_MS);
  } catch (error) {
    console.error("Error during initialization:", error);
  }
})();