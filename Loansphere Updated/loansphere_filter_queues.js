(function () {
  // Import utility functions from ui-hider-until-load.js
  const pageUtils = {
    togglePageOpacity: function (val) {
      document.body.style.opacity = val;
    },
    showPage: function (val) {
      document.body.style.opacity = val ? 1 : 0;
    },
    togglePageDisplay: function (val) {
      document.body.style.display = val;
    },
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

  // Configuration
  const config = {
    debug: true,
    filterDelay: 300,
    observerDelay: 500,
    reprocessInterval: 2000,
    isOffshoreUser: true, // Set to true for offshore users who should have restricted access
  };

  // Extension ID for communication
  const EXTENSION_ID = "afkpnpkodeiolpnfnbdokgkclljpgmcm";

  // State tracking
  const state = {
    processedElements: new Set(),
    processedBrands: new Set(),
    processedQueues: new Set(),
    queueLoanMap: new Map(),
    queueVisibility: new Map(),
    observerState: {
      ignoreNextMutations: false,
      processingDebounce: null,
      lastProcessed: 0,
    },
    processingInterval: null,
    lastFilterTime: 0,
    originalQueueCount: 0,
    visibleQueueCount: 0,
    brandProcessing: false,
  };

  // Logging with throttling to prevent console spam
  const logThrottle = {
    lastLogs: {},
    log: function (key, ...args) {
      if (!config.debug) return;

      const now = Date.now();
      if (!this.lastLogs[key] || now - this.lastLogs[key] > 2000) {
        console.log(`[LoanFilter] ${args[0]}`, ...args.slice(1));
        this.lastLogs[key] = now;
      }
    },
  };

  /**
   * Wait for the extension listener to be available
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
   * Check if a loan number is allowed via the extension
   */
  const LoanNums = [
    "0000000000",
    "0000000001",
    "0000000372",
    "0000000612",
    "0000000687",
    "0000000711",
    "0000000786",
    "0000000927",
    "0000000976",
    "0000001081",
    "0000001180",
    "0000001230",
    "0000001255",
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
    "0000002261",
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

  /**
   * Check if a loan number is allowed
   */
  async function isLoanNumberAllowed(loanNumber) {
    try {
      const allowedNumbers = await checkNumbersBatch([loanNumber]);
      return allowedNumbers.includes(loanNumber);
    } catch (error) {
      console.warn("Failed to check loan access, assuming not allowed");
      return false;
    }
  }

  /**
   * Extract brands data from the page
   * This ensures we can access brand information even if window.brandsData is not set
   */
  function extractBrandsData() {
    if (window.brandsData && Array.isArray(window.brandsData)) {
      return window.brandsData; // Use existing data if available
    }

    // Try to extract from brand dropdowns
    const brandsData = [];
    const brandMap = new Map();

    // Extract from brand select options
    const brandSelects = document.querySelectorAll("select#brandSelect");
    brandSelects.forEach((select) => {
      Array.from(select.options).forEach((option) => {
        if (
          !option.value ||
          option.value === "" ||
          isNaN(parseInt(option.value))
        )
          return;

        const brandId = parseInt(option.value);
        if (brandMap.has(brandId)) return; // Skip if already processed

        const text = option.textContent.trim();
        const codeMatch = text.match(/\(([A-Z0-9]+)\)$/);
        const code = codeMatch ? codeMatch[1] : `BRAND${brandId}`;
        const name = codeMatch ? text.replace(/\s*\([A-Z0-9]+\)$/, "") : text;

        brandMap.set(brandId, {
          id: brandId,
          name: name.trim(),
          code: code,
          loanNumbers: [], // Will be populated later
        });
      });
    });

    // Extract loan numbers from table rows
    const rows = document.querySelectorAll("table tbody tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 5) return;

      const loanNumberCell = cells[1]; // Loan Number is the 2nd column
      const brandCell = cells[3]; // Brand is the 4th column

      if (!loanNumberCell || !brandCell) return;

      const loanNumber = loanNumberCell.textContent.trim();
      const brandName = brandCell.textContent.trim();

      if (!loanNumber || !brandName) return;

      // Find the brand by name
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
   * Extract queue data from the page and map loans to queues
   * This builds a mapping of which loans belong to which queues
   */
  function extractQueueData() {
    // Reset the queue loan map
    state.queueLoanMap.clear();

    // Get all table rows
    const rows = document.querySelectorAll("#loansTableBody tr");

    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 6) return;

      const loanNumberCell = cells[1]; // Loan Number is the 2nd column
      const queueCell = cells[4]; // Queue is the 5th column

      if (!loanNumberCell || !queueCell) return;

      const loanNumber = loanNumberCell.textContent.trim();
      const queueName = queueCell.textContent.trim();

      if (!loanNumber || !queueName) return;

      // Add loan to the queue map
      if (!state.queueLoanMap.has(queueName)) {
        state.queueLoanMap.set(queueName, []);
      }

      state.queueLoanMap.get(queueName).push(loanNumber);
    });

    logThrottle.log(
      "queueMap",
      `Extracted ${state.queueLoanMap.size} queues with their loans`
    );

    return state.queueLoanMap;
  }

  /**
   * Check if a queue has at least one allowed loan
   */
  async function queueHasAllowedLoans(queueName) {
    if (!state.queueLoanMap.has(queueName)) {
      return true; // If we can't verify, assume it's allowed
    }

    const loanNumbers = state.queueLoanMap.get(queueName);

    for (const loanNumber of loanNumbers) {
      if (await isLoanNumberAllowed(loanNumber)) {
        return true; // Queue has at least one allowed loan
      }
    }

    return false; // No allowed loans found for this queue
  }

  /**
   * Check if all loans in a queue belong to brands with only restricted loans
   */
  async function queueHasOnlyRestrictedBrands(queueName) {
    if (!state.queueLoanMap.has(queueName)) {
      return false; // If we can't verify, assume it's not restricted
    }

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

    return true; // All brands in this queue have only restricted loans
  }

  /**
   * Check if text contains a loan number pattern
   */
  function containsLoanNumber(text) {
    return /\b\d{5,}\b/.test(text) || /\b[A-Z0-9]{5,}\b/.test(text);
  }

  /**
   * Extract potential loan numbers from text
   */
  function extractLoanNumbers(text) {
    const matches = [];
    const digitMatches = text.match(/\b\d{5,}\b/g);
    const alphaNumMatches = text.match(/\b[A-Z0-9]{5,}\b/g);

    if (digitMatches) matches.push(...digitMatches);
    if (alphaNumMatches) matches.push(...alphaNumMatches);

    return matches.filter(
      (value, index, self) => self.indexOf(value) === index
    );
  }

  /**
   * Determine if an element should be hidden based on loan numbers it contains
   */
  async function shouldHideElement(element) {
    if (!state.queueLoanMap.size) return false;

    if (
      element.tagName === "SCRIPT" ||
      element.tagName === "STYLE" ||
      element.tagName === "META" ||
      element.tagName === "LINK"
    ) {
      return false;
    }

    const text = element.innerText || element.textContent || "";

    if (!containsLoanNumber(text)) return false;

    const potentialLoanNumbers = extractLoanNumbers(text);

    if (potentialLoanNumbers.length === 0) return false;

    let hasAllowedLoan = false;

    for (const loanNumber of potentialLoanNumbers) {
      const isAllowed = await isLoanNumberAllowed(loanNumber);

      if (isAllowed) {
        hasAllowedLoan = true;
        logThrottle.log("allowedLoan", `Found allowed loan: ${loanNumber}`);
        break;
      }
    }

    if (!hasAllowedLoan && potentialLoanNumbers.length > 0) {
      logThrottle.log(
        "filteredLoans",
        `Filtering out loans: ${potentialLoanNumbers.join(", ")}`
      );
      return true;
    }

    return false;
  }

  /**
   * Process table rows to hide those with restricted loan numbers
   */
  async function processTableRows() {
    if (!state.queueLoanMap.size) {
      console.warn("queueLoanMap is not available yet. Waiting...");
      return;
    }

    const rows = document.querySelectorAll("#loansTableBody tr");
    logThrottle.log("tableRows", `Found ${rows.length} table rows to process`);

    // Check if a brand is selected in the top navigation
    const brandSelect = document.querySelector("select#brandSelect");
    let selectedBrand = null;

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

      if (listenerAvailable) {
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
