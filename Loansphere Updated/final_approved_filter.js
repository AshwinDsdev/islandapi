/*!
 * @description : Home Tracker offShore Script
 * @portal : FNMA HomeTracker
 * @author : Aquib Shakeel
 * @group : Accelirate Team
 * @owner : Cenlar
 * @lastModified : 14-May-2025
 */

// ########## DO NOT MODIFY THESE LINES ##########
const EXTENSION_ID = "hellpeipojbghaaopdnddjakinlmocjl";

/**
 * Establish Communication with Loan Checker Extension
 */
async function waitForListener(maxRetries = 20, initialDelay = 100) {
  return new Promise((resolve, reject) => {
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

      console.log(`🔄 Sending ping attempt ${attempts + 1}/${maxRetries}...`);

      chrome.runtime.sendMessage(
        EXTENSION_ID,
        {
          type: "ping",
        },
        (response) => {
          if (response?.result === "pong") {
            console.log("✅ Listener detected!");
            clearTimeout(timeoutId);
            resolve(true);
          } else {
            console.warn("❌ No listener detected, retrying...");
            timeoutId = setTimeout(() => {
              attempts++;
              delay *= 2; // Exponential backoff (100ms → 200ms → 400ms...)
              sendPing();
            }, delay);
          }
        }
      );
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
 * Disable main navigation tabs and sub-navigation tabs for offshore users
 */
function disableMainNavigationTabs() {
  // Disable main navigation tabs: Reports and Notifications
  const mainTabs = document.querySelectorAll("a.tab");
  mainTabs.forEach((tab) => {
    const tabText = tab.textContent.trim();
    if (tabText === "Reports" || tabText === "Notifications") {
      tab.remove();
    }
  });

  // Disable sub-navigation tabs on Lender Case page
  const subTabs = document.querySelectorAll("a.rlinks");
  const disabledSubTabs = [
    "Case Notes",
    "Attachments",
    "QC Inspections",
    "Worklist",
  ];
  subTabs.forEach((tab) => {
    const tabText = tab.textContent.trim();

    // Remove back to Link List
    if (tabText === "Back To List") {
      const cell = tab.closest("td");
      if (cell) {
        cell.remove();
      }
    }

    // Remove sub tabs of case summary
    if (disabledSubTabs.includes(tabText)) {
      const next = tab?.nextSibling;
      tab.remove();
      next.remove();
    }
  });

  // Additional approach to ensure all links are disabled
  const allLinks = document.querySelectorAll("a");
  allLinks.forEach((link) => {
    const linkText = link.textContent.trim();
    if (disabledSubTabs.includes(linkText)) {
      tab.remove();
    }
  });
}
/**
 * Disable case summary tabs and P&P tabs for offshore users
 */
function disableCaseSummaryHeader() {
  // Disable sub-navigation tabs on Lender Case page
  const subTabs = document.querySelectorAll("a.rlinks");
  const disabledSubTabs = ["Case Summary", "P&P"];
  subTabs.forEach((tab) => {
    const tabText = tab.textContent.trim();
    // Remove sub tabs of case summary
    if (disabledSubTabs.includes(tabText)) {
      const next = tab?.nextSibling;
      tab.remove();
      next.remove();
    }
  });

  // Additional approach to ensure all links are disabled
  const allLinks = document.querySelectorAll("a");
  allLinks.forEach((link) => {
    const linkText = link.textContent.trim();
    if (disabledSubTabs.includes(linkText)) {
      tab.remove();
    }
  });
}

/**
 * Disable specific quick links for offshore users
 */
function disableHomeQuickLinks() {
  // Links to be disabled
  const quickLinks = ["Quick Links"];

  // Find all links on the page
  const linkElement = document.querySelectorAll("td.homePageZone");

  linkElement.forEach((link) => {
    const linkText = link.textContent.trim();

    // Check if this link is in our disabled list
    if (quickLinks.includes(linkText)) {
      const parentElement = link.closest("table");
      parentElement.remove();
    }
  });
}

/**
 * Disable the New button for offshore users
 */
function disableNewButton() {
  // Find all buttons with value "New"
  const newButtons = document.querySelectorAll(
    'input[type="button"][value="New"]'
  );

  newButtons.forEach((button) => {
    // Disable the button
    button.remove();
  });
}

function disableAddressElements() {
  // Hide Address input and label for Home search section
  const quickSearchSection = document.querySelector(".headerQuickSearch");
  if (quickSearchSection) {
    // Find and remove the address input and its label
    const nodes = quickSearchSection.childNodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (
        node.nodeType === Node.TEXT_NODE &&
        node.textContent.includes("Address")
      ) {
        node.remove();
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.tagName === "INPUT" &&
        (node.name === "p_quick_address" ||
          node.getAttribute("name") === "p_quick_address")
      ) {
        node.remove();
      }
    }
  }

  //   Hide address option from any dropdown
  const selects = document.querySelectorAll("select");
  selects.forEach((select) => {
    const options = select.querySelectorAll("option");
    options.forEach((option) => {
      if (
        option.value === "QS_ADDRESS" ||
        option.textContent.trim() === "Address"
      ) {
        option.remove();
      }
    });
  });
}

/**
 * Remove navigation controls (filter, sort, pagination, download)
 */
function disableTableControls() {
  // Find all elements with class 'subnav'
  const navElement = document.querySelector(
    "td.subnav a.rlinks[href*='Filter']"
  );
  const navParentElement = navElement?.closest("table");
  if (navParentElement) {
    navParentElement.remove();
  }
}

/**
 * Create unallowed element to show when loan is not allowed for offshore users.
 */
function createUnallowedElement() {
  const unallowed = document.createElement("span");
  unallowed.appendChild(
    document.createTextNode("Loan is not provisioned to the user")
  );
  unallowed.className = "body";
  unallowed.style.display = "flex";
  unallowed.style.paddingLeft = "250px";
  unallowed.style.alignItems = "center";
  unallowed.style.height = "100px";
  unallowed.style.fontSize = "20px";
  unallowed.style.fontWeight = "bold";
  unallowed.style.color = "black";
  unallowed.style.position = "relative";

  return unallowed;
}

function onRecordNotFound() {
  const error = document.createElement("div");
  error.textContent = "Records not found";
  error.style.color = "red";
  error.style.display = "flex";
  error.style.justifyContent = "center";
  error.style.alignItems = "center";
  error.style.fontSize = "1em";
  error.style.fontWeight = "bold";
  error.style.padding = "20px";
  return error;
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
 * To grab the DOM elements and perform action like adding and removing.
 */
class FormElement {
  constructor() {
    this.element = document.querySelectorAll("table");
    this.parent = this.element[0] && this.element[0].parentElement;
    this.unallowed = createUnallowedElement();
  }
  removeCaseSummaryElement() {
    this.element.forEach((section) => {
      if (
        section.innerHTML.includes("New") ||
        section.innerHTML.includes("Case #") ||
        section.innerHTML.includes("Foreclosing Attorney") ||
        section.innerHTML.includes("Original Expected Conveyance Date") ||
        section.innerHTML.includes("Parcel Number") ||
        section.innerHTML.includes("Comments") ||
        section.innerHTML.includes("Servicer Risk") ||
        section.innerHTML.includes("Created By:") ||
        section.innerHTML.includes("HomeTracker LP")
      ) {
        section.remove();
      }
    });
  }

  addCaseSummaryElement() {
    this.parent.appendChild(this.unallowed);
  }

  getCaseSummaryTargetElement() {
    Array.from(this.element).filter((section) => {
      if (section.innerHTML.includes("Case #")) {
        return section;
      }
    });
  }
  getLenderTargetTable() {
    const targetTable = Array.from(this.element).find((table) => {
      const rows = table.querySelectorAll("tr");
      return (
        rows.length > 0 &&
        rows[0].querySelector("td:nth-child(5)")?.textContent.includes("FNMA")
      );
    });
    return targetTable;
  }

  removeTableElement() {
    const targetTable = this.getLenderTargetTable();
    if (targetTable) {
      targetTable.remove();
    }
  }
}

/**
 * Check FNMA Loan number and handle restricted loans for offshore users
 */
async function handleFormElement() {
  // Getting Form Element
  const formElement = new FormElement();
  // Find FNMA Loan number input - could be in search form or in case details page
  const fnmaInputs = [
    document.querySelector('input[name="p_DISABLEDfnma_loan_number"]'),
    document.querySelector('input[name="p_fnma_loan_number"]'),
    document.querySelector('input[name="p_quick_fnma_loan_number"]'),
  ].filter((input) => input !== null);

  // Check each FNMA input field
  for (const fnmaInput of fnmaInputs) {
    const loanNumber = fnmaInput.value.trim();
    if (!loanNumber) continue;

    // Check if loan is restricted
    if (loanNumber) {
      const allowedLoans = await checkNumbersBatch([loanNumber]);
      if (allowedLoans.length === 0) {
        formElement.removeCaseSummaryElement();
        formElement.addCaseSummaryElement();
        disableCaseSummaryHeader();
      }
      return false;
    }
  }

  return true;
}

/**
 * Check lender case page and remove the result table element
 */
async function handleTableElement() {
  // Getting Form Element
  const formElement = new FormElement();

  const lenderFnmaInput = document.querySelector(
    "input[name='p_quick_search_fnma_loan']"
  );
  const lenderServicerInut = document.querySelector(
    "input[name='p_quick_search_loan']"
  );
  if (
    lenderFnmaInput &&
    lenderFnmaInput.value.trim() === "" &&
    lenderServicerInut &&
    lenderServicerInut.value.trim() === ""
  ) {
    // Remove the main table containing the loan records
    formElement.removeTableElement();
  } else {
    const targetTable = formElement.getLenderTargetTable();
    const rows = targetTable?.querySelectorAll(
      'tr[bgcolor="#ffffff"], tr[bgcolor="#EEEEEE"]'
    );
    let visibleCount = 0;
    if (rows) {
      for (const row of rows) {
        const fnmaLoanCell = row.querySelector("td:nth-child(5)");
        if (!fnmaLoanCell) continue;

        const fnmaLoanNumber = fnmaLoanCell.textContent.trim();
        if (!fnmaLoanNumber) continue;

        const allowedLoans = await checkNumbersBatch([fnmaLoanNumber]);
        console.log(allowedLoans, "is");

        // If loan is restricted and user is offshore, hide the row
        if (allowedLoans.length === 0) {
          row.style.display = "none";
        } else {
          // Update the row number for visible rows
          visibleCount++;
          const numberCell = row.querySelector("td:nth-child(3)");
          if (numberCell) {
            numberCell.textContent = `${visibleCount}.`;
          }
        }
        if (!visibleCount) {
          targetTable.insertAdjacentElement("afterend", onRecordNotFound());
        }
      }
    }
  }
}

/**
 * Setup Mutation Observer to watch the #FNMA Loan Changes
 */
function setupCaseObserver() {
  // Getting Form Element
  const formElement = new FormElement();
  const targetElement = formElement.getCaseSummaryTargetElement();
  if (!targetElement) return;

  const observer = new MutationObserver((mutationList) => {
    for (const mutation of mutationList) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        console.log("New Result Detected");
        setTimeout(handleFormElement(), 50);
      }
    }
  });

  observer.observe(targetElement, {
    childList: true,
    subtree: true,
  });
}

// Main entrypoint (this is where everything starts)
(async function () {
  // create loader style.
  const style = createLoader();

  // Append loader style into header.
  document.head.appendChild(style);

  // Create loader element to load while connecting to extension.
  const loader = createLoaderElement();

  // Append loader element in to body.
  document.body.appendChild(loader);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }

  async function onReady() {
    // // Getting Form Element
    // const formElement = new FormElement();

    // Check Loan extension connection
    await waitForListener();

    // Disable main navigation tabs for offshore users
    disableMainNavigationTabs();

    // Disable quick links on home page for offshore users
    disableHomeQuickLinks();

    // Disable New button for offshore users
    disableNewButton();

    // Disable Address Element
    disableAddressElements();

    // Disable Table controls (filter, sort, pagination, download)
    disableTableControls();

    // Handle loan number checks for offshore users
    handleFormElement();

    // Handle Leader Case Page for offshore users
    handleTableElement();

    // Watch for dynamic changes
    setupCaseObserver();

    // Enabling the view
    loader.remove();
  }
})();