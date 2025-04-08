/**
 * Loan Filter Script
 * 
 * This script filters loan data displayed on the page based on the storedNumbersSet.
 * Only loans that exist in the storedNumbersSet will be visible to the user.

 */

(function () {
  console.log("Loan Filter Script V2 initialized");

  const FILTER_INTERVAL_MS = 2000;

  const processedElements = new WeakSet();

  function isStoredNumbersSetAvailable() {
    console.log("Current storedNumbersSet:", window.storedNumbersSet);
    return (
      window.storedNumbersSet !== null && window.storedNumbersSet !== undefined
    );
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

    return matches.filter(
      (value, index, self) => self.indexOf(value) === index
    );
  }

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
      let isAllowed = false;

      if (window.storedNumbersSet instanceof Set) {
        isAllowed = window.storedNumbersSet.has(loanNumber);
      } else if (Array.isArray(window.storedNumbersSet)) {
        isAllowed = window.storedNumbersSet.includes(loanNumber);
      } else if (
        window.storedNumbersSet &&
        typeof window.storedNumbersSet === "object"
      ) {
        isAllowed = Object.values(window.storedNumbersSet).includes(loanNumber);
      }

      if (isAllowed) {
        hasAllowedLoan = true;
        console.log(`Found allowed loan: ${loanNumber}`);
        break;
      }
    }

    if (!hasAllowedLoan && potentialLoanNumbers.length > 0) {
      console.log(`Filtering out loans: ${potentialLoanNumbers.join(", ")}`);
      return true;
    }

    return false;
  }

  function processTableRows() {
    if (!isStoredNumbersSetAvailable()) {
      console.warn("storedNumbersSet is not available yet. Waiting...");
      return;
    }

    const rows = document.querySelectorAll("tr");
    console.log(`Found ${rows.length} table rows to process`);

    rows.forEach((row) => {
      if (processedElements.has(row)) return;

      processedElements.add(row);

      if (shouldHideElement(row)) {
        row.style.display = "none";
      }
    });
  }

  function processGenericElements() {
    if (!isStoredNumbersSetAvailable()) {
      return;
    }

    const potentialContainers = document.querySelectorAll(
      '.borrower-row, .loan-item, .card, .list-item, div[class*="loan"], div[class*="borrower"]'
    );

    potentialContainers.forEach((container) => {
      if (processedElements.has(container)) return;

      processedElements.add(container);

      if (shouldHideElement(container)) {
        container.style.display = "none";
      }
    });
  }

  function processPage() {
    if (!isStoredNumbersSetAvailable()) {
      console.warn("storedNumbersSet is not available yet. Waiting...");
      return;
    }

    console.log("Processing page for loan filtering...");
    processTableRows();
    processGenericElements();
  }

  /**
   * Initialize mutation observer to detect DOM changes
   */
  function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldProcess = true;
          break;
        }
      }

      if (shouldProcess) {
        processPage();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  processPage();

  const intervalId = setInterval(processPage, FILTER_INTERVAL_MS);

  const observer = initMutationObserver();

  window.__cleanupLoanFilter = function () {
    clearInterval(intervalId);
    observer.disconnect();
    console.log("Loan Filter Script cleaned up");
  };

  console.log("Loan Filter Script complete");
})();
