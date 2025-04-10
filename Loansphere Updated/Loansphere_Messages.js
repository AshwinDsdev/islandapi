// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize loading indicator
    const loadingIndicator = document.getElementById('loading-indicator');
    
    // Function to show loading indicator
    function showLoading() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }
    }
    
    // Function to hide loading indicator
    function hideLoading() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
    
    // Show loading indicator initially
    showLoading();
    
    // Make brandsData globally accessible if it's not already
    if (typeof brandsData !== 'undefined' && !window.brandsData) {
        window.brandsData = brandsData;
    }
    
    // Create message threads data if it doesn't exist
    if (!window.messageThreadsData) {
        window.messageThreadsData = [
            {
                id: 101,
                loanNumber: '0000000976',
                borrowerName: 'John Smith',
                subject: 'Payment Question',
                status: 'Open',
                lastMessageDate: '2023-11-15T14:30:00',
                brand: 'Cenlar (CNL)',
                messages: [
                    {
                        id: 1001,
                        sender: 'Borrower',
                        content: 'I have a question about my recent payment. It shows as pending but hasn\'t been applied to my account yet.',
                        timestamp: '2023-11-15T14:30:00',
                        isRead: true
                    },
                    {
                        id: 1002,
                        sender: 'Agent',
                        content: 'Thank you for your message. Payments typically take 1-2 business days to process. If it doesn\'t appear by tomorrow, please let us know.',
                        timestamp: '2023-11-15T16:45:00',
                        isRead: true
                    },
                    {
                        id: 1003,
                        sender: 'Borrower',
                        content: 'Thank you for the information. I\'ll check again tomorrow.',
                        timestamp: '2023-11-15T17:20:00',
                        isRead: false
                    }
                ]
            },
            {
                id: 102,
                loanNumber: '0000000001',
                borrowerName: 'Mary Johnson',
                subject: 'Escrow Analysis',
                status: 'Open',
                lastMessageDate: '2023-11-14T10:15:00',
                brand: 'Freedom Mortgage (FMC)',
                messages: [
                    {
                        id: 2001,
                        sender: 'Borrower',
                        content: 'I received my escrow analysis and my payment is increasing significantly. Can you explain why?',
                        timestamp: '2023-11-14T10:15:00',
                        isRead: true
                    },
                    {
                        id: 2002,
                        sender: 'Agent',
                        content: 'Your property taxes increased this year, which has caused the escrow portion of your payment to increase. I\'ve attached a detailed breakdown for your review.',
                        timestamp: '2023-11-14T13:30:00',
                        isRead: true
                    }
                ]
            },
            {
                id: 103,
                loanNumber: '0000001180',
                borrowerName: 'Robert Williams',
                subject: 'Interest Rate Question',
                status: 'Closed',
                lastMessageDate: '2023-11-10T09:45:00',
                brand: 'Chase (CHS)',
                messages: [
                    {
                        id: 3001,
                        sender: 'Borrower',
                        content: 'I\'m interested in refinancing my loan. What are the current interest rates?',
                        timestamp: '2023-11-10T09:45:00',
                        isRead: true
                    },
                    {
                        id: 3002,
                        sender: 'Agent',
                        content: 'Thank you for your interest in refinancing. Our current rates range from 3.0% to 3.5% depending on credit score and loan term. Would you like to speak with a loan officer?',
                        timestamp: '2023-11-10T11:20:00',
                        isRead: true
                    }
                ]
            },
            {
                id: 104,
                loanNumber: '0000001081',
                borrowerName: 'Patricia Brown',
                subject: 'Insurance Documentation',
                status: 'Open',
                lastMessageDate: '2023-11-13T16:20:00',
                brand: 'Cenlar (CNL)',
                messages: [
                    {
                        id: 4001,
                        sender: 'Borrower',
                        content: 'I\'ve updated my homeowner\'s insurance policy. How do I submit the new documentation?',
                        timestamp: '2023-11-13T16:20:00',
                        isRead: true
                    },
                    {
                        id: 4002,
                        sender: 'Agent',
                        content: 'You can upload your new insurance documents through the "Documents" section of your account. Alternatively, you can email them to insurance@cenlar.com with your loan number in the subject line.',
                        timestamp: '2023-11-14T09:10:00',
                        isRead: false
                    }
                ]
            },
            {
                id: 105,
                loanNumber: '0000000245',
                borrowerName: 'James Davis',
                subject: 'Payment Extension Request',
                status: 'Open',
                lastMessageDate: '2023-11-16T11:05:00',
                brand: 'Wells Fargo (WF)',
                messages: [
                    {
                        id: 5001,
                        sender: 'Borrower',
                        content: 'Due to a temporary financial hardship, I need to request a payment extension for this month. What are my options?',
                        timestamp: '2023-11-16T11:05:00',
                        isRead: true
                    }
                ]
            }
        ];
    }
    
    // Status options
    const statusOptions = [
        { id: 1, name: 'All Statuses', code: 'ALL' },
        { id: 2, name: 'Open', code: 'OPEN' },
        { id: 3, name: 'Closed', code: 'CLOSED' },
        { id: 4, name: 'Pending', code: 'PENDING' }
    ];
    
    // Initialize the message threads UI
    function initializeMessageThreadsUI() {
        // Create the message threads container if it doesn't exist
        let messagesContainer = document.querySelector('.message-threads-container');
        if (!messagesContainer) {
            const appRoot = document.querySelector('app-root');
            const wrapper = document.querySelector('.wrapper');
            
            // Create the messages container
            messagesContainer = document.createElement('div');
            messagesContainer.className = 'message-threads-container';
            
            // Create the messages header
            const messagesHeader = document.createElement('div');
            messagesHeader.className = 'messages-header';
            messagesHeader.innerHTML = `
                <h2>Message Threads</h2>
                <div class="messages-filters">
                    <div class="filter-group">
                        <label for="loanNumberFilter">Loan Number:</label>
                        <input type="text" id="loanNumberFilter" placeholder="Enter Loan Number">
                    </div>
                    <div class="filter-group">
                        <label for="statusFilter">Status:</label>
                        <select id="statusFilter">
                            ${statusOptions.map(status => `<option value="${status.code}">${status.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="dateFromFilter">Date From:</label>
                        <input type="date" id="dateFromFilter">
                    </div>
                    <div class="filter-group">
                        <label for="dateToFilter">Date To:</label>
                        <input type="date" id="dateToFilter">
                    </div>
                    <button id="applyFilters" class="btn-primary">Apply Filters</button>
                    <button id="resetFilters" class="btn-secondary">Reset</button>
                </div>
            `;
            
            // Create the messages list
            const messagesList = document.createElement('div');
            messagesList.className = 'messages-list';
            messagesList.innerHTML = `
                <table class="messages-table">
                    <thead>
                        <tr>
                            <th>Loan Number</th>
                            <th>Borrower Name</th>
                            <th>Subject</th>
                            <th>Status</th>
                            <th>Brand</th>
                            <th>Last Message Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="messagesTableBody">
                        <!-- Message threads will be populated here -->
                    </tbody>
                </table>
            `;
            
            // Create the message detail view (initially hidden)
            const messageDetail = document.createElement('div');
            messageDetail.className = 'message-detail';
            messageDetail.style.display = 'none';
            messageDetail.innerHTML = `
                <div class="message-detail-header">
                    <button id="backToList" class="btn-secondary">Back to List</button>
                    <h3 id="messageDetailSubject"></h3>
                    <div class="message-detail-info">
                        <span id="messageDetailLoanNumber"></span> | 
                        <span id="messageDetailBorrowerName"></span> | 
                        <span id="messageDetailStatus"></span>
                    </div>
                </div>
                <div id="messageDetailMessages" class="message-detail-messages">
                    <!-- Individual messages will be populated here -->
                </div>
                <div class="message-reply-form">
                    <textarea id="messageReplyText" placeholder="Type your reply here..."></textarea>
                    <button id="sendReply" class="btn-primary">Send Reply</button>
                </div>
            `;
            
            // Append all elements to the container
            messagesContainer.appendChild(messagesHeader);
            messagesContainer.appendChild(messagesList);
            messagesContainer.appendChild(messageDetail);
            
            // Append the container to the wrapper
            wrapper.appendChild(messagesContainer);
            
            // Populate the messages table
            populateMessageThreads();
            
            // Add event listeners
            document.getElementById('applyFilters').addEventListener('click', applyFilters);
            document.getElementById('resetFilters').addEventListener('click', resetFilters);
            document.getElementById('backToList').addEventListener('click', function() {
                document.querySelector('.messages-list').style.display = 'block';
                document.querySelector('.message-detail').style.display = 'none';
            });
            document.getElementById('sendReply').addEventListener('click', sendReply);
            
            // Add event listener for Enter key on loan number input
            const loanNumberInput = document.getElementById('loanNumberFilter');
            if (loanNumberInput) {
                loanNumberInput.addEventListener('keyup', function(event) {
                    if (event.key === 'Enter') {
                        console.log('Enter key pressed on loan number input');
                        applyFilters();
                        event.preventDefault();
                    }
                });
            }
        }
    }
    
    // Populate message threads table
    function populateMessageThreads(filteredThreads = null) {
        console.log("populateMessageThreads called");
        
        // Check if we're already showing a not provisioned alert
        if (window._showingNotProvisionedMessage && window._restrictedLoanNumber) {
            console.log(`Already showing not provisioned alert for ${window._restrictedLoanNumber}`);
            
            // Make sure the table shows the "not provisioned" message
            const tableBody = document.getElementById('messagesTableBody');
            if (tableBody) {
                tableBody.innerHTML = '';
                const row = document.createElement('tr');
                row.innerHTML = `<td colspan="7" class="text-center" style="color: #f44336; font-weight: bold;">Loan ${window._restrictedLoanNumber} is not provisioned to the user</td>`;
                tableBody.appendChild(row);
            }
            
            return; // Don't override the not provisioned alert
        }
        
        // Get the loan number from the input field
        const loanNumberInput = document.getElementById('loanNumberFilter');
        const loanNumber = loanNumberInput ? loanNumberInput.value.trim() : '';
        
        console.log(`Populating message threads with loan number: ${loanNumber}`);
        
        // Check if loan number is not allowed before proceeding
        if (loanNumber) {
            // First check if the isLoanNumberAllowed function is available
            if (window.isLoanNumberAllowed && typeof window.isLoanNumberAllowed === 'function') {
                const isAllowed = window.isLoanNumberAllowed(loanNumber);
                console.log(`Checking if loan ${loanNumber} is allowed: ${isAllowed}`);
                
                if (!isAllowed) {
                    console.log(`Loan ${loanNumber} is not provisioned to the user, showing alert in populateMessageThreads`);
                    
                    // Show the not provisioned alert if the function is available
                    if (window.showNotProvisionedAlert && typeof window.showNotProvisionedAlert === 'function') {
                        window.showNotProvisionedAlert(loanNumber);
                    } else {
                        // Fallback if the function isn't available
                        const tableBody = document.getElementById('messagesTableBody');
                        if (tableBody) {
                            tableBody.innerHTML = '';
                            const row = document.createElement('tr');
                            row.innerHTML = `<td colspan="6" class="text-center" style="color: #f44336; font-weight: bold;">Loan ${loanNumber} is not provisioned to the user</td>`;
                            tableBody.appendChild(row);
                            
                            // Set flags to indicate we're showing a not provisioned message
                            window._showingNotProvisionedMessage = true;
                            window._restrictedLoanNumber = loanNumber;
                        }
                    }
                    
                    return; // Exit early
                }
            } else {
                console.warn("isLoanNumberAllowed function is not available");
            }
        }
        
        const threads = filteredThreads || window.messageThreadsData;
        const tableBody = document.getElementById('messagesTableBody');
        
        if (tableBody) {
            tableBody.innerHTML = '';
            
            if (threads.length === 0) {
                // Check if we have a loan number that's not allowed
                if (loanNumber && window.isLoanNumberAllowed && typeof window.isLoanNumberAllowed === 'function') {
                    const isAllowed = window.isLoanNumberAllowed(loanNumber);
                    
                    if (!isAllowed) {
                        console.log(`No threads found for restricted loan: ${loanNumber}`);
                        
                        // Show "Loan is not provisioned" message instead of "No message threads found"
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = `<td colspan="7" class="text-center" style="color: #f44336; font-weight: bold;">Loan ${loanNumber} is not provisioned to the user</td>`;
                        tableBody.appendChild(emptyRow);
                        
                        // Also show the alert if available
                        if (window.showNotProvisionedAlert && typeof window.showNotProvisionedAlert === 'function') {
                            window.showNotProvisionedAlert(loanNumber);
                        } else {
                            // Set flags to indicate we're showing a not provisioned message
                            window._showingNotProvisionedMessage = true;
                            window._restrictedLoanNumber = loanNumber;
                        }
                        
                        return; // Exit early
                    }
                }
                
                // Regular "No message threads found" message
                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = `<td colspan="7" class="text-center">No message threads found</td>`;
                tableBody.appendChild(emptyRow);
            } else {
                threads.forEach(thread => {
                    const row = document.createElement('tr');
                    const date = new Date(thread.lastMessageDate);
                    const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                    
                    // Get brand info if not already present
                    let brandDisplay = thread.brand || 'Unknown';
                    
                    // If we don't have brand info but have loan number, try to find it from brandsData
                    if ((!thread.brand || thread.brand === 'Unknown') && thread.loanNumber && window.brandsData) {
                        const brand = window.brandsData.find(b => 
                            b.loanNumbers && b.loanNumbers.includes(thread.loanNumber)
                        );
                        if (brand) {
                            brandDisplay = brand.name || brand.code;
                            // Store it for future use
                            thread.brand = brandDisplay;
                        }
                    }
                    
                    row.innerHTML = `
                        <td>${thread.loanNumber}</td>
                        <td>${thread.borrowerName}</td>
                        <td>${thread.subject}</td>
                        <td><span class="status-badge status-${thread.status.toLowerCase()}">${thread.status}</span></td>
                        <td>${brandDisplay}</td>
                        <td>${formattedDate}</td>
                        <td>
                            <button class="btn-view-thread" data-thread-id="${thread.id}">View</button>
                        </td>
                    `;
                    
                    tableBody.appendChild(row);
                });
                
                // Add event listeners to view buttons
                document.querySelectorAll('.btn-view-thread').forEach(button => {
                    button.addEventListener('click', function() {
                        const threadId = this.getAttribute('data-thread-id');
                        viewMessageThread(parseInt(threadId));
                    });
                });
            }
        }
    }
    
    // View message thread details
    function viewMessageThread(threadId) {
        const thread = window.messageThreadsData.find(t => t.id === threadId);
        
        if (thread) {
            // Update the detail view with thread information
            document.getElementById('messageDetailSubject').textContent = thread.subject;
            document.getElementById('messageDetailLoanNumber').textContent = `Loan: ${thread.loanNumber}`;
            document.getElementById('messageDetailBorrowerName').textContent = `Borrower: ${thread.borrowerName}`;
            document.getElementById('messageDetailStatus').textContent = `Status: ${thread.status}`;
            
            // Populate messages
            const messagesContainer = document.getElementById('messageDetailMessages');
            messagesContainer.innerHTML = '';
            
            thread.messages.forEach(message => {
                const messageElement = document.createElement('div');
                messageElement.className = `message message-${message.sender.toLowerCase()}`;
                
                const date = new Date(message.timestamp);
                const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                
                messageElement.innerHTML = `
                    <div class="message-header">
                        <span class="message-sender">${message.sender}</span>
                        <span class="message-timestamp">${formattedDate}</span>
                    </div>
                    <div class="message-content">${message.content}</div>
                `;
                
                messagesContainer.appendChild(messageElement);
            });
            
            // Show the detail view and hide the list view
            document.querySelector('.messages-list').style.display = 'none';
            document.querySelector('.message-detail').style.display = 'block';
        }
    }
    
    // Apply filters to message threads
    function applyFilters() {
        const loanNumber = document.getElementById('loanNumberFilter').value.trim();
        const status = document.getElementById('statusFilter').value;
        const dateFrom = document.getElementById('dateFromFilter').value;
        const dateTo = document.getElementById('dateToFilter').value;
        
        // Get the selected brand from the header
        const brandSelect = document.querySelector('.brand-dropdown .selected-option') || 
                           document.querySelector('mat-select[name="brandSelect"] .mat-mdc-select-value-text') ||
                           document.getElementById('brandSelect');
        
        let selectedBrand = null;
        let selectedBrandCode = null;
        
        if (brandSelect) {
            // Get the selected brand text
            selectedBrand = brandSelect.textContent ? brandSelect.textContent.trim() : 
                           (brandSelect.options ? brandSelect.options[brandSelect.selectedIndex].text : null);
            
            // If it's "All Brands", set to null for no filtering
            if (selectedBrand === 'All Brands') {
                selectedBrand = null;
            } else if (selectedBrand) {
                // Try to extract brand code if available
                const codeMatch = selectedBrand.match(/\(([A-Z0-9]{2,4})\)$/);
                selectedBrandCode = codeMatch ? codeMatch[1] : null;
                
                console.log(`Filtering by brand: ${selectedBrand} (Code: ${selectedBrandCode || 'None'})`);
            }
        }
        
        console.log(`Applying filters with loan number: ${loanNumber}, brand: ${selectedBrand || 'All Brands'}`);
        
        // Check if loan number is not allowed before proceeding with filtering
        if (loanNumber) {
            // First check if the isLoanNumberAllowed function is available
            if (window.isLoanNumberAllowed && typeof window.isLoanNumberAllowed === 'function') {
                const isAllowed = window.isLoanNumberAllowed(loanNumber);
                console.log(`Checking if loan ${loanNumber} is allowed: ${isAllowed}`);
                
                if (!isAllowed) {
                    console.log(`Loan ${loanNumber} is not provisioned to the user, showing alert`);
                    
                    // Show the not provisioned alert if the function is available
                    if (window.showNotProvisionedAlert && typeof window.showNotProvisionedAlert === 'function') {
                        window.showNotProvisionedAlert(loanNumber);
                    } else {
                        // Fallback if the function isn't available
                        const tableBody = document.getElementById('messagesTableBody');
                        if (tableBody) {
                            tableBody.innerHTML = '';
                            const row = document.createElement('tr');
                            row.innerHTML = `<td colspan="6" class="text-center" style="color: #f44336; font-weight: bold;">Loan ${loanNumber} is not provisioned to the user</td>`;
                            tableBody.appendChild(row);
                            
                            // Set flags to indicate we're showing a not provisioned message
                            window._showingNotProvisionedMessage = true;
                            window._restrictedLoanNumber = loanNumber;
                        }
                    }
                    
                    return; // Stop further processing
                }
            } else {
                console.warn("isLoanNumberAllowed function is not available");
            }
        }
        
        let filteredThreads = window.messageThreadsData;
        
        // Filter by loan number
        if (loanNumber) {
            filteredThreads = filteredThreads.filter(thread => 
                thread.loanNumber.includes(loanNumber)
            );
        }
        
        // Filter by brand if selected
        if (selectedBrand) {
            filteredThreads = filteredThreads.filter(thread => {
                // If thread doesn't have brand info, try to find it from brandsData
                if (!thread.brand && thread.loanNumber && window.brandsData) {
                    const brand = window.brandsData.find(b => 
                        b.loanNumbers && b.loanNumbers.includes(thread.loanNumber)
                    );
                    if (brand) {
                        thread.brand = brand.name || brand.code;
                    }
                }
                
                // If we still don't have brand info, we can't filter by it
                if (!thread.brand) return true;
                
                // Try exact match first
                if (thread.brand === selectedBrand) {
                    return true;
                }
                
                // If we have a brand code, check if it matches
                if (selectedBrandCode) {
                    // Extract brand code from thread brand if possible
                    const threadBrandMatch = thread.brand.match(/\(([A-Z0-9]{2,4})\)$/);
                    const threadBrandCode = threadBrandMatch ? threadBrandMatch[1] : null;
                    
                    if (threadBrandCode && threadBrandCode === selectedBrandCode) {
                        return true;
                    }
                }
                
                // Check if the thread brand contains the selected brand or vice versa
                if (thread.brand.includes(selectedBrand) || selectedBrand.includes(thread.brand)) {
                    return true;
                }
                
                return false;
            });
        }
        
        // Filter by status
        if (status && status !== 'ALL') {
            filteredThreads = filteredThreads.filter(thread => 
                thread.status.toUpperCase() === status
            );
        }
        
        // Filter by date from
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            filteredThreads = filteredThreads.filter(thread => 
                new Date(thread.lastMessageDate) >= fromDate
            );
        }
        
        // Filter by date to
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999); // End of the day
            filteredThreads = filteredThreads.filter(thread => 
                new Date(thread.lastMessageDate) <= toDate
            );
        }
        
        // Reset not provisioned flags
        window._showingNotProvisionedMessage = false;
        window._restrictedLoanNumber = null;
        
        // Update the table with filtered results
        populateMessageThreads(filteredThreads);
    }
    
    // Reset filters
    function resetFilters() {
        document.getElementById('loanNumberFilter').value = '';
        document.getElementById('statusFilter').value = 'ALL';
        document.getElementById('dateFromFilter').value = '';
        document.getElementById('dateToFilter').value = '';
        
        // Try to reset brand dropdown if it exists
        const brandDropdown = document.querySelector('.brand-dropdown');
        if (brandDropdown) {
            const selectedOption = brandDropdown.querySelector('.selected-option');
            if (selectedOption) {
                selectedOption.textContent = 'All Brands';
            }
            
            // Trigger any event listeners
            const event = new Event('change', { bubbles: true });
            brandDropdown.dispatchEvent(event);
        }
        
        // Also try to reset Angular Material brand select if it exists
        const matBrandSelect = document.querySelector('mat-select[name="brandSelect"]');
        if (matBrandSelect) {
            // This is more complex as Angular Material uses its own components
            // We'll try to find the "All Brands" option and select it
            const allBrandsOption = Array.from(document.querySelectorAll('mat-option'))
                .find(option => option.textContent.trim() === 'All Brands');
                
            if (allBrandsOption) {
                // Simulate a click on the "All Brands" option
                allBrandsOption.click();
            }
        }
        
        // Repopulate with all threads
        populateMessageThreads();
    }
    
    // Send reply to a message thread
    function sendReply() {
        const replyText = document.getElementById('messageReplyText').value.trim();
        
        if (replyText) {
            alert('Reply sent: ' + replyText);
            document.getElementById('messageReplyText').value = '';
        } else {
            alert('Please enter a reply message');
        }
    }
    
    // Initialize brand and channel dropdowns
    function initializeDropdowns() {
        // Get the brand select element
        const brandSelect = document.querySelector('[name="brandSelect"]');
        if (brandSelect) {
            // Create dropdown items for brands
            const brandItems = document.createElement('div');
            brandItems.className = 'dropdown-items';
            
            // Add "All Brands" option first
            const allBrandsItem = document.createElement('div');
            allBrandsItem.className = 'dropdown-item';
            allBrandsItem.textContent = 'All Brands';
            allBrandsItem.setAttribute('data-value', 'ALL');
            brandItems.appendChild(allBrandsItem);
            
            // Add brands from datasource.js
            if (typeof brandsData !== 'undefined') {
                brandsData.forEach(brand => {
                    const item = document.createElement('div');
                    item.className = 'dropdown-item';
                    item.textContent = brand.name;
                    item.setAttribute('data-value', brand.code);
                    brandItems.appendChild(item);
                });
            } else {
                console.error('brandsData is not defined. Make sure datasource.js is loaded correctly.');
            }
            
            // Add click event to show dropdown
            brandSelect.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Remove any existing dropdown
                const existingDropdown = document.querySelector('.brand-dropdown');
                if (existingDropdown) {
                    existingDropdown.remove();
                }
                
                // Create and position the dropdown
                const dropdown = document.createElement('div');
                dropdown.className = 'brand-dropdown custom-dropdown';
                dropdown.appendChild(brandItems.cloneNode(true));
                
                // Position the dropdown
                const rect = brandSelect.getBoundingClientRect();
                dropdown.style.position = 'absolute';
                dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
                dropdown.style.left = (rect.left + window.scrollX) + 'px';
                dropdown.style.width = rect.width + 'px';
                dropdown.style.zIndex = '1000';
                
                // Add to document
                document.body.appendChild(dropdown);
                
                // Add click events to items
                dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                    item.addEventListener('click', function() {
                        const value = this.getAttribute('data-value');
                        const text = this.textContent;
                        
                        // Update the select display
                        const valueText = brandSelect.querySelector('.mat-mdc-select-min-line');
                        if (valueText) {
                            valueText.textContent = text;
                        }
                        
                        // Close the dropdown
                        dropdown.remove();
                    });
                });
                
                // Close dropdown when clicking outside
                document.addEventListener('click', function closeDropdown(e) {
                    if (!dropdown.contains(e.target) && e.target !== brandSelect) {
                        dropdown.remove();
                        document.removeEventListener('click', closeDropdown);
                    }
                });
            });
        }
        
        // Get the channel select element
        const channelSelect = document.querySelector('[name="channelSelect"]');
        if (channelSelect) {
            // Create dropdown items for channels
            const channelItems = document.createElement('div');
            channelItems.className = 'dropdown-items';
            
            // Add channel options
            const channels = [
                { name: 'Borrower Self-Service', code: 'BSS' },
                { name: 'Customer Service', code: 'CS' },
                { name: 'Loan Servicing', code: 'LS' },
                { name: 'Collections', code: 'COL' }
            ];
            
            channels.forEach(channel => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = channel.name;
                item.setAttribute('data-value', channel.code);
                channelItems.appendChild(item);
            });
            
            // Add click event to show dropdown
            channelSelect.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Remove any existing dropdown
                const existingDropdown = document.querySelector('.channel-dropdown');
                if (existingDropdown) {
                    existingDropdown.remove();
                }
                
                // Create and position the dropdown
                const dropdown = document.createElement('div');
                dropdown.className = 'channel-dropdown custom-dropdown';
                dropdown.appendChild(channelItems.cloneNode(true));
                
                // Position the dropdown
                const rect = channelSelect.getBoundingClientRect();
                dropdown.style.position = 'absolute';
                dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
                dropdown.style.left = (rect.left + window.scrollX) + 'px';
                dropdown.style.width = rect.width + 'px';
                dropdown.style.zIndex = '1000';
                
                // Add to document
                document.body.appendChild(dropdown);
                
                // Add click events to items
                dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                    item.addEventListener('click', function() {
                        const value = this.getAttribute('data-value');
                        const text = this.textContent;
                        
                        // Update the select display
                        const valueText = channelSelect.querySelector('.mat-mdc-select-min-line');
                        if (valueText) {
                            valueText.textContent = text;
                        }
                        
                        // Close the dropdown
                        dropdown.remove();
                    });
                });
                
                // Close dropdown when clicking outside
                document.addEventListener('click', function closeDropdown(e) {
                    if (!dropdown.contains(e.target) && e.target !== channelSelect) {
                        dropdown.remove();
                        document.removeEventListener('click', closeDropdown);
                    }
                });
            });
        }
    }
    
    // Handle hamburger menu click
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    if (hamburgerMenu) {
        hamburgerMenu.addEventListener('click', function() {
            // Toggle sidebar
            const sidebar = document.querySelector('.sidebar');
            if (!sidebar) {
                // Create sidebar if it doesn't exist
                createSidebar();
            } else {
                // Toggle sidebar visibility
                sidebar.classList.toggle('sidebar-open');
            }
        });
    }
    
    // Create sidebar
    function createSidebar() {
        const sidebar = document.createElement('div');
        sidebar.className = 'sidebar sidebar-open';
        
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <h3>Menu</h3>
                <button class="sidebar-close">&times;</button>
            </div>
            <ul class="sidebar-menu">
                <li class="sidebar-menu-item active"><a href="#"><i class="fa-solid fa-message"></i> Messages</a></li>
                <li class="sidebar-menu-item"><a href="#"><i class="fa-solid fa-house"></i> Dashboard</a></li>
                <li class="sidebar-menu-item"><a href="#"><i class="fa-solid fa-users"></i> Borrowers</a></li>
                <li class="sidebar-menu-item"><a href="#"><i class="fa-solid fa-file-invoice-dollar"></i> Loans</a></li>
                <li class="sidebar-menu-item"><a href="#"><i class="fa-solid fa-chart-line"></i> Reports</a></li>
                <li class="sidebar-menu-item"><a href="#"><i class="fa-solid fa-gear"></i> Settings</a></li>
            </ul>
        `;
        
        document.body.appendChild(sidebar);
        
        // Add close button functionality
        sidebar.querySelector('.sidebar-close').addEventListener('click', function() {
            sidebar.classList.remove('sidebar-open');
        });
        
        // Add menu item click functionality
        sidebar.querySelectorAll('.sidebar-menu-item').forEach(item => {
            item.addEventListener('click', function() {
                // Remove active class from all items
                sidebar.querySelectorAll('.sidebar-menu-item').forEach(i => {
                    i.classList.remove('active');
                });
                
                // Add active class to clicked item
                this.classList.add('active');
                
                // Close sidebar on mobile
                if (window.innerWidth < 768) {
                    sidebar.classList.remove('sidebar-open');
                }
            });
        });
    }
    
    // Initialize tooltips
    const tooltipTriggers = document.querySelectorAll('[aria-describedby]');
    tooltipTriggers.forEach(trigger => {
        const tooltipId = trigger.getAttribute('aria-describedby');
        const tooltip = document.getElementById(tooltipId);
        
        if (tooltip) {
            // Show tooltip on hover
            trigger.addEventListener('mouseenter', function() {
                const rect = trigger.getBoundingClientRect();
                tooltip.style.display = 'block';
                tooltip.style.top = (rect.bottom + 10) + 'px';
                tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
            });
            
            // Hide tooltip when mouse leaves
            trigger.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
            });
        }
    });
    
    // Initialize the UI components
    setTimeout(function() {
        initializeDropdowns();
        initializeMessageThreadsUI();
        createSidebar();
        hideLoading();
    }, 500);
});

// Mock Angular functionality for demonstration purposes
// In a real application, this would be handled by the Angular framework
const mockAngular = {
    bootstrap: function() {
        console.log('Angular bootstrap called');
    },
    
    module: function(name, deps) {
        console.log('Angular module created:', name);
        return {
            controller: function(name, controller) {
                console.log('Controller registered:', name);
                return this;
            },
            directive: function(name, directive) {
                console.log('Directive registered:', name);
                return this;
            },
            service: function(name, service) {
                console.log('Service registered:', name);
                return this;
            }
        };
    }
};

// Initialize mock Angular
window.angular = mockAngular;
document.addEventListener('DOMContentLoaded', function() {
    if (window.angular) {
        window.angular.bootstrap(document, ['loanSphereApp']);
    }
});