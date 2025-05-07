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

  const FILTER_INTERVAL_MS = 2000;
  const EXTENSION_ID = "afkpnpkodeiolpnfnbdokgkclljpgmcm";

  const processedElements = new WeakSet();
  const processedBrands = new WeakSet();
  const processedLoanDropdowns = new WeakSet();

  const DEBUG = {
    enabled: false,
    log: function (message, ...args) {
      if (this.enabled) {
        console.log(`[LoanFilter] ${message}`, ...args);
      }
    },
    warn: function (message, ...args) {
      if (this.enabled) {
        console.warn(`[LoanFilter] ${message}`, ...args);
      }
    },
    error: function (message, ...args) {
      console.error(`[LoanFilter] ${message}`, ...args);
    },
  };

  // Add throttling for frequent operations
  const throttle = {
    timers: new Map(),
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
   * Check a batch of loan numbers against the extension
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

  /**
   * Utility function to watch for value changes
   */
  function onValueChange(evalFunction, callback, options = {}) {
    let lastValue = undefined;
    const startTime = Date.now();
    const endTime = options.maxTime ? startTime + options.maxTime : null;
    const intervalId = setInterval(async () => {
      const currentTime = Date.now();
      if (endTime && currentTime > endTime) {
        clearInterval(intervalId);
        return;
      }
      let newValue = await evalFunction();
      if (newValue === "") newValue = null;

      if (lastValue === newValue) return;
      lastValue = newValue;

      await callback(newValue, lastValue);
    }, 500);
    return intervalId;
  }

  /**
   * Cache for allowed loans to improve performance
   */
  const allowedLoansCache = {
    loans: new Set(),
    lastUpdated: 0,
    cacheTimeout: 5 * 60 * 1000, // 5 minutes

    isAllowed(loanNumber) {
      return this.loans.has(loanNumber);
    },

    addLoans(loanNumbers) {
      loanNumbers.forEach((loan) => this.loans.add(loan));
      this.lastUpdated = Date.now();
    },

    isCacheValid() {
      return (
        this.lastUpdated > 0 &&
        Date.now() - this.lastUpdated < this.cacheTimeout
      );
    },

    clear() {
      this.loans.clear();
      this.lastUpdated = 0;
    },
  };

  /**
   * Checks if a loan number is allowed for the current user
   */
  async function isLoanNumberAllowed(loanNumber) {
    try {
      if (!loanNumber) return false;

      loanNumber = String(loanNumber).trim();

      if (
        allowedLoansCache.isCacheValid() &&
        allowedLoansCache.isAllowed(loanNumber)
      ) {
        return true;
      }

      const allowedNumbers = await checkNumbersBatch([loanNumber]);
      allowedLoansCache.addLoans(allowedNumbers);

      return allowedNumbers.includes(loanNumber);
    } catch (error) {
      console.warn("Failed to check loan access, assuming not allowed:", error);
      return false;
    }
  }

  /**
   * Creates the "Loan is not provisioned" message element
   */
  function createNotProvisionedElement() {
    const element = document.createElement("span");
    element.appendChild(
      document.createTextNode("Loan is not provisioned to the user")
    );
    element.className = "body";
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
   * Handles the loan detail view element
   */
  class ViewElement {
    constructor() {
      this.element = document.querySelector(".col-md-12 .body");
      this.parent = this.element && this.element.parentElement;
      this.unallowed = createNotProvisionedElement();
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

  /**
   * Extracts loan number from view element
   */
  function getLoanNumber(viewElement) {
    const loanNumberCell = viewElement.querySelector(
      "table tr td a.bright-green.ng-binding"
    );
    return loanNumberCell && loanNumberCell.textContent.trim();
  }

  /**
   * Waits for loan number to appear in the DOM
   */
  function waitForLoanNumber() {
    return new Promise((resolve) => {
      const observer = new MutationObserver((mutationsList, observer) => {
        const viewElement = new ViewElement();
        if (viewElement.element) {
          const loanNumber = getLoanNumber(viewElement.element);
          if (loanNumber) {
            observer.disconnect();
            resolve(viewElement);
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }

  /**
   * Extracts loan numbers from text content
   */
  function extractLoanNumbers(text) {
    if (!text) return [];

    text = String(text).trim();

    const matches = [];
    const digitMatches = text.match(/\b\d{5,}\b/g);
    const alphaNumMatches = text.match(/\b[A-Z0-9]{5,}\b/g);

    if (digitMatches) matches.push(...digitMatches);
    if (alphaNumMatches) matches.push(...alphaNumMatches);

    return [...new Set(matches)];
  }

  /**
   * Quick check if text contains a potential loan number
   */
  function containsLoanNumber(text) {
    return /\b\d{5,}\b/.test(text) || /\b[A-Z0-9]{5,}\b/.test(text);
  }

  /**
   * Determines if an element should be hidden based on loan numbers
   */
  async function shouldHideElement(element) {
    // Skip certain element types
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

    for (const loanNumber of potentialLoanNumbers) {
      if (await isLoanNumberAllowed(loanNumber)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Process table rows to hide those with restricted loan numbers
   */
  async function processTableRows() {
    const rows = document.querySelectorAll("tr");

    for (const row of rows) {
      if (processedElements.has(row)) continue;
      processedElements.add(row);

      if (await shouldHideElement(row)) {
        row.style.display = "none";
      }
    }
  }

  /**
   * Process generic elements that might contain loan numbers
   */
  async function processGenericElements() {
    const potentialContainers = document.querySelectorAll(
      '.borrower-row, .loan-item, .card, .list-item, div[class*="loan"], div[class*="borrower"]'
    );

    for (const container of potentialContainers) {
      if (processedElements.has(container)) continue;
      processedElements.add(container);

      if (await shouldHideElement(container)) {
        container.style.display = "none";
      }
    }
  }

  /**
   * Extracts brand code from text content
   */
  function extractBrandCode(text) {
    if (!text) return null;

    text = String(text).trim();

    const parenthesesMatch = text.match(/\(([A-Z0-9]{2,4})\)$/);
    if (parenthesesMatch) {
      return parenthesesMatch[1];
    }

    const standaloneMatch = text.match(/\b([A-Z0-9]{2,4})\b/);
    if (standaloneMatch) {
      return standaloneMatch[1];
    }

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

        if (filterJustApplied) {
          DEBUG.log(
            "Filter was applied but no results container found - showing message"
          );
          showNotProvisionedAlert("filtered");
        }

        return;
      }

      resultRows = resultsContainer.querySelectorAll(
        "tbody tr:not(.header-row):not(.mat-header-row)"
      );

      DEBUG.log(`Found ${resultRows.length} result rows`);

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

        if (hasSearchCriteria && resultRows.length === 1) {
          const resultRow = resultRows[0];
          const rowText = resultRow.textContent || "";
          const loanNumbers = extractLoanNumbers(rowText);

          if (loanNumbers.length > 0) {
            DEBUG.log(`Found loan numbers in row: ${loanNumbers.join(", ")}`);

            // Check if any of these loan numbers are allowed
            let anyAllowed = false;

            for (const loanNumber of loanNumbers) {
              if (await isLoanNumberAllowed(loanNumber)) {
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
              return;
            }
          }
        }
      }
    } catch (error) {
      DEBUG.error("Error in handleSearchResults:", error);
      return;
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

    // If filter was just applied and there are no visible rows, show the message
    if (filterJustApplied && visibleRows.length === 0) {
      DEBUG.log("Filter was applied and no visible rows - showing message");
      showNotProvisionedAlert("filtered");
      return;
    }

    // Check if the table is empty (no rows at all)
    if (resultRows.length === 0 && filterJustApplied) {
      DEBUG.log("No rows found after filter was applied - showing message");
      showNotProvisionedAlert("filtered");
      return;
    }
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

        // Set flag that filter was just applied
        window._filterJustApplied = true;

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

          // Set flag that filter was just applied
          window._filterJustApplied = true;

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

        // Set flag that filter was just applied
        window._filterJustApplied = true;

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

        window._filterJustApplied = true;

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

      if (!hasListener) {
        // Show the page if extension is not available
        pageUtils.showPage(true);
        clearTimeout(safetyTimeout);
        return;
      }

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
