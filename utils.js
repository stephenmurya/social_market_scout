// utils.js - Shared Utilities for Social Market Scout

// ============================================================================
// PHONE NUMBER EXTRACTION & NORMALIZATION
// ============================================================================

/**
 * Extracts and normalizes Nigerian phone numbers from text
 * Handles formats: 0803..., +234803..., 234803...
 * Returns normalized format: 2348031234567
 */
export function extractPhoneNumber(text) {
    if (!text) return null;

    // Remove all non-digit characters except + for preprocessing
    const cleaned = text.replace(/[^\d+]/g, '');

    // Pattern: Matches Nigerian numbers in various formats
    // 0803... (11 digits starting with 0)
    // 234803... (13 digits starting with 234)
    // +234803... (14 chars starting with +234)
    const patterns = [
        /(?:\+?234|0)([789][01]\d{8})/g, // Main pattern
    ];

    for (const pattern of patterns) {
        const matches = cleaned.match(pattern);
        if (matches && matches.length > 0) {
            let number = matches[0];

            // Normalize to 234 format
            if (number.startsWith('+234')) {
                number = number.substring(1); // Remove +
            } else if (number.startsWith('0') && number.length === 11) {
                number = '234' + number.substring(1); // Convert 0803 → 234803
            }

            // Validate final format (should be 13 digits starting with 234)
            if (number.length === 13 && number.startsWith('234')) {
                return number;
            }
        }
    }

    return null;
}

/**
 * Extracts phone number from WhatsApp sender name or message body
 * Returns object: { number: string | null, source: 'sender' | 'body' | null }
 */
export function extractContactInfo(senderName, messageBody) {
    // Priority 1: Check sender name first
    const senderNumber = extractPhoneNumber(senderName || '');
    if (senderNumber) {
        return { number: senderNumber, source: 'sender' };
    }

    // Priority 2: Check message body
    const bodyNumber = extractPhoneNumber(messageBody || '');
    if (bodyNumber) {
        return { number: bodyNumber, source: 'body' };
    }

    return { number: null, source: null };
}

/**
 * Formats phone number for WhatsApp deep link
 */
export function formatWhatsAppLink(phoneNumber) {
    if (!phoneNumber) return null;

    // Ensure it's in 234... format
    let normalized = phoneNumber.replace(/\D/g, '');
    if (normalized.startsWith('0') && normalized.length === 11) {
        normalized = '234' + normalized.substring(1);
    }

    if (normalized.length >= 10) {
        return `https://wa.me/${normalized}`;
    }

    return null;
}

// ============================================================================
// TEXT CLASSIFICATION & FILTERING
// ============================================================================

/**
 * Detects if message is a buyer inquiry (not a seller listing)
 * Returns true if text appears to be someone LOOKING for something
 */
export function isBuyerInquiry(text) {
    const lowerText = text.toLowerCase();

    // Buyer signal phrases (questions/requests)
    const buyerPatterns = [
        /\b(looking for|in search of|searching for|need urgent|needed urgent)\b/,
        /\b(any available|is there any|anyone with|who has)\b/,
        /\b(i want|i need|we need|help me find|please|pls)\b/,
        /\b(budget is|my budget|can afford|willing to pay)\b/,
        /\b(dm me|inbox me|send location|send details)\b/,
        /\?.*\b(available|for sale|to let|to rent)\b/, // Questions about availability
    ];

    return buyerPatterns.some(pattern => pattern.test(lowerText));
}

/**
 * Detects if message contains seller indicators (actual listing)
 * Returns true if text appears to be someone OFFERING something
 */
export function isSellerListing(text) {
    const lowerText = text.toLowerCase();

    // Seller signal phrases (offers/listings)
    const sellerPatterns = [
        /\b(for sale|for rent|to let|available for|now available)\b/,
        /\b(selling|renting|offering|leasing)\b/,
        /\b(newly built|newly renovated|just completed)\b/,
        /\b(call|contact|reach out|dm|whatsapp)\s+(?:\+?234|0)\d{10}/,
        /₦\s*\d+[\d,]*(?:\.\d+)?[km]?\b/, // Price mentions
    ];

    return sellerPatterns.some(pattern => pattern.test(lowerText));
}

/**
 * Advanced filtering: Determines if text should be queued for AI processing
 * Returns { shouldProcess: boolean, reason: string }
 */
