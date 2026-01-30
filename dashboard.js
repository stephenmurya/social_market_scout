// dashboard.js - Smart Dashboard with Multi-Category Support (v4.0)

import db from './db.js';
import { CONFIG } from './config.js';

// ============================================================================
// UTILITY: HASH TEXT (must match other files)
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
// UTILITY: FEE CALCULATION
// ============================================================================

function calculateFee(basePrice, feeString) {
    if (!feeString || feeString === "0" || feeString === "") return 0;

    // Case 1: Percentage
    if (feeString.includes('%')) {
        const numericPart = feeString.replace(/[^0-9.]/g, '');
        const percent = parseFloat(numericPart);
        if (isNaN(percent) || percent < 0 || percent > 100) return 0;
        return (percent / 100) * basePrice;
    }

    // Case 2: Fixed Amount
    let clean = feeString.toLowerCase()
        .replace(/,/g, '')
        .replace(/₦/g, '')
        .replace(/naira/g, '')
        .replace(/\s/g, '');

    if (clean.includes('k')) {
        const numPart = clean.replace(/[^0-9.]/g, '');
        const value = parseFloat(numPart);
        if (!isNaN(value)) return value * 1000;
    }

    if (clean.includes('m')) {
        const numPart = clean.replace(/[^0-9.]/g, '');
        const value = parseFloat(numPart);
        if (!isNaN(value)) return value * 1000000;
    }

    const finalValue = parseFloat(clean.replace(/[^0-9.]/g, ''));
    return isNaN(finalValue) ? 0 : finalValue;
}

function formatCurrency(amount) {
    if (!amount || isNaN(amount)) return '₦0';
    return `₦${Number(amount).toLocaleString()}`;
}

// ============================================================================
// UTILITY: PHONE EXTRACTION & WHATSAPP LINK
// ============================================================================

function extractPhoneNumber(text) {
    if (!text) return null;
    const cleaned = text.replace(/[^\d+]/g, '');
    const regex = /(?:\+?234|0)([789][01]\d{8})/g;
    const matches = cleaned.match(regex);

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
    return null;
}

function getWhatsAppLink(item) {
    let phoneNumber = null;

    // Priority 1: Use stored phone_number field
    if (item.phone_number) {
        phoneNumber = item.phone_number;
    }
    // Priority 2: Extract from sender
    else {
        const senderPhone = extractPhoneNumber(item.sender || '');
        if (senderPhone) {
            phoneNumber = senderPhone;
        }
        // Priority 3: Extract from raw text
        else {
            const bodyPhone = extractPhoneNumber(item.raw_text || '');
            if (bodyPhone) {
                phoneNumber = bodyPhone;
            }
        }
    }

    if (!phoneNumber) return null;

    // Generate pre-filled message based on listing details
    let message = `Hello! I'm interested in your listing`;

    if (item.sub_category) {
        message += `: ${item.sub_category}`;
    }

    if (item.location) {
        message += ` in ${item.location}`;
    }

    if (item.price) {
        message += ` (${formatCurrency(item.price)})`;
    }

    message += `. Is it still available?`;

    // Encode the message for URL
    const encodedMessage = encodeURIComponent(message);

    return `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
}

// ============================================================================
// UTILITY: SMART TYPE DETECTION (Real Estate specific)
// ============================================================================

function detectRealEstateType(item) {
    const raw = (item.sub_category + " " + item.raw_text + " " + (item.attributes?.type || "")).toLowerCase();

    // Priority 1: Use structured attributes if available
    let beds = item.attributes?.bedrooms || item.attributes?.beds;
    if (beds && !isNaN(parseInt(beds))) {
        const bedCount = parseInt(beds);
        if (bedCount >= 2) return bedCount.toString();
        if (bedCount === 1) return "1";
        if (bedCount === 0) return "self_con";
    }

    // Priority 2: Pattern matching in text (fallback)
    const highBedMatch = raw.match(/(\d+)\s*(?:bed|br|bedroom)/);
    if (highBedMatch && highBedMatch[1]) {
        const bedCount = parseInt(highBedMatch[1]);
        if (bedCount >= 2) return bedCount.toString();
    }

    // Priority 3: Keyword detection
    if (raw.includes('mini flat') || raw.includes('miniflat') ||
        raw.includes('room and parlor') || raw.includes('1 bedroom') ||
        raw.includes('one bedroom')) {
        return "1";
    }

    if (raw.includes('self contain') || raw.includes('self-contain') ||
        raw.includes('selfcon') || raw.includes('studio') ||
        raw.includes('one room')) {
        return "self_con";
    }

    return "unknown";
}

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const container = document.getElementById('listingsContainer');
const statsEl = document.getElementById('stats');
const refreshBtn = document.getElementById('refreshBtn');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const resetBtn = document.getElementById('resetBtn');

// Filter Inputs
const filterCategory = document.getElementById('filterCategory');
const filterLocation = document.getElementById('filterLocation');
const filterMaxPrice = document.getElementById('filterMaxPrice');
const filterBeds = document.getElementById('filterBeds');

// ============================================================================
// SVG ICONS
// ============================================================================

const ICONS = {
    sun: `<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>`,
    moon: `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`,
    location: `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>`,
    user: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>`,
    whatsapp: `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>`,
    tag: `<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line>`,
    box: `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>`
};

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

const initTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
        document.body.classList.add('dark-mode');
        themeIcon.innerHTML = ICONS.sun;
    } else {
        themeIcon.innerHTML = ICONS.moon;
    }
};

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeIcon.innerHTML = isDark ? ICONS.sun : ICONS.moon;
});

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Update brand name and title from config
    const navBrand = document.querySelector('.nav-brand');
    if (navBrand) navBrand.textContent = CONFIG.APP_NAME;
    document.title = CONFIG.APP_NAME;

    initTheme();
    loadListings();
});

refreshBtn.addEventListener('click', loadListings);

resetBtn.addEventListener('click', () => {
    [filterCategory, filterLocation, filterMaxPrice, filterBeds].forEach(el => el.value = '');
    loadListings();
});

[filterCategory, filterLocation, filterMaxPrice, filterBeds].forEach(el => {
    el.addEventListener('input', loadListings);
});

// ============================================================================
// CORE LOADING LOGIC
// ============================================================================

async function loadListings() {
    try {
        let listings = await db.listings.orderBy('created_at').reverse().toArray();

        // Filters
        const category = filterCategory.value;
        const locationQuery = filterLocation.value.toLowerCase();
        const maxPrice = parseFloat(filterMaxPrice.value) || Infinity;
        const filterType = filterBeds.value;

        const filtered = listings.filter(item => {
            // Category filter
            if (category && item.category !== category) return false;

            // Price filter
            if (item.price && item.price > maxPrice) return false;

            // Location filter
            if (locationQuery && (!item.location || !item.location.toLowerCase().includes(locationQuery))) {
                return false;
            }

            // Bedroom filter (Real Estate only)
            if (filterType && item.category === 'Real Estate') {
                const detectedType = detectRealEstateType(item);
                if (filterType === 'self_con') {
                    if (detectedType !== 'self_con') return false;
                } else if (filterType === '4') {
                    if (isNaN(parseInt(detectedType)) || parseInt(detectedType) < 4) return false;
                } else {
                    if (detectedType !== filterType) return false;
                }
            }

            return true;
        });

        render(filtered);
        updateStats(filtered, listings);

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-tertiary);">Error loading data.</div>`;
    }
}

// ============================================================================
// STATS UPDATE
// ============================================================================

async function updateStats(filteredItems, allItems) {
    const dbStats = await db.getStats();

    statsEl.innerHTML = `
        <span style="font-weight: 600;">${filteredItems.length}</span> of ${allItems.length} listings
        <span style="opacity: 0.6; margin-left: 12px;">
            (${dbStats.ignored} ignored, ${dbStats.failed} failed)
        </span>
    `;
}

// ============================================================================
// RENDER LOGIC
// ============================================================================

