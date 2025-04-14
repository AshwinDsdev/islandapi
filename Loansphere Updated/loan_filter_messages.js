/**
 * Combined Loan Filter Script for Loansphere Messages
 * 
 * This script combines functionality from:
 * 1. loan_filter_messages.js - Filters loan data based on window.storedNumbersSet
 * 2. loan_filter_console_inject.js - Handles search results and "not provisioned" messages
 * 
 * When injected via browser console, it will:
 * - Hide any loan numbers not present in storedNumbersSet
 * - Filter brand options in dropdowns if they don't have any allowed loan numbers
 * - Show "Loan is not provisioned to the user" message for restricted loans
 */

(function () {
  console.log("Combined Loan Filter Script initialized");
  
  // Configuration
  const FILTER_INTERVAL_MS = 10000; // More frequent checks
  const DEBUG_MODE = true; // Enable debug logging

  // Track processed elements to avoid duplicate processing
  const processedElements = new WeakSet();
  const processedBrands = new WeakSet();
  
  // Debug logging function
  function debugLog(...args) {
    if (DEBUG_MODE) {
      console.log("[LoanFilter]", ...args);
    }
  }

  // Display current storedNumbersSet for debugging
  function logStoredNumbers() {
    if (!DEBUG_MODE) return;
    
    if (!window.storedNumbersSet) {
      console.warn("[LoanFilter] storedNumbersSet is not available");
      return;
    }
    
    let numbers = [];
    if (window.storedNumbersSet instanceof Set) {
      numbers = Array.from(window.storedNumbersSet);
    } else if (Array.isArray(window.storedNumbersSet)) {
      numbers = window.storedNumbersSet;
    } else if (typeof window.storedNumbersSet === "object") {
      numbers = Object.values(window.storedNumbersSet);
    }
    
    console.log("[LoanFilter] Current storedNumbersSet:", numbers);
  }

  /**
   * Checks if storedNumbersSet is available in the window object
   */
  function isStoredNumbersSetAvailable() {
    const isAvailable = window.storedNumbersSet !== null && window.storedNumbersSet !== undefined;
    if (isAvailable && DEBUG_MODE) {
      logStoredNumbers();
    }
    return isAvailable;
  }
  
  /**
   * Checks if a loan number is allowed based on the storedNumbersSet
   * @param {string} loanNumber - The loan number to check
   * @returns {boolean} - True if the loan number is in the storedNumbersSet
   */
  function isLoanNumberAllowed(loanNumber) {
    if (!isStoredNumbersSetAvailable()) {
      console.log(`storedNumbersSet not available, assuming loan ${loanNumber} is allowed`);
      return true; // If we can't verify, assume it's allowed
    }
    
    // Normalize the loan number (trim and convert to string)
    loanNumber = String(loanNumber).trim();
    
    let isAllowed = false;
    
    if (window.storedNumbersSet instanceof Set) {
      isAllowed = window.storedNumbersSet.has(loanNumber);
      console.log(`Checking loan ${loanNumber} against Set: ${isAllowed}`);
    } else if (Array.isArray(window.storedNumbersSet)) {
      isAllowed = window.storedNumbersSet.includes(loanNumber);
      console.log(`Checking loan ${loanNumber} against Array: ${isAllowed}`);
    } else if (window.storedNumbersSet && typeof window.storedNumbersSet === "object") {
      isAllowed = Object.values(window.storedNumbersSet).includes(loanNumber);
      console.log(`Checking loan ${loanNumber} against Object values: ${isAllowed}`);
    }
    
    debugLog(`Checking loan number: ${loanNumber}, allowed: ${isAllowed}`);
    return isAllowed;
  }
  
  // Immediately expose isLoanNumberAllowed to the window object
  window.isLoanNumberAllowed = isLoanNumberAllowed;

  /**
   * Extracts loan numbers from text
   */
  function extractLoanNumbers(text) {
    if (!text) return [];
    
    // Convert to string and trim
    text = String(text).trim();
    
    const matches = [];
    // Match numeric loan numbers (5+ digits)
    const digitMatches = text.match(/\b\d{5,}\b/g);
    // Match alphanumeric loan numbers (5+ characters, letters and numbers)
    const alphaNumMatches = text.match(/\b[A-Z0-9]{5,}\b/g);

    if (digitMatches) matches.push(...digitMatches);
    if (alphaNumMatches) matches.push(...alphaNumMatches);

    // Remove duplicates
    const uniqueMatches = matches.filter(
      (value, index, self) => self.indexOf(value) === index
    );
    
    if (uniqueMatches.length > 0) {
      debugLog(`Extracted loan numbers from text: ${uniqueMatches.join(', ')}`);
    }
    
    return uniqueMatches;
  }

  /**
   * Extracts brand code from text (usually 2-4 uppercase letters/numbers)
   */
  function extractBrandCode(text) {
    if (!text) return null;
    
    // Convert to string and trim
    text = String(text).trim();
    
    // Look for brand code in parentheses like "Brand Name (CODE)"
    const parenthesesMatch = text.match(/\(([A-Z0-9]{2,4})\)$/);
    if (parenthesesMatch) {
      return parenthesesMatch[1];
    }
    
    // Look for standalone brand code (2-4 uppercase letters/numbers)
    const standaloneMatch = text.match(/\b([A-Z0-9]{2,4})\b/);
    if (standaloneMatch) {
      return standaloneMatch[1];
    }
    
    return null;
  }

  /**
   * Extracts brands data from the page
   * Maps brand codes to their loan numbers
   */
  function extractBrandsData() {
    // Use cached data if available and not forcing refresh
    if (window.extractedBrandsData && !window._forceRefreshBrandsData) {
      return window.extractedBrandsData;
    }
    
    // Reset force refresh flag
    window._forceRefreshBrandsData = false;
    
    debugLog("Extracting brands data from page...");
    
    const brandsMap = new Map();
    
    // STEP 1: Check for datasource.js brandsData (used in Loansphere_Messages.html)
    try {
      // Use window.brandsData instead of directly accessing brandsData to avoid reference errors
      if (window.brandsData && Array.isArray(window.brandsData)) {
        debugLog(`Found global brandsData with ${window.brandsData.length} brands from datasource.js`);
        
        window.brandsData.forEach(brand => {
          if (brand.code && brand.loanNumbers && Array.isArray(brand.loanNumbers)) {
            brandsMap.set(brand.code, {
              code: brand.code,
              name: brand.name || brand.code,
              loanNumbers: [...brand.loanNumbers]
            });
          }
        });
        
        // If we found brands from datasource.js, we can use them directly
        if (brandsMap.size > 0) {
          debugLog(`Using ${brandsMap.size} brands from datasource.js`);
          const result = Array.from(brandsMap.values());
          window.extractedBrandsData = result;
          return result;
        }
      }
    } catch (e) {
      debugLog(`Error accessing brandsData: ${e.message}`);
    }
    
    // STEP 2: Check for window.brandsData (redundant with step 1 now, but keeping for clarity)
    // This step is now redundant since we're already checking window.brandsData in step 1
    // But we'll keep it for clarity and in case the structure changes in the future
    
    // STEP 3: Process custom brand dropdowns (for Loansphere_Messages.html)
    const customDropdowns = document.querySelectorAll('.brand-dropdown, .custom-dropdown');
    if (customDropdowns.length > 0) {
      debugLog(`Found ${customDropdowns.length} custom brand dropdowns`);
      
      customDropdowns.forEach(dropdown => {
        const items = dropdown.querySelectorAll('.dropdown-item');
        
        items.forEach(item => {
          const text = item.textContent.trim();
          if (!text || text === 'All Brands') return;
          
          // Get brand code from data-value or extract from text
          let brandCode = item.getAttribute('data-value');
          if (!brandCode || brandCode === 'undefined') {
            brandCode = extractBrandCode(text);
          }
          
          if (brandCode && !brandsMap.has(brandCode)) {
            brandsMap.set(brandCode, {
              code: brandCode,
              name: text,
              loanNumbers: []
            });
          }
        });
      });
    }
    
    // STEP 4: Process table rows to extract brand-loan relationships
    const rows = document.querySelectorAll("tr.mat-row, tr");
    debugLog(`Analyzing ${rows.length} table rows for brand-loan relationships`);
    
    let rowsWithBrandAndLoan = 0;
    
    rows.forEach(row => {
      const cells = row.querySelectorAll("td.mat-cell, td");
      let brandCode = null;
      let loanNumbers = [];
      
      // First check the entire row text for both brand code and loan numbers
      const rowText = row.textContent.trim();
      const rowBrandCode = extractBrandCode(rowText);
      const rowLoanNumbers = extractLoanNumbers(rowText);
      
      if (rowBrandCode && rowLoanNumbers.length > 0) {
        brandCode = rowBrandCode;
        loanNumbers = rowLoanNumbers;
      } else {
        // If not found in the entire row, check individual cells
        cells.forEach(cell => {
          const text = cell.textContent.trim();
          
          // Try to identify brand code cell
          const extractedBrandCode = extractBrandCode(text);
          if (extractedBrandCode && text.length <= 15) { // Brand codes are usually in short cells
            brandCode = extractedBrandCode;
          }
          
          // Try to identify loan number cell
          const extractedLoanNumbers = extractLoanNumbers(text);
          if (extractedLoanNumbers.length > 0) {
            loanNumbers.push(...extractedLoanNumbers);
          }
        });
      }
      
      // If we found both a brand code and loan numbers, add to the map
      if (brandCode && loanNumbers.length > 0) {
        rowsWithBrandAndLoan++;
        
        if (!brandsMap.has(brandCode)) {
          brandsMap.set(brandCode, {
            code: brandCode,
            loanNumbers: [...new Set(loanNumbers)] // Remove duplicates
          });
        } else {
          // Add any new loan numbers
          const existingBrand = brandsMap.get(brandCode);
          loanNumbers.forEach(loanNumber => {
            if (!existingBrand.loanNumbers.includes(loanNumber)) {
              existingBrand.loanNumbers.push(loanNumber);
            }
          });
        }
      }
    });
    
    debugLog(`Found ${rowsWithBrandAndLoan} rows with both brand code and loan numbers`);
    
    // STEP 5: Process dropdown options to extract brand information
    const brandOptions = document.querySelectorAll('mat-option, .mat-option');
    debugLog(`Analyzing ${brandOptions.length} dropdown options for brand codes`);
    
    let optionsWithBrandCode = 0;
    
    brandOptions.forEach(option => {
      const text = option.textContent.trim();
      const brandCode = extractBrandCode(text);
      
      if (brandCode) {
        optionsWithBrandCode++;
        
        if (!brandsMap.has(brandCode)) {
          brandsMap.set(brandCode, {
            code: brandCode,
            loanNumbers: []
          });
        }
      }
    });
    
    debugLog(`Found ${optionsWithBrandCode} dropdown options with brand codes`);
    
    // STEP 6: Scan the entire page for brand-loan relationships
    debugLog("Scanning page elements for brand-loan relationships...");
    
    // Look for elements that might contain both brand codes and loan numbers
    const elements = document.querySelectorAll('div, span, p, td, li, a, h1, h2, h3, h4, h5, h6, label');
    let elementsWithBrandAndLoan = 0;
    
    elements.forEach(element => {
      const text = element.textContent.trim();
      
      // Skip processing if text is too long (likely not a specific brand/loan element)
      if (text.length > 200) return;
      
      const brandCode = extractBrandCode(text);
      const loanNumbers = extractLoanNumbers(text);
      
      if (brandCode && loanNumbers.length > 0) {
        elementsWithBrandAndLoan++;
        
        if (!brandsMap.has(brandCode)) {
          brandsMap.set(brandCode, {
            code: brandCode,
            loanNumbers: [...loanNumbers]
          });
        } else {
          // Add any new loan numbers
          const existingBrand = brandsMap.get(brandCode);
          loanNumbers.forEach(loanNumber => {
            if (!existingBrand.loanNumbers.includes(loanNumber)) {
              existingBrand.loanNumbers.push(loanNumber);
            }
          });
        }
      }
    });
    
    debugLog(`Found ${elementsWithBrandAndLoan} page elements with both brand code and loan numbers`);
    
    // STEP 7: Look for brand codes in proximity to loan numbers
    if (brandsMap.size === 0 || ![...brandsMap.values()].some(brand => brand.loanNumbers.length > 0)) {
      debugLog("No brand-loan relationships found yet, checking proximity...");
      
      // Get all elements with text
      const textElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent.trim();
        return text.length > 0 && text.length < 100; // Not too long
      });
      
      // Find elements with loan numbers
      const loanElements = textElements.filter(el => extractLoanNumbers(el.textContent).length > 0);
      
      // For each loan element, look for brand codes in nearby elements
      loanElements.forEach(loanElement => {
        const loanNumbers = extractLoanNumbers(loanElement.textContent);
        
        // Check siblings and nearby elements for brand codes
        const nearbyElements = [
          loanElement.previousElementSibling,
          loanElement.nextElementSibling,
          loanElement.parentElement,
          ...Array.from(loanElement.parentElement?.children || [])
        ].filter(Boolean); // Remove null/undefined
        
        nearbyElements.forEach(nearbyElement => {
          const brandCode = extractBrandCode(nearbyElement.textContent);
          
          if (brandCode && loanNumbers.length > 0) {
            if (!brandsMap.has(brandCode)) {
              brandsMap.set(brandCode, {
                code: brandCode,
                loanNumbers: [...loanNumbers]
              });
            } else {
              // Add any new loan numbers
              const existingBrand = brandsMap.get(brandCode);
              loanNumbers.forEach(loanNumber => {
                if (!existingBrand.loanNumbers.includes(loanNumber)) {
                  existingBrand.loanNumbers.push(loanNumber);
                }
              });
            }
          }
        });
      });
    }
    
    // STEP 8: Check for message threads data (specific to Loansphere_Messages.html)
    if (window.messageThreadsData && Array.isArray(window.messageThreadsData)) {
      debugLog(`Found messageThreadsData with ${window.messageThreadsData.length} threads`);
      
      // Extract loan numbers from message threads
      const threadLoanNumbers = window.messageThreadsData.map(thread => thread.loanNumber).filter(Boolean);
      
      // If we have brands but no loan numbers, assign thread loan numbers to brands
      if (brandsMap.size > 0 && threadLoanNumbers.length > 0) {
        debugLog(`Assigning ${threadLoanNumbers.length} thread loan numbers to brands`);
        
        // Distribute loan numbers among brands
        const brandsList = Array.from(brandsMap.values());
        threadLoanNumbers.forEach((loanNumber, index) => {
          const brand = brandsList[index % brandsList.length];
          if (!brand.loanNumbers.includes(loanNumber)) {
            brand.loanNumbers.push(loanNumber);
          }
        });
      }
    }
    
    // STEP 9: If we have storedNumbersSet but no brands with loan numbers, create fallbacks
    if (isStoredNumbersSetAvailable()) {
      debugLog("Creating fallbacks using storedNumbersSet...");
      
      let allowedLoanNumbers = [];
      
      if (window.storedNumbersSet instanceof Set) {
        allowedLoanNumbers = Array.from(window.storedNumbersSet);
      } else if (Array.isArray(window.storedNumbersSet)) {
        allowedLoanNumbers = [...window.storedNumbersSet];
      } else if (typeof window.storedNumbersSet === "object") {
        allowedLoanNumbers = Object.values(window.storedNumbersSet);
      }
      
      if (allowedLoanNumbers.length > 0) {
        // If we have no brands with loan numbers, create an ALL fallback
        if (brandsMap.size === 0 || ![...brandsMap.values()].some(brand => brand.loanNumbers.length > 0)) {
          brandsMap.set("ALL", {
            code: "ALL",
            loanNumbers: allowedLoanNumbers
          });
        }
        
        // For each brand without loan numbers, assign all allowed loan numbers
        // This ensures brands aren't filtered out unnecessarily
        brandsMap.forEach((brand, code) => {
          if (brand.loanNumbers.length === 0) {
            brand.loanNumbers = [...allowedLoanNumbers];
          }
        });
      }
    }
    
    // Convert map to array
    const brandsData = Array.from(brandsMap.values());
    
    // Cache the result
    window.extractedBrandsData = brandsData;
    
    debugLog(`Extracted ${brandsData.length} brands with data:`, brandsData);
    return brandsData;
  }

  /**
   * Determines if a brand has at least one allowed loan number
   * @param {string} brandCode - The brand code to check
   * @returns {boolean} - True if the brand has at least one allowed loan number
   */
  function brandHasAllowedLoans(brandCode) {
    try {
      if (!isStoredNumbersSetAvailable()) {
        debugLog(`No storedNumbersSet available, allowing all brands by default`);
        return true; // If we can't verify, assume it's allowed
      }
      
      if (!brandCode) {
        debugLog(`No brand code provided to check`);
        return true; // If no brand code, assume it's allowed (changed from false to true for safety)
      }
      
      // Normalize brand code
      try {
        brandCode = String(brandCode).trim().toUpperCase();
      } catch (e) {
        debugLog(`Error normalizing brand code: ${e.message}, using as is`);
        brandCode = String(brandCode);
      }
      
      debugLog(`Checking if brand ${brandCode} has allowed loans...`);
      
      try {
        // Get the extracted brands data
        const brandsData = extractBrandsData();
        
        if (!brandsData || !Array.isArray(brandsData)) {
          debugLog(`No valid brands data available, allowing brand ${brandCode} by default`);
          return true;
        }
        
        const brand = brandsData.find(b => b && b.code === brandCode);
        
        // If we found the brand and it has loan numbers
        if (brand && brand.loanNumbers && brand.loanNumbers.length > 0) {
          debugLog(`Brand ${brandCode} has ${brand.loanNumbers.length} loan numbers in our data`);
          
          // Check if any of the brand's loan numbers are allowed
          for (const loanNumber of brand.loanNumbers) {
            if (isLoanNumberAllowed(loanNumber)) {
              debugLog(`Brand ${brandCode} has allowed loan: ${loanNumber}`);
              return true;
            }
          }
          
          debugLog(`Brand ${brandCode} has no allowed loans in our extracted data`);
        } else {
          debugLog(`Brand ${brandCode} not found in extracted data or has no loan numbers, searching page...`);
        }
      } catch (e) {
        debugLog(`Error checking brand data: ${e.message}, allowing brand ${brandCode} by default`);
        return true;
      }
      
      // If we can't find the brand or it has no loan numbers, check if it appears with allowed loans on the page
      try {
        const elements = document.querySelectorAll('tr, div, span, p, td, li');
        let foundElements = 0;
        let foundLoanNumbers = 0;
        
        for (const element of elements) {
          const text = element.textContent;
          
          // Skip if the text doesn't contain the brand code (for performance)
          if (!text || !text.includes(brandCode)) continue;
          
          foundElements++;
          const loanNumbers = extractLoanNumbers(text);
          foundLoanNumbers += loanNumbers.length;
          
          for (const loanNumber of loanNumbers) {
            if (isLoanNumberAllowed(loanNumber)) {
              debugLog(`Brand ${brandCode} found with allowed loan ${loanNumber} in page element`);
              return true;
            }
          }
        }
        
        debugLog(`Brand ${brandCode} search complete: found in ${foundElements} elements with ${foundLoanNumbers} loan numbers, none allowed`);
      } catch (e) {
        debugLog(`Error searching page for brand: ${e.message}, allowing brand ${brandCode} by default`);
        return true;
      }
      
      // Special case: if this is a brand dropdown but we have no data, check if the brand code itself is in storedNumbersSet
      // This handles cases where the loan numbers are stored as brand codes
      try {
        if (window.storedNumbersSet) {
          if (window.storedNumbersSet instanceof Set && window.storedNumbersSet.has(brandCode)) {
            debugLog(`Brand code ${brandCode} is directly in storedNumbersSet`);
            return true;
          } else if (Array.isArray(window.storedNumbersSet) && window.storedNumbersSet.includes(brandCode)) {
            debugLog(`Brand code ${brandCode} is directly in storedNumbersSet array`);
            return true;
          } else if (typeof window.storedNumbersSet === "object" && Object.values(window.storedNumbersSet).includes(brandCode)) {
            debugLog(`Brand code ${brandCode} is directly in storedNumbersSet object values`);
            return true;
          }
        }
      } catch (e) {
        debugLog(`Error checking storedNumbersSet: ${e.message}, allowing brand ${brandCode} by default`);
        return true;
      }
      
      // If we get here, the brand has no allowed loans
      debugLog(`Brand ${brandCode} has no allowed loans, filtering it out`);
      return false;
    } catch (e) {
      // Catch-all for any unexpected errors
      console.error(`Unexpected error in brandHasAllowedLoans: ${e.message}`);
      return true; // For safety, allow the brand if there's an error
    }
  }

  /**
   * Determines if an element should be hidden based on loan numbers
   */
  function shouldHideElement(element) {
    if (!isStoredNumbersSetAvailable()) {
      debugLog("storedNumbersSet not available, not hiding any elements");
      return false;
    }

    // Skip certain element types
    if (
      element.tagName === "SCRIPT" ||
      element.tagName === "STYLE" ||
      element.tagName === "META" ||
      element.tagName === "LINK" ||
      element.tagName === "HEAD"
    ) {
      return false;
    }

    // Get text content from the element
    const text = element.innerText || element.textContent || "";
    
    // Check if this is a brand option in a dropdown
    const isBrandOption = (
      (element.tagName === "MAT-OPTION" || element.classList.contains('mat-option')) &&
      (element.closest('mat-select[name="brandSelect"]') || 
       element.closest('.mat-select[name="brandSelect"]') ||
       text.includes('Brand') || 
       extractBrandCode(text))
    );
    
    if (isBrandOption) {
      const brandCode = extractBrandCode(text);
      if (brandCode) {
        const hasAllowedLoans = brandHasAllowedLoans(brandCode);
        if (!hasAllowedLoans) {
          debugLog(`Filtering out brand option: ${text} (${brandCode}) - no allowed loans`);
          return true;
        } else {
          debugLog(`Keeping brand option: ${text} (${brandCode}) - has allowed loans`);
          return false;
        }
      }
    }
    
    // Extract potential loan numbers
    const potentialLoanNumbers = extractLoanNumbers(text);
    
    // If no loan numbers found, don't hide
    if (potentialLoanNumbers.length === 0) {
      return false;
    }

    // Check if any of the loan numbers are allowed
    for (const loanNumber of potentialLoanNumbers) {
      if (isLoanNumberAllowed(loanNumber)) {
        debugLog(`Element contains allowed loan: ${loanNumber}, keeping visible`);
        return false; // At least one loan number is allowed, don't hide
      }
    }

    // If we get here, none of the loan numbers are allowed
    debugLog(`Filtering out element with loans: ${potentialLoanNumbers.join(", ")}`);
    return true;
  }

  /**
   * Process brand dropdown elements
   */
  function processBrandDropdowns() {
    if (!isStoredNumbersSetAvailable()) return;
    
    debugLog("Processing brand dropdowns...");
    
    // Find all brand dropdowns - try multiple selectors to catch all possible variations
    const brandSelects = document.querySelectorAll(
      'mat-select[name="brandSelect"], .mat-select[name="brandSelect"], ' +
      'mat-select[formcontrolname="brand"], .mat-select[formcontrolname="brand"], ' +
      'mat-select[placeholder*="Brand"], .mat-select[placeholder*="Brand"], ' +
      'mat-select, .mat-select'
    );
    
    debugLog(`Found ${brandSelects.length} potential brand dropdowns`);
    
    brandSelects.forEach(select => {
      if (processedBrands.has(select)) return;
      
      // Try to determine if this is a brand dropdown
      const labelElement = select.closest('.mat-form-field')?.querySelector('.mat-form-field-label');
      const placeholder = select.getAttribute('placeholder');
      const isBrandDropdown = 
        (labelElement && labelElement.textContent.includes('Brand')) ||
        (placeholder && placeholder.includes('Brand')) ||
        select.getAttribute('name') === 'brandSelect' ||
        select.getAttribute('formcontrolname') === 'brand';
      
      if (isBrandDropdown) {
        debugLog(`Found brand dropdown: ${placeholder || labelElement?.textContent || 'unnamed'}`);
        
        // Add click listener to process options when dropdown opens
        const trigger = select.querySelector('.mat-select-trigger, .mat-mdc-select-trigger');
        if (trigger && !trigger._hasClickListener) {
          trigger._hasClickListener = true;
          trigger.addEventListener('click', () => {
            // Process after a delay to allow the panel to open
            setTimeout(processBrandOptions, 50);
            setTimeout(processBrandOptions, 150);
            setTimeout(processBrandOptions, 300);
          });
        }
      }
      
      processedBrands.add(select);
    });
    
    // Process any open brand dropdown panels
    processBrandOptions();
    
    // Process custom brand dropdowns (for Loansphere_Messages.html)
    processCustomBrandDropdowns();
    
    // Add a global click handler to catch dropdown openings
    if (!window._brandDropdownClickHandlerAdded) {
      window._brandDropdownClickHandlerAdded = true;
      document.addEventListener('click', (e) => {
        // Check if clicked element is or is inside a select trigger
        if (e.target.closest('.mat-select-trigger, .mat-mdc-select-trigger')) {
          setTimeout(processBrandOptions, 50);
          setTimeout(processBrandOptions, 150);
          setTimeout(processBrandOptions, 300);
        }
      });
    }
  }
  
  /**
   * Process custom brand dropdowns
   * This is specifically for Loansphere_Messages.html which creates custom dropdowns
   */
  function processCustomBrandDropdowns() {
    // Process the brand dropdown items that might be created by Loansphere_Messages.js
    const brandDropdowns = document.querySelectorAll('.brand-dropdown, .custom-dropdown');
    
    if (brandDropdowns.length > 0) {
      debugLog(`Found ${brandDropdowns.length} custom brand dropdowns`);
      
      brandDropdowns.forEach(dropdown => {
        if (processedBrands.has(dropdown)) return;
        processedBrands.add(dropdown);
        
        const items = dropdown.querySelectorAll('.dropdown-item');
        debugLog(`Found ${items.length} items in custom dropdown`);
        
        items.forEach(item => {
          if (processedElements.has(item)) return;
          processedElements.add(item);
          
          const text = item.textContent.trim();
          if (!text) return;
          
          // Skip "All Brands" option
          if (text === 'All Brands') {
            debugLog('Keeping "All Brands" option');
            return;
          }
          
          // Get brand code from data-value or extract from text
          let brandCode = item.getAttribute('data-value');
          if (!brandCode || brandCode === 'undefined') {
            brandCode = extractBrandCode(text);
          }
          
          if (!brandCode) return;
          
          if (!brandHasAllowedLoans(brandCode)) {
            // Hide the item
            item.style.display = "none";
            item.style.visibility = "hidden";
            item.setAttribute('disabled', 'true');
            item.setAttribute('data-filtered', 'true');
            debugLog(`Hiding custom dropdown item: ${text} (${brandCode}) - no allowed loans`);
          } else {
            debugLog(`Keeping custom dropdown item: ${text} (${brandCode}) - has allowed loans`);
            
            // Add click handler to filter by brand if not already added
            if (!item._hasBrandClickHandler) {
              item._hasBrandClickHandler = true;
              
              item.addEventListener('click', () => {
                debugLog(`Brand selected: ${text} (${brandCode})`);
                
                // Schedule filtering after the brand selection is processed
                setTimeout(() => {
                  // Re-process all elements to filter based on the selected brand
                  processAllElements();
                  
                  // If there's a search/filter function, trigger it
                  if (typeof window.applyFilters === 'function') {
                    debugLog('Triggering applyFilters after brand selection');
                    window.applyFilters();
                  } else if (typeof window.searchMessages === 'function') {
                    debugLog('Triggering searchMessages after brand selection');
                    window.searchMessages();
                  } else if (typeof window.filterMessages === 'function') {
                    debugLog('Triggering filterMessages after brand selection');
                    window.filterMessages();
                  }
                }, 100);
              });
            }
          }
        });
      });
    }
    
    // Also intercept the creation of brand dropdowns
    if (!window._brandDropdownCreationIntercepted) {
      window._brandDropdownCreationIntercepted = true;
      
      // Store the original appendChild method
      const originalAppendChild = Element.prototype.appendChild;
      
      // Override appendChild to intercept dropdown creation
      Element.prototype.appendChild = function(child) {
        // Call the original method
        const result = originalAppendChild.call(this, child);
        
        // Check if this is a brand dropdown being added
        if (child && 
            (child.classList.contains('brand-dropdown') || 
             child.classList.contains('custom-dropdown'))) {
          debugLog('Intercepted brand dropdown creation');
          setTimeout(() => processCustomBrandDropdowns(), 10);
        }
        
        return result;
      };
    }
    
    // Add handler for brand selection changes
    const selectedBrandElement = document.querySelector('.brand-dropdown .selected-option');
    if (selectedBrandElement && !selectedBrandElement._hasMutationObserver) {
      selectedBrandElement._hasMutationObserver = true;
      
      // Create a mutation observer to watch for changes to the selected brand
      const brandObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            const brandText = selectedBrandElement.textContent.trim();
            debugLog(`Brand selection changed to: ${brandText}`);
            
            // Schedule filtering after the brand selection is processed
            setTimeout(() => {
              // Re-process all elements to filter based on the selected brand
              processAllElements();
              
              // If there's a search/filter function, trigger it
              if (typeof window.applyFilters === 'function') {
                debugLog('Triggering applyFilters after brand selection change');
                window.applyFilters();
              } else if (typeof window.searchMessages === 'function') {
                debugLog('Triggering searchMessages after brand selection change');
                window.searchMessages();
              } else if (typeof window.filterMessages === 'function') {
                debugLog('Triggering filterMessages after brand selection change');
                window.filterMessages();
              }
            }, 100);
          }
        });
      });
      
      // Start observing the selected brand element
      brandObserver.observe(selectedBrandElement, { 
        childList: true, 
        characterData: true,
        subtree: true 
      });
    }
  }
  
  /**
   * Process brand options in dropdowns
   */
  function processBrandOptions() {
    // Find open dropdown panels
    const panels = document.querySelectorAll('.mat-select-panel, .mat-mdc-select-panel, .cdk-overlay-pane');
    
    if (panels.length === 0) {
      return;
    }
    
    debugLog(`Processing ${panels.length} open dropdown panels`);
    
    panels.forEach(panel => {
      const options = panel.querySelectorAll('mat-option, .mat-option');
      
      debugLog(`Found ${options.length} options in dropdown panel`);
      
      // Check if this is likely a brand dropdown
      let isBrandDropdown = false;
      let brandCodesFound = 0;
      
      // First pass - check if this looks like a brand dropdown
      options.forEach(option => {
        const text = option.textContent.trim();
        if (text && extractBrandCode(text)) {
          brandCodesFound++;
        }
      });
      
      // If more than 30% of options have brand codes, it's likely a brand dropdown
      isBrandDropdown = brandCodesFound > 0 && (brandCodesFound / options.length) > 0.3;
      
      if (!isBrandDropdown) {
        // Check if any option text contains "Brand"
        for (const option of options) {
          if (option.textContent.includes('Brand')) {
            isBrandDropdown = true;
            break;
          }
        }
      }
      
      if (isBrandDropdown) {
        debugLog(`Identified brand dropdown with ${brandCodesFound} brand codes`);
        
        // Second pass - process and filter options
        options.forEach(option => {
          // Skip if already processed
          if (processedElements.has(option)) return;
          
          const text = option.textContent.trim();
          if (!text) return;
          
          // Skip "All Brands" option
          if (text === 'All Brands') {
            debugLog('Keeping "All Brands" option');
            return;
          }
          
          const brandCode = extractBrandCode(text);
          if (!brandCode) {
            // If no brand code but in a brand dropdown, try to determine if it should be hidden
            const loanNumbers = extractLoanNumbers(text);
            if (loanNumbers.length > 0) {
              let hasAllowedLoan = false;
              for (const loanNumber of loanNumbers) {
                if (isLoanNumberAllowed(loanNumber)) {
                  hasAllowedLoan = true;
                  break;
                }
              }
              
              if (!hasAllowedLoan) {
                option.style.display = "none !important";
                option.setAttribute('disabled', 'true');
                option.classList.add('mat-option-disabled');
                debugLog(`Hiding option with no brand code but disallowed loans: ${text}`);
              }
            }
            return;
          }
          
          if (!brandHasAllowedLoans(brandCode)) {
            // Apply multiple hiding techniques to ensure it's hidden
            option.style.display = "none";
            option.style.cssText += "display: none !important; visibility: hidden !important;";
            option.setAttribute('disabled', 'true');
            option.classList.add('mat-option-disabled');
            option.setAttribute('aria-hidden', 'true');
            
            // Add a custom attribute for our CSS selector
            option.setAttribute('data-loan-filter-hidden', 'true');
            
            debugLog(`Hiding brand option: ${text} (${brandCode}) - no allowed loans`);
            
            // Mark as processed
            processedElements.add(option);
          } else {
            debugLog(`Keeping brand option: ${text} (${brandCode}) - has allowed loans`);
          }
        });
        
        // Add style to hide filtered options more aggressively
        let styleEl = document.getElementById('brand-filter-styles');
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'brand-filter-styles';
          document.head.appendChild(styleEl);
          
          styleEl.textContent = `
            .mat-option[data-loan-filter-hidden="true"],
            mat-option[data-loan-filter-hidden="true"],
            .dropdown-item[data-filtered="true"] {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              overflow: hidden !important;
              pointer-events: none !important;
              opacity: 0 !important;
            }
          `;
        }
      }
    });
  }

  /**
   * Process all elements that might contain loan numbers
   */
  function processAllElements() {
    if (!isStoredNumbersSetAvailable()) {
      console.warn("[LoanFilter] storedNumbersSet is not available yet. Waiting...");
      return;
    }

    debugLog("Processing page for loan filtering...");
    
    // Extract brands data first
    extractBrandsData();
    
    // Process brand dropdowns
    processBrandDropdowns();
    
    // Process table rows (most common container for loan data)
    const rows = document.querySelectorAll("tr.mat-row, tr");
    debugLog(`Found ${rows.length} table rows to process`);
    
    rows.forEach((row) => {
      if (processedElements.has(row)) return;
      processedElements.add(row);

      if (shouldHideElement(row)) {
        row.style.display = "none";
        debugLog("Hiding row:", row.textContent.substring(0, 50) + "...");
      }
    });
    
    // Process table cells (in case rows weren't caught)
    const cells = document.querySelectorAll("td.mat-cell, td");
    debugLog(`Found ${cells.length} table cells to process`);
    
    cells.forEach((cell) => {
      if (processedElements.has(cell)) return;
      processedElements.add(cell);
      
      if (shouldHideElement(cell)) {
        // Try to hide the parent row first
        const parentRow = cell.closest('tr');
        if (parentRow) {
          parentRow.style.display = "none";
          debugLog("Hiding parent row of cell:", cell.textContent);
        } else {
          cell.style.display = "none";
          debugLog("Hiding cell:", cell.textContent);
        }
      }
    });
    
    // Process Angular Material specific elements
    const matElements = document.querySelectorAll(
      '.mat-card, mat-card, .mat-expansion-panel, mat-expansion-panel, ' +
      '.mat-list-item, mat-list-item, mat-option, .mat-option'
    );
    
    debugLog(`Found ${matElements.length} Angular Material elements to process`);
    
    matElements.forEach((element) => {
      if (processedElements.has(element)) return;
      processedElements.add(element);
      
      if (shouldHideElement(element)) {
        element.style.display = "none";
        
        // If it's an option, also disable it
        if (element.tagName === "MAT-OPTION" || element.classList.contains('mat-option')) {
          element.setAttribute('disabled', 'true');
          element.classList.add('mat-option-disabled');
          debugLog("Hiding and disabling option:", element.textContent);
        } else {
          debugLog("Hiding element:", element.tagName, element.textContent.substring(0, 50) + "...");
        }
      }
    });
    
    // Process dropdown panels
    const panels = document.querySelectorAll('.mat-mdc-select-panel, .cdk-overlay-pane');
    panels.forEach(panel => {
      const options = panel.querySelectorAll('mat-option');
      
      options.forEach(option => {
        if (processedElements.has(option)) return;
        processedElements.add(option);
        
        if (shouldHideElement(option)) {
          option.style.display = "none";
          option.setAttribute('disabled', 'true');
          option.classList.add('mat-option-disabled');
          debugLog("Hiding dropdown option:", option.textContent);
        }
      });
    });
    
    // Process any other elements with text that might contain loan numbers
    const allElements = document.querySelectorAll('div, span, p, a, li');
    
    allElements.forEach(element => {
      if (processedElements.has(element)) return;
      
      const text = element.innerText || element.textContent || "";
      // Only process if it might contain a loan number (to save performance)
      if (/\d{5,}/.test(text) || /[A-Z0-9]{5,}/.test(text)) {
        processedElements.add(element);
        
        if (shouldHideElement(element)) {
          element.style.display = "none";
          debugLog("Hiding general element:", element.tagName, text.substring(0, 50) + "...");
        }
      }
    });
  }

  /**
   * Force-apply CSS to hide elements with loan numbers
   */
  function injectFilterStyles() {
    // Create a style element if it doesn't exist
    let styleEl = document.getElementById('loan-filter-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'loan-filter-styles';
      document.head.appendChild(styleEl);
    }
    
    // This will be filled with selectors for elements to hide
    const selectors = [];
    
    // Only proceed if we have storedNumbersSet
    if (!isStoredNumbersSetAvailable()) return;
    
    // Get all elements with text content
    const elements = document.querySelectorAll('*');
    
    elements.forEach(el => {
      // Skip if already processed or if it's a script/style
      if (processedElements.has(el) || 
          el.tagName === 'SCRIPT' || 
          el.tagName === 'STYLE' || 
          el.tagName === 'META' || 
          el.tagName === 'LINK') {
        return;
      }
      
      const text = el.innerText || el.textContent || '';
      
      // Check if this is a brand option
      const isBrandOption = (
        (el.tagName === "MAT-OPTION" || el.classList.contains('mat-option')) &&
        (el.closest('mat-select[name="brandSelect"]') || 
         el.closest('.mat-select[name="brandSelect"]') ||
         text.includes('Brand') || 
         extractBrandCode(text))
      );
      
      if (isBrandOption) {
        const brandCode = extractBrandCode(text);
        if (brandCode && !brandHasAllowedLoans(brandCode)) {
          // Add a unique class to this element
          const uniqueClass = `loan-filter-hide-${Math.random().toString(36).substring(2, 10)}`;
          el.classList.add(uniqueClass);
          selectors.push(`.${uniqueClass}`);
          processedElements.add(el);
          return;
        }
      }
      
      // Check for loan numbers
      const loanNumbers = extractLoanNumbers(text);
      
      if (loanNumbers.length > 0) {
        // Check if all loan numbers should be filtered
        let shouldFilter = true;
        
        for (const loanNumber of loanNumbers) {
          if (isLoanNumberAllowed(loanNumber)) {
            shouldFilter = false;
            break;
          }
        }
        
        if (shouldFilter) {
          // Add a unique class to this element
          const uniqueClass = `loan-filter-hide-${Math.random().toString(36).substring(2, 10)}`;
          el.classList.add(uniqueClass);
          selectors.push(`.${uniqueClass}`);
          processedElements.add(el);
        }
      }
    });
    
    // If we have elements to hide, update the style
    if (selectors.length > 0) {
      styleEl.textContent = `
        ${selectors.join(', ')} {
          display: none !important;
        }
      `;
      debugLog(`Applied CSS to hide ${selectors.length} elements`);
    }
  }

  // Set up mutation observer to detect DOM changes
  function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      let dropdownOpened = false;

      for (const mutation of mutations) {
        // Check for added nodes
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) { // Element node
              shouldProcess = true;
              
              // Check if this is a dropdown panel
              if (node.classList && 
                  (node.classList.contains('mat-mdc-select-panel') || 
                   node.classList.contains('cdk-overlay-pane') ||
                   node.classList.contains('mat-select-panel'))) {
                dropdownOpened = true;
              }
              
              break;
            }
          }
        }
      }

      if (shouldProcess) {
        setTimeout(processAllElements, 100);
      }
      
      if (dropdownOpened) {
        setTimeout(processBrandOptions, 100);
        setTimeout(processBrandOptions, 300);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  // Patch Loansphere_Messages.js to intercept brand dropdown creation
  function patchLoansphereMessagesJs() {
    debugLog("Patching Loansphere_Messages.js functions...");
    
    // Check if the initializeDropdowns function exists or will be defined
    if (typeof window.originalInitializeDropdowns === 'undefined') {
      // Store original function if it exists
      if (typeof window.initializeDropdowns === 'function') {
        window.originalInitializeDropdowns = window.initializeDropdowns;
      }
      
      // Create a wrapper for when it gets defined
      Object.defineProperty(window, 'initializeDropdowns', {
        configurable: true,
        get: function() {
          return window._initializeDropdownsWrapper || function() {};
        },
        set: function(newFunc) {
          // Store the original function
          window.originalInitializeDropdowns = newFunc;
          
          // Create a wrapper function
          window._initializeDropdownsWrapper = function() {
            // Call the original function
            window.originalInitializeDropdowns.apply(this, arguments);
            
            // Then process brand dropdowns
            debugLog("initializeDropdowns called, processing brand dropdowns...");
            setTimeout(() => {
              window._forceRefreshBrandsData = true;
              delete window.extractedBrandsData;
              processCustomBrandDropdowns();
            }, 100);
          };
        }
      });
    }
  }

  // ===== SEARCH RESULTS FUNCTIONALITY =====

  /**
   * Show a "Loan is not provisioned" alert message for a loan number
   */
  function showNotProvisionedAlert(loanNumber) {
    // Remove any existing alert
    removeNotProvisionedAlert();
    
    // Set flags to indicate we're showing a not provisioned message
    window._showingNotProvisionedMessage = true;
    window._restrictedLoanNumber = loanNumber;
    
    // Create the alert container
    const alertContainer = document.createElement('div');
    alertContainer.id = 'loan-not-provisioned-alert';
    alertContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background-color: #fff;
      border-left: 4px solid #f44336;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      padding: 16px;
      border-radius: 4px;
      display: flex;
      align-items: flex-start;
      max-width: 400px;
      font-family: Arial, sans-serif;
    `;
    
    // Create the alert content
    alertContainer.innerHTML = `
      <div style="font-size: 24px; margin-right: 16px;">⚠️</div>
      <div style="flex: 1;">
        <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px; color: #f44336;">
          Loan is not provisioned to the user
        </div>
        <div style="color: #333; margin-bottom: 8px;">
          Loan number <strong>${loanNumber}</strong> is not provisioned to the current user.
        </div>
      </div>
      <button onclick="removeNotProvisionedAlert(true)" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999; padding: 0; margin-left: 8px;">×</button>
    `;
    
    // Add to the page
    document.body.appendChild(alertContainer);
    
    // Also update the table message if it exists
    const tableBody = document.getElementById('messagesTableBody');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 30px;">
            <div style="color: #f44336; font-weight: bold; font-size: 16px;">
              <div style="margin-bottom: 10px;">⚠️</div>
              <div>Loan is not provisioned to the user</div>
              <div style="font-size: 14px; margin-top: 5px;">Loan number: ${loanNumber}</div>
            </div>
          </td>
        </tr>
      `;
    }
    
    // Keep checking and re-showing the alert if it gets removed
    const checkInterval = setInterval(() => {
      if (!document.getElementById('loan-not-provisioned-alert') && 
          window._showingNotProvisionedMessage && 
          window._restrictedLoanNumber === loanNumber) {
        document.body.appendChild(alertContainer.cloneNode(true));
      }
    }, 100);
    
    // Store the interval ID on the alert container
    alertContainer._checkInterval = checkInterval;
    
    // Clear the interval after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
    }, 30000);
    updateTableMessage(loanNumber);
    return alertContainer;
  }
  
  /**
   * Remove any existing "Loan is not provisioned" alert
   * @param {boolean} forceRemove - If true, remove the alert regardless of minimum display time
   */
  function removeNotProvisionedAlert(forceRemove = false) {
    const existingAlert = document.getElementById('loan-not-provisioned-alert');
    if (existingAlert) {
      // Only remove if force remove is true or we're not showing a restricted message
      if (forceRemove || !window._showingNotProvisionedMessage) {
        // Clear the check interval if it exists
        if (existingAlert._checkInterval) {
          clearInterval(existingAlert._checkInterval);
        }
        
        // Reset flags if force removing
        if (forceRemove) {
          window._showingNotProvisionedMessage = false;
          window._restrictedLoanNumber = null;
        }
        
        existingAlert.remove();
      }
    }
  }
  
  function updateTableMessage(loanNumber) {
    const tableBody = document.getElementById('messagesTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 30px;">
          <div style="color: #f44336; font-weight: bold; font-size: 16px; background-color: #fff3f3; border: 1px solid #ffcdd2; padding: 20px; border-radius: 4px;">
            <div style="margin-bottom: 10px;">⚠️</div>
            <div>Loan is not provisioned to the user</div>
            <div style="font-size: 14px; margin-top: 5px;">Loan number: ${loanNumber}</div>
          </div>
        </td>
      </tr>
    `;

    // Add observer to prevent message from being overwritten
    if (!tableBody._notProvisionedObserver) {
      const observer = new MutationObserver((mutations) => {
        if (window._showingNotProvisionedMessage && 
            window._restrictedLoanNumber === loanNumber &&
            (!tableBody.innerHTML.includes('Loan is not provisioned') ||
             !tableBody.innerHTML.includes(loanNumber))) {
          updateTableMessage(loanNumber);
        }
      });

      observer.observe(tableBody, {
        childList: true,
        subtree: true,
        characterData: true
      });

      tableBody._notProvisionedObserver = observer;
    }
  }
  /**
   * Add custom styles for restricted status and alert
   */
  function addRestrictedStyles() {
    if (!document.getElementById('loan-filter-search-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'loan-filter-search-styles';
      styleEl.textContent = `
        .status-restricted {
          background-color: #f44336;
          color: white;
          padding: 3px 8px;
          border-radius: 4px;
        }
        
        .loan-not-provisioned-alert {
          position: fixed !important;
          top: 20px !important;
          right: 20px !important;
          z-index: 999999 !important;
          background-color: #fff !important;
          border-left: 6px solid #f44336 !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
          padding: 20px !important;
          border-radius: 4px !important;
          display: flex !important;
          align-items: flex-start !important;
          max-width: 400px !important;
          animation: loanAlertSlideIn 0.5s ease-out !important;
          opacity: 1 !important;
          visibility: visible !important;
          pointer-events: auto !important;
          transition: opacity 0.3s ease !important;
          font-family: Arial, sans-serif !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
        }
        
        @keyframes loanAlertSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        
        /* Add a pulsing effect to make it more noticeable */
        .loan-not-provisioned-alert::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 4px;
          box-shadow: 0 0 0 6px rgba(244, 67, 54, 0.3);
          animation: loanAlertPulse 2s infinite;
          pointer-events: none;
        }
        
        @keyframes loanAlertPulse {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }
        
        .loan-not-provisioned-alert .alert-icon {
          font-size: 24px;
          margin-right: 16px;
        }
        
        .loan-not-provisioned-alert .alert-content {
          flex: 1;
        }
        
        .loan-not-provisioned-alert .alert-title {
          font-weight: bold;
          font-size: 16px;
          margin-bottom: 8px;
          color: #f44336;
        }
        
        .loan-not-provisioned-alert .alert-message {
          color: #333;
        }
        
        .loan-not-provisioned-alert .alert-close {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #999;
          padding: 0;
          margin-left: 8px;
        }
        
        .loan-not-provisioned-alert .alert-close:hover {
          color: #333;
        }
        
        .no-results {
          text-align: center;
          padding: 20px;
          color: #666;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }
  
  /**
   * Check for "No message threads found" message and show alert if needed
   */
  function checkNoThreadsMessage() {
    const tableBody = document.getElementById('messagesTableBody');
    if (!tableBody) return;
    
    // Check if we're already showing a not provisioned alert
    if (window._showingNotProvisionedMessage && 
        document.getElementById('loan-not-provisioned-alert')) {
      // Make sure the table shows the "not provisioned" message
      const rows = tableBody.querySelectorAll('tr');
      if (rows.length === 1) {
        const cell = rows[0].querySelector('td');
        if (cell && cell.textContent.includes('No message threads found')) {
          // Replace with not provisioned message
          cell.innerHTML = `Loan ${window._restrictedLoanNumber} is not provisioned to the user`;
          cell.style.color = '#f44336';
          cell.style.fontWeight = 'bold';
        }
      }
      return; // Don't override the not provisioned alert
    }
    
    const rows = tableBody.querySelectorAll('tr');
    
    // Check if we have the "No message threads found" message
    if (rows.length === 1) {
      const cell = rows[0].querySelector('td');
      if (cell && cell.textContent.includes('No message threads found')) {
        // Get the loan number from the input field
        const loanNumberInput = document.getElementById('loanNumberFilter');
        const loanNumber = loanNumberInput ? loanNumberInput.value.trim() : '';
        
        // If there's a loan number and it's not allowed, show the "not provisioned" alert
        if (loanNumber && !isLoanNumberAllowed(loanNumber)) {
          debugLog(`Found "No message threads found" for restricted loan: ${loanNumber}, showing not provisioned alert`);
          
          // Replace the "No message threads found" text with "Loan is not provisioned" text
          cell.innerHTML = `Loan ${loanNumber} is not provisioned to the user`;
          cell.style.color = '#f44336';
          cell.style.fontWeight = 'bold';
          
          // Show the not provisioned alert
          showNotProvisionedAlert(loanNumber);
        }
      }
    }
  }
  
  /**
   * Override the applyFilters function to handle restricted loans
   */
  function patchApplyFilters() {
    // Store the original function
    if (typeof window.originalApplyFilters === 'undefined' && 
        typeof window.applyFilters === 'function') {
      window.originalApplyFilters = window.applyFilters;
      
      // Override the function
      window.applyFilters = function() {
        // Get the loan number from the input field
        const loanNumberInput = document.getElementById('loanNumberFilter');
        const loanNumber = loanNumberInput ? loanNumberInput.value.trim() : '';
        
        // If there's a loan number and it's not allowed, show the "not provisioned" alert
        if (loanNumber && !isLoanNumberAllowed(loanNumber)) {
          debugLog(`Applying filters for restricted loan: ${loanNumber}`);
          
          // Set a flag to indicate we're showing a not provisioned message
          window._showingNotProvisionedMessage = true;
          window._restrictedLoanNumber = loanNumber;
          
          // Show the not provisioned alert
          showNotProvisionedAlert(loanNumber);
          
          // Prevent any further processing
          return; // Skip the original function
        } else {
          // Reset the flag if we're not showing a restricted message
          window._showingNotProvisionedMessage = false;
          window._restrictedLoanNumber = null;
          
          // Remove any existing alert
          removeNotProvisionedAlert();
        }
        
        // For other cases, call the original function
        window.originalApplyFilters();
        
        // Check if we got "No message threads found" but the loan number is not allowed
        setTimeout(checkNoThreadsMessage, 100);
        
        // Double-check after a longer delay to ensure alert stays
        if (loanNumber && !isLoanNumberAllowed(loanNumber)) {
          setTimeout(() => {
            if (!document.getElementById('loan-not-provisioned-alert')) {
              debugLog(`Re-applying not provisioned alert for ${loanNumber} after delay`);
              showNotProvisionedAlert(loanNumber);
            }
          }, 500);
        }
      };
      
      debugLog("Patched applyFilters function");
    }
  }
  
  /**
   * Preserve the sort order when filtering threads
   * @param {Array} threads - The threads to sort
   * @returns {Array} - The sorted threads
   */
  function preserveSortOrder(threads) {
    if (!threads || !Array.isArray(threads) || threads.length <= 1) {
      return threads;
    }
    
    // Try to determine the current sort order from the UI
    let sortField = null;
    let sortDirection = 'asc';
    
    // Look for sort indicators in the table headers
    const sortHeaders = document.querySelectorAll('th.sorted, th.sort-asc, th.sort-desc, th.mat-sort-header-sorted');
    if (sortHeaders.length > 0) {
      const sortHeader = sortHeaders[0];
      
      // Get the sort field from the header
      sortField = sortHeader.getAttribute('data-sort') || 
                 sortHeader.getAttribute('mat-sort-header') || 
                 sortHeader.textContent.trim().toLowerCase();
      
      // Determine sort direction
      if (sortHeader.classList.contains('sort-desc') || 
          sortHeader.classList.contains('mat-sort-header-sorted-desc') ||
          sortHeader.querySelector('.sort-desc') ||
          sortHeader.querySelector('.mat-sort-header-arrow.desc')) {
        sortDirection = 'desc';
      }
      
      debugLog(`Detected sort: ${sortField} ${sortDirection}`);
    }
    
    // If we couldn't determine the sort field from the UI, check for a sort function
    if (!sortField && window.currentSortField) {
      sortField = window.currentSortField;
      sortDirection = window.currentSortDirection || 'asc';
      debugLog(`Using stored sort: ${sortField} ${sortDirection}`);
    }
    
    // If we have a sort field, sort the threads
    if (sortField) {
      debugLog(`Sorting threads by ${sortField} ${sortDirection}`);
      
      return [...threads].sort((a, b) => {
        let valueA = a[sortField];
        let valueB = b[sortField];
        
        // Handle dates
        if (sortField.includes('date') || sortField.includes('time')) {
          valueA = valueA ? new Date(valueA).getTime() : 0;
          valueB = valueB ? new Date(valueB).getTime() : 0;
        }
        
        // Handle strings
        if (typeof valueA === 'string' && typeof valueB === 'string') {
          valueA = valueA.toLowerCase();
          valueB = valueB.toLowerCase();
        }
        
        // Handle nulls/undefined
        if (valueA === null || valueA === undefined) valueA = '';
        if (valueB === null || valueB === undefined) valueB = '';
        
        // Compare values
        if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
        if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    // If we couldn't determine the sort field, return the threads as is
    return threads;
  }
  
  /**
   * Override the populateMessageThreads function to handle restricted loans
   */
  function patchPopulateMessageThreads() {
    if (typeof window.originalPopulateMessageThreads === 'undefined' && 
        typeof window.populateMessageThreads === 'function') {
      
      window.originalPopulateMessageThreads = window.populateMessageThreads;
      
      window.populateMessageThreads = function(filteredThreads = null) {
        const threads = filteredThreads || window.messageThreadsData;
        
        // Check if we're already showing a not provisioned alert
        if (window._showingNotProvisionedMessage && 
            document.getElementById('loan-not-provisioned-alert')) {
          debugLog(`populateMessageThreads called but we're already showing a not provisioned alert for ${window._restrictedLoanNumber}`);
          
          // Make sure the table shows the "not provisioned" message
          const tableBody = document.getElementById('messagesTableBody');
          if (tableBody) {
            const rows = tableBody.querySelectorAll('tr');
            if (rows.length === 1) {
              const cell = rows[0].querySelector('td');
              if (cell && cell.textContent.includes('No message threads found')) {
                cell.innerHTML = `
                  <div style="color: #f44336; font-weight: bold; padding: 20px; font-size: 16px; background-color: #fff3f3; border: 1px solid #ffcdd2; text-align: center;">
                    <div style="margin-bottom: 10px;">⚠️</div>
                    <div>Loan is not provisioned to the user</div>
                    <div style="font-size: 14px; margin-top: 5px;">Loan number: ${window._restrictedLoanNumber}</div>
                  </div>
                `;
              }
            }
          }
          
          return; // Don't override the not provisioned alert
        }
        
        // Get the loan number from the input field
        const loanNumberInput = document.getElementById('loanNumberFilter');
        const loanNumber = loanNumberInput ? loanNumberInput.value.trim() : '';
        
        debugLog(`populateMessageThreads called with ${threads ? threads.length : 0} threads, loan number: ${loanNumber}`);
        
        // DIRECT CHECK: If there's a loan number and it's not allowed, show the "not provisioned" alert
        if (loanNumber && !isLoanNumberAllowed(loanNumber)) {
          debugLog(`Loan ${loanNumber} is not allowed, showing not provisioned alert`);
          
          // Set flags to indicate we're showing a not provisioned message
          window._showingNotProvisionedMessage = true;
          window._restrictedLoanNumber = loanNumber;
          
          // Show the not provisioned alert
          showNotProvisionedAlert(loanNumber);
          return; // Exit early
        } else {
          // Reset the flag if we're not showing a restricted message
          window._showingNotProvisionedMessage = false;
          window._restrictedLoanNumber = null;
          
          // Remove any existing alert
          removeNotProvisionedAlert();
        }
        
        // Filter threads to only include those with allowed loan numbers
        let allowedThreads = threads;
        if (threads && Array.isArray(threads) && isStoredNumbersSetAvailable()) {
          allowedThreads = threads.filter(thread => {
            // If thread has a loan number, check if it's allowed
            if (thread && thread.loanNumber) {
              return isLoanNumberAllowed(thread.loanNumber);
            }
            return true; // Keep threads without loan numbers
          });
          
          debugLog(`Filtered message threads: ${allowedThreads.length} of ${threads.length} allowed`);
          
          // Apply field-based filtering if we have search fields
          const searchForm = document.querySelector('form.search-form, .filter-form, .search-container');
          if (searchForm) {
            allowedThreads = filterMessageThreadsByFields(allowedThreads);
            debugLog(`After field filtering: ${allowedThreads.length} threads`);
          }
          
          // Preserve the sort order
          allowedThreads = preserveSortOrder(allowedThreads);
        }
        
        // Call the original function with filtered threads
        window.originalPopulateMessageThreads(allowedThreads);
        
        // Check if we got "No message threads found" but the loan number is not allowed
        if (loanNumber) {
          const tableBody = document.getElementById('messagesTableBody');
          if (tableBody) {
            const rows = tableBody.querySelectorAll('tr');
            
            if (rows.length === 1) {
              const cell = rows[0].querySelector('td');
              if (cell && cell.textContent.includes('No message threads found')) {
                if (!isLoanNumberAllowed(loanNumber)) {
                  debugLog(`Found "No message threads found" for loan ${loanNumber}, showing not provisioned alert`);
                  window._showingNotProvisionedMessage = true;
                  window._restrictedLoanNumber = loanNumber;
                  
                  // Update the cell text
                  cell.textContent = `Loan ${loanNumber} is not provisioned to the user`;
                  cell.style.color = '#f44336';
                  
                  // Show the not provisioned alert
                  showNotProvisionedAlert(loanNumber);
                }
              }
            }
          }
        }
        
        // Double-check after a delay to ensure alert stays
        if (loanNumber && !isLoanNumberAllowed(loanNumber)) {
          setTimeout(() => {
            if (!document.getElementById('loan-not-provisioned-alert')) {
              debugLog(`Re-applying not provisioned alert for ${loanNumber} after delay`);
              showNotProvisionedAlert(loanNumber);
            }
            
            // Also check the table message
            const tableBody = document.getElementById('messagesTableBody');
            if (tableBody) {
              const rows = tableBody.querySelectorAll('tr');
              if (rows.length === 1) {
                const cell = rows[0].querySelector('td');
                if (cell && cell.textContent.includes('No message threads found')) {
                  cell.textContent = `Loan ${loanNumber} is not provisioned to the user`;
                  cell.style.color = '#f44336';
                }
              }
            }
          }, 500);
        }
      };
      
      debugLog("Overrode populateMessageThreads function");
    }
  }
  
  /**
   * Add event listeners for search inputs
   */
  function addSearchEventListeners() {
    // Add event listener to the loan number filter input
    const loanNumberInput = document.getElementById('loanNumberFilter');
    if (loanNumberInput) {
      loanNumberInput.addEventListener('keyup', function(event) {
        // If Enter key is pressed, check if this is a restricted loan
        if (event.key === 'Enter') {
          const loanNumber = this.value.trim();
          if (loanNumber && !isLoanNumberAllowed(loanNumber)) {
            debugLog(`Enter key pressed for restricted loan: ${loanNumber}`);
            
            // Set flags to indicate we're showing a not provisioned message
            window._showingNotProvisionedMessage = true;
            window._restrictedLoanNumber = loanNumber;
            
            // Show the not provisioned alert
            showNotProvisionedAlert(loanNumber);
            event.preventDefault();
            return false;
          }
        }
      });
    }
    
    // Also add event listener to the Apply Filters button
    const applyFiltersButton = document.getElementById('applyFilters');
    if (applyFiltersButton) {
      applyFiltersButton.addEventListener('click', function(event) {
        const loanNumberInput = document.getElementById('loanNumberFilter');
        const loanNumber = loanNumberInput ? loanNumberInput.value.trim() : '';
        
        if (loanNumber && !isLoanNumberAllowed(loanNumber)) {
          debugLog(`Apply Filters clicked for restricted loan: ${loanNumber}`);
          
          // Set flags to indicate we're showing a not provisioned message
          window._showingNotProvisionedMessage = true;
          window._restrictedLoanNumber = loanNumber;
          
          // Show the not provisioned alert
          showNotProvisionedAlert(loanNumber);
          event.stopPropagation();
          return false;
        }
      }, true); // Use capturing to intercept the event before the original handler
    }
  }
  
  /**
   * Set up a mutation observer to detect when the table is updated
   */
  function setupSearchMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && 
            (mutation.target.id === 'messagesTableBody' || 
             mutation.target.closest('#messagesTableBody'))) {
          
          // If we're showing a not provisioned alert but it was removed
          if (window._showingNotProvisionedMessage && 
              !document.getElementById('loan-not-provisioned-alert')) {
            
            debugLog(`Mutation observer: Not provisioned alert was removed, restoring it for ${window._restrictedLoanNumber}`);
            showNotProvisionedAlert(window._restrictedLoanNumber);
          } else {
            // Otherwise check for "No message threads found" message
            checkNoThreadsMessage();
            
            // Process the table rows to filter out restricted loans
            const tableBody = document.getElementById('messagesTableBody');
            if (tableBody) {
              const rows = tableBody.querySelectorAll('tr');
              
              // Skip if there's only one row (likely "No message threads found")
              if (rows.length > 1) {
                debugLog(`Mutation observer: Processing ${rows.length} table rows`);
                
                // Process each row to hide restricted loans
                rows.forEach(row => {
                  // Skip if already processed
                  if (processedElements.has(row)) return;
                  processedElements.add(row);
                  
                  if (shouldHideElement(row)) {
                    row.style.display = "none";
                    debugLog("Hiding table row:", row.textContent.substring(0, 50) + "...");
                  }
                });
              }
            }
          }
        }
      }
    });
    
    // Start observing the table body
    const tableBody = document.getElementById('messagesTableBody');
    if (tableBody) {
      observer.observe(tableBody, { childList: true, subtree: true });
    }
    
    // Also observe the container for when the table is recreated
    const container = document.querySelector('.message-threads-container');
    if (container) {
      observer.observe(container, { childList: true, subtree: true });
    }
    
    // Also observe the body for when the alert is removed
    observer.observe(document.body, { childList: true, subtree: false });
    
    // Look for refresh button and add observer
    const refreshButton = document.querySelector('button[title="Refresh"], button.refresh-button, button.btn-refresh');
    if (refreshButton) {
      debugLog('Found refresh button, adding observer');
      
      // Add click handler if not already added
      if (!refreshButton._hasRefreshClickHandler) {
        refreshButton._hasRefreshClickHandler = true;
        
        refreshButton.addEventListener('click', () => {
          debugLog('Refresh button clicked, scheduling filtering');
          
          // Schedule multiple checks to ensure filtering is applied after refresh
          setTimeout(processAllElements, 300);
          setTimeout(processAllElements, 600);
          setTimeout(processAllElements, 1000);
        });
      }
    }
    
    // Look for search form and add observers to all filter fields
    const searchForm = document.querySelector('form.search-form, .filter-form, .search-container');
    if (searchForm) {
      debugLog('Found search form, adding observers to filter fields');
      
      // Find all input fields, selects, and checkboxes in the form
      const filterFields = searchForm.querySelectorAll('input, select');
      
      filterFields.forEach(field => {
        // Skip if already processed
        if (field._hasFilterChangeHandler) return;
        field._hasFilterChangeHandler = true;
        
        // Add change handler
        field.addEventListener('change', () => {
          debugLog(`Filter field changed: ${field.name || field.id}`);
          
          // Schedule filtering after the change is processed
          setTimeout(processAllElements, 300);
        });
      });
    }
    
    return observer;
  }
  
  /**
   * Ensure the "not provisioned" alert stays visible
   */
  function ensureNotProvisionedAlertVisible() {
    if (!window._showingNotProvisionedMessage || !window._restrictedLoanNumber) {
      return;
    }
    
    // Check if the alert is still there
    const existingAlert = document.getElementById('loan-not-provisioned-alert');
    const hasRestrictedAlert = existingAlert !== null;
    
    if (!hasRestrictedAlert) {
      debugLog(`Periodic check: Not provisioned alert was removed, restoring it for ${window._restrictedLoanNumber}`);
      
      // Create a new alert with a higher z-index and make it more persistent
      const alertContainer = showNotProvisionedAlert(window._restrictedLoanNumber);
      
      // Apply additional styles to make it more persistent
      if (alertContainer) {
        alertContainer.style.zIndex = "999999"; // Extremely high z-index
        alertContainer.style.position = "fixed";
        alertContainer.style.top = "20px";
        alertContainer.style.right = "20px";
        
        // Prevent other scripts from easily removing it
        alertContainer._keepVisible = true;
        
        // Add a MutationObserver to detect if it's being removed
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'childList' && 
                mutation.removedNodes.length > 0 &&
                Array.from(mutation.removedNodes).some(node => 
                  node.id === 'loan-not-provisioned-alert' || 
                  (node.contains && node.contains(alertContainer))
                )) {
              // If it's being removed, immediately add it back
              setTimeout(() => {
                if (!document.getElementById('loan-not-provisioned-alert')) {
                  document.body.appendChild(alertContainer);
                  
                  // Reset opacity in case it was being faded out
                  alertContainer.style.opacity = '1';
                }
              }, 10);
            }
          }
        });
        
        // Observe the document body for changes
        observer.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      // Make sure the existing alert is visible and has the right styles
      existingAlert.style.opacity = '1';
      existingAlert.style.display = 'flex';
      existingAlert.style.zIndex = '999999';
      
      // Also check the table message
      const tableBody = document.getElementById('messagesTableBody');
      if (tableBody) {
        const rows = tableBody.querySelectorAll('tr');
        if (rows.length === 1) {
          const cell = rows[0].querySelector('td');
          if (cell && !cell.textContent.includes('not provisioned')) {
            cell.innerHTML = `
              <div style="color: #f44336; font-weight: bold; padding: 20px; font-size: 16px; background-color: #fff3f3; border: 1px solid #ffcdd2; text-align: center;">
                <div style="margin-bottom: 10px;">⚠️</div>
                <div>Loan is not provisioned to the user</div>
                <div style="font-size: 14px; margin-top: 5px;">Loan number: ${window._restrictedLoanNumber}</div>
              </div>
            `;
          }
        }
      }
    }
  }

  /**
   * Filter message threads based on search fields
   * This handles filtering for Queue, Category, First Name, Last Name, Status, Deleted Messages, Start Date and End Date
   */
  function filterMessageThreadsByFields(threads) {
    if (!threads || !Array.isArray(threads)) return threads;
    
    debugLog(`Filtering ${threads.length} message threads by search fields`);
    
    // Get filter values from form fields
    const queueFilter = document.getElementById('queueFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const firstNameFilter = document.getElementById('firstNameFilter');
    const lastNameFilter = document.getElementById('lastNameFilter');
    const statusFilter = document.getElementById('statusFilter');
    const deletedMessagesFilter = document.getElementById('deletedMessagesFilter');
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const brandFilter = document.querySelector('.brand-dropdown .selected-option') || 
                        document.getElementById('brandFilter');
    
    // Get selected brand (if any)
    let selectedBrand = null;
    let selectedBrandCode = null;
    if (brandFilter) {
      selectedBrand = brandFilter.textContent.trim();
      if (selectedBrand === 'All Brands') {
        selectedBrand = null;
      } else {
        // Extract brand code from the selected brand text
        selectedBrandCode = extractBrandCode(selectedBrand);
        debugLog(`Extracted brand code from selected brand: ${selectedBrandCode}`);
      }
    }
    
    debugLog(`Selected brand filter: ${selectedBrand || 'All Brands'} (Code: ${selectedBrandCode || 'None'})`);
    
    // Filter threads based on field values and allowed loan numbers
    const filteredThreads = threads.filter(thread => {
      // First check if the loan number is allowed
      if (thread.loanNumber && !isLoanNumberAllowed(thread.loanNumber)) {
        return false;
      }
      
      // Then check if the thread matches the brand filter
      if (selectedBrand && thread.brand) {
        // Try exact match first
        if (thread.brand === selectedBrand) {
          return true; // Exact match, keep this thread
        }
        
        // If we have a brand code, check if it's in the thread brand
        if (selectedBrandCode) {
          const threadBrandCode = extractBrandCode(thread.brand);
          if (threadBrandCode && threadBrandCode === selectedBrandCode) {
            return true; // Brand code matches, keep this thread
          }
        }
        
        // Check if the thread brand contains the selected brand or vice versa
        if (thread.brand.includes(selectedBrand) || selectedBrand.includes(thread.brand)) {
          return true; // Partial match, keep this thread
        }
        
        return false; // No match, filter out this thread
      }
      
      // Check queue filter
      if (queueFilter && queueFilter.value && 
          thread.queue && thread.queue !== queueFilter.value && 
          queueFilter.value !== 'All Queues') {
        return false;
      }
      
      // Check category filter
      if (categoryFilter && categoryFilter.value && 
          thread.category && thread.category !== categoryFilter.value && 
          categoryFilter.value !== 'All Categories') {
        return false;
      }
      
      // Check first name filter
      if (firstNameFilter && firstNameFilter.value && 
          thread.firstName && !thread.firstName.toLowerCase().includes(firstNameFilter.value.toLowerCase())) {
        return false;
      }
      
      // Check last name filter
      if (lastNameFilter && lastNameFilter.value && 
          thread.lastName && !thread.lastName.toLowerCase().includes(lastNameFilter.value.toLowerCase())) {
        return false;
      }
      
      // Check status filter
      if (statusFilter && statusFilter.value && 
          thread.status && thread.status !== statusFilter.value && 
          statusFilter.value !== 'All Statuses') {
        return false;
      }
      
      // Check deleted messages filter
      if (deletedMessagesFilter && deletedMessagesFilter.checked === true && 
          thread.deleted !== true) {
        return false;
      }
      
      // Check date range filters
      if (startDateFilter && startDateFilter.value && thread.date) {
        const threadDate = new Date(thread.date);
        const startDate = new Date(startDateFilter.value);
        if (threadDate < startDate) {
          return false;
        }
      }
      
      if (endDateFilter && endDateFilter.value && thread.date) {
        const threadDate = new Date(thread.date);
        const endDate = new Date(endDateFilter.value);
        // Set end date to end of day
        endDate.setHours(23, 59, 59, 999);
        if (threadDate > endDate) {
          return false;
        }
      }
      
      // If we get here, the thread passes all filters
      return true;
    });
    
    debugLog(`Filtered threads: ${filteredThreads.length} of ${threads.length} passed all filters`);
    return filteredThreads;
  }
  
  /**
   * Patch the search/filter function to handle field-based filtering
   */
  function patchSearchFunction() {
    // Look for search or filter function in the page
    if (typeof window.originalSearchMessages === 'undefined' && 
        typeof window.searchMessages === 'function') {
      
      window.originalSearchMessages = window.searchMessages;
      
      window.searchMessages = function() {
        // Call the original search function first
        window.originalSearchMessages.apply(this, arguments);
        
        // Then filter the results to remove restricted loans
        setTimeout(() => {
          const tableBody = document.getElementById('messagesTableBody');
          if (tableBody) {
            const rows = tableBody.querySelectorAll('tr');
            
            // Skip if there's only one row (likely "No message threads found")
            if (rows.length <= 1) return;
            
            // Process each row to hide restricted loans
            rows.forEach(row => {
              if (processedElements.has(row)) return;
              processedElements.add(row);
              
              if (shouldHideElement(row)) {
                row.style.display = "none";
                debugLog("Hiding search result row:", row.textContent.substring(0, 50) + "...");
              }
            });
          }
        }, 100);
      };
      
      debugLog("Patched searchMessages function");
    }
    
    // Also check for a filter function
    if (typeof window.originalFilterMessages === 'undefined' && 
        typeof window.filterMessages === 'function') {
      
      window.originalFilterMessages = window.filterMessages;
      
      window.filterMessages = function() {
        // Call the original filter function first
        window.originalFilterMessages.apply(this, arguments);
        
        // Then filter the results to remove restricted loans
        setTimeout(() => {
          const tableBody = document.getElementById('messagesTableBody');
          if (tableBody) {
            const rows = tableBody.querySelectorAll('tr');
            
            // Skip if there's only one row (likely "No message threads found")
            if (rows.length <= 1) return;
            
            // Process each row to hide restricted loans
            rows.forEach(row => {
              if (processedElements.has(row)) return;
              processedElements.add(row);
              
              if (shouldHideElement(row)) {
                row.style.display = "none";
                debugLog("Hiding filtered row:", row.textContent.substring(0, 50) + "...");
              }
            });
          }
        }, 100);
      };
      
      debugLog("Patched filterMessages function");
    }
  }
  
  /**
   * Patch the refresh function to maintain filtering
   */
  function patchRefreshFunction() {
    // Look for refresh function in the page
    if (typeof window.originalRefreshMessages === 'undefined' && 
        typeof window.refreshMessages === 'function') {
      
      window.originalRefreshMessages = window.refreshMessages;
      
      window.refreshMessages = function() {
        // Call the original refresh function
        window.originalRefreshMessages.apply(this, arguments);
        
        // Then re-apply our filtering
        setTimeout(() => {
          debugLog("Re-applying filtering after refresh");
          processAllElements();
        }, 500);
      };
      
      debugLog("Patched refreshMessages function");
    }
    
    // Also check for a refresh button
    const refreshButton = document.querySelector('button[title="Refresh"], button.refresh-button, button.btn-refresh');
    if (refreshButton && !refreshButton._hasRefreshListener) {
      refreshButton._hasRefreshListener = true;
      
      refreshButton.addEventListener('click', () => {
        debugLog("Refresh button clicked, scheduling re-filtering");
        
        // Schedule multiple checks to ensure filtering is applied after refresh
        setTimeout(processAllElements, 500);
        setTimeout(processAllElements, 1000);
        setTimeout(processAllElements, 2000);
      });
      
      debugLog("Added listener to refresh button");
    }
  }
  
  /**
   * Initialize the search results filtering
   */
  function initializeSearchResults() {
    debugLog("Initializing search results filtering");
    
    // Initialize flags
    window._showingNotProvisionedMessage = false;
    window._restrictedLoanNumber = null;
    
    // Add custom styles
    addRestrictedStyles();
    
    // Patch the applyFilters function
    patchApplyFilters();
    
    // Patch the populateMessageThreads function
    patchPopulateMessageThreads();
    
    // Patch search and filter functions
    patchSearchFunction();
    
    // Patch refresh function
    patchRefreshFunction();
    
    // Add event listeners for search inputs
    addSearchEventListeners();
    
    // Set up mutation observer
    const searchObserver = setupSearchMutationObserver();
    
    // Check for "No message threads found" message
    checkNoThreadsMessage();
    
    // Set up a periodic check for the "No message threads found" message
    const checkInterval = setInterval(checkNoThreadsMessage, 500);
    
    // Set up a very frequent check to ensure the "not provisioned" alert stays visible
    const ensureVisibleInterval = setInterval(ensureNotProvisionedAlertVisible, 50);
    
    // Set up an additional check with a different timing to catch any race conditions
    const backupEnsureVisibleInterval = setInterval(ensureNotProvisionedAlertVisible, 250);
    
    // Expose the filterMessageThreadsByFields function to the window
    window.filterMessageThreadsByFields = filterMessageThreadsByFields;
    
    return { searchObserver, checkInterval, ensureVisibleInterval, backupEnsureVisibleInterval };
  }

  /**
   * Handle refresh button click
   * This ensures that filtering is maintained after refresh
   */
  function handleRefreshButtonClick() {
    const refreshButton = document.querySelector('button[title="Refresh"], button.refresh-button, button.btn-refresh, button[aria-label="Refresh"]');
    
    if (refreshButton && !refreshButton._hasRefreshClickHandler) {
      debugLog('Setting up refresh button handler');
      refreshButton._hasRefreshClickHandler = true;
      
      refreshButton.addEventListener('click', () => {
        debugLog('Refresh button clicked');
        
        // Schedule multiple checks to ensure filtering is applied after refresh
        setTimeout(() => {
          debugLog('Running post-refresh filtering (300ms)');
          processAllElements();
          
          // Re-apply field-based filtering
          if (typeof window.applyFilters === 'function') {
            debugLog('Triggering applyFilters after refresh');
            window.applyFilters();
          } else if (typeof window.searchMessages === 'function') {
            debugLog('Triggering searchMessages after refresh');
            window.searchMessages();
          } else if (typeof window.filterMessages === 'function') {
            debugLog('Triggering filterMessages after refresh');
            window.filterMessages();
          }
        }, 300);
        
        // Additional checks at different intervals
        setTimeout(() => {
          debugLog('Running post-refresh filtering (800ms)');
          processAllElements();
        }, 800);
        
        setTimeout(() => {
          debugLog('Running post-refresh filtering (1500ms)');
          processAllElements();
        }, 1500);
      });
      
      debugLog('Refresh button handler set up');
    }
  }
  
  // ===== MAIN INITIALIZATION =====
  
  // Initial processing
  debugLog("Starting initial page processing");
  processAllElements();
  injectFilterStyles();
  
  // Process brand dropdowns immediately
  processBrandDropdowns();
  processBrandOptions();
  
  // Patch Loansphere_Messages.js
  patchLoansphereMessagesJs();
  
  // Initialize search results filtering
  const { searchObserver, checkInterval, ensureVisibleInterval } = initializeSearchResults();
  
  // Set up refresh button handler
  handleRefreshButtonClick();
  
  // Set up interval for periodic processing
  const intervalId = setInterval(() => {
    processAllElements();
    injectFilterStyles();
    processBrandDropdowns();
    processBrandOptions();
    
    // Check for refresh button in case it was added after initialization
    handleRefreshButtonClick();
  }, FILTER_INTERVAL_MS);
  
  // Add additional checks after a delay to catch any lazy-loaded content
  setTimeout(() => {
    debugLog("Running delayed brand filtering check...");
    window._forceRefreshBrandsData = true;
    delete window.extractedBrandsData;
    processAllElements();
    processBrandDropdowns();
    processBrandOptions();
  }, 2000);

  // Set up mutation observer
  const observer = initMutationObserver();

  // Expose cleanup function
  window.__cleanupLoanFilter = function () {
    clearInterval(intervalId);
    clearInterval(checkInterval);
    clearInterval(ensureVisibleInterval);
    clearInterval(backupEnsureVisibleInterval);
    observer.disconnect();
    searchObserver.disconnect();
    
    // Remove the style elements
    const styleEl = document.getElementById('loan-filter-styles');
    if (styleEl) {
      styleEl.remove();
    }
    
    const searchStyleEl = document.getElementById('loan-filter-search-styles');
    if (searchStyleEl) {
      searchStyleEl.remove();
    }
    
    // Remove any existing alert
    removeNotProvisionedAlert();
    
    // Restore original functions
    if (window.originalPopulateMessageThreads) {
      window.populateMessageThreads = window.originalPopulateMessageThreads;
    }
    
    if (window.originalApplyFilters) {
      window.applyFilters = window.originalApplyFilters;
    }
    
    // Clear cached data and flags
    delete window.extractedBrandsData;
    window._showingNotProvisionedMessage = false;
    window._restrictedLoanNumber = null;
    
    console.log("[LoanFilter] Script cleaned up");
  };

  // Listen for changes to storedNumbersSet
  const originalSetStoredNumbers = window.setStoredNumbersSet;
  window.setStoredNumbersSet = function (newSet) {
    if (typeof originalSetStoredNumbers === "function") {
      originalSetStoredNumbers(newSet);
    } else {
      window.storedNumbersSet = newSet;
    }
    
    debugLog("storedNumbersSet changed, reprocessing page");
    logStoredNumbers();
    
    // Clear cached brands data
    delete window.extractedBrandsData;
    
    // Re-process the page when storedNumbersSet changes
    processAllElements();
    injectFilterStyles();
  };

  // Add helper functions to the window for debugging
  window.checkLoanFiltering = function() {
    logStoredNumbers();
    console.log("[LoanFilter] Reprocessing page...");
    
    // Clear cached brands data to force re-extraction
    delete window.extractedBrandsData;
    window._forceRefreshBrandsData = true;
    
    processAllElements();
    injectFilterStyles();
    
    // Force process brand dropdowns
    processBrandDropdowns();
    processBrandOptions();
    
    return "Loan filtering check complete";
  };
  
  // Expose functions for other scripts to use
  window.isLoanNumberAllowed = isLoanNumberAllowed;
  window.extractBrandsData = extractBrandsData;
  window.showNotProvisionedAlert = showNotProvisionedAlert;
  window.removeNotProvisionedAlert = removeNotProvisionedAlert;
  window.filterMessageThreadsByFields = filterMessageThreadsByFields;
  window.preserveSortOrder = preserveSortOrder;
  
  // Add a helper function to check if all filtering functionality is working
  window.checkFilteringFunctionality = function() {
    console.log("[LoanFilter] Checking filtering functionality...");
    
    // Check if storedNumbersSet is available
    if (!isStoredNumbersSetAvailable()) {
      console.warn("[LoanFilter] storedNumbersSet is not available - filtering will not work properly");
    } else {
      console.log("[LoanFilter] storedNumbersSet is available with " + 
                 (window.storedNumbersSet instanceof Set ? window.storedNumbersSet.size : 
                  Array.isArray(window.storedNumbersSet) ? window.storedNumbersSet.length : 
                  Object.keys(window.storedNumbersSet).length) + " entries");
    }
    
    // Check if we've patched the necessary functions
    console.log("[LoanFilter] Function patching status:");
    console.log("- populateMessageThreads: " + (window.originalPopulateMessageThreads ? "PATCHED" : "NOT PATCHED"));
    console.log("- applyFilters: " + (window.originalApplyFilters ? "PATCHED" : "NOT PATCHED"));
    console.log("- searchMessages: " + (window.originalSearchMessages ? "PATCHED" : "NOT PATCHED"));
    console.log("- filterMessages: " + (window.originalFilterMessages ? "PATCHED" : "NOT PATCHED"));
    console.log("- refreshMessages: " + (window.originalRefreshMessages ? "PATCHED" : "NOT PATCHED"));
    
    // Check for brand dropdown
    const brandDropdowns = document.querySelectorAll('.brand-dropdown, .custom-dropdown');
    console.log("[LoanFilter] Found " + brandDropdowns.length + " brand dropdowns");
    
    // Check for search form fields
    const searchForm = document.querySelector('form.search-form, .filter-form, .search-container');
    if (searchForm) {
      const filterFields = searchForm.querySelectorAll('input, select');
      console.log("[LoanFilter] Found search form with " + filterFields.length + " filter fields");
    } else {
      console.log("[LoanFilter] No search form found");
    }
    
    // Check for refresh button
    const refreshButton = document.querySelector('button[title="Refresh"], button.refresh-button, button.btn-refresh, button[aria-label="Refresh"]');
    console.log("[LoanFilter] Refresh button: " + (refreshButton ? "FOUND" : "NOT FOUND"));
    
    // Force re-processing
    processAllElements();
    processBrandDropdowns();
    
    return "Filtering functionality check complete - see console for details";
  };
  
  // Add a function to specifically check brand filtering
  window.checkBrandFiltering = function() {
    logStoredNumbers();
    console.log("[LoanFilter] Checking brand filtering...");
    
    // Clear cached brands data to force re-extraction
    delete window.extractedBrandsData;
    window._forceRefreshBrandsData = true;
    
    // Extract brands data
    const brandsData = extractBrandsData();
    
    console.log("[LoanFilter] Found " + brandsData.length + " brands:");
    
    // Check each brand
    brandsData.forEach(brand => {
      const hasAllowedLoans = brandHasAllowedLoans(brand.code);
      console.log(`[LoanFilter] Brand ${brand.code}: ${hasAllowedLoans ? 'ALLOWED' : 'FILTERED'} (${brand.loanNumbers.length} loan numbers)`);
    });
    
    // Force process brand dropdowns
    processBrandDropdowns();
    processBrandOptions();
    
    return "Brand filtering check complete - check console for details";
  };

  console.log("[LoanFilter] Combined script ready - use window.checkLoanFiltering() to debug");
})();