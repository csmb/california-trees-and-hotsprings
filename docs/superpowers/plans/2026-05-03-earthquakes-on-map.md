# 24-Hour California Earthquakes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a layer of recent (past 24h) California earthquakes (M ≥ 2.5) to the existing map as scaled colored circles users can click for details.

**Architecture:** Earthquakes are fetched once at page load from the USGS GeoJSON feed, filtered to a California bounding box, and stored in `state.locations` as location-shaped objects with `type: 'earthquake'`. They piggy-back on existing filter, search, selection, and info-panel infrastructure. Marker creation diverges (uses `L.circleMarker` instead of `L.marker` with a `divIcon`), and a few touch-points (`addMarkers`, `refreshViewport`, `activateMarker`, `deactivateMarker`, `populatePanel`, `renderDropdown`) gain a small `type === 'earthquake'` branch.

**Tech Stack:** Vanilla JS, Leaflet 1.9.4, USGS GeoJSON feed, static-site (no build, no test framework).

**Spec:** `docs/superpowers/specs/2026-05-03-earthquakes-on-map-design.md`

**Verification approach:** This project has no JS test framework. Each task ends with a manual verification step at `localhost:8080` (started via `python3 -m http.server 8080`) and a commit. Tasks are sized so each leaves the app in a working state.

**Working directory:** `/Users/christopherbunting/Library/Mobile Documents/com~apple~CloudDocs/code/california-trees-and-hotsprings`

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `js/app.js` | Modify | Add earthquake helpers, fetcher, type-aware branches in 6 existing functions, `init()` Promise.all entry |
| `index.html` | Modify | Add `<button data-filter="earthquake">` to filter bar |
| `css/style.css` | Modify | Add `.badge-quake` and `.result-quake` styles |

No new files. The earthquake logic lives in one new section of `app.js` between "Data loading" and "Init" (around line 752 in the current file), plus small branches inserted in existing functions.

---

## Pre-flight

- [ ] **Step 0: Start dev server**

In a separate terminal:
```bash
cd "/Users/christopherbunting/Library/Mobile Documents/com~apple~CloudDocs/code/california-trees-and-hotsprings" && python3 -m http.server 8080
```
Leave it running for the duration. Verify by opening `http://localhost:8080` — the existing map should load with trees, hot springs, etc.

---

## Task 1: Add earthquake helpers and fetcher (no integration yet)

**Files:**
- Modify: `js/app.js` — insert a new section between the "Data loading" section (currently ends around line 750) and the "Init" section (currently starts around line 752).

These are pure functions plus one fetch. Adding them alone changes nothing user-visible — wiring happens in Task 2.

- [ ] **Step 1.1: Add the new "Earthquakes" section to `js/app.js`**

Find the block that ends with `fetchGoogleDocLocations` (the last function before the `// Init` section comment around line 752). Immediately after the closing `}` of `fetchGoogleDocLocations` and its closing comment block, insert:

```js
// ---------------------------------------------------------------------------
// Earthquakes (USGS GeoJSON feed, past 24h, California only)
// ---------------------------------------------------------------------------

const EARTHQUAKE_FEED_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

const CA_BOUNDS = { minLat: 32.0, maxLat: 42.5, minLng: -125.0, maxLng: -113.5 };

function isInCalifornia(lat, lng) {
  return lat >= CA_BOUNDS.minLat && lat <= CA_BOUNDS.maxLat
      && lng >= CA_BOUNDS.minLng && lng <= CA_BOUNDS.maxLng;
}

function quakeColor(ageMs) {
  const hour = 60 * 60 * 1000;
  if (ageMs < hour) return '#dc2626';        // < 1h: red
  if (ageMs < 6 * hour) return '#ea580c';    // 1-6h: orange
  return '#eab308';                           // 6-24h: yellow
}

function quakeRadius(mag) {
  return Math.max(4, Math.min(28, 4 + (mag - 2.5) * 4));
}

function formatTimeAgo(epochMs) {
  const diff = Date.now() - epochMs;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? '' : 's'} ago`;
}

