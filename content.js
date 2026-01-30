// content.js - COST-OPTIMIZED VERSION with Aggressive Pre-Filtering (v4.1)

console.log(`🚀 ${chrome.runtime.getManifest().name} v${chrome.runtime.getManifest().version} - COST OPTIMIZED`);

// ============================================================================
// INLINED UTILITIES
// ============================================================================

function extractPhoneNumber(text) {
    if (!text) return null;
    const cleaned = text.replace(/[^\d+]/g, '');
    const patterns = [/(?:\+?234|0)([789][01]\d{8})/g];

    for (const pattern of patterns) {
        const matches = cleaned.match(pattern);
        if (matches && matches.length > 0) {
            let number = matches[0];
            if (number.startsWith('+234')) {
                number = number.substring(1);
            } else if (number.startsWith('0') && number.length === 11) {
                number = '234' + number.substring(1);
            }
            if (number.length === 13 && number.startsWith('234')) {
                return number;
            }
        }
    }
    return null;
}

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
// ENHANCED PRE-FILTERING (Reduces API calls by 70%+)
// ============================================================================

/**
 * STAGE 1: Aggressive buyer detection
 * Rejects messages where someone is LOOKING for something
 */
function isBuyerInquiry(text) {
    const lowerText = text.toLowerCase();

    // Question patterns (buyers ask questions)
    const questionPatterns = [
        /\?/,  // Contains question mark
        /\b(any|is there|do you have|where can|how much|please|pls)\b.*\b(available|for rent|for sale)\b/,
    ];

    if (questionPatterns.some(p => p.test(lowerText))) {
        // Might be a question - check for seller override signals
        const hasSellerSignals = /\b(call|contact|whatsapp)\s*(?:\+?234|0)\d{10}/.test(lowerText);
        if (!hasSellerSignals) {
            return true; // Definitely a buyer
        }
    }

    // Explicit buyer phrases
    const buyerPatterns = [
        /\b(looking for|in search of|searching for|wanted urgent|needed urgent)\b/,
        /\b(i want|i need|we need|help me find|assist me|anyone with|who has)\b/,
        /\b(budget is|my budget|can afford|willing to pay up to)\b/,
        /\b(dm me|inbox me|send location|send details|send pics|send pictures)\b/,
        /\b(interested in|show me|looking to|seeking)\b/,
    ];

    return buyerPatterns.some(pattern => pattern.test(lowerText));
}

/**
 * STAGE 2: Seller signal detection
 * Only passes if message has STRONG seller indicators
 */
function hasStrongSellerSignals(text) {
    const lowerText = text.toLowerCase();

    let score = 0;

    // STRONG signals (worth 2 points each)
    const strongSignals = [
        /\b(for sale|for rent|to let|available for|now available)\b/,
        /\b(selling|renting out|leasing)\b/,
        /₦\s*\d+[\d,]*(?:\.\d+)?[km]?\s*(?:per year|per annum|yearly|annual|pa)\b/,
        /\b(call|contact|reach out on|whatsapp me on)\s*(?:\+?234|0)[789]\d{9}\b/,
    ];

    strongSignals.forEach(pattern => {
        if (pattern.test(lowerText)) score += 2;
    });

    // MEDIUM signals (worth 1 point each)
    const mediumSignals = [
        /\b(bedroom|bedrooms|br|self contain|mini flat)\b/,
        /\b(estate|gated|serviced|terrace|duplex|bungalow)\b/,
        /\b(brand new|tokunbo|fairly used|nigerian used)\b/,
        /\b(newly built|newly renovated|just completed)\b/,
        /\b(serious buyer|serious inquiries|no time wasters)\b/,
    ];

    mediumSignals.forEach(pattern => {
        if (pattern.test(lowerText)) score += 1;
    });

    // Need at least 3 points to proceed
    return score >= 3;
}

/**
 * STAGE 3: Price validation
 * Ensures there's an actual price mentioned
 */