export function shouldProcessMessage(text, keywords) {
    // Length check
    if (text.length < 20) {
        return { shouldProcess: false, reason: 'too_short' };
    }

    const lowerText = text.toLowerCase();

    // System message blocking
    const systemPhrases = [
        'typing...', 'online', 'last seen', 'joined using',
        'security code changed', 'waiting for this message',
        'loading', 'admin', 'group settings'
    ];

    if (systemPhrases.some(phrase => lowerText.includes(phrase))) {
        return { shouldProcess: false, reason: 'system_message' };
    }

    // Keyword check (must have at least one relevant keyword)
    const hasKeyword = keywords.some(word => lowerText.includes(word));
    if (!hasKeyword) {
        return { shouldProcess: false, reason: 'no_keywords' };
    }

    // Buyer vs Seller classification
    const isBuyer = isBuyerInquiry(text);
    const isSeller = isSellerListing(text);

    // If clearly a buyer inquiry with no seller signals, reject
    if (isBuyer && !isSeller) {
        return { shouldProcess: false, reason: 'buyer_inquiry' };
    }

    // Default: Process if has keywords and isn't definitively a buyer
    return { shouldProcess: true, reason: 'passed_filters' };
}

// ============================================================================
// FEE CALCULATION (Nigerian Real Estate Math)
// ============================================================================

/**
 * Calculates fee amount from string representation
 * Handles: "10%", "100k", "100,000", "₦50000"
 * Returns: numeric value
 */
export function calculateFee(basePrice, feeString) {
    if (!feeString || feeString === "0" || feeString === "") return 0;

    // Case 1: Percentage (e.g., "10%", "5%")
    if (feeString.includes('%')) {
        // Extract numeric part and validate
        const numericPart = feeString.replace(/[^0-9.]/g, '');
        const percent = parseFloat(numericPart);

        // Validate: percentage should be between 0-100
        if (isNaN(percent) || percent < 0 || percent > 100) return 0;

        return (percent / 100) * basePrice;
    }

    // Case 2: Fixed Amount (e.g., "100k", "100,000", "₦50000")
    let clean = feeString.toLowerCase()
        .replace(/,/g, '')          // Remove commas
        .replace(/₦/g, '')          // Remove naira symbol
        .replace(/naira/g, '')      // Remove word "naira"
        .replace(/\s/g, '');        // Remove spaces

    // Handle "k" multiplier (100k = 100000)
    if (clean.includes('k')) {
        const numPart = clean.replace(/[^0-9.]/g, '');
        const value = parseFloat(numPart);
        if (!isNaN(value)) {
            return value * 1000;
        }
    }

    // Handle "m" multiplier (1.5m = 1500000)
    if (clean.includes('m')) {
        const numPart = clean.replace(/[^0-9.]/g, '');
        const value = parseFloat(numPart);
        if (!isNaN(value)) {
            return value * 1000000;
        }
    }

    // Plain number
    const finalValue = parseFloat(clean.replace(/[^0-9.]/g, ''));
    return isNaN(finalValue) ? 0 : finalValue;
}

/**
 * Formats currency for display
 */
export function formatCurrency(amount) {
    if (!amount || isNaN(amount)) return '₦0';
    return `₦${Number(amount).toLocaleString()}`;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates that a value is a safe positive number
 */
export function isValidPrice(value) {
    if (typeof value !== 'number') return false;
    if (isNaN(value) || !isFinite(value)) return false;
    if (value < 0 || value > 1e12) return false; // Sanity check: less than 1 trillion
    return true;
}

/**
 * Sanitizes text for storage (removes excessive whitespace, special chars)
 */
export function sanitizeText(text) {
    if (!text) return '';
    return text
        .replace(/\s+/g, ' ')           // Collapse multiple spaces
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .trim();
}

/**
 * Generates a simple hash for duplicate detection
 */
export function hashText(text) {
    if (!text) return '';

    // Normalize: lowercase, remove extra spaces, remove common variations
    const normalized = text.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s₦]/g, '')
        .trim();

    // Simple hash function (for IndexedDB equality checks)
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
}

// ============================================================================
// RETRY LOGIC HELPERS
// ============================================================================

/**
 * Calculates exponential backoff delay
 * @param {number} attempt - Current retry attempt (0-based)
 * @param {number} baseDelay - Base delay in milliseconds (default: 5000)
 * @returns {number} Delay in milliseconds
 */
export function getBackoffDelay(attempt, baseDelay = 5000) {
    const maxDelay = 60000; // Max 1 minute
    const delay = baseDelay * Math.pow(2, attempt);
    return Math.min(delay, maxDelay);
}
