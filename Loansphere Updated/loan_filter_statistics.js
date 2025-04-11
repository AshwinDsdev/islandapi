/**
 * Loansphere Dynamic Filter
 * 
 * This script dynamically identifies and filters brand dropdowns and tables
 * in the Loansphere Customer Statistics page.
 * 
 * It works by:
 * 1. Filtering data in memory (borrowersData and brandsData)
 * 2. Finding and filtering any brand dropdown by looking for elements with brand codes
 * 3. Hiding table rows with loan numbers not in storedNumbersSet
 */

(function() {
    console.log("Initializing Loansphere Dynamic Filter...");
    
    // Verify storedNumbersSet exists
    if (!window.storedNumbersSet) {
      console.error("Error: storedNumbersSet is not defined. Please define it before running this script.");
      return;
    }
    
    // For debugging - log the current storedNumbersSet
    console.log("Current storedNumbersSet:", window.storedNumbersSet);
    
    // Backup original data
    const originalBorrowersData = window.borrowersData ? [...window.borrowersData] : [];
    const originalBrandsData = window.brandsData ? [...window.brandsData] : [];
    
    console.log("Original data:", {
      borrowers: originalBorrowersData.length,
      brands: originalBrandsData.length
    });
    
    // Helper function to check if a loan number is allowed
    function isLoanNumberAllowed(loanNumber) {
      if (!window.storedNumbersSet) return true;
      
      if (window.storedNumbersSet instanceof Set) {
        return window.storedNumbersSet.has(loanNumber);
      } else if (Array.isArray(window.storedNumbersSet)) {
        return window.storedNumbersSet.includes(loanNumber);
      } else if (typeof window.storedNumbersSet === "object") {
        return Object.values(window.storedNumbersSet).includes(loanNumber);
      }
      
      return false;
    }
    
    // Filter borrowers data
    function filterBorrowersData() {
      if (!window.borrowersData) return;
      
      // Filter out borrowers with unauthorized loan numbers
      window.borrowersData = originalBorrowersData.filter(borrower => 
        isLoanNumberAllowed(borrower.loanNumber)
      );
      
      console.log(`Filtered borrowers data: ${window.borrowersData.length} of ${originalBorrowersData.length} remain`);
    }
    
    // Filter brands data
    function filterBrandsData() {
      if (!window.brandsData) return;
      
      // First, determine which brands have at least one allowed loan number
      const brandsWithAllowedLoans = new Set();
      
      originalBrandsData.forEach(brand => {
        for (const loanNumber of brand.loanNumbers) {
          if (isLoanNumberAllowed(loanNumber)) {
            brandsWithAllowedLoans.add(brand.id);
            break;
          }
        }
      });
      
      // Filter out brands without any allowed loan numbers
      window.brandsData = originalBrandsData.filter(brand => 
        brandsWithAllowedLoans.has(brand.id)
      );
      
      console.log(`Filtered brands data: ${window.brandsData.length} of ${originalBrandsData.length} remain`);
      console.log("Remaining brands:", window.brandsData.map(b => b.name));
    }
    
    // Find all brand elements in the DOM
    function findBrandElements() {
      // Look for elements with brand-badge class
      const brandBadges = document.querySelectorAll('.brand-badge');
      console.log(`Found ${brandBadges.length} brand badge elements`);
      
      // Look for dropdown menus
      const dropdownMenus = document.querySelectorAll('.dropdown-menu');
      console.log(`Found ${dropdownMenus.length} dropdown menus`);
      
      // Look for select elements that might contain brands
      const selects = document.querySelectorAll('select');
      console.log(`Found ${selects.length} select elements`);
      
      return {
        brandBadges,
        dropdownMenus,
        selects
      };
    }
    
    // Filter brand elements in dropdowns
    function filterBrandElements() {
      const elements = findBrandElements();
      
      // Get the allowed brand codes
      const allowedBrandCodes = new Set(window.brandsData.map(brand => brand.code));
      console.log("Allowed brand codes:", [...allowedBrandCodes]);
      
      // Process brand badges
      let hiddenBadges = 0;
      elements.brandBadges.forEach(badge => {
        const brandCode = badge.textContent.trim();
        const listItem = badge.closest('li') || badge.closest('.dropdown-item') || badge.parentElement;
        
        if (listItem && !allowedBrandCodes.has(brandCode)) {
          listItem.style.display = 'none';
          hiddenBadges++;
        }
      });
      
      console.log(`Hidden ${hiddenBadges} brand elements in the UI`);
      
      // Process dropdown menus
      elements.dropdownMenus.forEach(menu => {
        const items = menu.querySelectorAll('li, .dropdown-item');
        let hiddenItems = 0;
        
        items.forEach((item, index) => {
          // Skip the first item (usually "All Brands")
          if (index === 0) return;
          
          const badge = item.querySelector('.brand-badge');
          if (!badge) return;
          
          const brandCode = badge.textContent.trim();
          
          if (!allowedBrandCodes.has(brandCode)) {
            item.style.display = 'none';
            hiddenItems++;
          }
        });
        
        if (hiddenItems > 0) {
          console.log(`Hidden ${hiddenItems} items in dropdown menu`);
        }
      });
      
      // Process select elements
      elements.selects.forEach(select => {
        const options = select.querySelectorAll('option');
        let hiddenOptions = 0;
        
        options.forEach((option, index) => {
          // Skip the first option (usually "All Brands" or "Select")
          if (index === 0) return;
          
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
        });
        
        if (hiddenOptions > 0) {
          console.log(`Hidden ${hiddenOptions} options in select element`);
        }
      });
    }
    
    // Filter table rows
    function filterTableRows() {
      // Find all tables
      const tables = document.querySelectorAll('table');
      console.log(`Found ${tables.length} tables`);
      
      tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');
        let hiddenRows = 0;
        
        rows.forEach(row => {
          // Look for loan number in the row
          const cells = row.querySelectorAll('td');
          let loanNumber = null;
          
          // Try to find a cell with a loan number format (e.g., 10 digits)
          for (const cell of cells) {
            const text = cell.textContent.trim();
            if (/^\d{10}$/.test(text)) {
              loanNumber = text;
              break;
            }
          }
          
          // If no loan number found, try to find it in data attributes
          if (!loanNumber) {
            loanNumber = row.getAttribute('data-loan-number') || 
                         row.getAttribute('data-loan') || 
                         row.getAttribute('data-id');
          }
          
          // If we found a loan number and it's not allowed, hide the row
          if (loanNumber && !isLoanNumberAllowed(loanNumber)) {
            row.style.display = 'none';
            hiddenRows++;
          }
        });
        
        if (hiddenRows > 0) {
          console.log(`Hidden ${hiddenRows} rows in table`);
        }
      });
    }
    
    // Main function to apply all filters
    function applyFilters() {
      console.log("Applying filters...");
      
      // Filter the data
      filterBorrowersData();
      filterBrandsData();
      
      // Filter the UI
      filterBrandElements();
      filterTableRows();
      
      console.log("Filter application complete");
    }
    
    // Try to apply filters with retries
    function tryApplyFilters(attempts = 0) {
      const maxAttempts = 5;
      
      if (attempts >= maxAttempts) {
        console.log("Max attempts reached, giving up on filter application");
        return;
      }
      
      try {
        applyFilters();
      } catch (error) {
        console.error("Error applying filters:", error);
        console.log(`Will retry (attempt ${attempts + 1}/${maxAttempts})`);
        
        setTimeout(() => {
          tryApplyFilters(attempts + 1);
        }, 1000);
      }
    }
    
    // Start the filtering process
    tryApplyFilters();
    
    // Set up a mutation observer to detect DOM changes
    const observer = new MutationObserver(mutations => {
      // Check if any relevant elements were added
      let shouldRefilter = false;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) { // Element node
              // Check if it's a dropdown, table, or contains brand badges
              if (
                node.classList?.contains('dropdown-menu') ||
                node.tagName === 'TABLE' ||
                node.tagName === 'SELECT' ||
                node.querySelector?.('.brand-badge, .dropdown-menu, table, select')
              ) {
                shouldRefilter = true;
                break;
              }
            }
          }
        }
        
        if (shouldRefilter) break;
      }
      
      if (shouldRefilter) {
        console.log("Relevant DOM changes detected, reapplying filters");
        tryApplyFilters();
      }
    });
    
    // Start observing with a delay to avoid initial churn
    setTimeout(() => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
      });
      console.log("Mutation observer started");
    }, 2000);
    
    // Make filter functions globally accessible
    window.loansphereFilter = {
      applyFilters: tryApplyFilters,
      isLoanNumberAllowed,
      originalBorrowersData,
      originalBrandsData,
      
      // Allow manual cleanup
      cleanup: function() {
        observer.disconnect();
        
        // Restore original data
        window.borrowersData = [...originalBorrowersData];
        window.brandsData = [...originalBrandsData];
        
        console.log("Filter resources cleaned up and original data restored");
        
        // Reload the page to reset UI
        if (confirm("Data has been restored. Reload page to reset UI?")) {
          window.location.reload();
        }
      }
    };
    
    console.log("Loansphere Dynamic Filter initialized successfully");
  })();