function hasValidPrice(text) {
    const pricePatterns = [
        /₦\s*\d+[\d,]*(?:\.\d+)?[km]?\b/,           // ₦500k, ₦2m, ₦1,500,000
        /\d+[\d,]*(?:\.\d+)?[km]?\s*(?:naira|NGN)\b/, // 500k naira
        /\d+[\d,]*(?:\.\d+)?[km]?\s*(?:million|m)\b/,  // 2.5 million
    ];

    return pricePatterns.some(p => p.test(text));
}

/**
 * MASTER FILTER: Combines all checks
 * Returns true only if message passes ALL stages
 */
function shouldProcessMessage(text) {
    // Length check
    if (text.length < 30) {  // Increased minimum
        return { shouldProcess: false, reason: 'too_short', cost: 0 };
    }

    if (text.length > 2000) {  // Reject excessively long messages
        return { shouldProcess: false, reason: 'too_long', cost: 0 };
    }

    const lowerText = text.toLowerCase();

    // System message blocking
    const systemPhrases = [
        'typing...', 'online', 'last seen', 'joined using',
        'security code changed', 'waiting for this message',
        'loading', 'admin', 'group settings', 'you deleted',
        'this message was deleted', 'missed call'
    ];

    if (systemPhrases.some(phrase => lowerText.includes(phrase))) {
        return { shouldProcess: false, reason: 'system_message', cost: 0 };
    }

    // STAGE 1: Reject buyer inquiries immediately
    if (isBuyerInquiry(text)) {
        return { shouldProcess: false, reason: 'buyer_inquiry', cost: 0 };
    }

    // STAGE 2: Check for strong seller signals
    if (!hasStrongSellerSignals(text)) {
        return { shouldProcess: false, reason: 'weak_seller_signals', cost: 0 };
    }

    // STAGE 3: Validate price exists
    if (!hasValidPrice(text)) {
        return { shouldProcess: false, reason: 'no_price', cost: 0 };
    }

    // ALL CHECKS PASSED - Send to AI
    return { shouldProcess: true, reason: 'passed_all_filters', cost: 1 };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const PLATFORM = detectPlatform();

const BLOCKED_PHRASES = [
    "typing...", "online", "last seen", "joined using",
    "security code changed", "waiting for this message",
    "loading", "admin", "group settings", "you deleted",
    "this message was deleted", "missed voice call",
    "missed video call"
];

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

function detectPlatform() {
    const url = window.location.hostname;
    if (url.includes('whatsapp')) return 'whatsapp';
    if (url.includes('facebook')) return 'facebook';
    return 'unknown';
}

// ============================================================================
// PLATFORM-SPECIFIC SELECTORS
// ============================================================================

const SELECTORS = {
    whatsapp: {
        messageContainer: '.copyable-area',
        messageRow: '[role="row"]',
        metaElement: '.copyable-text',
        metaAttribute: 'data-pre-plain-text',
        senderRegex: /\]\s+(.*)\s*:/
    },
    facebook: {
        messageContainer: '[data-testid="marketplace-feed"]',
        messageRow: '[data-testid="listing"]',
        metaElement: null,
        metaAttribute: null,
        senderRegex: null
    }
};

// ============================================================================
// SENDER & PHONE EXTRACTION
// ============================================================================

function extractSenderInfo(node, text) {
    const config = SELECTORS[PLATFORM];
    if (!config) return { sender: 'Unknown', phone: null };

    let senderName = null;
    let phoneNumber = null;

    if (PLATFORM === 'whatsapp') {
        const container = node.closest(config.messageContainer) ||
            node.closest(config.messageRow);

        if (container) {
            const metaElement = container.querySelector(config.metaElement);
            if (metaElement) {
                const metaData = metaElement.getAttribute(config.metaAttribute);
                if (metaData) {
                    const match = metaData.match(config.senderRegex);
                    if (match && match[1]) {
                        senderName = match[1].trim();
                    }
                }
            }
        }
    }

    if (senderName) {
        const senderPhone = extractPhoneNumber(senderName);
        if (senderPhone) {
            phoneNumber = senderPhone;
        }
    }

    if (!phoneNumber) {
        const bodyPhone = extractPhoneNumber(text);
        if (bodyPhone) {
            phoneNumber = bodyPhone;
        }
    }

    let finalSender = 'Unknown';
    if (phoneNumber && senderName && !/\d/.test(senderName)) {
        finalSender = `${senderName} (${phoneNumber})`;
    } else if (phoneNumber) {
        finalSender = phoneNumber;
    } else if (senderName) {
        finalSender = senderName;
    }

    return {
        sender: finalSender,
        phone: phoneNumber
    };
}

