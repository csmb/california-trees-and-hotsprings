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
  activeFilter: 'all',
  activeLocationId: null,
};

// ---------------------------------------------------------------------------
// Map init
// ---------------------------------------------------------------------------

const map = L.map('map', {
  center: [37.5, -119.5],
  zoom: 6,
  zoomControl: true,
  attributionControl: true,
});

L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
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
      <!-- steam waves (3 wavy lines) -->
      <path d="M12 9 Q13.5 7 15 9 Q16.5 11 18 9" stroke="white" stroke-width="1.8" fill="none"
            stroke-linecap="round"/>
      <path d="M15.5 13 Q17 11 18.5 13 Q20 15 21.5 13" stroke="white" stroke-width="1.8" fill="none"
            stroke-linecap="round"/>
      <path d="M12 13 Q13.5 11 15 13 Q16.5 15 18 13" stroke="white" stroke-width="1.8" fill="none"
            stroke-linecap="round"/>
      <!-- water pool -->
      <ellipse cx="18" cy="22" rx="7" ry="4" fill="white" opacity="0.9"/>
    </svg>`;
}

function createMarkerIcon(type, isActive) {
  const svg = type === 'tree' ? treeSvg(isActive) : hotspringSvg(isActive);
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
// Filter
// ---------------------------------------------------------------------------

function applyFilter(value) {
  state.activeFilter = value;

  // Update button states
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.filter === value);
  });

  // Show / hide markers
  state.markers.forEach(({ marker, location }) => {
    const visible = value === 'all' || location.type === value;
    if (visible) {
      if (!map.hasLayer(marker)) map.addLayer(marker);
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
      // If this marker's location was active and now hidden, close panel
      if (state.activeLocationId === location.id) closeInfoPanel();
    }
  });
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
  badge.textContent = loc.type === 'tree' ? 'Tree' : 'Hot Spring';
  badge.className = loc.type === 'tree' ? 'badge-tree' : 'badge-hotspring';

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
  sourceEl.className = loc.type === 'hotspring' ? 'hotspring-source' : '';
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
    // Pan so marker is in upper ~35% of screen (panel covers ~65% from bottom)
    const targetPoint = map.project(latlng, map.getZoom());
    const panelH = window.innerHeight * 0.72;
    // shift the map center up by half the visible area above the panel
    const offsetY = -(window.innerHeight * 0.5 - (window.innerHeight - panelH) * 0.5);
    const newPoint = targetPoint.subtract([0, offsetY]);
    map.panTo(map.unproject(newPoint, map.getZoom()), { animate: true, duration: 0.5 });
  } else {
    // Pan so marker is in center of the map area left of the 360px panel
    const targetPoint = map.project(latlng, map.getZoom());
    const panelW = 360;
    const offsetX = panelW / 2;
    const newPoint = targetPoint.subtract([offsetX, 0]);
    map.panTo(map.unproject(newPoint, map.getZoom()), { animate: true, duration: 0.5 });
  }
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
