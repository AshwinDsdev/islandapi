/**
 * Loansphere Queues Filter Script
 * 
 * This script filters loan numbers that are not in window.storedNumbersSet
 * It can be injected into the developer console to filter data in Loansphere_Queues.html
 * 
 * Usage:
 * 1. Open Loansphere_Queues.html in a browser
 * 2. Open developer console (F12 or right-click > Inspect > Console)
 * 3. Copy and paste this entire script into the console
 * 4. Press Enter to execute
 * 
 * Features:
 * - Filters out loans not in storedNumbersSet
 * - Hides queues that only contain restricted loans
 * - Maintains default sort order of queues
 * - Shows accurate count of available queues
 * - Filters results by selected brand in top navigation
 */

(function() {
    // Configuration
    const config = {
        debug: true,
        filterDelay: 300,
        observerDelay: 500,
        reprocessInterval: 2000,
        isOffshoreUser: true // Set to true for offshore users who should have restricted access
    };

    // State tracking
    const state = {
        processedElements: new Set(),
        processedBrands: new Set(),
        processedQueues: new Set(),
        queueLoanMap: new Map(), // Maps queue names to arrays of loan numbers
        queueVisibility: new Map(), // Tracks which queues should be visible
        observerState: {
            ignoreNextMutations: false,
            processingDebounce: null,
            lastProcessed: 0
        },
        processingInterval: null,
        lastFilterTime: 0,
        originalQueueCount: 0,
        visibleQueueCount: 0
    };

    // Logging with throttling to prevent console spam
    const logThrottle = {
        lastLogs: {},
        log: function(key, ...args) {
            if (!config.debug) return;
            
            const now = Date.now();
            if (!this.lastLogs[key] || now - this.lastLogs[key] > 2000) {
                console.log(`[LoanFilter] ${args[0]}`, ...args.slice(1));
                this.lastLogs[key] = now;
            }
        }
    };

    /**
     * Check if storedNumbersSet is available
     * @returns {boolean} - True if storedNumbersSet is available
     */
    function isStoredNumbersSetAvailable() {
        logThrottle.log(
            "storedNumbersSet",
            "Current storedNumbersSet available:",
            !!window.storedNumbersSet
        );
        return (
            window.storedNumbersSet !== null && window.storedNumbersSet !== undefined
        );
    }

    /**
     * Check if a loan number is allowed (exists in storedNumbersSet)
     * @param {string} loanNumber - The loan number to check
     * @returns {boolean} - True if the loan number is in the storedNumbersSet
     */
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

    /**
     * Extract brands data from the page
     * This ensures we can access brand information even if window.brandsData is not set
     */
    function extractBrandsData() {
        if (window.brandsData && Array.isArray(window.brandsData)) {
            return window.brandsData; // Use existing data if available
        }

        // Try to extract from brand dropdowns
        const brandsData = [];
        const brandMap = new Map();

        // Extract from brand select options
        const brandSelects = document.querySelectorAll("select#brandSelect");
        brandSelects.forEach((select) => {
            Array.from(select.options).forEach((option) => {
                if (!option.value || option.value === "" || isNaN(parseInt(option.value))) return;

                const brandId = parseInt(option.value);
                if (brandMap.has(brandId)) return; // Skip if already processed

                const text = option.textContent.trim();
                const codeMatch = text.match(/\(([A-Z0-9]+)\)$/);
                const code = codeMatch ? codeMatch[1] : `BRAND${brandId}`;
                const name = codeMatch ? text.replace(/\s*\([A-Z0-9]+\)$/, "") : text;

                brandMap.set(brandId, {
                    id: brandId,
                    name: name.trim(),
                    code: code,
                    loanNumbers: [], // Will be populated later
                });
            });
        });

        // Extract loan numbers from table rows
        const rows = document.querySelectorAll("table tbody tr");
        rows.forEach((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 5) return;

            const loanNumberCell = cells[1]; // Loan Number is the 2nd column
            const brandCell = cells[3]; // Brand is the 4th column

            if (!loanNumberCell || !brandCell) return;

            const loanNumber = loanNumberCell.textContent.trim();
            const brandName = brandCell.textContent.trim();

            if (!loanNumber || !brandName) return;

            // Find the brand by name
            for (const [id, brand] of brandMap.entries()) {
                if (brand.name === brandName && !brand.loanNumbers.includes(loanNumber)) {
                    brand.loanNumbers.push(loanNumber);
                    break;
                }
            }
        });

        // Convert map to array
        for (const brand of brandMap.values()) {
            brandsData.push(brand);
        }

        // Store for future use
        window.brandsData = brandsData;

        return brandsData;
    }
    
    /**
     * Extract queue data from the page and map loans to queues
     * This builds a mapping of which loans belong to which queues
     */
    function extractQueueData() {
        // Reset the queue loan map
        state.queueLoanMap.clear();
        
        // Get all table rows
        const rows = document.querySelectorAll("#loansTableBody tr");
        
        rows.forEach((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 6) return;
            
            const loanNumberCell = cells[1]; // Loan Number is the 2nd column
            const queueCell = cells[4]; // Queue is the 5th column
            
            if (!loanNumberCell || !queueCell) return;
            
            const loanNumber = loanNumberCell.textContent.trim();
            const queueName = queueCell.textContent.trim();
            
            if (!loanNumber || !queueName) return;
            
            // Add loan to the queue map
            if (!state.queueLoanMap.has(queueName)) {
                state.queueLoanMap.set(queueName, []);
            }
            
            state.queueLoanMap.get(queueName).push(loanNumber);
        });
        
        logThrottle.log(
            "queueMap", 
            `Extracted ${state.queueLoanMap.size} queues with their loans`
        );
        
        return state.queueLoanMap;
    }
    
    /**
     * Check if a queue has at least one allowed loan
     * @param {string} queueName - The name of the queue to check
     * @returns {boolean} - True if the queue has at least one allowed loan
     */
    function queueHasAllowedLoans(queueName) {
        if (!isStoredNumbersSetAvailable() || !state.queueLoanMap.has(queueName)) {
            return true; // If we can't verify, assume it's allowed
        }
        
        const loanNumbers = state.queueLoanMap.get(queueName);
        
        for (const loanNumber of loanNumbers) {
            if (isLoanNumberAllowed(loanNumber)) {
                return true; // Queue has at least one allowed loan
            }
        }
        
        return false; // No allowed loans found for this queue
    }
    
    /**
     * Check if all loans in a queue belong to brands with only restricted loans
     * @param {string} queueName - The name of the queue to check
     * @returns {boolean} - True if all loans in the queue belong to restricted brands
     */
    function queueHasOnlyRestrictedBrands(queueName) {
        if (!isStoredNumbersSetAvailable() || !state.queueLoanMap.has(queueName)) {
            return false; // If we can't verify, assume it's not restricted
        }
        
        const loanNumbers = state.queueLoanMap.get(queueName);
        if (loanNumbers.length === 0) return false;
        
        // Get all brands associated with this queue's loans
        const brandsData = extractBrandsData();
        const queueBrands = new Set();
        
        // Find all brands associated with loans in this queue
        loanNumbers.forEach(loanNumber => {
            brandsData.forEach(brand => {
                if (brand.loanNumbers.includes(loanNumber)) {
                    queueBrands.add(brand.id);
                }
            });
        });
        
        // Check if all brands have only restricted loans
        for (const brandId of queueBrands) {
            const brand = brandsData.find(b => b.id === brandId);
            if (!brand) continue;
            
            // Check if this brand has any allowed loans
            if (brandHasAllowedLoans(brand.loanNumbers)) {
                return false; // Found a brand with allowed loans
            }
        }
        
        return true; // All brands in this queue have only restricted loans
    }

    /**
     * Check if text contains a loan number pattern
     */
    function containsLoanNumber(text) {
        return /\b\d{5,}\b/.test(text) || /\b[A-Z0-9]{5,}\b/.test(text);
    }

    /**
     * Extract potential loan numbers from text
     */
    function extractLoanNumbers(text) {
        const matches = [];
        const digitMatches = text.match(/\b\d{5,}\b/g);
        const alphaNumMatches = text.match(/\b[A-Z0-9]{5,}\b/g);

        if (digitMatches) matches.push(...digitMatches);
        if (alphaNumMatches) matches.push(...alphaNumMatches);

        return matches.filter(
            (value, index, self) => self.indexOf(value) === index
        );
    }

    /**
     * Determine if an element should be hidden based on loan numbers it contains
     */
    function shouldHideElement(element) {
        if (!isStoredNumbersSetAvailable()) return false;

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

        let hasAllowedLoan = false;

        for (const loanNumber of potentialLoanNumbers) {
            const isAllowed = isLoanNumberAllowed(loanNumber);

            if (isAllowed) {
                hasAllowedLoan = true;
                logThrottle.log("allowedLoan", `Found allowed loan: ${loanNumber}`);
                break;
            }
        }

        if (!hasAllowedLoan && potentialLoanNumbers.length > 0) {
            logThrottle.log("filteredLoans", `Filtering out loans: ${potentialLoanNumbers.join(", ")}`);
            return true;
        }

        return false;
    }

    /**
     * Process table rows to hide those with restricted loan numbers
     */
    function processTableRows() {
        if (!isStoredNumbersSetAvailable()) {
            console.warn("storedNumbersSet is not available yet. Waiting...");
            return;
        }

        const rows = document.querySelectorAll("#loansTableBody tr");
        logThrottle.log("tableRows", `Found ${rows.length} table rows to process`);

        // Check if a brand is selected in the top navigation
        const brandSelect = document.querySelector("select#brandSelect");
        let selectedBrand = null;
        
        if (brandSelect && brandSelect.selectedIndex > 0) {
            const selectedOption = brandSelect.options[brandSelect.selectedIndex];
            selectedBrand = selectedOption.textContent.trim();
            logThrottle.log("selectedBrand", `Filtering by selected brand: ${selectedBrand}`);
        }

        rows.forEach((row) => {
            if (state.processedElements.has(row)) return;

            state.processedElements.add(row);

            // Get loan number from the row (2nd column)
            const loanNumberCell = row.cells[1];
            if (!loanNumberCell) return;

            const loanNumber = loanNumberCell.textContent.trim();
            if (!loanNumber) return;
            
            // Get brand from the row (4th column)
            const brandCell = row.cells[3];
            const brand = brandCell ? brandCell.textContent.trim() : null;
            
            // Check if this row should be hidden based on selected brand
            if (selectedBrand && selectedBrand !== "All Brands" && brand !== selectedBrand) {
                row.style.display = "none";
                logThrottle.log("hiddenRowBrand", `Hiding row with brand ${brand} (selected: ${selectedBrand})`);
                return;
            }

            const isAllowed = isLoanNumberAllowed(loanNumber);
            if (!isAllowed) {
                row.style.display = "none";
                logThrottle.log("hiddenRow", `Hiding row with loan number: ${loanNumber}`);
            }
        });
    }

    /**
     * Process generic elements that might contain loan numbers
     */
    function processGenericElements() {
        if (!isStoredNumbersSetAvailable()) {
            return;
        }

        const potentialContainers = document.querySelectorAll(
            '.loan-item, .card, .list-item, div[class*="loan"]'
        );

        potentialContainers.forEach((container) => {
            if (state.processedElements.has(container)) return;

            state.processedElements.add(container);

            if (shouldHideElement(container)) {
                container.style.display = "none";
            }
        });
    }
    
    /**
     * Process queue elements to hide those that only contain restricted loans
     */
    function processQueueElements() {
        if (!isStoredNumbersSetAvailable() || !config.isOffshoreUser) {
            return;
        }
        
        // Extract queue data if not already done
        if (state.queueLoanMap.size === 0) {
            extractQueueData();
        }
        
        // Process queue dropdown
        const queueFilter = document.getElementById('queueFilter');
        if (queueFilter && !state.processedQueues.has(queueFilter)) {
            state.processedQueues.add(queueFilter);
            
            // Store original queue count if not already stored
            if (state.originalQueueCount === 0) {
                state.originalQueueCount = queueFilter.options.length - 1; // Subtract 1 for "All Queues" option
            }
            
            // Track visible queues
            let visibleQueueCount = 0;
            
            // Process each option in the dropdown
            Array.from(queueFilter.options).forEach((option) => {
                if (!option.value || option.value === "All Queues") return; // Skip "All Queues" option
                
                const queueName = option.textContent.trim();
                
                // Check if this queue has only restricted brands
                if (queueHasOnlyRestrictedBrands(queueName)) {
                    option.style.display = "none";
                    state.queueVisibility.set(queueName, false);
                    logThrottle.log("hiddenQueue", `Hiding queue with only restricted brands: ${queueName}`);
                } else {
                    visibleQueueCount++;
                    state.queueVisibility.set(queueName, true);
                }
            });
            
            // Update visible queue count
            state.visibleQueueCount = visibleQueueCount;
            
            // Update queue count display if it exists
            updateQueueCountDisplay();
        }
        
        // Process queue cells in the table
        const queueCells = document.querySelectorAll("#loansTableBody tr td:nth-child(5)"); // Queue is the 5th column
        queueCells.forEach((cell) => {
            if (state.processedQueues.has(cell)) return;
            state.processedQueues.add(cell);
            
            const queueName = cell.textContent.trim();
            if (!queueName) return;
            
            // If this queue should be hidden, hide the entire row
            if (state.queueVisibility.has(queueName) && !state.queueVisibility.get(queueName)) {
                const row = cell.closest("tr");
                if (row) {
                    row.style.display = "none";
                    logThrottle.log("hiddenQueueRow", `Hiding row with restricted queue: ${queueName}`);
                }
            }
        });
    }
    
    /**
     * Update the queue count display to show the number of queues available to the user
     */
    function updateQueueCountDisplay() {
        // Look for queue count elements
        const queueCountElements = document.querySelectorAll('.queue-count, .count-display, h1, h2, h3, h4, h5, h6');
        
        queueCountElements.forEach(element => {
            const text = element.textContent;
            if (text && text.includes('Queue') && text.includes('(')) {
                // This might be a heading with a count like "Loan Queues (10)"
                const newText = text.replace(/\(\d+\)/, `(${state.visibleQueueCount})`);
                if (newText !== text) {
                    element.textContent = newText;
                    logThrottle.log("updatedCount", `Updated queue count display to: ${state.visibleQueueCount}`);
                }
            }
        });
    }

    /**
     * Check if a brand has at least one allowed loan
     * @param {Array} brandLoanNumbers - Array of loan numbers for a brand
     * @returns {boolean} - True if at least one loan number is in storedNumbersSet
     */
    function brandHasAllowedLoans(brandLoanNumbers) {
        if (
            !isStoredNumbersSetAvailable() ||
            !brandLoanNumbers ||
            !Array.isArray(brandLoanNumbers)
        ) {
            return true; // If we can't verify, don't hide
        }

        for (const loanNumber of brandLoanNumbers) {
            const isAllowed = isLoanNumberAllowed(loanNumber);

            if (isAllowed) {
                return true; // Brand has at least one allowed loan
            }
        }

        return false; // No allowed loans found for this brand
    }

    /**
     * Process brand elements in the page and hide those without allowed loans
     */
    function processBrandElements() {
        if (!isStoredNumbersSetAvailable()) {
            return;
        }

        // Get brands data (either from window object or extract from the page)
        const brandsData = extractBrandsData();

        if (!brandsData || !Array.isArray(brandsData) || brandsData.length === 0) {
            logThrottle.log("noBrands", "No brands data available for brand filtering");
            return;
        }

        logThrottle.log("processBrands", "Processing brands for filtering...", brandsData);

        // Filter brand dropdowns
        const brandDropdowns = document.querySelectorAll("select#brandSelect");
        brandDropdowns.forEach((dropdown) => {
            if (state.processedBrands.has(dropdown)) return;
            state.processedBrands.add(dropdown);

            // Process each option in the dropdown
            Array.from(dropdown.options).forEach((option) => {
                if (!option.value || option.value === "" || isNaN(parseInt(option.value))) return; // Skip "All Brands" option

                // Find the brand data for this option
                const brandId = parseInt(option.value);
                const brand = brandsData.find((b) => b.id === brandId);

                if (brand && !brandHasAllowedLoans(brand.loanNumbers)) {
                    option.style.display = "none"; // Hide brands without allowed loans
                    logThrottle.log("hiddenBrand", `Filtering out brand: ${brand.name} (${brand.code})`);
                }
            });
        });

        // Filter brand cells in the table
        const brandCells = document.querySelectorAll("#loansTableBody tr td:nth-child(4)"); // Brand is the 4th column
        brandCells.forEach((cell) => {
            if (state.processedBrands.has(cell)) return;
            state.processedBrands.add(cell);

            // Get brand name from the cell
            const brandName = cell.textContent.trim();
            if (!brandName) return;

            const brand = brandsData.find((b) => b.name === brandName);

            if (brand && !brandHasAllowedLoans(brand.loanNumbers)) {
                // Find the parent row and hide it
                const row = cell.closest("tr");
                if (row) {
                    row.style.display = "none";
                    logThrottle.log("hiddenBrandRow", `Filtering out row with brand: ${brand.name}`);
                }
            }
        });
    }

    /**
     * Process the entire page to filter loans, brands, and queues
     */
    function processPage() {
        if (!isStoredNumbersSetAvailable()) {
            console.warn("storedNumbersSet is not available yet. Waiting...");
            return;
        }

        const now = Date.now();
        if (now - state.lastFilterTime < config.filterDelay) {
            return; // Throttle processing
        }
        state.lastFilterTime = now;

        logThrottle.log("processPage", "Processing page for loan filtering...");
        
        // Extract queue data first to build the queue-loan mapping
        extractQueueData();
        
        // Process elements in order
        processTableRows();
        processGenericElements();
        processBrandElements();
        processQueueElements();
        
        // Always process search input to ensure filtering is applied
        processSearchInput();
        
        // Update queue count display
        updateQueueCountDisplay();
        
        // Final check to ensure all unauthorized loans are hidden
        ensureUnauthorizedLoansHidden();
    }
    
    /**
     * Final check to ensure all unauthorized loans are hidden
     * This is a safety measure to catch any loans that might have slipped through
     */
    function ensureUnauthorizedLoansHidden() {
        if (!isStoredNumbersSetAvailable()) return;
        
        const rows = document.querySelectorAll("#loansTableBody tr");
        let hiddenCount = 0;
        
        rows.forEach(row => {
            // Skip already hidden rows
            if (row.style.display === 'none') return;
            
            const loanNumberCell = row.cells[1];
            if (!loanNumberCell) return;
            
            const loanNumber = loanNumberCell.textContent.trim();
            if (!loanNumber) return;
            
            // Check if this loan is allowed
            if (!isLoanNumberAllowed(loanNumber)) {
                row.style.display = 'none';
                hiddenCount++;
            }
        });
        
        if (hiddenCount > 0) {
            logThrottle.log("finalCheck", `Final check hid ${hiddenCount} unauthorized loans that slipped through`);
        }
    }

    /**
     * Initialize mutation observer to detect DOM changes
     */
    function initMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            // Skip processing if we're ignoring mutations (e.g., our own DOM changes)
            if (state.observerState.ignoreNextMutations) {
                state.observerState.ignoreNextMutations = false;
                return;
            }

            // Debounce processing to prevent excessive calls
            if (state.observerState.processingDebounce) {
                clearTimeout(state.observerState.processingDebounce);
            }

            // Check if we should process these mutations
            const now = Date.now();
            if (now - state.observerState.lastProcessed < config.observerDelay) {
                // Don't process more than once per configured delay
                return;
            }

            let shouldProcess = false;
            let tableChanged = false;
            let queueChanged = false;
            let brandChanged = false;
            let searchChanged = false;

            for (const mutation of mutations) {
                // Check for added nodes
                if (mutation.addedNodes.length > 0) {
                    // Skip if only text nodes were added
                    let hasElementNodes = false;
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            // Element node
                            hasElementNodes = true;
                            break;
                        }
                    }

                    if (hasElementNodes) {
                        shouldProcess = true;

                        // Check if table rows were added
                        for (const node of mutation.addedNodes) {
                            if (
                                node.nodeName === "TR" ||
                                (node.nodeType === 1 && node.querySelector("tr"))
                            ) {
                                tableChanged = true;
                                break;
                            }
                        }
                    }
                }

                // Check for attribute changes on table rows (might indicate filtering)
                if (
                    mutation.type === "attributes" &&
                    mutation.attributeName === "style" &&
                    (mutation.target.tagName === "TR" || mutation.target.tagName === "TD")
                ) {
                    tableChanged = true;
                }
                
                // Check for changes to queue filter
                if (
                    mutation.type === "attributes" &&
                    mutation.target.id === "queueFilter"
                ) {
                    queueChanged = true;
                }
                
                // Check for changes to brand filter
                if (
                    mutation.type === "attributes" &&
                    mutation.target.id === "brandSelect"
                ) {
                    brandChanged = true;
                }
                
                // Check for changes to search input
                if (
                    (mutation.type === "attributes" && 
                     mutation.target.id === "searchInput") ||
                    (mutation.type === "characterData" && 
                     mutation.target.parentNode && 
                     mutation.target.parentNode.id === "searchInput")
                ) {
                    searchChanged = true;
                }
            }

            // Debounce the processing
            state.observerState.processingDebounce = setTimeout(() => {
                state.observerState.lastProcessed = Date.now();

                // Set flag to ignore mutations caused by our own DOM changes
                state.observerState.ignoreNextMutations = true;
                
                // If brand selection changed, reset processed elements to refilter everything
                if (brandChanged) {
                    state.processedElements.clear();
                    state.processedQueues.clear();
                    state.queueLoanMap.clear();
                    logThrottle.log("brandChanged", "Brand selection changed, reprocessing all elements");
                }

                if (shouldProcess || tableChanged || queueChanged || brandChanged) {
                    logThrottle.log("observer", "Processing page due to DOM changes");
                    processPage();
                    
                    // Update queue count after processing
                    if (queueChanged) {
                        updateQueueCountDisplay();
                    }
                }
                
                // Process search input separately if it changed
                if (searchChanged) {
                    logThrottle.log("searchChanged", "Search input changed, processing search results");
                    processSearchInput();
                }
            }, config.filterDelay);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true, // To detect text changes in search input
            attributeFilter: ["value", "style", "class", "display", "selected"],
        });

        return observer;
    }

    /**
     * Set up interval to periodically reprocess the page
     * This catches any elements that might have been missed
     */
    function setupProcessingInterval() {
        if (state.processingInterval) {
            clearInterval(state.processingInterval);
        }

        state.processingInterval = setInterval(() => {
            if (isStoredNumbersSetAvailable()) {
                logThrottle.log("interval", "Reprocessing page from interval");
                processPage();
            }
        }, config.reprocessInterval);

        return state.processingInterval;
    }

    /**
     * Process search input to filter out unauthorized loans
     */
    function processSearchInput() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;
        
        // Get the current search text
        const searchText = searchInput.value.trim().toLowerCase();
        
        // Always apply our base filtering to ensure only authorized loans are shown
        const rows = document.querySelectorAll("#loansTableBody tr");
        
        rows.forEach(row => {
            const loanNumberCell = row.cells[1];
            if (!loanNumberCell) return;
            
            const loanNumber = loanNumberCell.textContent.trim();
            if (!loanNumber) return;
            
            // First check if this loan is allowed at all
            const isAllowed = isLoanNumberAllowed(loanNumber);
            
            if (!isAllowed) {
                // Always hide unauthorized loans regardless of search
                row.style.display = 'none';
                logThrottle.log("hiddenSearchRow", `Hiding unauthorized loan: ${loanNumber}`);
                return;
            }
            
            // If there's a search term, apply additional filtering
            if (searchText) {
                logThrottle.log("searchInput", `Processing search input: "${searchText}"`);
                
                // Check if the row matches the search term
                const rowText = row.textContent.toLowerCase();
                const matchesSearch = rowText.includes(searchText);
                
                // If the search contains a loan number pattern, do additional checks
                if (containsLoanNumber(searchText)) {
                    const potentialLoanNumbers = extractLoanNumbers(searchText);
                    
                    // If searching for specific loan numbers, ensure they're authorized
                    if (potentialLoanNumbers.length > 0) {
                        let searchingForAllowedLoan = false;
                        
                        for (const searchLoanNumber of potentialLoanNumbers) {
                            if (isLoanNumberAllowed(searchLoanNumber)) {
                                searchingForAllowedLoan = true;
                                logThrottle.log("searchAllowedLoan", `Search contains allowed loan: ${searchLoanNumber}`);
                                break;
                            }
                        }
                        
                        // If searching for unauthorized loans, hide all results
                        if (!searchingForAllowedLoan) {
                            logThrottle.log("searchUnauthorized", `Search for unauthorized loan(s): ${potentialLoanNumbers.join(", ")}`);
                            row.style.display = 'none';
                            return;
                        }
                    }
                }
                
                // Show or hide based on search match (only for authorized loans)
                if (!matchesSearch) {
                    row.style.display = 'none';
                }
            }
        });
    }
    
    /**
     * Override the default filterLoans function to ensure our filtering is applied
     */
    function overrideFilterLoans() {
        // Store the original filterLoans function if it exists
        if (window.originalFilterLoans === undefined && window.filterLoans) {
            window.originalFilterLoans = window.filterLoans;
            
            // Override with our version that applies additional filtering
            window.filterLoans = function() {
                // First, make all rows visible to ensure the original function works correctly
                const rows = document.querySelectorAll("#loansTableBody tr");
                rows.forEach(row => {
                    const loanNumberCell = row.cells[1];
                    if (!loanNumberCell) return;
                    
                    const loanNumber = loanNumberCell.textContent.trim();
                    if (!loanNumber) return;
                    
                    // Only make authorized loans visible for the original function to filter
                    if (isLoanNumberAllowed(loanNumber)) {
                        // Temporarily make this row visible for the original filter
                        if (row.style.display === 'none') {
                            row.dataset.wasHidden = 'true';
                            row.style.display = '';
                        }
                    } else {
                        // Keep unauthorized loans hidden
                        row.style.display = 'none';
                    }
                });
                
                // Call the original function to apply its filtering
                window.originalFilterLoans.apply(this, arguments);
                
                // Then apply our additional filtering to hide unauthorized loans
                setTimeout(() => {
                    // Reset processed elements to force reprocessing
                    state.processedElements.clear();
                    
                    // Process search input specifically
                    processSearchInput();
                    
                    // Restore any rows that were temporarily made visible
                    rows.forEach(row => {
                        if (row.dataset.wasHidden === 'true') {
                            delete row.dataset.wasHidden;
                            // Only hide if the original filter didn't already hide it
                            if (row.style.display === '') {
                                row.style.display = 'none';
                            }
                        }
                    });
                }, 50);
            };
            
            logThrottle.log("override", "Successfully overrode filterLoans function");
        }
    }
    
    /**
     * Add event listeners for brand and queue selection changes
     */
    function addEventListeners() {
        // Listen for brand selection changes
        const brandSelect = document.getElementById('brandSelect');
        if (brandSelect) {
            brandSelect.addEventListener('change', () => {
                // Reset processed state to force reprocessing
                state.processedElements.clear();
                state.processedQueues.clear();
                state.queueLoanMap.clear();
                
                // Process the page with the new brand filter
                logThrottle.log("brandSelectChange", "Brand selection changed via event listener");
                processPage();
            });
            
            logThrottle.log("eventListener", "Added event listener for brand selection changes");
        }
        
        // Listen for queue filter changes
        const queueFilter = document.getElementById('queueFilter');
        if (queueFilter) {
            queueFilter.addEventListener('change', () => {
                // Update queue count display after filtering
                logThrottle.log("queueFilterChange", "Queue filter changed via event listener");
                setTimeout(updateQueueCountDisplay, 100);
            });
            
            logThrottle.log("eventListener", "Added event listener for queue filter changes");
        }
        
        // Listen for search input changes
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            // Listen for input events (typing)
            searchInput.addEventListener('input', () => {
                // Process search input after a short delay
                logThrottle.log("searchChange", "Search input changed via event listener");
                setTimeout(() => {
                    processSearchInput();
                    ensureUnauthorizedLoansHidden();
                }, 100);
            });
            
            // Listen for the search being cleared (via clear button or backspace)
            searchInput.addEventListener('search', () => {
                logThrottle.log("searchCleared", "Search input cleared");
                setTimeout(() => {
                    // When search is cleared, make sure we reapply all filtering
                    state.processedElements.clear();
                    processPage();
                }, 100);
            });
            
            // Listen for keydown events to catch when search is cleared via backspace
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    if (searchInput.value.length <= 1) {
                        // About to clear the search
                        logThrottle.log("searchClearing", "Search input being cleared via keyboard");
                        setTimeout(() => {
                            state.processedElements.clear();
                            processPage();
                        }, 100);
                    }
                }
            });
            
            logThrottle.log("eventListener", "Added event listeners for search input changes");
        }
    }
    
    /**
     * Initialize the filter
     */
    function initFilter() {
        console.log("[LoanFilter] Initializing Loansphere Queues filter...");

        // Create storedNumbersSet if it doesn't exist (for testing)
        if (!window.storedNumbersSet) {
            console.warn("[LoanFilter] No storedNumbersSet found, creating a test set");
            // This is just for testing - in production, storedNumbersSet should be provided
            window.storedNumbersSet = new Set([
                "0000000976", "0000001245", "0000001180", "0000001081"
            ]);
        }

        // Override the default filterLoans function
        overrideFilterLoans();

        // Initial processing
        processPage();
        
        // Process search input if there's already a search term
        processSearchInput();
        
        // Add event listeners for interactive elements
        addEventListeners();

        // Set up observers and intervals
        const observer = initMutationObserver();
        const interval = setupProcessingInterval();

        // Add to window for debugging
        window.loanFilterState = {
            observer,
            interval,
            state,
            processPage,
            isLoanNumberAllowed,
            queueHasAllowedLoans,
            queueHasOnlyRestrictedBrands,
            updateQueueCountDisplay,
            processSearchInput
        };

        console.log("[LoanFilter] Filter initialized successfully with queue filtering for offshore users");
    }

    // Start the filter
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initFilter);
    } else {
        initFilter();
    }
})();