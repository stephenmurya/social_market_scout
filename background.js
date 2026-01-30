// background.js - Storage-based API Key Configuration

import db from './db.js';

// API key will be loaded from chrome.storage.local
let OPENROUTER_API_KEY = null;
let isExtensionEnabled = false;
let SELECTED_MODEL = "arcee-ai/trinity-large-preview:free"; // Default

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROCESSING_CONFIG = {
    MIN_DELAY_MS: 1000,           // INCREASED: More conservative delay
    MAX_RETRY_ATTEMPTS: 3,
    RATE_LIMIT_BACKOFF_MS: 10000, // INCREASED: 10 seconds initial backoff
    MAX_QUEUE_SIZE: 500,
    STALE_CLEANUP_INTERVAL: 5 * 60 * 1000,
};

// ============================================================================
// LOAD SETTINGS FROM STORAGE
// ============================================================================

async function loadSettingsFromStorage() {
    try {
        const storage = await chrome.storage.local.get([
            'apiKey',
            'extensionEnabled',
            'minDelayMs',
            'maxRetryAttempts',
            'rateLimitBackoffMs',
            'maxQueueSize',
            'selectedModel'
        ]);

        OPENROUTER_API_KEY = storage.apiKey || null;
        isExtensionEnabled = storage.extensionEnabled || false;

        if (storage.selectedModel) {
            SELECTED_MODEL = storage.selectedModel;
        }

        // Update processing config if values exist in storage
        if (storage.minDelayMs) PROCESSING_CONFIG.MIN_DELAY_MS = storage.minDelayMs;
        if (storage.maxRetryAttempts !== undefined) PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS = storage.maxRetryAttempts;
        if (storage.rateLimitBackoffMs) PROCESSING_CONFIG.RATE_LIMIT_BACKOFF_MS = storage.rateLimitBackoffMs;
        if (storage.maxQueueSize) PROCESSING_CONFIG.MAX_QUEUE_SIZE = storage.maxQueueSize;

        console.log('⚙️ Settings loaded:', {
            hasApiKey: !!OPENROUTER_API_KEY,
            enabled: isExtensionEnabled,
            model: SELECTED_MODEL,
            minDelay: PROCESSING_CONFIG.MIN_DELAY_MS
        });
    } catch (error) {
        console.error('❌ Failed to load settings:', error);
    }
}

// Load on startup
loadSettingsFromStorage();

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.apiKey) {
            OPENROUTER_API_KEY = changes.apiKey.newValue;
        }
        if (changes.extensionEnabled) {
            isExtensionEnabled = changes.extensionEnabled.newValue;
        }
        if (changes.selectedModel) {
            SELECTED_MODEL = changes.selectedModel.newValue;
            console.log('🤖 Model updated:', SELECTED_MODEL);
        }

        // Update processing config on the fly
        if (changes.minDelayMs) PROCESSING_CONFIG.MIN_DELAY_MS = changes.minDelayMs.newValue;
        if (changes.maxRetryAttempts) PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS = changes.maxRetryAttempts.newValue;
        if (changes.rateLimitBackoffMs) PROCESSING_CONFIG.RATE_LIMIT_BACKOFF_MS = changes.rateLimitBackoffMs.newValue;
        if (changes.maxQueueSize) PROCESSING_CONFIG.MAX_QUEUE_SIZE = changes.maxQueueSize.newValue;

        console.log('🔄 Settings updated');
    }
});

// ============================================================================
// QUEUE STATE
// ============================================================================

let requestQueue = [];
let isProcessing = false;

// In-memory retry tracking
const retryTracker = new Map();

// ============================================================================
// UTILITY: HASH TEXT
// ============================================================================

function hashText(text) {
    if (!text) return '';
    const normalized = text.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s₦]/g, '')
        .trim();

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

// ============================================================================
// UTILITY: EXPONENTIAL BACKOFF
// ============================================================================

