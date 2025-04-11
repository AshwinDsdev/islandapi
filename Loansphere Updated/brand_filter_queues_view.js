/**
 * Brand Filter Injection Script
 * 
 * This script can be injected via browser console to filter the brands dropdown
 * to only show brands that have at least one loan number in the storedNumbersSet.
 * 
 * Usage:
 * 1. Copy this entire script
 * 2. Open browser console (F12 or Ctrl+Shift+I)
 * 3. Paste and press Enter
 */

(function() {
    console.log("Brand Filter Injection Script initialized");

    // Check if storedNumbersSet is available
    function isStoredNumbersSetAvailable() {
        const available = window.storedNumbersSet !== null && window.storedNumbersSet !== undefined;
        console.log("storedNumbersSet available:", available);
        return available;
    }

    // Check if a loan number is in the storedNumbersSet
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

    // Check if a brand has any loan numbers in the storedNumbersSet
    function brandHasAllowedLoans(brandLoanNumbers) {
        if (!isStoredNumbersSetAvailable() || !brandLoanNumbers || !Array.isArray(brandLoanNumbers)) {
            return true; // If we can't verify, don't hide
        }

        for (const loanNumber of brandLoanNumbers) {
            if (isLoanNumberAllowed(loanNumber)) {
                return true; // Brand has at least one allowed loan
            }
        }

        return false; // No allowed loans found for this brand
    }

    // Filter the brands dropdown
    function filterBrandsDropdown() {
        if (!isStoredNumbersSetAvailable()) {
            console.warn("storedNumbersSet is not available. Please define it first.");
            console.info("Example: window.storedNumbersSet = new Set(['0000000976', '0000001245'])");
            return;
        }

        // Get the brands data
        if (!window.brandsData || !Array.isArray(window.brandsData)) {
            console.error("brandsData is not available. Make sure dataSource.js is loaded.");
            return;
        }

        console.log("Filtering brands dropdown based on storedNumbersSet...");
        
        // Get the dropdown options container
        const dropdownOptions = document.getElementById('brandDropdownOptions');
        if (!dropdownOptions) {
            console.error("Brand dropdown options container not found.");
            return;
        }

        // Get all brand options
        const options = dropdownOptions.querySelectorAll('.option');
        if (!options || options.length === 0) {
            console.error("No brand options found in the dropdown.");
            return;
        }

        // Keep track of allowed brands
        const allowedBrands = [];
        const filteredBrands = [];

        // Check each brand
        window.brandsData.forEach(brand => {
            const hasAllowedLoans = brandHasAllowedLoans(brand.loanNumbers);
            
            if (hasAllowedLoans) {
                allowedBrands.push(brand.name);
            } else {
                filteredBrands.push(brand.name);
            }
        });

        console.log("Allowed brands:", allowedBrands);
        console.log("Filtered brands:", filteredBrands);

        // Filter the dropdown options
        options.forEach(option => {
            const brandName = option.getAttribute('data-value');
            const brandId = option.getAttribute('data-id');
            
            // Always keep "All Brands" option
            if (brandId === 'all' || brandName === 'All Brands') {
                return;
            }
            
            // Check if this brand has any allowed loans
            const brand = window.brandsData.find(b => b.name === brandName);
            
            if (brand && !brandHasAllowedLoans(brand.loanNumbers)) {
                // Hide this brand option
                option.style.display = 'none';
                console.log(`Filtered out brand: ${brandName}`);
            }
        });

        console.log("Brand dropdown filtering complete.");
    }

    // Create a demo storedNumbersSet if none exists
    function createDemoStoredNumbersSet() {
        if (!window.storedNumbersSet) {
            // Create a demo set with some loan numbers from Chase Bank and Bank of America
            window.storedNumbersSet = new Set([
                '0000000976', '0000001245', // Chase Bank
                '0000000001'                // Bank of America
            ]);
            console.log("Created demo storedNumbersSet with loan numbers for Chase Bank and Bank of America");
        }
    }

    // Initialize the filter
    function init() {
        console.log("Initializing brand filter...");
        
        // Create a demo storedNumbersSet if none exists
        createDemoStoredNumbersSet();
        
        // Filter the brands dropdown
        filterBrandsDropdown();
        
        console.log("Brand filter initialization complete.");
    }

    // Run the initialization
    init();

    // Expose the filter function globally for manual re-filtering
    window.filterBrandsDropdown = filterBrandsDropdown;
    
    console.log("Brand Filter Injection Script completed. You can manually re-filter by calling window.filterBrandsDropdown()");
})();