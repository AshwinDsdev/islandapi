(function () {
  /**
   * @namespace pageUtils
   * @description Utility functions for page manipulation and element selection.
   * Originally imported from ui-hider-until-load.js
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
     * @example
     * // Example usage of the function
     * togglePageOpacity(0.5);
     */
    togglePageOpacity: function (val) {
      document.body.style.opacity = val;
    },

    /**
     * @function showPage
     * @description Shows or hides the page by setting opacity to 1 or 0.
     * @param {boolean} val - If true, shows the page; if false, hides it.
     * @example
     * // Example usage of the function
     * showPage(false);
     */
    showPage: function (val) {
      // Simplified approach - directly set opacity based on val
      document.body.style.opacity = val ? 1 : 0;
      this._isHidden = !val;

      // Log for debugging
      console.log(`Page visibility set to: ${val ? "visible" : "hidden"}`);
    },

    /**
     * @function togglePageDisplay
     * @description Sets the page display property. It can be used to show and hide the page content.
     * @param {string} val - The display value (e.g., 'block', 'none').
     * @example
     * // Example usage of the function
     * togglePageDisplay('none');
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
     * @example
     * // Example usage of the function
     * const element = getElementByXPath('//div[@class="example"]');
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

      // Log for debugging
      console.log(`Page visibility RESET to: ${show ? "visible" : "hidden"}`);
    },
  };

  // Reset page visibility state and hide the page immediately to prevent unauthorized loan numbers from being visible
  // This is the only place we should hide the page initially
  pageUtils.resetPageVisibility(false);

  // Add a safety timeout to ensure the page is shown after a maximum of 5 seconds
  setTimeout(() => {
    if (pageUtils._isHidden) {
      console.log("Safety timeout triggered - forcing page to be visible");
      pageUtils.resetPageVisibility(true);
    }
  }, 5000);

  /**
   * @constant {number} FILTER_INTERVAL_MS
   * @description The interval in milliseconds for filtering operations.
   */
  const FILTER_INTERVAL_MS = 2000;

  /**
   * @constant {string} EXTENSION_ID
   * @description The Chrome extension ID used for communication.
   */
  const EXTENSION_ID = "afkpnpkodeiolpnfnbdokgkclljpgmcm";

  /**
   * @constant {WeakSet} processedElements
   * @description Tracks DOM elements that have already been processed to avoid redundant operations.
   */
  const processedElements = new WeakSet();

  /**
   * @constant {WeakSet} processedBrands
   * @description Tracks brand elements that have already been processed.
   */
  const processedBrands = new WeakSet();

  /**
   * @constant {WeakSet} processedLoanDropdowns
   * @description Tracks loan dropdown elements that have already been processed.
   */
  const processedLoanDropdowns = new WeakSet();

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
      // No-op function to avoid console logs
    },

    /**
     * @function warn
     * @description Logs a warning message if debugging is enabled.
     * @param {string} message - The warning message.
     * @param {...any} args - Additional arguments to log.
     */
    warn: function (message, ...args) {
      // No-op function to avoid console logs
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
     * @example
     * // Example usage of the function
     * throttle.execute('updateUI', () => updateUserInterface(), 500);
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

      /**
       * @function sendPing
       * @description Sends a ping message to the extension and handles the response
       * @private
       */
      function sendPing() {
        if (attempts >= maxRetries) {
          console.warn("❌ No listener detected after maximum retries.");
          clearTimeout(timeoutId);
          reject(new Error("Listener not found"));
          return;
        }

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
                clearTimeout(timeoutId);
                resolve(true);
              } else {
                timeoutId = setTimeout(() => {
                  attempts++;
                  delay *= 2;
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

      sendPing();
    });
  }
  /**
   * @function checkNumbersBatch
   * @description Checks a batch of loan numbers against the extension to determine which ones are allowed.
   * @param {string[]} numbers - Array of loan numbers to check.
   * @returns {Promise<string[]>} A promise that resolves to an array of allowed loan numbers.
   * @throws {Error} If there's an error communicating with the extension.
   * */
  async function checkNumbersBatch(numbers) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        {
          type: "queryLoans",
          loanIds: numbers,
        },
        (response) => {
          // Handle Chrome runtime errors
          if (chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError.message);
          }
          // Handle application-level errors
          else if (response.error) {
            return reject(response.error);
          }

          // Filter out only the allowed loan numbers
          const available = Object.keys(response.result).filter(
            (key) => response.result[key]
          );
          resolve(available);
        }
      );
    });
  }
  
  /**
   * Extracts loan numbers from text content
   * @param {string} text - The text to extract loan numbers from
   * @returns {string[]} Array of extracted loan numbers
   */
  function extractLoanNumbers(text) {
    console.log("[DEBUG] extractLoanNumbers called with text:", text);
    
    if (!text) {
      console.log("[DEBUG] No text provided, returning empty array");
      return [];
    }
    
    // Try to find loan numbers in the format of 10 digits
    const loanNumberRegex = /\b\d{10}\b/g;
    const matches = text.match(loanNumberRegex) || [];
    
    console.log("[DEBUG] Extracted loan numbers:", matches);
    
    // If no matches found, try a more lenient approach
    if (matches.length === 0) {
      console.log("[DEBUG] No matches found with strict regex, trying more lenient approach");
      
      // Look for any sequence of 7-10 digits that might be a loan number
      const lenientRegex = /\b\d{7,10}\b/g;
      const lenientMatches = text.match(lenientRegex) || [];
      
      console.log("[DEBUG] Extracted loan numbers with lenient regex:", lenientMatches);
      return lenientMatches;
    }
    
    return matches;
  }
  /**
   * @function onValueChange
   * @description Utility function to watch for value changes and trigger a callback when changes occur.
   * @param {Function} evalFunction - Function that returns the value to monitor.
   * @param {Function} callback - Function to call when the value changes, receives (newValue, oldValue).
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.maxTime] - Maximum time in milliseconds to watch for changes.
   * @returns {number} The interval ID that can be used to clear the interval.
   */

  function onValueChange(evalFunction, callback, options = {}) {
    let lastValue = undefined;
    const startTime = Date.now();
    const endTime = options.maxTime ? startTime + options.maxTime : null;
    let pendingCheck = false;

    // Set up interval to check for value changes with reduced frequency
    const intervalId = setInterval(async () => {
      // Skip if there's already a check in progress
      if (pendingCheck) return;

      // Check if maximum time has elapsed
      const currentTime = Date.now();
      if (endTime && currentTime > endTime) {
        clearInterval(intervalId);
        return;
      }

      pendingCheck = true;
      try {
        // Get the current value
        let newValue = await evalFunction();
        if (newValue === "") newValue = null;

        // Only trigger callback if the value has changed
        if (lastValue !== newValue) {
          // Update the last value and call the callback
          const oldValue = lastValue;
          lastValue = newValue;
          await callback(newValue, oldValue);
        }
      } finally {
        pendingCheck = false;
      }
    }, 1000); // Reduced frequency - check every 1000ms instead of 500ms

    return intervalId;
  }

  /**
   * @namespace allowedLoansCache
   * @description Cache for allowed loans to improve performance and reduce API calls.
   */
  const allowedLoansCache = {
    /**
     * @property {Set} loans
     * @description Set containing all allowed loan numbers.
     */
    loans: new Set(),

    /**
     * @property {number} lastUpdated
     * @description Timestamp when the cache was last updated.
     */
    lastUpdated: 0,

    /**
     * @property {number} cacheTimeout
     * @description Time in milliseconds after which the cache is considered stale (5 minutes).
     */
    cacheTimeout: 5 * 60 * 1000, // 5 minutes

    /**
     * @function isAllowed
     * @description Checks if a loan number is in the allowed loans cache.
     * @param {string} loanNumber - The loan number to check.
     * @returns {boolean} True if the loan number is allowed, false otherwise.
     * @example
     * // Example usage of the function
     * if (allowedLoansCache.isAllowed('12345')) {
     *   // Loan is allowed
     * }
     */
    isAllowed(loanNumber) {
      return this.loans.has(loanNumber);
    },

    /**
     * @function addLoans
     * @description Adds loan numbers to the cache and updates the timestamp.
     * @param {string[]} loanNumbers - Array of loan numbers to add to the cache.
     * @example
     * // Example usage of the function
     * allowedLoansCache.addLoans(['12345', '67890']);
     */
    addLoans(loanNumbers) {
      loanNumbers.forEach((loan) => this.loans.add(loan));
      this.lastUpdated = Date.now();
    },

    /**
     * @function isCacheValid
     * @description Checks if the cache is still valid based on the timeout.
     * @returns {boolean} True if the cache is valid, false if it's stale or empty.
     */
    isCacheValid() {
      return (
        this.lastUpdated > 0 &&
        Date.now() - this.lastUpdated < this.cacheTimeout
      );
    },

    /**
     * @function clear
     * @description Clears the cache and resets the timestamp.
     * @example
     * // Example usage of the function
     * allowedLoansCache.clear();
     */
    clear() {
      this.loans.clear();
      this.lastUpdated = 0;
    },
  };

  /**
   * @function isLoanNumberAllowed
   * @description Checks if a loan number is allowed for the current user.
   * @param {string|number} loanNumber - The loan number to check.
   * @returns {Promise<boolean>} A promise that resolves to true if the loan is allowed, false otherwise.
   * @example
   * // Example usage of the function
   * const isAllowed = await isLoanNumberAllowed('12345');
   * if (isAllowed) {
   *   // Show loan details
   * } else {
   *   // Show access denied message
   * }
   */
  async function isLoanNumberAllowed(loanNumber) {
    console.log("[DEBUG] isLoanNumberAllowed called with:", loanNumber);
    
    try {
      // Handle empty or undefined loan numbers
      if (!loanNumber) {
        console.log("[DEBUG] Empty loan number, returning false");
        return false;
      }

      // Normalize the loan number to a string and trim whitespace
      loanNumber = String(loanNumber).trim();
      console.log("[DEBUG] Normalized loan number:", loanNumber);

      // Check cache first for performance optimization
      if (
        allowedLoansCache.isCacheValid() &&
        allowedLoansCache.isAllowed(loanNumber)
      ) {
        console.log("[DEBUG] Loan found in cache, returning true");
        return true;
      }

      // If not in cache or cache is invalid, query the extension
      console.log("[DEBUG] Checking loan number against allowed list");
      const allowedNumbers = await checkNumbersBatch([loanNumber]);
      console.log("[DEBUG] Allowed numbers returned:", allowedNumbers);

      // Update cache with results for future queries
      if (allowedNumbers && allowedNumbers.length > 0) {
        console.log("[DEBUG] Adding allowed numbers to cache");
        allowedLoansCache.addLoans(allowedNumbers);
      }

      // Return true if the loan number is in the allowed list
      const isAllowed = allowedNumbers.includes(loanNumber);
      console.log("[DEBUG] Loan number allowed:", isAllowed);
      return isAllowed;
    } catch (error) {
      // Log the error and default to not allowed for security
      console.warn("[DEBUG] Failed to check loan access, assuming not allowed:", error);
      return false;
    }
  }

  /**
   * @function createNotProvisionedElement
   * @description Creates a DOM element displaying "Loan is not provisioned to the user" message.
   * @returns {HTMLElement} A styled span element with the not provisioned message.
   * @example
   * // Example usage of the function
   * const messageElement = createNotProvisionedElement();
   * document.body.appendChild(messageElement);
   */
  function createNotProvisionedElement() {
    // Create the base span element
    const element = document.createElement("span");

    // Add the message text
    element.appendChild(
      document.createTextNode("Loan is not provisioned to the user")
    );

    // Set the class name
    element.className = "body";

    // Apply styling to the element
    element.style.display = "flex";
    element.style.justifyContent = "center";
    element.style.alignItems = "center";
    element.style.height = "100px";
    element.style.fontSize = "20px";
    element.style.fontWeight = "bold";
    element.style.color = "black";
    element.style.position = "relative";
    element.style.zIndex = "-1";

    return element;
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
      this.unallowed = createNotProvisionedElement();

      /**
       * @property {HTMLElement} unallowedParent
       * @description The parent element where the unallowed message will be appended.
       */
      this.unallowedParent = document.querySelector("nav");
    }

    /**
     * @method remove
     * @description Removes the loan detail element and shows the "not provisioned" message.
     * @example
     * // Example usage of the method
     * const view = new ViewElement();
     * view.remove();
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
     * @example
     * // Example usage of the method
     * const view = new ViewElement();
     * view.add();
     */
    add() {
      if (this.parent) {
        this.unallowed.remove();
        this.parent.appendChild(this.element);
      }
    }
  }

  /**
   * @function getLoanNumber
   * @description Extracts loan number from a view element by finding the specific cell.
   * @param {HTMLElement} viewElement - The DOM element containing loan information.
   * @returns {string|null} The loan number if found, null otherwise.
   * @example
   * // Example usage of the function
   * const loanElement = document.querySelector('.loan-details');
   * const loanNumber = getLoanNumber(loanElement);
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
   * @example
   * // Example usage of the function
   * waitForLoanNumber().then(viewElement => {
   *   console.log('Loan number found in:', viewElement);
   * });
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
        childList: true, // Watch for changes to the direct children
        subtree: true, // Watch for changes to the entire subtree
      });
    });
  }

  /**
   * @function extractLoanNumbers
   * @description Extracts potential loan numbers from text content using regex patterns.
   * @param {string} text - The text to extract loan numbers from.
   * @returns {string[]} Array of unique potential loan numbers found in the text.
   * @example
   * // Example usage of the function
   * const text = "Customer has loans: 12345 and ABC123";
   * const loanNumbers = extractLoanNumbers(text);
   * // Returns: ['12345', 'ABC123']
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
   * @example
   * // Example usage of the function
   * if (containsLoanNumber("Customer ID: 12345")) {
   *   // Text contains a potential loan number
   * }
   */
  function containsLoanNumber(text) {
    // Check for numeric loan numbers (5 or more digits)
    // or alphanumeric loan numbers (5 or more characters, uppercase)
    return /\b\d{5,}\b/.test(text) || /\b[A-Z0-9]{5,}\b/.test(text);
  }

  /**
   * @function shouldHideElement
   * @description Determines if an element should be hidden based on loan numbers it contains.
   * @param {HTMLElement} element - The DOM element to check.
   * @returns {Promise<boolean>} A promise that resolves to true if the element should be hidden, false otherwise.
   * @example
   * // Example usage of the function
   * const element = document.querySelector('.loan-row');
   * const shouldHide = await shouldHideElement(element);
   * if (shouldHide) {
   *   element.style.display = 'none';
   * }
   */
  async function shouldHideElement(element) {
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
      if (await isLoanNumberAllowed(loanNumber)) {
        return false;
      }
    }

    // If no loan numbers are allowed, hide the element
    return true;
  }

  /**
   * @function processTableRows
   * @description Processes all table rows in the document to hide those with restricted loan numbers.
   * @returns {Promise<void>} A promise that resolves when processing is complete.
   * @example
   * // Example usage of the function
   * await processTableRows();
   */
  async function processTableRows() {
    // Select all table rows in the document
    const rows = document.querySelectorAll("tr");

    // Process each row
    for (const row of rows) {
      // Skip already processed rows to avoid redundant work
      if (processedElements.has(row)) continue;

      // Mark this row as processed
      processedElements.add(row);

      // Check if the row should be hidden
      if (await shouldHideElement(row)) {
        row.style.display = "none";
      }
    }
  }

  /**
   * @function processGenericElements
   * @description Processes generic elements that might contain loan numbers to hide restricted content.
   * @returns {Promise<void>} A promise that resolves when processing is complete.
   * @example
   * // Example usage of the function
   * await processGenericElements();
   */
  async function processGenericElements() {
    // Select elements that are likely to contain loan information
    const potentialContainers = document.querySelectorAll(
      '.borrower-row, .loan-item, .card, .list-item, div[class*="loan"], div[class*="borrower"]'
    );

    // Process each container
    for (const container of potentialContainers) {
      // Skip already processed containers
      if (processedElements.has(container)) continue;

      // Mark this container as processed
      processedElements.add(container);

      // Check if the container should be hidden
      if (await shouldHideElement(container)) {
        container.style.display = "none";
      }
    }
  }

  /**
   * @function extractBrandCode
   * @description Extracts brand code from text content using regex patterns.
   * @param {string} text - The text to extract brand code from.
   * @returns {string|null} The extracted brand code or null if not found.
   * @example
   * // Example usage of the function
   * const brandName = "Acme Financial (ACME)";
   * const brandCode = extractBrandCode(brandName);
   * // Returns: 'ACME'
   */
  function extractBrandCode(text) {
    // Handle empty or null text
    if (!text) return null;

    // Convert to string and trim whitespace
    text = String(text).trim();

    // First try to match brand code in parentheses at the end of text
    // Example: "Acme Financial (ACME)" -> "ACME"
    const parenthesesMatch = text.match(/\(([A-Z0-9]{2,4})\)$/);
    if (parenthesesMatch) {
      return parenthesesMatch[1];
    }

    // If not found in parentheses, try to match standalone brand code
    // Example: "ACME Financial" -> "ACME"
    const standaloneMatch = text.match(/\b([A-Z0-9]{2,4})\b/);
    if (standaloneMatch) {
      return standaloneMatch[1];
    }

    // No brand code found
    return null;
  }

  /**
   * Extracts brands data from the page
   */
  function extractBrandsData() {
    // Use cached data if available
    if (window.brandsData && Array.isArray(window.brandsData)) {
      return window.brandsData;
    }

    const brandsData = [];
    const brandMap = new Map();

    const brandSelects = document.querySelectorAll(
      "select#brandSelect, select#searchBrand"
    );
    brandSelects.forEach((select) => {
      Array.from(select.options).forEach((option) => {
        if (
          !option.value ||
          option.value === "" ||
          isNaN(parseInt(option.value))
        )
          return;

        const brandId = parseInt(option.value);
        if (brandMap.has(brandId)) return;

        const text = option.textContent.trim();
        const codeMatch = text.match(/\(([A-Z0-9]+)\)$/);
        const code = codeMatch ? codeMatch[1] : `BRAND${brandId}`;
        const name = codeMatch ? text.replace(/\s*\([A-Z0-9]+\)$/, "") : text;

        brandMap.set(brandId, {
          id: brandId,
          name: name.trim(),
          code: code,
          loanNumbers: [],
        });
      });
    });

    // Process table rows to extract brand-loan relationships
    const rows = document.querySelectorAll("table#borrowersTable tbody tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 5) return;

      const loanNumberCell = cells[3];
      const brandCell = cells[4];

      if (!loanNumberCell || !brandCell) return;

      const loanNumber = loanNumberCell.textContent.trim();
      const brandCodeMatch = brandCell.textContent.match(/\b([A-Z0-9]{2,})\b/);

      if (!loanNumber || !brandCodeMatch) return;

      const brandCode = brandCodeMatch[1];

      for (const [id, brand] of brandMap.entries()) {
        if (
          brand.code === brandCode &&
          !brand.loanNumbers.includes(loanNumber)
        ) {
          brand.loanNumbers.push(loanNumber);
          break;
        }
      }
    });

    for (const brand of brandMap.values()) {
      brandsData.push(brand);
    }

    window.brandsData = brandsData;
    return brandsData;
  }

  /**
   * Determines if a brand has at least one allowed loan number
   */
  async function brandHasAllowedLoans(brandLoanNumbers) {
    if (!brandLoanNumbers || !Array.isArray(brandLoanNumbers)) {
      return true;
    }

    for (const loanNumber of brandLoanNumbers) {
      if (await isLoanNumberAllowed(loanNumber)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Process brand-related elements to hide those with no allowed loans
   */
  async function processBrandElements() {
    const brandsData = extractBrandsData();
    if (!brandsData || !Array.isArray(brandsData) || brandsData.length === 0) {
      return;
    }

    // Filter brand dropdowns
    const brandDropdowns = document.querySelectorAll(
      "select#brandSelect, select#searchBrand"
    );
    for (const dropdown of brandDropdowns) {
      if (processedBrands.has(dropdown)) continue;
      processedBrands.add(dropdown);

      for (const option of Array.from(dropdown.options)) {
        if (
          !option.value ||
          option.value === "" ||
          isNaN(parseInt(option.value))
        )
          continue;

        const brandId = parseInt(option.value);
        const brand = brandsData.find((b) => b.id === brandId);

        if (brand && !(await brandHasAllowedLoans(brand.loanNumbers))) {
          option.style.display = "none";
        }
      }
    }

    // Filter brand elements in the table
    const brandCells = document.querySelectorAll("td:nth-child(5)");
    for (const cell of brandCells) {
      if (processedBrands.has(cell)) continue;
      processedBrands.add(cell);

      const brandCodeMatch = cell.textContent.match(/\b([A-Z0-9]{2,})\b/);
      if (!brandCodeMatch) continue;

      const brandCode = brandCodeMatch[1];
      const brand = brandsData.find((b) => b.code === brandCode);

      if (brand && !(await brandHasAllowedLoans(brand.loanNumbers))) {
        const row = cell.closest("tr");
        if (row) {
          row.style.display = "none";
        }
      }
    }
  }

  /**
   * Processes secure message dropdown to filter out restricted loans
   */
  async function processSecureMessageDropdown() {
    const loanDropdown = document.getElementById("loanPropertySelect");
    if (!loanDropdown || processedLoanDropdowns.has(loanDropdown)) return;

    const newDropdown = document.createElement("select");
    newDropdown.id = loanDropdown.id;
    newDropdown.className = loanDropdown.className;
    newDropdown.required = loanDropdown.required;

    if (loanDropdown.options.length > 0) {
      const placeholderOption = document.createElement("option");
      placeholderOption.value = loanDropdown.options[0].value;
      placeholderOption.text = loanDropdown.options[0].text;
      placeholderOption.disabled = loanDropdown.options[0].disabled;
      placeholderOption.selected = true;
      newDropdown.appendChild(placeholderOption);
    }

    let hasAllowedLoans = false;

    for (let i = 0; i < loanDropdown.options.length; i++) {
      const option = loanDropdown.options[i];

      if (i === 0 || !option.value || option.disabled) continue;

      const loanNumber = option.value;
      const isAllowed = await isLoanNumberAllowed(loanNumber);

      if (isAllowed) {
        const newOption = document.createElement("option");
        newOption.value = option.value;
        newOption.text = option.text;

        if (option.dataset) {
          for (const key in option.dataset) {
            newOption.dataset[key] = option.dataset[key];
          }
        }

        newDropdown.appendChild(newOption);
        hasAllowedLoans = true;
      }
    }

    // If no loans were allowed, add a message option
    if (!hasAllowedLoans) {
      const noAccessOption = document.createElement("option");
      noAccessOption.text = "No loans available - Access restricted";
      noAccessOption.disabled = true;
      newDropdown.appendChild(noAccessOption);
    }

    // Replace the old dropdown with the new one
    try {
      if (loanDropdown.parentNode) {
        const oldListeners = loanDropdown._eventListeners || {};
        for (const eventType in oldListeners) {
          oldListeners[eventType].forEach((listener) => {
            newDropdown.addEventListener(eventType, listener);
          });
        }

        loanDropdown.parentNode.replaceChild(newDropdown, loanDropdown);

        // Dispatch a change event to update any dependent UI
        const event = new Event("change", { bubbles: true });
        newDropdown.dispatchEvent(event);
      }
    } catch (e) {
      console.error("Error replacing dropdown:", e);
    }

    processedLoanDropdowns.add(newDropdown);
  }

  /**
   * Handles search results to show "not provisioned" message
   * Specifically handles the case when search returns exactly one restricted loan
   */
  async function handleSearchResults() {
    console.log("[DEBUG] handleSearchResults called");
    
    if (window._processingSearchResults) {
      console.log("[DEBUG] Already processing search results, skipping");
      return;
    }

    window._processingSearchResults = true;
    console.log("[DEBUG] Set _processingSearchResults flag to true");

    // Only hide the page if a filter was just applied
    // This ensures unauthorized loan numbers are not visible during filtering
    if (window._filterJustApplied) {
      console.log("[DEBUG] Filter just applied, hiding page");
      pageUtils.showPage(false);
    }

    let resultRows = [];
    let filterJustApplied = window._filterJustApplied || false;
    console.log("[DEBUG] filterJustApplied:", filterJustApplied);

    try {
      console.log("[DEBUG] Handling search results");

      window._filterJustApplied = false;
      console.log("[DEBUG] Reset _filterJustApplied flag to false");

      // Check for Loansphere_Messages.html specific elements first
      const messagesTable = document.querySelector(".messages-table");
      console.log("[DEBUG] messagesTable found:", !!messagesTable);
      
      const messagesTableBody = document.getElementById("messagesTableBody");
      console.log("[DEBUG] messagesTableBody found:", !!messagesTableBody);
      
      // Try to find the results container
      const resultsContainer = document.querySelector(
        ".table-responsive, .results-container, .message-list, table, .messages-table"
      );
      console.log("[DEBUG] resultsContainer found:", !!resultsContainer);

      if (!resultsContainer) {
        console.log("[DEBUG] No results container found");
        // Just make sure the page is visible
        pageUtils.showPage(true);
        return;
      }

      // Try to get rows from messagesTableBody first, then fall back to resultsContainer
      if (messagesTableBody) {
        resultRows = messagesTableBody.querySelectorAll("tr");
      } else {
        resultRows = resultsContainer.querySelectorAll(
          "tbody tr:not(.header-row):not(.mat-header-row)"
        );
      }

      console.log("[DEBUG] Found", resultRows.length, "result rows");

      // First, remove any existing "not provisioned" message
      removeNotProvisionedAlert();
      console.log("[DEBUG] Removed any existing not provisioned alert");

      // Try to find the search form
      const searchForm = document.querySelector(
        "form.search-form, .filter-form, .search-container, .messages-filters"
      );
      console.log("[DEBUG] searchForm found:", !!searchForm);

      if (searchForm) {
        console.log("[DEBUG] Found search/filter form");

        // Get the loan number input directly
        const loanNumberInput = document.getElementById("loanNumberFilter");
        console.log("[DEBUG] loanNumberInput found:", !!loanNumberInput);
        
        const loanNumber = loanNumberInput ? loanNumberInput.value.trim() : "";
        console.log("[DEBUG] Loan number from input:", loanNumber);

        const inputs = searchForm.querySelectorAll("input, select");
        let hasSearchCriteria = false;
        let searchFields = [];

        for (const input of inputs) {
          if (input.value && input.value.trim() !== "") {
            hasSearchCriteria = true;
            searchFields.push(input.name || input.id);
            console.log(
              `[DEBUG] Found search criteria in input: ${input.name || input.id} = ${input.value}`
            );
          }
        }

        console.log("[DEBUG] hasSearchCriteria:", hasSearchCriteria);
        console.log("[DEBUG] resultRows.length:", resultRows.length);

        // If we have search criteria and exactly one result, check if it's allowed
        if (hasSearchCriteria && resultRows.length === 1) {
          console.log("[DEBUG] Found exactly one row with search criteria");
          
          const resultRow = resultRows[0];
          const rowText = resultRow.textContent || "";
          console.log("[DEBUG] Row text:", rowText);
          
          // Try to extract loan numbers from the row text
          const loanNumbers = extractLoanNumbers(rowText);
          console.log("[DEBUG] Extracted loan numbers:", loanNumbers);
          
          // If we couldn't extract loan numbers but have a loan number from input, use that
          const numbersToCheck = loanNumbers.length > 0 ? loanNumbers : (loanNumber ? [loanNumber] : []);
          console.log("[DEBUG] Numbers to check:", numbersToCheck);

          if (numbersToCheck.length > 0) {
            console.log(`[DEBUG] Found loan numbers to check: ${numbersToCheck.join(", ")}`);

            // Check if any of these loan numbers are allowed
            let anyAllowed = false;

            for (const num of numbersToCheck) {
              console.log("[DEBUG] Checking if loan number is allowed:", num);
              const isAllowed = await isLoanNumberAllowed(num);
              console.log("[DEBUG] Loan number allowed:", isAllowed);

              if (isAllowed) {
                anyAllowed = true;
                break;
              }
            }

            // If none are allowed, hide the table and show the message
            if (!anyAllowed) {
              console.log("[DEBUG] No allowed loan numbers found, hiding table");
              
              // Try multiple approaches to hide the table
              const elementsToHide = [
                messagesTable,
                document.querySelector(".messages-list"),
                resultsContainer,
                resultRow.closest("table")
              ];
              
              console.log("[DEBUG] Elements to hide found:", elementsToHide.filter(el => el).length);
              
              // Hide all found elements
              elementsToHide.forEach(element => {
                if (element) {
                  console.log("[DEBUG] Hiding element:", element.tagName, element.className);
                  element.style.display = "none";
                }
              });

              // Show the not provisioned message - only if not already showing
              if (!window._showingNotProvisionedMessage) {
                console.log("[DEBUG] Showing not provisioned alert");
                showNotProvisionedAlert("Loan is not provisioned to the user");
              } else {
                console.log("[DEBUG] Not provisioned message already showing, skipping");
              }

              console.log(
                `[DEBUG] Search returned exactly one restricted loan. Hiding table and showing not provisioned message.`
              );
            } else {
              // Make sure the row is visible if it contains an allowed loan
              console.log("[DEBUG] At least one loan number is allowed, ensuring visibility");
              resultRow.style.display = "";
              // Make sure the table is visible
              if (resultsContainer) {
                resultsContainer.style.display = "";
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("[DEBUG] Error in handleSearchResults:", error);
    } finally {
      window._processingSearchResults = false;
      console.log("[DEBUG] Reset _processingSearchResults flag to false");

      // Show the page after processing is complete - use direct approach
      document.body.style.opacity = 1;
      pageUtils._isHidden = false;
      console.log("[DEBUG] Search results processing complete - page shown");
    }

    // Check if there are no visible rows after filtering
    // This handles the case when all rows are filtered out
    const visibleRows = Array.from(resultRows).filter(
      (row) =>
        row.style.display !== "none" && getComputedStyle(row).display !== "none"
    );

    console.log(
      `[DEBUG] ${visibleRows.length} visible rows out of ${resultRows.length} total rows`
    );
  }

  /**
   * Process all elements that need filtering
   */
  async function processAllElements() {
    if (window._processingAllElements) {
      console.log("Already processing all elements, skipping");
      return;
    }

    window._processingAllElements = true;

    // Only hide the page during initial load or when a filter was just applied
    // This ensures unauthorized loan numbers are not visible during filtering
    const isInitialLoad = !window._initialLoadComplete;
    if (isInitialLoad || window._filterJustApplied) {
      pageUtils.showPage(false);
    }

    try {
      await processTableRows();
      await processGenericElements();
      await processBrandElements();
      await processSecureMessageDropdown();

      // Only call handleSearchResults if we're not already processing search results
      if (!window._processingSearchResults) {
        await handleSearchResults();
      }

      // Mark initial load as complete
      window._initialLoadComplete = true;
    } catch (error) {
      console.error("Error in processAllElements:", error);
    } finally {
      // Clear processing flag when done
      window._processingAllElements = false;

      // Show the page after processing is complete - use direct approach
      document.body.style.opacity = 1;
      pageUtils._isHidden = false;
      console.log("All elements processing complete - page shown");
    }
  }

  /**
   * Injects CSS styles for filtering and alerts
   */
  async function injectFilterStyles() {
    let styleEl = document.getElementById("loan-filter-styles");

    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "loan-filter-styles";
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      .loan-filtered {
        display: none !important;
      }
      
      .not-provisioned-alert {
        background-color: #f8d7da;
        color: #721c24;
        padding: 15px;
        margin: 15px 0;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
        text-align: center;
        font-size: 16px;
      }
    `;
  }

  /**
   * Shows "Loan is not provisioned" alert for restricted loans
   * @param {string} loanNumber - The loan number or a direct message to display
   */
  function showNotProvisionedAlert(loanNumber) {
    console.log("[DEBUG] showNotProvisionedAlert called with:", loanNumber);
    
    // Remove any existing alerts first
    removeNotProvisionedAlert();
    console.log("[DEBUG] Removed any existing alerts");

    const alertDiv = document.createElement("div");
    alertDiv.className = "not-provisioned-alert";
    alertDiv.id = "not-provisioned-alert";
    
    // Make the alert more visible with inline styles
    alertDiv.style.backgroundColor = "#f8d7da";
    alertDiv.style.color = "#721c24";
    alertDiv.style.padding = "15px";
    alertDiv.style.margin = "15px 0";
    alertDiv.style.border = "1px solid #f5c6cb";
    alertDiv.style.borderRadius = "4px";
    alertDiv.style.textAlign = "center";
    alertDiv.style.fontSize = "16px";
    alertDiv.style.fontWeight = "bold";
    alertDiv.style.zIndex = "9999"; // Ensure it's on top

    // If loanNumber is "filtered", it means we're showing a generic message
    // for search results where all loans were filtered out
    if (loanNumber === "filtered") {
      alertDiv.textContent = "Loan is not provisioned to the user";
      console.log("[DEBUG] Using 'filtered' message");
    } else if (loanNumber === "Loan is not provisioned to the user") {
      // If the parameter is already the exact message we want, use it directly
      alertDiv.textContent = loanNumber;
      console.log("[DEBUG] Using exact message");
    } else if (loanNumber.startsWith && loanNumber.startsWith("Loan is not")) {
      // If the parameter is already a complete message, use it directly
      alertDiv.textContent = loanNumber;
      console.log("[DEBUG] Using message that starts with 'Loan is not'");
    } else {
      alertDiv.textContent = `Loan ${loanNumber} is not provisioned to the user`;
      console.log("[DEBUG] Using loan number specific message");
    }

    console.log("[DEBUG] Alert message set to:", alertDiv.textContent);

    // Try multiple insertion points to ensure the alert is visible
    let inserted = false;
    
    // First try: message-threads-container (specific to Loansphere_Messages.html)
    const messagesContainer = document.querySelector(".message-threads-container");
    if (messagesContainer) {
      console.log("[DEBUG] Found message-threads-container, inserting at top");
      messagesContainer.insertBefore(alertDiv, messagesContainer.firstChild);
      inserted = true;
    }
    
    // Second try: messages-list container
    if (!inserted) {
      const messagesList = document.querySelector(".messages-list");
      if (messagesList) {
        console.log("[DEBUG] Found messages-list, inserting at top");
        messagesList.insertBefore(alertDiv, messagesList.firstChild);
        inserted = true;
      }
    }
    
    // Third try: results container
    if (!inserted) {
      const resultsContainer = document.querySelector(
        ".table-responsive, .results-container, .message-list, table"
      );

      if (resultsContainer && resultsContainer.parentNode) {
        console.log("[DEBUG] Found results container, inserting before it");
        resultsContainer.parentNode.insertBefore(alertDiv, resultsContainer);
        inserted = true;
      }
    }
    
    // Fourth try: general container
    if (!inserted) {
      console.log("[DEBUG] Trying general container insertion");
      const container = document.querySelector(
        ".container, .container-fluid, main, .wrapper, body"
      );
      if (container) {
        if (container.firstChild) {
          console.log("[DEBUG] Inserting before first child of container");
          container.insertBefore(alertDiv, container.firstChild);
        } else {
          console.log("[DEBUG] Appending to container");
          container.appendChild(alertDiv);
        }
        inserted = true;
      }
    }
    
    // Last resort: body
    if (!inserted) {
      console.log("[DEBUG] Last resort: inserting at top of body");
      document.body.insertBefore(alertDiv, document.body.firstChild);
      inserted = true;
    }

    window._showingNotProvisionedMessage = true;
    window._restrictedLoanNumber = loanNumber;
    console.log("[DEBUG] Alert added to DOM, flags set");
    
    // Only add a fallback message if the primary alert wasn't inserted successfully
    if (!inserted) {
      console.log("[DEBUG] Primary alert insertion failed, adding fallback message");
      const fallbackMessage = document.createElement("div");
      fallbackMessage.className = "not-provisioned-alert-fallback";
      fallbackMessage.style.backgroundColor = "#f8d7da";
      fallbackMessage.style.color = "#721c24";
      fallbackMessage.style.padding = "15px";
      fallbackMessage.style.margin = "15px 0";
      fallbackMessage.style.border = "1px solid #f5c6cb";
      fallbackMessage.style.borderRadius = "4px";
      fallbackMessage.style.textAlign = "center";
      fallbackMessage.style.fontSize = "16px";
      fallbackMessage.style.fontWeight = "bold";
      fallbackMessage.style.zIndex = "9999";
      fallbackMessage.textContent = "Loan is not provisioned to the user";
      
      // Try to insert at multiple locations
      const insertPoints = [
        document.querySelector(".message-threads-container"),
        document.querySelector(".messages-header"),
        document.querySelector(".messages-filters"),
        document.querySelector("main"),
        document.querySelector(".wrapper"),
        document.body
      ];
      
      for (const point of insertPoints) {
        if (point) {
          console.log("[DEBUG] Inserting fallback message at:", point.tagName, point.className);
          point.insertBefore(fallbackMessage, point.firstChild);
          break;
        }
      }
    }
  }

  /**
   * Removes the "Loan is not provisioned" alert
   */
  function removeNotProvisionedAlert() {
    console.log("[DEBUG] removeNotProvisionedAlert called");
    
    const alert = document.getElementById("not-provisioned-alert");
    console.log("[DEBUG] Alert element found by ID:", !!alert);
    
    if (alert) {
      console.log("[DEBUG] Removing alert from DOM");
      alert.remove();
    }

    // Also check for any elements with the not-provisioned-alert class
    const alertsByClass = document.querySelectorAll(".not-provisioned-alert");
    console.log("[DEBUG] Found", alertsByClass.length, "alerts by class");
    
    alertsByClass.forEach(element => {
      console.log("[DEBUG] Removing additional alert by class");
      element.remove();
    });
    
    // Also remove any fallback alerts
    const fallbackAlerts = document.querySelectorAll(".not-provisioned-alert-fallback");
    console.log("[DEBUG] Found", fallbackAlerts.length, "fallback alerts");
    
    fallbackAlerts.forEach(element => {
      console.log("[DEBUG] Removing fallback alert");
      element.remove();
    });

    window._showingNotProvisionedMessage = false;
    window._restrictedLoanNumber = null;
    console.log("[DEBUG] Reset alert flags");
  }

  /**
   * Monitors search and filter form submissions
   * This ensures we catch when users apply filters or search
   */
  function monitorSearchAndFilterForms() {
    console.log("[DEBUG] monitorSearchAndFilterForms called");
    
    // Check if we're on the Loansphere_Messages.html page
    const isLoansphereMessagesPage = window.location.href.includes("Loansphere_Messages.html");
    console.log("[DEBUG] Is Loansphere_Messages page:", isLoansphereMessagesPage);
    
    // Log all important elements on the page for debugging
    console.log("[DEBUG] messagesTableBody exists:", !!document.getElementById("messagesTableBody"));
    console.log("[DEBUG] messages-table exists:", !!document.querySelector(".messages-table"));
    console.log("[DEBUG] loanNumberFilter exists:", !!document.getElementById("loanNumberFilter"));
    console.log("[DEBUG] applyFilters button exists:", !!document.getElementById("applyFilters"));
    
    // Specifically target the Apply Filters button
    const applyFiltersButton = document.getElementById("applyFilters");
    if (applyFiltersButton && !applyFiltersButton._filterMonitorAttached) {
      console.log("[DEBUG] Attaching event listener to Apply Filters button");
      applyFiltersButton._filterMonitorAttached = true;

      applyFiltersButton.addEventListener("click", () => {
        console.log("[DEBUG] Apply Filters button clicked");

        // Set flag that filter was just applied
        window._filterJustApplied = true;
        console.log("[DEBUG] Set _filterJustApplied flag to true");

        // Remove any existing "not provisioned" message
        removeNotProvisionedAlert();
        console.log("[DEBUG] Removed any existing not provisioned alert");

        // Give time for the results to load - use a longer timeout to ensure DOM is updated
        console.log("[DEBUG] Setting timeout to process filter results");
        setTimeout(async () => {
          console.log("[DEBUG] Timeout callback executing");
          
          // Get the loan number from the input field
          const loanNumberInput = document.getElementById("loanNumberFilter");
          console.log("[DEBUG] loanNumberInput found:", !!loanNumberInput);
          
          const loanNumber = loanNumberInput ? loanNumberInput.value.trim() : "";
          console.log("[DEBUG] Loan number from input:", loanNumber);

          // Get the table body and check if there's only one row
          const tableBody = document.getElementById("messagesTableBody");
          console.log("[DEBUG] tableBody found:", !!tableBody);
          
          if (tableBody) {
            const rows = tableBody.querySelectorAll("tr");
            console.log("[DEBUG] Number of rows found:", rows.length);

            // If there's exactly one row and a loan number was entered
            if (rows.length === 1 && loanNumber) {
              console.log("[DEBUG] Found exactly one row with loan number:", loanNumber);
              
              // Check if the loan number is allowed
              console.log("[DEBUG] Checking if loan number is allowed");
              const isAllowed = await isLoanNumberAllowed(loanNumber);
              console.log("[DEBUG] Loan number allowed:", isAllowed);

              if (!isAllowed) {
                console.log("[DEBUG] Loan number is not allowed, hiding table");
                
                // Try multiple approaches to hide the table
                const elementsToHide = [
                  document.querySelector(".messages-table"),
                  document.querySelector(".messages-list"),
                  document.querySelector("table"),
                  tableBody.closest("table")
                ];
                
                console.log("[DEBUG] Elements to hide found:", elementsToHide.filter(el => el).length);
                
                // Hide all found elements
                elementsToHide.forEach(element => {
                  if (element) {
                    console.log("[DEBUG] Hiding element:", element.tagName, element.className);
                    element.style.display = "none";
                  }
                });

                // Show the not provisioned message - only if not already showing
                if (!window._showingNotProvisionedMessage) {
                  console.log("[DEBUG] Showing not provisioned alert");
                  showNotProvisionedAlert("Loan is not provisioned to the user");
                } else {
                  console.log("[DEBUG] Not provisioned message already showing, skipping");
                }

                console.log(
                  `[DEBUG] Filter returned exactly one restricted loan: ${loanNumber}. Hiding table and showing not provisioned message.`
                );
                return;
              }
            }
          }

          console.log("[DEBUG] Calling handleSearchResults");
          await handleSearchResults();
        }, 1500); // Increased timeout to 1.5 seconds
      });
    } else {
      console.log("[DEBUG] Apply Filters button already has event listener or not found:", 
                 applyFiltersButton ? "has listener" : "not found");
    }

    // Look for the messages-filters container
    const messagesFilters = document.querySelector(".messages-filters");
    if (messagesFilters) {
      // Find all buttons within the messages-filters container
      const filterButtons =
        messagesFilters.querySelectorAll("button.btn-primary");

      filterButtons.forEach((button) => {
        if (button._filterMonitorAttached) return;
        button._filterMonitorAttached = true;

        button.addEventListener("click", () => {
          console.log("Filter button clicked in messages-filters");

          // Set flag that filter was just applied
          window._filterJustApplied = true;

          // Remove any existing "not provisioned" message
          removeNotProvisionedAlert();

          // Give time for the results to load
          setTimeout(async () => {
            await handleSearchResults();
          }, 1000);
        });
      });
    }

    // Also look for any search forms
    const searchForms = document.querySelectorAll(
      "form.search-form, form.filter-form"
    );
    searchForms.forEach((form) => {
      if (form._filterMonitorAttached) return;
      form._filterMonitorAttached = true;

      form.addEventListener("submit", () => {
        console.log("Search form submitted");

        // Hide the page immediately to prevent unauthorized loan numbers from being visible
        pageUtils.showPage(false);

        // Set flag that filter was just applied
        window._filterJustApplied = true;

        // Remove any existing "not provisioned" message
        removeNotProvisionedAlert();

        setTimeout(async () => {
          await handleSearchResults();
        }, 1000);
      });
    });

    // Look for any buttons with search or filter in their class or ID
    const searchButtons = document.querySelectorAll(
      "button.search, button.filter, button.search-button, button.filter-button, " +
        "button[id*='search'], button[id*='filter'], " +
        "button.btn-primary[type='submit']"
    );

    searchButtons.forEach((button) => {
      if (button._filterMonitorAttached) return;
      button._filterMonitorAttached = true;

      button._filterMonitorAttached = true;

      button.addEventListener("click", () => {
        console.log("Search/filter button clicked");

        // Hide the page immediately to prevent unauthorized loan numbers from being visible
        pageUtils.showPage(false);

        window._filterJustApplied = true;

        // Remove any existing "not provisioned" message
        removeNotProvisionedAlert();

        setTimeout(async () => {
          await handleSearchResults();
        }, 1000);
      });
    });

    // Add a global click handler for buttons that might be added dynamically
    if (!document.body._globalFilterClickHandler) {
      document.body._globalFilterClickHandler = true;

      document.body.addEventListener("click", (event) => {
        const target = event.target;

        // Check if the clicked element is a button that looks like a filter button
        // Only process if it doesn't have the _filterMonitorAttached flag
        if (
          target.tagName === "BUTTON" &&
          !target._filterMonitorAttached &&
          (target.id === "applyFilters" ||
            target.classList.contains("btn-primary") ||
            target.textContent.toLowerCase().includes("filter") ||
            target.textContent.toLowerCase().includes("search"))
        ) {
          console.log("Potential filter button clicked via global handler");

          // Mark this button as processed to prevent duplicate handling
          target._filterMonitorAttached = true;

          window._filterJustApplied = true;

          // Hide the page immediately to prevent unauthorized loan numbers from being visible
          pageUtils.showPage(false);

          // Remove any existing "not provisioned" message
          removeNotProvisionedAlert();

          setTimeout(async () => {
            await handleSearchResults();
          }, 1000);
        }
      });
    }
  }

  /**
   * Initialize the script
   */
  async function init() {
    DEBUG.log("Loan Filter Script initialized");

    // We already hid the page at the beginning of the script, no need to hide it again
    // Just track that we're in the initial load phase
    window._initialLoadComplete = false;

    // Safety timeout to ensure page is shown even if there's an unexpected issue
    const safetyTimeout = setTimeout(() => {
      console.warn(
        "Safety timeout triggered in init - ensuring page is visible"
      );
      document.body.style.opacity = 1; // Direct approach to ensure visibility
      pageUtils._isHidden = false;
    }, 5000); // 5 seconds max wait time

    try {
      const hasListener = await waitForListener();
      DEBUG.log(
        `Extension listener ${hasListener ? "detected" : "not available"}`
      );

      if (!hasListener) {
        // Show the page if extension is not available
        pageUtils.showPage(true);
        clearTimeout(safetyTimeout);
        return;
      }

      await injectFilterStyles();

      await processAllElements();

      // Ensure the page is visible after initial processing
      pageUtils.showPage(true);

      // Clear the safety timeout once initialization is complete
      clearTimeout(safetyTimeout);

      // Set up mutation observer for dynamic content with optimized performance
      const observer = new MutationObserver((mutations) => {
        // Skip if we're already processing
        if (window._processingAllElements || window._processingSearchResults) {
          return;
        }

        // Use throttling to batch mutation processing
        throttle.execute(
          "mutationProcessing",
          () => {
            // Only hide the page when search results are added
            // This ensures unauthorized loan numbers are not visible during filtering

            let shouldProcess = false;
            let newFormsAdded = false;
            let searchResultsAdded = false;

            // Process only a limited number of mutations to avoid performance issues
            const mutationsToProcess = mutations.slice(0, 20);

            for (const mutation of mutationsToProcess) {
              if (
                mutation.type === "childList" &&
                mutation.addedNodes.length > 0
              ) {
                // Check only direct children instead of all nodes
                const relevantNodes = Array.from(mutation.addedNodes)
                  .filter((node) => node.nodeType === 1)
                  .slice(0, 5); // Limit to 5 nodes per mutation

                for (const node of relevantNodes) {
                  shouldProcess = true;

                  if (
                    node.tagName === "FORM" ||
                    (node.querySelector && node.querySelector("form"))
                  ) {
                    newFormsAdded = true;
                  }

                  if (
                    node.classList &&
                    (node.classList.contains("results") ||
                      node.classList.contains("table-responsive") ||
                      (node.querySelector && node.querySelector("table")))
                  ) {
                    searchResultsAdded = true;
                  }

                  if (shouldProcess && newFormsAdded && searchResultsAdded)
                    break;
                }
              }

              if (shouldProcess && newFormsAdded && searchResultsAdded) break;
            }

            if (shouldProcess) {
              throttle.execute(
                "processAllElements",
                async () => {
                  // Process elements first
                  await processAllElements();

                  // Then handle forms if needed
                  if (newFormsAdded) {
                    monitorSearchAndFilterForms();
                  }

                  // Finally handle search results if needed, with a delay
                  if (searchResultsAdded && !window._processingSearchResults) {
                    // Hide the page only when search results are added
                    if (!window._processingAllElements) {
                      pageUtils.showPage(false);
                    }

                    setTimeout(async () => {
                      await handleSearchResults();
                      // Ensure page is shown after processing
                      pageUtils.showPage(true);
                    }, 500);
                  }
                },
                1000
              ); // Increased delay for throttling
            }
          },
          500
        ); // Throttle mutations processing
      });

      // Use more specific targeting for the observer to reduce unnecessary callbacks
      const targetNodes = document.querySelectorAll(
        '.results, .table-responsive, form, [class*="loan"]'
      );
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

      // Initial form monitoring
      monitorSearchAndFilterForms();

      // Handle loan detail view
      const viewElement = await waitForLoanNumber();
      if (viewElement) {
        const loanNumber = getLoanNumber(viewElement.element);
        if (loanNumber) {
          const isAllowed = await isLoanNumberAllowed(loanNumber);
          if (!isAllowed) {
            viewElement.remove();
            showNotProvisionedAlert(loanNumber);
          }
        }
      }

      // Handle URL changes to filter content when navigating - with optimizations
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

            // Give time for the page to load
            throttle.execute(
              "urlChange",
              async () => {
                await processAllElements();
                await handleSearchResults();
                // processAllElements will show the page when done
              },
              1000
            );
          }

          if (!newVal.includes("#/bidApproveReject")) return;

          const viewElement = await waitForLoanNumber();
          if (!viewElement) return;

          viewElement.remove();

          async function addIfAllowed() {
            const loanNumber = getLoanNumber(viewElement.element);
            if (!loanNumber) return;

            const isAllowed = await isLoanNumberAllowed(loanNumber);
            if (isAllowed) {
              viewElement.add();
            } else {
              showNotProvisionedAlert(loanNumber);
            }
          }

          await addIfAllowed();
        }
      );

      // Expose functions for other scripts to use
      window.isLoanNumberAllowed = isLoanNumberAllowed;
      window.extractBrandsData = extractBrandsData;
      window.showNotProvisionedAlert = showNotProvisionedAlert;
      window.removeNotProvisionedAlert = removeNotProvisionedAlert;

      DEBUG.log("Loan Filter Script ready");
    } catch (error) {
      DEBUG.error("Error initializing Loan Filter Script:", error);
      // Show the page in case of errors
      pageUtils.showPage(true);
      clearTimeout(safetyTimeout);
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