async function fetchEarthquakes() {
  try {
    const res = await fetch(EARTHQUAKE_FEED_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    const features = data.features || [];
    return features
      .filter(f => {
        const [lng, lat] = f.geometry.coordinates;
        return isInCalifornia(lat, lng);
      })
      .map(f => {
        const [lng, lat, depth] = f.geometry.coordinates;
        const p = f.properties;
        return {
          id: f.id,
          type: 'earthquake',
          name: p.title,
          lat,
          lng,
          description: '',
          location: p.place || '',
          source: p.url,
          tags: [],
          mag: p.mag,
          depth,
          time: p.time,
        };
      });
  } catch (err) {
    console.warn('Failed to fetch USGS earthquakes:', err);
    return [];
  }
}
```

- [ ] **Step 1.2: Verify the file still parses**

Reload `http://localhost:8080`. Open the browser DevTools console. The map should still load exactly as before (trees and hot springs visible, no quakes yet). There should be **no console errors**. If there is a SyntaxError, the insertion broke; fix it before proceeding.

- [ ] **Step 1.3: Sanity-check the fetcher in the console**

In the browser DevTools console, run:
```js
fetchEarthquakes().then(qs => console.log('quakes:', qs.length, qs[0]));
```
Expected: a number (likely 5–30) and a sample object with `type: 'earthquake'`, `mag`, `lat`, `lng`, `time`, `source` (USGS URL). If 0 quakes, that's a real possibility for a quiet day — check the raw feed in another tab to confirm.

- [ ] **Step 1.4: Commit**

```bash
git add js/app.js
git commit -m "Add earthquake helpers and USGS feed fetcher"
```

---

## Task 2: Render earthquakes on the map

**Files:**
- Modify: `js/app.js` — add `createEarthquakeMarker`, branch `addMarkers`, branch `refreshViewport`, add a third entry to `Promise.all` in `init`.

After this task, earthquakes appear on the map as colored circles, but clicking them does nothing useful yet.

- [ ] **Step 2.1: Add `createEarthquakeMarker` to the Earthquakes section**

In `js/app.js`, immediately after the `fetchEarthquakes` function added in Task 1, add:

```js
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

- [ ] **Step 2.2: Make `addMarkers` type-aware**

Find the existing `addMarkers` function in `js/app.js` (currently around line 158):

```js
function addMarkers(locations) {
  locations.forEach(loc => {
    const marker = L.marker([loc.lat, loc.lng], {
      icon: createMarkerIcon(loc.type, false),
      title: loc.name,
    });
    marker.addTo(map);

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectLocation(loc.id);
    });

    state.markers.set(loc.id, { marker, location: loc, shown: true });
  });
}
```

Replace it with:

```js
function addMarkers(locations) {
  locations.forEach(loc => {
    const marker = loc.type === 'earthquake'
      ? createEarthquakeMarker(loc)
      : L.marker([loc.lat, loc.lng], {
          icon: createMarkerIcon(loc.type, false),
          title: loc.name,
        });
    marker.addTo(map);

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectLocation(loc.id);
    });

    state.markers.set(loc.id, {
      marker,
      location: loc,
      shown: true,
      cull: loc.type !== 'earthquake',
    });
  });
}
```

- [ ] **Step 2.3: Make `refreshViewport` honor `cull: false`**

Find the existing `refreshViewport` function in `js/app.js` (currently around line 62):

```js
function refreshViewport() {
  const bounds = map.getBounds().pad(0.4);
  state.markers.forEach(entry => {
    const inBounds = bounds.contains([entry.location.lat, entry.location.lng]);
    if (entry.shown && inBounds) {
      if (!map.hasLayer(entry.marker)) map.addLayer(entry.marker);
    } else {
      if (map.hasLayer(entry.marker)) map.removeLayer(entry.marker);
    }
  });
}
```

Replace it with:

```js
function refreshViewport() {
  const bounds = map.getBounds().pad(0.4);
  state.markers.forEach(entry => {
    if (entry.cull === false) {
      // Earthquake markers: skip viewport culling, only honor entry.shown
      if (entry.shown && !map.hasLayer(entry.marker)) map.addLayer(entry.marker);
      if (!entry.shown && map.hasLayer(entry.marker)) map.removeLayer(entry.marker);
      return;
    }
    const inBounds = bounds.contains([entry.location.lat, entry.location.lng]);
    if (entry.shown && inBounds) {
      if (!map.hasLayer(entry.marker)) map.addLayer(entry.marker);
    } else {
      if (map.hasLayer(entry.marker)) map.removeLayer(entry.marker);
    }
  });
}
```

- [ ] **Step 2.4: Wire `fetchEarthquakes` into `init`**

Find the existing `init` function in `js/app.js` (currently around line 756). The `Promise.all` block currently looks like:

```js
const [baseLocations, docLocations] = await Promise.all([
  loadLocations(),
  fetchGoogleDocLocations(),
]);