function render(items) {
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-tertiary);">
                <h3>No listings found</h3>
                <p>Try adjusting filters or scroll through social media to capture more data.</p>
            </div>`;
        return;
    }

    items.forEach(item => {
        const card = createListingCard(item);
        container.appendChild(card);
    });
}

// ============================================================================
// CARD CREATION
// ============================================================================

function createListingCard(item) {
    const date = new Date(item.created_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    const card = document.createElement('div');
    card.className = "card";

    // Determine category-specific rendering
    const isRealEstate = item.category === 'Real Estate';

    if (isRealEstate) {
        card.innerHTML = renderRealEstateCard(item, date);
    } else {
        card.innerHTML = renderGeneralItemCard(item, date);
    }

    return card;
}

// ============================================================================
// REAL ESTATE CARD RENDERER
// ============================================================================

function renderRealEstateCard(item, date) {
    const baseRent = item.price || 0;
    let totalPackage = baseRent;
    let feeHtml = '';
    let hasFees = false;

    // Calculate fees
    if (item.fees) {
        const agency = calculateFee(baseRent, item.fees.agency);
        const legal = calculateFee(baseRent, item.fees.legal);
        const caution = calculateFee(baseRent, item.fees.caution);
        const service = calculateFee(baseRent, item.fees.service);

        const calculatedTotal = agency + legal + caution + service;

        if (calculatedTotal > 0) {
            totalPackage += calculatedTotal;
            hasFees = true;

            const feeRow = (label, raw, val) => {
                if (!val || val === 0) return '';
                return `
                    <div class="fee-row">
                        <span class="fee-label">${label} (${raw})</span>
                        <span class="fee-val">${formatCurrency(val)}</span>
                    </div>`;
            };

            feeHtml = `
                <div class="fee-container">
                    ${feeRow('Agency', item.fees.agency, agency)}
                    ${feeRow('Legal', item.fees.legal, legal)}
                    ${feeRow('Caution', item.fees.caution, caution)}
                    ${feeRow('Service', item.fees.service, service)}
                </div>
            `;
        }
    }

    const type = detectRealEstateType(item);
    let typeDisplay = "";
    if (type === 'self_con') typeDisplay = "• Self Contain";
    else if (type === '1') typeDisplay = "• 1 Bedroom / Mini Flat";
    else if (parseInt(type) > 1) typeDisplay = `• ${type} Bedrooms`;

    const waLink = getWhatsAppLink(item);
    const contactButton = renderContactButton(waLink);

    return `
        <div class="card-header">
            <span class="badge badge-real-estate">Real Estate</span>
            <span class="timestamp">${date}</span>
        </div>
        
        <h3 class="card-title">${item.sub_category || 'Available Property'}</h3>
        
        <div class="price-block">
            <div class="card-price">${formatCurrency(baseRent)}</div>
            ${hasFees ? `<div class="total-package">Total Package: ${formatCurrency(totalPackage)}</div>` : ''}
        </div>
        
        <div class="card-meta">
            <div class="meta-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS.location}</svg>
                <span>${item.location || 'Location not specified'}</span>
            </div>
            ${type !== 'unknown' ? `
            <div class="meta-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <span>${typeDisplay}</span>
            </div>` : ''}
            <div class="meta-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS.user}</svg>
                <span style="font-family:monospace">${item.sender || "Unknown"}</span>
            </div>
        </div>

        ${hasFees ? feeHtml : `
            <div class="raw-text-preview">
                "${(item.raw_text || "").substring(0, 100)}..."
            </div>
        `}

        ${contactButton}
    `;
}

// ============================================================================
// GENERAL ITEM CARD RENDERER
// ============================================================================

function renderGeneralItemCard(item, date) {
    const price = item.price || 0;
    const category = item.category || 'General';

    // Category-specific badge colors
    const badgeClass = getCategoryBadgeClass(category);

    // Extract item condition if available
    const condition = item.attributes?.condition;
    const brand = item.attributes?.brand;

    const waLink = getWhatsAppLink(item);
    const contactButton = renderContactButton(waLink);

    return `
        <div class="card-header">
            <span class="badge ${badgeClass}">${category}</span>
            <span class="timestamp">${date}</span>
        </div>
        
        <h3 class="card-title">${item.sub_category || 'Available Item'}</h3>
        
        <div class="price-block">
            <div class="card-price">${formatCurrency(price)}</div>
        </div>
        
        <div class="card-meta">
            ${item.location ? `
            <div class="meta-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS.location}</svg>
                <span>${item.location}</span>
            </div>` : ''}
            ${brand ? `
            <div class="meta-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS.tag}</svg>
                <span>${brand}</span>
            </div>` : ''}
            ${condition ? `
            <div class="meta-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS.box}</svg>
                <span style="text-transform: capitalize">${condition}</span>
            </div>` : ''}
            <div class="meta-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS.user}</svg>
                <span style="font-family:monospace">${item.sender || "Unknown"}</span>
            </div>
        </div>

        <div class="raw-text-preview">
            "${(item.raw_text || "").substring(0, 100)}..."
        </div>

        ${contactButton}
    `;
}

// ============================================================================
// HELPER: CONTACT BUTTON RENDERER
// ============================================================================

function renderContactButton(waLink) {
    if (waLink) {
        return `
            <a href="${waLink}" target="_blank" class="wa-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS.whatsapp}</svg>
                Chat on WhatsApp
            </a>
        `;
    } else {
        return `
            <div class="wa-btn wa-btn-disabled">
                Contact unavailable
            </div>
        `;
    }
}

// ============================================================================
// HELPER: CATEGORY BADGE CLASSES
// ============================================================================

function getCategoryBadgeClass(category) {
    const classMap = {
        'Real Estate': 'badge-real-estate',
        'Electronics': 'badge-electronics',
        'Vehicles': 'badge-vehicles',
        'Furniture': 'badge-furniture',
        'Services': 'badge-services',
        'Other Items': 'badge-item'
    };
    return classMap[category] || 'badge-item';
}
