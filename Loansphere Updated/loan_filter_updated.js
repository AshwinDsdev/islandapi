﻿/*!
 * @description : Loansphere Loan Filter Script
 * @portal : Loansphere
 * @author : Loansphere Team
 * @group : Accelirate Team
 * @owner : Loansphere
 * @lastModified : 15-May-2024
 */

// ########## DO NOT MODIFY THESE LINES ##########
const EXTENSION_ID = "afkpnpkodeiolpnfnbdokgkclljpgmcm";

/**
 * Establish Communication with Loan Checker Extension
 */
async function waitForListener(maxRetries = 20, initialDelay = 100) {
  return new Promise((resolve, reject) => {
    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      !chrome.runtime.sendMessage
    ) {
      console.warn(
        "âŒ Chrome extension API not available. Running in standalone mode."
      );
      // Show the page if Chrome extension API is not available
      document.body.style.opacity = 1;
      resolve(false);
      return;
    }

    let attempts = 0;
    let delay = initialDelay;
    let timeoutId;

    function sendPing() {
      if (attempts >= maxRetries) {
        console.warn("âŒ No listener detected after maximum retries.");
        clearTimeout(timeoutId);
        reject(new Error("Listener not found"));
        return;
      }

      try {
        chrome.runtime.sendMessage(
          EXTENSION_ID,
          {
            type: "ping",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn("Chrome extension error:", chrome.runtime.lastError);
              attempts++;
              if (attempts >= maxRetries) {
                reject(new Error("Chrome extension error"));
                return;
              }
              timeoutId = setTimeout(sendPing, delay);
              return;
            }

            if (response?.result === "pong") {
              console.warn("âœ… Listener detected!");
              clearTimeout(timeoutId);
              resolve(true);
            } else {
              timeoutId = setTimeout(() => {
                attempts++;
                delay *= 2; // Exponential backoff (100ms â†’ 200ms â†’ 400ms...)
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
 * Request a batch of numbers from the storage script
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
 * Page utility functions for managing page visibility
 */
const pageUtils = {
  /**
   * @function togglePageOpacity
   * @description Sets the page opacity. It can be used to show and hide the page content.
   * @param {number} val - The value in-between 0 and 1.
   */
  togglePageOpacity: function (val) {
    document.body.style.opacity = val;
  },

  /**
   * @function showPage
   * @description Shows or hides the page.
   * @param {boolean} val - The value can be true or false.
   */
  showPage: function (val) {
    document.body.style.opacity = val ? 1 : 0;
  },

  /**
   * @function togglePageDisplay
   * @description Sets the page display. It can be used to show and hide the page content.
   * @param {string} val - The value can be 'block' or 'none'.
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
};

/**
 * @constant {number} FILTER_INTERVAL_MS
 * @description Interval in milliseconds for periodic filtering
 */
const FILTER_INTERVAL_MS = 2000;

/**
 * @constant {WeakSet} processedElements
 * @description Set to track elements that have already been processed
 */
const processedElements = new WeakSet();

// Brand-related code has been removed

/**
 * @function onValueChange
 * @description Sets up an interval to monitor changes to a value and triggers a callback when changes are detected
 * @param {Function} evalFunction - Function that returns the value to monitor
 * @param {Function} callback - Function to call when the value changes
 * @param {Object} [options={}] - Options for the monitoring
 * @param {number} [options.maxTime] - Maximum time in milliseconds to monitor for changes
 * @returns {number} Interval ID that can be used to clear the interval
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
 * Create unallowed element to show when loan is not allowed for users.
 */
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

/**
 * Create loader to show when trying to establish connection with extension
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
 * To create Loader Element.
 */
function createLoaderElement() {
  const loader = document.createElement("div");
  loader.id = "loaderOverlay";
  loader.innerHTML = `<div class="spinner"></div>`;
  return loader;
}

/**
 * @class ViewElement
 * @description Class to manage the visibility of loan information elements
 */
class ViewElement {
  /**
   * @constructor
   * @description Creates a new ViewElement instance
   */
  constructor() {
    this.element = document.querySelector(".col-md-12 .body");
    this.parent = this.element && this.element.parentElement;
    this.unallowed = createUnallowedElement();
    this.unallowedParent = document.querySelector("nav");
  }

  /**
   * @method remove
   * @description Removes the loan element and shows the unallowed message
   */
  remove() {
    if (this.element) {
      this.element.remove();
      this.unallowedParent.appendChild(this.unallowed);
    }
  }

  /**
   * @method add
   * @description Adds the loan element back and removes the unallowed message
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
 * @description Extracts the loan number from a view element
 * @param {HTMLElement} viewElement - The element containing the loan number
 * @returns {string|null} The loan number if found, null otherwise
 */
function getLoanNumber(viewElement) {
  const loanNumberCell = viewElement.querySelector(
    "table tr td a.bright-green.ng-binding"
  );
  return loanNumberCell && loanNumberCell.textContent.trim();
}

/**
 * @async
 * @function waitForLoanNumber
 * @description Waits for a loan number to appear in the DOM
 * @returns {Promise<ViewElement>} Promise that resolves to a ViewElement when a loan number is found
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
 * @constant {Object} allowedLoansCache
 * @description Cache for storing allowed loan numbers to reduce API calls
 */
const allowedLoansCache = {
  /**
   * @property {Set} loans
   * @description Set of allowed loan numbers
   */
  loans: new Set(),

  /**
   * @property {number} lastUpdated
   * @description Timestamp of the last cache update
   */
  lastUpdated: 0,

  /**
   * @property {number} cacheTimeout
   * @description Cache timeout in milliseconds (5 minutes)
   */
  cacheTimeout: 5 * 60 * 1000,

  /**
   * @method isAllowed
   * @description Checks if a loan number is in the cache
   * @param {string} loanNumber - The loan number to check
   * @returns {boolean} True if the loan number is allowed, false otherwise
   */
  isAllowed(loanNumber) {
    return this.loans.has(loanNumber);
  },

  /**
   * @method addLoans
   * @description Adds loan numbers to the cache
   * @param {string[]} loanNumbers - Array of loan numbers to add
   */
  addLoans(loanNumbers) {
    loanNumbers.forEach((loan) => this.loans.add(loan));
    this.lastUpdated = Date.now();
  },

  /**
   * @method isCacheValid
   * @description Checks if the cache is still valid
   * @returns {boolean} True if the cache is valid, false otherwise
   */
  isCacheValid() {
    return (
      this.lastUpdated > 0 && Date.now() - this.lastUpdated < this.cacheTimeout
    );
  },

  /**
   * @method clear
   * @description Clears the cache
   */
  clear() {
    this.loans.clear();
    this.lastUpdated = 0;
  },
};

/**
 * @async
 * @function isLoanNumberAllowed
 * @description Checks if a loan number is allowed for the current user
 * @param {string} loanNumber - The loan number to check
 * @returns {Promise<boolean>} Promise that resolves to true if the loan number is allowed, false otherwise
 */
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

// Brand-related functions have been removed

// Note: Navigation disabling functions have been removed as they're not required for this filter

/**
 * @constant {Object} loanMessageState
 * @description State for tracking loan message display
 */
const loanMessageState = {
  processingInProgress: false,
  lastProcessed: 0,
  messageDisplayed: false,
  lastLoanNumber: null,
};

/**
 * @async
 * @function handleSingleRestrictedLoanSearch
 * @description Handles the case when there's exactly one row in the search results
 * @returns {Promise<void>}
 */
async function handleSingleRestrictedLoanSearch() {
  if (loanMessageState.processingInProgress) {
    return;
  }

  const now = Date.now();
  if (now - loanMessageState.lastProcessed < 1000) {
    return;
  }

  loanMessageState.processingInProgress = true;
  loanMessageState.lastProcessed = now;

  try {
    // First, check if we already have a message displayed
    const existingMessage = document.getElementById(
      "loan-not-provisioned-message"
    );
    if (existingMessage && loanMessageState.messageDisplayed) {
      return;
    }

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

    if (!hasSearchCriteria) {
      return;
    }

    // Check if there's exactly one result in the table
    const tableBody = document.querySelector(
      "#borrowersTable tbody, table.results-table tbody"
    );
    if (!tableBody) return;

    // Get all rows before any filtering
    const allRows = Array.from(tableBody.querySelectorAll("tr"));
    if (allRows.length !== 1) return;

    const row = allRows[0];

    // Extract loan number from the row - try multiple selectors
    let loanNumberCell = row.querySelector("td:nth-child(4)");
    if (!loanNumberCell) {
      // Try alternative selectors
      loanNumberCell = row.querySelector("td a.bright-green.ng-binding");
      if (!loanNumberCell) {
        // Try to find a cell with a 10-digit number
        const cells = row.querySelectorAll("td");
        for (const cell of cells) {
          const text = cell.textContent.trim();
          if (/^\d{10}$/.test(text)) {
            loanNumberCell = cell;
            break;
          }
        }
      }
    }

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
    const allowedLoans = await checkNumbersBatch([loanNumber]);
    const isAllowed = allowedLoans.includes(loanNumber);

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
        "<strong>Loan not provisioned to you.</strong>";

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
  } catch (error) {
    console.error("Error in handleSingleRestrictedLoanSearch:", error);
  } finally {
    loanMessageState.processingInProgress = false;
  }
}

/**
 * @function debugPageStructure
 * @description Logs information about the page structure to help with debugging
 */
function debugPageStructure() {
  

  // Log basic page info
  
  

  // Log all tables
  const tables = document.querySelectorAll("table");
  

  // Find all elements with loan numbers (10 digits)
  const allElements = document.querySelectorAll("*");
  const loanNumberElements = Array.from(allElements).filter((el) => {
    const text = el.textContent.trim();
    return /\b\d{10}\b/.test(text) && !el.children.length; // Only leaf nodes
  });

  loanNumberElements.forEach((el, i) => {
    // Process elements if needed in the future
  });

  
}

/**
 * @function getElementPath
 * @description Gets a CSS selector path for an element
 * @param {Element} el - The element to get the path for
 * @returns {string} The CSS selector path
 */
function getElementPath(el) {
  if (!el) return "";
  if (el.id) return "#" + el.id;

  let path = "";
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.className) {
      selector += "." + el.className.replace(/\s+/g, ".");
    }
    path = selector + (path ? " > " + path : "");
    el = el.parentNode;
  }
  return path;
}

/**
 * @class FormElement
 * @description Class to handle loan-related DOM elements
 */
class FormElement {
  /**
   * @constructor
   * @description Creates a new FormElement instance
   */
  constructor() {
    this.element = document.querySelectorAll("table");
    this.parent = this.element[0] && this.element[0].parentElement;
    this.unallowed = createUnallowedElement();
  }

  /**
   * @method getLoanTable
   * @description Gets the table containing loan information
   * @returns {HTMLElement|null} The table element or null if not found
   */
  getLoanTable() {
    
    

    // Debug all tables
    Array.from(this.element).forEach((table, index) => {
      
      // Table analysis

      // Check table content for loan numbers
      const tableText = table.textContent;
      const hasDigitSequences = /\d{10}/.test(tableText);
      

      // Check if table has headers that might indicate loan data
      const headers = Array.from(table.querySelectorAll("th, thead td")).map(
        (h) => h.textContent.trim()
      );
      
    });

    // First try the specific selector
    const specificTable = Array.from(this.element).find((table) =>
      table.querySelector("td a.bright-green.ng-binding")
    );

    if (specificTable) {
      
      return specificTable;
    }

    // If not found, try more general approaches
    

    // Look for tables with 10-digit numbers (likely loan numbers)
    const tableWithLoanNumbers = Array.from(this.element).find((table) => {
      const rows = table.querySelectorAll("tr");
      if (rows.length <= 1) return false; // Skip tables with only headers

      // Check if any cell contains a 10-digit number
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        for (const cell of cells) {
          const text = cell.textContent.trim();
          if (/^\d{10}$/.test(text)) {
            
            return true;
          }
        }
      }

      return false;
    });

    if (tableWithLoanNumbers) {
      
      return tableWithLoanNumbers;
    }

    // If still not found, look for tables with many rows (likely data tables)
    const largestTable = Array.from(this.element)
      .filter((table) => table.querySelectorAll("tr").length > 2)
      .sort(
        (a, b) =>
          b.querySelectorAll("tr").length - a.querySelectorAll("tr").length
      )[0];

    if (largestTable) {
      
      return largestTable;
    }

    
    return null;
  }

  /**
   * @method removeTable
   * @description Removes the loan table from the DOM
   */
  removeTable() {
    const targetTable = this.getLoanTable();
    if (targetTable) {
      targetTable.remove();
    }
  }

  /**
   * @method showUnallowedMessage
   * @description Shows the "Loan is not provisioned" message
   */
  showUnallowedMessage() {
    if (this.parent) {
      this.parent.appendChild(this.unallowed);
    }
  }
}

/**
 * @async
 * @function handleLoanAccess
 * @description Checks if the current loan is allowed for the user
 * @returns {Promise<boolean>} Promise that resolves to true if the loan is allowed, false otherwise
 */
async function handleLoanAccess() {
  // Find loan number in the page
  const loanNumberElement = document.querySelector(
    "table tr td a.bright-green.ng-binding"
  );
  if (!loanNumberElement) return true; // No loan number found, allow access

  const loanNumber = loanNumberElement.textContent.trim();
  if (!loanNumber) return true; // Empty loan number, allow access

  try {
    // Check if loan is allowed
    const allowedLoans = await checkNumbersBatch([loanNumber]);

    // If loan is not allowed, show message
    if (allowedLoans.length === 0) {
      const formElement = new FormElement();
      formElement.removeTable();
      formElement.showUnallowedMessage();
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error checking loan access:", error);
    return true; // On error, allow access
  }
}

/**
 * @async
 * @function handleTableRows
 * @description Processes table rows to hide restricted loans
 * @returns {Promise<void>}
 */
async function handleTableRows() {
  

  const formElement = new FormElement();
  const loanTable = formElement.getLoanTable();

  

  if (!loanTable) {
    console.warn("No loan table found, trying alternative selectors");
    // Try alternative selectors for tables with loan data
    const allTables = document.querySelectorAll("table");
    
    return;
  }

  // Find all loan rows
  const rows = loanTable.querySelectorAll("tr");
  

  if (!rows || rows.length === 0) {
    console.warn("No rows found in loan table");
    return;
  }

  let visibleCount = 0;

  // Process each row
  for (const row of rows) {
    // Skip header row
    if (row.querySelector("th")) {
      
      continue;
    }

    // Find loan number in the row - try multiple selectors
    let loanNumberCell = row.querySelector("td a.bright-green.ng-binding");

    // If not found, try alternative selectors
    if (!loanNumberCell) {
      

      // Try all links in the row
      const allLinks = row.querySelectorAll("td a");
      

      // Try to find a link that contains a loan number pattern (digits)
      for (const link of allLinks) {
        const text = link.textContent.trim();
        if (/^\d+$/.test(text) || /^\d{10}$/.test(text)) {
          
          loanNumberCell = link;
          break;
        }
      }

      // If still not found, try all cells
      if (!loanNumberCell) {
        const allCells = row.querySelectorAll("td");
        for (const cell of allCells) {
          const text = cell.textContent.trim();
          if (/^\d{10}$/.test(text)) {
            
            loanNumberCell = cell;
            break;
          }
        }
      }

      // If still not found, skip this row
      if (!loanNumberCell) {
        
        continue;
      }
    }

    
    const loanNumber = loanNumberCell.textContent.trim();
    

    if (!loanNumber) continue;

    try {
      // Check if loan is allowed
      
      const allowedLoans = await checkNumbersBatch([loanNumber]);
      

      // If loan is not allowed, hide the row
      if (allowedLoans.length === 0) {
        
        row.style.display = "none";
      } else {
        
        // Update row counter for visible rows
        visibleCount++;
      }
    } catch (error) {
      console.error(`Error checking loan access for ${loanNumber}:`, error);
    }
  }

  

  // If no visible rows, show "Records not found" message
  if (visibleCount === 0) {
    
  }
}

/**
 * @function setupLoanObserver
 * @description Sets up a mutation observer to watch for loan number changes
 */
function setupLoanObserver() {
  // Watch for changes to the loan table
  const observer = new MutationObserver((mutations) => {
    let shouldCheckLoanAccess = false;
    let shouldCheckTableRows = false;
    let shouldCheckSingleLoan = false;

    for (const mutation of mutations) {
      // Skip mutations to our own message element
      if (
        mutation.target.id === "loan-not-provisioned-message" ||
        mutation.target.closest?.("#loan-not-provisioned-message")
      ) {
        continue;
      }

      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        // Check if any added nodes contain loan information
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check for loan details
          if (
            node.querySelector("a.bright-green.ng-binding") ||
            node.classList.contains("bright-green")
          ) {
            
            shouldCheckLoanAccess = true;
            shouldCheckTableRows = true;
          }

          // Check for table rows
          if (
            node.nodeName === "TR" ||
            (node.nodeType === Node.ELEMENT_NODE && node.querySelector?.("tr"))
          ) {
            
            shouldCheckTableRows = true;
            shouldCheckSingleLoan = true;
          }

          // Check for search form changes
          if (node.closest?.('#borrowerSearchForm, form[name="searchForm"]')) {
            
            shouldCheckSingleLoan = true;
          }
        }
      }

      // Check for attribute changes on search form elements
      if (mutation.type === "attributes") {
        if (
          (mutation.target.tagName === "INPUT" ||
            mutation.target.tagName === "SELECT") &&
          mutation.target.closest?.(
            '#borrowerSearchForm, form[name="searchForm"]'
          )
        ) {
          
          shouldCheckSingleLoan = true;
        }
      }
    }

    // Debounce the checks to avoid multiple rapid executions
    if (
      shouldCheckLoanAccess ||
      shouldCheckTableRows ||
      shouldCheckSingleLoan
    ) {
      setTimeout(() => {
        if (shouldCheckLoanAccess) {
          handleLoanAccess();
        }

        if (shouldCheckTableRows) {
          handleTableRows();
        }

        if (shouldCheckSingleLoan) {
          handleSingleRestrictedLoanSearch();
        }
      }, 100);
    }
  });

  // Observe the entire document body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["value", "style", "class", "display"],
  });

  return observer;
}

/**
 * @async
 * @function processPage
 * @description Processes the current page based on its content
 * @returns {Promise<void>}
 */
async function processPage() {
  
  

  // Hide the page during processing
  pageUtils.showPage(false);

  try {
    // Check if we're on a loan detail page
    if (
      window.location.href.includes("loanDetail") ||
      window.location.href.includes("bidApproveReject")
    ) {
      
      const viewElement = await waitForLoanNumber();
      

      if (viewElement) {
        viewElement.remove();

        const loanNumber = getLoanNumber(viewElement.element);
        

        if (loanNumber) {
          
          const allowedNumbers = await checkNumbersBatch([loanNumber]);
          

          if (allowedNumbers.includes(loanNumber)) {
            
            viewElement.add();
          } else {
            
          }
        }
      }
    } else {
      
      // For table pages, process the rows
      await handleTableRows();

      // Check for single restricted loan case
      
      await handleSingleRestrictedLoanSearch();
    }
  } catch (error) {
    console.error("Error processing page:", error);
  } finally {
    // Always show the page when done
    
    pageUtils.showPage(true);
  }
}

// Main entrypoint (this is where everything starts)
(async function () {
  

  // Create and append loader style
  const style = createLoader();
  document.head.appendChild(style);

  // Create and append loader element
  const loader = createLoaderElement();
  document.body.appendChild(loader);

  // Hide the page immediately to prevent unauthorized loan numbers from being visible
  pageUtils.showPage(false);

  // Initialize when the DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }

  async function onReady() {
    
    try {
      // Debug the page structure to help identify issues
      debugPageStructure();

      // Check Loan extension connection
      await waitForListener();

      // Process the current page
      await processPage();

      // Set up observers for dynamic content
      const observer = setupLoanObserver();

      // Set up URL change monitoring
      const urlChangeInterval = onValueChange(
        () => document.location.href,
        async (newVal) => {
          // Hide the page during navigation
          pageUtils.showPage(false);
          // Process the page based on the new URL
          await processPage();
        }
      );

      // Store cleanup references
      window.__loanFilterCleanup = {
        observer,
        urlChangeInterval,
      };
    } catch (error) {
      console.error("Error initializing loan filter:", error);
    } finally {
      // Always remove loader and show page
      loader.remove();
      pageUtils.showPage(true);
    }
  }

  // Cleanup function that can be called to remove all event listeners and observers
  window.__cleanupLoanFilter = function () {
    // Ensure page is visible when cleaning up
    pageUtils.showPage(true);

    // Clean up observer and intervals
    if (window.__loanFilterCleanup) {
      if (window.__loanFilterCleanup.observer) {
        window.__loanFilterCleanup.observer.disconnect();
      }

      if (window.__loanFilterCleanup.urlChangeInterval) {
        clearInterval(window.__loanFilterCleanup.urlChangeInterval);
      }
    }

  };
})();