// Merge: doc entries override base entries with same id; new ids are appended
const baseMap = new Map(baseLocations.map(l => [l.id, l]));
docLocations.forEach(loc => baseMap.set(loc.id, loc));
state.locations = Array.from(baseMap.values());
```

Replace that snippet with:

```js
const [baseLocations, docLocations, earthquakes] = await Promise.all([
  loadLocations(),
  fetchGoogleDocLocations(),
  fetchEarthquakes(),
]);

// Merge: doc entries override base entries with same id; new ids are appended
const baseMap = new Map(baseLocations.map(l => [l.id, l]));
docLocations.forEach(loc => baseMap.set(loc.id, loc));
// Earthquakes append after the merge — USGS ids (e.g. "ci40123456") won't collide
// with curated location ids, but using set() keeps behavior sane if they ever do.
earthquakes.forEach(loc => baseMap.set(loc.id, loc));
state.locations = Array.from(baseMap.values());
```

- [ ] **Step 2.5: Verify earthquakes appear on the map**

Reload `http://localhost:8080`. Expected:
- Map loads with trees/hot springs as before
- Some colored circles (red/orange/yellow) appear inside California — most likely yellow (6–24h old)
- Pan around — circles stay put, don't disappear at edges
- Console: no errors
- If no circles appear: open DevTools, run `state.markers.size` — count should be larger than before. Run `Array.from(state.markers.values()).filter(e => e.location.type === 'earthquake').length` — likely 0–30.

If 0 quakes today (rare but possible), pick the next-magnitude-feed temporarily for testing only:
```js
// Temporary check only — do NOT commit:
fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson')
  .then(r => r.json()).then(d => console.log(d.features.length, 'global'));
```
Confirm the feed itself returns events. If yes, the bbox filter is the suspect; otherwise it's a quiet day.

- [ ] **Step 2.6: Try clicking a circle**

Click an earthquake circle. Expected: nothing visible happens yet (panel may flash with stale content from a previous click, or stay closed). Console may show a TypeError from `populatePanel` trying to read missing fields — that's fine, Task 4 fixes it. As long as **the page doesn't crash**, proceed.

- [ ] **Step 2.7: Commit**

```bash
git add js/app.js
git commit -m "Render USGS earthquakes as scaled colored circles on the map"
```

---

## Task 3: Active state for earthquake markers

**Files:**
- Modify: `js/app.js` — branch `activateMarker` and `deactivateMarker` for circleMarker.

`circleMarker` doesn't have `setIcon` or a DOM element in the same way `L.marker` does. Calling `setIcon` on it throws. We need to use `setStyle` instead.

- [ ] **Step 3.1: Branch `activateMarker`**

Find the existing `activateMarker` function in `js/app.js` (currently around line 242):

```js
function activateMarker(id) {
  const entry = state.markers.get(id);
  if (!entry) return;
  entry.marker.setIcon(createMarkerIcon(entry.location.type, true));
  // Bring to front
  const el = entry.marker.getElement();
  if (el) el.style.zIndex = 9999;
}
```

Replace it with:

```js
function activateMarker(id) {
  const entry = state.markers.get(id);
  if (!entry) return;
  if (entry.location.type === 'earthquake') {
    entry.marker.setStyle({ weight: 3, color: '#111' });
    entry.marker.bringToFront();
    return;
  }
  entry.marker.setIcon(createMarkerIcon(entry.location.type, true));
  // Bring to front
  const el = entry.marker.getElement();
  if (el) el.style.zIndex = 9999;
}
```

- [ ] **Step 3.2: Branch `deactivateMarker`**

Find the existing `deactivateMarker` function in `js/app.js` (currently around line 251):

```js
function deactivateMarker(id) {
  const entry = state.markers.get(id);
  if (!entry) return;
  entry.marker.setIcon(createMarkerIcon(entry.location.type, false));
  const el = entry.marker.getElement();
  if (el) el.style.zIndex = '';
}
```

Replace it with:

```js
function deactivateMarker(id) {
  const entry = state.markers.get(id);
  if (!entry) return;
  if (entry.location.type === 'earthquake') {
    entry.marker.setStyle({ weight: 1.5, color: '#fff' });
    return;
  }
  entry.marker.setIcon(createMarkerIcon(entry.location.type, false));
  const el = entry.marker.getElement();
  if (el) el.style.zIndex = '';
}
```

