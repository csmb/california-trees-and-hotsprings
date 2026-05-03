# 24-Hour California Earthquakes on the Map

**Status:** Approved design, ready for implementation plan
**Date:** 2026-05-03

## Goal

Add a layer of recent (past 24h) California earthquakes to the existing California Trees & Hot Springs map, as scaled colored circles users can click for details.

## Decisions

| Question | Decision |
|---|---|
| Geographic scope | California earthquakes only, M ≥ 2.5 |
| Visual style | Scaled colored circles (USGS convention), color by recency |
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

`L.circleMarker` (zoom-stable pixel radius, unlike `L.circle` which is in meters).

**Radius (px):** `Math.max(4, Math.min(28, 4 + (mag - 2.5) * 4))`
- M2.5 → 4px
- M3.5 → 8px
- M4.5 → 12px
- M5.5 → 16px
- M7+ → 28px (clamped)

**Fill color by event age** (`Date.now() - properties.time`):
- < 1 hour → `#dc2626` (red)
- 1 hour – 6 hours → `#ea580c` (orange)
- 6 hours – 24 hours → `#eab308` (yellow)

**Stroke:** white, weight 1.5, opacity 1
**Fill opacity:** 0.7

**Active state:** when an earthquake circle is selected (matches existing `activateMarker` flow), increase stroke weight to 3 and bring to front. No icon swap — radius/color stay the same.

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
- **Selection / panel:** `selectLocation(id)` works as-is; `populatePanel` branches on `loc.type === 'earthquake'`.
- **Permalink:** `#<USGS-event-id>` URLs work for free.

**Marker creation differs:** earthquakes use `L.circleMarker`, not `L.marker` with a `divIcon`. A new helper `createEarthquakeMarker(loc)` returns the circle marker. `addMarkers` is split or branched so each location type uses the right factory.

**Viewport culling:** disabled for earthquakes — the count is small (≤30) and the circles are cheap to render. The `state.markers` entry for a quake sets a flag (e.g. `cull: false`) that `refreshViewport` checks; earthquake markers are added once and stay until the filter hides them.

## Filter Bar

Add a new button to `index.html`:

```html
<button class="filter-btn" data-filter="earthquake">⚡ Quakes</button>
```

The existing filter system uses `state.activeFilters` where empty = "show all" and any membership = "show only those types". The default is empty (so "All" is active and every type renders). Adding `'earthquake'` to the filter button set means it inherits this behavior unchanged: earthquakes show by default (because empty-set shows everything), and toggling the Quakes button moves between "all types except quakes" and "all types including quakes" via the same code path used by trees/springs/waterfalls/POPS.

No initial-state change needed — the new button is just another toggle.

## Info Panel

Extend `populatePanel(loc)` with an `if (loc.type === 'earthquake')` branch:

- **Badge:** `M ${loc.mag.toFixed(1)}` in a chip whose background uses the same recency color as the circle. New CSS class `.badge-quake` with `background` set inline based on age (or a small helper that returns the color).
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

function quakeColor(ageMs) { /* red/orange/yellow */ }
function quakeRadius(mag) { /* clamped formula */ }
function formatTimeAgo(epochMs) { /* relative time string */ }

async function fetchEarthquakes() {
  // try/catch with 8s AbortSignal.timeout
  // fetch, parse, filter to CA bbox, map to location-shaped objects
  // returns [] on any error (silent failure, like fetchGoogleDocLocations)
}

function createEarthquakeMarker(loc) {
  return L.circleMarker([loc.lat, loc.lng], {
    radius: quakeRadius(loc.mag),
    fillColor: quakeColor(Date.now() - loc.time),
    color: '#fff',
    weight: 1.5,
    fillOpacity: 0.7,
  });
}
```

`addMarkers` becomes type-aware:
```js
function addMarkers(locations) {
  locations.forEach(loc => {
    const marker = loc.type === 'earthquake'
      ? createEarthquakeMarker(loc)
      : L.marker([loc.lat, loc.lng], { icon: createMarkerIcon(loc.type, false), title: loc.name });
    marker.addTo(map);
    marker.on('click', e => { L.DomEvent.stopPropagation(e); selectLocation(loc.id); });
    state.markers.set(loc.id, { marker, location: loc, shown: true, cull: loc.type !== 'earthquake' });
  });
}
```

`refreshViewport` honors `cull: false`:
```js
function refreshViewport() {
  const bounds = map.getBounds().pad(0.4);
  state.markers.forEach(entry => {
    if (entry.cull === false) {
      // earthquake — toggle solely by entry.shown
      if (entry.shown && !map.hasLayer(entry.marker)) map.addLayer(entry.marker);
      if (!entry.shown && map.hasLayer(entry.marker)) map.removeLayer(entry.marker);
      return;
    }
    const inBounds = bounds.contains([entry.location.lat, entry.location.lng]);
    /* existing logic */
  });
}
```

`activateMarker` / `deactivateMarker` need a small branch:
- For earthquakes, change `marker.options.weight` and call `setStyle({ weight: 3 })` / `setStyle({ weight: 1.5 })` instead of `setIcon`.

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

- `.badge-quake` — base chip style; background set inline at render time
- `.result-quake` — search dropdown row accent (subtle warm tint or border)
- No new marker classes needed — `circleMarker` is styled via Leaflet path options

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
