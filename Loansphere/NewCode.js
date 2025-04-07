//CODE TO BE ADDED IN EACH SCRIPT

// ########## DO NOT MODIFY THESE LINES ##########
const channel = new BroadcastChannel("island_channel");
async function waitForListener(maxRetries = 20, initialDelay = 100) {
    testChannel = channel
    return new Promise((resolve, reject) => {
        let attempts = 0;
        let delay = initialDelay;
        let timeoutId;
        let listener = (event) => {
            if (event.data.action === "pong") {
                console.log("✅ Listener detected!");
                testChannel.removeEventListener("message", listener);
                clearTimeout(timeoutId)
                resolve(true);
            }
        };
        
        function sendPing() {
            if (attempts >= maxRetries) {
                console.warn("❌ No listener detected after maximum retries.");
                testChannel.removeEventListener("message", listener);
                clearTimeout(timeoutId)
                reject(new Error("Listener not found"));
                return;
            }

            console.log(`🔄 Sending ping attempt ${attempts + 1}/${maxRetries}...`);
            testChannel.postMessage({ action: "ping" });

            testChannel.addEventListener("message", listener);

            // Retry if no response within `delay` ms
            timeoutId = setTimeout(() => {
                attempts++;
                delay *= 2; // Exponential backoff (100ms → 200ms → 400ms...)
                sendPing();
            }, delay);
        }

        sendPing(); // Start the first attempt
    });
}

/**
 * Request a batch of numbers from the storage script
 */
async function checkNumbersBatch(numbers) {
    return new Promise((resolve) => {
        const listener = (event) => {
            if (event.data.action === "response_numbers") {
                resolve(event.data.result);
                channel.removeEventListener("message", listener);
            }
        };

        channel.addEventListener("message", listener);
        channel.postMessage({ action: "check_numbers", numbers });
    });
}
// ########## DO NOT MODIFY THESE LINES - END ##########