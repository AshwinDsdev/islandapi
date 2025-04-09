/**
 * Loan Filter Script
 * 
 * This script filters loan data displayed on the page based on the storedNumbersSet.
 * Only loans that exist in the storedNumbersSet will be visible to the user.

 */

(function () {
  console.log("Loan Filter Script initialized");
  
  // Define the function first, then make it globally accessible
  let processSecureMessageDropdownFunc;

  const FILTER_INTERVAL_MS = 2000;

  const processedElements = new WeakSet();
  const processedBrands = new WeakSet();

  // Throttle logging to prevent console spam
  const logThrottle = {
    lastLog: {},
    log: function (key, message, data) {
      const now = Date.now();
      if (!this.lastLog[key] || now - this.lastLog[key] > 5000) {
        // Only log once every 5 seconds per key
        this.lastLog[key] = now;
        if (data !== undefined) {
          console.log(message, data);
        } else {
          console.log(message);
        }
      }
    },
  };

  function isStoredNumbersSetAvailable() {
    logThrottle.log(
      "storedNumbersSet",
      "Current storedNumbersSet available:",
      !!window.storedNumbersSet
    );
    return (
      window.storedNumbersSet !== null && window.storedNumbersSet !== undefined
    );
  }
  
  /**
   * Checks if a loan number is allowed based on the storedNumbersSet
   * @param {string} loanNumber - The loan number to check
   * @returns {boolean} - True if the loan number is in the storedNumbersSet
   */
  function isLoanNumberAllowed(loanNumber) {
    if (!isStoredNumbersSetAvailable()) {
      return true; // If we can't verify, assume it's allowed
    }
    
    let isAllowed = false;
    
    if (window.storedNumbersSet instanceof Set) {
      isAllowed = window.storedNumbersSet.has(loanNumber);
    } else if (Array.isArray(window.storedNumbersSet)) {
      isAllowed = window.storedNumbersSet.includes(loanNumber);
    } else if (window.storedNumbersSet && typeof window.storedNumbersSet === "object") {
      isAllowed = Object.values(window.storedNumbersSet).includes(loanNumber);
    }
    
    return isAllowed;
  }

  /**
   * Extracts brands data from the page if not directly available
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
    const rows = document.querySelectorAll("table#borrowersTable tbody tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 5) return;

      const loanNumberCell = cells[3]; // Assuming Loan Number is the 4th column
      const brandCell = cells[4]; // Assuming Brand is the 5th column

      if (!loanNumberCell || !brandCell) return;

      const loanNumber = loanNumberCell.textContent.trim();
      const brandCodeMatch = brandCell.textContent.match(/\b([A-Z0-9]{2,})\b/);

      if (!loanNumber || !brandCodeMatch) return;

      const brandCode = brandCodeMatch[1];

      // Find the brand by code
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

    // Convert map to array
    for (const brand of brandMap.values()) {
      brandsData.push(brand);
    }

    // Store for future use
    window.brandsData = brandsData;

    return brandsData;
  }

  function containsLoanNumber(text) {
    return /\b\d{5,}\b/.test(text) || /\b[A-Z0-9]{5,}\b/.test(text);
  }

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

  function shouldHideElement(element) {
    if (!isStoredNumbersSetAvailable()) return false;

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
      const isAllowed = isLoanNumberAllowed(loanNumber);

      if (isAllowed) {
        hasAllowedLoan = true;
        console.log(`Found allowed loan: ${loanNumber}`);
        break;
      }
    }

    if (!hasAllowedLoan && potentialLoanNumbers.length > 0) {
      console.log(`Filtering out loans: ${potentialLoanNumbers.join(", ")}`);
      return true;
    }

    return false;
  }

  function processTableRows() {
    if (!isStoredNumbersSetAvailable()) {
      console.warn("storedNumbersSet is not available yet. Waiting...");
      return;
    }

    const rows = document.querySelectorAll("tr");
    console.log(`Found ${rows.length} table rows to process`);

    rows.forEach((row) => {
      if (processedElements.has(row)) return;

      processedElements.add(row);

      if (shouldHideElement(row)) {
        row.style.display = "none";
      }
    });
  }

  function processGenericElements() {
    if (!isStoredNumbersSetAvailable()) {
      return;
    }

    const potentialContainers = document.querySelectorAll(
      '.borrower-row, .loan-item, .card, .list-item, div[class*="loan"], div[class*="borrower"]'
    );

    potentialContainers.forEach((container) => {
      if (processedElements.has(container)) return;

      processedElements.add(container);

      if (shouldHideElement(container)) {
        container.style.display = "none";
      }
    });
  }

  /**
   * Checks if a brand has any loan numbers that are in the storedNumbersSet
   * @param {Array} brandLoanNumbers - Array of loan numbers associated with a brand
   * @returns {boolean} - True if at least one loan number is in storedNumbersSet
   */
  function brandHasAllowedLoans(brandLoanNumbers) {
    if (
      !isStoredNumbersSetAvailable() ||
      !brandLoanNumbers ||
      !Array.isArray(brandLoanNumbers)
    ) {
      return true; // If we can't verify, don't hide
    }

    for (const loanNumber of brandLoanNumbers) {
      const isAllowed = isLoanNumberAllowed(loanNumber);

      if (isAllowed) {
        return true; // Brand has at least one allowed loan
      }
    }

    return false; // No allowed loans found for this brand
  }

  /**
   * Process brand elements in the page and hide those without allowed loans
   */
  function processBrandElements() {
    if (!isStoredNumbersSetAvailable()) {
      return;
    }

    // Get brands data (either from window object or extract from the page)
    const brandsData = extractBrandsData();

    if (!brandsData || !Array.isArray(brandsData) || brandsData.length === 0) {
      console.warn("No brands data available for brand filtering");
      return;
    }

    console.log("Processing brands for filtering...", brandsData);

    // Filter brand dropdowns
    const brandDropdowns = document.querySelectorAll(
      "select#brandSelect, select#searchBrand"
    );
    brandDropdowns.forEach((dropdown) => {
      if (processedBrands.has(dropdown)) return;
      processedBrands.add(dropdown);

      // Process each option in the dropdown
      Array.from(dropdown.options).forEach((option) => {
        if (
          !option.value ||
          option.value === "" ||
          isNaN(parseInt(option.value))
        )
          return; // Skip "All Brands" option

        // Find the brand data for this option
        const brandId = parseInt(option.value);
        const brand = brandsData.find((b) => b.id === brandId);

        if (brand && !brandHasAllowedLoans(brand.loanNumbers)) {
          option.style.display = "none"; // Hide brands without allowed loans
          console.log(`Filtering out brand: ${brand.name} (${brand.code})`);
        }
      });
    });

    // Filter brand elements in the table
    const brandCells = document.querySelectorAll("td:nth-child(5)"); // Assuming Brand is the 5th column
    brandCells.forEach((cell) => {
      if (processedBrands.has(cell)) return;
      processedBrands.add(cell);

      // Extract brand code from the cell
      const brandCodeMatch = cell.textContent.match(/\b([A-Z0-9]{2,})\b/);
      if (!brandCodeMatch) return;

      const brandCode = brandCodeMatch[1];
      const brand = brandsData.find((b) => b.code === brandCode);

      if (brand && !brandHasAllowedLoans(brand.loanNumbers)) {
        // Find the parent row and hide it
        const row = cell.closest("tr");
        if (row) {
          row.style.display = "none";
          console.log(
            `Filtering out row with brand: ${brand.name} (${brand.code})`
          );
        }
      }
    });

    // Filter brand containers (divs, sections, etc. that might represent a brand)
    const brandContainers = document.querySelectorAll(
      '[data-brand], [class*="brand-"], [id*="brand-"]'
    );
    brandContainers.forEach((container) => {
      if (processedBrands.has(container)) return;
      processedBrands.add(container);

      // Try to find brand code from data attribute or content
      let brandCode = container.dataset.brand;
      if (!brandCode) {
        const text = container.innerText || container.textContent || "";
        const codeMatch = text.match(/\b([A-Z0-9]{2,})\b/);
        if (codeMatch) brandCode = codeMatch[1];
      }

      if (!brandCode) return;

      const brand = brandsData.find((b) => b.code === brandCode);
      if (brand && !brandHasAllowedLoans(brand.loanNumbers)) {
        container.style.display = "none";
        console.log(
          `Filtering out brand container: ${brand.name} (${brand.code})`
        );
      }
    });
  }

  // Track when we last processed a loan message to prevent loops
  const loanMessageState = {
    lastProcessed: 0,
    lastLoanNumber: null,
    messageDisplayed: false,
    processingInProgress: false,
  };
  
  // Track processed loan dropdowns
  const processedLoanDropdowns = new WeakSet();
  
  /**
   * Processes the loan dropdown in the secure message form
   * Removes loan numbers that are not in the storedNumbersSet
   */
  processSecureMessageDropdownFunc = function processSecureMessageDropdown() {
    if (!isStoredNumbersSetAvailable()) {
      logThrottle.log("dropdownNoSet", "storedNumbersSet not available for loan dropdown filtering");
      return;
    }
    
    const loanDropdown = document.getElementById('loanPropertySelect');
    if (!loanDropdown) {
      logThrottle.log("noLoanDropdown", "Loan dropdown not found");
      return;
    }
    
    logThrottle.log("processingDropdown", "Processing loan dropdown options");
    
    // Create a new select element to replace the existing one
    const newDropdown = document.createElement('select');
    newDropdown.id = loanDropdown.id;
    newDropdown.className = loanDropdown.className;
    newDropdown.required = loanDropdown.required;
    
    // Copy the first option (placeholder)
    if (loanDropdown.options.length > 0) {
      const placeholderOption = document.createElement('option');
      placeholderOption.value = loanDropdown.options[0].value;
      placeholderOption.text = loanDropdown.options[0].text;
      placeholderOption.disabled = loanDropdown.options[0].disabled;
      placeholderOption.selected = true;
      newDropdown.appendChild(placeholderOption);
    }
    
    // Track if we've added any allowed loans
    let hasAllowedLoans = false;
    
    // Process each option in the dropdown
    Array.from(loanDropdown.options).forEach((option, index) => {
      // Skip the first option (placeholder) or disabled options
      if (index === 0 || !option.value || option.disabled) {
        return;
      }
      
      const loanNumber = option.value;
      
      // Check if this loan number is allowed
      const isAllowed = isLoanNumberAllowed(loanNumber);
      
      if (isAllowed) {
        // Clone the option to the new dropdown
        const newOption = document.createElement('option');
        newOption.value = option.value;
        newOption.text = option.text;
        
        // Copy any data attributes
        if (option.dataset) {
          for (const key in option.dataset) {
            newOption.dataset[key] = option.dataset[key];
          }
        }
        
        newDropdown.appendChild(newOption);
        hasAllowedLoans = true;
        logThrottle.log("keepLoanOption", `Keeping allowed loan option: ${loanNumber}`);
      } else {
        logThrottle.log("removeLoanOption", `Filtering out loan option: ${loanNumber}`);
      }
    });
    
    // If no loans were allowed, add a message option
    if (!hasAllowedLoans) {
      const noAccessOption = document.createElement('option');
      noAccessOption.text = 'No loans available - Access restricted';
      noAccessOption.disabled = true;
      newDropdown.appendChild(noAccessOption);
      logThrottle.log("noLoansAvailable", "All loans are restricted, added message option");
    }
    
    // Replace the old dropdown with the new one
    try {
      if (loanDropdown.parentNode) {
        // Copy event listeners
        const oldListeners = loanDropdown._eventListeners || {};
        for (const eventType in oldListeners) {
          oldListeners[eventType].forEach(listener => {
            newDropdown.addEventListener(eventType, listener);
          });
        }
        
        // Replace the dropdown
        loanDropdown.parentNode.replaceChild(newDropdown, loanDropdown);
        logThrottle.log("replacedDropdown", "Replaced loan dropdown with filtered version");
        
        // Dispatch a change event to update any dependent UI
        const event = new Event('change', { bubbles: true });
        newDropdown.dispatchEvent(event);
      }
    } catch (e) {
      console.error("Error replacing dropdown:", e);
    }
    
    // Mark as processed
    processedLoanDropdowns.add(newDropdown);
  }

  /**
   * Checks if the current page shows search results with exactly one restricted loan
   * If so, displays a "Loan not provisioned to you" message
   */
  function handleSingleRestrictedLoanSearch() {
    // Prevent concurrent processing and throttle calls
    if (loanMessageState.processingInProgress) {
      return;
    }

    const now = Date.now();
    if (now - loanMessageState.lastProcessed < 1000) {
      // Don't process more than once per second
      return;
    }

    loanMessageState.processingInProgress = true;
    loanMessageState.lastProcessed = now;

    try {
      if (!isStoredNumbersSetAvailable()) {
        return;
      }

      logThrottle.log(
        "checkLoan",
        "Checking for single restricted loan search scenario..."
      );

      // First, check if we already have a message displayed
      const existingMessage = document.getElementById(
        "loan-not-provisioned-message"
      );
      if (existingMessage && loanMessageState.messageDisplayed) {
        // Message already displayed, don't process again
        return;
      }

      // Remove any existing message to avoid duplicates
      if (existingMessage) {
        existingMessage.remove();
        loanMessageState.messageDisplayed = false;
      }

      // Check if we're on a search results page
      const searchForm = document.querySelector(
        '#borrowerSearchForm, form[name="searchForm"]'
      );
      if (!searchForm) {
        logThrottle.log("noForm", "No search form found");
        return;
      }

      // Look for search input fields
      const searchFields = [
        "loanNumber",
        "userName",
        "firstName",
        "lastName",
        "email",
        "phone",
        "propertyAddress",
        "ssn",
      ];

      let hasSearchCriteria = false;
      for (const fieldId of searchFields) {
        const field = document.getElementById(fieldId);
        if (field && field.value && field.value.trim() !== "") {
          hasSearchCriteria = true;
          logThrottle.log(
            "criteria",
            `Found search criteria in field: ${fieldId}`
          );
          break;
        }
      }

      if (!hasSearchCriteria) {
        logThrottle.log("noCriteria", "No search criteria found");
        return;
      }

      // Check if there's exactly one result in the table
      const tableBody = document.querySelector(
        "#borrowersTable tbody, table.results-table tbody"
      );
      if (!tableBody) {
        logThrottle.log("noTable", "No table body found");
        return;
      }

      // Get all rows before any filtering
      const allRows = Array.from(tableBody.querySelectorAll("tr"));
      logThrottle.log("rowCount", `Total rows in table: ${allRows.length}`);

      if (allRows.length !== 1) {
        logThrottle.log(
          "notSingleRow",
          `Found ${allRows.length} rows, not exactly 1`
        );
        return;
      }

      const row = allRows[0];

      // Extract loan number from the row
      const loanNumberCell = row.querySelector("td:nth-child(4)"); // Assuming Loan Number is the 4th column
      if (!loanNumberCell) {
        logThrottle.log("noLoanCell", "No loan number cell found");
        return;
      }

      const loanNumber = loanNumberCell.textContent.trim();

      // If we already processed this loan number, don't do it again
      if (
        loanNumber === loanMessageState.lastLoanNumber &&
        loanMessageState.messageDisplayed
      ) {
        return;
      }

      loanMessageState.lastLoanNumber = loanNumber;
      logThrottle.log("loanFound", `Found loan number: ${loanNumber}`);

      // Check if this loan number is restricted
      const isAllowed = isLoanNumberAllowed(loanNumber);

      logThrottle.log(
        "loanAllowed",
        `Loan ${loanNumber} is allowed: ${isAllowed}`
      );

      if (!isAllowed) {
        // Hide the row
        row.style.display = "none";

        // Create and display the message
        const messageContainer = document.createElement("div");
        messageContainer.className = "alert alert-warning mt-3";
        messageContainer.id = "loan-not-provisioned-message";
        messageContainer.style.padding = "15px";
        messageContainer.style.margin = "20px 0";
        messageContainer.style.border = "1px solid #ffeeba";
        messageContainer.style.borderRadius = "4px";
        messageContainer.style.backgroundColor = "#fff3cd";
        messageContainer.style.color = "#856404";
        messageContainer.innerHTML =
          "<strong>Loan not provisioned to you.</strong> You do not have access to view this loan information.";

        // Try multiple insertion points to ensure the message is displayed
        const table = tableBody.closest("table");
        const cardBody = document.querySelector(".card-body");
        const searchContainer = searchForm.closest(".card, .container, .row");

        if (table && table.parentNode) {
          logThrottle.log("insertTable", "Inserting message before table");
          table.parentNode.insertBefore(messageContainer, table);
        } else if (cardBody) {
          logThrottle.log(
            "insertCard",
            "Inserting message at top of card body"
          );
          cardBody.insertBefore(messageContainer, cardBody.firstChild);
        } else if (searchContainer) {
          logThrottle.log(
            "insertContainer",
            "Appending message to search container"
          );
          searchContainer.appendChild(messageContainer);
        } else {
          logThrottle.log("insertForm", "Inserting message after search form");
          searchForm.parentNode.insertBefore(
            messageContainer,
            searchForm.nextSibling
          );
        }

        loanMessageState.messageDisplayed = true;
        logThrottle.log(
          "messageDisplayed",
          `Displayed "Loan not provisioned" message for loan: ${loanNumber}`
        );
      }
    } finally {
      loanMessageState.processingInProgress = false;
    }
  }

  /**
   * We're not using this function anymore since we're using static loans
   * in the secure message dropdown without filtering based on storedNumbersSet
   */
  function processSecureMessageDropdown() {
    // This function is intentionally left empty
    // We're using static loan data in the dropdown without filtering
    return;
  }

  function processPage() {
    if (!isStoredNumbersSetAvailable()) {
      console.warn("storedNumbersSet is not available yet. Waiting...");
      return;
    }

    console.log("Processing page for loan filtering...");
    processTableRows();
    processGenericElements();
    processBrandElements();
    // We're not filtering the secure message dropdown based on storedNumbersSet
    handleSingleRestrictedLoanSearch();
  }

  // Track mutation observer state to prevent excessive processing
  const observerState = {
    lastProcessed: 0,
    processingDebounce: null,
    ignoreNextMutations: false,
  };

  /**
   * Initialize mutation observer to detect DOM changes
   */
  function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      // Skip processing if we're ignoring mutations (e.g., our own DOM changes)
      if (observerState.ignoreNextMutations) {
        observerState.ignoreNextMutations = false;
        return;
      }

      // Debounce processing to prevent excessive calls
      if (observerState.processingDebounce) {
        clearTimeout(observerState.processingDebounce);
      }

      // Check if we should process these mutations
      const now = Date.now();
      if (now - observerState.lastProcessed < 500) {
        // Don't process more than once per 500ms
        return;
      }

      let shouldProcess = false;
      let searchFormChanged = false;
      let tableChanged = false;
      let messageRelated = false;

      for (const mutation of mutations) {
        // Skip mutations to our message element
        if (
          mutation.target.id === "loan-not-provisioned-message" ||
          mutation.target.closest("#loan-not-provisioned-message")
        ) {
          messageRelated = true;
          continue;
        }

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

            // Check if search form or results were modified
            if (
              mutation.target.closest &&
              mutation.target.closest(
                '#borrowerSearchForm, form[name="searchForm"], #borrowersTable, table.results-table, .card-body'
              )
            ) {
              searchFormChanged = true;
            }
          }
        }

        // Check for attribute changes on search inputs
        if (mutation.type === "attributes") {
          if (
            (mutation.target.tagName === "INPUT" ||
              mutation.target.tagName === "SELECT") &&
            mutation.target.closest &&
            mutation.target.closest(
              '#borrowerSearchForm, form[name="searchForm"]'
            )
          ) {
            searchFormChanged = true;
          }

          // Check for style changes on table rows (might indicate filtering)
          if (
            mutation.attributeName === "style" &&
            (mutation.target.tagName === "TR" ||
              mutation.target.tagName === "TD")
          ) {
            tableChanged = true;
          }
        }
      }

      // If these mutations were only related to our message, ignore them
      if (
        messageRelated &&
        !shouldProcess &&
        !searchFormChanged &&
        !tableChanged
      ) {
        return;
      }

      // Debounce the processing
      observerState.processingDebounce = setTimeout(() => {
        observerState.lastProcessed = Date.now();

        // Set flag to ignore mutations caused by our own DOM changes
        observerState.ignoreNextMutations = true;

        if (shouldProcess) {
          logThrottle.log("observer", "Processing page due to DOM changes");
          processPage();
        } else if (tableChanged) {
          // If table content changed, check for the single restricted loan case
          logThrottle.log(
            "tableChanged",
            "Table changed, checking for restricted loan message"
          );
          handleSingleRestrictedLoanSearch();
        } else if (searchFormChanged) {
          // If only search form changed, just check for the single restricted loan case
          logThrottle.log(
            "formChanged",
            "Search form changed, checking for restricted loan message"
          );
          handleSingleRestrictedLoanSearch();
        }
      }, 300); // Debounce for 300ms
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["value", "style", "class", "display"],
    });

    return observer;
  }

  // Track interval processing state
  const intervalState = {
    lastProcessed: Date.now(),
    processCount: 0,
  };

  // Initial processing
  processPage();

  // Specifically check for single restricted loan case after a short delay
  setTimeout(() => {
    logThrottle.log(
      "initialCheck",
      "Initial check for restricted loan message"
    );
    handleSingleRestrictedLoanSearch();
  }, 1000);

  // Set up interval for periodic processing, but with throttling
  const intervalId = setInterval(() => {
    const now = Date.now();

    // Only process if enough time has passed since last processing
    if (now - intervalState.lastProcessed >= FILTER_INTERVAL_MS) {
      intervalState.lastProcessed = now;
      intervalState.processCount++;

      logThrottle.log(
        "intervalProcess",
        `Periodic processing (count: ${intervalState.processCount})`
      );
      processPage();

      // Only check for restricted loan message every other interval
      if (intervalState.processCount % 2 === 0) {
        handleSingleRestrictedLoanSearch();
      }
    }
  }, FILTER_INTERVAL_MS);

  // Set up mutation observer for dynamic content
  const observer = initMutationObserver();

  // Expose cleanup function
  window.__cleanupLoanFilter = function () {
    clearInterval(intervalId);
    clearInterval(listenerIntervalId);

    if (observerState.processingDebounce) {
      clearTimeout(observerState.processingDebounce);
    }

    if (searchListenerState.searchTimeout) {
      clearTimeout(searchListenerState.searchTimeout);
    }

    observer.disconnect();
    console.log("Loan Filter Script cleaned up");
  };

  // Listen for changes to storedNumbersSet
  const originalSetStoredNumbers = window.setStoredNumbersSet;
  window.setStoredNumbersSet = function (newSet) {
    if (typeof originalSetStoredNumbers === "function") {
      originalSetStoredNumbers(newSet);
    } else {
      window.storedNumbersSet = newSet;
    }
    // Re-process the page when storedNumbersSet changes
    processPage();
  };

  // Track search listener state
  const searchListenerState = {
    lastSetup: 0,
    searchTimeout: null,
    setupCount: 0,
  };

  // Add listeners for search button clicks and form submissions
  function setupSearchListeners() {
    // Don't set up listeners too frequently
    const now = Date.now();
    if (
      now - searchListenerState.lastSetup < 5000 &&
      searchListenerState.setupCount > 0
    ) {
      return;
    }

    searchListenerState.lastSetup = now;
    searchListenerState.setupCount++;

    logThrottle.log(
      "setupListeners",
      `Setting up search listeners (count: ${searchListenerState.setupCount})`
    );

    // Listen for search button clicks
    const searchButtons = document.querySelectorAll(
      '#searchButton, button[type="submit"], button.btn-primary'
    );
    searchButtons.forEach((button) => {
      if (button._hasSearchListener) return; // Avoid duplicate listeners

      button._hasSearchListener = true;
      button.addEventListener("click", () => {
        logThrottle.log("buttonClick", "Search button clicked");

        // Clear any existing timeout
        if (searchListenerState.searchTimeout) {
          clearTimeout(searchListenerState.searchTimeout);
        }

        // Wait for the search results to load
        searchListenerState.searchTimeout = setTimeout(() => {
          handleSingleRestrictedLoanSearch();
        }, 800);
      });
    });

    // Listen for form submissions
    const searchForms = document.querySelectorAll(
      '#borrowerSearchForm, form[name="searchForm"]'
    );
    searchForms.forEach((form) => {
      if (form._hasSubmitListener) return; // Avoid duplicate listeners

      form._hasSubmitListener = true;
      form.addEventListener("submit", (e) => {
        logThrottle.log("formSubmit", "Search form submitted");

        // Clear any existing timeout
        if (searchListenerState.searchTimeout) {
          clearTimeout(searchListenerState.searchTimeout);
        }

        // Wait for the search results to load
        searchListenerState.searchTimeout = setTimeout(() => {
          handleSingleRestrictedLoanSearch();
        }, 800);
      });
    });

    // Also listen for input changes on search fields
    const searchFields = document.querySelectorAll(
      "#loanNumber, #userName, #firstName, #lastName, #email, #phone, #propertyAddress, #ssn"
    );
    searchFields.forEach((field) => {
      if (field._hasChangeListener) return; // Avoid duplicate listeners

      field._hasChangeListener = true;
      field.addEventListener("change", () => {
        if (field.value.trim() !== "") {
          logThrottle.log("fieldChange", `Search field changed: ${field.id}`);

          // Clear any existing timeout
          if (searchListenerState.searchTimeout) {
            clearTimeout(searchListenerState.searchTimeout);
          }

          // If Enter was pressed or field lost focus with a value
          searchListenerState.searchTimeout = setTimeout(() => {
            handleSingleRestrictedLoanSearch();
          }, 800);
        }
      });
    });
    
    // Listen for secure message loan dropdown changes
    const loanPropertySelect = document.getElementById('loanPropertySelect');
    if (loanPropertySelect && !loanPropertySelect._hasChangeListener) {
      loanPropertySelect._hasChangeListener = true;
      
      // Process the dropdown when it's populated
      const observer = new MutationObserver((mutations) => {
        let shouldProcess = false;
        
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Options were added to the dropdown
            shouldProcess = true;
          }
        });
        
        if (shouldProcess) {
          // Use setTimeout to ensure we process after all mutations are complete
          setTimeout(() => {
            processSecureMessageDropdownFunc();
          }, 0);
        }
      });
      
      // Observe changes to the dropdown options and attributes
      observer.observe(loanPropertySelect, { 
        childList: true,
        attributes: true,
        subtree: true
      });
      
      // Process the dropdown immediately if it already has options
      if (loanPropertySelect.options.length > 1) {
        processSecureMessageDropdown();
      }
      
      // Also listen for the refresh button
      const refreshLoansBtn = document.getElementById('refreshLoansBtn');
      if (refreshLoansBtn && !refreshLoansBtn._hasClickListener) {
        refreshLoansBtn._hasClickListener = true;
        
        // Store the original click event handler
        const originalClickHandlers = [];
        const originalAddEventListener = refreshLoansBtn.addEventListener;
        
        // Override addEventListener to capture any click handlers
        refreshLoansBtn.addEventListener = function(type, listener, options) {
          if (type === 'click') {
            originalClickHandlers.push(listener);
          }
          return originalAddEventListener.call(this, type, listener, options);
        };
        
        // Add our own click handler that runs after the original
        refreshLoansBtn.addEventListener('click', () => {
          // Process the dropdown after a short delay to allow for the refresh to complete
          setTimeout(() => {
            console.log("Refresh button clicked - applying loan filter");
            processSecureMessageDropdownFunc();
            
            // Process again after a longer delay to catch any async updates
            setTimeout(processSecureMessageDropdownFunc, 500);
            setTimeout(processSecureMessageDropdownFunc, 1000);
          }, 100);
        });
      }
    }
  }

  // Initial setup of search listeners
  setupSearchListeners();
  
  // Make the function globally accessible
  window.processSecureMessageDropdown = processSecureMessageDropdownFunc;
  
  // Set up a more aggressive monitoring for the loan dropdown
  const monitorLoanDropdown = () => {
    const loanDropdown = document.getElementById('loanPropertySelect');
    if (loanDropdown) {
      // Check if the dropdown has options and needs filtering
      if (loanDropdown.options.length > 1) {
        processSecureMessageDropdownFunc();
      }
      
      // Also monitor for DOM changes that might affect the dropdown
      if (!window._loanDropdownObserver) {
        window._loanDropdownObserver = new MutationObserver((mutations) => {
          // Look for changes to the dropdown or its container
          const shouldProcess = mutations.some(mutation => {
            // Check if the dropdown itself was modified
            if (mutation.target === loanDropdown) return true;
            
            // Check if options were added
            if (mutation.addedNodes && mutation.addedNodes.length) {
              for (let i = 0; i < mutation.addedNodes.length; i++) {
                const node = mutation.addedNodes[i];
                if (node.tagName === 'OPTION' && node.parentNode === loanDropdown) {
                  return true;
                }
              }
            }
            
            return false;
          });
          
          if (shouldProcess) {
            processSecureMessageDropdownFunc();
          }
        });
        
        // Observe the dropdown and its parent
        window._loanDropdownObserver.observe(document.body, { 
          childList: true,
          subtree: true,
          attributes: true
        });
        
        console.log("Set up global loan dropdown observer");
      }
    }
  };
  
  // Process immediately and set up monitoring
  setTimeout(monitorLoanDropdown, 500);
  setTimeout(monitorLoanDropdown, 1000);
  setTimeout(monitorLoanDropdown, 2000);
  
  // Also try to trigger a repopulation of the dropdown
  setTimeout(() => {
    const refreshLoansBtn = document.getElementById('refreshLoansBtn');
    if (refreshLoansBtn) {
      try {
        refreshLoansBtn.click();
        // Process again after refresh
        setTimeout(monitorLoanDropdown, 500);
      } catch (e) {
        console.error("Error clicking refresh button:", e);
      }
    }
  }, 1500);

  // Re-setup listeners when DOM changes (for dynamically added elements)
  // but not too frequently
  const listenerIntervalId = setInterval(() => {
    if (Date.now() - searchListenerState.lastSetup > 5000) {
      setupSearchListeners();
    }
    
    // Also periodically check the loan dropdown
    monitorLoanDropdown();
  }, 2000);

  console.log("Loan Filter Script complete");
})();
