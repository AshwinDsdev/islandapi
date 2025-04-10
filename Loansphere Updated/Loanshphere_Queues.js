/**
 * Loansphere Queues Application
 * Main JavaScript file for handling UI interactions and data display
 */

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Show loading indicator
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.style.display = 'flex';
    
    // Initialize the application after a short delay to simulate loading
    setTimeout(function() {
        initializeApp();
        loadingIndicator.style.display = 'none';
    }, 1000);
});

/**
 * Initialize the application
 */
function initializeApp() {
    // Setup event listeners
    setupEventListeners();
    
    // Populate dropdowns
    populateBrandDropdown();
    
    // Generate loan data
    generateLoanData();
}

/**
 * Setup event listeners for interactive elements
 */
function setupEventListeners() {
    // Toggle sidebar
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('main');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
    
    // Filter functionality
    const queueFilter = document.getElementById('queueFilter');
    const statusFilter = document.getElementById('statusFilter');
    const assigneeFilter = document.getElementById('assigneeFilter');
    const searchInput = document.getElementById('searchInput');
    
    if (queueFilter) queueFilter.addEventListener('change', filterLoans);
    if (statusFilter) statusFilter.addEventListener('change', filterLoans);
    if (assigneeFilter) assigneeFilter.addEventListener('change', filterLoans);
    if (searchInput) searchInput.addEventListener('input', filterLoans);
    
    // Brand selection
    const brandSelect = document.getElementById('brandSelect');
    if (brandSelect) {
        brandSelect.addEventListener('change', function() {
            filterLoans();
        });
    }
}

/**
 * Populate the brand dropdown with data from dataSource.js
 */
function populateBrandDropdown() {
    const brandSelect = document.getElementById('brandSelect');
    
    if (brandSelect && window.brandsData) {
        // Clear existing options except the first one
        while (brandSelect.options.length > 1) {
            brandSelect.remove(1);
        }
        
        // Add brand options
        window.brandsData.forEach(brand => {
            const option = document.createElement('option');
            option.value = brand.id;
            option.textContent = brand.name;
            brandSelect.appendChild(option);
        });
        
        console.log(`Populated brand dropdown with ${window.brandsData.length} brands`);
    } else {
        console.error('Brand dropdown element not found or brandsData is not available');
        if (!window.brandsData) {
            console.error('brandsData is not defined. Check if dataSource.js is loaded properly.');
        }
    }
}

/**
 * Generate loan data for the table
 */
function generateLoanData() {
    const loansTableBody = document.getElementById('loansTableBody');
    
    if (loansTableBody && window.brandsData && window.borrowersData) {
        // Clear existing table rows
        loansTableBody.innerHTML = '';
        
        // Create sample loan data by combining brands and borrowers
        const loans = createSampleLoans();
        
        // Populate table with loan data
        loans.forEach((loan, index) => {
            const row = createLoanTableRow(loan, index + 1);
            loansTableBody.appendChild(row);
        });
        
        console.log(`Generated and displayed ${loans.length} loan records`);
    } else {
        console.error('Unable to generate loan data');
        if (!loansTableBody) {
            console.error('Loans table body element not found');
        }
        if (!window.brandsData) {
            console.error('brandsData is not defined. Check if dataSource.js is loaded properly.');
        }
        if (!window.borrowersData) {
            console.error('borrowersData is not defined. Check if dataSource.js is loaded properly.');
        }
    }
}

/**
 * Create sample loan data by combining brands and borrowers
 */
