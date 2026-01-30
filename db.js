// db.js - Enhanced Database Schema with Optimization and Error Tracking

import { Dexie } from './dexie.mjs';

const db = new Dexie('AbujaMarketDB');

// ============================================================================
// SCHEMA VERSION 5: Enhanced Multi-Platform Support
// ============================================================================
// Changes from v4:
// - Added 'platform' field (whatsapp | facebook)
// - Added 'processing_status' for queue state tracking
// - Added 'phone_number' indexed field for contact lookup
// - Added 'hash' field for better duplicate detection
// - New table: 'failed' for retry exhaustion tracking
// - New table: 'processing' for in-flight message tracking
// ============================================================================

db.version(5).stores({
    // Main listings store (successfully processed items)
    listings: `
        ++id,
        category,
        price,
        location,
        sub_category,
        created_at,
        raw_text,
        sender,
        phone_number,
        platform,
        hash
    `,

    // Ignored messages (rejected by AI as non-listings)
    ignored: `
        ++id,
        raw_text,
        hash,
        created_at,
        platform
    `,

    // Failed processing (exceeded retry limit or permanent errors)
    failed: `
        ++id,
        raw_text,
        hash,
        error_message,
        retry_count,
        last_attempt,
        created_at,
        platform
    `,

    // In-flight processing tracker (prevents duplicate API calls)
    processing: `
        hash,
        raw_text,
        started_at,
        platform
    `
});

// ============================================================================
// DATABASE UPGRADE HANDLER
// ============================================================================
// Runs when user upgrades from older version
// Ensures existing data gets new required fields

db.version(5).upgrade(async tx => {
    console.log('📦 Upgrading database to v5...');

    // Add default values for new fields in existing records
    const listings = await tx.table('listings').toArray();

    for (const listing of listings) {
        const updates = {};

        if (!listing.platform) updates.platform = 'whatsapp';
        if (!listing.hash) {
            // Generate hash from raw_text for existing records
            const normalized = (listing.raw_text || '').toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/[^\w\s₦]/g, '')
                .trim();

            let hash = 0;
            for (let i = 0; i < normalized.length; i++) {
                hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
                hash = hash & hash;
            }
            updates.hash = hash.toString(36);
        }

        if (Object.keys(updates).length > 0) {
            await tx.table('listings').update(listing.id, updates);
        }
    }

    console.log('✅ Database upgrade complete');
});

// ============================================================================
// HELPER METHODS
// ============================================================================

/**
 * Check if message is already processed, ignored, or in-flight
 * Returns: { exists: boolean, location: 'listings' | 'ignored' | 'processing' | 'failed' | null }
 */
db.checkDuplicate = async function (hash) {
    // Check processing queue first (fastest exit)
    const inFlight = await db.processing.get(hash);
    if (inFlight) {
        return { exists: true, location: 'processing' };
    }

    // Check main listings
    const inListings = await db.listings.where('hash').equals(hash).count();
    if (inListings > 0) {
        return { exists: true, location: 'listings' };
    }

    // Check ignored
    const inIgnored = await db.ignored.where('hash').equals(hash).count();
    if (inIgnored > 0) {
        return { exists: true, location: 'ignored' };
    }

    // Check failed
    const inFailed = await db.failed.where('hash').equals(hash).count();
    if (inFailed > 0) {
        return { exists: true, location: 'failed' };
    }

    return { exists: false, location: null };
};

/**
 * Mark message as currently processing (in-flight tracker)
 */
db.markProcessing = async function (hash, rawText, platform = 'whatsapp') {
    await db.processing.put({
        hash: hash,
        raw_text: rawText,
        started_at: Date.now(),
        platform: platform
    });
};

/**
 * Remove message from in-flight tracker (processing complete)
 */
db.unmarkProcessing = async function (hash) {
    await db.processing.delete(hash);
};

/**
 * Clean up stale processing entries (older than 5 minutes)
 * Call this periodically to prevent memory bloat from crashed processes
 */
db.cleanStaleProcessing = async function () {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const staleEntries = await db.processing
        .where('started_at')
        .below(fiveMinutesAgo)
        .toArray();

    if (staleEntries.length > 0) {
        console.log(`🧹 Cleaning ${staleEntries.length} stale processing entries`);
        await db.processing.bulkDelete(staleEntries.map(e => e.hash));
    }
};

/**
 * Add failed message to tracking (exceeded retry limit)
 */
db.addFailedMessage = async function (hash, rawText, errorMessage, retryCount, platform = 'whatsapp') {
    await db.failed.put({
        hash: hash,
        raw_text: rawText,
        error_message: errorMessage,
        retry_count: retryCount,
        last_attempt: Date.now(),
        created_at: Date.now(),
        platform: platform
    });
};

/**
 * Get database statistics
 */
db.getStats = async function () {
    const [listingsCount, ignoredCount, failedCount, processingCount] = await Promise.all([
        db.listings.count(),
        db.ignored.count(),
        db.failed.count(),
        db.processing.count()
    ]);

    return {
        listings: listingsCount,
        ignored: ignoredCount,
        failed: failedCount,
        processing: processingCount,
        total: listingsCount + ignoredCount + failedCount
    };
};

/**
 * Clear all data (nuclear option for reset)
 */
db.clearAll = async function () {
    await Promise.all([
        db.listings.clear(),
        db.ignored.clear(),
        db.failed.clear(),
        db.processing.clear()
    ]);
    console.log('🗑️ All data cleared');
};

export default db;
