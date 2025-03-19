document.addEventListener("DOMContentLoaded", function () {
  // Initialize Material Design components
  mdc.autoInit();

  // Initialize dropdowns
  const dropdowns = document.querySelectorAll("mat-select");
  dropdowns.forEach((dropdown) => {
    dropdown.addEventListener("click", function (e) {
      e.stopPropagation();
      this.classList.toggle("mat-select-opened");
    });
  });

  // Initialize AG-Grid
  const gridOptions = {
    columnDefs: [
      { field: "LoginAccountUserName", headerName: "Username" },
      { field: "BorrowerName", headerName: "Name" },
      { field: "EmailAddressValue", headerName: "Email Address" },
      { field: "PrimaryTelephoneNumber", headerName: "Phone" },
    ],
    defaultColDef: {
      sortable: true,
      filter: true,
      resizable: true,
    },
  };

  // Initialize grid if container exists
  const gridDiv = document.querySelector(".ag-theme-material");
  if (gridDiv) {
    new agGrid.Grid(gridDiv, gridOptions);
  }
});

var borrowerData = [];

function updateTable(data) {
  const tableBody = document.getElementById("borrowerTableBody");
  tableBody.innerHTML = "";
  data.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${row.loginAccountUserName}</td>
            <td>${row.firstName}</td>
            <td>${row.lastName}</td>
            <td>${row.emailAddress}</td>
            <td>${row.phoneNumber}</td>
            <td>${row.propertyAddress}</td>
            <td>${row.ssn}</td>
            <td>${row.brand}</td>
            <td>${row.loanNumber}</td>
            <td>${row.status}</td>
        `;
    tableBody.appendChild(tr);
  });
}
document.addEventListener("DOMContentLoaded", function () {
  // Show/hide menu functionality
  const hamburgerMenu = document.querySelector(".hamburger-menu");
  const drawer = document.querySelector(".app-drawer");

  if (hamburgerMenu) {
    hamburgerMenu.addEventListener("click", function () {
      drawer.classList.toggle("mat-drawer-opened");
    });
  }

  // Add active state to menu items
  const menuItems = document.querySelectorAll(".drawer-feature-item");
  menuItems.forEach((item) => {
    item.addEventListener("click", function () {
      menuItems.forEach((i) => i.classList.remove("active-child-menu-item"));
      this.classList.add("active-child-menu-item");
    });
  });
});
document.addEventListener("DOMContentLoaded", function () {
  // Initialize brand dropdown
  const brandSelect = document.querySelector('mat-select[name="brandSelect"]');
  if (brandSelect) {
    brandSelect.addEventListener("click", function (e) {
      this.classList.toggle("mat-select-opened");
      const options = document.querySelectorAll("mat-option");
      options.forEach((option) => {
        option.style.display = this.classList.contains("mat-select-opened")
          ? "block"
          : "none";
      });
    });

    // Handle option selection
    document.querySelectorAll("mat-option").forEach((option) => {
      option.addEventListener("click", function () {
        const selectedValue = this.getAttribute("value");
        const displayText = this.textContent;
        document.querySelector(".mat-mdc-select-min-line").textContent =
          displayText;
        brandSelect.classList.remove("mat-select-opened");
      });
    });
  }
});


document.addEventListener("DOMContentLoaded", function () {
  const tableBody = document.getElementById("borrowerTableBody");
 console.log("Called data")
  // Generate sample data with additional fields
  const data = Array.from({ length: 50 }, (_, i) => ({
    loginAccountUserName: `user${i + 1}`,
    firstName: `John${i + 1}`,
    lastName: `Doe${i + 1}`,
    borrowerName: `John${i + 1} Doe${i + 1}`,
    emailAddress: `borrower${i + 1}@example.com`,
    phoneNumber: `(${Math.floor(Math.random() * 900) + 100}) ${
      Math.floor(Math.random() * 900) + 100
    }-${Math.floor(Math.random() * 9000) + 1000}`,
    propertyAddress: `${Math.floor(Math.random() * 9999) + 1} ${
      ["Oak", "Maple", "Pine", "Cedar", "Elm"][Math.floor(Math.random() * 5)]
    } ${
      ["Street", "Avenue", "Road", "Boulevard", "Lane"][
        Math.floor(Math.random() * 5)
      ]
    }, ${
      ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"][
        Math.floor(Math.random() * 5)
      ]
    }, ${["NY", "CA", "IL", "TX", "AZ"][Math.floor(Math.random() * 5)]} ${
      Math.floor(Math.random() * 89999) + 10000
    }`,
    ssn: `${Math.floor(Math.random() * 900) + 100}-${
      Math.floor(Math.random() * 90) + 10
    }-${Math.floor(Math.random() * 9000) + 1000}`,
    loanNumber: `LOAN${String(Math.floor(Math.random() * 900000) + 100000)}`,
    status: ["Active", "Pending", "Inactive"][Math.floor(Math.random() * 3)],
  }));

  // Update table rows with new fields
  data.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${row.loginAccountUserName}</td>
            <td>${row.firstName}</td>
            <td>${row.lastName}</td>
            <td>${row.emailAddress}</td>
            <td>${row.phoneNumber}</td>
            <td>${row.propertyAddress}</td>
            <td>${row.ssn}</td>
            <td>${row.loanNumber}</td>
            <td>${row.status}</td>
        `;
    tableBody.appendChild(tr);
  });
});

