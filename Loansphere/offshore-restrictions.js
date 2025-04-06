// offshore-restrictions.js
(function () {
    // Configuration
    const config = {
      userType: "offshore", // Default to offshore
      restrictionMessage: "Loan not provisioned to you",
      noResultsMessage: "No matching records found",
      debugMode: true,
      dataWaitTimeout: 20000, // 20 second timeout
    };
  
    // Store original functions
    const originalFunctions = {
      updateTable: null,
      waitForLoans: null,
      waitForData: null,
      searchHandler: null,
      clearSearchHandler: null
    };
  
    // Debug logging
    function debugLog(...messages) {
      if (config.debugMode) {
        console.log("[Offshore Restrictions]", ...messages);
      }
    }
  
    // Check if brand should be restricted
    function isBrandRestricted(brand) {
      if (!brand) return false;
      return brand.type === "onshore" || brand.restricted === true;
    }
  
    // Check if loan should be restricted
    function isLoanRestricted(loan) {
      if (!loan) return false;
      return loan.type === "onshore" || loan.isRestricted === true;
    }
  
    // Wait for element with retries
    function waitForElement(selector, timeout = config.dataWaitTimeout) {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();
  
        const check = () => {
          const element = document.querySelector(selector);
          if (element) {
            resolve(element);
            return;
          }
  
          if (Date.now() - startTime >= timeout) {
            reject(new Error(`Element ${selector} not found`));
            return;
          }
  
          setTimeout(check, 200);
        };
  
        check();
      });
    }
  
    // Wait for data with retries
    function waitForData(variableName, timeout = config.dataWaitTimeout) {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();
  
        const check = () => {
          if (window[variableName] !== undefined) {
            resolve(window[variableName]);
            return;
          }
  
          if (Date.now() - startTime >= timeout) {
            reject(new Error(`Data ${variableName} not available`));
            return;
          }
  
          setTimeout(check, 200);
        };
  
        check();
      });
    }
  
    // Process and filter brands
    function getAvailableBrands() {
      if (!window.storedNumbersSet) return [];
      return window.storedNumbersSet.filter((brand) => {
        return config.userType !== "offshore" || !isBrandRestricted(brand);
      });
    }
  
    // Update brand dropdown
    function updateBrandDropdown() {
      const brandSelect = document.getElementById("brandSelect");
      if (!brandSelect) return;
  
      const availableBrands = getAvailableBrands();
      debugLog("Updating brand dropdown with:", availableBrands);
  
      // Preserve selected value
      const selectedValue = brandSelect.value;
  
      // Clear and rebuild options
      brandSelect.innerHTML = "";
  
      // Add "All Brands" option
      const allOption = document.createElement("option");
      allOption.value = "all";
      allOption.textContent = "All Brands";
      brandSelect.appendChild(allOption);
  
      // Add available brands
      availableBrands.forEach((brand) => {
        const option = document.createElement("option");
        option.value = brand.value;
        option.textContent = brand.name;
        brandSelect.appendChild(option);
      });
  
      // Restore selection if still valid
      if (
        selectedValue === "all" ||
        availableBrands.some((b) => b.value === selectedValue)
      ) {
        brandSelect.value = selectedValue;
      }
    }
  
    // Initialize restrictions
    async function init() {
      try {
        debugLog("Initializing offshore restrictions...");

        // Get user type from HTML attribute
        const restrictionElement = document.querySelector(
          "[data-offshore-restrictions]"
        );
        if (restrictionElement) {
          config.userType =
            restrictionElement.getAttribute("data-user-type") || config.userType;
        }
        debugLog("User type:", config.userType);

        // Wait for critical elements and data with retries
        debugLog("Waiting for required elements and data...");

        try {
          await Promise.all([
            waitForElement("#borrowerTableBody"),
            waitForElement("#brandSelect"),
            waitForElement("#searchButton"),
            waitForData("storedNumbersSet"), // Brand data
            waitForData("storedLoansSet"), // Loan data
          ]);

          debugLog("All required elements and data are available");
        } catch (error) {
          debugLog("Error waiting for elements or data:", error);
          debugLog("Will continue initialization with available elements and data");
        }

        // Log available data
        if (window.storedNumbersSet) {
          debugLog("Brand data available:", window.storedNumbersSet.length);
        } else {
          debugLog("Brand data not available");
        }

        if (window.storedLoansSet) {
          debugLog("Loan data available:", window.storedLoansSet.length);
        } else {
          debugLog("Loan data not available");
        }

        // Store original functions
        if (window.updateTable) {
          debugLog("Storing original updateTable function");
          originalFunctions.updateTable = window.updateTable;
        } else {
          debugLog("updateTable function not found, using empty function");
          originalFunctions.updateTable = function () {};
        }

        if (window.waitForLoans) {
          debugLog("Storing original waitForLoans function");
          originalFunctions.waitForLoans = window.waitForLoans;
        } else {
          debugLog("waitForLoans function not found, using empty function");
          originalFunctions.waitForLoans = async function () { return []; };
        }

        if (window.waitForData) {
          debugLog("Storing original waitForData function");
          originalFunctions.waitForData = window.waitForData;
        } else {
          debugLog("waitForData function not found, using empty function");
          originalFunctions.waitForData = async function () { return []; };
        }

        // Process brand data to add restricted flag
        if (window.storedNumbersSet) {
          window.storedNumbersSet = window.storedNumbersSet.map((brand) => {
            return {
              ...brand,
              restricted: isBrandRestricted(brand),
            };
          });
          debugLog(
            "Processed brand data with restrictions:",
            window.storedNumbersSet.length
          );
        }

        // Process loan data to add isRestricted flag
        if (window.storedLoansSet) {
          window.storedLoansSet = window.storedLoansSet.map((loan) => {
            return {
              ...loan,
              isRestricted: isLoanRestricted(loan),
            };
          });

          const restrictedCount = window.storedLoansSet.filter(loan => loan.isRestricted).length;
          debugLog(
            `Processed loan data with restrictions: ${restrictedCount} restricted out of ${window.storedLoansSet.length} total`
          );
        }

        // Override functions
        overrideFunctions();

        // Override search functionality
        overrideSearch();

        // Setup brand filtering
        setupBrandFiltering();

        // Apply initial UI updates
        updateBrandDropdown();

        // Update the table with filtered data
        if (window.storedLoansSet) {
          const filteredData = window.storedLoansSet.filter(
            (loan) => !loan.isRestricted
          );
          debugLog(`Updating table with ${filteredData.length} non-restricted loans`);

          if (window.updateTable) {
            window.updateTable(filteredData);
          } else {
            debugLog("updateTable function not available for initial update");
          }
        }

        debugLog("Offshore restrictions initialized successfully");

        // Set up a periodic check to ensure restrictions are still applied
        setInterval(() => {
          if (window.storedLoansSet) {
            // Check if any loans are missing the isRestricted flag
            const missingFlags = window.storedLoansSet.some(loan => loan.isRestricted === undefined);

            if (missingFlags) {
              debugLog("Detected loans without isRestricted flag, reapplying restrictions");

              // Reapply restrictions
              window.storedLoansSet = window.storedLoansSet.map((loan) => {
                return {
                  ...loan,
                  isRestricted: isLoanRestricted(loan),
                };
              });

              // Force search override again
              overrideSearch();
            }
          }
        }, 5000); // Check every 5 seconds

      } catch (error) {
        console.error("Failed to initialize offshore restrictions:", error);
      }
    }
  
    // Override key functions
    function overrideFunctions() {
      // Override waitForLoans to process restrictions
      window.waitForLoans = async function () {
        const loans = await originalFunctions.waitForLoans();
        return loans.map((loan) => {
          return {
            ...loan,
            isRestricted: isLoanRestricted(loan),
          };
        });
      };
  
      // Override updateTable to handle restrictions
      window.updateTable = function (data) {
        const tableBody = document.getElementById("borrowerTableBody");
        if (!tableBody) {
          debugLog("Table body not found, using original updateTable");
          return originalFunctions.updateTable(data);
        }
  
        // Clear existing content
        tableBody.innerHTML = "";
  
        // Handle single restricted result
        if (data.length === 1 && data[0].isRestricted) {
          tableBody.innerHTML = `
                      <tr>
                          <td colspan="10" class="text-center">
                              <div class="alert alert-warning">
                                  ${config.restrictionMessage}
                              </div>
                          </td>
                      </tr>
                  `;
          return;
        }
  
        // No results
        if (data.length === 0) {
          tableBody.innerHTML = `
                      <tr>
                          <td colspan="10" class="text-center">
                              <div class="alert alert-info">
                                  ${config.noResultsMessage}
                              </div>
                          </td>
                      </tr>
                  `;
          return;
        }
  
        // Filter out restricted loans
        const nonRestrictedData = data.filter((loan) => !loan.isRestricted);
  
        // All results restricted
        if (nonRestrictedData.length === 0) {
          tableBody.innerHTML = `
                      <tr>
                          <td colspan="10" class="text-center">
                              <div class="alert alert-warning">
                                  ${config.restrictionMessage}
                              </div>
                          </td>
                      </tr>
                  `;
          return;
        }
  
        // Iterate through non-restricted data and build rows
        nonRestrictedData.forEach((row) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
                      <td>${row.loginAccountUserName || ""}</td>
                      <td>${row.firstName || ""}</td>
                      <td>${row.lastName || ""}</td>
                      <td>${row.emailAddress || ""}</td>
                      <td>${row.phoneNumber || ""}</td>
                      <td>${row.propertyAddress || ""}</td>
                      <td>${row.ssn || ""}</td>
                      <td>${row.brand || ""}</td>
                      <td>${row.loanNumber || ""}</td>
                      <td>${row.status || ""}</td>
                  `;
          tableBody.appendChild(tr);
        });
      };
    }
  
    // Override brand filtering
    function setupBrandFiltering(customCallback) {
      const brandSelect = document.getElementById("brandSelect");
      if (!brandSelect) {
          debugLog("Brand select element not found");
          return;
      }
  
      // Clone to remove existing event listeners
      const newBrandSelect = brandSelect.cloneNode(true);
      brandSelect.parentNode.replaceChild(newBrandSelect, brandSelect);
  
      newBrandSelect.addEventListener("change", function() {
          const selectedValue = this.value;
          const availableBrands = getAvailableBrands();
  
          const selectedBrand = selectedValue === "all" ? 
              { name: "All Brands", value: "all" } : 
              availableBrands.find(b => b.value === selectedValue);
  
          if (selectedBrand) {
              window.selectedBrandValue = selectedBrand.value;
              
              let filteredData = window.storedLoansSet || [];
              if (selectedBrand.value !== "all") {
                  filteredData = filteredData.filter(loan => loan.brand === selectedBrand.value);
              }
  
              // Apply restrictions
              filteredData = filteredData.filter(loan => !loan.isRestricted);
  
              // Call either the default or custom callback
              if (customCallback) {
                  customCallback(filteredData, selectedBrand);
              } else {
                  window.updateTable(filteredData);
              }
          }
      });
    }
  
    // Override search functionality
    function overrideSearch() {
      debugLog("Attempting to override search functionality...");

      // Force override the search button click handler
      function forceOverrideSearchButton() {
        const searchButton = document.getElementById('searchButton');
        if (!searchButton) {
          debugLog("Search button not found, will retry");
          return false;
        }

        debugLog("Found search button, overriding click handler");

        // Store original handler if not already stored
        if (!originalFunctions.searchHandler) {
          originalFunctions.searchHandler = searchButton.onclick;
        }

        // Replace with new handler
        searchButton.onclick = async function(e) {
          // Prevent default form submission
          if (e) e.preventDefault();

          debugLog("Search button clicked with offshore restrictions");

          // Show loading indicator
          const loadingIndicator = document.getElementById('loading-indicator');
          if (loadingIndicator) loadingIndicator.style.display = 'block';

          try {
            // Get search criteria
            const searchCriteria = {
              username: document.getElementById('mat-input-0')?.value.trim() || '',
              firstName: document.getElementById('firstName')?.value.trim() || '',
              lastName: document.getElementById('lastName')?.value.trim() || '',
              email: document.getElementById('email')?.value.trim() || '',
              phone: document.getElementById('phone')?.value.trim() || '',
              address: document.getElementById('address')?.value.trim() || '',
              ssn: document.getElementById('ssn')?.value.trim() || '',
              loanNumber: document.getElementById('loanNumber')?.value.trim() || ''
            };

            debugLog("Search criteria:", searchCriteria);

            // Ensure we have the latest data with restrictions applied
            if (window.storedLoansSet) {
              window.storedLoansSet = window.storedLoansSet.map((loan) => {
                return {
                  ...loan,
                  isRestricted: isLoanRestricted(loan),
                };
              });
            }

            // Start with all non-restricted loans
            let filteredData = (window.storedLoansSet || []).filter(loan => !loan.isRestricted);
            debugLog("Starting with non-restricted loans:", filteredData.length);

            // Apply brand filter if needed
            if (window.selectedBrandValue && window.selectedBrandValue !== 'all') {
              filteredData = filteredData.filter(loan => loan.brand === window.selectedBrandValue);
              debugLog("After brand filter:", filteredData.length);
            }

            // Apply search filters
            if (searchCriteria.username) {
              filteredData = filteredData.filter(loan =>
                loan.loginAccountUserName?.toLowerCase().includes(searchCriteria.username.toLowerCase())
              );
            }
            if (searchCriteria.firstName) {
              filteredData = filteredData.filter(loan =>
                loan.firstName?.toLowerCase().includes(searchCriteria.firstName.toLowerCase())
              );
            }
            if (searchCriteria.lastName) {
              filteredData = filteredData.filter(loan =>
                loan.lastName?.toLowerCase().includes(searchCriteria.lastName.toLowerCase())
              );
            }
            if (searchCriteria.email) {
              filteredData = filteredData.filter(loan =>
                loan.emailAddress?.toLowerCase().includes(searchCriteria.email.toLowerCase())
              );
            }
            if (searchCriteria.phone) {
              filteredData = filteredData.filter(loan =>
                loan.phoneNumber?.includes(searchCriteria.phone)
              );
            }
            if (searchCriteria.address) {
              filteredData = filteredData.filter(loan =>
                loan.propertyAddress?.toLowerCase().includes(searchCriteria.address.toLowerCase())
              );
            }
            if (searchCriteria.ssn) {
              filteredData = filteredData.filter(loan =>
                loan.ssn?.includes(searchCriteria.ssn)
              );
            }
            if (searchCriteria.loanNumber) {
              filteredData = filteredData.filter(loan =>
                loan.loanNumber?.toLowerCase().includes(searchCriteria.loanNumber.toLowerCase())
              );
            }

            debugLog("Final filtered search results:", filteredData.length);

            // Double-check that we're not showing restricted loans
            filteredData = filteredData.filter(loan => !loan.isRestricted);

            // Update the table with our filtered data
            if (window.updateTable) {
              window.updateTable(filteredData);
              debugLog("Table updated with filtered data");
            } else {
              debugLog("updateTable function not found");
            }

          } catch (error) {
            console.error('Search error:', error);
            // Fallback to original handler if available
            if (originalFunctions.searchHandler) {
              debugLog("Falling back to original search handler");
              originalFunctions.searchHandler.call(searchButton, e);
            }
          } finally {
            // Hide loading indicator
            if (loadingIndicator) loadingIndicator.style.display = 'none';
          }

          // Return false to prevent form submission
          return false;
        };

        return true;
      }

      // Force override the clear search functionality
      function forceOverrideClearSearch() {
        const clearSearchLink = document.querySelector('.search-actions .text-link');
        if (!clearSearchLink) {
          debugLog("Clear Search link not found, will retry");
          return false;
        }

        debugLog("Found Clear Search link, overriding click handler");

        // Store original handler if not already stored
        if (!originalFunctions.clearSearchHandler) {
          originalFunctions.clearSearchHandler = clearSearchLink.onclick;
        }

        // Replace with new handler
        clearSearchLink.onclick = function(e) {
          // Prevent default behavior
          if (e) e.preventDefault();

          debugLog("Clear Search clicked with offshore restrictions");

          // Clear all search inputs
          if (document.getElementById('mat-input-0')) document.getElementById('mat-input-0').value = '';
          if (document.getElementById('firstName')) document.getElementById('firstName').value = '';
          if (document.getElementById('lastName')) document.getElementById('lastName').value = '';
          if (document.getElementById('email')) document.getElementById('email').value = '';
          if (document.getElementById('phone')) document.getElementById('phone').value = '';
          if (document.getElementById('address')) document.getElementById('address').value = '';
          if (document.getElementById('ssn')) document.getElementById('ssn').value = '';
          if (document.getElementById('loanNumber')) document.getElementById('loanNumber').value = '';

          // Ensure we have the latest data with restrictions applied
          if (window.storedLoansSet) {
            window.storedLoansSet = window.storedLoansSet.map((loan) => {
              return {
                ...loan,
                isRestricted: isLoanRestricted(loan),
              };
            });
          }

          // Show only non-restricted loans
          const filteredData = (window.storedLoansSet || []).filter(loan => !loan.isRestricted);
          debugLog("Cleared search, showing filtered data:", filteredData.length);

          // Update the table with our filtered data
          if (window.updateTable) {
            window.updateTable(filteredData);
            debugLog("Table updated with filtered data after clear");
          } else {
            debugLog("updateTable function not found");
          }

          // If there was an original handler, call it
          if (originalFunctions.clearSearchHandler) {
            originalFunctions.clearSearchHandler.call(clearSearchLink, e);
          }

          // Return false to prevent default behavior
          return false;
        };

        return true;
      }

      // Try to override immediately
      let searchOverridden = forceOverrideSearchButton();
      let clearSearchOverridden = forceOverrideClearSearch();

      // If either override failed, set up a retry mechanism
      if (!searchOverridden || !clearSearchOverridden) {
        debugLog("Setting up retry for search override");

        // Try again after a short delay
        const retryInterval = setInterval(() => {
          if (!searchOverridden) {
            searchOverridden = forceOverrideSearchButton();
          }

          if (!clearSearchOverridden) {
            clearSearchOverridden = forceOverrideClearSearch();
          }

          // If both are overridden, clear the interval
          if (searchOverridden && clearSearchOverridden) {
            debugLog("Successfully overrode search and clear search functionality");
            clearInterval(retryInterval);
          }
        }, 500); // Check every 500ms

        // Stop trying after 10 seconds
        setTimeout(() => {
          if (retryInterval) {
            clearInterval(retryInterval);
            debugLog("Gave up trying to override search functionality after timeout");
          }
        }, 10000);
      } else {
        debugLog("Successfully overrode search and clear search functionality on first try");
      }
    }
  
    // Start initialization when DOM is ready
    if (document.readyState === "complete") {
      init();
    } else {
      document.addEventListener("DOMContentLoaded", init);
    }

    // Setup brand filtering with callback
    setupBrandFiltering((filteredData, brand) => {
      debugLog("Brand changed to:", brand.name);
      window.updateTable(filteredData);
    });
  
    // Expose for manual initialization
    window.applyOffshoreRestrictions = init;
  })();