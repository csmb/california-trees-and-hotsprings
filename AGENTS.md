# AGENTS.md

Project-specific instructions for AI assistants working in this directory.

## Project Overview

Interactive Leaflet map of California trees, hot springs, waterfalls, and SF Privately Owned Public Spaces (POPS). Static site — no build step, no bundler, no framework.

**Stack:** Vanilla JS + Leaflet 1.9.4 + OpenTopoMap tiles

**Files:**
- `index.html` — shell, filter bar, info panel markup
- `js/app.js` — all map logic, markers, filtering, search, geolocation
- `css/style.css` — all styles
- `data/locations.json` — canonical location data
- `data/sf-pops.csv` — source CSV for SF POPS entries (already imported)

**Run locally:** `python3 -m http.server 8080` — required because `fetch()` won't work from `file://` URLs.

## Location Data Schema

Each entry in `data/locations.json` follows this shape:

```json
{
  "id": "unique-kebab-case-id",
  "type": "tree | hotspring | waterfall | pops",
  "name": "Display Name",
  "lat": 37.123,
  "lng": -122.456,
  "description": "One or more sentences describing the place.",
  "location": "City or region, County/State",
  "source": "https://...",
  "tags": ["tag1", "tag2"]
}
```

- `source` may be omitted if there is no URL
- `tags` are lowercase kebab-case strings; keep them consistent across similar entries

## Adding a New Location Type

When adding a new `type`, update all of the following:

1. **`js/app.js`**
   - Add a `<type>Svg(active)` function modeled after `treeSvg`, `hotspringSvg`, etc. — same SVG pin shape, emoji or white SVG icon inside
   - Wire it into `createMarkerIcon()`
   - Handle the new type in `populatePanel()` (badge text + class, source link class)
   - Handle it in the search dropdown (`li.className`, `icon`)

2. **`index.html`** — add a `<button class="filter-btn" data-filter="<type>">` to the filter bar

3. **`css/style.css`** — add:
   - `.filter-btn[data-filter="<type>"].is-active` — active button color
   - `#type-badge.badge-<type>` — panel badge colors
   - `#search-results li.result-<type>` — left border + background tint
   - `#search-results li.result-<type>:hover, ...is-focused` — hover state

## Coding Conventions

- No build step — keep everything in vanilla JS; no imports, no modules
- Keep `app.js` as a single file; don't split into modules
- Mobile responsiveness is required — test at ~390px width
- Marker SVGs use a 36×44 viewBox with the pin path: `M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z`
- Active marker colors are darker shades of their default fill
- Don't add comments unless the logic is non-obvious