const brandData = [
  { name: "All Brands", value: "all", type: "onshore" },
  { name: "Cenlar FSB", value: "cenlar", type: "onshore" },
  { name: "Chase Bank", value: "chase", type: "onshore" },
  { name: "Wells Fargo", value: "wellsfargo", type: "onshore" },
  { name: "Bank of America", value: "bankofamerica", type: "offshore" },
  { name: "Citibank", value: "citibank", type: "offshore" },
  { name: "HSBC", value: "hsbc", type: "offshore" },
  { name: "Deutsche Bank", value: "deutschebank", type: "offshore" },
  { name: "Goldman Sachs", value: "goldmansachs", type: "onshore" },
];

document.addEventListener("DOMContentLoaded", function () {
  const brandSelect = document.getElementById("brandSelect");

  // Populate brand options
  brandData.forEach((brand) => {
    const option = document.createElement("option");
    option.value = brand.value;
    option.textContent = brand.name;
    option.dataset.type = brand.type;
    brandSelect.appendChild(option);
  });

  // Handle brand selection
  brandSelect.addEventListener("change", function (e) {
    const selectedOption = this.options[this.selectedIndex];
    const selectedBrand = brandData.find((b) => b.value === this.value);
    if (selectedBrand) {
      console.log(
        "Selected Brand:",
        selectedBrand.name,
        "Type:",
        selectedBrand.type
      );
      // Update display text
      document.querySelector(".mat-mdc-select-min-line").textContent =
        selectedBrand.name;

      // Filter data based on selected brand
      const filteredData =
        selectedBrand.value === "all"
          ? borrowerData
          : borrowerData.filter((row) => row.brand === selectedBrand.name);

      updateTable(filteredData);
    }
  });
});

document.addEventListener("DOMContentLoaded", function () {

  // Generate initial data
  borrowerData = Array.from({ length: 50 }, (_, i) => {
    const randomBrand = brandData[Math.floor(Math.random() * brandData.length)];
    return {
      loginAccountUserName: `user${i + 1}`,
      firstName: `John${i + 1}`,
      lastName: `Doe${i + 1}`,
      brand: randomBrand.name,
      type: randomBrand.type,
      emailAddress: `borrower${i + 1}@example.com`,
      phoneNumber: `(${Math.floor(Math.random() * 900) + 100}) ${
        Math.floor(Math.random() * 900) + 100
      }-${Math.floor(Math.random() * 9000) + 1000}`,
      propertyAddress: `${Math.floor(Math.random() * 9999) + 1} ${
        ["Oak", "Maple", "Pine", "Cedar", "Elm"][Math.floor(Math.random() * 5)]
      } St`,
      ssn: `${Math.floor(Math.random() * 900) + 100}-${
        Math.floor(Math.random() * 90) + 10
      }-${Math.floor(Math.random() * 9000) + 1000}`,
      loanNumber: `LOAN${String(Math.floor(Math.random() * 900000) + 100000)}`,
      status: ["Active", "Pending", "Inactive"][Math.floor(Math.random() * 3)],
    };
  });

  // Initial table population
  updateTable(borrowerData);
})

  document.addEventListener("DOMContentLoaded", function () { 
    const searchButton = document.getElementById("searchButton");
    
    searchButton.addEventListener("click", function () {
        console.log("Clicked")
        const searchCriteria = {
            username: document.getElementById("mat-input-0")?.value.trim() || '',
            firstName: document.getElementById("firstName")?.value.trim() || '',
            lastName: document.getElementById("lastName")?.value.trim() || '',
            email: document.getElementById("email")?.value.trim() || '',
            phone: document.getElementById("phone")?.value.trim() || '',
            address: document.getElementById("address")?.value.trim() || '',
            ssn: document.getElementById("ssn")?.value.trim() || '',
            loanNumber: document.getElementById("loanNumber")?.value.trim() || ''
        };

        const isOffshore = document.getElementById("typeToggle")?.checked;
        const brandSelect = document.getElementById("brandSelect");
        const selectedBrand = brandData.find((b) => b.value === brandSelect?.value);

        console.log('Search Criteria:', searchCriteria);
        console.log('Is Offshore User:', isOffshore);
        console.log('Selected Brand:', selectedBrand);

        const hasSearchCriteria = Object.values(searchCriteria).some(value => value !== '');
        console.log('Has Search Criteria:', hasSearchCriteria);
        
        const filteredData = borrowerData.filter((borrower) => {
            console.log('Checking borrower:', borrower);
            
            const criteriaMatch = 
                (!searchCriteria.username || borrower.loginAccountUserName === searchCriteria.username) &&
                (!searchCriteria.firstName || borrower.firstName === searchCriteria.firstName) &&
                (!searchCriteria.lastName || borrower.lastName === searchCriteria.lastName) &&
                (!searchCriteria.email || borrower.emailAddress === searchCriteria.email) &&
                (!searchCriteria.phone || borrower.phoneNumber === searchCriteria.phone) &&
                (!searchCriteria.address || borrower.propertyAddress === searchCriteria.address) &&
                (!searchCriteria.ssn || borrower.ssn === searchCriteria.ssn) &&
                (!searchCriteria.loanNumber || borrower.loanNumber === searchCriteria.loanNumber);

                const brandMatches = !selectedBrand || selectedBrand.value === "all" 
                ? true 
                : borrower.brand === selectedBrand.name;

            console.log('Criteria Match:', criteriaMatch);
            console.log('Brand Match:', brandMatches);
            
            return criteriaMatch && brandMatches;
        });

        console.log('Filtered Data:', filteredData);
        console.log('Filtered Data Length:', filteredData.length);

        // Check loan access restriction
        if (hasSearchCriteria && filteredData.length === 1) {
            console.log('Single Result Found');
            console.log('Result Type:', filteredData[0].type);
            console.log('User Type:', isOffshore ? 'offshore' : 'onshore');
            
            const isRestricted = (isOffshore && filteredData[0].type === 'onshore') || 
                               (!isOffshore && filteredData[0].type === 'offshore');
            
            console.log('Is Access Restricted:', isRestricted);

            if (isRestricted) {
                console.log('Showing restriction error');
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.textContent = 'Loan not provisioned to you';
                errorDiv.style.color = 'red';
                errorDiv.style.padding = '10px';
                errorDiv.style.marginTop = '10px';
                
                const tableContainer = document.getElementById('borrowerTableBody').parentElement;
                const existingError = document.querySelector('.error-message');
                if (existingError) {
                    existingError.remove();
                }
                tableContainer.insertBefore(errorDiv, tableContainer.firstChild);
                updateTable([]);
                return;
            }
        }

        const existingError = document.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        updateTable(filteredData);
    });
});

  // Clear search functionality
  document.querySelector(".text-link").addEventListener("click", function () {
    document
      .querySelectorAll("input[matInput]")
      .forEach((input) => (input.value = ""));
    updateTable(borrowerData);
  });

