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

  let processSecureMessageDropdownFunc;
  const FILTER_INTERVAL_MS = 2000;
  const EXTENSION_ID = "afkpnpkodeiolpnfnbdokgkclljpgmcm";
  const processedElements = new WeakSet();
  const processedBrands = new WeakSet();

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

  function createUnallowedElement() {
    const unallowed = document.createElement("span");
    unallowed.appendChild(
      document.createTextNode("Loan is not provisioned to the user")
    );
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
    const loanNumberCell = viewElement.querySelector(
      "table tr td a.bright-green.ng-binding"
    );
    return loanNumberCell && loanNumberCell.textContent.trim();
  }

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

  const allowedLoansCache = {
    loans: new Set(),
    lastUpdated: 0,
    cacheTimeout: 5 * 60 * 1000,

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

  async function isLoanNumberAllowed(loanNumber) {
    try {
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
      console.warn("Failed to check loan access, assuming not allowed");
      return false;
    }
  }

  function extractBrandsData() {
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

  function containsLoanNumber(text) {
    return /\b\d{5,}\b/.test(text) || /\b[A-Z0-9]{5,}\b/.test(text);
  }

  function extractLoanNumbers(text) {
    const matches = [];
    const digitMatches = text.match(/\b\d{5,}\b/g);
    const alphaNumMatches = text.match(/\b[A-Z0-9]{5,}\b/g);

    if (digitMatches) matches.push(...digitMatches);
    if (alphaNumMatches) matches.push(...alphaNumMatches);

    return [...new Set(matches)];
  }

  async function shouldHideElement(element) {
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

    // Filter brand containers
    const brandContainers = document.querySelectorAll(
      '[data-brand], [class*="brand-"], [id*="brand-"]'
    );
    for (const container of brandContainers) {
      if (processedBrands.has(container)) continue;
      processedBrands.add(container);

      let brandCode = container.dataset.brand;
      if (!brandCode) {
        const text = container.innerText || container.textContent || "";
        const codeMatch = text.match(/\b([A-Z0-9]{2,})\b/);
        if (codeMatch) brandCode = codeMatch[1];
      }

      if (!brandCode) continue;

      const brand = brandsData.find((b) => b.code === brandCode);
      if (brand && !(await brandHasAllowedLoans(brand.loanNumbers))) {
        container.style.display = "none";
      }
    }
  }

  const loanMessageState = {
    lastProcessed: 0,
    lastLoanNumber: null,
    messageDisplayed: false,
    processingInProgress: false,
  };

  const processedLoanDropdowns = new WeakSet();

  processSecureMessageDropdownFunc = async function () {
    const loanDropdown = document.getElementById("loanPropertySelect");
    if (!loanDropdown) return;

    // Create a new select element to replace the existing one
    const newDropdown = document.createElement("select");
    newDropdown.id = loanDropdown.id;
    newDropdown.className = loanDropdown.className;
    newDropdown.required = loanDropdown.required;

    // Copy the first option (placeholder)
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
        // Clone the option to the new dropdown
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
  };

  async function handleSingleRestrictedLoanSearch() {
    if (loanMessageState.processingInProgress) return;

    const now = Date.now();
    if (now - loanMessageState.lastProcessed < 1000) return;

    loanMessageState.processingInProgress = true;
    loanMessageState.lastProcessed = now;

    try {
      // First, check if we already have a message displayed
      const existingMessage = document.getElementById(
        "loan-not-provisioned-message"
      );
      if (existingMessage && loanMessageState.messageDisplayed) return;

      if (existingMessage) {
        existingMessage.remove();
        loanMessageState.messageDisplayed = false;
      }

      // Check if we're on a search results page
      const searchForm = document.querySelector(
        '#borrowerSearchForm, form[name="searchForm"]'
      );
      if (!searchForm) return;

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
          break;
        }
      }

      if (!hasSearchCriteria) return;

      // Check if there's exactly one result in the table
      const tableBody = document.querySelector(
        "#borrowersTable tbody, table.results-table tbody"
      );
      if (!tableBody) return;

      // Get all rows before any filtering
      const allRows = Array.from(tableBody.querySelectorAll("tr"));
      if (allRows.length !== 1) return;

      const row = allRows[0];

      // Extract loan number from the row
      const loanNumberCell = row.querySelector("td:nth-child(4)");
      if (!loanNumberCell) return;

      const loanNumber = loanNumberCell.textContent.trim();

      // If we already processed this loan number, don't do it again
      if (
        loanNumber === loanMessageState.lastLoanNumber &&
        loanMessageState.messageDisplayed
      ) {
        return;
      }

      loanMessageState.lastLoanNumber = loanNumber;

      // Check if this loan number is restricted
      const isAllowed = await isLoanNumberAllowed(loanNumber);

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
          table.parentNode.insertBefore(messageContainer, table);
        } else if (cardBody) {
          cardBody.insertBefore(messageContainer, cardBody.firstChild);
        } else if (searchContainer) {
          searchContainer.appendChild(messageContainer);
        } else {
          searchForm.parentNode.insertBefore(
            messageContainer,
            searchForm.nextSibling
          );
        }

        loanMessageState.messageDisplayed = true;
      }
    } finally {
      loanMessageState.processingInProgress = false;
    }
  }

  async function processPage() {
    // Keep the page hidden during processing
    pageUtils.showPage(false);

    try {
      await processTableRows();
      await processGenericElements();
      await processBrandElements();
      await handleSingleRestrictedLoanSearch();
    } finally {
      // Show the page after processing is complete
      pageUtils.showPage(true);
    }
  }

  const observerState = {
    lastProcessed: 0,
    processingDebounce: null,
    ignoreNextMutations: false,
  };

  function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      if (observerState.ignoreNextMutations) {
        observerState.ignoreNextMutations = false;
        return;
      }

      if (observerState.processingDebounce) {
        clearTimeout(observerState.processingDebounce);
      }

      const now = Date.now();
      if (now - observerState.lastProcessed < 500) return;

      let shouldProcess = false;
      let searchFormChanged = false;
      let tableChanged = false;
      let messageRelated = false;

      for (const mutation of mutations) {
        if (
          mutation.target.id === "loan-not-provisioned-message" ||
          mutation.target.closest?.("#loan-not-provisioned-message")
        ) {
          messageRelated = true;
          continue;
        }

        if (mutation.addedNodes.length > 0) {
          let hasElementNodes = false;
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              hasElementNodes = true;
              break;
            }
          }

          if (hasElementNodes) {
            shouldProcess = true;

            for (const node of mutation.addedNodes) {
              if (
                node.nodeName === "TR" ||
                (node.nodeType === 1 && node.querySelector?.("tr"))
              ) {
                tableChanged = true;
                break;
              }
            }

            if (
              mutation.target.closest?.(
                '#borrowerSearchForm, form[name="searchForm"], #borrowersTable, table.results-table, .card-body'
              )
            ) {
              searchFormChanged = true;
            }
          }
        }

        if (mutation.type === "attributes") {
          if (
            (mutation.target.tagName === "INPUT" ||
              mutation.target.tagName === "SELECT") &&
            mutation.target.closest?.(
              '#borrowerSearchForm, form[name="searchForm"]'
            )
          ) {
            searchFormChanged = true;
          }

          if (
            mutation.attributeName === "style" &&
            (mutation.target.tagName === "TR" ||
              mutation.target.tagName === "TD")
          ) {
            tableChanged = true;
          }
        }
      }

      if (
        messageRelated &&
        !shouldProcess &&
        !searchFormChanged &&
        !tableChanged
      ) {
        return;
      }

      observerState.processingDebounce = setTimeout(() => {
        observerState.lastProcessed = Date.now();
        observerState.ignoreNextMutations = true;

        if (shouldProcess) {
          processPage();
        } else if (tableChanged) {
          handleSingleRestrictedLoanSearch();
        } else if (searchFormChanged) {
          handleSingleRestrictedLoanSearch();
        }
      }, 300);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["value", "style", "class", "display"],
    });

    return observer;
  }

  const intervalState = {
    lastProcessed: Date.now(),
    processCount: 0,
  };

  // Initialize the extension connection first
  async function initialize() {
    try {
      // Wait for the extension listener to be available
      const listenerAvailable = await waitForListener();

      if (listenerAvailable) {
        console.log("✅ Extension listener connected successfully");

        // Process page will handle showing the page after filtering
        await processPage();

        // Check for single restricted loan case after a short delay
        setTimeout(handleSingleRestrictedLoanSearch, 1000);

        // Set up interval for periodic processing
        const intervalId = setInterval(() => {
          const now = Date.now();
          if (now - intervalState.lastProcessed >= FILTER_INTERVAL_MS) {
            intervalState.lastProcessed = now;
            intervalState.processCount++;
            processPage();
          }
        }, FILTER_INTERVAL_MS);

        // Set up mutation observer for dynamic content
        const observer = initMutationObserver();

        return { success: true, intervalId, observer };
      } else {
        console.warn(
          "⚠️ Extension listener not available, running in limited mode"
        );
        // Show the page if extension is not available
        pageUtils.showPage(true);
        return { success: false };
      }
    } catch (error) {
      console.error("❌ Failed to initialize extension connection:", error);
      // Show the page if there's an error
      pageUtils.showPage(true);
      return { success: false, error };
    }
  }

  // Start the initialization process
  const initPromise = initialize();

  // Safety timeout to ensure page is shown even if there's an unexpected issue
  const safetyTimeout = setTimeout(() => {
    console.warn("Safety timeout triggered - ensuring page is visible");
    pageUtils.showPage(true);
  }, 10000); // 10 seconds max wait time

  // Clear the safety timeout once initialization is complete
  initPromise
    .then(() => {
      clearTimeout(safetyTimeout);
    })
    .catch(() => {
      clearTimeout(safetyTimeout);
      pageUtils.showPage(true);
    });

  // Ensure page is visible if user navigates away
  window.addEventListener("beforeunload", () => {
    pageUtils.showPage(true);
  });

  // Search listener state
  const searchListenerState = {
    lastSetup: 0,
    searchTimeout: null,
    setupCount: 0,
  };

  function setupSearchListeners() {
    const now = Date.now();
    if (
      now - searchListenerState.lastSetup < 5000 &&
      searchListenerState.setupCount > 0
    ) {
      return;
    }

    searchListenerState.lastSetup = now;
    searchListenerState.setupCount++;

    // Listen for search button clicks
    const searchButtons = document.querySelectorAll(
      '#searchButton, button[type="submit"], button.btn-primary'
    );
    searchButtons.forEach((button) => {
      if (button._hasSearchListener) return;

      button._hasSearchListener = true;
      button.addEventListener("click", () => {
        if (searchListenerState.searchTimeout) {
          clearTimeout(searchListenerState.searchTimeout);
        }
        searchListenerState.searchTimeout = setTimeout(
          handleSingleRestrictedLoanSearch,
          800
        );
      });
    });

    // Listen for form submissions
    const searchForms = document.querySelectorAll(
      '#borrowerSearchForm, form[name="searchForm"]'
    );
    searchForms.forEach((form) => {
      if (form._hasSubmitListener) return;

      form._hasSubmitListener = true;
      form.addEventListener("submit", () => {
        if (searchListenerState.searchTimeout) {
          clearTimeout(searchListenerState.searchTimeout);
        }
        searchListenerState.searchTimeout = setTimeout(
          handleSingleRestrictedLoanSearch,
          800
        );
      });
    });

    // Listen for input changes on search fields
    const searchFields = document.querySelectorAll(
      "#loanNumber, #userName, #firstName, #lastName, #email, #phone, #propertyAddress, #ssn"
    );
    searchFields.forEach((field) => {
      if (field._hasChangeListener) return;

      field._hasChangeListener = true;
      field.addEventListener("change", () => {
        if (field.value.trim() !== "") {
          if (searchListenerState.searchTimeout) {
            clearTimeout(searchListenerState.searchTimeout);
          }
          searchListenerState.searchTimeout = setTimeout(
            handleSingleRestrictedLoanSearch,
            800
          );
        }
      });
    });

    // Listen for secure message loan dropdown changes
    const loanPropertySelect = document.getElementById("loanPropertySelect");
    if (loanPropertySelect && !loanPropertySelect._hasChangeListener) {
      loanPropertySelect._hasChangeListener = true;

      // Process the dropdown when it's populated
      const observer = new MutationObserver((mutations) => {
        let shouldProcess = false;
        for (const mutation of mutations) {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            shouldProcess = true;
            break;
          }
        }

        if (shouldProcess) {
          setTimeout(processSecureMessageDropdownFunc, 0);
        }
      });

      observer.observe(loanPropertySelect, {
        childList: true,
        attributes: true,
        subtree: true,
      });

      // Process the dropdown immediately if it already has options
      if (loanPropertySelect.options.length > 1) {
        processSecureMessageDropdownFunc();
      }

      const refreshLoansBtn = document.getElementById("refreshLoansBtn");
      if (refreshLoansBtn && !refreshLoansBtn._hasClickListener) {
        refreshLoansBtn._hasClickListener = true;
        refreshLoansBtn.addEventListener("click", () => {
          setTimeout(processSecureMessageDropdownFunc, 100);
        });
      }
    }
  }

  // Initial setup of search listeners
  setupSearchListeners();

  // Make the function globally accessible
  window.processSecureMessageDropdown = processSecureMessageDropdownFunc;

  // Monitor loan dropdown
  function monitorLoanDropdown() {
    const loanDropdown = document.getElementById("loanPropertySelect");
    if (loanDropdown) {
      if (loanDropdown.options.length > 1) {
        processSecureMessageDropdownFunc();
      }

      if (!window._loanDropdownObserver) {
        window._loanDropdownObserver = new MutationObserver((mutations) => {
          const shouldProcess = mutations.some((mutation) => {
            if (mutation.target === loanDropdown) return true;

            if (mutation.addedNodes && mutation.addedNodes.length) {
              for (let i = 0; i < mutation.addedNodes.length; i++) {
                const node = mutation.addedNodes[i];
                if (
                  node.tagName === "OPTION" &&
                  node.parentNode === loanDropdown
                ) {
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

        window._loanDropdownObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }
    }
  }

  // Set up monitoring after initialization
  let listenerIntervalId;

  initPromise
    .then((initResult) => {
      if (initResult && initResult.success) {
        // Initial monitoring setup
        setTimeout(monitorLoanDropdown, 500);

        // Re-setup listeners periodically
        listenerIntervalId = setInterval(() => {
          if (Date.now() - searchListenerState.lastSetup > 5000) {
            setupSearchListeners();
          }
          monitorLoanDropdown();
        }, 2000);
      } else {
        console.warn(
          "Loan dropdown monitoring not set up due to initialization failure"
        );
      }
    })
    .catch((error) => {
      console.error("Failed to set up loan dropdown monitoring:", error);
    });

  initPromise
    .then((initResult) => {
      if (initResult && initResult.success) {
        onValueChange(
          () => document.location.href,
          async (newVal) => {
            // Hide the page during navigation
            pageUtils.showPage(false);

            if (!newVal.includes("#/bidApproveReject")) {
              // For other pages, process normally and show the page after
              processPage();
              return;
            }

            const viewElement = await waitForLoanNumber();
            viewElement.remove();

            async function addIfAllowed() {
              const loanNumber = getLoanNumber(viewElement.element);
              const allowedNumbers = await checkNumbersBatch([loanNumber]);
              if (allowedNumbers.includes(loanNumber)) {
                viewElement.add();
              }
              // Show the page after processing
              pageUtils.showPage(true);
            }

            try {
              await addIfAllowed();
            } catch (error) {
              console.error("Error checking loan access:", error);
              // Show the page even if there's an error
              pageUtils.showPage(true);
            }
          }
        );
      } else {
        console.warn(
          "URL change detection not set up due to initialization failure"
        );
      }
    })
    .catch((error) => {
      console.error("Failed to set up URL change detection:", error);
    });

  window.__cleanupLoanFilter = function () {
    // Ensure page is visible when cleaning up
    pageUtils.showPage(true);

    initPromise
      .then((initResult) => {
        if (initResult && initResult.success) {
          if (initResult.intervalId) {
            clearInterval(initResult.intervalId);
          }

          if (initResult.observer) {
            initResult.observer.disconnect();
          }
        }

        clearInterval(listenerIntervalId);

        if (observerState.processingDebounce) {
          clearTimeout(observerState.processingDebounce);
        }

        if (searchListenerState.searchTimeout) {
          clearTimeout(searchListenerState.searchTimeout);
        }

        console.log("Loan Filter Script cleaned up");
      })
      .catch((error) => {
        console.error("Error during cleanup:", error);
      });
  };
})();