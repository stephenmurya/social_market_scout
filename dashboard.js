import db from './db.js';

const container = document.getElementById('listingsContainer');
const statsEl = document.getElementById('stats');
const refreshBtn = document.getElementById('refreshBtn');

// Inputs
const filterCategory = document.getElementById('filterCategory');
const filterLocation = document.getElementById('filterLocation');
const filterMaxPrice = document.getElementById('filterMaxPrice');
const filterBeds = document.getElementById('filterBeds');

// Event Listeners
document.addEventListener('DOMContentLoaded', loadListings);
refreshBtn.addEventListener('click', loadListings);

document.getElementById('resetBtn').addEventListener('click', () => {
    document.querySelectorAll('input, select').forEach(el => el.value = '');
    loadListings();
});

[filterCategory, filterLocation, filterMaxPrice, filterBeds].forEach(el => {
    el.addEventListener('input', loadListings);
});

async function loadListings() {
    console.log("Loading listings...");
    try {
        let listings = await db.listings.orderBy('created_at').reverse().toArray();
        console.log(`Found ${listings.length} listings in DB`);

        // Filter Logic
        const category = filterCategory.value;
        const location = filterLocation.value.toLowerCase();
        const maxPrice = parseFloat(filterMaxPrice.value) || Infinity;
        const beds = filterBeds.value;

        const filtered = listings.filter(item => {
            if (category && item.category !== category) return false;
            if (item.price > maxPrice) return false;
            if (location && (!item.location || !item.location.toLowerCase().includes(location))) return false;

            if (beds) {
                // Handle complex attribute access safely
                const itemBeds = item.attributes?.bedrooms || item.attributes?.beds;
                if (!itemBeds) return false;
                if (beds === '4' && parseInt(itemBeds) < 4) return false;
                if (beds !== '4' && parseInt(itemBeds) != beds) return false;
            }
            return true;
        });

        render(filtered);
    } catch (err) {
        console.error("Error loading listings:", err);
        container.innerHTML = `<div style="color:red; padding:20px;">Error loading database: ${err.message}</div>`;
    }
}

function render(items) {
    statsEl.innerText = `${items.length} listings found`;
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = `<div style="padding:20px; color:#666;">No listings match your filters. Try refreshing?</div>`;
        return;
    }

    items.forEach(item => {
        const date = new Date(item.created_at).toLocaleDateString();
        // Safe price formatting
        const price = item.price ? `₦${Number(item.price).toLocaleString()}` : 'Price TBD';

        const isHouse = item.category === 'Real Estate';
        const badgeClass = isHouse ? 'badge-real-estate' : 'badge-item';

        let details = '';
        if (item.attributes) {
            if (item.attributes.bedrooms) details += `• ${item.attributes.bedrooms} Beds `;
            if (item.attributes.condition) details += `• ${item.attributes.condition}`;
        }

        const card = document.createElement('div');
        card.className = "card";
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <span class="badge ${badgeClass}">${item.category || 'Other'}</span>
                <span style="font-size:12px; color:#999;">${date}</span>
            </div>
            
            <h3 class="sub-title">${item.sub_category || 'Listing'}</h3>
            <div class="price">${price}</div>
            
            <div class="meta">
                📍 ${item.location || 'Unknown Location'}
            </div>
            <div class="meta" style="font-size:12px;">${details}</div>

            <div class="raw-text">"${item.raw_text}"</div>
        `;
        container.appendChild(card);
    });
}