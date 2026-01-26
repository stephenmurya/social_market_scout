// content.js
console.log("🚀 Abuja Indexer is ACTIVE on this page");

let processedTexts = new Set();

const REQUIRED_KEYWORDS = [
    "sale", "rent", "buy", "sell", "available", "price", "₦", "naira",
    "bedroom", "flat", "duplex", "bungalow", "land", "sqm",
    "condition", "brand new", "uk used", "tokunbo", "foreign used",
    "pickup", "delivery", "location", "dm for price"
];

const BLOCKED_PHRASES = [
    // Tech/System stuff
    "typing...", "online", "last seen", "joined using", "security code changed",
    "waiting for this message", "loading", "admin", "group settings",

    // NEW: Buyer Requests (The Money Savers)
    "looking for",
    "i want",
    "i need",
    "any available",
    "is there any",
    "needed urgent",
    "in need of",
    "budget is",
    "searching for"
];

const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            // Check if it is an Element AND specifically an HTMLElement (which has innerText)
            if (node.nodeType === 1 && node.innerText) {

                // SAFE ACCESS: Use the OR operator to handle nulls
                const text = (node.innerText || "").trim();

                // Rule 1: Length Check
                if (text.length < 20) return; // Lowered to 20 for testing

                const lowerText = text.toLowerCase();

                // Rule 2: Blocked Phrases
                if (BLOCKED_PHRASES.some(phrase => lowerText.includes(phrase))) return;

                // Rule 3: Keywords
                const hasKeyword = REQUIRED_KEYWORDS.some(word => lowerText.includes(word));

                // Rule 4: Must have a Number
                const hasNumber = /\d/.test(text);

                if (hasKeyword && hasNumber && !processedTexts.has(text)) {
                    processedTexts.add(text);
                    console.log("🎯 Valid Listing Candidate:", text.substring(0, 40) + "...");

                    try {
                        chrome.runtime.sendMessage({
                            type: "PROCESS_LISTING",
                            text: text
                        });
                    } catch (error) {
                        // Ignore connection errors
                    }
                }
            }
        });
    });
});

observer.observe(document.body, { childList: true, subtree: true });