# 24-Hour California Earthquakes on the Map

**Status:** Shipped
**Date:** 2026-05-03

> **Note:** the original design specified scaled colored circles (radius by magnitude, fill color by recency). During implementation we iterated to a plain pin marker with a ⚡ emoji — same shape and size as waterfall/POPS pins — after seeing the circles in context. This document reflects the shipped design. The commit log preserves the iteration history.

## Goal

Add a layer of recent (past 24h) California earthquakes to the existing California Trees & Hot Springs map, rendered as ⚡ pin markers users can click for details.

## Decisions

| Question | Decision |
|---|---|
| Geographic scope | California earthquakes only, M ≥ 2.5 |
| Visual style | Pin marker matching existing types (36×44 SVG pin, ⚡ emoji inside, warm red-orange `#c1440e` fill). No magnitude scaling. No recency color encoding on the marker. |
| Filter integration | New "Quakes" filter button, **on by default** |
| Data refresh | Fetch once at page load |
| Click behavior | Open existing info panel with quake-specific fields |

## Data Source

- **Feed:** `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson`
- **Format:** GeoJSON `FeatureCollection`. Each feature has `geometry.coordinates: [lng, lat, depth_km]` and `properties` containing `mag`, `place`, `time` (epoch ms), `url` (USGS event page), `title`, etc. Each feature has a top-level `id` (e.g. `"ci40123456"`) — use as the location id.
- **Volume:** ~150 events/day worldwide; typically 5–30 in California.
- **CORS:** USGS feeds are CORS-enabled — fetched directly from the browser.
- **Update cadence (server-side):** every minute. We fetch once per page load.

## California Filter

Padded bounding box, applied client-side after fetch:

- Latitude: **32.0 to 42.5**
- Longitude: **−125.0 to −113.5**

Padding past the strict CA borders (~32.5–42.0, −124.5 to −114.0) catches near-border events in Baja California and western Nevada that get felt in California.

## Visual Design

Standard `L.marker` with a `divIcon` produced by the existing `createMarkerIcon` cache, parallel to waterfalls and POPS:

- **Pin shape:** the same 36×44 teardrop SVG used by every other type
- **Pin fill:** `#c1440e` (warm red-orange — distinct from green trees, blue hot springs, blue waterfalls, amber POPS)
- **Pin fill (active):** `#7c2d12` (darker variant)
- **Stroke:** white, 1.5px (matches other types)
- **Glyph:** ⚡ emoji rendered as SVG `<text>` at font-size 17 (same size as 💧 and 🏛️)
- **Active state:** standard `marker-active` CSS class — `transform: scale(1.25)` + drop-shadow + bring-to-front. Same as every other type.

Magnitude does NOT affect marker size. Recency does NOT affect marker color. Both pieces of information are shown in the info panel description ("Depth: X km · N hours ago") instead.

A new `quakeSvg(active)` helper is added to `js/app.js` alongside `treeSvg`/`hotspringSvg`/`popsSvg`/`waterfallSvg`. The earthquake type is added to the `createMarkerIcon` ternary chain. No earthquake-specific marker creation, activation, or culling code is needed.

## Integration With Existing Systems

Earthquakes piggy-back on the existing location infrastructure by mapping each USGS event to a location-shaped object:

```js
{
  id: feature.id,                      // e.g. "ci40123456"
  type: 'earthquake',
  name: feature.properties.title,      // e.g. "M 3.4 - 8 km E of Anza, CA"
  lat: feature.geometry.coordinates[1],
  lng: feature.geometry.coordinates[0],
  description: '',                     // generated at panel render time
  location: feature.properties.place,  // e.g. "8 km E of Anza, CA"
  source: feature.properties.url,      // USGS event page
  tags: [],
  // earthquake-specific:
  mag: feature.properties.mag,
  depth: feature.geometry.coordinates[2],
  time: feature.properties.time,       // epoch ms
}
```

This means:

- **State:** earthquakes live in `state.locations` and `state.markers` alongside everything else.
- **Filter:** `'earthquake'` is a new value in `state.activeFilters`. Existing `applyFilter` and `isLocationVisible` work unchanged.
- **Search:** existing search matches `name`, `location`, `tags` — so users can search "Anza" or "M 4" naturally.
- **Selection / panel:** `selectLocation(id)` works as-is; `populatePanel` branches on `loc.type === 'earthquake'` to render quake-specific fields.
- **Permalink:** `#<USGS-event-id>` URLs work for free.
- **Marker creation, activation, viewport culling:** all unchanged. Earthquakes go through the same `addMarkers` → `createMarkerIcon` → `activateMarker`/`deactivateMarker` → `refreshViewport` paths as every other type. The only earthquake-specific touch in `createMarkerIcon` is one extra arm on the type ternary that calls `quakeSvg(isActive)`.

## Filter Bar

Add a new button to `index.html`:

```html
<button class="filter-btn" data-filter="earthquake">⚡ Quakes</button>
```

The existing filter system uses `state.activeFilters` where empty = "show all" and any membership = "show only those types". The default is empty (so "All" is active and every type renders). Adding `'earthquake'` to the filter button set means it inherits this behavior unchanged: earthquakes show by default (because empty-set shows everything), and toggling the Quakes button moves between "all types except quakes" and "all types including quakes" via the same code path used by trees/springs/waterfalls/POPS.

