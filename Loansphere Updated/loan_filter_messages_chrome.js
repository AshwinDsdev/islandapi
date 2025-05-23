(function () {
  /**
   * @namespace pageUtils
   * @description Utility functions for page manipulation and element selection.
   * Originally imported from ui-hider-until-load.js
   */
  const pageUtils = {
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
      document.body.style.opacity = val ? 1 : 0;
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
  };

  // Hide the page immediately to prevent unauthorized loan numbers from being visible
  pageUtils.showPage(false);

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
      console.error(`[LoanFilter] ${message}`, ...args);
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
   * @example
   * // Example usage of the function
   * const listenerAvailable = await waitForListener(30, 200);
   * if (listenerAvailable) {
   *   // Proceed with operations that require the extension
   * }
   */
  async function waitForListener(maxRetries = 20, initialDelay = 100) {
    return new Promise((resolve, reject) => {
      // Check if Chrome extension API is available
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
       * @description Sends a ping message to the extension and handles the response.
       * @private
       */
      function sendPing() {
        // Check if maximum retries reached
        if (attempts >= maxRetries) {
          console.warn("❌ No listener detected after maximum retries.");
          clearTimeout(timeoutId);
          reject(new Error("Listener not found"));
          return;
        }

        try {
          // Send ping message to extension
          chrome.runtime.sendMessage(
            EXTENSION_ID,
            { type: "ping" },
            (response) => {
              // Handle runtime errors
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

              // Check for successful response
              if (response?.result === "pong") {
                clearTimeout(timeoutId);
                resolve(true);
              } else {
                // Retry with exponential backoff
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

      // Start the ping process
      sendPing();
    });
  }
  /**
   * @function checkNumbersBatch
   * @description Checks a batch of loan numbers against the extension to determine which ones are allowed.
   * @param {string[]} numbers - Array of loan numbers to check.
   * @returns {Promise<string[]>} A promise that resolves to an array of allowed loan numbers.
   * @throws {Error} If there's an error communicating with the extension.
   * @example
   * // Example usage of the function
   * try {
   *   const allowedLoans = await checkNumbersBatch(['12345', '67890']);
   *   console.log('Allowed loans:', allowedLoans);
   * } catch (error) {
   *   console.error('Failed to check loans:', error);
   * }
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
   * @function onValueChange
   * @description Utility function to watch for value changes and trigger a callback when changes occur.
   * @param {Function} evalFunction - Function that returns the value to monitor.
   * @param {Function} callback - Function to call when the value changes, receives (newValue, oldValue).
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.maxTime] - Maximum time in milliseconds to watch for changes.
   * @returns {number} The interval ID that can be used to clear the interval.
   * @example
   * // Example usage of the function
   * const intervalId = onValueChange(
   *   () => document.querySelector('#loanNumber').value,
   *   (newValue, oldValue) => console.log(`Loan number changed from ${oldValue} to ${newValue}`),
   *   { maxTime: 60000 } // Stop watching after 1 minute
   * );
   *
   * // To stop watching:
   * clearInterval(intervalId);
   */
  function onValueChange(evalFunction, callback, options = {}) {
    let lastValue = undefined;
    const startTime = Date.now();
    const endTime = options.maxTime ? startTime + options.maxTime : null;

    // Set up interval to check for value changes
    const intervalId = setInterval(async () => {
      // Check if maximum time has elapsed
      const currentTime = Date.now();
      if (endTime && currentTime > endTime) {
        clearInterval(intervalId);
        return;
      }

      // Get the current value
      let newValue = await evalFunction();
      if (newValue === "") newValue = null;

      // Only trigger callback if the value has changed
      if (lastValue === newValue) return;

      // Update the last value and call the callback
      const oldValue = lastValue;
      lastValue = newValue;

      await callback(newValue, oldValue);
    }, 500); // Check every 500ms

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
    try {
      // Handle empty or undefined loan numbers
      if (!loanNumber) return false;

      // Normalize the loan number to a string and trim whitespace
      loanNumber = String(loanNumber).trim();

      // Check cache first for performance optimization
      if (
        allowedLoansCache.isCacheValid() &&
        allowedLoansCache.isAllowed(loanNumber)
      ) {
        return true;
      }

      // If not in cache or cache is invalid, query the extension
      const allowedNumbers = await checkNumbersBatch([loanNumber]);

      // Update cache with results for future queries
      if (allowedNumbers && allowedNumbers.length > 0) {
        allowedLoansCache.addLoans(allowedNumbers);
      }

      // Return true if the loan number is in the allowed list
      return allowedNumbers.includes(loanNumber);
    } catch (error) {
      // Log the error and default to not allowed for security
      console.warn("Failed to check loan access, assuming not allowed:", error);
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
    if (window._processingSearchResults) {
      DEBUG.log("Already processing search results, skipping");
      return;
    }

    window._processingSearchResults = true;

    // Hide the page during search results processing
    // This ensures unauthorized loan numbers are not visible even for milliseconds
    pageUtils.showPage(false);

    let resultRows = [];
    let filterJustApplied = window._filterJustApplied || false;

    try {
      DEBUG.log("Handling search results");

      window._filterJustApplied = false;

      const resultsContainer = document.querySelector(
        ".table-responsive, .results-container, .message-list, table"
      );

      if (!resultsContainer) {
        DEBUG.log("No results container found");
        // Just make sure the page is visible
        pageUtils.showPage(true);
        return;
      }

      resultRows = resultsContainer.querySelectorAll(
        "tbody tr:not(.header-row):not(.mat-header-row)"
      );

      DEBUG.log(`Found ${resultRows.length} result rows`);

      // First, remove any existing "not provisioned" message
      removeNotProvisionedAlert();

      const searchForm = document.querySelector(
        "form.search-form, .filter-form, .search-container, .messages-filters"
      );

      if (searchForm) {
        DEBUG.log("Found search/filter form");

        const inputs = searchForm.querySelectorAll("input, select");
        let hasSearchCriteria = false;
        let searchFields = [];

        for (const input of inputs) {
          if (input.value && input.value.trim() !== "") {
            hasSearchCriteria = true;
            searchFields.push(input.name || input.id);
            DEBUG.log(
              `Found search criteria in input: ${input.name || input.id}`
            );
          }
        }

        // If we have search criteria and exactly one result, check if it's allowed
        if (hasSearchCriteria && resultRows.length === 1) {
          const resultRow = resultRows[0];
          const rowText = resultRow.textContent || "";
          const loanNumbers = extractLoanNumbers(rowText);

          if (loanNumbers.length > 0) {
            DEBUG.log(`Found loan numbers in row: ${loanNumbers.join(", ")}`);

            // Check if any of these loan numbers are allowed
            let anyAllowed = false;

            for (const loanNumber of loanNumbers) {
              const isAllowed = await isLoanNumberAllowed(loanNumber);

              if (isAllowed) {
                anyAllowed = true;
                break;
              }
            }

            // If none are allowed, hide the row and show the message
            if (!anyAllowed) {
              resultRow.style.display = "none";

              // Show the not provisioned message
              const loanNumber = loanNumbers[0];
              showNotProvisionedAlert(loanNumber);

              DEBUG.log(
                `Search returned exactly one restricted loan: ${loanNumber}. Showing not provisioned message.`
              );
            } else {
              // Make sure the row is visible if it contains an allowed loan
              resultRow.style.display = "";
            }
          }
        }
      }
    } catch (error) {
      DEBUG.error("Error in handleSearchResults:", error);
    } finally {
      window._processingSearchResults = false;

      // Show the page after processing is complete
      pageUtils.showPage(true);
    }

    // Check if there are no visible rows after filtering
    // This handles the case when all rows are filtered out
    const visibleRows = Array.from(resultRows).filter(
      (row) =>
        row.style.display !== "none" && getComputedStyle(row).display !== "none"
    );

    DEBUG.log(
      `${visibleRows.length} visible rows out of ${resultRows.length} total rows`
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

    // Hide the page during processing
    // This ensures unauthorized loan numbers are not visible even for milliseconds
    pageUtils.showPage(false);

    try {
      await processTableRows();
      await processGenericElements();
      await processBrandElements();
      await processSecureMessageDropdown();

      // Only call handleSearchResults if we're not already processing search results
      if (!window._processingSearchResults) {
        await handleSearchResults();
      }
    } catch (error) {
      console.error("Error in processAllElements:", error);
    } finally {
      // Clear processing flag when done
      window._processingAllElements = false;

      // Show the page after processing is complete
      pageUtils.showPage(true);
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
   */
  function showNotProvisionedAlert(loanNumber) {
    removeNotProvisionedAlert();

    const alertDiv = document.createElement("div");
    alertDiv.className = "not-provisioned-alert";
    alertDiv.id = "not-provisioned-alert";

    // If loanNumber is "filtered", it means we're showing a generic message
    // for search results where all loans were filtered out
    if (loanNumber === "filtered") {
      alertDiv.textContent = "Loan is not provisioned to the user";
    } else {
      alertDiv.textContent = `Loan ${loanNumber} is not provisioned to the user`;
    }

    // Try to find the results container first to place the message in context
    const resultsContainer = document.querySelector(
      ".table-responsive, .results-container, .message-list, table"
    );

    if (resultsContainer && resultsContainer.parentNode) {
      // Insert before the results container for better visibility
      resultsContainer.parentNode.insertBefore(alertDiv, resultsContainer);
    } else {
      // Fall back to general container insertion
      const container = document.querySelector(
        ".container, .container-fluid, main, body"
      );
      if (container) {
        if (container.firstChild) {
          container.insertBefore(alertDiv, container.firstChild);
        } else {
          container.appendChild(alertDiv);
        }
      } else {
        document.body.insertBefore(alertDiv, document.body.firstChild);
      }
    }

    window._showingNotProvisionedMessage = true;
    window._restrictedLoanNumber = loanNumber;
  }

  /**
   * Removes the "Loan is not provisioned" alert
   */
  function removeNotProvisionedAlert() {
    const alert = document.getElementById("not-provisioned-alert");
    if (alert) {
      alert.remove();
    }

    window._showingNotProvisionedMessage = false;
    window._restrictedLoanNumber = null;
  }

  /**
   * Monitors search and filter form submissions
   * This ensures we catch when users apply filters or search
   */
  function monitorSearchAndFilterForms() {
    console.log("Setting up filter button monitoring");

    // Specifically target the Apply Filters button
    const applyFiltersButton = document.getElementById("applyFilters");
    if (applyFiltersButton && !applyFiltersButton._filterMonitorAttached) {
      console.log("Found Apply Filters button, attaching listener");
      applyFiltersButton._filterMonitorAttached = true;

      applyFiltersButton.addEventListener("click", () => {
        console.log("Apply Filters button clicked");

        // Hide the page immediately to prevent unauthorized loan numbers from being visible
        pageUtils.showPage(false);

        // Set flag that filter was just applied
        window._filterJustApplied = true;

        // Remove any existing "not provisioned" message
        removeNotProvisionedAlert();

        // Give time for the results to load
        setTimeout(async () => {
          await handleSearchResults();
        }, 1000);
      });
    }

    // Look for the messages-filters container
    const messagesFilters = document.querySelector(".messages-filters");
    if (messagesFilters) {
      console.log("Found messages-filters container");

      // Find all buttons within the messages-filters container
      const filterButtons =
        messagesFilters.querySelectorAll("button.btn-primary");
      console.log(
        `Found ${filterButtons.length} filter buttons in messages-filters`
      );

      filterButtons.forEach((button) => {
        if (button._filterMonitorAttached) return;
        button._filterMonitorAttached = true;

        button.addEventListener("click", () => {
          console.log("Filter button clicked in messages-filters");

          // Hide the page immediately to prevent unauthorized loan numbers from being visible
          pageUtils.showPage(false);

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

    // Hide the page immediately to prevent unauthorized loan numbers from being visible
    pageUtils.showPage(false);

    // Safety timeout to ensure page is shown even if there's an unexpected issue
    const safetyTimeout = setTimeout(() => {
      console.warn("Safety timeout triggered - ensuring page is visible");
      pageUtils.showPage(true);
    }, 10000); // 10 seconds max wait time

    try {
      const hasListener = await waitForListener();
      DEBUG.log(
        `Extension listener ${hasListener ? "detected" : "not available"}`
      );

      // if (!hasListener) {
      //   // Show the page if extension is not available
      //   pageUtils.showPage(true);
      //   clearTimeout(safetyTimeout);
      //   return;
      // }

      await injectFilterStyles();

      await processAllElements();

      // Clear the safety timeout once initialization is complete
      clearTimeout(safetyTimeout);

      // Set up interval for continuous processing with safeguards
      setInterval(() => {
        // Only process if we're not already processing
        if (
          !window._processingAllElements &&
          !window._processingSearchResults
        ) {
          throttle.execute("processAllElements", () => {
            processAllElements();
            monitorSearchAndFilterForms(); // Continuously check for new forms
          });
        } else {
          DEBUG.log("Skipping interval processing - already in progress");
        }
      }, FILTER_INTERVAL_MS);

      // Set up mutation observer for dynamic content with safeguards
      const observer = new MutationObserver(async (mutations) => {
        // Skip if we're already processing
        if (window._processingAllElements || window._processingSearchResults) {
          DEBUG.log("Skipping mutation processing - already in progress");
          return;
        }

        // Hide the page immediately when new content is added
        // This ensures unauthorized loan numbers are not visible even for milliseconds
        pageUtils.showPage(false);

        let shouldProcess = false;
        let newFormsAdded = false;
        let searchResultsAdded = false;

        for (const mutation of mutations) {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === 1) {
                shouldProcess = true;

                if (node.tagName === "FORM" || node.querySelector("form")) {
                  newFormsAdded = true;
                }

                if (
                  node.classList &&
                  (node.classList.contains("results") ||
                    node.classList.contains("table-responsive") ||
                    node.querySelector("table"))
                ) {
                  searchResultsAdded = true;
                }
              }
            }
          }

          if (shouldProcess && newFormsAdded && searchResultsAdded) break;
        }

        if (shouldProcess) {
          throttle.execute("processAllElements", async () => {
            // Process elements first
            await processAllElements();

            // Then handle forms if needed
            if (newFormsAdded) {
              monitorSearchAndFilterForms();
            }

            // Finally handle search results if needed, with a delay
            if (searchResultsAdded && !window._processingSearchResults) {
              setTimeout(async () => {
                await handleSearchResults();
              }, 500);
            }
          });
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

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

      // Handle URL changes to filter content when navigating
      onValueChange(
        () => document.location.href,
        async (newVal, oldVal) => {
          if (newVal !== oldVal) {
            // Any URL change might be a navigation that loads new content
            DEBUG.log(`URL changed from ${oldVal} to ${newVal}`);

            // Hide the page during navigation
            // This ensures unauthorized loan numbers are not visible even for milliseconds
            pageUtils.showPage(false);

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
          viewElement.remove();

          async function addIfAllowed() {
            const loanNumber = getLoanNumber(viewElement.element);
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
    pageUtils.showPage(true);
  });

  // Start the script
  init();
})();
