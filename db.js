// db.js
import { Dexie } from './dexie.mjs';

const db = new Dexie('AbujaMarketDB');

// Version 3: Add 'ignored' table
db.version(3).stores({
    listings: '++id, category, price, location, sub_category, created_at, raw_text',
    ignored: '++id, raw_text, created_at' // <--- The Trash Can
});

export default db;