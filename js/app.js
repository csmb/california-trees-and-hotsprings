/* =============================================================
   California Trees & Hot Springs — app.js
   Leaflet 1.9.4 | CartoDB Voyager tiles | Vanilla JS
   ============================================================= */

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  locations: [],          // raw data from JSON (+ optional Google Doc merge)
  markers: new Map(),     // id → { marker: L.Marker, el: HTMLElement }
  activeFilters: new Set(), // empty = show all
  activeLocationId: null,
  searchQuery: '',
  locationMarker: null,   // L.Marker for user's position dot
  accuracyCircle: null,   // L.Circle showing GPS accuracy radius
  locationWatchId: null,  // geolocation watchPosition handle
};

// ---------------------------------------------------------------------------
// Map init
// ---------------------------------------------------------------------------

const map = L.map('map', {
  center: [37.5, -119.5],
  zoom: 6,
  zoomControl: false,
  attributionControl: true,
});

L.control.zoom({ position: 'bottomleft' }).addTo(map);

L.tileLayer(
  'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  {
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
      '<a href="http://viewfinderpanoramas.org">SRTM</a> | ' +
      'Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> ' +
      '(<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    subdomains: 'abc',
    maxZoom: 17,
  }
).addTo(map);

// Close panel when clicking the map background
map.on('click', () => {
  if (state.activeLocationId !== null) closeInfoPanel();
});

// ---------------------------------------------------------------------------
// SVG marker icons
// ---------------------------------------------------------------------------

function treeSvg(active) {
  const fill = active ? '#1b4332' : '#2d6a4f';
  const shadow = active ? '#1b4332' : '#2d6a4f';
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <!-- pin body -->
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z"
            fill="${fill}" stroke="white" stroke-width="1.5"/>
      <!-- tree: trunk -->
      <rect x="16.5" y="22" width="3" height="5" fill="white" rx="1"/>
      <!-- tree: canopy layers -->
      <polygon points="18,8 25,20 11,20" fill="white"/>
      <polygon points="18,13 24,23 12,23" fill="white"/>
    </svg>`;
}

function hotspringSvg(active) {
  const fill = active ? '#03045e' : '#0077b6';
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <!-- pin body -->
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z"
            fill="${fill}" stroke="white" stroke-width="1.5"/>
      <!-- tub / pool -->
      <rect x="10" y="23" width="16" height="5.5" rx="2.75" fill="white" opacity="0.95"/>
      <!-- steam wisps: 3 S-curves rising from pool -->
      <path d="M13 22 Q11 18 13 15 Q15 12 13 9" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M18 22 Q16 18 18 15 Q20 12 18 9" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M23 22 Q21 18 23 15 Q25 12 23 9" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    </svg>`;
}

function popsSvg(active) {
  const fill = active ? '#713f12' : '#a16207';
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <!-- pin body -->
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z"
            fill="${fill}" stroke="white" stroke-width="1.5"/>
      <text x="18" y="22" text-anchor="middle" dominant-baseline="middle" font-size="17">🏛️</text>
    </svg>`;
}

function waterfallSvg(active) {
  const fill = active ? '#1e3a8a' : '#1d4ed8';
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <!-- pin body -->
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z"
            fill="${fill}" stroke="white" stroke-width="1.5"/>
      <text x="18" y="22" text-anchor="middle" dominant-baseline="middle" font-size="17">💧</text>
    </svg>`;
}

function createMarkerIcon(type, isActive) {
  const svg = type === 'tree' ? treeSvg(isActive)
    : type === 'waterfall' ? waterfallSvg(isActive)
    : type === 'pops' ? popsSvg(isActive)
    : hotspringSvg(isActive);
  return L.divIcon({
    html: `<div class="map-marker${isActive ? ' marker-active' : ''}">${svg}</div>`,
    className: '',
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -44],
  });
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