// ============================================================================
// STATISTICS TRACKING (Monitor Filter Performance)
// ============================================================================

const filterStats = {
    total: 0,
    rejected: {
        too_short: 0,
        too_long: 0,
        system_message: 0,
        buyer_inquiry: 0,
        weak_seller_signals: 0,
        no_price: 0
    },
    accepted: 0
};

function logFilterStats() {
    const rejectionRate = ((filterStats.total - filterStats.accepted) / filterStats.total * 100).toFixed(1);
    console.log(`📊 Filter Performance:`);
    console.log(`   Total: ${filterStats.total} | Accepted: ${filterStats.accepted} | Rejected: ${filterStats.total - filterStats.accepted} (${rejectionRate}%)`);
    console.log(`   Breakdown:`, filterStats.rejected);
}

let messageCount = 0;

// ============================================================================
// MAIN OBSERVER
// ============================================================================

const processedHashes = new Set();

const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && node.innerText) {
                const text = (node.innerText || "").trim();

                if (!text) return;

                const messageHash = hashText(text);
                if (processedHashes.has(messageHash)) {
                    return;
                }

                // CRITICAL: Pre-filtering BEFORE adding to processed set
                filterStats.total++;
                const filterResult = shouldProcessMessage(text);

                if (!filterResult.shouldProcess) {
                    filterStats.rejected[filterResult.reason]++;

                    // Log rejections in debug mode only
                    if (sessionStorage.getItem('debug') === 'true') {
                        console.log(`⛔ Rejected (${filterResult.reason}):`, text.substring(0, 50));
                    }
                    return;
                }

                // Passed filters - mark as processed
                filterStats.accepted++;
                processedHashes.add(messageHash);
                messageCount++;

                // Log stats periodically
                if (messageCount % 50 === 0) {
                    logFilterStats();
                }

                const { sender, phone } = extractSenderInfo(node, text);

                console.log(`✅ QUEUED (passed filters):`, sender.substring(0, 30));

                try {
                    // Check if chrome.runtime is available
                    if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
                        console.error('❌ Extension context invalidated. Please reload the page.');
                        console.warn('💡 Tip: This usually happens after reloading the extension. Refresh WhatsApp to fix.');
                        processedHashes.delete(messageHash);
                        return;
                    }

                    chrome.runtime.sendMessage({
                        type: "PROCESS_LISTING",
                        text: text,
                        sender: sender,
                        phone: phone,
                        hash: messageHash,
                        platform: PLATFORM
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('❌ Message send failed:', chrome.runtime.lastError.message);
                            processedHashes.delete(messageHash);
                        }
                    });
                } catch (error) {
                    console.error('❌ Failed to send message:', error);
                    processedHashes.delete(messageHash);
                }
            }
        });
    });
});

// ============================================================================
// INITIALIZATION
// ============================================================================

const targetNode = document.body;
observer.observe(targetNode, { childList: true, subtree: true });

console.log(`✅ Monitoring ${PLATFORM} with AGGRESSIVE pre-filtering`);
console.log(`📊 Expected API call reduction: 70-80%`);

// Clean up hash cache periodically
setInterval(() => {
    if (processedHashes.size > 1000) {
        console.log('🧹 Clearing old hash cache...');
        processedHashes.clear();
    }
}, 5 * 60 * 1000);

// Log final stats on page unload
window.addEventListener('beforeunload', () => {
    logFilterStats();
});

// Debug mode toggle
if (sessionStorage.getItem('debug') === 'true') {
    console.log('🔍 Debug mode enabled - will log all rejections');
}

// Manual stats check (run in console: window.showFilterStats())
window.showFilterStats = logFilterStats;