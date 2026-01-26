import db from './db.js';
import { CONFIG } from './config.js';

const OPENROUTER_API_KEY = CONFIG.OPENROUTER_API_KEY;

// --- THE QUEUE SYSTEM ---
let requestQueue = [];
let isProcessing = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "PROCESS_LISTING") {

        // 🔒 THE SMART GATEKEEPER (Checks DB before Queue)
        (async () => {
            try {
                // Check Good Listings
                const listingCount = await db.listings.where('raw_text').equals(request.text).count();

                // Check Trash Can (Ignored Listings)
                const ignoredCount = await db.ignored.where('raw_text').equals(request.text).count();

                if (listingCount > 0 || ignoredCount > 0) {
                    console.log("🛑 Seen this before (Good or Bad). Skipping AI.");
                    return; // STOP HERE.
                }

                // If not found in either table, PROCEED to queue
                console.log("📥 New listing detected. Added to queue.");
                requestQueue.push(request.text);
                processQueue();

            } catch (err) {
                console.error("Error checking duplicates:", err);
            }
        })();

        return true;
    }
});

async function processQueue() {
    // If already working, or nothing in line, stop.
    if (isProcessing || requestQueue.length === 0) return;

    isProcessing = true;
    const currentText = requestQueue.shift(); // Get the first item

    try {
        await processWithAI(currentText);
    } catch (err) {
        console.error("Skipping item due to error:", err);
    }

    // --- THE SPEED LIMIT ---
    // Wait 5 seconds before processing the next one to avoid 429s.
    setTimeout(() => {
        isProcessing = false;
        processQueue(); // Loop to the next item
    }, 5000);
}

async function processWithAI(rawText) {
    console.log("🤖 Asking AI...", rawText.substring(0, 20));

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://localhost:3000",
                "X-Title": "Abuja Indexer"
            },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-exp:free",
                "messages": [
                    {
                        "role": "system",
                        "content": `You are a data extractor. 
                        1. If text is a PROPERTY or ITEM for sale/rent, return JSON: {"is_listing": true, "category": "Real Estate"|"Item", "price": number, "location": string, "sub_category": string, "attributes": {Object}}. 
                        2. If it is NOT a listing (e.g. a request like "I want", a question, or greeting), return {"is_listing": false}. 
                        No markdown.`
                    },
                    { "role": "user", "content": rawText }
                ]
            })
        });

        // Handle Rate Limits (429)
        if (response.status === 429) {
            console.warn("⚠️ Hit Rate Limit (429). Pausing queue for 20 seconds...");
            requestQueue.unshift(rawText); // Put text BACK in queue
            await new Promise(r => setTimeout(r, 20000)); // Wait 20s
            return;
        }

        const data = await response.json();
        if (!data.choices || data.choices.length === 0) return;

        let cleanContent = data.choices[0].message.content;
        cleanContent = cleanContent.replace(/```json/g, "").replace(/```/g, "").trim();

        const result = JSON.parse(cleanContent);

        if (result.is_listing) {
            // ✅ SAVE GOOD LISTING
            const entry = { ...result, raw_text: rawText, created_at: Date.now() };
            await db.listings.add(entry);
            console.log("✅ Saved Listing:", result.sub_category);
        } else {
            // 🗑️ SAVE TO TRASH CAN (So we don't ask again)
            await db.ignored.add({ raw_text: rawText, created_at: Date.now() });
            console.log("🚫 Saved to Ignore List (Not a listing)");
        }

    } catch (e) {
        console.error("AI Processing Error:", e);
    }
}