No initial-state change needed — the new button is just another toggle.

## Info Panel

Extend `populatePanel(loc)` with an `if (loc.type === 'earthquake')` branch:

- **Badge:** `M ${loc.mag.toFixed(1)}` in a chip with the warm red-orange `#c1440e` background and white text. Static color via the `.badge-quake` CSS rule (no inline styles, no recency encoding).
- **Name (`#panel-name`):** `loc.name` (USGS title, e.g. "M 3.4 - 8 km E of Anza, CA").
- **Location (`#panel-location`):** `loc.location` (USGS `place` field).
- **Description (`#panel-description`):** generated string — `Depth: ${loc.depth.toFixed(1)} km · ${formatTimeAgo(loc.time)}`. New helper `formatTimeAgo(epochMs)` returns "12 minutes ago", "3 hours ago", "yesterday", etc.
- **Hero image:** hidden (`heroEl.style.display = 'none'`).
- **Tags:** empty.
- **Source link:** `loc.source` (USGS event page), label kept as the existing source link.

Search dropdown: add `.result-quake` class and ⚡ icon entry in the existing `renderDropdown` icon ternary.

## Code Structure

New section in `js/app.js`, placed between data-loading and init:

```js
// ---------------------------------------------------------------------------
// Earthquakes (USGS GeoJSON, past 24h, California only)
// ---------------------------------------------------------------------------

const EARTHQUAKE_FEED_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

const CA_BOUNDS = { minLat: 32.0, maxLat: 42.5, minLng: -125.0, maxLng: -113.5 };

function isInCalifornia(lat, lng) { /* bbox check */ }

function formatTimeAgo(epochMs) { /* relative time string */ }

async function fetchEarthquakes() {
  // try/catch with 8s AbortSignal.timeout
  // fetch, filter to CA bbox + drop entries with null/missing geometry or mag
  // map to location-shaped objects (with mag/depth/time as extra fields)
  // returns [] on any error (silent failure, like fetchGoogleDocLocations)
}
```

A new `quakeSvg(active)` helper is added alongside the existing `treeSvg`/`hotspringSvg`/`popsSvg`/`waterfallSvg`. It returns the standard 36×44 pin SVG with `fill: #c1440e` (or `#7c2d12` when active) and a `<text font-size="17">⚡</text>` glyph at the center.

`createMarkerIcon` gains one arm in its type ternary:
```js
const svg = type === 'tree' ? treeSvg(isActive)
  : type === 'waterfall' ? waterfallSvg(isActive)
  : type === 'pops' ? popsSvg(isActive)
  : type === 'earthquake' ? quakeSvg(isActive)
  : hotspringSvg(isActive);
```

`addMarkers`, `activateMarker`, `deactivateMarker`, and `refreshViewport` are unchanged from before this feature — earthquakes flow through them like any other type.

`init()` fetches earthquakes in parallel with the other two sources:
```js
const [baseLocations, docLocations, earthquakes] = await Promise.all([
  loadLocations(),
  fetchGoogleDocLocations(),
  fetchEarthquakes(),
]);
```

Earthquakes are appended to `state.locations` after the merge so they don't accidentally override curated entries with the same id (USGS ids are unique-prefixed; collision is essentially impossible).

## CSS Additions

In `css/style.css`:

- `.filter-btn[data-filter="earthquake"].is-active { background: #c1440e; }`
- `#type-badge.badge-quake { background: #c1440e; color: #fff; }`
- `#search-results li.result-quake` — left border + faint background tint at `#c1440e`, hover state at `0.1` opacity
- No new marker classes needed — earthquakes use the same `.map-marker` / `.marker-active` rules as every other pin type

## Error Handling

- USGS fetch wrapped in `try/catch` with `AbortSignal.timeout(8000)`.
- Failure → log to `console.warn`, return `[]`. Map loads with no quakes; user sees no error UI.
- Same defensive pattern as `fetchGoogleDocLocations`.

## Manual Test Plan

After implementation:

1. Load map at `localhost:8080` — verify some colored circles appear inside California
2. Click a quake circle — info panel opens with magnitude badge, place, depth, time-ago, USGS link
3. Click the USGS link — opens the event page in a new tab
4. Toggle the "Quakes" filter button off — circles disappear; toggle on — circles return
5. Search "Anza" (if there's a recent Anza quake) — appears in dropdown with ⚡ icon, click navigates
6. Resize to 375px width — filter bar wraps cleanly, "Quakes" button reachable, panel still works
7. Drag the panel down on mobile — closes correctly for an earthquake too
8. Block USGS in DevTools network panel and reload — map loads normally, no quakes, no error UI, console warning present
9. Permalink: copy a quake's URL hash, paste in new tab — quake opens directly

## Out Of Scope

- Auto-refresh / polling
- Historical earthquakes (anything > 24h old)
- Worldwide quakes
- Magnitudes below 2.5
- Tsunami warning banner / felt-reports / shakemap overlays
- Quake clustering at low zoom (count is small enough not to need it)
