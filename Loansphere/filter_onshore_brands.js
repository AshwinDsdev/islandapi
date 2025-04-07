(function() {
    console.log("🔍 Offshore-only filter script initialized");

    const OFFSHORE_FILTER = brand => brand?.type !== "onshore";

    function applyOffshoreFilterToDataSet() {
        if (!Array.isArray(window.storedNumbersSet)) {
            console.warn("storedNumbersSet not found or not an array. Retrying in 1s.");
            setTimeout(applyOffshoreFilterToDataSet, 1000);
            return;
        }

        const before = window.storedNumbersSet.length;
        window.storedNumbersSet = window.storedNumbersSet.filter(OFFSHORE_FILTER);
        const after = window.storedNumbersSet.length;

        console.log(`Filtered storedNumbersSet: ${before} → ${after} offshore-only brands`);
    }

    function patchBroadcastChannel() {
        const originalPost = BroadcastChannel.prototype.postMessage;

        BroadcastChannel.prototype.postMessage = function(message) {
            if (message?.action === "response_brands" && Array.isArray(message.result)) {
                const before = message.result.length;
                message.result = message.result.filter(OFFSHORE_FILTER);
                console.log(`Filtered outgoing brands: ${before} → ${message.result.length}`);
            }
            return originalPost.call(this, message);
        };

        const originalAddListener = BroadcastChannel.prototype.addEventListener;
        BroadcastChannel.prototype.addEventListener = function(type, listener, options) {
            if (type === "message") {
                const wrappedListener = function(event) {
                    if (event?.data?.action === "response_brands" && Array.isArray(event.data.result)) {
                        const before = event.data.result.length;
                        event.data.result = event.data.result.filter(OFFSHORE_FILTER);
                        console.log(`Filtered incoming brands: ${before} → ${event.data.result.length}`);
                    }
                    listener(event);
                };
                return originalAddListener.call(this, type, wrappedListener, options);
            }

            return originalAddListener.call(this, type, listener, options);
        };
    }

    // Apply filters immediately and set up a recurring check
    patchBroadcastChannel(); // Patch the BroadcastChannel first to catch any incoming messages
    
    // Initial attempt with a short delay
    setTimeout(() => {
        applyOffshoreFilterToDataSet();
        console.log("✅ Initial offshore-only brand filtering attempt");
        
        // Set up recurring checks to ensure filtering is applied after data is loaded
        const filterInterval = setInterval(() => {
            if (Array.isArray(window.storedNumbersSet) && window.storedNumbersSet.length > 0) {
                applyOffshoreFilterToDataSet();
                console.log("🔄 Re-applied offshore-only brand filtering");
            }
        }, 1000); // Check every second
        
        // Stop checking after 30 seconds to prevent infinite checks
        setTimeout(() => {
            clearInterval(filterInterval);
            console.log("⏱️ Stopped recurring filter checks");
        }, 30000);
    }, 500);
})();