function getBackoffDelay(attempt, baseDelay = PROCESSING_CONFIG.RATE_LIMIT_BACKOFF_MS) {
    const maxDelay = 120000; // Max 2 minutes
    const delay = baseDelay * Math.pow(2, attempt);
    return Math.min(delay, maxDelay);
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "PROCESS_LISTING") {
        (async () => {
            try {
                // Check if extension is enabled
                if (!isExtensionEnabled) {
                    console.log('⏸️ Extension disabled - message ignored');
                    return;
                }

                const messageHash = request.hash || hashText(request.text);

                // Duplicate check
                const duplicateCheck = await db.checkDuplicate(messageHash);

                if (duplicateCheck.exists) {
                    console.log(`⏭️ Skipped (${duplicateCheck.location}):`, request.text.substring(0, 30));
                    return;
                }

                // Queue size limit protection
                if (requestQueue.length >= PROCESSING_CONFIG.MAX_QUEUE_SIZE) {
                    console.warn(`⚠️ Queue full (${requestQueue.length}). Dropping oldest messages.`);
                    requestQueue.shift();
                }

                // Add to queue
                requestQueue.push({
                    text: request.text,
                    sender: request.sender || 'Unknown',
                    phone: request.phone || null,
                    hash: messageHash,
                    platform: request.platform || 'whatsapp'
                });

                processQueue();

            } catch (err) {
                console.error("❌ Listener Error:", err);
            }
        })();
        return true;
    }
});

// ============================================================================
// QUEUE PROCESSOR
// ============================================================================

async function processQueue() {
    if (isProcessing || requestQueue.length === 0) return;

    isProcessing = true;

    const currentItem = requestQueue.shift();

    try {
        await processWithAI(currentItem);
    } catch (err) {
        console.error("❌ Processing error:", err);
    }

    // Delay before next item
    setTimeout(() => {
        isProcessing = false;
        processQueue();
    }, PROCESSING_CONFIG.MIN_DELAY_MS);
}

// ============================================================================
// AI PROCESSING ENGINE - WITH ENHANCED ERROR LOGGING
// ============================================================================

