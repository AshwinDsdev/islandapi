// ########## DO NOT MODIFY THESE LINES ##########
const channel = new BroadcastChannel("island_channel");
async function waitForListener(maxRetries = 10, initialDelay = 100) {
    testChannel = channel
    return new Promise((resolve, reject) => {
        let attempts = 0;
        let delay = initialDelay;
        let timeoutId;
        let listener = (event) => {
            if (event.data.action === "pong") {
                console.log("✅ Listener detected!");
                testChannel.removeEventListener("message", listener);
                clearTimeout(timeoutId)
                resolve(true);
            }
        };
        
        function sendPing() {
            if (attempts >= maxRetries) {
                console.warn("❌ No listener detected after maximum retries.");
                testChannel.removeEventListener("message", listener);
                clearTimeout(timeoutId)
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
// ########## DO NOT MODIFY THESE LINES - END ##########

// ########## App specific RPA code starts here ##########
// Use 'waitForListener' to ensure the common RPA is loaded successfully
// Use 'checkNumbersBatch' to validate numbers against the loan numbers database

const TABLE_SELECTOR = '[role="table"]'

function validateRow(row, allowedNumbers) {
  const span = row.querySelector("td");
  if (!span) return;

  const text = span.textContent.trim();
  if (!allowedNumbers.includes(text)) {
    row.remove();
  }
}

const observerCallback = async (mutationsList) => {
  for (const mutation of mutationsList) {
    if (mutation.type === "childList" && 
    [...mutation.addedNodes].some((node) => node.nodeName === "TR" || 
                          node.nodeType === Node.ELEMENT_NODE && 
                          node.querySelector("tr"))) {
      await removeForbiddenRows();
      return
    }
  }
};


async function removeForbiddenRows() {
  const table = document.querySelector(TABLE_SELECTOR)
  disable(table)
  const numbersToCheck = [...table.querySelectorAll('td[role="loanNumber"]')].map(td => td.innerHTML);
  const allowedNumbers = await checkNumbersBatch(numbersToCheck);
  const numbersToDelete = numbersToCheck.filter(num => !allowedNumbers.includes(num));
  const rows = table.querySelectorAll("tr[role='row']");
  rows.forEach(row => {
    const span = row.querySelector('td[role="loanNumber"]');
    if (span && numbersToDelete.includes(span.textContent.trim())) {
        row.remove();
    }
  })
  enable(table)
}

function disable(element) {
  element.style.filter = 'blur(5px)';
  element.style.pointerEvents = 'none';
  element.style.userSelect = 'none';
  element.style.opacity = '0.7';
}

function enable(element) {
  element.style.filter = '';
  element.style.pointerEvents = '';
  element.style.userSelect = '';
  element.style.opacity = '';
}

$(document).ready(async () => {
  // Since some operations may take time, we first want to hide the table
  // to ensure sensitive data is not shown to the user
  const table = document.querySelector(TABLE_SELECTOR)
  disable(table)

  // Must use this line in order to ensure the common RPA is loaded,
  // before validating loan numbers accessibility
  await waitForListener();
  
  // Now we can perform the app specific actions, hide data etc'
  await removeForbiddenRows()
  
  // After we have dealt with the sensitive data, we can re-enable (show) the table
  enable(table)
  
  // Listen to table changes, in case of dynamically loaded data
  const observer = new MutationObserver(observerCallback);
    observer.observe(table, {
      childList: true,
      subtree: true
    });
});

console.log("Ingestion script loaded successfully.");