document.addEventListener("DOMContentLoaded", function () {
  const typeToggle = document.getElementById("typeToggle");
  const toggleLabel = document.getElementById("toggleLabel");
  const brandSelect = document.getElementById("brandSelect");

  // Toggle switch handler
  typeToggle.addEventListener("change", function () {
    const type = this.checked ? "offshore" : "onshore";
    toggleLabel.textContent = this.checked ? "Offshore" : "Onshore";

    // Filter brands based on type
    const filteredBrands =
      type === "onshore"
        ? brandData
        : brandData.filter((brand) => brand.type === "offshore");

    // Update brand dropdown
    brandSelect.innerHTML =
      '<option value="" disabled selected>Select Brand</option>';
    filteredBrands.forEach((brand) => {
      const option = document.createElement("option");
      option.value = brand.value;
      option.textContent = brand.name;
      option.dataset.type = brand.type;
      brandSelect.appendChild(option);
    });

    // Filter table data
    console.log(borrowerData, "borrowerData");
    const filteredData = borrowerData.filter((row) => {
      const brandInfo = brandData.find((b) => b.name === row.brand);
      return type === "onshore" || (brandInfo && brandInfo.type === "offshore");
    });

    console.log(filteredData, "filteredData");

    updateTable(filteredData);
  });
});

document.querySelector(".text-link").addEventListener("click", function () {
  // Clear all input fields
  document
    .querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"]'
    )
    .forEach((input) => {
      input.value = "";
    });

  // Reset toggle to onshore
  const typeToggle = document.getElementById("typeToggle");
  const toggleLabel = document.getElementById("toggleLabel");
  typeToggle.checked = false;
  toggleLabel.textContent = "Onshore";

  // Reset brand dropdown to All Brands
  const brandSelect = document.getElementById("brandSelect");
  brandSelect.value = "all";

  // Update brand display text
  const brandDisplayText = document.querySelector(".mat-mdc-select-min-line");
  if (brandDisplayText) {
    brandDisplayText.textContent = "All Brands";
  }

  // Show all data
  updateTable(borrowerData);
});


document.getElementById("returnToSearchButton").addEventListener("click", function() {
    // Clear all input fields
    document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]')
        .forEach((input) => {
            input.value = "";
        });

    // Get user type
    const isOffshore = document.getElementById("typeToggle")?.checked;

    // Filter data based on user type
    const filteredData = borrowerData.filter(row => {
        if (isOffshore) {
            return row.type === 'offshore';
        }
        return true;
    });

    // Remove any existing error messages
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    // Update table with filtered data
    updateTable(filteredData);
});
