/**
 * Offshore-Only Queues Filter Script
 *
 * Filters window.storedQueuesSet and queue-related message traffic to remove any queues
 * marked as `restricted: true`, leaving only offshore queues visible.
 */

(function () {
    console.log("🔍 Offshore-only queues filter script initialized");

    const OFFSHORE_QUEUE_FILTER = queue => queue?.restricted !== true;

    function filterStoredQueuesSet() {
        if (!Array.isArray(window.storedQueuesSet)) {
            console.warn("storedQueuesSet not found or not an array. Retrying in 1s.");
            setTimeout(filterStoredQueuesSet, 1000);
            return;
        }

        const before = window.storedQueuesSet.length;
        window.storedQueuesSet = window.storedQueuesSet.filter(OFFSHORE_QUEUE_FILTER);
        const after = window.storedQueuesSet.length;
        console.log(`Filtered storedQueuesSet: ${before} → ${after} offshore-only queues`);
    }

    function filterQueueData(label, field, dataObj) {
        if (dataObj?.[field] && Array.isArray(dataObj[field])) {
            const before = dataObj[field].length;
            dataObj[field] = dataObj[field].filter(OFFSHORE_QUEUE_FILTER);
            const after = dataObj[field].length;
            console.log(`Filtered ${label}: ${before} → ${after} offshore-only queues`);
        }
    }

    function patchBroadcastChannel() {
        const originalPostMessage = BroadcastChannel.prototype.postMessage;
        const originalAddEventListener = BroadcastChannel.prototype.addEventListener;

        BroadcastChannel.prototype.postMessage = function (message) {
            if (message?.action === "response_queues") {
                filterQueueData("outgoing queue data", "result", message);
            }
            return originalPostMessage.call(this, message);
        };

        BroadcastChannel.prototype.addEventListener = function (type, listener, options) {
            if (type === "message") {
                const wrappedListener = function (event) {
                    if (event?.data) {
                        const { action } = event.data;
                        if (action === "response_queues") {
                            filterQueueData("incoming response_queues", "result", event.data);
                        } else if (action === "check_queues") {
                            filterQueueData("incoming check_queues", "queues", event.data);
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
    filterStoredQueuesSet();
    patchBroadcastChannel();

    console.log("✅ Offshore-only queue filter active – only offshore queues will be shown.");
})();