function createSampleLoans() {
    const loans = [];
    let unmatchedBorrowers = 0;
    
    if (window.borrowersData && window.brandsData) {
        // Create loan entries based on borrower data
        window.borrowersData.forEach(borrower => {
            // Find the brand that contains this loan number
            const brand = window.brandsData.find(brand => 
                brand.loanNumbers.includes(borrower.loanNumber)
            );
            
            if (brand) {
                // Generate random queue and status
                const queueTypes = ['Pending Applications', 'Document Review', 'Underwriting', 'Closing'];
                const statusTypes = ['New', 'In Progress', 'On Hold', 'Completed'];
                const assignees = ['Unassigned', 'John Smith', 'Sarah Johnson', 'Michael Brown', 'Emily Davis', 'David Wilson'];
                
                // Generate a due date within the next 30 days
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 30) + 1);
                const formattedDueDate = dueDate.toISOString().split('T')[0];
                
                // Create loan object
                loans.push({
                    loanNumber: borrower.loanNumber,
                    borrowerName: `${borrower.firstName} ${borrower.lastName}`,
                    brand: brand.name,
                    queue: queueTypes[Math.floor(Math.random() * queueTypes.length)],
                    status: statusTypes[Math.floor(Math.random() * statusTypes.length)],
                    assignee: assignees[Math.floor(Math.random() * assignees.length)],
                    dueDate: formattedDueDate,
                    email: borrower.email,
                    registrationDate: borrower.registrationDate,
                    status_code: borrower.status
                });
            } else {
                unmatchedBorrowers++;
                console.warn(`No matching brand found for borrower ${borrower.firstName} ${borrower.lastName} with loan number ${borrower.loanNumber}`);
                
                // Use a default brand for borrowers without a matching brand
                const defaultBrand = window.brandsData[0] || { name: 'Unknown Brand' };
                
                // Generate random queue and status
                const queueTypes = ['Pending Applications', 'Document Review', 'Underwriting', 'Closing'];
                const statusTypes = ['New', 'In Progress', 'On Hold', 'Completed'];
                const assignees = ['Unassigned', 'John Smith', 'Sarah Johnson', 'Michael Brown', 'Emily Davis', 'David Wilson'];
                
                // Generate a due date within the next 30 days
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 30) + 1);
                const formattedDueDate = dueDate.toISOString().split('T')[0];
                
                // Create loan object with default brand
                loans.push({
                    loanNumber: borrower.loanNumber,
                    borrowerName: `${borrower.firstName} ${borrower.lastName}`,
                    brand: defaultBrand.name,
                    queue: queueTypes[Math.floor(Math.random() * queueTypes.length)],
                    status: statusTypes[Math.floor(Math.random() * statusTypes.length)],
                    assignee: assignees[Math.floor(Math.random() * assignees.length)],
                    dueDate: formattedDueDate,
                    email: borrower.email,
                    registrationDate: borrower.registrationDate,
                    status_code: borrower.status
                });
            }
        });
        
        if (unmatchedBorrowers > 0) {
            console.warn(`${unmatchedBorrowers} borrowers did not have a matching brand and were assigned a default brand`);
        }
    } else {
        console.error('Cannot create sample loans: missing data sources');
    }
    
    console.log(`Created ${loans.length} loan records from ${window.borrowersData ? window.borrowersData.length : 0} borrowers`);
    return loans;
}

/**
 * Create a table row for a loan
 */
function createLoanTableRow(loan, index) {
    const row = document.createElement('tr');
    
    // Create status badge
    const statusBadgeClass = getStatusBadgeClass(loan.status);
    
    // Handle potential missing data with defaults
    const loanNumber = loan.loanNumber || 'N/A';
    const borrowerName = loan.borrowerName || 'Unknown Borrower';
    const brand = loan.brand || 'Unknown Brand';
    const queue = loan.queue || 'Unassigned';
    const status = loan.status || 'Unknown';
    const assignee = loan.assignee || 'Unassigned';
    const dueDate = loan.dueDate || 'No date set';
    
    // Create row content
    row.innerHTML = `
        <td>${index}</td>
        <td>${loanNumber}</td>
        <td>${borrowerName}</td>
        <td>${brand}</td>
        <td>${queue}</td>
        <td><span class="badge ${statusBadgeClass}">${status}</span></td>
        <td>${assignee}</td>
        <td>${dueDate}</td>
        <td>
            <button class="btn btn-primary btn-sm btn-action" onclick="viewLoan('${loanNumber}')">
                <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn btn-success btn-sm btn-action" onclick="editLoan('${loanNumber}')">
                <i class="fa-solid fa-edit"></i>
            </button>
            <button class="btn btn-danger btn-sm btn-action" onclick="deleteLoan('${loanNumber}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        </td>
    `;
    
    // Add data attributes for filtering
    row.dataset.loanNumber = loanNumber;
    row.dataset.borrowerName = borrowerName;
    row.dataset.brand = brand;
    row.dataset.queue = queue;
    row.dataset.status = status;
    row.dataset.assignee = assignee;
    
    return row;
}

/**
 * Get the appropriate badge class for a status
 */
function getStatusBadgeClass(status) {
    switch (status) {
        case 'New':
            return 'badge-new';
        case 'In Progress':
            return 'badge-in-progress';
        case 'On Hold':
            return 'badge-on-hold';
        case 'Completed':
            return 'badge-completed';
        default:
            return 'badge-new';
    }
}

/**
 * Filter loans based on selected criteria
 */
