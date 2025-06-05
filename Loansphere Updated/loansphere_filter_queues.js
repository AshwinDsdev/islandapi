/**
 * @fileoverview Loansphere Queue Filter System
 * @description This file contains the implementation of a filtering system for Loansphere queues.
 * It restricts access to loan information based on user permissions, hiding queues and loans
 * that the user is not authorized to view.
 *
 * @author Loansphere Team
 * @version 1.0.0
 * @copyright 2023 Loansphere Inc.
 */

(function () {
  const pageUtils = {
    /**
     * @function togglePageOpacity
     * @description Sets the page opacity. It can be used to show and hide the page conent.
     * @param {number} val - The value in-between 0 and 1.
     * @example
     * // Example usage of the function
     * togglePageOpacity(0.5);
     */
    togglePageOpacity: function (val) {
      document.body.style.opacity = val;
    },

    /**
     * @function showPage
     * @description Shows or hide the page.
     * @param {boolean} val - The value can be true or false.
     * @example
     * // Example usage of the function
     * showPage(false);
     */
    showPage: function (val) {
      document.body.style.opacity = val ? 1 : 0;
    },

    /**
     * @function togglePageDisplay
     * @description Sets the page display. It can be used to show and hide the page conent.
     * @param {string} val - The value can be 'block' or 'none'.
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

  const config = {
    /**
     * @property debug
     * @description Controls whether debug logging is enabled.
     * @type {boolean}
     */
    debug: true,

    /**
     * @property filterDelay
     * @description Delay in milliseconds between filter operations to prevent UI freezing.
     * @type {number}
     */
    filterDelay: 300,

    /**
     * @property observerDelay
     * @description Delay in milliseconds before processing DOM mutations.
     * @type {number}
     */
    observerDelay: 500,

    /**
     * @property reprocessInterval
     * @description Interval in milliseconds for reprocessing the page to catch any missed elements.
     * @type {number}
     */
    reprocessInterval: 2000,

    /**
     * @property isOffshoreUser
     * @description Flag indicating if the current user is an offshore user with restricted access.
     * @type {boolean}
     */
    isOffshoreUser: true, // Set to true for offshore users who should have restricted access
  };

  /**
   * @constant EXTENSION_ID
   * @description The Chrome extension ID used for communication.
   * @type {string}
   */
  const EXTENSION_ID = "afkpnpkodeiolpnfnbdokgkclljpgmcm";

  const state = {
    /**
     * @property processedElements
     * @description Tracks DOM elements that have already been processed.
     * @type {Set}
     */
    processedElements: new Set(),

    /**
     * @property processedBrands
     * @description Tracks brand elements that have already been processed.
     * @type {Set}
     */
    processedBrands: new Set(),

    /**
     * @property processedQueues
     * @description Tracks queue elements that have already been processed.
     * @type {Set}
     */
    processedQueues: new Set(),

    /**
     * @property queueLoanMap
     * @description Maps queue names to arrays of loan numbers in those queues.
     * @type {Map}
     */
    queueLoanMap: new Map(),

    /**
     * @property queueVisibility
     * @description Maps queue names to their visibility status.
     * @type {Map}
     */
    queueVisibility: new Map(),

    /**
     * @property observerState
     * @description State for the MutationObserver to control processing behavior.
     * @type {Object}
     */
    observerState: {
      /**
       * @property ignoreNextMutations
       * @description Flag to ignore the next set of mutations (prevents infinite loops).
       * @type {boolean}
       */
      ignoreNextMutations: false,

      /**
       * @property processingDebounce
       * @description Timeout ID for debouncing mutation processing.
       * @type {number|null}
       */
      processingDebounce: null,

      /**
       * @property lastProcessed
       * @description Timestamp of the last mutation processing.
       * @type {number}
       */
      lastProcessed: 0,
    },

    /**
     * @property processingInterval
     * @description Interval ID for periodic reprocessing.
     * @type {number|null}
     */
    processingInterval: null,

    /**
     * @property lastFilterTime
     * @description Timestamp of the last filter operation.
     * @type {number}
     */
    lastFilterTime: 0,

    /**
     * @property originalQueueCount
     * @description Original count of queues before filtering.
     * @type {number}
     */
    originalQueueCount: 0,

    /**
     * @property visibleQueueCount
     * @description Count of visible queues after filtering.
     * @type {number}
     */
    visibleQueueCount: 0,

    /**
     * @property brandProcessing
     * @description Flag indicating if brand processing is currently in progress.
     * @type {boolean}
     */
    brandProcessing: false,
  };

  const logThrottle = {
    /**
     * @property lastLogs
     * @description Tracks the timestamp of the last log for each key.
     * @type {Object}
     * @private
     */
    lastLogs: {},

    /**
     * @function log
     * @description Logs a message to the console with throttling to prevent spam.
     * @param {string} key - Unique identifier for the log type to throttle by.
     * @param {...any} args - Arguments to log to the console.
     * @example
     * // Example usage of the function
     * logThrottle.log('queueProcessing', 'Processing queue:', queueName);
     */
    log: function (key, ...args) {
      // Skip logging if debug mode is disabled
      if (!config.debug) return;

      const now = Date.now();
      // Only log if this key hasn't been logged recently (within 2 seconds)
      if (!this.lastLogs[key] || now - this.lastLogs[key] > 2000) {
        console.log(`[LoanFilter] ${args[0]}`, ...args.slice(1));
        this.lastLogs[key] = now;
      }
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
   * @constant LoanNums
   * @description Array of loan numbers that are allowed for the current user.
   * This is used in the development/testing environment instead of querying the extension.
   * @type {string[]}
   */
  const LoanNums = [
    "0194737052",
    "0151410206",
    "0180995748",
    "0000000612",
    "0000000687",
    "0000000711",
    "0000000786",
    "0000000927",
    "0000000976",
    "0194737052",
    "0000001180",
    "0000001230",
    "0151410206",
    "0000001453",
    "0000001537",
    "0000001594",
    "0000001669",
    "0000001677",
    "0000001719",
    "0000001792",
    "0000001834",
    "0000001891",
    "0000002063",
    "0180995748",
    "0000002352",
    "0000002410",
    "0000002436",
    "0000002477",
    "0000002485",
    "0000002493",
    "0000002535",
    "0000002550",
    "0000002600",
    "0000002642",
    "0000002667",
    "0000002691",
  ];

  /**
   * @function checkNumbersBatch
   * @description Checks a batch of loan numbers against the allowed list.
   * @param {string[]} numbers - Array of loan numbers to check.
   * @returns {Promise<string[]>} A promise that resolves to an array of allowed loan numbers.
   * @example
   * // Example usage of the function
   * const allowedLoans = await checkNumbersBatch(['0000000612', '9999999999']);
   * // Returns: ['0000000612']
   */
  const checkNumbersBatch = async (numbers) => {
    // Filter the input numbers to only include those in the allowed list
    const available = numbers.filter((num) => LoanNums.includes(num));
    return available;
  };

  /**
   * @function checkNumbersBatch
   * @description Production version of the function that checks loan numbers against the extension.
   * This is currently commented out and replaced with a local implementation for testing.
   * @param {string[]} numbers - Array of loan numbers to check.
   * @returns {Promise<string[]>} A promise that resolves to an array of allowed loan numbers.
   */
  // async function checkNumbersBatch(numbers)
  // {
  //   return new Promise((resolve, reject) =>
  //   {
  //     chrome.runtime.sendMessage(
  //       EXTENSION_ID,
  //       {
  //         type: "queryLoans",
  //         loanIds: numbers,
  //       },
  //       (response) =>
  //       {
  //         if (chrome.runtime.lastError)
  //         {
  //           return reject(chrome.runtime.lastError.message);
  //         }
  //         else if (response.error)
  //         {
  //           return reject(response.error);
  //         }

  //         const available = Object.keys(response.result).filter(
  //           (key) => response.result[key]
  //         );
  //         resolve(available);
  //       }
  //     );
  //   });
  // }

  /**
   * @function isLoanNumberAllowed
   * @description Checks if a loan number is allowed for the current user.
   * @param {string} loanNumber - The loan number to check.
   * @returns {Promise<boolean>} A promise that resolves to true if the loan is allowed, false otherwise.
   * @example
   * // Example usage of the function
   * const isAllowed = await isLoanNumberAllowed('0000000612');
   * if (isAllowed) {
   *   // Show loan details
   * } else {
   *   // Show access denied message
   * }
   */
  async function isLoanNumberAllowed(loanNumber) {
    try {
      // Query the batch checking function with a single loan number
      const allowedNumbers = await checkNumbersBatch([loanNumber]);
      // Return true if the loan number is in the allowed list
      return allowedNumbers.includes(loanNumber);
    } catch (error) {
      // Log the error and default to not allowed for security
      console.warn("Failed to check loan access, assuming not allowed");
      return false;
    }
  }

  /**
   * @function extractBrandsData
   * @description Extracts brand information from the page, including brand names, codes, and associated loan numbers.
   * This ensures we can access brand information even if window.brandsData is not set.
   * @returns {Array<Object>} Array of brand objects with id, name, code, and loanNumbers properties.
   * @example
   * // Example usage of the function
   * const brands = extractBrandsData();
   * console.log(`Found ${brands.length} brands with their loan numbers`);
   */
  function extractBrandsData() {
    // Use cached data if available
    if (window.brandsData && Array.isArray(window.brandsData)) {
      return window.brandsData; // Use existing data if available
    }

    // Initialize data structures
    const brandsData = [];
    const brandMap = new Map();

    // Extract from brand select options
    const brandSelects = document.querySelectorAll("select#brandSelect");
    brandSelects.forEach((select) => {
      Array.from(select.options).forEach((option) => {
        // Skip invalid options
        if (
          !option.value ||
          option.value === "" ||
          isNaN(parseInt(option.value))
        )
          return;

        // Parse the brand ID
        const brandId = parseInt(option.value);
        if (brandMap.has(brandId)) return; // Skip if already processed

        // Extract brand code and name from option text
        const text = option.textContent.trim();
        const codeMatch = text.match(/\(([A-Z0-9]+)\)$/);
        const code = codeMatch ? codeMatch[1] : `BRAND${brandId}`;
        const name = codeMatch ? text.replace(/\s*\([A-Z0-9]+\)$/, "") : text;

        // Create brand object and add to map
        brandMap.set(brandId, {
          id: brandId,
          name: name.trim(),
          code: code,
          loanNumbers: [], // Will be populated later
        });
      });
    });

    // Extract loan numbers from table rows and associate with brands
    const rows = document.querySelectorAll("table tbody tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 5) return;

      // Get loan number and brand cells
      const loanNumberCell = cells[1]; // Loan Number is the 2nd column
      const brandCell = cells[3]; // Brand is the 4th column

      if (!loanNumberCell || !brandCell) return;

      // Extract text content
      const loanNumber = loanNumberCell.textContent.trim();
      const brandName = brandCell.textContent.trim();

      if (!loanNumber || !brandName) return;

      // Find the brand by name and add the loan number
      for (const [id, brand] of brandMap.entries()) {
        if (
          brand.name === brandName &&
          !brand.loanNumbers.includes(loanNumber)
        ) {
          brand.loanNumbers.push(loanNumber);
          break;
        }
      }
    });

    // Convert map to array
    for (const brand of brandMap.values()) {
      brandsData.push(brand);
    }

    // Store for future use
    window.brandsData = brandsData;

    return brandsData;
  }

  /**
   * @function extractQueueData
   * @description Extracts queue data from the page and builds a mapping of which loans belong to which queues.
   * @returns {Map<string, string[]>} A map where keys are queue names and values are arrays of loan numbers.
   * @example
   * // Example usage of the function
   * const queueMap = extractQueueData();
   * console.log(`Found ${queueMap.size} queues with their loans`);
   */
  function extractQueueData() {
    // Reset the queue loan map to start fresh
    state.queueLoanMap.clear();

    // Get all table rows from the loans table
    const rows = document.querySelectorAll("#loansTableBody tr");

    // Process each row to extract loan numbers and queue names
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      // Skip rows with insufficient cells
      if (cells.length < 6) return;

      // Get the cells containing loan number and queue name
      const loanNumberCell = cells[1]; // Loan Number is the 2nd column
      const queueCell = cells[4]; // Queue is the 5th column

      // Skip if either cell is missing
      if (!loanNumberCell || !queueCell) return;

      // Extract text content
      const loanNumber = loanNumberCell.textContent.trim();
      const queueName = queueCell.textContent.trim();

      // Skip if either value is empty
      if (!loanNumber || !queueName) return;

      // Initialize the queue in the map if it doesn't exist
      if (!state.queueLoanMap.has(queueName)) {
        state.queueLoanMap.set(queueName, []);
      }

      // Add the loan number to the queue's loan array
      state.queueLoanMap.get(queueName).push(loanNumber);
    });

    // Log the results with throttling to prevent console spam
    logThrottle.log(
      "queueMap",
      `Extracted ${state.queueLoanMap.size} queues with their loans`
    );

    return state.queueLoanMap;
  }

  /**
   * @function queueHasAllowedLoans
   * @description Checks if a queue has at least one loan that the current user is allowed to access.
   * @param {string} queueName - The name of the queue to check.
   * @returns {Promise<boolean>} A promise that resolves to true if the queue has at least one allowed loan, false otherwise.
   * @example
   * // Example usage of the function
   * const isQueueAllowed = await queueHasAllowedLoans('Underwriting');
   * if (isQueueAllowed) {
   *   // Show the queue
   * } else {
   *   // Hide the queue
   * }
   */
  async function queueHasAllowedLoans(queueName) {
    // If the queue is not in our map, we can't verify, so assume it's allowed
    if (!state.queueLoanMap.has(queueName)) {
      return true; // If we can't verify, assume it's allowed
    }

    // Get all loan numbers in this queue
    const loanNumbers = state.queueLoanMap.get(queueName);

    // Check each loan number to see if any are allowed
    for (const loanNumber of loanNumbers) {
      if (await isLoanNumberAllowed(loanNumber)) {
        return true; // Queue has at least one allowed loan
      }
    }

    // If we checked all loans and none are allowed, return false
    return false; // No allowed loans found for this queue
  }

  /**
   * @function queueHasOnlyRestrictedBrands
   * @description Checks if all loans in a queue belong to brands with only restricted loans.
   * @param {string} queueName - The name of the queue to check.
   * @returns {Promise<boolean>} A promise that resolves to true if all brands in the queue have only restricted loans, false otherwise.
   * @example
   * // Example usage of the function
   * const hasOnlyRestricted = await queueHasOnlyRestrictedBrands('Processing');
   * if (hasOnlyRestricted) {
   *   // Queue contains only restricted brands
   * }
   */
  async function queueHasOnlyRestrictedBrands(queueName) {
    // If the queue is not in our map, we can't verify, so assume it's not restricted
    if (!state.queueLoanMap.has(queueName)) {
      return false; // If we can't verify, assume it's not restricted
    }

    // Get all loan numbers in this queue
    const loanNumbers = state.queueLoanMap.get(queueName);
    if (loanNumbers.length === 0) return false;

    // Get all brands associated with this queue's loans
    const brandsData = extractBrandsData();
    const queueBrands = new Set();

    // Find all brands associated with loans in this queue
    loanNumbers.forEach((loanNumber) => {
      brandsData.forEach((brand) => {
        if (brand.loanNumbers.includes(loanNumber)) {
          queueBrands.add(brand.id);
        }
      });
    });

    // Check if all brands have only restricted loans
    for (const brandId of queueBrands) {
      const brand = brandsData.find((b) => b.id === brandId);
      if (!brand) continue;

      // Check if this brand has any allowed loans
      if (await brandHasAllowedLoans(brand.loanNumbers)) {
        return false; // Found a brand with allowed loans
      }
    }

    // If all brands have only restricted loans, return true
    return true; // All brands in this queue have only restricted loans
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
    const matches = [];

    // Find numeric loan numbers (5 or more digits)
    const digitMatches = text.match(/\b\d{5,}\b/g);

    // Find alphanumeric loan numbers (5 or more characters, uppercase)
    const alphaNumMatches = text.match(/\b[A-Z0-9]{5,}\b/g);

    // Combine matches
    if (digitMatches) matches.push(...digitMatches);
    if (alphaNumMatches) matches.push(...alphaNumMatches);

    // Return unique matches
    return matches.filter(
      (value, index, self) => self.indexOf(value) === index
    );
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
    // If we don't have queue data yet, don't hide anything
    if (!state.queueLoanMap.size) return false;

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

    // If no loan numbers found, don't hide
    if (potentialLoanNumbers.length === 0) return false;

    // Flag to track if we found at least one allowed loan
    let hasAllowedLoan = false;

    // Check each potential loan number
    for (const loanNumber of potentialLoanNumbers) {
      const isAllowed = await isLoanNumberAllowed(loanNumber);

      // If at least one loan is allowed, don't hide the element
      if (isAllowed) {
        hasAllowedLoan = true;
        logThrottle.log("allowedLoan", `Found allowed loan: ${loanNumber}`);
        break;
      }
    }

    // If no allowed loans were found and there are potential loan numbers, hide the element
    if (!hasAllowedLoan && potentialLoanNumbers.length > 0) {
      logThrottle.log(
        "filteredLoans",
        `Filtering out loans: ${potentialLoanNumbers.join(", ")}`
      );
      return true;
    }

    // Default to not hiding
    return false;
  }

  /**
   * @function processTableRows
   * @description Processes table rows to hide those with restricted loan numbers.
   * @returns {Promise<void>} A promise that resolves when processing is complete.
   * @example
   * // Example usage of the function
   * await processTableRows();
   */
  async function processTableRows() {
    // Check if we have queue data available
    if (!state.queueLoanMap.size) {
      console.warn("queueLoanMap is not available yet. Waiting...");
      return;
    }

    // Get all table rows from the loans table
    const rows = document.querySelectorAll("#loansTableBody tr");
    logThrottle.log("tableRows", `Found ${rows.length} table rows to process`);

    // Check if a brand is selected in the top navigation
    const brandSelect = document.querySelector("select#brandSelect");
    let selectedBrand = null;

    // If a brand is selected, get its name for filtering
    if (brandSelect && brandSelect.selectedIndex > 0) {
      const selectedOption = brandSelect.options[brandSelect.selectedIndex];
      selectedBrand = selectedOption.textContent.trim();
      logThrottle.log(
        "selectedBrand",
        `Filtering by selected brand: ${selectedBrand}`
      );
    }

    for (const row of rows) {
      if (state.processedElements.has(row)) continue;

      state.processedElements.add(row);

      // Get loan number from the row (2nd column)
      const loanNumberCell = row.cells[1];
      if (!loanNumberCell) continue;

      const loanNumber = loanNumberCell.textContent.trim();
      if (!loanNumber) continue;

      // Get brand from the row (4th column)
      const brandCell = row.cells[3];
      const brand = brandCell ? brandCell.textContent.trim() : null;

      // Check if this row should be hidden based on selected brand
      if (
        selectedBrand &&
        selectedBrand !== "All Brands" &&
        brand !== selectedBrand
      ) {
        row.style.display = "none";
        logThrottle.log(
          "hiddenRowBrand",
          `Hiding row with brand ${brand} (selected: ${selectedBrand})`
        );
        continue;
      }

      const isAllowed = await isLoanNumberAllowed(loanNumber);
      if (!isAllowed) {
        row.style.display = "none";
        logThrottle.log(
          "hiddenRow",
          `Hiding row with loan number: ${loanNumber}`
        );
      }
    }
  }

  /**
   * Process generic elements that might contain loan numbers
   */
  async function processGenericElements() {
    if (!state.queueLoanMap.size) {
      return;
    }

    const potentialContainers = document.querySelectorAll(
      '.loan-item, .card, .list-item, div[class*="loan"]'
    );

    for (const container of potentialContainers) {
      if (state.processedElements.has(container)) continue;
      state.processedElements.add(container);

      if (await shouldHideElement(container)) {
        container.style.display = "none";
      }
    }
  }

  /**
   * Process queue elements to hide those that only contain restricted loans
   */
  async function processQueueElements() {
    if (!state.queueLoanMap.size) {
      return;
    }

    // Process queue dropdown
    const queueFilter = document.getElementById("queueFilter");
    if (queueFilter && !state.processedQueues.has(queueFilter)) {
      state.processedQueues.add(queueFilter);

      // Store original queue count if not already stored
      if (state.originalQueueCount === 0) {
        state.originalQueueCount = queueFilter.options.length - 1; // Subtract 1 for "All Queues" option
      }

      // Track visible queues
      let visibleQueueCount = 0;

      // Process each option in the dropdown
      for (const option of Array.from(queueFilter.options)) {
        if (!option.value || option.value === "All Queues") continue; // Skip "All Queues" option

        const queueName = option.textContent.trim();

        // Check if this queue has only restricted brands
        if (await queueHasOnlyRestrictedBrands(queueName)) {
          option.style.display = "none";
          state.queueVisibility.set(queueName, false);
          logThrottle.log(
            "hiddenQueue",
            `Hiding queue with only restricted brands: ${queueName}`
          );
        } else {
          visibleQueueCount++;
          state.queueVisibility.set(queueName, true);
        }
      }

      // Update visible queue count
      state.visibleQueueCount = visibleQueueCount;

      // Update queue count display if it exists
      updateQueueCountDisplay();
    }

    // Process queue cells in the table
    const queueCells = document.querySelectorAll(
      "#loansTableBody tr td:nth-child(5)"
    ); // Queue is the 5th column
    for (const cell of queueCells) {
      if (state.processedQueues.has(cell)) continue;
      state.processedQueues.add(cell);

      const queueName = cell.textContent.trim();
      if (!queueName) continue;

      // If this queue should be hidden, hide the entire row
      if (
        state.queueVisibility.has(queueName) &&
        !state.queueVisibility.get(queueName)
      ) {
        const row = cell.closest("tr");
        if (row) {
          row.style.display = "none";
          logThrottle.log(
            "hiddenQueueRow",
            `Hiding row with restricted queue: ${queueName}`
          );
        }
      }
    }
  }

  /**
   * Update the queue count display to show the number of queues available to the user
   */
  function updateQueueCountDisplay() {
    // Look for queue count elements
    const queueCountElements = document.querySelectorAll(
      ".queue-count, .count-display, h1, h2, h3, h4, h5, h6"
    );

    queueCountElements.forEach((element) => {
      const text = element.textContent;
      if (text && text.includes("Queue") && text.includes("(")) {
        // This might be a heading with a count like "Loan Queues (10)"
        const newText = text.replace(/\(\d+\)/, `(${state.visibleQueueCount})`);
        if (newText !== text) {
          element.textContent = newText;
          logThrottle.log(
            "updatedCount",
            `Updated queue count display to: ${state.visibleQueueCount}`
          );
        }
      }
    });
  }

  /**
   * Check if a brand has at least one allowed loan
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
   * Process brand elements in the page and hide those without allowed loans
   */
  async function processBrandElements() {
    if (!state.queueLoanMap.size) {
      return;
    }

    // Get brands data (either from window object or extract from the page)
    const brandsData = extractBrandsData();

    if (!brandsData || !Array.isArray(brandsData) || brandsData.length === 0) {
      logThrottle.log(
        "noBrands",
        "No brands data available for brand filtering"
      );
      return;
    }

    logThrottle.log(
      "processBrands",
      "Processing brands for filtering...",
      brandsData
    );

    // Filter brand dropdowns
    const brandDropdowns = document.querySelectorAll("select#brandSelect");
    for (const dropdown of brandDropdowns) {
      if (state.processedBrands.has(dropdown)) continue;
      state.processedBrands.add(dropdown);

      // Process each option in the dropdown
      for (const option of Array.from(dropdown.options)) {
        if (
          !option.value ||
          option.value === "" ||
          isNaN(parseInt(option.value))
        )
          continue;

        // Find the brand data for this option
        const brandId = parseInt(option.value);
        const brand = brandsData.find((b) => b.id === brandId);

        if (brand && !(await brandHasAllowedLoans(brand.loanNumbers))) {
          option.style.display = "none"; // Hide brands without allowed loans
          logThrottle.log(
            "hiddenBrand",
            `Filtering out brand: ${brand.name} (${brand.code})`
          );
        }
      }
    }

    // Filter brand cells in the table
    const brandCells = document.querySelectorAll(
      "#loansTableBody tr td:nth-child(4)"
    ); // Brand is the 4th column
    for (const cell of brandCells) {
      if (state.processedBrands.has(cell)) continue;
      state.processedBrands.add(cell);

      // Get brand name from the cell
      const brandName = cell.textContent.trim();
      if (!brandName) continue;

      const brand = brandsData.find((b) => b.name === brandName);

      if (brand && !(await brandHasAllowedLoans(brand.loanNumbers))) {
        // Find the parent row and hide it
        const row = cell.closest("tr");
        if (row) {
          row.style.display = "none";
          logThrottle.log(
            "hiddenBrandRow",
            `Filtering out row with brand: ${brand.name}`
          );
        }
      }
    }
  }

  /**
   * Process the entire page to filter loans, brands, and queues
   */
  async function processPage() {
    // Extract queue data first to build the queue-loan mapping
    extractQueueData();

    // Prevent processing if we're already processing a brand change
    if (state.brandProcessing && Date.now() - state.lastFilterTime < 1000) {
      return;
    }

    const now = Date.now();
    if (now - state.lastFilterTime < config.filterDelay) {
      return; // Throttle processing
    }
    state.lastFilterTime = now;

    // Hide the page during processing
    pageUtils.showPage(false);

    logThrottle.log("processPage", "Processing page for loan filtering...");

    try {
      // Process elements in order
      await processTableRows();
      await processGenericElements();
      await processBrandElements();
      await processQueueElements();

      // Always process search input to ensure filtering is applied
      await processSearchInput();

      // Update queue count display
      updateQueueCountDisplay();

      // Final check to ensure all unauthorized loans are hidden
      await ensureUnauthorizedLoansHidden();
    } finally {
      // Show the page after processing is complete
      pageUtils.showPage(true);
    }
  }

  /**
   * Final check to ensure all unauthorized loans are hidden
   */
  async function ensureUnauthorizedLoansHidden() {
    if (!state.queueLoanMap.size) return;

    // Hide the page during this final check
    pageUtils.showPage(false);

    try {
      const rows = document.querySelectorAll("#loansTableBody tr");
      let hiddenCount = 0;

      for (const row of rows) {
        // Skip already hidden rows
        if (row.style.display === "none") continue;

        const loanNumberCell = row.cells[1];
        if (!loanNumberCell) continue;

        const loanNumber = loanNumberCell.textContent.trim();
        if (!loanNumber) continue;

        // Check if this loan is allowed
        if (!(await isLoanNumberAllowed(loanNumber))) {
          row.style.display = "none";
          hiddenCount++;
        }
      }

      if (hiddenCount > 0) {
        logThrottle.log(
          "finalCheck",
          `Final check hid ${hiddenCount} unauthorized loans that slipped through`
        );
      }
    } finally {
      // Show the page after processing is complete
      pageUtils.showPage(true);
    }
  }

  /**
   * Process search input to filter out unauthorized loans
   */
  async function processSearchInput() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;

    // Get the current search text
    const searchText = searchInput.value.trim().toLowerCase();

    // Always apply our base filtering to ensure only authorized loans are shown
    const rows = document.querySelectorAll("#loansTableBody tr");

    for (const row of rows) {
      const loanNumberCell = row.cells[1];
      if (!loanNumberCell) continue;

      const loanNumber = loanNumberCell.textContent.trim();
      if (!loanNumber) continue;

      // First check if this loan is allowed at all
      const isAllowed = await isLoanNumberAllowed(loanNumber);

      if (!isAllowed) {
        // Always hide unauthorized loans regardless of search
        row.style.display = "none";
        logThrottle.log(
          "hiddenSearchRow",
          `Hiding unauthorized loan: ${loanNumber}`
        );
        continue;
      }

      // If there's a search term, apply additional filtering
      if (searchText) {
        logThrottle.log(
          "searchInput",
          `Processing search input: "${searchText}"`
        );

        // Check if the row matches the search term
        const rowText = row.textContent.toLowerCase();
        const matchesSearch = rowText.includes(searchText);

        // If the search contains a loan number pattern, do additional checks
        if (containsLoanNumber(searchText)) {
          const potentialLoanNumbers = extractLoanNumbers(searchText);

          // If searching for specific loan numbers, ensure they're authorized
          if (potentialLoanNumbers.length > 0) {
            let searchingForAllowedLoan = false;

            for (const searchLoanNumber of potentialLoanNumbers) {
              if (await isLoanNumberAllowed(searchLoanNumber)) {
                searchingForAllowedLoan = true;
                logThrottle.log(
                  "searchAllowedLoan",
                  `Search contains allowed loan: ${searchLoanNumber}`
                );
                break;
              }
            }

            // If searching for unauthorized loans, hide all results
            if (!searchingForAllowedLoan) {
              logThrottle.log(
                "searchUnauthorized",
                `Search for unauthorized loan(s): ${potentialLoanNumbers.join(
                  ", "
                )}`
              );
              row.style.display = "none";
              continue;
            }
          }
        }

        // Show or hide based on search match (only for authorized loans)
        if (!matchesSearch) {
          row.style.display = "none";
        }
      }
    }
  }

  /**
   * Initialize mutation observer to detect DOM changes
   */
  function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      // Skip processing if we're ignoring mutations (e.g., our own DOM changes)
      if (state.observerState.ignoreNextMutations) {
        state.observerState.ignoreNextMutations = false;
        return;
      }

      // Debounce processing to prevent excessive calls
      if (state.observerState.processingDebounce) {
        clearTimeout(state.observerState.processingDebounce);
      }

      // Check if we should process these mutations
      const now = Date.now();
      if (now - state.observerState.lastProcessed < config.observerDelay) {
        // Don't process more than once per configured delay
        return;
      }

      let shouldProcess = false;
      let tableChanged = false;
      let queueChanged = false;
      let brandChanged = false;
      let searchChanged = false;

      for (const mutation of mutations) {
        // Check for added nodes
        if (mutation.addedNodes.length > 0) {
          // Skip if only text nodes were added
          let hasElementNodes = false;
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              // Element node
              hasElementNodes = true;
              break;
            }
          }

          if (hasElementNodes) {
            shouldProcess = true;

            // Check if table rows were added
            for (const node of mutation.addedNodes) {
              if (
                node.nodeName === "TR" ||
                (node.nodeType === 1 && node.querySelector("tr"))
              ) {
                tableChanged = true;
                break;
              }
            }
          }
        }

        // Check for attribute changes on table rows (might indicate filtering)
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style" &&
          (mutation.target.tagName === "TR" || mutation.target.tagName === "TD")
        ) {
          tableChanged = true;
        }

        // Check for changes to queue filter
        if (
          mutation.type === "attributes" &&
          mutation.target.id === "queueFilter"
        ) {
          queueChanged = true;
        }

        // Check for changes to brand filter
        if (
          mutation.type === "attributes" &&
          mutation.target.id === "brandSelect"
        ) {
          brandChanged = true;
        }

        // Check for changes to search input
        if (
          (mutation.type === "attributes" &&
            mutation.target.id === "searchInput") ||
          (mutation.type === "characterData" &&
            mutation.target.parentNode &&
            mutation.target.parentNode.id === "searchInput")
        ) {
          searchChanged = true;
        }
      }

      // Debounce the processing
      state.observerState.processingDebounce = setTimeout(() => {
        state.observerState.lastProcessed = Date.now();

        // Set flag to ignore mutations caused by our own DOM changes
        state.observerState.ignoreNextMutations = true;

        // If brand selection changed, reset processed elements to refilter everything
        if (brandChanged) {
          state.processedElements.clear();
          state.processedQueues.clear();
          state.queueLoanMap.clear();
          logThrottle.log(
            "brandChanged",
            "Brand selection changed, reprocessing all elements"
          );
        }

        if (shouldProcess || tableChanged || queueChanged || brandChanged) {
          logThrottle.log("observer", "Processing page due to DOM changes");
          processPage();

          // Update queue count after processing
          if (queueChanged) {
            updateQueueCountDisplay();
          }
        }

        // Process search input separately if it changed
        if (searchChanged) {
          logThrottle.log(
            "searchChanged",
            "Search input changed, processing search results"
          );
          processSearchInput();
        }
      }, config.filterDelay);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true, // To detect text changes in search input
      attributeFilter: ["value", "style", "class", "display", "selected"],
    });

    return observer;
  }

  /**
   * Set up interval to periodically reprocess the page
   */
  function setupProcessingInterval() {
    if (state.processingInterval) {
      clearInterval(state.processingInterval);
    }

    state.processingInterval = setInterval(() => {
      // Extract queue data first
      extractQueueData();

      if (state.queueLoanMap.size > 0) {
        logThrottle.log("interval", "Reprocessing page from interval");
        processPage();
      }
    }, config.reprocessInterval);

    return state.processingInterval;
  }

  /**
   * Add event listeners for brand and queue selection changes
   */
  function addEventListeners() {
    // Listen for brand selection changes
    const brandSelect = document.getElementById("brandSelect");
    if (brandSelect) {
      let processingTimeout = null;

      brandSelect.addEventListener("change", async () => {
        // Clear any pending timeouts
        if (processingTimeout) {
          clearTimeout(processingTimeout);
        }

        // Disable the select during processing
        brandSelect.disabled = true;

        // Store the selected brand value
        const selectedBrand =
          brandSelect.options[brandSelect.selectedIndex].textContent.trim();

        // Clear all previous processing states
        state.processedElements.clear();
        state.processedQueues.clear();
        state.queueLoanMap.clear();
        state.brandProcessing = true;

        processingTimeout = setTimeout(async () => {
          try {
            // Show loading state
            const rows = document.querySelectorAll("#loansTableBody tr");
            rows.forEach((row) => (row.style.display = ""));

            // Process the page with new brand filter
            await processPage();

            // Re-filter rows based on selected brand
            for (const row of rows) {
              const brandCell = row.cells[3];
              const loanNumberCell = row.cells[1];

              if (brandCell && loanNumberCell) {
                const brand = brandCell.textContent.trim();
                const loanNumber = loanNumberCell.textContent.trim();

                if (selectedBrand !== "All Brands" && brand !== selectedBrand) {
                  row.style.display = "none";
                } else if (!(await isLoanNumberAllowed(loanNumber))) {
                  row.style.display = "none";
                }
              }
            }
          } finally {
            // Reset processing state
            state.brandProcessing = false;
            brandSelect.disabled = false;
          }
        }, 50);
      });

      logThrottle.log(
        "eventListener",
        "Added event listener for brand selection changes"
      );
    }

    // Listen for queue filter changes
    const queueFilter = document.getElementById("queueFilter");
    if (queueFilter) {
      queueFilter.addEventListener("change", () => {
        // Update queue count display after filtering
        logThrottle.log(
          "queueFilterChange",
          "Queue filter changed via event listener"
        );
        setTimeout(updateQueueCountDisplay, 100);
      });

      logThrottle.log(
        "eventListener",
        "Added event listener for queue filter changes"
      );
    }

    // Listen for search input changes
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      // Listen for input events (typing)
      searchInput.addEventListener("input", () => {
        // Process search input after a short delay
        logThrottle.log(
          "searchChange",
          "Search input changed via event listener"
        );
        setTimeout(() => {
          processSearchInput();
          ensureUnauthorizedLoansHidden();
        }, 100);
      });

      // Listen for the search being cleared (via clear button or backspace)
      searchInput.addEventListener("search", () => {
        logThrottle.log("searchCleared", "Search input cleared");
        setTimeout(() => {
          // When search is cleared, make sure we reapply all filtering
          state.processedElements.clear();
          processPage();
        }, 100);
      });

      // Listen for keydown events to catch when search is cleared via backspace
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          if (searchInput.value.length <= 1) {
            // About to clear the search
            logThrottle.log(
              "searchClearing",
              "Search input being cleared via keyboard"
            );
            setTimeout(() => {
              state.processedElements.clear();
              processPage();
            }, 100);
          }
        }
      });

      logThrottle.log(
        "eventListener",
        "Added event listeners for search input changes"
      );
    }
  }

  /**
   * Initialize the filter
   */
  async function initFilter() {
    console.log("[LoanFilter] Initializing Loansphere Queues filter...");

    // Safety timeout to ensure page is shown even if there's an unexpected issue
    const safetyTimeout = setTimeout(() => {
      console.warn("Safety timeout triggered - ensuring page is visible");
      pageUtils.showPage(true);
    }, 10000); // 10 seconds max wait time

    try {
      // Extract queue data first
      extractQueueData();

      // Wait for the extension listener to be available
      const listenerAvailable = await waitForListener();

      if (!listenerAvailable) {
        console.log("✅ Extension listener connected successfully");

        // Initial processing
        await processPage();

        // Process search input if there's already a search term
        await processSearchInput();

        // Add event listeners for interactive elements
        addEventListeners();

        // Set up observers and intervals
        const observer = initMutationObserver();
        const interval = setupProcessingInterval();

        // Clear the safety timeout once initialization is complete
        clearTimeout(safetyTimeout);

        // Add to window for debugging
        window.loanFilterState = {
          observer,
          interval,
          state,
          processPage,
          isLoanNumberAllowed,
          queueHasAllowedLoans,
          queueHasOnlyRestrictedBrands,
          updateQueueCountDisplay,
          processSearchInput,
        };

        console.log(
          "[LoanFilter] Filter initialized successfully with queue filtering for offshore users"
        );
      } else {
        console.warn(
          "⚠️ Extension listener not available, running in limited mode"
        );
        // Show the page if extension is not available
        pageUtils.showPage(true);
        clearTimeout(safetyTimeout);
      }
    } catch (error) {
      console.error("❌ Failed to initialize filter:", error);
      // Show the page in case of errors
      pageUtils.showPage(true);
      clearTimeout(safetyTimeout);
    }
  }

  // Ensure page is visible if user navigates away
  window.addEventListener("beforeunload", () => {
    pageUtils.showPage(true);
  });

  // Start the filter
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFilter);
  } else {
    initFilter();
  }
})();
