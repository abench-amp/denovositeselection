# AMP Market Opportunity Map

Internal AMP dashboard for market analysis, target-property benchmarking, and portfolio ranking.

## Contents

- `index.html` — app shell (Leaflet map + panels)
- `app.js` — client-side logic (~1600 LOC, no build step)
- `data/` — precomputed JSON for Census/Allergan + Buxton datasets, plus `amp_locations.json` for the 83 AMP pushpins

## Hosting

Pure static site. Deploy to Cloudflare Pages (or any static host). No build, no env vars.

## External dependencies fetched at runtime

- Leaflet 1.9.4 (unpkg)
- topojson-client 3.1.0 (unpkg)
- CARTO dark basemap tiles
- us-atlas counties/states GeoJSON (jsdelivr CDN)
- kjhealy/fips-codes CSV (raw.githubusercontent.com)
- OpenStreetMap Nominatim (for target geocoding)
