//msi-online-loan-form-list-extension.txt

// ########## DO NOT MODIFY THESE LINES ##########
const EXTENSION_ID = 'afkpnpkodeiolpnfnbdokgkclljpgmcm';

async function waitForListener(maxRetries = 20, initialDelay = 100) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        let delay = initialDelay;
        let timeoutId;

        function sendPing() {
            if (attempts >= maxRetries) {
                console.warn("❌ No listener detected after maximum retries.");
                clearTimeout(timeoutId)
                reject(new Error("Listener not found"));
                return;
            }

            console.log(`🔄 Sending ping attempt ${attempts + 1}/${maxRetries}...`);

            chrome.runtime.sendMessage(EXTENSION_ID, 
                {
                    type: 'ping',
                },
                (response) => {
                    if (response?.result === 'pong') {
                        console.log("✅ Listener detected!");
                        clearTimeout(timeoutId);
                        resolve(true);
                    } else {
                        console.warn("❌ No listener detected, retrying...");
                        timeoutId = setTimeout(() => {
                            attempts++;
                            delay *= 2; // Exponential backoff (100ms → 200ms → 400ms...)
                            sendPing();
                        }, delay);
                    }
                }
            );
        }

        sendPing(); // Start the first attempt
    });
}

/**
 * Request a batch of numbers from the storage script
 */
async function checkNumbersBatch(numbers) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(EXTENSION_ID, 
            {
                type: 'queryLoans',
                loanIds: numbers
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError.message);
                } else if (response.error) {
                    return reject(response.error);
                }

                const available = Object.keys(response.result).filter(key => response.result[key]);
                resolve(available);
            }
        );
    });
}

function onValueChange(
    evalFunction,
    callback,
    options = {}
  ) {
    let lastValue = undefined
    const startTime = new Date().getTime()
    const endTime = options.maxTime ? startTime + options.maxTime : null
    const intervalId = setInterval(async () => {
      const currentTime = new Date().getTime()
      if (endTime && currentTime > endTime) {
        clearInterval(intervalId)
        return
      }
      let newValue = await evalFunction()
      if (newValue === '') newValue = null
  
      if (lastValue === newValue) return
      lastValue = newValue
  
      await callback(newValue, lastValue)
    }, 500)
  }
// ########## DO NOT MODIFY THESE LINES - END ##########

function createUnallowedElement() {
    const unallowed = document.createElement("span");
    unallowed.appendChild(document.createTextNode("Loan is not provisioned to the user"));
    unallowed.className = "body";
    unallowed.style.display = "flex";
    unallowed.style.justifyContent = "center";
    unallowed.style.alignItems = "center";
    unallowed.style.height = "100px";
    unallowed.style.fontSize = "20px";
    unallowed.style.fontWeight = "bold";
    unallowed.style.color = "black";
    unallowed.style.position = "relative";
    unallowed.style.zIndex = "-1";

    return unallowed;
}

class ViewElement {
    constructor() {
        this.element = document.querySelector(".col-md-12 .body");
        this.parent = this.element && this.element.parentElement;
        this.unallowed = createUnallowedElement();
        this.unallowedParent = document.querySelector("nav");
    }

    remove() {
        if (this.element) {
            this.element.remove();
            this.unallowedParent.appendChild(this.unallowed);
        }
    }

    add() {
        if (this.parent) {
            this.unallowed.remove();
            this.parent.appendChild(this.element);
        }
    }
}

function getLoanNumber(viewElement) {
    // Locate the loan number field inside the specific loan details table
    const loanNumberCell = viewElement.querySelector("table tr td a.bright-green.ng-binding");

    return loanNumberCell && loanNumberCell.textContent.trim();
}

function waitForLoanNumber() {
    return new Promise((resolve) => {
        const observer = new MutationObserver((mutationsList, observer) => {
            const viewElement = new ViewElement();
            if (viewElement.element) {
                const loanNumber = getLoanNumber(viewElement.element);
                if (loanNumber) {
                    observer.disconnect(); // Stop observing
                    resolve(viewElement);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}

onValueChange(() => document.location.href, async (newVal) => {
    if (!newVal.includes("#/bidApproveReject")) return;

    const viewElement = await waitForLoanNumber();
    viewElement.remove();

    async function addIfAllowed() {
        const loanNumber = getLoanNumber(viewElement.element);
        const allowedNumbers = await checkNumbersBatch([loanNumber]);
        if (allowedNumbers.includes(loanNumber)) {
            viewElement.add();
        }
    }

    await waitForListener();
    await addIfAllowed();
});