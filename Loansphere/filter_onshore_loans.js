/**
 * Offshore-Only Loans Filter Script
 *
 * When injected, this script filters the storedLoansSet to ONLY include offshore loans,
 * removing all onshore loans from the data.
 *
 * Without this script, the page will show all loans (both onshore and offshore).
 */
(function () {
    console.log("🔍 Offshore-only loans filter script initialized");

    // Generic reusable offshore filter
    const OFFSHORE_FILTER = loan => loan?.type !== "onshore";

    // Filter and replace storedLoansSet
    function filterStoredLoansSet() {
        if (!Array.isArray(window.storedLoansSet)) {
            console.warn("storedLoansSet not found or not an array. Retrying in 1s.");
            setTimeout(filterStoredLoansSet, 1000);
            return;
        }

        const before = window.storedLoansSet.length;
        window.storedLoansSet = window.storedLoansSet.filter(OFFSHORE_FILTER);
        const after = window.storedLoansSet.length;
        console.log(`Filtered storedLoansSet: ${before} → ${after} offshore-only loans`);
    }

    // Filter loan-like arrays in place (helper for reuse)
    function filterLoanData(label, field, dataObj) {
        if (dataObj?.[field] && Array.isArray(dataObj[field])) {
            const before = dataObj[field].length;
            dataObj[field] = dataObj[field].filter(OFFSHORE_FILTER);
            const after = dataObj[field].length;
            console.log(`Filtered ${label}: ${before} → ${after} offshore-only loans`);
        }
    }

    // Patch BroadcastChannel
    function patchBroadcastChannel() {
        const originalPostMessage = BroadcastChannel.prototype.postMessage;
        const originalAddEventListener = BroadcastChannel.prototype.addEventListener;

        // Outgoing loan messages
        BroadcastChannel.prototype.postMessage = function (message) {
            if (message?.action === "response_loans") {
                filterLoanData("outgoing loan data", "result", message);
            }
            return originalPostMessage.call(this, message);
        };

        // Incoming messages - unified for both response_loans and check_loans
        BroadcastChannel.prototype.addEventListener = function (type, listener, options) {
            if (type === "message") {
                const wrappedListener = function (event) {
                    if (event?.data) {
                        const { action } = event.data;
                        if (action === "response_loans") {
                            filterLoanData("incoming response_loans", "result", event.data);
                        } else if (action === "check_loans") {
                            filterLoanData("incoming check_loans", "loans", event.data);
                        }
                    }
                    listener(event);
                };
                return originalAddEventListener.call(this, type, wrappedListener, options);
            }
            return originalAddEventListener.call(this, type, listener, options);
        };
    }

    // INIT
    filterStoredLoansSet();
    patchBroadcastChannel();

    console.log("✅ Offshore-only loan filter active – only offshore loans will be shown.");
})();
