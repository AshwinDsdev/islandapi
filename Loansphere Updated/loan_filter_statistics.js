/**
 * Loansphere Dynamic Filter
 * 
 * This script dynamically identifies and filters brand dropdowns and tables
 * in the Loansphere Customer Statistics page using Chrome extension communication.
 */

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
      const result = document.evaluate(xpath, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue;
    }
  };

  // Hide the page immediately to prevent unauthorized loan numbers from being visible
  pageUtils.showPage(false);

  // Configuration
  const config = {
    debug: true,
    filterDelay: 300,
    observerDelay: 500,
    reprocessInterval: 2000,
    isOffshoreUser: true,
    maxRetries: 5,
    retryDelay: 1000,
  };

  // Extension ID for communication
  const EXTENSION_ID = 'afkpnpkodeiolpnfnbdokgkclljpgmcm';

  // State tracking
  const state = {
    processedElements: new Set(),
    brandVisibility: new Map(),
    observerState: {
      ignoreNextMutations: false,
      processingDebounce: null,
      lastProcessed: 0,
    },
    processingInterval: null,
    lastFilterTime: 0,
    originalData: {
      borrowers: [],
      brands: [],
    },
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
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        console.warn('❌ Chrome extension API not available. Running in standalone mode.');
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
          console.warn('❌ No listener detected after maximum retries.');
          clearTimeout(timeoutId);
          reject(new Error('Listener not found'));
          return;
        }

        try {
          chrome.runtime.sendMessage(
            EXTENSION_ID,
            { type: 'ping' },
            (response) => {
              if (chrome.runtime.lastError) {
                console.warn('Chrome extension error:', chrome.runtime.lastError);
                attempts++;
                if (attempts >= maxRetries) {
                  reject(new Error('Chrome extension error'));
                  return;
                }
                timeoutId = setTimeout(sendPing, delay);
                return;
              }

              if (response?.result === 'pong') {
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
          console.error('Error sending message to extension:', error);
          resolve(false);
        }
      }

      sendPing();
    });
  }

  /**
   * Check if a loan number is allowed via the extension
   */
  async function checkNumbersBatch(numbers) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        {
          type: 'queryLoans',
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
      console.warn('Failed to check loan access, assuming not allowed');
      return false;
    }
  }

  /**
   * Backup original data
   */
  function backupOriginalData() {
    if (window.borrowersData) {
      state.originalData.borrowers = [...window.borrowersData];
    }
    if (window.brandsData) {
      state.originalData.brands = [...window.brandsData];
    }
    logThrottle.log("backup", "Original data backed up", state.originalData);
  }

  /**
   * Filter borrowers data
   */
  async function filterBorrowersData() {
    if (!window.borrowersData) return;

    const filteredBorrowers = [];
    for (const borrower of state.originalData.borrowers) {
      if (await isLoanNumberAllowed(borrower.loanNumber)) {
        filteredBorrowers.push(borrower);
      }
    }

    window.borrowersData = filteredBorrowers;
    logThrottle.log(
      "borrowers",
      `Filtered borrowers data: ${filteredBorrowers.length} of ${state.originalData.borrowers.length} remain`
    );
  }

  /**
   * Filter brands data
   */
  async function filterBrandsData() {
    if (!window.brandsData) return;

    const brandsWithAllowedLoans = new Set();
    for (const brand of state.originalData.brands) {
      for (const loanNumber of brand.loanNumbers) {
        if (await isLoanNumberAllowed(loanNumber)) {
          brandsWithAllowedLoans.add(brand.id);
          break;
        }
      }
    }

    window.brandsData = state.originalData.brands.filter(brand =>
      brandsWithAllowedLoans.has(brand.id)
    );

    logThrottle.log(
      "brands",
      `Filtered brands data: ${window.brandsData.length} of ${state.originalData.brands.length} remain`,
      window.brandsData.map(b => b.name)
    );
  }

  /**
   * Find all brand elements in the DOM
   */
  function findBrandElements() {
    const elements = {
      brandBadges: document.querySelectorAll('.brand-badge'),
      dropdownMenus: document.querySelectorAll('.dropdown-menu'),
      selects: document.querySelectorAll('select'),
    };

    logThrottle.log(
      "elements",
      `Found ${elements.brandBadges.length} brand badges, ${elements.dropdownMenus.length} dropdowns, ${elements.selects.length} selects`
    );

    return elements;
  }

  /**
   * Filter brand elements in dropdowns
   */
  async function filterBrandElements() {
    const elements = findBrandElements();
    const allowedBrandCodes = new Set(window.brandsData.map(brand => brand.code));

    // Process brand badges
    let hiddenBadges = 0;
    for (const badge of elements.brandBadges) {
      if (state.processedElements.has(badge)) continue;
      state.processedElements.add(badge);

      const brandCode = badge.textContent.trim();
      const listItem = badge.closest('li') || badge.closest('.dropdown-item') || badge.parentElement;

      if (listItem && !allowedBrandCodes.has(brandCode)) {
        listItem.style.display = 'none';
        hiddenBadges++;
      }
    }

    // Process dropdown menus
    for (const menu of elements.dropdownMenus) {
      if (state.processedElements.has(menu)) continue;
      state.processedElements.add(menu);

      const items = menu.querySelectorAll('li, .dropdown-item');
      let hiddenItems = 0;

      for (const [index, item] of Array.from(items).entries()) {
        if (index === 0) continue; // Skip "All Brands"

        const badge = item.querySelector('.brand-badge');
        if (!badge) continue;

        const brandCode = badge.textContent.trim();
        if (!allowedBrandCodes.has(brandCode)) {
          item.style.display = 'none';
          hiddenItems++;
        }
      }

      if (hiddenItems > 0) {
        logThrottle.log("dropdown", `Hidden ${hiddenItems} items in dropdown menu`);
      }
    }

    // Process select elements
    for (const select of elements.selects) {
      if (state.processedElements.has(select)) continue;
      state.processedElements.add(select);

      const options = select.querySelectorAll('option');
      let hiddenOptions = 0;

      for (const [index, option] of Array.from(options).entries()) {
        if (index === 0) continue; // Skip "All Brands"

        const text = option.textContent.trim();
        const brandCodeMatch = text.match(/\(([A-Z0-9]+)\)$/);

        if (brandCodeMatch) {
          const brandCode = brandCodeMatch[1];
          if (!allowedBrandCodes.has(brandCode)) {
            option.style.display = 'none';
            option.disabled = true;
            hiddenOptions++;
          }
        }
      }

      if (hiddenOptions > 0) {
        logThrottle.log("select", `Hidden ${hiddenOptions} options in select element`);
      }
    }

    logThrottle.log("brands", `Hidden ${hiddenBadges} brand elements in the UI`);
  }

  /**
   * Filter table rows
   */
  async function filterTableRows() {
    const tables = document.querySelectorAll('table');
    let totalHiddenRows = 0;

    for (const table of tables) {
      if (state.processedElements.has(table)) continue;
      state.processedElements.add(table);

      const rows = table.querySelectorAll('tbody tr');
      let hiddenRows = 0;

      for (const row of rows) {
        if (state.processedElements.has(row)) continue;
        state.processedElements.add(row);

        // Look for loan number in the row
        const cells = row.querySelectorAll('td');
        let loanNumber = null;

        // Try to find a cell with a loan number format
        for (const cell of cells) {
          const text = cell.textContent.trim();
          if (/^\d{10}$/.test(text)) {
            loanNumber = text;
            break;
          }
        }

        // If no loan number found, try data attributes
        if (!loanNumber) {
          loanNumber = row.getAttribute('data-loan-number') ||
            row.getAttribute('data-loan') ||
            row.getAttribute('data-id');
        }

        // If we found a loan number and it's not allowed, hide the row
        if (loanNumber && !(await isLoanNumberAllowed(loanNumber))) {
          row.style.display = 'none';
          hiddenRows++;
        }
      }

      if (hiddenRows > 0) {
        logThrottle.log("table", `Hidden ${hiddenRows} rows in table`);
        totalHiddenRows += hiddenRows;
      }
    }

    logThrottle.log("tables", `Total hidden rows across all tables: ${totalHiddenRows}`);
  }

  /**
   * Main function to apply all filters
   */
  async function applyFilters() {
    logThrottle.log("filters", "Applying filters...");

    // Hide the page during processing
    pageUtils.showPage(false);

    try {
      // Filter the data
      await filterBorrowersData();
      await filterBrandsData();

      // Filter the UI
      await filterBrandElements();
      await filterTableRows();

      logThrottle.log("filters", "Filter application complete");
    } finally {
      // Show the page after processing is complete
      pageUtils.showPage(true);
    }
  }

  /**
   * Initialize mutation observer to detect DOM changes
   */
  function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      if (state.observerState.ignoreNextMutations) {
        state.observerState.ignoreNextMutations = false;
        return;
      }

      if (state.observerState.processingDebounce) {
        clearTimeout(state.observerState.processingDebounce);
      }

      const now = Date.now();
      if (now - state.observerState.lastProcessed < config.observerDelay) {
        return;
      }

      let shouldProcess = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              if (
                node.classList?.contains('dropdown-menu') ||
                node.tagName === 'TABLE' ||
                node.tagName === 'SELECT' ||
                node.querySelector?.('.brand-badge, .dropdown-menu, table, select')
              ) {
                shouldProcess = true;
                break;
              }
            }
          }
        }
        if (shouldProcess) break;
      }

      state.observerState.processingDebounce = setTimeout(() => {
        state.observerState.lastProcessed = Date.now();
        state.observerState.ignoreNextMutations = true;

        if (shouldProcess) {
          logThrottle.log("observer", "Relevant DOM changes detected, reapplying filters");
          applyFilters();
        }
      }, config.filterDelay);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
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
      logThrottle.log("interval", "Reprocessing page from interval");
      applyFilters();
    }, config.reprocessInterval);

    return state.processingInterval;
  }

  /**
   * Initialize the filter
   */
  async function initFilter() {
    console.log("[LoanFilter] Initializing Loansphere Dynamic Filter...");
    
    // Safety timeout to ensure page is shown even if there's an unexpected issue
    const safetyTimeout = setTimeout(() => {
      console.warn("Safety timeout triggered - ensuring page is visible");
      pageUtils.showPage(true);
    }, 10000); // 10 seconds max wait time

    try {
      // Backup original data
      backupOriginalData();

      // Wait for the extension listener to be available
      const listenerAvailable = await waitForListener();

      if (listenerAvailable) {
        console.log("✅ Extension listener connected successfully");

        // Initial processing
        await applyFilters();

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
          applyFilters,
          isLoanNumberAllowed,
          originalData: state.originalData,
          cleanup: function () {
            observer.disconnect();
            clearInterval(interval);

            // Restore original data
            window.borrowersData = [...state.originalData.borrowers];
            window.brandsData = [...state.originalData.brands];

            logThrottle.log("cleanup", "Filter resources cleaned up and original data restored");

            // Reload the page to reset UI
            if (confirm("Data has been restored. Reload page to reset UI?")) {
              window.location.reload();
            }
          }
        };

        console.log("[LoanFilter] Filter initialized successfully");
      } else {
        console.warn("⚠️ Extension listener not available, running in limited mode");
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
  window.addEventListener('beforeunload', () => {
    pageUtils.showPage(true);
  });

  // Start the filter
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFilter);
  } else {
    initFilter();
  }
})();