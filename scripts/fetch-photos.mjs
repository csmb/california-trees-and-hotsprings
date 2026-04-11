#!/usr/bin/env node

/**
 * fetch-photos.mjs
 *
 * One-time script to enrich data/locations.json with Wikimedia Commons photos.
 * Strategy: Wikipedia article image first, Commons search fallback.
 * No API key required. Rate-limited to be polite to Wikimedia servers.
 *
 * Usage: node scripts/fetch-photos.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'data', 'locations.json');
const THUMB_WIDTH = 400;
const DELAY_MS = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Wikipedia: get the article's main image ---

async function getWikipediaImage(name) {
  const params = new URLSearchParams({
    action: 'query',
    titles: name,
    prop: 'pageimages|pageprops',
    pithumbsize: THUMB_WIDTH,
    redirects: '1',
    format: 'json',
    origin: '*',
  });
  const url = `https://en.wikipedia.org/w/api.php?${params}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query?.pages;
  if (!pages) return null;

  for (const page of Object.values(pages)) {
    if (page.missing !== undefined) continue;
    if (!page.thumbnail?.source) continue;
    // Skip SVG/GIF thumbnails
    const src = page.thumbnail.source;
    if (/\.(svg|gif)/i.test(src)) continue;
    // Skip tiny images (icons, logos)
    if (page.thumbnail.width < 100 || page.thumbnail.height < 80) continue;
    return {
      thumbUrl: src,
      filename: page.pageimage,
    };
  }
  return null;
}

// --- Commons: search for a photo by query string ---

async function searchCommonsImage(query) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6', // File namespace
    gsrsearch: query,
    gsrlimit: '5',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(THUMB_WIDTH),
    format: 'json',
    origin: '*',
  });
  const url = `https://commons.wikimedia.org/w/api.php?${params}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query?.pages;
  if (!pages) return null;

  // Sort by search index (lower = more relevant)
  const sorted = Object.values(pages).sort((a, b) => (a.index || 0) - (b.index || 0));

  for (const page of sorted) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    // Skip non-image MIME types
    if (!info.mime?.startsWith('image/')) continue;
    // Skip SVG and GIF
    if (/svg|gif/i.test(info.mime)) continue;
    // Skip tiny images
    if (info.width < 100 || info.height < 80) continue;
    // Prefer the thumbnail URL
    const thumbUrl = info.thumburl || info.url;
    const filename = page.title?.replace(/^File:/, '') || '';
    const meta = info.extmetadata || {};
    return { thumbUrl, filename, meta };
  }
  return null;
}

// --- Extract attribution from Commons extmetadata ---

async function getAttribution(filename, existingMeta) {
  let meta = existingMeta;

  if (!meta) {
    // Fetch metadata from Commons
    const params = new URLSearchParams({
      action: 'query',
      titles: `File:${filename}`,
      prop: 'imageinfo',
      iiprop: 'extmetadata',
      format: 'json',
      origin: '*',
    });
    const url = `https://commons.wikimedia.org/w/api.php?${params}`;
    const res = await fetch(url);
    if (!res.ok) return 'Wikimedia Commons';
    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return 'Wikimedia Commons';
    const page = Object.values(pages)[0];
    meta = page?.imageinfo?.[0]?.extmetadata;
    if (!meta) return 'Wikimedia Commons';
  }

  // Extract artist (strip HTML tags)
  let artist = meta.Artist?.value || 'Unknown';
  artist = artist.replace(/<[^>]+>/g, '').trim();
  // Truncate very long artist strings
  if (artist.length > 80) artist = artist.slice(0, 77) + '...';

  const license = meta.LicenseShortName?.value || 'CC';

  return `${artist}, ${license}, via Wikimedia Commons`;
}

// --- Build search context by location type ---

function getSearchContext(loc) {
  switch (loc.type) {
    case 'pops':
      return 'San Francisco';
    case 'tree':
      return loc.location || 'California';
    default:
      return 'California';
  }
}

// --- Main ---

async function main() {
  const raw = await readFile(DATA_PATH, 'utf-8');
  const data = JSON.parse(raw);
  const locations = data.locations;

  const stats = { total: locations.length, found: 0, skipped: 0, failed: 0 };
  const byType = {};
  const missing = [];

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];

    // Skip if already has an image
    if (loc.imageUrl) {
      stats.skipped++;
      console.log(`[${i + 1}/${locations.length}] SKIP  ${loc.name} (already has image)`);
      continue;
    }

    let result = null;

    // Strategy 1: Wikipedia article image
    result = await getWikipediaImage(loc.name);
    await sleep(DELAY_MS);

    // Strategy 2: Commons search fallback
    if (!result) {
      const context = getSearchContext(loc);
      const query = `${loc.name} ${context}`;
      const commonsResult = await searchCommonsImage(query);
      if (commonsResult) {
        result = commonsResult;
      }
      await sleep(DELAY_MS);
    }

    if (result) {
      // Get attribution
      const attribution = await getAttribution(result.filename, result.meta);
      await sleep(DELAY_MS);

      loc.imageUrl = result.thumbUrl;
      loc.imageAttribution = attribution;

      stats.found++;
      byType[loc.type] = (byType[loc.type] || 0) + 1;
      console.log(`[${i + 1}/${locations.length}] FOUND ${loc.name}`);
    } else {
      stats.failed++;
      missing.push(`${loc.type}: ${loc.name}`);
      console.log(`[${i + 1}/${locations.length}] MISS  ${loc.name}`);
    }
  }

  // Write back
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Total: ${stats.total}`);
  console.log(`Found: ${stats.found}`);
  console.log(`Skipped (already had image): ${stats.skipped}`);
  console.log(`No image found: ${stats.failed}`);
  console.log('\nBy type:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }
  if (missing.length > 0) {
    console.log(`\nMissing (${missing.length}):`);
    missing.forEach((m) => console.log(`  ${m}`));
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
