// popup.js - Extension Popup Controller

import db from './db.js';
import { CONFIG } from './config.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let isExtensionEnabled = false;
let hasApiKey = false;

// ============================================================================
// DOM ELEMENTS (will be initialized in DOMContentLoaded)
// ============================================================================

let mainView, settingsView;
let powerToggle, listingsCount, todayCount, openDashboard, openSettings;
let backButton, apiKeyInput, settingsForm, saveButton, successMessage, toggleVisibility;
let headerTitle, headerVersion;

// Input fields for processing settings
let minDelayInput, maxRetriesInput, backoffDelayInput, maxQueueInput;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Popup initializing...');

    // Initialize DOM elements
    mainView = document.getElementById('mainView');
    settingsView = document.getElementById('settingsView');

    // Main View Elements
    powerToggle = document.getElementById('powerToggle');
    listingsCount = document.getElementById('listingsCount');
    todayCount = document.getElementById('todayCount');
    openDashboard = document.getElementById('openDashboard');
    openSettings = document.getElementById('openSettings');
    headerTitle = document.querySelector('.header h1');
    headerVersion = document.querySelector('.header .version');

    // Set dynamic name and version
    if (headerTitle) headerTitle.textContent = CONFIG.APP_NAME;
    if (headerVersion) headerVersion.textContent = `v${CONFIG.APP_VERSION}`;
    document.title = CONFIG.APP_NAME;

    // Settings View Elements

    // Settings View Elements
    backButton = document.getElementById('backButton');
    apiKeyInput = document.getElementById('apiKeyInput');
    settingsForm = document.getElementById('settingsForm');
    saveButton = document.getElementById('saveButton');
    successMessage = document.getElementById('successMessage');
    toggleVisibility = document.getElementById('toggleVisibility');

    // Processing Settings Elements
    minDelayInput = document.getElementById('minDelayInput');
    maxRetriesInput = document.getElementById('maxRetriesInput');
    backoffDelayInput = document.getElementById('backoffDelayInput');
    maxQueueInput = document.getElementById('maxQueueInput');

    console.log('📋 DOM elements loaded');

    await loadState();
    await updateStats();
    setupEventListeners();

    console.log('✅ Popup ready');
});

// ============================================================================
// LOAD STATE FROM STORAGE
// ============================================================================

async function loadState() {
    try {
        // Load settings from storage
        const storage = await chrome.storage.local.get([
            'apiKey',
            'extensionEnabled',
            'minDelayMs',
            'maxRetryAttempts',
            'rateLimitBackoffMs',
            'maxQueueSize'
        ]);

        hasApiKey = Boolean(storage.apiKey);
        isExtensionEnabled = Boolean(storage.extensionEnabled);

        // Update UI based on state
        updatePowerButton();

        // Load values into inputs (fallback to CONFIG if not in storage)
        if (hasApiKey) apiKeyInput.value = storage.apiKey;

        minDelayInput.value = storage.minDelayMs || CONFIG.PROCESSING.MIN_DELAY_MS;
        maxRetriesInput.value = storage.maxRetryAttempts !== undefined ? storage.maxRetryAttempts : CONFIG.PROCESSING.MAX_RETRY_ATTEMPTS;
        backoffDelayInput.value = storage.rateLimitBackoffMs || CONFIG.PROCESSING.RATE_LIMIT_BACKOFF_MS;
        maxQueueInput.value = storage.maxQueueSize || CONFIG.PROCESSING.MAX_QUEUE_SIZE;

    } catch (error) {
        console.error('Error loading state:', error);
    }
}

// ============================================================================
// UPDATE POWER BUTTON STATE
// ============================================================================

function updatePowerButton() {
    if (!hasApiKey) {
        // No API key - button disabled
        powerToggle.classList.remove('active', 'inactive');
        powerToggle.classList.add('disabled');
        powerToggle.querySelector('.status-text').textContent = 'No API Key';
        powerToggle.disabled = true;
    } else if (isExtensionEnabled) {
        // Active state
        powerToggle.classList.remove('disabled', 'inactive');
        powerToggle.classList.add('active');
        powerToggle.querySelector('.status-text').textContent = 'Active';
        powerToggle.disabled = false;
    } else {
        // Inactive state (but API key exists)
        powerToggle.classList.remove('disabled', 'active');
        powerToggle.classList.add('inactive');
        powerToggle.querySelector('.status-text').textContent = 'Inactive';
        powerToggle.disabled = false;
    }
}

// ============================================================================
// UPDATE STATISTICS
// ============================================================================

async function updateStats() {
    try {
        const stats = await db.getStats();
        const listings = await db.listings.toArray();

        listingsCount.textContent = stats.listings || 0;

        // Count today's listings
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();

        const todayListings = listings.filter(item => {
            return item.created_at >= todayTimestamp;
        });

        todayCount.textContent = todayListings.length;

    } catch (error) {
        console.error('Error loading stats:', error);
        listingsCount.textContent = '0';
        todayCount.textContent = '0';
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Power Toggle
    powerToggle.addEventListener('click', handlePowerToggle);

    // Navigation
    openDashboard.addEventListener('click', () => {
        chrome.tabs.create({ url: 'dashboard.html' });
    });

    openSettings.addEventListener('click', () => {
        showView('settings');
    });

    backButton.addEventListener('click', () => {
        showView('main');
    });

    // Settings Form
    settingsForm.addEventListener('submit', handleSaveSettings);

    // Toggle password visibility
    toggleVisibility.addEventListener('click', () => {
        const type = apiKeyInput.type === 'password' ? 'text' : 'password';
        apiKeyInput.type = type;
    });
}

// ============================================================================
// POWER TOGGLE HANDLER
// ============================================================================

async function handlePowerToggle() {
    if (!hasApiKey) return;

    isExtensionEnabled = !isExtensionEnabled;

    // Save state
    await chrome.storage.local.set({ extensionEnabled: isExtensionEnabled });

    // Update UI
    updatePowerButton();

    // Optional: Show feedback
    console.log(`Extension ${isExtensionEnabled ? 'enabled' : 'disabled'}`);
}

// ============================================================================
// SETTINGS SAVE HANDLER
// ============================================================================

async function handleSaveSettings(e) {
    e.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    const minDelay = parseInt(minDelayInput.value);
    const maxRetries = parseInt(maxRetriesInput.value);
    const backoffDelay = parseInt(backoffDelayInput.value);
    const maxQueue = parseInt(maxQueueInput.value);

    // Validate API key format
    if (!apiKey.startsWith('sk-or-v1-')) {
        alert('Invalid API key format. Key should start with "sk-or-v1-"');
        return;
    }

    // Disable button while saving
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
        // Save all settings to storage
        await chrome.storage.local.set({
            apiKey: apiKey,
            minDelayMs: minDelay,
            maxRetryAttempts: maxRetries,
            rateLimitBackoffMs: backoffDelay,
            maxQueueSize: maxQueue
        });

        hasApiKey = true;

        // Show success message
        successMessage.classList.add('show');
        setTimeout(() => {
            successMessage.classList.remove('show');
        }, 2000);

        // Navigate back to main view after 1.5 seconds
        setTimeout(() => {
            updatePowerButton();
            showView('main');
        }, 1500);

    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Failed to save settings. Please try again.');
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Settings';
    }
}

// ============================================================================
// VIEW NAVIGATION
// ============================================================================

function showView(viewName) {
    if (viewName === 'main') {
        mainView.classList.add('active');
        settingsView.classList.remove('active');
    } else if (viewName === 'settings') {
        mainView.classList.remove('active');
        settingsView.classList.add('active');
    }
}