function addMarkers(locations) {
  locations.forEach(loc => {
    const marker = L.marker([loc.lat, loc.lng], {
      icon: createMarkerIcon(loc.type, false),
      title: loc.name,
      riseOnHover: true,
    }).addTo(map);

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectLocation(loc.id);
    });

    // Store reference to the icon element for active-state swapping
    state.markers.set(loc.id, { marker, location: loc });
  });
}

// ---------------------------------------------------------------------------
// Filter & search visibility
// ---------------------------------------------------------------------------

function isLocationVisible(loc) {
  const filterMatch = state.activeFilters.size === 0 || state.activeFilters.has(loc.type);
  if (!state.searchQuery) return filterMatch;
  const q = state.searchQuery.toLowerCase();
  const searchMatch = loc.name.toLowerCase().includes(q)
    || loc.location.toLowerCase().includes(q)
    || (loc.tags || []).some(t => t.includes(q));
  return filterMatch && searchMatch;
}

function applyFilter(value) {
  if (value === 'all') {
    state.activeFilters.clear();
  } else {
    if (state.activeFilters.has(value)) {
      state.activeFilters.delete(value);
    } else {
      state.activeFilters.add(value);
    }
  }

  // Update button states
  document.querySelector('.filter-btn[data-filter="all"]').classList.toggle('is-active', state.activeFilters.size === 0);
  document.querySelectorAll('.filter-btn:not([data-filter="all"])').forEach(btn => {
    btn.classList.toggle('is-active', state.activeFilters.has(btn.dataset.filter));
  });

  // Show / hide markers
  state.markers.forEach(({ marker, location }) => {
    const visible = isLocationVisible(location);
    if (visible) {
      if (!map.hasLayer(marker)) map.addLayer(marker);
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
      if (state.activeLocationId === location.id) closeInfoPanel();
    }
  });

  // Re-render dropdown in case filter changed results
  renderDropdown(state.searchQuery);
}

// ---------------------------------------------------------------------------
// Info panel
// ---------------------------------------------------------------------------

const panel = document.getElementById('info-panel');
const scrim = document.getElementById('scrim');

function selectLocation(id) {
  // Deactivate previous marker
  if (state.activeLocationId && state.activeLocationId !== id) {
    deactivateMarker(state.activeLocationId);
  }

  state.activeLocationId = id;
  activateMarker(id);

  const entry = state.markers.get(id);
  if (!entry) return;

  populatePanel(entry.location);
  openInfoPanel();
  panMapToMarker(entry.location);
}

function activateMarker(id) {
  const entry = state.markers.get(id);
  if (!entry) return;
  entry.marker.setIcon(createMarkerIcon(entry.location.type, true));
  // Bring to front
  const el = entry.marker.getElement();
  if (el) el.style.zIndex = 9999;
}

function deactivateMarker(id) {
  const entry = state.markers.get(id);
  if (!entry) return;
  entry.marker.setIcon(createMarkerIcon(entry.location.type, false));
  const el = entry.marker.getElement();
  if (el) el.style.zIndex = '';
}

function populatePanel(loc) {
  const badge = document.getElementById('type-badge');
  badge.textContent = loc.type === 'tree' ? 'Tree' : loc.type === 'waterfall' ? 'Waterfall' : loc.type === 'pops' ? 'POPS' : 'Hot Spring';
  badge.className = loc.type === 'tree' ? 'badge-tree' : loc.type === 'waterfall' ? 'badge-waterfall' : loc.type === 'pops' ? 'badge-pops' : 'badge-hotspring';

  document.getElementById('panel-name').textContent = loc.name;
  document.getElementById('panel-location').textContent = loc.location;
  document.getElementById('panel-description').textContent = loc.description;

  // Tags
  const tagsEl = document.getElementById('panel-tags');
  tagsEl.innerHTML = '';
  (loc.tags || []).forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag;
    tagsEl.appendChild(pill);
  });

  // Source link
  const sourceEl = document.getElementById('panel-source');
  sourceEl.href = loc.source || '#';
  sourceEl.className = loc.type === 'hotspring' ? 'hotspring-source' : loc.type === 'waterfall' ? 'waterfall-source' : loc.type === 'pops' ? 'pops-source' : '';
  sourceEl.style.display = loc.source ? 'inline-block' : 'none';
}