- [ ] **Step 3.3: Verify active state visually**

Reload `http://localhost:8080`. Click an earthquake circle. Expected:
- The circle's stroke turns dark (`#111`) and thickens to 3px
- It comes to the front above other circles
- Click another quake — the previous one returns to white 1.5px stroke; the new one is highlighted
- Click a tree or hot spring — quake (if any was active) deactivates correctly
- Console: no errors

The info panel content is still wrong/blank — Task 4 fixes that.

- [ ] **Step 3.4: Commit**

```bash
git add js/app.js
git commit -m "Active state for earthquake circle markers via setStyle"
```

---

## Task 4: Info panel renders earthquake details

**Files:**
- Modify: `js/app.js` — branch `populatePanel` for earthquake type. (`formatTimeAgo` was already added in Task 1.)

- [ ] **Step 4.1: Branch `populatePanel` for earthquakes**

Find the existing `populatePanel` function in `js/app.js` (currently around line 259). Insert an early-return earthquake branch at the very top of the function body, **before** the existing `const badge = document.getElementById('type-badge');` line:

```js
function populatePanel(loc) {
  if (loc.type === 'earthquake') {
    const badge = document.getElementById('type-badge');
    badge.textContent = `M ${loc.mag.toFixed(1)}`;
    badge.className = 'badge-quake';
    badge.style.background = quakeColor(Date.now() - loc.time);
    badge.style.color = '#fff';

    document.getElementById('panel-name').textContent = loc.name;
    document.getElementById('panel-location').textContent = loc.location;
    document.getElementById('panel-description').textContent =
      `Depth: ${loc.depth.toFixed(1)} km · ${formatTimeAgo(loc.time)}`;

    // Hide hero image
    document.getElementById('panel-hero').style.display = 'none';
    document.getElementById('panel-image').src = '';

    // Empty tags
    document.getElementById('panel-tags').innerHTML = '';

    // Source link → USGS event page
    const sourceEl = document.getElementById('panel-source');
    sourceEl.href = loc.source || '#';
    sourceEl.className = '';
    sourceEl.style.display = loc.source ? 'inline-block' : 'none';
    return;
  }

  const badge = document.getElementById('type-badge');
  // ... rest of existing function unchanged ...
```

The existing rest of the function (starting with `badge.textContent = loc.type === 'tree' ? 'Tree' : ...`) stays exactly as it is.

**Important:** the non-earthquake branch needs to **clear the inline `background` and `color` styles** the earthquake branch sets on the badge, otherwise switching from a quake to a tree leaves orange. After the existing `badge.className = ...` line in the non-earthquake path, add:

Find this existing line:
```js
  badge.className = loc.type === 'tree' ? 'badge-tree' : loc.type === 'waterfall' ? 'badge-waterfall' : loc.type === 'pops' ? 'badge-pops' : 'badge-hotspring';
```

Immediately after it, add:
```js
  badge.style.background = '';
  badge.style.color = '';
```

- [ ] **Step 4.2: Verify panel renders for earthquakes**

Reload `http://localhost:8080`. Click an earthquake circle. Expected:
- Panel slides in (mobile: bottom sheet; desktop: right sidebar)
- Badge shows e.g. "M 3.4" with a colored background matching the circle (red/orange/yellow)
- Name shows USGS title (e.g. "M 3.4 - 8 km E of Anza, CA")
- Location line shows the place (e.g. "8 km E of Anza, CA")
- Description shows e.g. "Depth: 7.2 km · 3 hours ago"
- "Learn more ↗" link visible — click it, USGS event page opens in new tab
- No hero image
- No tags

Then click a tree marker — verify the green "Tree" badge appears with **no orange background lingering**. Switch back and forth between a quake and a tree several times to confirm the badge style resets cleanly.

- [ ] **Step 4.3: Commit**

```bash
git add js/app.js
git commit -m "Render earthquake details (magnitude, depth, time-ago) in info panel"
```

---

## Task 5: Search dropdown ⚡ icon for earthquakes

**Files:**
- Modify: `js/app.js` — add ⚡ icon and `result-quake` class to the dropdown row builder.

- [ ] **Step 5.1: Update `renderDropdown`**

Find the existing `renderDropdown` function in `js/app.js` (currently around line 359). Find these two lines inside the `matches.forEach(loc => { ... })` loop:

