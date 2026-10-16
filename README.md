# YouTube Enhanced Search Filters

A browser extension that gives YouTube search the filters it should have had all along.

YouTube's own Filters menu lets you pick one option at a time. This extension adds a filter
panel next to the search box where you can combine everything at once, add filters YouTube
doesn't have (view count, exact length, title words, channels), hide clutter, and save the
combinations you use as presets.

Available on [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/youtube-enhanced-filters/).

---

## Features

### Filters tab

| Filter | Options | How it works |
|---|---|---|
| **Sort by** | Relevance, Popularity | YouTube |
| **Upload date** | Today, This week, This month, This year, or a custom date range | YouTube (`after:`/`before:` for the range, plus a check of each result's age) |
| **Type** | Video, Shorts, Channel, Playlist, Movie | YouTube |
| **Length** | Under 3 min, 3–20 min, Over 20 min, or a custom minute range | YouTube, plus a check of each result for the custom range |
| **Features** | Live, 4K, HD, Subtitles/CC, Creative Commons, 360°, VR180, 3D, HDR, Location (pick several) | YouTube |
| **Views** | At least / at most (`10K`, `1.5M` and `1,000,000` all work) | Checked on each result |
| **Title words** | Any of / all of / none of | Checked on each result |

Title words are matched as whole words, ignoring case and accents. Use quotes for a phrase
(`"full movie"`) and `*` for word endings (`review*` also finds "reviews").

### Hide tab (saved permanently)

- Ads and promoted videos
- Shorts (the Shorts shelves and Shorts mixed into results)
- Movies
- Extra shelves ("People also watched", "For you", related searches)
- Watched videos (anything with a progress bar)
- Channels you never want to see (by name or `@handle`)

### Presets

Save the current filters under a name and apply them with one click. Star a preset to start
every new tab with it.

### Other details

- **Badge** on the filter button shows how many filters are on.
- **Results bar** says how many videos your filters hid, with **Show them** to see them
  greyed out and labelled with the reason ("Under 2M views", "Contains "reaction"", ...).
- **Filters stay on for new searches** in the same tab until you press Reset. YouTube's own
  Filters menu still works too: the panel always shows what is actually applied.
- **Keyboard:** `Alt + F` opens or closes the panel, `Enter` applies, `Esc` closes.
- **Light and dark** theme follow your YouTube setting.

---

## Installation

### Firefox

Install it from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/youtube-enhanced-filters/).

To run your own copy: open `about:debugging#/runtime/this-firefox`, click **Load Temporary
Add-on** and pick `manifest.json`. (Temporary add-ons are removed when Firefox restarts.)

### Chrome / Edge / Brave (any Chromium browser)

1. Download or clone this repository
2. Go to `chrome://extensions` and turn on **Developer mode**
3. Click **Load unpacked** and select the `yt-enhanced-filters` folder
4. Search for anything on YouTube: the filter button appears next to the search box

---

## How it works

YouTube stores its search filters in the URL as a base64-encoded protobuf value (`?sp=...`).
`src/sp.js` reads and writes that value, so any combination of YouTube's filters can be sent
at once, and the panel can show filters you picked in YouTube's own menu. Filter fields it
doesn't know are kept as they are.

A custom date range adds YouTube's `after:` and `before:` search words to the query. YouTube
sometimes lets much older videos through, so results whose age ("14 years ago") is clearly
outside the range are hidden too.

The other filters run in the page. `src/page-bridge.js` runs in YouTube's own page context to
read the data YouTube keeps on each result (the full view count, the length, watch progress),
which is more reliable than the abbreviated text on screen ("1.1M") and works in any language.
If that data is ever missing, the extension falls back to reading the visible text.

---

## File structure

```
yt-enhanced-filters/
├── manifest.json        Extension config
├── style.css            Panel, button and results-bar styles, plus the "Hide" rules
├── icon.png             Extension icon
├── src/
│   ├── sp.js            Reads and writes YouTube's `sp` filter parameter
│   ├── match.js         Parsing and matching for the in-page filters (no DOM, unit-tested)
│   ├── page-bridge.js   Reads YouTube's data for each result (runs in the page's context)
│   ├── panel.js         Builds the button, panel and results bar
│   └── content.js       State, storage, navigation and filtering
└── tests/               Unit tests for sp.js and match.js
```

There is no build step. To run the tests (Node 20 or newer):

```
node --test
```

To check the extension the way addons.mozilla.org does:

```
npx web-ext lint --ignore-files "tests/**"
```

---

## Known limitations

- **Watched videos** can only be hidden when YouTube shows the red progress bar, so it needs
  you to be signed in, and videos watched on another device may not have one.
- **Under 3 min** is YouTube's own option and it returns only Shorts. For short regular videos,
  use a custom length range instead.
- **The date check** of each result's age understands English ("2 years ago") only. In other
  languages the custom date range still works, but relies on YouTube alone.
- **Sort by upload date or rating** no longer exists on YouTube, so it isn't offered.
- **Subscriber and like counts** aren't included in search results, so they can't be filtered.

---

## Changelog

### v2.0.0
- New design: the filter button now sits next to YouTube's search box, the panel uses
  YouTube's own look (light and dark) with icons instead of emoji, and is split into Filters,
  Hide and Presets tabs.
- Fixed: the view count filter didn't hide anything (YouTube stopped writing "views").
- Fixed: the "4–20 min" and "Over 20 min" options were swapped; durations now use YouTube's
  current options (Under 3 / 3–20 / Over 20 min).
- Fixed: VR180, 3D and HDR sent the wrong codes and were ignored by YouTube.
- Fixed: filters were shown as active on new searches but YouTube's part wasn't applied.
- Fixed: "Hide sections" also hid the chapter list inside normal results, and "Hide Shorts"
  could hide non-Shorts shelves.
- Fixed: `Alt + F` stopped working after visiting a few search pages.
- New: Shorts type and Location feature, hiding channels, a starred preset for new tabs,
  "Show them" for hidden results with the reason, `K`/`M` in view counts, phrases and `*` in
  title words, accent-insensitive matching.
- Custom date ranges now also hide old results YouTube lets through.
- Custom length ranges now also ask YouTube for the matching length, so more results fit.
- Filters that don't need YouTube (views, title words, Hide) apply instantly without reloading.
- Settings and presets moved to the extension's own storage. Existing 1.x presets and Hide
  settings are imported automatically.

### v1.1
- Fixed custom date range - now uses YouTube's native `before:`/`after:` search operators server-side for accurate results
- Fixed sort by popularity encoding
- Removed non-functional "Sort by upload date" and "Sort by rating" options (removed by YouTube)
- Clutter and watched settings now persist permanently; other filters reset between sessions

### v1.0
- Initial release

---

## Contributing

Bug reports and suggestions are welcome via [GitHub Issues](../../issues).

If you'd like to contribute code, feel free to open a pull request. The code is plain
JavaScript with no build step.

---

## License

MIT License - do whatever you want with it.
