// config.example.js - Configuration Template
// 
// SETUP INSTRUCTIONS:
// 1. Copy this file and rename it to: config.js
// 2. Adjust settings below as needed
// 3. Save the file
//
// NOTE: API Key and Processing Parameters are now configured directly 
// through the extension's Settings page in the popup UI.

export const CONFIG = {
    // ========================================================================
    // APP IDENTITY
    // ========================================================================
    APP_NAME: "Social Market Scout",
    APP_VERSION: "4.1",

    // ========================================================================
    // KEYWORD DETECTION (Can still be modified here)
    // ========================================================================
    KEYWORDS: {
        real_estate: [
            "rent", "sale", "buy", "let", "lease", "bedroom", "flat",
            "duplex", "bungalow", "land", "plot", "sqm", "mini flat",
            "self contain", "self-contain", "selfcon", "apartment",
            "estate", "gated", "serviced", "terrace", "detached"
        ],
        items: [
            "price", "₦", "selling", "buy", "naira", "million", "k", "m",
            "brand new", "used", "tokunbo", "fairly used", "phone",
            "laptop", "car", "vehicle", "furniture", "electronics",
            "generator", "fridge", "tv", "sofa", "bed", "table"
        ],
        general: [
            "for sale", "available", "urgent", "serious buyer"
        ]
    },

    // ========================================================================
    // PLATFORM-SPECIFIC SELECTORS
    // ========================================================================
    SELECTORS: {
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
    },

    // ========================================================================
    // FEATURE FLAGS
    // ========================================================================
    FEATURES: {
        ENABLE_DEBUG_LOGGING: false,
        ENABLE_BATCHING: false,
        AUTO_CLEANUP_STALE: true,
    }
};