function filterLoans() {
    const queueFilter = document.getElementById('queueFilter');
    const statusFilter = document.getElementById('statusFilter');
    const assigneeFilter = document.getElementById('assigneeFilter');
    const brandSelect = document.getElementById('brandSelect');
    const searchInput = document.getElementById('searchInput');
    
    const selectedQueue = queueFilter ? queueFilter.value : 'All Queues';
    const selectedStatus = statusFilter ? statusFilter.value : 'All Statuses';
    const selectedAssignee = assigneeFilter ? assigneeFilter.value : 'All Assignees';
    const selectedBrand = brandSelect ? brandSelect.options[brandSelect.selectedIndex].text : 'All Brands';
    const searchText = searchInput ? searchInput.value.toLowerCase() : '';
    
    const rows = document.querySelectorAll('#loansTableBody tr');
    
    rows.forEach(row => {
        const queue = row.cells[4].textContent.trim();
        const status = row.cells[5].textContent.trim();
        const assignee = row.cells[6].textContent.trim();
        const brand = row.cells[3].textContent.trim();
        const loanNumber = row.cells[1].textContent.trim();
        const borrowerName = row.cells[2].textContent.trim();
        
        // Check if row matches all selected filters
        const matchesQueue = selectedQueue === 'All Queues' || queue === selectedQueue;
        const matchesStatus = selectedStatus === 'All Statuses' || status === selectedStatus;
        const matchesAssignee = selectedAssignee === 'All Assignees' || 
                               (selectedAssignee === 'Unassigned' && assignee === 'Unassigned') ||
                               (selectedAssignee === 'My Tasks' && assignee !== 'Unassigned') ||
                               (selectedAssignee === 'Team Tasks' && assignee !== 'Unassigned') ||
                               assignee === selectedAssignee;
        const matchesBrand = selectedBrand === 'All Brands' || brand === selectedBrand;
        const matchesSearch = searchText === '' || 
                             loanNumber.toLowerCase().includes(searchText) || 
                             borrowerName.toLowerCase().includes(searchText);
        
        // Show or hide row based on filter matches
        if (matchesQueue && matchesStatus && matchesAssignee && matchesBrand && matchesSearch) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

/**
 * View loan details
 */
function viewLoan(loanNumber) {
    if (!window.borrowersData || !window.brandsData) {
        console.error('Data sources not available');
        alert('Unable to retrieve loan details at this time.');
        return;
    }

    // Find the borrower data
    const borrower = window.borrowersData.find(b => b.loanNumber === loanNumber);
    
    if (borrower) {
        // Find the brand data
        const brand = window.brandsData.find(brand => 
            brand.loanNumbers.includes(loanNumber)
        );
        
        let brandName = "Unknown";
        let brandCode = "N/A";
        if (brand) {
            brandName = brand.name;
            brandCode = brand.code;
        }
        
        // Find loan details from the table
        const loanRow = document.querySelector(`#loansTableBody tr[data-loan-number="${loanNumber}"]`);
        let queue = "Unknown";
        let status = "Unknown";
        let assignee = "Unassigned";
        let dueDate = "Not set";
        
        if (loanRow) {
            queue = loanRow.dataset.queue;
            status = loanRow.dataset.status;
            assignee = loanRow.dataset.assignee;
            dueDate = loanRow.cells[7].textContent.trim();
        }
        
        // Create a formatted message with borrower details
        const message = `
            Loan Details:
            -----------------------------
            Loan Number: ${loanNumber}
            Borrower: ${borrower.firstName} ${borrower.lastName}
            Email: ${borrower.email}
            Username: ${borrower.username}
            
            Brand Information:
            -----------------------------
            Brand: ${brandName}
            Brand Code: ${brandCode}
            
            Loan Status:
            -----------------------------
            Queue: ${queue}
            Status: ${status}
            Assignee: ${assignee}
            Due Date: ${dueDate}
            Registration Date: ${borrower.registrationDate}
            Account Status: ${borrower.status}
        `;
        
        alert(message);
        console.log(`Viewed details for loan: ${loanNumber}`);
    } else {
        alert(`No details found for loan number: ${loanNumber}`);
        console.warn(`Attempted to view non-existent loan: ${loanNumber}`);
    }
}

/**
 * Edit loan
 */
function editLoan(loanNumber) {
    alert(`Editing loan: ${loanNumber}`);
    // In a real application, this would open an edit form
}

/**
 * Delete loan
 */
function deleteLoan(loanNumber) {
    if (confirm(`Are you sure you want to delete loan ${loanNumber}?`)) {
        alert(`Loan ${loanNumber} has been deleted.`);
        // In a real application, this would send a delete request to the server
        // and then remove the row from the table
    }
}