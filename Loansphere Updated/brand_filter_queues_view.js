/**
 * Brand Filter Injection Script
 *
 * This script filters the brands dropdown to only show brands that have at least one loan number
 * that is allowed via Chrome extension communication.
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
    isOffshoreUser: true,
  };

  // Extension ID for communication
  const EXTENSION_ID = "afkpnpkodeiolpnfnbdokgkclljpgmcm";

  // State tracking
  const state = {
    processedBrands: new Set(),
    brandVisibility: new Map(),
    observerState: {
      ignoreNextMutations: false,
      processingDebounce: null,
      lastProcessed: 0,
    },
    processingInterval: null,
    lastFilterTime: 0,
  };

  // Logging with throttling to prevent console spam
  const logThrottle = {
    lastLogs: {},
    log: function (key, ...args) {
      if (!config.debug) return;

      const now = Date.now();
      if (!this.lastLogs[key] || now - this.lastLogs[key] > 2000) {
        console.log(`[BrandFilter] ${args[0]}`, ...args.slice(1));
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
   * Check if a brand has any allowed loan numbers
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
    // Get brands data
    if (!window.brandsData || !Array.isArray(window.brandsData)) {
      logThrottle.log(
        "noBrands",
        "No brands data available for brand filtering"
      );
      return;
    }

    // Hide the page during processing
    pageUtils.showPage(false);

    try {
      logThrottle.log(
        "processBrands",
        "Processing brands for filtering...",
        window.brandsData
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
          const brand = window.brandsData.find((b) => b.id === brandId);

          if (brand && !(await brandHasAllowedLoans(brand.loanNumbers))) {
            option.style.display = "none";
            state.brandVisibility.set(brandId, false);
            logThrottle.log(
              "hiddenBrand",
              `Filtering out brand: ${brand.name} (${brand.code})`
            );
          } else {
            state.brandVisibility.set(brandId, true);
          }
        }
      }

      // Filter brand cells in the table
      const brandCells = document.querySelectorAll(
        "#loansTableBody tr td:nth-child(4)"
      );
      for (const cell of brandCells) {
        if (state.processedBrands.has(cell)) continue;
        state.processedBrands.add(cell);

        const brandName = cell.textContent.trim();
        if (!brandName) continue;

        const brand = window.brandsData.find((b) => b.name === brandName);

        if (brand && !(await brandHasAllowedLoans(brand.loanNumbers))) {
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
      let brandChanged = false;

      for (const mutation of mutations) {
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
          }
        }

        if (
          mutation.type === "attributes" &&
          mutation.target.id === "brandSelect"
        ) {
          brandChanged = true;
        }
      }

      state.observerState.processingDebounce = setTimeout(() => {
        state.observerState.lastProcessed = Date.now();
        state.observerState.ignoreNextMutations = true;

        if (brandChanged) {
          state.processedBrands.clear();
          logThrottle.log(
            "brandChanged",
            "Brand selection changed, reprocessing all elements"
          );
        }

        if (shouldProcess || brandChanged) {
          logThrottle.log("observer", "Processing page due to DOM changes");
          processBrandElements();
        }
      }, config.filterDelay);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
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
      logThrottle.log("interval", "Reprocessing page from interval");
      processBrandElements();
    }, config.reprocessInterval);

    return state.processingInterval;
  }

  /**
   * Initialize the filter
   */
  async function initFilter() {
    console.log("[BrandFilter] Initializing brand filter...");

    // Safety timeout to ensure page is shown even if there's an unexpected issue
    const safetyTimeout = setTimeout(() => {
      console.warn("Safety timeout triggered - ensuring page is visible");
      pageUtils.showPage(true);
    }, 10000); // 10 seconds max wait time

    try {
      // Wait for the extension listener to be available
      const listenerAvailable = await waitForListener();

      if (listenerAvailable) {
        console.log("✅ Extension listener connected successfully");

        // Initial processing
        await processBrandElements();

        // Set up observers and intervals
        const observer = initMutationObserver();
        const interval = setupProcessingInterval();

        // Clear the safety timeout once initialization is complete
        clearTimeout(safetyTimeout);

        // Add to window for debugging
        window.brandFilterState = {
          observer,
          interval,
          state,
          processBrandElements,
          isLoanNumberAllowed,
          brandHasAllowedLoans,
        };

        console.log("[BrandFilter] Filter initialized successfully");
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
