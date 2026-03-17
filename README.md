# ⚡ YouTube Enhanced Search Filters

A browser extension that gives YouTube the search filters it should have had all along.

YouTube's built-in filters are limited and can't be combined. This extension replaces them with a powerful, multi-select filter panel that lets you slice search results any way you want — and remembers your preferences.

---

## Features

### 🔀 Combinable filters
All filters can be combined freely — something YouTube's native filters don't allow.

### 📋 Filter categories

| Category | Options |
|---|---|
| **Sort by** | Relevance, Upload date, View count, Rating |
| **Upload date** | Today, This week, This month, This year, Custom date range |
| **Type** | Video, Channel, Playlist, Movie |
| **Duration** | Under 4 min, 4–20 min, Over 20 min, Custom minute range |
| **View count** | Custom min/max range |
| **Features** | Live, 4K, HD, Subtitles, Creative Commons, 360°, VR180, 3D, HDR |
| **Keyword inclusion** | Must contain any of these words |
| **Keyword inclusion (strict)** | Must contain ALL of these words |
| **Keyword exclusion** | Must not contain any of these words |
| **Hide clutter** | Sponsored ads, Movies, Irrelevant sections, Shorts |
| **Hide watched** | Hides videos with a watch progress bar |

### 💾 Presets
Save your favourite filter combinations and load them instantly. Presets can be updated or deleted at any time.

### 🔢 Active filter badge
The filter button shows a count of how many filters are currently active.

### 📊 Results counter
A live counter above results shows how many videos passed your filters out of the total.

### ⌨️ Keyboard shortcut
Press `Alt + F` to open or close the filter panel without touching your mouse.

---

## Installation

### Chrome / Edge / Brave (any Chromium browser)

1. Download or clone this repository
2. Open your browser and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `yt-enhanced-filters` folder
6. Go to YouTube and search for anything — the **⚡ Filters** button will appear in the top right

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `manifest.json` file inside the folder

> **Note:** Firefox requires reloading the extension after each browser restart when installed this way. A proper Firefox listing may be added in the future.

---

## How it works

YouTube encodes its search filters as a base64-encoded protobuf value in the URL (`?sp=...`). This extension builds that value from scratch, allowing any combination of filters to be applied simultaneously — including combinations YouTube's own UI doesn't support.

Filters that YouTube doesn't expose at all (view count range, custom duration, keyword matching, hide watched, hide clutter) are applied client-side by reading the search result cards directly in the DOM.

---

## File structure

```
yt-enhanced-filters/
├── manifest.json   # Extension config (permissions, content scripts)
├── content.js      # All extension logic
├── style.css       # Filter panel styling
└── icon.png        # Extension icon
```

---

## Known limitations

- **"Hide watched" is client-side only** — YouTube's own "Unwatched" filter is broken server-side, so we detect watched videos by looking for a red progress bar in the DOM. Videos watched on mobile or other devices may not show the bar.
- **View count and duration filtering** reads data from the search result cards. If YouTube changes their HTML structure, these may need updating.
- **Subscriber count and like count filters** are not available — YouTube does not include this data in search result cards.

---

## Contributing

Bug reports and suggestions are welcome via [GitHub Issues](../../issues).

If you'd like to contribute code, feel free to open a pull request. The codebase is intentionally kept as a single vanilla JS file with no build step required.

---

## License

MIT License — do whatever you want with it.
