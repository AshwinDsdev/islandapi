/**
 * Offshore-Only Messages Filter Script
 *
 * Filters window.storedMessagesSet and all message-related data (incoming/outgoing/check)
 * to exclude any message with type: "onshore", leaving only offshore messages.
 */

(function () {
    console.log("🔍 Offshore-only messages filter script initialized");

    const OFFSHORE_FILTER = msg => msg?.type !== "onshore";

    function filterStoredMessagesSet() {
        if (!Array.isArray(window.storedMessagesSet)) {
            console.warn("storedMessagesSet not found or not an array. Retrying in 1s.");
            setTimeout(filterStoredMessagesSet, 1000);
            return;
        }

        const before = window.storedMessagesSet.length;
        window.storedMessagesSet = window.storedMessagesSet.filter(OFFSHORE_FILTER);
        const after = window.storedMessagesSet.length;
        console.log(`Filtered storedMessagesSet: ${before} → ${after} offshore-only messages`);
    }

    function filterMessageData(label, field, dataObj) {
        if (dataObj?.[field] && Array.isArray(dataObj[field])) {
            const before = dataObj[field].length;
            dataObj[field] = dataObj[field].filter(OFFSHORE_FILTER);
            const after = dataObj[field].length;
            console.log(`Filtered ${label}: ${before} → ${after} offshore-only messages`);
        }
    }

    function patchBroadcastChannel() {
        const originalPostMessage = BroadcastChannel.prototype.postMessage;
        const originalAddEventListener = BroadcastChannel.prototype.addEventListener;

        BroadcastChannel.prototype.postMessage = function (message) {
            if (message?.action === "response_messages") {
                filterMessageData("outgoing message data", "result", message);
            }
            return originalPostMessage.call(this, message);
        };

        BroadcastChannel.prototype.addEventListener = function (type, listener, options) {
            if (type === "message") {
                const wrappedListener = function (event) {
                    if (event?.data) {
                        const { action } = event.data;
                        if (action === "response_messages") {
                            filterMessageData("incoming response_messages", "result", event.data);
                        } else if (action === "check_messages") {
                            filterMessageData("incoming check_messages", "messages", event.data);
                        }
                    }
                    listener(event);
                };
                return originalAddEventListener.call(this, type, wrappedListener, options);
            }
            return originalAddEventListener.call(this, type, listener, options);
        };
    }

    function patchCheckMessagesInMemory() {
        const original = window.checkMessagesInMemory;
        if (typeof original === "function") {
            window.checkMessagesInMemory = function (messagesToCheck) {
                const filtered = Array.isArray(messagesToCheck)
                    ? messagesToCheck.filter(OFFSHORE_FILTER)
                    : messagesToCheck;
                return original(filtered);
            };
            console.log("✅ Overrode checkMessagesInMemory to filter onshore messages");
        }
    }

    // INIT
    filterStoredMessagesSet();
    patchBroadcastChannel();
    patchCheckMessagesInMemory();

    console.log("✅ Offshore-only message filter active – only offshore messages will be shown.");
})();
