document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('openDash');

    button.addEventListener('click', () => {
        // This opens your dashboard in a new tab
        chrome.tabs.create({ url: 'dashboard.html' });
    });
});