async function processWithAI(item) {
    const { text, sender, phone, hash, platform } = item;

    console.log("🤖 Analyzing:", text.substring(0, 40) + "...");

    // Mark as in-flight
    await db.markProcessing(hash, text, platform);

    try {
        // CRITICAL FIX: Check API key before making request
        if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === "YOUR_API_KEY_HERE") {
            throw new Error("API key not configured in config.js");
        }

        const requestBody = {
            // Using the user-selected model
            "model": SELECTED_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": getSystemPrompt()
                },
                {
                    "role": "user",
                    "content": text
                }
            ]
        };

        console.log("📤 Sending request to OpenRouter...");
        console.log("   Model:", requestBody.model);
        console.log("   API Key:", OPENROUTER_API_KEY.substring(0, 15) + "...");

        let response;
        try {
            response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://localhost:3000",
                    "X-Title": "Social Market Scout"
                },
                body: JSON.stringify(requestBody)
            });
        } catch (networkError) {
            // Network-level failure - request never reached OpenRouter
            console.error("❌ NETWORK ERROR - Request never reached OpenRouter");
            console.error("   Error type:", networkError.name);
            console.error("   Error message:", networkError.message);

            if (networkError.message?.includes("Failed to fetch")) {
                console.error("   → Likely cause: Missing host_permissions in manifest.json");
                console.error("   → Check that manifest has: \"host_permissions\": [\"https://openrouter.ai/*\"]");
            }

            throw new Error(`Network error: ${networkError.message}`);
        }

        // ENHANCED ERROR LOGGING
        console.log("📥 Response Status:", response.status, response.statusText);

        // Log rate limit headers if present
        const rateLimitHeaders = {
            limit: response.headers.get('x-ratelimit-limit'),
            remaining: response.headers.get('x-ratelimit-remaining'),
            reset: response.headers.get('x-ratelimit-reset'),
            retryAfter: response.headers.get('retry-after')
        };

        if (Object.values(rateLimitHeaders).some(v => v !== null)) {
            console.log("📊 Rate Limit Info:", rateLimitHeaders);
        }

        // ====================================================================
        // RATE LIMIT HANDLING (429 responses)
        // ====================================================================
        if (response.status === 429) {
            const errorBody = await response.json().catch(() => ({}));
            console.error("❌ RATE LIMITED (Actual 429 from OpenRouter):");
            console.error("   This means the request DID reach OpenRouter");
            console.error("   Response:", errorBody);
            await handleRateLimit(item, hash);
            return;
        }

        // ====================================================================
        // AUTHENTICATION ERROR (401)
        // ====================================================================
        // if (response.status === 401) {
        //     const errorBody = await response.json().catch(() => ({}));
        //     console.error("❌ AUTHENTICATION FAILED:", errorBody);
        //     console.error("Check your API key at: https://openrouter.ai/keys");

        //     await db.addFailedMessage(
        //         hash,
        //         text,
        //         `Auth failed: ${JSON.stringify(errorBody)}`,
        //         0,
        //         platform
        //     );
        //     await db.unmarkProcessing(hash);
        //     return;
        // }

        if (response.status === 401 || response.status === 403) {
            const rawBody = await response.text();

            console.error("❌ AUTH / ACCESS FAILURE");
            console.error("Status:", response.status);
            console.error("Response:", rawBody || "<empty>");

            await db.addFailedMessage(
                hash,
                text,
                `Auth/Access failed (${response.status}): ${rawBody}`,
                0,
                platform
            );

            await db.unmarkProcessing(hash);
            return;
        }


        // ====================================================================
        // OTHER HTTP ERRORS
        // ====================================================================
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error(`❌ HTTP ${response.status}:`, errorBody);
            throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorBody)}`);
        }

        // ====================================================================
        // PARSE AI RESPONSE
        // ====================================================================
        const data = await response.json();

        if (!data.choices || !data.choices[0]) {
            console.error("❌ Invalid API response:", data);
            throw new Error("Invalid API response structure");
        }

        let cleanContent = data.choices[0].message.content
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        const result = JSON.parse(cleanContent);

        // ====================================================================
        // SAVE RESULT
        // ====================================================================
        if (result.is_listing) {
            const entry = {
                ...result,
                raw_text: text,
                sender: sender,
                phone_number: phone,
                platform: platform,
                hash: hash,
                created_at: Date.now()
            };

            await db.listings.add(entry);
            console.log("✅ Saved:", result.sub_category || "Listing");

            retryTracker.delete(hash);

        } else {
            await db.ignored.add({
                raw_text: text,
                hash: hash,
                platform: platform,
                created_at: Date.now()
            });
            console.log("🗑️ Ignored (AI classified as non-listing)");
        }

        await db.unmarkProcessing(hash);

    } catch (error) {
        console.error("❌ AI Error:", error.message);
        console.error("Full error:", error);

        await handleProcessingError(item, hash, error);
    }
}

// ============================================================================
// ERROR HANDLERS
// ============================================================================

async function handleRateLimit(item, hash) {
    const retryInfo = retryTracker.get(hash) || { count: 0, lastAttempt: 0 };

    if (retryInfo.count >= PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS) {
        console.error("❌ Max retries exceeded for:", item.text.substring(0, 30));
        await db.addFailedMessage(
            hash,
            item.text,
            "Rate limit - max retries exceeded",
            retryInfo.count,
            item.platform
        );
        await db.unmarkProcessing(hash);
        retryTracker.delete(hash);
        return;
    }

    const backoffDelay = getBackoffDelay(retryInfo.count);

    console.warn(`⏳ Rate limited. Retry ${retryInfo.count + 1}/${PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS} in ${backoffDelay}ms`);

    retryTracker.set(hash, {
        count: retryInfo.count + 1,
        lastAttempt: Date.now()
    });

    setTimeout(() => {
        requestQueue.unshift(item);
        db.unmarkProcessing(hash).then(() => {
            processQueue();
        });
    }, backoffDelay);
}

async function handleProcessingError(item, hash, error) {
    const retryInfo = retryTracker.get(hash) || { count: 0, lastAttempt: 0 };

    const isRetryable = isRetryableError(error);

    if (isRetryable && retryInfo.count < PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS) {
        const backoffDelay = getBackoffDelay(retryInfo.count, 2000);

        console.warn(`⚠️ Retryable error. Attempt ${retryInfo.count + 1}/${PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS}`);

        retryTracker.set(hash, {
            count: retryInfo.count + 1,
            lastAttempt: Date.now()
        });

        setTimeout(() => {
            requestQueue.push(item);
            db.unmarkProcessing(hash).then(() => {
                processQueue();
            });
        }, backoffDelay);

    } else {
        console.error("❌ Permanent failure:", error.message);

        await db.addFailedMessage(
            hash,
            item.text,
            error.message,
            retryInfo.count,
            item.platform
        );

        await db.unmarkProcessing(hash);
        retryTracker.delete(hash);
    }
}

function isRetryableError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('network') ||
        message.includes('timeout') ||
        message.includes('fetch')) {
        return true;
    }

    if (message.includes('http 5')) {
        return true;
    }

    if (message.includes('json') || message.includes('parse')) {
        return false;
    }

    return true;
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function getSystemPrompt() {
    return `You are a Nigerian Marketplace Analyst. You analyze messages from WhatsApp groups and Facebook Marketplace to extract structured listing data.

