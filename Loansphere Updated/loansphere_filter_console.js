/**
 * Loansphere Queues Filter - Console Version
 * 
 * This is a simplified version of the filter script that can be easily
 * copied and pasted into the browser's developer console.
 */

// Self-executing function to avoid polluting global scope
(function() {
  console.log("Initializing Loansphere loan filter...");
  
  // For testing - create a sample storedNumbersSet if it doesn't exist
  if (!window.storedNumbersSet) {
    console.warn("No storedNumbersSet found, creating a test set");
    window.storedNumbersSet = new Set([
      "0000000976", "0000001245", "0000001180", "0000001081"
    ]);
  }
  
  // Check if a loan number is allowed (exists in storedNumbersSet)
  function isLoanNumberAllowed(loanNumber) {
    if (!window.storedNumbersSet) return true;
    
    if (window.storedNumbersSet instanceof Set) {
      return window.storedNumbersSet.has(loanNumber);
    } else if (Array.isArray(window.storedNumbersSet)) {
      return window.storedNumbersSet.includes(loanNumber);
    } else if (typeof window.storedNumbersSet === "object") {
      return Object.values(window.storedNumbersSet).includes(loanNumber);
    }
    
    return true; // If we can't verify, assume it's allowed
  }
  
  // Filter table rows based on loan numbers
  function filterTableRows() {
    const rows = document.querySelectorAll("#loansTableBody tr");
    console.log(`Processing ${rows.length} loan rows`);
    
    let hiddenCount = 0;
    
    rows.forEach(row => {
      if (!row.cells || row.cells.length < 2) return;
      
      const loanNumberCell = row.cells[1]; // Loan Number is the 2nd column
      if (!loanNumberCell) return;
      
      const loanNumber = loanNumberCell.textContent.trim();
      if (!loanNumber) return;
      
      if (!isLoanNumberAllowed(loanNumber)) {
        row.style.display = "none";
        hiddenCount++;
      }
    });
    
    console.log(`Filtered out ${hiddenCount} unauthorized loans`);
  }
  
  // Filter brand options in dropdown
  function filterBrandOptions() {
    // Get all brands and their loan numbers
    const brands = window.brandsData || [];
    if (!brands.length) {
      console.warn("No brands data available");
      return;
    }
    
    // Track which brands have at least one allowed loan
    const brandsWithAllowedLoans = new Set();
    
    // Check each brand's loans
    brands.forEach(brand => {
      const loanNumbers = brand.loanNumbers || [];
      
      for (const loanNumber of loanNumbers) {
        if (isLoanNumberAllowed(loanNumber)) {
          brandsWithAllowedLoans.add(brand.id);
          break;
        }
      }
    });
    
    // Filter the brand dropdown
    const brandSelect = document.getElementById("brandSelect");
    if (!brandSelect) {
      console.warn("Brand select dropdown not found");
      return;
    }
    
    let hiddenOptions = 0;
    
    Array.from(brandSelect.options).forEach(option => {
      if (!option.value || option.value === "" || isNaN(parseInt(option.value))) {
        return; // Skip "All Brands" option
      }
      
      const brandId = parseInt(option.value);
      if (!brandsWithAllowedLoans.has(brandId)) {
        option.style.display = "none";
        hiddenOptions++;
      }
    });
    
    console.log(`Filtered out ${hiddenOptions} unauthorized brands`);
  }
  
  // Main filter function
  function applyFilter() {
    console.log("Applying loan filter...");
    filterTableRows();
    filterBrandOptions();
  }
  
  // Set up mutation observer to detect changes
  function setupObserver() {
    const observer = new MutationObserver(mutations => {
      let shouldRefilter = false;
      
      for (const mutation of mutations) {
        // Check for added nodes or attribute changes
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          shouldRefilter = true;
          break;
        }
      }
      
      if (shouldRefilter) {
        console.log("DOM changes detected, reapplying filter");
        setTimeout(applyFilter, 100);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
    
    return observer;
  }
  
  // Initialize filter
  function init() {
    // Apply filter immediately
    applyFilter();
    
    // Set up observer for dynamic content
    const observer = setupObserver();
    
    // Set up interval to periodically reapply filter
    const interval = setInterval(applyFilter, 2000);
    
    // Store references for debugging
    window.loanFilter = {
      applyFilter,
      observer,
      interval,
      isLoanNumberAllowed
    };
    
    console.log("Loan filter initialized successfully");
  }
  
  // Start the filter
  init();
})();