```js
    li.className = loc.type === 'tree' ? 'result-tree' : loc.type === 'waterfall' ? 'result-waterfall' : loc.type === 'pops' ? 'result-pops' : 'result-hotspring';
```
and
```js
    const icon = loc.type === 'tree' ? '🌲' : loc.type === 'waterfall' ? '💧' : loc.type === 'pops' ? '🏛️' : '♨️';
```

Replace those two lines with:

```js
    li.className =
      loc.type === 'tree' ? 'result-tree'
      : loc.type === 'waterfall' ? 'result-waterfall'
      : loc.type === 'pops' ? 'result-pops'
      : loc.type === 'earthquake' ? 'result-quake'
      : 'result-hotspring';
    const icon =
      loc.type === 'tree' ? '🌲'
      : loc.type === 'waterfall' ? '💧'
      : loc.type === 'pops' ? '🏛️'
      : loc.type === 'earthquake' ? '⚡'
      : '♨️';
```

- [ ] **Step 5.2: Verify search shows earthquakes**

Reload `http://localhost:8080`. Find the place name from a recent quake (read it off the panel after clicking a circle). In the search box, type part of that place name (e.g. "Anza"). Expected:
- Dropdown shows the matching earthquake row with the ⚡ icon
- Row has a colored left border (we'll style it in Task 7 — for now it may be plain)
- Click the row — panel opens, map pans

Also try typing "M 3" or similar — earthquakes whose `name` (USGS title) contains "M 3" should appear.

- [ ] **Step 5.3: Commit**

```bash
git add js/app.js
git commit -m "Show earthquakes in search dropdown with lightning icon"
```

---

## Task 6: Add the "Quakes" filter button

**Files:**
- Modify: `index.html` — add the new filter button.

- [ ] **Step 6.1: Add filter button**

In `index.html`, find this block (around line 29):

```html
    <button class="filter-btn" data-filter="pops">
      <span class="filter-icon">🏛️</span> POPS
    </button>
    <div id="search-divider"></div>
```

Insert a new button between the POPS button and the divider:

```html
    <button class="filter-btn" data-filter="pops">
      <span class="filter-icon">🏛️</span> POPS
    </button>
    <button class="filter-btn" data-filter="earthquake">
      <span class="filter-icon">⚡</span> Quakes
    </button>
    <div id="search-divider"></div>
```

- [ ] **Step 6.2: Verify the button works**

Reload `http://localhost:8080`. Expected:
- A "⚡ Quakes" button is visible in the filter bar after POPS
- Earthquakes are visible by default (because `state.activeFilters` is empty = "show all")
- Click "Quakes" → button highlights, all other types hide (because activating one filter switches to "show only this type")
- Click "All" → returns to default, everything shows
- Click "Quakes" again → only quakes; click "Trees" → quakes + trees
- Click "Quakes" again → just trees (quakes hidden)

The active "Quakes" button currently uses the default green (#2d6a4f) highlight — Task 7 colors it properly.

- [ ] **Step 6.3: Commit**

```bash
git add index.html
git commit -m "Add Quakes filter button to filter bar"
```

---

## Task 7: CSS for badge, filter button, search dropdown row

**Files:**
- Modify: `css/style.css` — add `.badge-quake` base style, active-filter-button color for `data-filter="earthquake"`, and `.result-quake` dropdown row style.

- [ ] **Step 7.1: Add active-state color for the Quakes filter button**

In `css/style.css`, find this block (around line 88):

```css
.filter-btn[data-filter="pops"].is-active {
  background: #a16207;
}
```

Immediately after it, add:

```css
.filter-btn[data-filter="earthquake"].is-active {
  background: #c1440e;
}
```

`#c1440e` is a deep warm red-orange — distinct from the POPS amber and visually consistent with the recency colors used on the markers.

- [ ] **Step 7.2: Add badge base style**

In `css/style.css`, find this block (around line 309):

```css
#type-badge.badge-pops {
  background: #fef3c7;
  color: #713f12;
}
```

Immediately after it, add:

```css
#type-badge.badge-quake {
  /* background and color set inline based on event recency */
}
```

(The rule is intentionally empty — the inline styles set in `populatePanel` carry the actual colors. The selector exists so future static styling has a hook.)

- [ ] **Step 7.3: Add search dropdown row style**

In `css/style.css`, find this block (around line 630):

```css
#search-results li.result-pops {
  border-left-color: #a16207;
  background: rgba(161, 98, 7, 0.04);
}

#search-results li.result-pops:hover,
#search-results li.result-pops.is-focused {
  background: rgba(161, 98, 7, 0.1);
}
```

Immediately after it, add:

```css
#search-results li.result-quake {
  border-left-color: #c1440e;
  background: rgba(193, 68, 14, 0.04);
}

#search-results li.result-quake:hover,
#search-results li.result-quake.is-focused {
  background: rgba(193, 68, 14, 0.1);
}
```

- [ ] **Step 7.4: Verify styling**

Reload `http://localhost:8080`. Expected:
- Click "Quakes" filter button → button highlights in deep warm red-orange (#c1440e), not green
- Search for a quake (e.g. "Anza" or part of a place name) → dropdown row has the warm red-orange left border and faint warm tint background; hover deepens the tint
- Open an earthquake info panel → "M 3.4" badge background matches the circle color (red/orange/yellow), text is white

- [ ] **Step 7.5: Commit**

```bash
git add css/style.css
git commit -m "Style earthquake filter button, badge, and search row"
```

---

## Task 8: Full manual test pass

**Files:** none (verification only).

Run the full test plan from the spec. If anything fails, fix it in a follow-up commit before declaring done.

- [ ] **Step 8.1: Desktop end-to-end**

At `http://localhost:8080` in a desktop-width browser window:

1. Map loads with trees, hot springs, and colored quake circles
2. Click a quake circle → info panel opens with M-badge, place, depth, time-ago, USGS link
3. Click the USGS "Learn more ↗" link → opens the event page in a new tab
4. Click another quake → previous deactivates, new one highlights
5. Click a tree → quake deactivates, tree panel opens (green badge, no leftover orange background)
6. Toggle the "Quakes" filter → quakes hide; toggle again → return; click "All" → everything visible
7. Search "Anza" (or another known quake place from step 2) → ⚡ result row with warm border; click → opens
8. Copy the URL hash for an open quake (e.g. `#ci40123456`), paste in a new tab → quake opens directly via permalink

- [ ] **Step 8.2: Mobile responsiveness (375px)**

In DevTools, switch to a 375px-wide responsive view (e.g. iPhone SE). Reload.

1. Filter bar wraps cleanly; "⚡ Quakes" button is reachable on the first row (or wraps cleanly to the same row as other filter buttons)
2. Click an earthquake circle → bottom-sheet panel slides up with all the same fields
3. Drag the panel down → closes correctly
4. Search input on the second row works; ⚡ row visible in dropdown

- [ ] **Step 8.3: Network failure resilience**

In DevTools → Network tab, add a request blocking rule for `earthquake.usgs.gov`. Reload.

1. Map loads normally with trees and hot springs
2. **No** earthquake circles appear
3. **No** error UI shown to user
4. Console shows one `Failed to fetch USGS earthquakes:` warning (from `fetchEarthquakes` catch)
5. Everything else works (filter, search, panel, locate)

Remove the blocking rule when done.

- [ ] **Step 8.4: Edge case — empty feed**

Even if step 8.3 already validated the catch path, run this in the console while the page is loaded normally to confirm the empty-results path:

```js
// Confirms code paths handle 0 earthquakes — does NOT modify the rendered map
const before = state.locations.filter(l => l.type === 'earthquake').length;
console.log('earthquakes loaded:', before);
```

If `before === 0` for a real quiet day, that's the case the code must already be handling — confirmed by step 8.3.

- [ ] **Step 8.5: Confirm no regressions**

A final sweep of pre-existing functionality (each takes a few seconds):

1. Click a tree marker → green panel, hero image (if set), tags, source link with green "Learn more ↗" — same as before
2. Click a hot spring → blue panel, hot-spring source button styling
3. Locate button works (or shows the appropriate permission prompt)
4. Closing the panel via × button, clicking the map background, or scrim tap (mobile) all work

- [ ] **Step 8.6: Final commit (only if any fixes were needed)**

If any step in Task 8 surfaced a bug requiring a code change, commit the fix:
```bash
git add -A
git commit -m "Fix <specific issue> uncovered in manual test pass"
```
If no fixes were needed, skip this step — Task 7 was the last commit.

---

## Out of scope (do NOT implement)

These are explicitly deferred per the spec:

- Auto-refresh / polling
- Historical earthquakes (anything > 24h old)
- Worldwide quakes
- Magnitudes below 2.5
- Tsunami warning banner / felt-reports / shakemap overlays
- Quake clustering at low zoom