Your job is to determine if a message is a SELLER LISTING (someone offering something for sale/rent) or NOT A LISTING.

CATEGORIES TO DETECT:
1. Real Estate (apartments, houses, land, commercial spaces)
2. Electronics (phones, laptops, TVs, etc.)
3. Vehicles (cars, bikes, etc.)
4. Furniture (sofas, beds, tables, etc.)
5. Services (cleaning, repairs, etc.)
6. Other Items (anything else being sold)

CRITICAL RULES:
- If message is a BUYER INQUIRY (someone looking/asking for something), return {"is_listing": false}
- If message is a GREETING or CHAT, return {"is_listing": false}
- Only return is_listing: true if someone is OFFERING to sell/rent something

FOR REAL ESTATE:
- BASE PRICE: The main yearly rent or sale price
- FEES: Extract Agency, Legal, Caution, and Service charges
  * If text says "10%" or "5%", return as string: "10%" or "5%"
  * If text says "100k" or "100,000", return as string: "100000"
  * If not mentioned, return "0"

FOR OTHER ITEMS:
- PRICE: The item's price (one-time, not yearly)
- No fees needed

REQUIRED JSON FORMAT:
{
    "is_listing": true,
    "category": "Real Estate" | "Electronics" | "Vehicles" | "Furniture" | "Services" | "Other Items",
    "sub_category": "Brief title (e.g., '2 Bedroom Flat in Lugbe' or 'iPhone 13 Pro Max')",
    "price": number (clean integer, no commas),
    "location": "City/Area",
    "attributes": {
        "bedrooms": "number string" (for Real Estate),
        "brand": "brand name" (for Electronics/Vehicles),
        "condition": "new" | "used" | "fairly used" (for items)
    },
    "fees": {
        "agency": "string",
        "legal": "string",
        "caution": "string",
        "service": "string"
    }
}

For NON-LISTINGS, return:
{"is_listing": false}

NEVER use markdown code blocks. Return only valid JSON.`;
}

// ============================================================================
// BACKGROUND MAINTENANCE
// ============================================================================

db.cleanStaleProcessing();

setInterval(() => {
    db.cleanStaleProcessing();
}, PROCESSING_CONFIG.STALE_CLEANUP_INTERVAL);

console.log("🚀 Background worker initialized (HOTFIX VERSION)");
console.log("   Min delay:", PROCESSING_CONFIG.MIN_DELAY_MS + "ms");
console.log("   Rate limit backoff:", PROCESSING_CONFIG.RATE_LIMIT_BACKOFF_MS + "ms");
console.log("   API key configured:", OPENROUTER_API_KEY ? "✓" : "❌");