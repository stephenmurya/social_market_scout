# Social Listing Extractor 🕵️‍♂️🇳🇬

A powerful, local-first Chrome Extension designed to index and filter real estate and product listings from social chat platforms like WhatsApp Web and Facebook. 

Built specifically to solve the "noise" problem in high-volume Abuja market groups, this tool uses Google's Gemini 2.0 AI to transform messy chat text into structured, searchable data.

## 🚀 Features

- **Automated Scraping:** Uses a `MutationObserver` to watch chat windows in real-time.
- **The "Two-Gate" Filter System:**
    - **Gate 1 (The Bouncer):** A local keyword and regex filter that ignores 70% of "noise" (greetings, system messages, buyer requests) before it ever touches the AI.
    - **Gate 2 (The Judge):** Uses Gemini 2.0 Flash to determine if a message is a valid listing and extracts price, location, and category.
- **Advanced Cost Saving:**
    - **Positive Cache:** Checks the database for existing listings to avoid re-processing the same text.
    - **Negative Cache (Trash Can):** Remembers "ignored" messages (non-listings) so you never pay for the same junk message twice.
- **Local Database:** Powered by **Dexie.js (IndexedDB)**. Your data never leaves your browser.
- **Searchable Dashboard:** A clean, Tailwind-inspired UI to filter by category (Real Estate/Items), price range, location, and bedroom count.
- **Smart Queue:** Built-in rate limiting to stay within OpenRouter free-tier limits without hitting 429 errors.

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6 Modules)
- **Database:** [Dexie.js](https://dexie.org/)
- **AI Integration:** [OpenRouter API](https://openrouter.ai/) (Gemini 2.0 Flash)
- **Styling:** Custom CSS (Optimized for Chrome Extension CSP)

## 📦 Installation

1. **Clone the Repo:**
   ```bash
   git clone [https://github.com/stephenmurya/social_listing_extractor.git](https://github.com/stephenmurya/social_listing_extractor.git)