function openInfoPanel() {
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  scrim.classList.add('is-visible');
  // Scroll panel to top
  panel.scrollTop = 0;
}

function closeInfoPanel() {
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  scrim.classList.remove('is-visible');

  if (state.activeLocationId) {
    deactivateMarker(state.activeLocationId);
    state.activeLocationId = null;
  }
}

function panMapToMarker(location) {
  const latlng = L.latLng(location.lat, location.lng);
  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    // Center marker in top half of screen (panel covers bottom 50%)
    // Place map center H/4 below the marker so marker lands at 25% from top
    const targetPoint = map.project(latlng, map.getZoom());
    const newPoint = targetPoint.add([0, window.innerHeight * 0.25]);
    map.panTo(map.unproject(newPoint, map.getZoom()), { animate: true, duration: 0.5 });
  } else {
    map.panTo(latlng, { animate: true, duration: 0.5 });
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

function applySearch(query) {
  state.searchQuery = query.trim();
  state.markers.forEach(({ marker, location }) => {
    const visible = isLocationVisible(location);
    if (visible) {
      if (!map.hasLayer(marker)) map.addLayer(marker);
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
      if (state.activeLocationId === location.id) closeInfoPanel();
    }
  });
  renderDropdown(query.trim());
}

function renderDropdown(query) {
  if (!query) {
    searchResults.classList.remove('is-visible');
    searchResults.innerHTML = '';
    return;
  }

  const q = query.toLowerCase();
  const matches = state.locations
    .filter(loc => isLocationVisible(loc))
    .filter(loc =>
      loc.name.toLowerCase().includes(q) ||
      loc.location.toLowerCase().includes(q) ||
      (loc.tags || []).some(t => t.includes(q))
    )
    .slice(0, 8);

  if (matches.length === 0) {
    searchResults.classList.remove('is-visible');
    searchResults.innerHTML = '';
    return;
  }

  searchResults.innerHTML = '';
  matches.forEach(loc => {
    const li = document.createElement('li');
    li.className = loc.type === 'tree' ? 'result-tree' : loc.type === 'waterfall' ? 'result-waterfall' : loc.type === 'pops' ? 'result-pops' : 'result-hotspring';
    li.setAttribute('role', 'option');
    li.setAttribute('tabindex', '-1');
    const icon = loc.type === 'tree' ? '🌲' : loc.type === 'waterfall' ? '💧' : loc.type === 'pops' ? '🏛️' : '♨️';
    li.innerHTML =
      `<div class="result-name"><span class="result-icon">${icon}</span>${escapeHtml(loc.name)}</div>` +
      `<div class="result-location">${escapeHtml(loc.location)}</div>`;
    li.addEventListener('click', () => {
      clearSearch();
      selectLocation(loc.id);
    });
    searchResults.appendChild(li);
  });

  // Position dropdown just below the filter bar (handles mobile two-row height)
  const barBottom = document.getElementById('filter-bar').getBoundingClientRect().bottom;
  searchResults.style.top = (barBottom + 8) + 'px';

  searchResults.classList.add('is-visible');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clearSearch() {
  searchInput.value = '';
  state.searchQuery = '';
  searchResults.classList.remove('is-visible');
  searchResults.innerHTML = '';
  // Restore marker visibility to filter-only state
  state.markers.forEach(({ marker, location }) => {
    const visible = isLocationVisible(location);
    if (visible) {
      if (!map.hasLayer(marker)) map.addLayer(marker);
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    }
  });
}

function handleSearchKeydown(e) {
  const items = searchResults.querySelectorAll('li');
  if (!items.length) return;

  if (e.key === 'Escape') {
    clearSearch();
    searchInput.blur();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[0].focus();
    items[0].classList.add('is-focused');
    return;
  }
}

function handleResultKeydown(e, items, index) {
  if (e.key === 'Escape') {
    clearSearch();
    searchInput.focus();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    items[index].click();
    searchInput.focus();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = items[index + 1];
    if (next) {
      items[index].classList.remove('is-focused');
      next.classList.add('is-focused');
      next.focus();
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = items[index - 1];
    if (prev) {
      items[index].classList.remove('is-focused');
      prev.classList.add('is-focused');
      prev.focus();
    } else {
      items[index].classList.remove('is-focused');
      searchInput.focus();
    }
    return;
  }
}

// Attach keyboard navigation to result items (delegated from the list)
searchResults.addEventListener('keydown', e => {
  const items = Array.from(searchResults.querySelectorAll('li'));
  const index = items.indexOf(e.target);
  if (index !== -1) handleResultKeydown(e, items, index);
});

// Make result items focusable
searchResults.addEventListener('focus', e => {
  if (e.target.tagName === 'LI') e.target.classList.add('is-focused');
}, true);
searchResults.addEventListener('blur', e => {
  if (e.target.tagName === 'LI') e.target.classList.remove('is-focused');
}, true);

// ---------------------------------------------------------------------------
// User location
// ---------------------------------------------------------------------------

function toggleLocate() {
  if (state.locationWatchId !== null) {
    stopLocating();
  } else {
    startLocating();
  }
}

function startLocating(highAccuracy = true) {
  if (!navigator.geolocation) {
    showLocateError('Geolocation is not supported by this browser.');
    return;
  }
  setLocateBtnState('loading');
  state.locationWatchId = navigator.geolocation.watchPosition(
    onLocationUpdate,
    (err) => {
      // Safari often times out with high accuracy; retry without it once
      if (highAccuracy && (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE)) {
        navigator.geolocation.clearWatch(state.locationWatchId);
        state.locationWatchId = null;
        startLocating(false);
      } else {
        onLocationError(err);
      }
    },
    { enableHighAccuracy: highAccuracy, timeout: 20000, maximumAge: 10000 }
  );
}

function stopLocating() {
  if (state.locationWatchId !== null) {
    navigator.geolocation.clearWatch(state.locationWatchId);
    state.locationWatchId = null;
  }
  if (state.locationMarker) { map.removeLayer(state.locationMarker); state.locationMarker = null; }
  if (state.accuracyCircle) { map.removeLayer(state.accuracyCircle); state.accuracyCircle = null; }
  setLocateBtnState('idle');
}

function onLocationUpdate(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const latlng = L.latLng(latitude, longitude);
  const isFirstFix = !state.locationMarker;

  if (state.accuracyCircle) {
    state.accuracyCircle.setLatLng(latlng).setRadius(accuracy);
  } else {
    state.accuracyCircle = L.circle(latlng, {
      radius: accuracy,
      color: '#2979ff',
      fillColor: '#2979ff',
      fillOpacity: 0.1,
      weight: 1,
      opacity: 0.25,
    }).addTo(map);
  }

  if (state.locationMarker) {
    state.locationMarker.setLatLng(latlng);
  } else {
    state.locationMarker = L.marker(latlng, {
      icon: L.divIcon({
        html: '<div class="user-location-dot"><div class="user-location-pulse"></div></div>',
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
      zIndexOffset: 500,
      interactive: false,
    }).addTo(map);
  }

  setLocateBtnState('active');

  // Zoom in to location on the first fix; just pan on subsequent updates
  if (isFirstFix) {
    map.flyTo(latlng, 13);
  }
}

function onLocationError(err) {
  stopLocating();
  setLocateBtnState('error');
  setTimeout(() => setLocateBtnState('idle'), 3000);
  if (err.code === err.PERMISSION_DENIED) {
    showLocateError('Location access denied. Enable it in Settings > Safari > Location.');
  } else if (err.code === err.TIMEOUT) {
    showLocateError('Location timed out. Try again.');
  } else {
    showLocateError('Could not get your location.');
  }
}

function showLocateError(message) {
  const btn = document.getElementById('locate-btn');
  let tip = document.getElementById('locate-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'locate-tip';
    document.body.appendChild(tip);
  }
  tip.textContent = message;
  tip.classList.add('is-visible');
  // Position above the button
  const rect = btn.getBoundingClientRect();
  tip.style.right = (window.innerWidth - rect.right) + 'px';
  tip.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  clearTimeout(tip._hideTimer);
  tip._hideTimer = setTimeout(() => tip.classList.remove('is-visible'), 5000);
}

function setLocateBtnState(s) {
  const btn = document.getElementById('locate-btn');
  btn.dataset.state = s;
  btn.setAttribute('aria-pressed', s === 'active' ? 'true' : 'false');
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
});

// Close button
document.getElementById('close-btn').addEventListener('click', closeInfoPanel);

// Scrim tap to close
scrim.addEventListener('click', closeInfoPanel);

// Search input
searchInput.addEventListener('input', e => applySearch(e.target.value));
searchInput.addEventListener('keydown', handleSearchKeydown);

// Locate button
document.getElementById('locate-btn').addEventListener('click', toggleLocate);

// Clicking outside filter bar closes dropdown
document.addEventListener('click', e => {
  if (!e.target.closest('#filter-bar') && !e.target.closest('#search-results')) {
    if (state.searchQuery) clearSearch();
    else {
      searchResults.classList.remove('is-visible');
      searchResults.innerHTML = '';
    }
  }
});

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadLocations() {
  const res = await fetch('data/locations.json');
  if (!res.ok) throw new Error(`Failed to load locations.json: ${res.status}`);
  const data = await res.json();
  return data.locations || [];
}

/**
 * Attempt to fetch additional entries from a public Google Doc (TSV export).
 * The Google Doc must be published to the web (File → Publish to the web → TSV).
 * Expected TSV columns: id, type, name, lat, lng, description, location, source, tags
 *
 * This silently fails if the doc isn't available yet — the base data still loads.
 */
async function fetchGoogleDocLocations() {
  // Replace this URL with the user's published Google Doc TSV export URL
  const GOOGLE_DOC_URL = null; // e.g. 'https://docs.google.com/spreadsheets/d/SHEET_ID/pub?output=tsv'

  if (!GOOGLE_DOC_URL) return [];

  try {
    const res = await fetch(GOOGLE_DOC_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
    const idx = (col) => headers.indexOf(col);

    return lines.slice(1).map(line => {
      const cols = line.split('\t');
      const get = (col) => (cols[idx(col)] || '').trim();
      const lat = parseFloat(get('lat'));
      const lng = parseFloat(get('lng'));
      if (!get('id') || isNaN(lat) || isNaN(lng)) return null;
      return {
        id: get('id'),
        type: get('type') || 'tree',
        name: get('name'),
        lat,
        lng,
        description: get('description'),
        location: get('location'),
        source: get('source'),
        tags: get('tags') ? get('tags').split(',').map(t => t.trim()) : [],
      };
    }).filter(Boolean);
  } catch {
    // Network error, CORS block, timeout — silently ignore
    return [];
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  try {
    const [baseLocations, docLocations] = await Promise.all([
      loadLocations(),
      fetchGoogleDocLocations(),
    ]);

    // Merge: doc entries override base entries with same id; new ids are appended
    const baseMap = new Map(baseLocations.map(l => [l.id, l]));
    docLocations.forEach(loc => baseMap.set(loc.id, loc));
    state.locations = Array.from(baseMap.values());

    addMarkers(state.locations);
    applyFilter('all'); // initial filter state
  } catch (err) {
    console.error('Failed to initialise map:', err);
    // Show a user-facing error
    const errEl = document.createElement('div');
    errEl.style.cssText =
      'position:fixed;top:80px;left:50%;transform:translateX(-50%);' +
      'background:#fff;padding:16px 24px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.2);' +
      'z-index:2000;font-size:14px;color:#c00;max-width:320px;text-align:center';
    errEl.textContent =
      'Could not load location data. Make sure you\'re running a local server ' +
      '(python3 -m http.server 8080) rather than opening the file directly.';
    document.body.appendChild(errEl);
  }
}

init();
