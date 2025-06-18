/*!
 * @description : Loan Filter Script for Loansphere
 * @portal : Loansphere
 * @author : Development Team
 * @group : Development Team
 * @owner : Client
 * @lastModified : 15-May-2024
 */

(function () {
  // ########## DO NOT MODIFY THESE LINES ##########
  /**
   * @constant {string} EXTENSION_ID
   * @description The Chrome extension ID used for communication.
   */
  const EXTENSION_ID = "afkpnpkodeiolpnfnbdokgkclljpgmcm";

  /**
   * @function waitForListener
   * @description Waits for the Chrome extension listener to be available.
   * @param {number} [maxRetries=20] - Maximum number of retry attempts.
   * @param {number} [initialDelay=100] - Initial delay in milliseconds between retries.
   * @returns {Promise<boolean>} A promise that resolves to true if the listener is available, false otherwise.
   */
  async function waitForListener(maxRetries = 20, initialDelay = 100) {
    return new Promise((resolve, reject) => {
      if (
        typeof chrome === "undefined" ||
        !chrome.runtime ||
        !chrome.runtime.sendMessage
      ) {
        console.warn(
          "❌ Chrome extension API not available. Running in standalone mode."
        );
        // Show the page if Chrome extension API is not available
        pageUtils.showPage(true);
        resolve(false);
        return;
      }

      let attempts = 0;
      let delay = initialDelay;
      let timeoutId;

      function sendPing() {
        if (attempts >= maxRetries) {
          console.warn("❌ No listener detected after maximum retries.");
          clearTimeout(timeoutId);
          reject(new Error("Listener not found"));
          return;
        }

        console.log(`🔄 Sending ping attempt ${attempts + 1}/${maxRetries}...`);

        try {
          chrome.runtime.sendMessage(
            EXTENSION_ID,
            { type: "ping" },
            (response) => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "Chrome extension error:",
                  chrome.runtime.lastError
                );
                attempts++;
                if (attempts >= maxRetries) {
                  reject(new Error("Chrome extension error"));
                  return;
                }
                timeoutId = setTimeout(sendPing, delay);
                return;
              }

              if (response?.result === "pong") {
                console.log("✅ Listener detected!");
                clearTimeout(timeoutId);
                resolve(true);
              } else {
                console.warn("❌ No listener detected, retrying...");
                timeoutId = setTimeout(() => {
                  attempts++;
                  delay *= 2; // Exponential backoff
                  sendPing();
                }, delay);
              }
            }
          );
        } catch (error) {
          console.error("Error sending message to extension:", error);
          resolve(false);
        }
      }

      sendPing(); // Start the first attempt
    });
  }

  /**
   * @function checkNumbersBatch
   * @description Checks a batch of loan numbers against the extension to determine which ones are allowed.
   * @param {string[]} numbers - Array of loan numbers to check.
   * @returns {Promise<string[]>} A promise that resolves to an array of allowed loan numbers.
   * @throws {Error} If there's an error communicating with the extension.
   */
  async function checkNumbersBatch(numbers) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        {
          type: "queryLoans",
          loanIds: numbers,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError.message);
          } else if (response.error) {
            return reject(response.error);
          }

          const available = Object.keys(response.result).filter(
            (key) => response.result[key]
          );
          resolve(available);
        }
      );
    });
  }
  // ########## DO NOT MODIFY THESE LINES - END ##########
  /**
   * 
   * @namespace pageUtils
   * @description Utility functions for page manipulation and element selection.
   */
  const pageUtils = {
    /**
     * @property {boolean} isHidden
     * @description Tracks whether the page is currently hidden
     * @private
     */
    _isHidden: false,

    /**
     * @property {number} hideCount
     * @description Tracks the number of active hide requests
     * @private
     */
    _hideCount: 0,

    /**
     * @function togglePageOpacity
     * @description Sets the page opacity. It can be used to show and hide the page content.
     * @param {number} val - The opacity value between 0 and 1.
     */
    togglePageOpacity: function (val) {
      document.body.style.opacity = val;
    },

    /**
     * @function showPage
     * @description Shows or hides the page by setting opacity to 1 or 0.
     * @param {boolean} val - If true, shows the page; if false, hides it.
     */
    showPage: function (val) {
      document.body.style.opacity = val ? 1 : 0;
      this._isHidden = !val;
      console.log(`Page visibility set to: ${val ? "visible" : "hidden"}`);
    },

    /**
     * @function togglePageDisplay
     * @description Sets the page display property. It can be used to show and hide the page content.
     * @param {string} val - The display value (e.g., 'block', 'none').
     */
    togglePageDisplay: function (val) {
      document.body.style.display = val;
    },

    /**
     * @function getElementByXPath
     * @description Get an element by its XPath.
     * @param {string} xpath - The XPath of the element.
     * @param {Document} [context=document] - The context in which to search for the XPath.
     * @returns {Element|null} The first element matching the XPath, or null if no match is found.
     */
    getElementByXPath: function (xpath, context = document) {
      const result = document.evaluate(
        xpath,
        context,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue;
    },

    /**
     * @function resetPageVisibility
     * @description Resets the page visibility state.
     * Useful when you want to force a clean state.
     * @param {boolean} [show=true] - Whether to show the page after reset.
     */
    resetPageVisibility: function (show = true) {
      this._isHidden = !show;
      document.body.style.opacity = show ? 1 : 0;
      console.log(`Page visibility RESET to: ${show ? "visible" : "hidden"}`);
    },
  };

  /**
   * @namespace DEBUG
   * @description Debug utility for logging, warnings, and errors with controlled output.
   */
  const DEBUG = {
    /**
     * @property {boolean} enabled
     * @description Controls whether debug logs and warnings are displayed.
     */
    enabled: false,

    /**
     * @function log
     * @description Logs a debug message if debugging is enabled.
     * @param {string} message - The message to log.
     * @param {...any} args - Additional arguments to log.
     */
    log: function (message, ...args) {
      if (this.enabled) {
        console.log(`[LoanFilter] ${message}`, ...args);
      }
    },

    /**
     * @function warn
     * @description Logs a warning message if debugging is enabled.
     * @param {string} message - The warning message.
     * @param {...any} args - Additional arguments to log.
     */
    warn: function (message, ...args) {
      if (this.enabled) {
        console.warn(`[LoanFilter] ${message}`, ...args);
      }
    },

    /**
     * @function error
     * @description Logs an error message regardless of debug setting.
     * @param {string} message - The error message.
     * @param {...any} args - Additional arguments to log.
     */
    error: function (message, ...args) {
      // Only log critical errors
      if (message.includes("Error initializing")) {
        console.error(`[LoanFilter] ${message}`, ...args);
      }
    },
  };

  /**
   * @namespace throttle
   * @description Utility for throttling frequent operations to improve performance.
   */
  const throttle = {
    /**
     * @property {Map} timers
     * @description Stores active timers for throttled operations.
     */
    timers: new Map(),

    /**
     * @function execute
     * @description Executes a callback function with throttling.
     * @param {string} key - Unique identifier for the throttled operation.
     * @param {Function} callback - The function to execute after the delay.
     * @param {number} [delay=1000] - The delay in milliseconds.
     */
    execute: function (key, callback, delay = 1000) {
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
      }
      this.timers.set(
        key,
        setTimeout(() => {
          callback();
          this.timers.delete(key);
        }, delay)
      );
    },
  };

  /**
   * @constant {number} FILTER_INTERVAL_MS
   * @description The interval in milliseconds for filtering operations.
   */
  const FILTER_INTERVAL_MS = 2000;

  /**
   * @constant {WeakSet} processedElements
   * @description Tracks DOM elements that have already been processed to avoid redundant operations.
   */
  const processedElements = new WeakSet();

  /**
   * @constant {WeakSet} processedTables
   * @description Tracks table elements that have already been processed.
   */
  const processedTables = new WeakSet();

  /**
   * @constant {WeakSet} processedRows
   * @description Tracks table row elements that have already been processed.
   */
  const processedRows = new WeakSet();

  /**
   * @function extractLoanNumbers
   * @description Extracts potential loan numbers from text content using regex patterns.
   * @param {string} text - The text to extract loan numbers from.
   * @returns {string[]} Array of unique potential loan numbers found in the text.
   */
  function extractLoanNumbers(text) {
    // Handle empty or null text
    if (!text) return [];

    // Convert to string and trim whitespace
    text = String(text).trim();

    const matches = [];

    // Find numeric loan numbers (5 or more digits)
    const digitMatches = text.match(/\b\d{5,}\b/g);

    // Find alphanumeric loan numbers (5 or more characters, uppercase)
    const alphaNumMatches = text.match(/\b[A-Z0-9]{5,}\b/g);

    // Combine matches
    if (digitMatches) matches.push(...digitMatches);
    if (alphaNumMatches) matches.push(...alphaNumMatches);

    // Return unique matches using Set
    return [...new Set(matches)];
  }

  /**
   * @function containsLoanNumber
   * @description Quick check if text contains a potential loan number pattern.
   * @param {string} text - The text to check.
   * @returns {boolean} True if the text contains a potential loan number, false otherwise.
   */
  function containsLoanNumber(text) {
    // Check for numeric loan numbers (5 or more digits)
    // or alphanumeric loan numbers (5 or more characters, uppercase)
    return /\b\d{5,}\b/.test(text) || /\b[A-Z0-9]{5,}\b/.test(text);
  }

  /**
   * @function onValueChange
   * @description Utility function to watch for value changes and trigger a callback when changes occur.
   * @param {Function} evalFunction - Function that returns the value to monitor.
   * @param {Function} callback - Function to call when the value changes, receives (newValue, oldValue).
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.maxTime] - Maximum time in milliseconds to watch for changes.
   * @param {number} [options.interval=1000] - Interval in milliseconds between checks.
   */
  function onValueChange(evalFunction, callback, options = {}) {
    const interval = options.interval || 1000;
    const maxTime = options.maxTime || null;

    let lastValue = evalFunction();
    let startTime = Date.now();
    let timeoutId = null;

    function check() {
      const currentValue = evalFunction();

      if (currentValue !== lastValue) {
        callback(currentValue, lastValue);
        lastValue = currentValue;
      }

      if (maxTime && Date.now() - startTime > maxTime) {
        clearTimeout(timeoutId);
        return;
      }

      timeoutId = setTimeout(check, interval);
    }

    timeoutId = setTimeout(check, interval);

    // Return a function to stop watching
    return function stopWatching() {
      clearTimeout(timeoutId);
    };
  }

  /**
   * @function createUnallowedElement
   * @description Create unallowed element to show when loan is not allowed for users.
   * @returns {HTMLElement} The created element
   */
  function createUnallowedElement() {
    const unallowed = document.createElement("span");
    unallowed.appendChild(
      document.createTextNode("Loan is not provisioned to the user")
    );
    unallowed.className = "body";
    unallowed.style.display = "flex";
    unallowed.style.paddingLeft = "250px";
    unallowed.style.alignItems = "center";
    unallowed.style.height = "100px";
    unallowed.style.fontSize = "20px";
    unallowed.style.fontWeight = "bold";
    unallowed.style.color = "black";
    unallowed.style.position = "relative";

    return unallowed;
  }

  /**
   * @function createLoader
   * @description Create loader style to show when trying to establish connection with extension
   * @returns {HTMLElement} The created style element
   */
  function createLoader() {
    const style = document.createElement("style");
    style.textContent = `
      #loaderOverlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(255, 255, 255, 5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        transition: opacity 0.3s ease;
      }
      .spinner {
        width: 60px;
        height: 60px;
        border: 6px solid #ccc;
        border-top-color: #2b6cb0;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to {transform: rotate(360deg);}
      }
      #loaderOverlay.hidden {
        opacity: 0;
        pointer-events: none;
      }
    `;
    return style;
  }

  /**
   * @function createLoaderElement
   * @description To create Loader Element.
   * @returns {HTMLElement} The created loader element
   */
  function createLoaderElement() {
    const loader = document.createElement("div");
    loader.id = "loaderOverlay";
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    loader.appendChild(spinner);
    return loader;
  }

  /**
   * @function showLoader
   * @description Shows the loader overlay
   */
  function showLoader() {
    let loader = document.getElementById("loaderOverlay");
    if (!loader) {
      document.head.appendChild(createLoader());
      loader = createLoaderElement();
      document.body.appendChild(loader);
    } else {
      loader.classList.remove("hidden");
    }
  }

  /**
   * @function hideLoader
   * @description Hides the loader overlay
   */
  function hideLoader() {
    const loader = document.getElementById("loaderOverlay");
    if (loader) {
      loader.classList.add("hidden");
    }
  }

  /**
   * @function showNotProvisionedAlert
   * @description Shows an alert that the loan is not provisioned to the user
   * @param {string} loanNumber - The loan number that is not provisioned
   */
  function showNotProvisionedAlert(loanNumber) {
    // Remove any existing alerts
    removeNotProvisionedAlert();

    // Create the alert element
    const alertElement = document.createElement("div");
    alertElement.id = "loan-not-provisioned-alert";
    alertElement.style.position = "fixed";
    alertElement.style.top = "20px";
    alertElement.style.left = "50%";
    alertElement.style.transform = "translateX(-50%)";
    alertElement.style.zIndex = "9999";
    alertElement.style.padding = "20px";
    alertElement.style.minWidth = "300px";
    alertElement.style.backgroundColor = "#f8d7da";
    alertElement.style.color = "#721c24";
    alertElement.style.borderRadius = "4px";
    alertElement.style.textAlign = "center";
    alertElement.style.fontWeight = "bold";
    alertElement.style.fontSize = "16px";
    alertElement.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
    alertElement.style.border = "1px solid #f5c6cb";

    // Use the loan number in the message if provided
    if (loanNumber) {
      alertElement.textContent = `Loan is not provisioned to the user`;
    } else {
      alertElement.textContent = "Loan is not provisioned to the user";
    }

    // Add a close button
    const closeButton = document.createElement("button");
    closeButton.textContent = "×";
    closeButton.style.position = "absolute";
    closeButton.style.top = "5px";
    closeButton.style.right = "10px";
    closeButton.style.background = "none";
    closeButton.style.border = "none";
    closeButton.style.fontSize = "20px";
    closeButton.style.fontWeight = "bold";
    closeButton.style.color = "#721c24";
    closeButton.style.cursor = "pointer";
    closeButton.onclick = removeNotProvisionedAlert;

    alertElement.appendChild(closeButton);

    // Add to the document
    document.body.appendChild(alertElement);

    // Auto-hide after 10 seconds
    setTimeout(removeNotProvisionedAlert, 10000);
  }

  /**
   * @function removeNotProvisionedAlert
   * @description Removes the not provisioned alert if it exists
   */
  function removeNotProvisionedAlert() {
    const alertElement = document.getElementById("loan-not-provisioned-alert");
    if (alertElement) {
      alertElement.remove();
    }
  }

  /**
   * @class TableHandler
   * @description Handles table filtering operations
   */
  class TableHandler {
    constructor() {
      this.unallowedElement = createUnallowedElement();
    }

    /**
     * @function processTableRows
     * @description Processes all table rows in the document to hide those with restricted loan numbers.
     * @returns {Promise<void>} A promise that resolves when processing is complete.
     */
    async processTableRows() {
      // Select all table rows in the document
      const rows = document.querySelectorAll("tr");
      console.log(`Processing ${rows.length} table rows`);

      // Process each row
      for (const row of rows) {
        // Skip already processed rows to avoid redundant work
        if (processedElements.has(row)) continue;

        // Mark this row as processed
        processedElements.add(row);

        // Check if the row should be hidden
        if (await this.shouldHideElement(row)) {
          row.style.display = "none";
          console.log("Hiding row with restricted loan number");
        }
      }
    }

    /**
     * @function shouldHideElement
     * @description Determines if an element should be hidden based on loan numbers it contains.
     * @param {HTMLElement} element - The DOM element to check.
     * @returns {Promise<boolean>} A promise that resolves to true if the element should be hidden, false otherwise.
     */
    async shouldHideElement(element) {
      // Skip non-content elements that won't contain loan numbers
      if (
        element.tagName === "SCRIPT" ||
        element.tagName === "STYLE" ||
        element.tagName === "META" ||
        element.tagName === "LINK"
      ) {
        return false;
      }

      // Get the text content of the element
      const text = element.innerText || element.textContent || "";

      // Quick check if the text might contain a loan number
      if (!containsLoanNumber(text)) return false;

      // Extract potential loan numbers from the text
      const potentialLoanNumbers = extractLoanNumbers(text);
      if (potentialLoanNumbers.length === 0) return false;

      // Check if any of the potential loan numbers are allowed
      for (const loanNumber of potentialLoanNumbers) {
        // If at least one loan number is allowed, don't hide the element
        const isAllowed = await this.isLoanNumberAllowed(loanNumber);
        if (isAllowed) {
          return false;
        }
      }

      // If no loan numbers are allowed, hide the element
      return true;
    }

    /**
     * @function isLoanNumberAllowed
     * @description Checks if a loan number is allowed for the current user.
     * @param {string} loanNumber - The loan number to check.
     * @returns {Promise<boolean>} A promise that resolves to true if the loan number is allowed, false otherwise.
     */
    async isLoanNumberAllowed(loanNumber) {
      // Use the checkNumbersBatch function to check if the loan number is allowed
      const allowedLoans = await checkNumbersBatch([loanNumber]);
      return allowedLoans.length > 0;
    }

    /**
     * @function processMessagesTable
     * @description Specifically processes the messages table which has a special structure
     * @returns {Promise<boolean>} True if the table was processed, false otherwise
     */
    async processMessagesTable() {
      // Check for Loansphere_Messages.html specific elements first
      const messagesTable = document.querySelector(".messages-table");
      const messagesTableBody = document.getElementById("messagesTableBody");

      // Try to find the results container
      const resultsContainer = document.querySelector(
        ".table-responsive, .results-container, .message-list, table, .messages-table"
      );

      if (!resultsContainer) {
        // No results container found, nothing to process
        return false;
      }

      // Try to get rows from messagesTableBody first, then fall back to resultsContainer
      let resultRows;
      if (messagesTableBody) {
        resultRows = messagesTableBody.querySelectorAll("tr");
      } else {
        resultRows = resultsContainer.querySelectorAll(
          "tbody tr:not(.header-row):not(.mat-header-row)"
        );
      }

      console.log(`Found ${resultRows.length} result rows in messages table`);

      // First, remove any existing "not provisioned" message
      removeNotProvisionedAlert();

      // Try to find the search form
      const searchForm = document.querySelector(
        "form.search-form, .filter-form, .search-container, .messages-filters"
      );

      if (searchForm) {
        // Get the loan number input directly
        const loanNumberInput = document.getElementById("loanNumberFilter");
        const loanNumber = loanNumberInput ? loanNumberInput.value.trim() : "";

        const inputs = searchForm.querySelectorAll("input, select");
        let hasSearchCriteria = false;
        let searchFields = [];

        for (const input of inputs) {
          if (input.value && input.value.trim() !== "") {
            hasSearchCriteria = true;
            searchFields.push(input.name || input.id);
          }
        }

        // If we have search criteria and exactly one result, check if it's allowed
        if (hasSearchCriteria && resultRows.length === 1) {
          const resultRow = resultRows[0];
          const rowText = resultRow.textContent || "";

          // Try to extract loan numbers from the row text
          const loanNumbers = extractLoanNumbers(rowText);

          // If we couldn't extract loan numbers but have a loan number from input, use that
          const numbersToCheck =
            loanNumbers.length > 0
              ? loanNumbers
              : loanNumber
              ? [loanNumber]
              : [];

          if (numbersToCheck.length > 0) {
            // Check if any of these loan numbers are allowed
            let anyAllowed = false;

            for (const num of numbersToCheck) {
              const isAllowed = await this.isLoanNumberAllowed(num);
              if (isAllowed) {
                anyAllowed = true;
                break;
              }
            }

            // If none are allowed, hide the table and show the message
            if (!anyAllowed) {
              // Try multiple approaches to hide the table
              const elementsToHide = [
                messagesTable,
                document.querySelector(".messages-list"),
                resultsContainer,
                resultRow.closest("table"),
              ];

              // Hide all found elements
              elementsToHide.forEach((element) => {
                if (element) {
                  element.style.display = "none";
                }
              });

              // Show the not provisioned message
              showNotProvisionedAlert(
                numbersToCheck[0] || "Loan is not provisioned to the user"
              );
              return true;
            } else {
              // Make sure the row is visible if it contains an allowed loan
              resultRow.style.display = "";
              // Make sure the table is visible
              if (resultsContainer) {
                resultsContainer.style.display = "";
              }
            }
          }
        }
      }

      // Check if there are no visible rows after filtering
      const visibleRows = Array.from(resultRows).filter(
        (row) =>
          row.style.display !== "none" &&
          getComputedStyle(row).display !== "none"
      );

      if (visibleRows.length === 0 && resultRows.length > 0) {
        // No visible rows remain, show the "not provisioned" message
        this.showNotProvisioned(resultsContainer);
        return true;
      }

      return false;
    }

    /**
     * @function showNotProvisioned
     * @description Shows the "not provisioned" message in place of the table
     * @param {HTMLElement} element - The element to replace
     * @param {string} [loanNumber=""] - The loan number to display in the message
     */
    showNotProvisioned(element, loanNumber = "") {
      if (!element) return;

      const parent = element.parentElement;
      if (!parent) return;

      // Hide the element
      element.style.display = "none";

      // Remove any existing message
      const existingMessage = document.getElementById("loan-not-provisioned");
      if (existingMessage) {
        existingMessage.remove();
      }

      // Create a more visible message
      const container = document.createElement("div");
      container.id = "loan-not-provisioned";
      container.style.padding = "20px";
      container.style.margin = "20px 0";
      container.style.backgroundColor = "#f8d7da";
      container.style.color = "#721c24";
      container.style.borderRadius = "4px";
      container.style.textAlign = "center";
      container.style.fontWeight = "bold";
      container.style.fontSize = "16px";
      container.style.border = "1px solid #f5c6cb";

      // Use the loan number in the message if provided
      if (loanNumber) {
        container.textContent = `Loan is not provisioned to the user`;
      } else {
        container.textContent = "Loan is not provisioned to the user";
      }

      // Insert the message where the element was
      parent.insertBefore(container, element.nextSibling);

      // Also show a global alert for better visibility
      showNotProvisionedAlert(loanNumber || "");
    }

    /**
     * @function processAllTables
     * @description Processes all tables in the document
     * @returns {Promise<void>}
     */
    async processAllTables() {
      // First try to process the messages table which has a special structure
      const messagesTableProcessed = await this.processMessagesTable();

      // If the messages table was processed successfully, we're done
      if (messagesTableProcessed) {
        return;
      }

      // Otherwise, process all table rows
      await this.processTableRows();
    }

    /**
     * @function processAllTables
     * @description Processes all tables in the document
     * @returns {Promise<void>}
     */
    async processAllTables() {
      const tables = this.findTables();
      for (const table of tables) {
        await this.processTable(table);
      }
    }
  }

  /**
   * @class FormHandler
   * @description Handles form filtering operations
   */
  class FormHandler {
    constructor() {
      this.unallowedElement = createUnallowedElement();
      this.tableHandler = new TableHandler();
    }

    /**
     * @function monitorSearchAndFilterForms
     * @description Monitors search and filter forms for submissions
     * @returns {void}
     */
    monitorSearchAndFilterForms() {
      // Find all search and filter forms
      const forms = document.querySelectorAll(
        "form.search-form, form.filter-form, .search-container form, .messages-filters form"
      );

      for (const form of forms) {
        // Skip already processed forms
        if (processedElements.has(form)) continue;

        // Mark as processed
        processedElements.add(form);

        // Add submit event listener
        form.addEventListener("submit", (event) => {
          // Set flag to indicate a filter was just applied
          window._filterJustApplied = true;

          // Show loader during filtering
          showLoader();

          // Schedule processing after a short delay to allow the results to load
          setTimeout(async () => {
            try {
              await processAllElements();
            } finally {
              // Always hide loader when done
              hideLoader(true);

              // Reset the filter applied flag
              window._filterJustApplied = false;
            }
          }, 500);
        });

        // Monitor filter buttons
        const filterButtons = form.querySelectorAll(
          'button[type="submit"], input[type="submit"], .filter-button, .search-button'
        );

        for (const button of filterButtons) {
          button.addEventListener("click", () => {
            // Set flag to indicate a filter was just applied
            window._filterJustApplied = true;

            // Show loader during filtering
            showLoader();

            // Schedule processing after a short delay
            setTimeout(async () => {
              try {
                await processAllElements();
              } finally {
                // Always hide loader when done
                hideLoader(true);

                // Reset the filter applied flag
                window._filterJustApplied = false;
              }
            }, 500);
          });
        }
      }
    }

    /**
     * @function processGenericElements
     * @description Processes generic elements that might contain loan numbers
     * @returns {Promise<void>}
     */
    async processGenericElements() {
      // Select elements that are likely to contain loan information
      const potentialContainers = document.querySelectorAll(
        '.borrower-row, .loan-item, .card, .list-item, div[class*="loan"], div[class*="borrower"]'
      );

      for (const container of potentialContainers) {
        // Skip already processed containers
        if (processedElements.has(container)) continue;

        // Mark as processed
        processedElements.add(container);

        // Check if the container should be hidden
        if (await this.tableHandler.shouldHideElement(container)) {
          container.style.display = "none";
        }
      }
    }

    /**
     * @function processSecureMessageDropdown
     * @description Processes secure message dropdown to filter out restricted loans
     * @returns {Promise<void>}
     */
    async processSecureMessageDropdown() {
      const loanDropdown = document.getElementById("loanPropertySelect");
      if (!loanDropdown || processedElements.has(loanDropdown)) return;

      processedElements.add(loanDropdown);

      // Create a new dropdown to replace the original
      const newDropdown = document.createElement("select");
      newDropdown.id = loanDropdown.id;
      newDropdown.className = loanDropdown.className;
      newDropdown.name = loanDropdown.name;

      // Copy attributes from the original dropdown
      for (const attr of loanDropdown.attributes) {
        if (
          attr.name !== "id" &&
          attr.name !== "class" &&
          attr.name !== "name"
        ) {
          newDropdown.setAttribute(attr.name, attr.value);
        }
      }

      // Process each option
      for (const option of Array.from(loanDropdown.options)) {
        const optionText = option.textContent || "";
        const loanNumbers = extractLoanNumbers(optionText);

        // If no loan numbers found or it's a default option, keep it
        if (
          loanNumbers.length === 0 ||
          option.value === "" ||
          option.disabled
        ) {
          newDropdown.appendChild(option.cloneNode(true));
          continue;
        }

        // Check if any of the loan numbers are allowed
        let anyAllowed = false;
        for (const loanNumber of loanNumbers) {
          if (await this.tableHandler.isLoanNumberAllowed(loanNumber)) {
            anyAllowed = true;
            break;
          }
        }

        // If at least one loan number is allowed, keep the option
        if (anyAllowed) {
          newDropdown.appendChild(option.cloneNode(true));
        }
      }

      // Replace the original dropdown with the filtered one
      loanDropdown.parentNode.replaceChild(newDropdown, loanDropdown);
    }

    /**
     * @function processAllForms
     * @description Processes all forms in the document
     * @returns {Promise<void>}
     */
    async processAllForms() {
      // Monitor search and filter forms
      this.monitorSearchAndFilterForms();

      // Process generic elements that might contain loan numbers
      await this.processGenericElements();

      // Process secure message dropdown
      await this.processSecureMessageDropdown();
    }
  }

  /**
   * @function setupMutationObserver
   * @description Sets up a MutationObserver to monitor DOM changes
   * @returns {MutationObserver} The created observer
   */
  function setupMutationObserver() {
    // Create a mutation observer to watch for DOM changes
    const observer = new MutationObserver((mutations) => {
      // Use throttling to avoid excessive processing
      throttle.execute(
        "domChanges",
        async () => {
          await processAllElements();
        },
        500
      );
    });

    // Try to find specific target nodes to observe
    const targetNodes = [
      document.querySelector(".messages-container"),
      document.querySelector(".messages-list"),
      document.querySelector(".message-threads-container"),
      document.querySelector("main"),
      document.querySelector(".wrapper"),
    ].filter((node) => node);

    // If we found specific nodes to observe, use them
    if (targetNodes.length > 0) {
      // Observe specific nodes if found
      targetNodes.forEach((node) => {
        observer.observe(node, {
          childList: true,
          subtree: true,
        });
      });
    } else {
      // Fallback to body observation with less intensive options
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: false,
        attributeFilter: ["class", "id"], // Only observe specific attribute changes
      });
    }

    return observer;
  }

  /**
   * @function processAllElements
   * @description Processes all elements in the document
   * @returns {Promise<void>}
   */
  async function processAllElements() {
    if (window._processingAllElements) {
      console.log("Already processing all elements, skipping");
      return;
    }

    window._processingAllElements = true;

    // Only show loader during initial load or when a filter was just applied
    const isInitialLoad = !window._initialLoadComplete;
    const shouldShowLoader = isInitialLoad || window._filterJustApplied;

    if (shouldShowLoader) {
      // Show loader and hide page content
      showLoader();
    } else {
      // Just hide the page content without showing the loader
      pageUtils.showPage(false);
    }

    try {
      const tableHandler = new TableHandler();
      const formHandler = new FormHandler();

      // Process all elements
      await tableHandler.processTableRows();
      await formHandler.processGenericElements();
      await formHandler.processSecureMessageDropdown();

      // Only call handleSearchResults if we're not already processing search results
      if (!window._processingSearchResults) {
        await handleSearchResults();
      }

      // Mark initial load as complete
      window._initialLoadComplete = true;

      // Hide loader and show page after processing
      if (shouldShowLoader) {
        hideLoader(true);
      } else {
        // Just show the page content
        pageUtils.showPage(true);
      }
    } catch (error) {
      console.error("Error processing elements:", error);
      // Always hide loader and show page in case of errors
      if (shouldShowLoader) {
        hideLoader(true);
      } else {
        pageUtils.showPage(true);
      }
    } finally {
      window._processingAllElements = false;
    }
  }

  /**
   * @function handleSearchResults
   * @description Handles search results to filter out restricted loans
   * @returns {Promise<void>}
   */
  async function handleSearchResults() {
    if (window._processingSearchResults) {
      return;
    }

    window._processingSearchResults = true;
    window._filterJustApplied = false;

    try {
      // Check for Loansphere_Messages.html specific elements first
      const messagesTable = document.querySelector(".messages-table");
      const messagesTableBody = document.getElementById("messagesTableBody");

      // Try to find the results container
      const resultsContainer = document.querySelector(
        ".table-responsive, .results-container, .message-list, table, .messages-table"
      );

      if (!resultsContainer) {
        // Just make sure the page is visible
        pageUtils.showPage(true);
        return;
      }

      // Try to get rows from messagesTableBody first, then fall back to resultsContainer
      let resultRows;
      if (messagesTableBody) {
        resultRows = messagesTableBody.querySelectorAll("tr");
      } else {
        resultRows = resultsContainer.querySelectorAll(
          "tbody tr:not(.header-row):not(.mat-header-row)"
        );
      }

      // First, remove any existing "not provisioned" message
      removeNotProvisionedAlert();

      // Try to find the search form
      const searchForm = document.querySelector(
        "form.search-form, .filter-form, .search-container, .messages-filters"
      );

      if (searchForm) {
        // Get the loan number input directly
        const loanNumberInput = document.getElementById("loanNumberFilter");
        const loanNumber = loanNumberInput ? loanNumberInput.value.trim() : "";

        const inputs = searchForm.querySelectorAll("input, select");
        let hasSearchCriteria = false;
        let searchFields = [];

        for (const input of inputs) {
          if (input.value && input.value.trim() !== "") {
            hasSearchCriteria = true;
            searchFields.push(input.name || input.id);
          }
        }

        // If we have search criteria and exactly one result, check if it's allowed
        if (hasSearchCriteria && resultRows.length === 1) {
          const resultRow = resultRows[0];
          const rowText = resultRow.textContent || "";

          // Try to extract loan numbers from the row text
          const loanNumbers = extractLoanNumbers(rowText);

          // If we couldn't extract loan numbers but have a loan number from input, use that
          const numbersToCheck =
            loanNumbers.length > 0
              ? loanNumbers
              : loanNumber
              ? [loanNumber]
              : [];

          if (numbersToCheck.length > 0) {
            // Check if any of these loan numbers are allowed
            let anyAllowed = false;
            const tableHandler = new TableHandler();

            for (const num of numbersToCheck) {
              const isAllowed = await tableHandler.isLoanNumberAllowed(num);
              if (isAllowed) {
                anyAllowed = true;
                break;
              }
            }

            // If none are allowed, hide the table and show the message
            if (!anyAllowed) {
              // Try multiple approaches to hide the table
              const elementsToHide = [
                messagesTable,
                document.querySelector(".messages-list"),
                resultsContainer,
                resultRow.closest("table"),
              ];

              // Hide all found elements
              elementsToHide.forEach((element) => {
                if (element) {
                  element.style.display = "none";
                }
              });

              // Show the not provisioned message
              showNotProvisionedAlert(numbersToCheck[0] || "");
            } else {
              // Make sure the row is visible if it contains an allowed loan
              resultRow.style.display = "";
              // Make sure the table is visible
              if (resultsContainer) {
                resultsContainer.style.display = "";
              }
            }
          }
        }
      }

      // Check if there are no visible rows after filtering
      const visibleRows = Array.from(resultRows).filter(
        (row) =>
          row.style.display !== "none" &&
          getComputedStyle(row).display !== "none"
      );

      if (visibleRows.length === 0 && resultRows.length > 0) {
        // No visible rows remain, show the "not provisioned" message
        // const tableHandler = new TableHandler();
        // tableHandler.showNotProvisioned(resultsContainer);
      }
    } catch (error) {
      console.error("Error in handleSearchResults:", error);
    } finally {
      window._processingSearchResults = false;

      // Show the page after processing is complete
      if (window._loaderShowing) {
        hideLoader(true);
      } else {
        document.body.style.opacity = 1;
        pageUtils._isHidden = false;
      }
    }
  }

  /**
   * @function createLoader
   * @description Creates a loader element to show during filtering
   * @returns {HTMLElement} The loader element
   */
  function createLoader() {
    // Create the loader container
    const loaderContainer = document.createElement("div");
    loaderContainer.id = "loan-filter-loader";
    loaderContainer.style.position = "fixed";
    loaderContainer.style.top = "0";
    loaderContainer.style.left = "0";
    loaderContainer.style.width = "100%";
    loaderContainer.style.height = "100%";
    loaderContainer.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
    loaderContainer.style.zIndex = "9999";
    loaderContainer.style.display = "flex";
    loaderContainer.style.justifyContent = "center";
    loaderContainer.style.alignItems = "center";
    loaderContainer.style.flexDirection = "column";

    // Create the spinner
    const spinner = document.createElement("div");
    spinner.style.border = "5px solid #f3f3f3";
    spinner.style.borderTop = "5px solid #3498db";
    spinner.style.borderRadius = "50%";
    spinner.style.width = "50px";
    spinner.style.height = "50px";
    spinner.style.animation = "spin 1s linear infinite";

    // Add the animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    // Create the loading text
    const loadingText = document.createElement("div");
    loadingText.textContent = "Loading...";
    loadingText.style.marginTop = "20px";
    loadingText.style.fontWeight = "bold";
    loadingText.style.fontSize = "16px";

    // Assemble the loader
    loaderContainer.appendChild(spinner);
    loaderContainer.appendChild(loadingText);

    return loaderContainer;
  }

  /**
   * @function showLoader
   * @description Shows the loader and hides the page content
   */
  function showLoader() {
    // Hide the page content immediately
    pageUtils.showPage(false);

    // Remove any existing loader
    const existingLoader = document.getElementById("loan-filter-loader");
    if (existingLoader) {
      existingLoader.remove();
    }

    // Create and add the loader
    const loader = createLoader();
    document.body.appendChild(loader);

    // Set a flag to indicate the loader is showing
    window._loaderShowing = true;

    console.log("Loader shown, page content hidden");
  }

  /**
   * @function hideLoader
   * @description Hides the loader
   * @param {boolean} [showPage=true] - Whether to show the page content after hiding the loader
   */
  function hideLoader(showPage = true) {
    // Remove the loader
    const loader = document.getElementById("loan-filter-loader");
    if (loader) {
      loader.remove();
    }

    // Reset the loader flag
    window._loaderShowing = false;

    // Show the page content if requested
    if (showPage) {
      pageUtils.showPage(true);
    }

    console.log("Loader hidden, page content shown:", showPage);
  }

  /**
   * @function init
   * @description Initializes the loan filter script
   * @returns {Promise<void>}
   */
  async function init() {
    try {
      // Reset page visibility state and hide the page immediately
      pageUtils.resetPageVisibility(false);

      // Add a safety timeout to ensure the page is shown after a maximum of 5 seconds
      const safetyTimeout = setTimeout(() => {
        if (pageUtils._isHidden || window._loaderShowing) {
          console.log("Safety timeout triggered - forcing page to be visible");
          hideLoader(true);
          pageUtils.resetPageVisibility(true);
        }
      }, 5000);

      // Show loader
      showLoader();

      // Initialize state flags
      window._processingAllElements = false;
      window._processingSearchResults = false;
      window._filterJustApplied = false;
      window._initialLoadComplete = false;
      window._showingNotProvisionedMessage = false;
      window._loaderShowing = false;

      // Wait for the extension listener
      const listenerAvailable = await waitForListener();

      if (!listenerAvailable) {
        console.warn("Extension listener not available, showing page");
        hideLoader(true); // Hide loader and show page
        clearTimeout(safetyTimeout);
        return;
      }

      // Set up mutation observer
      const observer = setupMutationObserver();

      // Initial form monitoring
      const formHandler = new FormHandler();
      formHandler.monitorSearchAndFilterForms();

      // Process all elements initially - keep loader visible during processing
      try {
        await processAllElements();
      } catch (error) {
        console.error("Error during initial processing:", error);
      }

      // Handle loan detail view
      try {
        const viewElement = await waitForLoanNumber();
        if (viewElement) {
          const loanNumber = getLoanNumber(viewElement.element);
          if (loanNumber) {
            const tableHandler = new TableHandler();
            const isAllowed = await tableHandler.isLoanNumberAllowed(
              loanNumber
            );
            if (!isAllowed) {
              viewElement.remove();
              showNotProvisionedAlert(loanNumber);
            }
          }
        }
      } catch (error) {
        console.error("Error handling loan detail view:", error);
      }

      // Hide loader and show page after all processing is complete
      hideLoader(true);
      // Handle URL changes to filter content when navigating
      onValueChange(
        () => document.location.href,
        async (newVal, oldVal) => {
          if (newVal !== oldVal) {
            // Skip processing for hash changes only (except for specific cases)
            const oldUrl = new URL(oldVal, window.location.origin);
            const newUrl = new URL(newVal, window.location.origin);

            const isOnlyHashChange =
              oldUrl.pathname === newUrl.pathname &&
              oldUrl.search === newUrl.search &&
              oldUrl.hash !== newUrl.hash;

            // Skip processing for minor hash changes that don't affect content
            if (
              isOnlyHashChange &&
              !newUrl.hash.includes("#/bidApproveReject") &&
              !newUrl.hash.includes("#/loan/") &&
              !oldUrl.hash.includes("#/loan/")
            ) {
              return;
            }

            // Clear any existing messages when navigating
            removeNotProvisionedAlert();

            // Show loader while page is loading
            showLoader();

            // Give time for the page to load
            throttle.execute(
              "urlChange",
              async () => {
                try {
                  await processAllElements();
                  await handleSearchResults();
                } finally {
                  // Always hide loader when done
                  hideLoader(true);
                }
              },
              1000
            );
          }
        }
      );

      // Expose functions for other scripts to use
      window.showNotProvisionedAlert = showNotProvisionedAlert;
      window.removeNotProvisionedAlert = removeNotProvisionedAlert;
      window.checkNumbersBatch = checkNumbersBatch;
      window.extractLoanNumbers = extractLoanNumbers;

      console.log("Loan Filter Script ready");
    } catch (error) {
      DEBUG.error("Error initializing Loan Filter Script:", error);
      // Show the page in case of errors
      pageUtils.showPage(true);
      clearTimeout(safetyTimeout);
    }
  }

  /**
   * @function getLoanNumber
   * @description Extracts loan number from a view element by finding the specific cell.
   * @param {HTMLElement} viewElement - The DOM element containing loan information.
   * @returns {string|null} The loan number if found, null otherwise.
   */
  function getLoanNumber(viewElement) {
    // Find the cell containing the loan number
    const loanNumberCell = viewElement.querySelector(
      "table tr td a.bright-green.ng-binding"
    );
    // Return the trimmed text content if found, otherwise null
    return loanNumberCell && loanNumberCell.textContent.trim();
  }

  /**
   * @function waitForLoanNumber
   * @description Waits for a loan number to appear in the DOM using MutationObserver.
   * @returns {Promise<ViewElement>} A promise that resolves with the ViewElement when a loan number is found.
   */
  function waitForLoanNumber() {
    return new Promise((resolve) => {
      // Create a mutation observer to watch for DOM changes
      const observer = new MutationObserver((mutationsList, observer) => {
        // Create a view element to check for loan number
        const viewElement = new ViewElement();
        if (viewElement.element) {
          // Try to extract the loan number
          const loanNumber = getLoanNumber(viewElement.element);
          if (loanNumber) {
            // If found, disconnect the observer and resolve the promise
            observer.disconnect();
            resolve(viewElement);
          }
        }
      });

      // Start observing the document body for all changes
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }

  /**
   * @class ViewElement
   * @description Handles the loan detail view element, providing methods to show/hide content based on permissions.
   */
  class ViewElement {
    /**
     * @constructor
     * @description Creates a new ViewElement instance and initializes its properties.
     */
    constructor() {
      /**
       * @property {HTMLElement} element
       * @description The main content element containing loan details.
       */
      this.element = document.querySelector(".col-md-12 .body");

      /**
       * @property {HTMLElement} parent
       * @description The parent element of the main content element.
       */
      this.parent = this.element && this.element.parentElement;

      /**
       * @property {HTMLElement} unallowed
       * @description The element to display when a loan is not provisioned.
       */
      this.unallowed = createUnallowedElement();

      /**
       * @property {HTMLElement} unallowedParent
       * @description The parent element where the unallowed message will be appended.
       */
      this.unallowedParent = document.querySelector("nav");
    }

    /**
     * @method remove
     * @description Removes the loan detail element and shows the "not provisioned" message.
     */
    remove() {
      if (this.element) {
        this.element.remove();
        this.unallowedParent.appendChild(this.unallowed);
      }
    }

    /**
     * @method add
     * @description Adds the loan detail element back and removes the "not provisioned" message.
     */
    add() {
      if (this.parent) {
        this.unallowed.remove();
        this.parent.appendChild(this.element);
      }
    }
  }

  // Ensure page is visible if user navigates away
  window.addEventListener("beforeunload", () => {
    // Direct approach to ensure visibility
    document.body.style.opacity = 1;
  });

  // Start the script
  init();
})();
