// ═══════════════════════════════════════════════════════
// AMP Market Opportunity Map - Main Application
// ═══════════════════════════════════════════════════════

let map, countyLayer, zipLayer, stateLayer, stateBorderLayer;
let zipData = {}, countyData = {}, countyLookup = {}, stateData = {}, stats = {}, zipCities = {};
let countyGeo = null;
let currentMetric = 'opportunity';
let currentViewLevel = 'states';
let currentDataSource = 'census'; // 'census' or 'buxton'
const COUNTY_ZOOM = 6;
const ZIP_ZOOM = 8;

// Store both datasets
const datasets = {
  census: { zip: {}, county: {}, countyLookup: {}, state: {}, stats: {} },
  buxton: { zip: {}, county: {}, countyLookup: {}, state: {}, stats: {} },
};

// Custom tooltip element
const hoverTip = document.getElementById('hover-tooltip');
function showHoverTip(e, html) {
  hoverTip.innerHTML = html;
  hoverTip.style.left = e.originalEvent.clientX + 'px';
  hoverTip.style.top = e.originalEvent.clientY + 'px';
  hoverTip.classList.add('visible');
}
function moveHoverTip(e) {
  hoverTip.style.left = e.originalEvent.clientX + 'px';
  hoverTip.style.top = e.originalEvent.clientY + 'px';
}
function hideHoverTip() {
  hoverTip.classList.remove('visible');
}

// ─── Color Scales ────────────────────────────────────
const colorScales = {
  opportunity: {
    title: 'Opportunity Score',
    subtitle: 'Potential patients per MedSpa, boosted in dense areas',
    colors: ['#1e293b', '#7f1d1d', '#b91c1c', '#f59e0b', '#22c55e', '#15803d'],
    labels: ['No Data', '\u2605 Very Low', '\u2605\u2605 Low', '\u2605\u2605\u2605 Medium', '\u2605\u2605\u2605\u2605 High', '\u2605\u2605\u2605\u2605\u2605 Very High'],
    getVal: d => d.opp || 0,
    getBreaks: (level) => level === 'county' ? [0, 800, 2600, 18000, 60000] : [0, 660, 1450, 4550, 13800],
    format: (v, level) => {
      if (!v) return '-';
      const breaks = colorScales.opportunity.getBreaks(level || 'county');
      if (v >= breaks[4]) return '\u2605\u2605\u2605\u2605\u2605';
      if (v >= breaks[3]) return '\u2605\u2605\u2605\u2605';
      if (v >= breaks[2]) return '\u2605\u2605\u2605';
      if (v >= breaks[1]) return '\u2605\u2605';
      return '\u2605';
    },
  },
  registeredPatients: {
    title: 'Registered Patients',
    subtitle: 'Alle registered patients residing in area',
    colors: ['#1e293b', '#312e81', '#4338ca', '#6366f1', '#818cf8', '#c7d2fe'],
    labels: ['None', '1-10', '11-50', '51-200', '201-500', '500+'],
    getVal: d => d.rp || 0,
    getBreaks: (level) => level === 'county' ? [0, 50, 200, 1000, 5000] : [0, 10, 50, 200, 500],
    format: v => v ? v.toLocaleString() : '0',
  },
  medspas: {
    title: 'MedSpa Count',
    subtitle: 'Number of MedSpas in area',
    colors: ['#1e293b', '#14532d', '#15803d', '#f59e0b', '#dc2626', '#7f1d1d'],
    labels: ['None', '1', '2-3', '4-8', '9-15', '15+'],
    getVal: d => d.ms || 0,
    getBreaks: (level) => level === 'county' ? [0, 3, 10, 30, 80] : [0, 1, 3, 8, 15],
    format: v => v ? v.toLocaleString() : '0',
  },
  femalePop: {
    get title() { return currentDataSource === 'buxton' ? 'Female Pop 25-64' : 'Female Pop 25-65 (HHI $75k+)'; },
    get subtitle() { return currentDataSource === 'buxton' ? 'Target demographic (Buxton 3-mi radius)' : 'Target demographic population'; },
    colors: ['#1e293b', '#1e3a5f', '#1e40af', '#2563eb', '#60a5fa', '#bfdbfe'],
    labels: ['None', 'Very Low', 'Low', 'Medium', 'High', 'Very High'],
    getVal: d => currentDataSource === 'buxton' ? (d.f2564 || 0) : (d.f7 || 0),
    getBreaks: (level) => level === 'county' ? [0, 1000, 5000, 20000, 80000] : [0, 200, 800, 2500, 8000],
    format: v => v ? v.toLocaleString() : '0',
  },
  penetration: {
    title: 'Market Penetration',
    get subtitle() { return currentDataSource === 'buxton' ? 'Registered patients as % of female 25-64 pop' : 'Registered patients as % of target female pop'; },
    colors: ['#1e293b', '#14532d', '#22c55e', '#fbbf24', '#ef4444', '#7f1d1d'],
    labels: ['No Data', 'Very Low <2%', 'Low 2-5%', 'Medium 5-10%', 'High 10-20%', 'Saturated 20%+'],
    getVal: d => {
      const targetPop = currentDataSource === 'buxton' ? (d.f2564 || 0) : (d.f7 || 0);
      if (!targetPop || targetPop === 0) return 0;
      return ((d.rp || 0) / targetPop) * 100;
    },
    getBreaks: () => [0, 2, 5, 10, 20],
    format: v => v ? v.toFixed(1) + '%' : '-',
  },
  density: {
    title: 'Population Density',
    get subtitle() { return currentDataSource === 'buxton' ? 'Female 25-64 per sq mile (estimated)' : 'Target female pop (HHI $75k+) per sq mile (estimated)'; },
    colors: ['#1e293b', '#1a1a2e', '#16213e', '#0f3460', '#e94560', '#ff2e63'],
    labels: ['No Data', 'Rural', 'Sparse', 'Suburban', 'Urban', 'Dense Urban'],
    getVal: d => d.den || 0,
    getBreaks: (level) => level === 'county' ? [0, 5, 20, 80, 300] : [0, 10, 50, 200, 800],
    format: v => v ? Math.round(v).toLocaleString() + '/sq mi' : '-',
  },
};

function getColor(value, breaks, colors) {
  if (!value || value <= 0) return colors[0];
  for (let i = breaks.length - 1; i >= 0; i--) {
    if (value >= breaks[i]) return colors[i + 1];
  }
  return colors[1];
}

// ─── Tooltip HTML builder ────────────────────────────
function buildTooltipHTML(name, subtitle, data, level) {
  const scale = colorScales[currentMetric];
  const val = data ? scale.getVal(data) : 0;
  let html = `<div class="tt-title">${name}</div>`;
  if (subtitle) html += `<div style="color:#64748b;font-size:11px;margin-bottom:6px">${subtitle}</div>`;
  if (currentDataSource === 'buxton') {
    html += `<div style="color:#7c3aed;font-size:10px;margin-bottom:4px">&#9673; Buxton Data (3-mile radius)</div>`;
  }
  html += `<div class="tt-row"><span class="tt-label">${scale.title}:</span><span class="tt-value">${scale.format(val, level)}</span></div>`;
  if (data) {
    if (currentDataSource === 'buxton') {
      html += `<div class="tt-row"><span class="tt-label">Female 25-64:</span><span class="tt-value">${(data.f2564 || 0).toLocaleString()}</span></div>`;
      html += `<div class="tt-row"><span class="tt-label">HH $75k+:</span><span class="tt-value">${(data.hh75 || 0).toLocaleString()}</span></div>`;
      html += `<div class="tt-row"><span class="tt-label">Median HH Income:</span><span class="tt-value">${data.mi ? '$' + data.mi.toLocaleString() : '-'}</span></div>`;
      html += `<div class="tt-row"><span class="tt-label">Total Population:</span><span class="tt-value">${(data.tp || 0).toLocaleString()}</span></div>`;
    } else {
      html += `<div class="tt-row"><span class="tt-label">Registered Patients:</span><span class="tt-value">${(data.rp || 0).toLocaleString()}</span></div>`;
      html += `<div class="tt-row"><span class="tt-label">MedSpas:</span><span class="tt-value">${(data.ms || 0).toLocaleString()}</span></div>`;
      html += `<div class="tt-row"><span class="tt-label">Female 25-65 ($75k+):</span><span class="tt-value">${(data.f7 || 0).toLocaleString()}</span></div>`;
      if (data.den) {
        html += `<div class="tt-row"><span class="tt-label">Pop Density:</span><span class="tt-value">${Math.round(data.den).toLocaleString()}/sq mi</span></div>`;
      }
      if (data.tp) {
        html += `<div class="tt-row"><span class="tt-label">Total Population:</span><span class="tt-value">${(data.tp || 0).toLocaleString()}</span></div>`;
      }
    }
    if (data.cc) {
      html += `<div class="tt-row"><span class="tt-label">Counties:</span><span class="tt-value">${data.cc}</span></div>`;
    }
  }
  return html;
}

// ─── Data Loading ────────────────────────────────────
async function loadData() {
  const progress = document.getElementById('loading-progress');

  progress.textContent = 'Loading ZIP code data...';
  zipData = await (await fetch('data/zip_data.json')).json();

  progress.textContent = 'Loading county data...';
  countyData = await (await fetch('data/county_data.json')).json();

  progress.textContent = 'Loading county lookup...';
  countyLookup = await (await fetch('data/county_lookup.json')).json();

  progress.textContent = 'Loading state data...';
  stateData = await (await fetch('data/state_data.json')).json();

  progress.textContent = 'Loading city names...';
  zipCities = await (await fetch('data/zip_cities.json')).json();

  progress.textContent = 'Loading statistics...';
  stats = await (await fetch('data/stats.json')).json();

  // Store census data
  datasets.census.zip = zipData;
  datasets.census.county = countyData;
  datasets.census.countyLookup = countyLookup;
  datasets.census.state = stateData;
  datasets.census.stats = stats;

  // Load Buxton data
  progress.textContent = 'Loading Buxton ZIP data...';
  datasets.buxton.zip = await (await fetch('data/buxton_zip_data.json')).json();
  progress.textContent = 'Loading Buxton county data...';
  datasets.buxton.county = await (await fetch('data/buxton_county_data.json')).json();
  progress.textContent = 'Loading Buxton county lookup...';
  datasets.buxton.countyLookup = await (await fetch('data/buxton_county_lookup.json')).json();
  progress.textContent = 'Loading Buxton state data...';
  datasets.buxton.state = await (await fetch('data/buxton_state_data.json')).json();
  progress.textContent = 'Loading Buxton statistics...';
  datasets.buxton.stats = await (await fetch('data/buxton_stats.json')).json();

  progress.textContent = 'Loading county boundaries...';
  const us = await (await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json')).json();

  progress.textContent = 'Loading state boundaries...';
  const usStates = await (await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json')).json();

  progress.textContent = 'Processing boundaries...';
  countyGeo = topojson.feature(us, us.objects.counties);
  const stateGeo = topojson.feature(usStates, usStates.objects.states);

  // Load FIPS mapping
  const fipsText = await (await fetch('https://raw.githubusercontent.com/kjhealy/fips-codes/master/county_fips_master.csv')).text();
  const fipsMap = parseFIPS(fipsText);

  // Compute county areas from GeoJSON for density calculations
  let matched = 0;
  for (const feature of countyGeo.features) {
    const fips = feature.id;
    const fipsInfo = fipsMap[fips];
    if (fipsInfo) {
      const rawName = fipsInfo.county
        .replace(/\s+(County|Parish|Borough|Census Area|Municipality|city|City and Borough)$/i, '')
        .replace(/^St\.\s*/i, 'Saint ')
        .replace(/\bSte\.\s*/i, 'Sainte ')
        .trim();
      // Normalize for lookup: lowercase, strip non-alpha
      const stateNorm = fipsInfo.state.toLowerCase().replace(/[^a-z]/g, '');
      const nameNorm = rawName.toLowerCase().replace(/[^a-z]/g, '');
      const lookupKey = nameNorm + '|' + stateNorm;
      // Also try with "city" suffix for Virginia independent cities / Baltimore City
      const lookupKeyCity = nameNorm + 'city|' + stateNorm;
      const data = countyLookup[lookupKey] || countyLookup[lookupKeyCity];
      // Also match Buxton data
      const buxtonData = datasets.buxton.countyLookup[lookupKey] || datasets.buxton.countyLookup[lookupKeyCity];
      if (buxtonData) {
        feature.properties.buxtonData = buxtonData;
      }
      if (data) {
        feature.properties.data = data;
        feature.properties.name = rawName;
        feature.properties.state = fipsInfo.state;
        // Estimate area and compute density
        const area = estimateArea(feature);
        data.area = area;
        data.den = area > 0 ? (data.f7 || 0) / area : 0;
        // Also update the countyData entry (separate object from lookup)
        const cdKey = data.c + '|' + data.s;
        if (countyData[cdKey]) {
          countyData[cdKey].area = area;
          countyData[cdKey].den = data.den;
        }
        // Copy area/density to buxton county data too
        if (buxtonData) {
          buxtonData.area = area;
          buxtonData.den = area > 0 ? (buxtonData.f2564 || 0) / area : 0;
          const bcdKey = buxtonData.c + '|' + buxtonData.s;
          if (datasets.buxton.county[bcdKey]) {
            datasets.buxton.county[bcdKey].area = area;
            datasets.buxton.county[bcdKey].den = buxtonData.den;
          }
        }
        matched++;
      } else {
        feature.properties.name = rawName;
        feature.properties.state = fipsInfo.state;
      }
    }
  }
  console.log(`Matched ${matched}/${countyGeo.features.length} counties to data`);

  // ── Recompute opportunity scores with density weighting ──
  // Formula: base = targetPop / medspas (or targetPop * 10 if 0 medspas)
  // density factor = log2(1 + density) / log2(1 + medianDensity)
  //   → areas denser than median get a boost, sparse areas get penalized
  // final opp = base * densityFactor, converted to 0-100 percentile

  // 1. Compute density for counties (already have area from GeoJSON)
  for (const key of Object.keys(countyData)) {
    const cd = countyData[key];
    cd.den = cd.area && cd.area > 0 ? (cd.f7 || 0) / cd.area : 0;
  }

  // 2. Compute density for ZIPs (estimate area from total population)
  for (const zip of Object.keys(zipData)) {
    const d = zipData[zip];
    const pop = d.tp || 0;
    const estArea = pop > 50000 ? 15 : pop > 20000 ? 30 : pop > 5000 ? 80 : 200;
    d.den = estArea > 0 ? (d.f7 || 0) / estArea : 0;
  }

  // 3. Find median density across counties for normalization
  const countyDensities = Object.values(countyData).map(c => c.den).filter(v => v > 0).sort((a, b) => a - b);
  const medianDensity = countyDensities[Math.floor(countyDensities.length / 2)] || 1;
  console.log(`Median county density: ${medianDensity.toFixed(1)} target pop/sq mi`);

  // Pre-compute portfolio-wide median pop-per-medspa ratio for imputing
  // MedSpa counts in ZIPs where the source data is missing (null/undefined).
  // This avoids falsely flagging data-gap ZIPs as "0 medspas = huge opportunity."
  const popPerMsRatios = Object.values(zipData)
    .filter(d => d.ms > 0 && (d.f7 || 0) > 0)
    .map(d => (d.f7 || 0) / d.ms)
    .sort((a, b) => a - b);
  const medianPopPerMs = popPerMsRatios[Math.floor(popPerMsRatios.length / 2)] || 1500;

  // 4. Recompute opportunity scores with density weighting
  function computeOpp(d) {
    const pop = d.f7 || 0;
    const den = d.den || 0;
    if (pop === 0) return 0;

    // Distinguish NULL/undefined ms (data gap) from 0 (genuinely no competition).
    //  - If ms is a positive number: base = pop / ms (direct)
    //  - If ms === 0: true "no competition" → 10x bonus (unchanged, historical intent)
    //  - If ms is null/undefined: IMPUTE an estimate using portfolio median pop-per-medspa,
    //    capped at min 1 to avoid divide-by-zero. This gives data-gap ZIPs a
    //    realistic, not inflated, score.
    let base;
    if (typeof d.ms === 'number' && d.ms > 0) {
      base = pop / d.ms;
    } else if (d.ms === 0) {
      base = pop * 10;
    } else {
      // ms is null/undefined — impute
      const imputedMs = Math.max(1, Math.round(pop / medianPopPerMs));
      base = pop / imputedMs;
      d.ms_imputed = imputedMs; // mark so UI can flag if needed
    }

    // Density factor: log scale, normalized to median
    // Dense areas (den >> median) → factor > 1 (boosted)
    // Sparse areas (den << median) → factor < 1 (penalized)
    const densityFactor = Math.log2(1 + den) / Math.log2(1 + medianDensity);

    return Math.round(base * Math.max(densityFactor, 0.1));
  }

  for (const key of Object.keys(countyData)) {
    countyData[key].opp = computeOpp(countyData[key]);
  }
  for (const zip of Object.keys(zipData)) {
    zipData[zip].opp = computeOpp(zipData[zip]);
  }

  // 5. Compute percentile breaks for the new scores
  const zipOpps = Object.values(zipData).map(z => z.opp).filter(v => v > 0).sort((a, b) => a - b);
  const countyOpps = Object.values(countyData).map(c => c.opp).filter(v => v > 0).sort((a, b) => a - b);
  const pct = (arr, p) => arr[Math.floor(arr.length * p / 100)] || 0;

  // Update color scale breaks based on new distribution
  colorScales.opportunity.getBreaks = (level) => {
    const arr = level === 'county' ? countyOpps : zipOpps;
    return [0, pct(arr, 25), pct(arr, 50), pct(arr, 75), pct(arr, 90)];
  };

  console.log('County opp breaks:', colorScales.opportunity.getBreaks('county'));
  console.log('ZIP opp breaks:', colorScales.opportunity.getBreaks('zip'));

  // 5b. Also recompute Buxton opp with density weighting
  // Compute density for Buxton ZIPs
  // ALSO: estimate Female 25-64 with HHI $75k+ (not a native Buxton field).
  //   Method: est_households = tp / 2.5  (US avg persons/household)
  //           income_rate    = min(1, hh75 / est_households)
  //           f2564_75k      = round(f2564 * income_rate)
  //   Assumes income distribution is independent of age/gender — a rough proxy.
  const PERSONS_PER_HH = 2.5;
  for (const zip of Object.keys(datasets.buxton.zip)) {
    const d = datasets.buxton.zip[zip];
    const pop = d.tp || 0;
    const estArea = pop > 50000 ? 15 : pop > 20000 ? 30 : pop > 5000 ? 80 : 200;
    d.den = estArea > 0 ? (d.f2564 || 0) / estArea : 0;
    // Derived: Female 25-64 with HHI $75k+
    if (d.f2564 > 0 && d.tp > 0 && d.hh75 > 0) {
      const estHH = d.tp / PERSONS_PER_HH;
      const incomeRate = Math.min(1, d.hh75 / estHH);
      d.f2564_75k = Math.round(d.f2564 * incomeRate);
      d.f2564_75k_rate = incomeRate;
    } else {
      d.f2564_75k = 0;
    }
  }
  // Buxton county density already computed above during GeoJSON matching
  const buxtonCountyDensities = Object.values(datasets.buxton.county).map(c => c.den || 0).filter(v => v > 0).sort((a, b) => a - b);
  const buxtonMedianDensity = buxtonCountyDensities[Math.floor(buxtonCountyDensities.length / 2)] || 1;

  function computeBuxtonOpp(d) {
    // Pure demographic score: female 25-64 population, density-weighted
    const pop = d.f2564 || 0;
    const den = d.den || 0;
    if (pop === 0) return 0;
    const densityFactor = Math.log2(1 + den) / Math.log2(1 + buxtonMedianDensity);
    return Math.round(pop * Math.max(densityFactor, 0.1));
  }

  // Compute Buxton ZIP opp scores first
  for (const zip of Object.keys(datasets.buxton.zip)) {
    datasets.buxton.zip[zip].opp = computeBuxtonOpp(datasets.buxton.zip[zip]);
  }

  // County opp = average of its ZIP opp scores (avoids double-counting from overlapping 3-mi radii)
  const countyZipOpps = {}; // key -> [opp, opp, ...]
  for (const zip of Object.keys(datasets.buxton.zip)) {
    const d = datasets.buxton.zip[zip];
    if (!d.c || !d.s) continue;
    const key = `${d.c}|${d.s}`;
    if (!countyZipOpps[key]) countyZipOpps[key] = [];
    countyZipOpps[key].push(d.opp);
  }
  for (const key of Object.keys(datasets.buxton.county)) {
    const zipScores = countyZipOpps[key];
    if (zipScores && zipScores.length > 0) {
      datasets.buxton.county[key].opp = Math.round(zipScores.reduce((a, b) => a + b, 0) / zipScores.length);
    } else {
      datasets.buxton.county[key].opp = computeBuxtonOpp(datasets.buxton.county[key]);
    }
  }

  // Recompute Buxton percentile breaks — use same scale for both ZIP and county
  const buxtonZipOpps = Object.values(datasets.buxton.zip).map(z => z.opp).filter(v => v > 0).sort((a, b) => a - b);
  const buxtonCountyOpps = Object.values(datasets.buxton.county).map(c => c.opp).filter(v => v > 0).sort((a, b) => a - b);
  datasets.buxton.stats.zipOppArr = buxtonZipOpps;
  // Use ZIP-level breaks for counties too so colors are consistent across zoom levels
  datasets.buxton.stats.countyOppArr = buxtonZipOpps;

  // Also store census opp arrays for dynamic breaks
  datasets.census.stats.zipOppArr = zipOpps;
  datasets.census.stats.countyOppArr = countyOpps;

  // 6. Compute state density and opp
  for (const key of Object.keys(stateData)) {
    const sd = stateData[key];
    let totalArea = 0;
    for (const ckey of Object.keys(countyData)) {
      const cd = countyData[ckey];
      if (cd.s === key && cd.area) totalArea += cd.area;
    }
    sd.den = totalArea > 0 ? (sd.f7 || 0) / totalArea : 0;
    sd.opp = computeOpp(sd);
  }

  // 7. Compute Buxton state density and opp
  for (const key of Object.keys(datasets.buxton.state)) {
    const sd = datasets.buxton.state[key];
    let totalArea = 0;
    for (const ckey of Object.keys(datasets.buxton.county)) {
      const cd = datasets.buxton.county[ckey];
      if (cd.s === key && cd.area) totalArea += cd.area;
    }
    sd.den = totalArea > 0 ? (sd.f2564 || 0) / totalArea : 0;
    sd.opp = computeBuxtonOpp(sd);
  }

  return { stateGeo };
}

function estimateArea(feature) {
  try {
    // Collect all rings from Polygon or MultiPolygon
    let allRings = [];
    if (feature.geometry.type === 'MultiPolygon') {
      for (const polygon of feature.geometry.coordinates) {
        for (const ring of polygon) allRings.push(ring);
      }
    } else {
      allRings = feature.geometry.coordinates;
    }

    let area = 0;
    let latSum = 0, latCount = 0;
    for (const ring of allRings) {
      if (!ring || !Array.isArray(ring) || ring.length < 3) continue;
      if (!Array.isArray(ring[0])) continue; // skip if not coordinate pairs
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        area += (x2 - x1) * (y2 + y1);
        latSum += y1; latCount++;
      }
    }
    if (latCount === 0) return 0;
    const avgLat = latSum / latCount;
    const lonScale = Math.cos(avgLat * Math.PI / 180) * 69;
    return Math.abs(area / 2) * 69 * lonScale;
  } catch (e) {
    return 0;
  }
}

function parseFIPS(csv) {
  const lines = csv.split('\n');
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const parts = [];
    let field = '', inQ = false;
    for (let j = 0; j < lines[i].length; j++) {
      const c = lines[i][j];
      if (c === '"') inQ = !inQ;
      else if (c === ',' && !inQ) { parts.push(field.trim()); field = ''; }
      else field += c;
    }
    parts.push(field.trim());
    if (parts.length >= 4) {
      const fips = parts[0].padStart(5, '0');
      map[fips] = { county: parts[1], state: parts[3] };
    }
  }
  return map;
}

// ─── Map Initialization ──────────────────────────────
function initMap(stateGeo) {
  map = L.map('map', {
    center: [39.5, -98.5],
    zoom: 4,
    minZoom: 3,
    maxZoom: 14,
    zoomControl: true,
    preferCanvas: true,
  });

  // Labels pane: never blocks events
  map.createPane('labelsPane');
  map.getPane('labelsPane').style.zIndex = 650;
  map.getPane('labelsPane').style.pointerEvents = 'none';

  // Dark tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);

  // Labels (never blocks)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19, pane: 'labelsPane'
  }).addTo(map);

  // County choropleth (canvas rendered - main interactive layer)
  countyLayer = L.geoJSON(countyGeo, {
    style: countyStyle,
    onEachFeature: onEachCounty,
  }).addTo(map);

  // Interactive state layer with SVG (for state-level zoom hover)
  stateLayer = L.geoJSON(stateGeo, {
    renderer: L.svg(),
    style: { color: '#475569', weight: 2, fillOpacity: 0 },
    onEachFeature: onEachState,
  }).addTo(map);

  // Non-interactive state borders (shown at county/ZIP zoom for visual reference)
  stateBorderLayer = L.geoJSON(stateGeo, {
    pane: 'labelsPane',  // in the non-interactive labels pane
    style: { color: '#475569', weight: 2, fillOpacity: 0, interactive: false },
    interactive: false,
  });

  // ZIP circle markers layer group
  zipLayer = L.layerGroup();

  // Zoom/move handlers
  map.on('zoomend', onZoomChange);
  map.on('moveend', onMoveEnd);
  map.on('click', (e) => {
    if (!e.originalEvent._infoClick) {
      document.getElementById('info-panel').classList.remove('visible');
    }
  });

  // Hide tooltip when mouse leaves the map
  map.getContainer().addEventListener('mouseleave', hideHoverTip);

  onZoomChange();
}

// ─── County Layer ────────────────────────────────────
function getActiveData(feature) {
  return currentDataSource === 'buxton' ? feature.properties.buxtonData : feature.properties.data;
}

function countyStyle(feature) {
  const data = getActiveData(feature);
  const scale = colorScales[currentMetric];
  const breaks = scale.getBreaks('county');
  const val = data ? scale.getVal(data) : 0;
  return {
    fillColor: getColor(val, breaks, scale.colors),
    weight: 0.5, color: '#334155', fillOpacity: 0.75,
  };
}

function onEachCounty(feature, layer) {
  const name = feature.properties.name || 'Unknown';
  const state = feature.properties.state || '';

  layer.on({
    mouseover: (e) => {
      const data = getActiveData(feature);
      e.target.setStyle({ weight: 2, color: '#38bdf8', fillOpacity: 0.9 });
      if (map.getZoom() < ZIP_ZOOM) {
        e.target.bringToFront();
        if (map.hasLayer(stateBorderLayer)) stateBorderLayer.bringToFront();
      }
      showHoverTip(e, buildTooltipHTML(`${name} County`, state, data, 'county'));
    },
    mousemove: (e) => moveHoverTip(e),
    mouseout: (e) => {
      countyLayer.resetStyle(e.target);
      hideHoverTip();
    },
    click: (e) => {
      const data = getActiveData(feature);
      e.originalEvent._infoClick = true;
      showInfoPanel(name, state, data, 'county');
      map.setView(e.latlng, Math.max(map.getZoom(), ZIP_ZOOM));
    }
  });
}

// ─── State Layer ─────────────────────────────────────
function onEachState(feature, layer) {
  const name = feature.properties.name || 'Unknown';

  layer.on({
    mouseover: (e) => {
      const activeState = currentDataSource === 'buxton' ? datasets.buxton.state : stateData;
      const data = activeState[name] || null;
      e.target.setStyle({ weight: 3, color: '#38bdf8' });
      e.target.bringToFront();
      showHoverTip(e, buildTooltipHTML(name, null, data, 'state'));
    },
    mousemove: (e) => moveHoverTip(e),
    mouseout: (e) => {
      e.target.setStyle({ weight: 2, color: '#475569' });
      hideHoverTip();
    },
    click: (e) => {
      const activeState = currentDataSource === 'buxton' ? datasets.buxton.state : stateData;
      const data = activeState[name] || null;
      if (data) {
        e.originalEvent._infoClick = true;
        showInfoPanel(name, `${data.cc} counties, ${data.zc} ZIP codes`, data, 'state');
      }
    }
  });
}

// ─── ZIP Layer ───────────────────────────────────────
function renderZipMarkers() {
  zipLayer.clearLayers();
  const bounds = map.getBounds();
  const scale = colorScales[currentMetric];
  const breaks = scale.getBreaks('zip');
  const activeZip = currentDataSource === 'buxton' ? datasets.buxton.zip : zipData;
  let count = 0;

  for (const zip of Object.keys(activeZip)) {
    const d = activeZip[zip];
    if (!d.lat || !d.lng) continue;
    if (!bounds.contains([d.lat, d.lng])) continue;

    const val = scale.getVal(d);
    const color = getColor(val, breaks, scale.colors);
    const radius = getZipRadius(d);

    const marker = L.circleMarker([d.lat, d.lng], {
      radius, fillColor: color,
      color: 'rgba(255,255,255,0.2)', weight: 0.5, fillOpacity: 0.8,
    });

    marker.on('mouseover', (e) => {
      e.target.setStyle({ weight: 2, color: '#38bdf8', fillOpacity: 1, radius: radius + 3 });
      const cityName = zipCities[d.z] || d.c || d.zn || '';
      const stName = d.s || '';
      showHoverTip(e, buildTooltipHTML(`ZIP ${d.z}`, `${cityName}${stName ? ', ' + stName : ''}`, d, 'zip'));
    });
    marker.on('mousemove', (e) => moveHoverTip(e));
    marker.on('mouseout', (e) => {
      e.target.setStyle({ weight: 0.5, color: 'rgba(255,255,255,0.2)', fillOpacity: 0.8, radius });
      hideHoverTip();
    });
    marker.on('click', (e) => {
      e.originalEvent._infoClick = true;
      const cityName = zipCities[d.z] || d.c || d.zn || '';
      const stName = d.s || '';
      showInfoPanel(`ZIP ${d.z}`, `${cityName}${stName ? ', ' + stName : ''}`, d, 'zip');
    });

    zipLayer.addLayer(marker);
    count++;
  }
}

function getZipRadius(d) {
  const pop = currentDataSource === 'buxton' ? (d.f2564 || 0) : (d.f7 || 0);
  const zoom = map.getZoom();
  const base = zoom >= 12 ? 8 : zoom >= 10 ? 6 : 4;
  if (pop > 8000) return base + 5;
  if (pop > 2500) return base + 3;
  if (pop > 800) return base + 1;
  return base;
}

// ─── Zoom/View Management ────────────────────────────
function onZoomChange() {
  const zoom = map.getZoom();
  let newLevel;

  if (zoom >= ZIP_ZOOM) {
    newLevel = 'zip';
    // Remove interactive state layer, show non-interactive borders
    if (map.hasLayer(stateLayer)) map.removeLayer(stateLayer);
    if (!map.hasLayer(stateBorderLayer)) stateBorderLayer.addTo(map);
    // Keep county layer fully interactive (slightly dimmed fill but hoverable)
    if (!map.hasLayer(countyLayer)) countyLayer.addTo(map);
    countyLayer.setStyle(countyStyle);
    // ZIP markers on top
    if (!map.hasLayer(zipLayer)) zipLayer.addTo(map);
    renderZipMarkers();
  } else if (zoom >= COUNTY_ZOOM) {
    newLevel = 'counties';
    // Remove interactive state layer, show non-interactive borders
    if (map.hasLayer(stateLayer)) map.removeLayer(stateLayer);
    if (!map.hasLayer(stateBorderLayer)) stateBorderLayer.addTo(map);
    // Remove ZIP markers
    if (map.hasLayer(zipLayer)) { zipLayer.clearLayers(); map.removeLayer(zipLayer); }
    // Show counties with full interactivity
    if (!map.hasLayer(countyLayer)) countyLayer.addTo(map);
    countyLayer.setStyle(countyStyle);
  } else {
    newLevel = 'states';
    // Show interactive state layer, remove non-interactive borders
    if (map.hasLayer(stateBorderLayer)) map.removeLayer(stateBorderLayer);
    if (!map.hasLayer(stateLayer)) stateLayer.addTo(map);
    // Remove ZIP markers
    if (map.hasLayer(zipLayer)) { zipLayer.clearLayers(); map.removeLayer(zipLayer); }
    // Show counties underneath states
    if (!map.hasLayer(countyLayer)) countyLayer.addTo(map);
    countyLayer.setStyle(countyStyle);
  }

  hideHoverTip();

  if (newLevel !== currentViewLevel) {
    currentViewLevel = newLevel;
    document.getElementById('view-level').textContent =
      newLevel === 'zip' ? 'ZIP Codes' : newLevel === 'counties' ? 'Counties' : 'States';
    updateLegend();
  }
}

function onMoveEnd() {
  if (map.getZoom() >= ZIP_ZOOM) renderZipMarkers();
}

// ─── Legend ───────────────────────────────────────────
function updateLegend() {
  const scale = colorScales[currentMetric];
  const legendTitle = document.getElementById('legend-title');
  const legendSubtitle = document.getElementById('legend-subtitle');
  const container = document.getElementById('legend-items');

  if (currentDataSource === 'buxton') {
    legendTitle.textContent = 'Buxton Demographics';
    legendSubtitle.textContent = 'Female 25-64 population (3-mi radius), density-weighted';
  } else {
    legendTitle.textContent = scale.title;
    legendSubtitle.textContent = scale.subtitle;
  }

  container.innerHTML = '';
  for (let i = 0; i < scale.colors.length; i++) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-swatch" style="background:${scale.colors[i]}"></div><span>${scale.labels[i]}</span>`;
    container.appendChild(item);
  }
}

// ─── Info Panel ──────────────────────────────────────
function showInfoPanel(title, subtitle, data, level) {
  const panel = document.getElementById('info-panel');
  document.getElementById('info-title').textContent = title;
  document.getElementById('info-subtitle').textContent = subtitle;

  const body = document.getElementById('info-body');
  if (!data) {
    body.innerHTML = '<p style="color:#64748b">No data available for this area.</p>';
    panel.classList.add('visible');
    return;
  }

  const opp = data.opp || 0;
  const isBuxton = currentDataSource === 'buxton';
  const pop = isBuxton ? (data.f2564 || 0) : (data.f7 || 0);
  const ms = data.ms || 0;
  const den = data.den || 0;
  const popPerMs = ms > 0 ? Math.round(pop / ms) : null;

  // Use dynamic breaks for classification
  const breaks = colorScales.opportunity.getBreaks(level === 'zip' ? 'zip' : 'county');
  const oppClass = isBuxton
    ? (opp >= breaks[3] ? 'high' : opp >= breaks[1] ? 'medium' : 'low')
    : (opp >= breaks[3] ? 'high' : opp >= breaks[1] ? 'medium' : 'low');
  let oppLabel, oppStars;
  if (isBuxton) {
    oppLabel = opp >= breaks[3] ? 'High Density' : opp >= breaks[1] ? 'Medium Density' : 'Low Density';
    oppStars = '';
  } else {
    const starCount = opp >= breaks[4] ? 5 : opp >= breaks[3] ? 4 : opp >= breaks[2] ? 3 : opp >= breaks[1] ? 2 : 1;
    const filled = '\u2605'.repeat(starCount);
    const empty = '<span style="opacity:0.25">' + '\u2605'.repeat(5 - starCount) + '</span>';
    oppStars = filled + empty;
    const starLabels = ['Very Low Opportunity', 'Low Opportunity', 'Medium Opportunity', 'High Opportunity', 'Very High Opportunity'];
    oppLabel = starLabels[starCount - 1];
  }

  // Build human-readable explanation
  let oppExplain = '';
  if (isBuxton) {
    if (pop > 0) {
      oppExplain = `${pop.toLocaleString()} women 25-64 in 3-mi radius`;
    } else {
      oppExplain = 'No target population data';
    }
    if (den > 0) {
      const denLabel = den >= 200 ? 'dense urban' : den >= 50 ? 'urban' : den >= 10 ? 'suburban' : 'rural';
      oppExplain += ` (${denLabel} area)`;
    }
  } else {
    if (popPerMs !== null) {
      oppExplain = `${popPerMs.toLocaleString()} potential patients per MedSpa`;
    } else if (pop > 0) {
      oppExplain = `${pop.toLocaleString()} potential patients, no MedSpas`;
    } else {
      oppExplain = 'No target population data';
    }
    if (den > 0) {
      const denLabel = den >= 200 ? 'dense urban' : den >= 50 ? 'urban' : den >= 10 ? 'suburban' : 'rural';
      oppExplain += ` (${denLabel} area)`;
    }
  }

  let html = '';
  if (isBuxton) {
    html += `<div style="background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.3);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11px;color:#a78bfa">
      <strong>&#9673; Buxton Data</strong> &mdash; Demographics within 3-mile radius
    </div>`;
  }

  html += `
    <div style="margin-bottom:16px">
      <span class="opp-badge ${oppClass}">${oppStars ? oppStars + ' ' : '&#9679; '}${oppLabel}</span>
      <div style="color:#94a3b8;font-size:11px;margin-top:6px">${oppExplain}</div>
    </div>`;

  if (isBuxton) {
    // Buxton info panel — pure demographics, no competition data
    html += `
    <div class="info-section">
      <h5>&#9733; Demographics</h5>
      <div class="info-grid">
        <div class="info-stat"><div class="label">Female 25-64</div><div class="value good">${fmt(data.f2564)}</div></div>
        <div class="info-stat"><div class="label">Female 55+</div><div class="value">${fmt(data.f55)}</div></div>
        <div class="info-stat"><div class="label">Female 65+</div><div class="value">${fmt(data.f65)}</div></div>
        <div class="info-stat"><div class="label">Total Population</div><div class="value">${fmt(data.tp)}</div></div>
        <div class="info-stat"><div class="label">5-Yr Pop Growth</div><div class="value">${data.pg !== null && data.pg !== undefined ? data.pg + '%' : '-'}</div></div>
      </div>
    </div>

    <div class="info-section">
      <h5>Income &amp; Housing</h5>
      <div class="info-grid">
        <div class="info-stat"><div class="label">Median HH Income</div><div class="value highlight">${data.mi ? '$' + data.mi.toLocaleString() : '-'}</div></div>
        <div class="info-stat"><div class="label">Mean HH Income</div><div class="value">${data.ai ? '$' + data.ai.toLocaleString() : '-'}</div></div>
        <div class="info-stat"><div class="label">HH Income $75k+</div><div class="value">${fmt(data.hh75)}</div></div>
        <div class="info-stat"><div class="label">HH Income $100k+</div><div class="value">${fmt(data.hh100)}</div></div>
        <div class="info-stat"><div class="label">Median Housing Value</div><div class="value">${data.hp ? '$' + data.hp.toLocaleString() : '-'}</div></div>
        <div class="info-stat"><div class="label">5-Yr Housing Value</div><div class="value">${data.hp5 ? '$' + data.hp5.toLocaleString() : '-'}</div></div>
      </div>
    </div>

    <div class="info-section">
      <h5>5-Year Projections</h5>
      <div class="info-grid">
        <div class="info-stat"><div class="label">Female 25-64 (5yr)</div><div class="value">${fmt(data.f2564_5)}</div></div>
        <div class="info-stat"><div class="label">Female 55+ (5yr)</div><div class="value">${fmt(data.f55_5)}</div></div>
        <div class="info-stat"><div class="label">Female 65+ (5yr)</div><div class="value">${fmt(data.f65_5)}</div></div>
      </div>
    </div>`;

    if (level !== 'zip' && (data.cc || data.zc)) {
      html += `
      <div class="info-section">
        <h5>Coverage</h5>
        <div class="info-grid">
          ${data.cc ? `<div class="info-stat"><div class="label">Counties</div><div class="value">${fmt(data.cc)}</div></div>` : ''}
          ${data.zc ? `<div class="info-stat"><div class="label">ZIP Codes</div><div class="value">${fmt(data.zc)}</div></div>` : ''}
        </div>
      </div>`;
    }
  } else {
    // Census/Allergan info panel (original)
    html += `
    <div class="info-section">
      <h5>&#9733; Key Metrics</h5>
      <div class="info-grid">
        <div class="info-stat"><div class="label">Registered Patients</div><div class="value highlight">${fmt(data.rp)}</div></div>
        <div class="info-stat"><div class="label">MedSpas</div><div class="value">${fmt(data.ms)}</div></div>
        <div class="info-stat"><div class="label">Female 25-65 ($75k+)</div><div class="value good">${fmt(data.f7)}</div></div>
        <div class="info-stat"><div class="label">Total Population</div><div class="value">${fmt(data.tp)}</div></div>
        ${data.den ? `<div class="info-stat"><div class="label">Pop Density (target/sq mi)</div><div class="value">${Math.round(data.den).toLocaleString()}</div></div>` : ''}
        ${data.area ? `<div class="info-stat"><div class="label">Area (sq mi)</div><div class="value">${Math.round(data.area).toLocaleString()}</div></div>` : ''}
      </div>
    </div>

    <div class="info-section">
      <h5>Allergan Data</h5>
      <div class="info-grid">
        <div class="info-stat"><div class="label">Unique Visitors</div><div class="value">${fmt(data.uv)}</div></div>
        <div class="info-stat"><div class="label">Impressions</div><div class="value">${fmt(data.imp)}</div></div>
        <div class="info-stat"><div class="label">Visits to MedSpas</div><div class="value">${fmt(data.vtm)}</div></div>
        <div class="info-stat"><div class="label">MedSpas in Alle</div><div class="value">${fmt(data.mia)}</div></div>`;

    if (level === 'zip') {
      html += `
        <div class="info-stat"><div class="label">Visitors/MedSpa</div><div class="value">${fmt(data.vpm)}</div></div>
        <div class="info-stat"><div class="label">Cost Per Click</div><div class="value">${data.cpc ? '$' + data.cpc.toFixed(2) : '-'}</div></div>
        <div class="info-stat"><div class="label">Patients Treated</div><div class="value">${fmt(data.rpt)}</div></div>
        <div class="info-stat"><div class="label">Resident Botox Visits</div><div class="value">${fmt(data.rvb)}</div></div>`;
    } else {
      html += `
        <div class="info-stat"><div class="label">Resident Botox Visits</div><div class="value">${fmt(data.rvb)}</div></div>
        <div class="info-stat"><div class="label">ZIP Codes</div><div class="value">${fmt(data.zc)}</div></div>`;
      if (level === 'state' && data.cc) {
        html += `<div class="info-stat"><div class="label">Counties</div><div class="value">${fmt(data.cc)}</div></div>`;
      }
    }

    html += `</div></div>
    <div class="info-section">
      <h5>Census Demographics</h5>
      <div class="info-grid">
        <div class="info-stat"><div class="label">Female Population</div><div class="value">${fmt(data.fp)}</div></div>
        <div class="info-stat"><div class="label">Female 25-65</div><div class="value">${fmt(data.fa)}</div></div>
        <div class="info-stat"><div class="label">Female 25-65 ($50k+)</div><div class="value">${fmt(data.f5)}</div></div>
        <div class="info-stat"><div class="label">Female 25-65 ($100k+)</div><div class="value">${fmt(data.f1)}</div></div>
        <div class="info-stat"><div class="label">Median HH Income</div><div class="value">${data.mi ? '$' + data.mi.toLocaleString() : '-'}</div></div>
        <div class="info-stat"><div class="label">Avg HH Income</div><div class="value">${data.ai ? '$' + data.ai.toLocaleString() : '-'}</div></div>
        <div class="info-stat"><div class="label">Median Home Price</div><div class="value">${data.hp ? '$' + data.hp.toLocaleString() : '-'}</div></div>`;

    if (level === 'zip') {
      html += `
        <div class="info-stat"><div class="label">Pop Growth</div><div class="value">${data.pg !== null && data.pg !== undefined ? data.pg + '%' : '-'}</div></div>
        <div class="info-stat"><div class="label">5-Yr Pop Forecast</div><div class="value">${data.fpg !== null && data.fpg !== undefined ? data.fpg + '%' : '-'}</div></div>`;
    } else if (level !== 'state') {
      html += `
        <div class="info-stat"><div class="label">5-Yr Pop Forecast</div><div class="value">${data.fpg !== null && data.fpg !== undefined ? data.fpg + '%' : '-'}</div></div>`;
    }
    html += `</div></div>`;

    if (level === 'zip' && (data.ap7 || data.pp7)) {
      html += `
      <div class="info-section">
        <h5>AMP Penetration</h5>
        <div class="info-grid">
          <div class="info-stat"><div class="label">Reg. Patients % (75k+)</div><div class="value">${data.ap7 !== null ? data.ap7 + '%' : '-'}</div></div>
          <div class="info-stat"><div class="label">Reg. Patients % (100k+)</div><div class="value">${data.ap1 !== null ? data.ap1 + '%' : '-'}</div></div>
          <div class="info-stat"><div class="label">Percentile (75k+)</div><div class="value">${data.pp7 !== null ? data.pp7 + '%' : '-'}</div></div>
          <div class="info-stat"><div class="label">Percentile (100k+)</div><div class="value">${data.pp1 !== null ? data.pp1 + '%' : '-'}</div></div>
        </div>
      </div>`;
    }

    if (data.dm) {
      html += `
      <div class="info-section">
        <h5>Territory Info</h5>
        <div class="info-grid">
          <div class="info-stat full"><div class="label">DMA</div><div class="value" style="font-size:12px">${data.dm || '-'}</div></div>
          <div class="info-stat full"><div class="label">Territory</div><div class="value" style="font-size:12px">${data.tr || '-'}</div></div>
          <div class="info-stat"><div class="label">Tier Rank</div><div class="value">${data.ti || '-'}</div></div>
        </div>
      </div>`;
    }
  }

  body.innerHTML = html;
  panel.classList.add('visible');
}

function fmt(v) {
  if (v === null || v === undefined) return '-';
  return Math.round(v).toLocaleString();
}

// ─── Search ──────────────────────────────────────────
function initSearch() {
  const input = document.getElementById('search');
  const results = document.getElementById('search-results');
  let timeout;

  input.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.remove('visible'); return; }
      const matches = search(q);
      if (matches.length === 0) { results.classList.remove('visible'); return; }

      results.innerHTML = matches.slice(0, 15).map(m => `
        <div class="search-result" data-type="${m.type}" data-key="${m.key}">
          <div class="name">${m.name}</div>
          <div class="meta">${m.meta}</div>
        </div>
      `).join('');
      results.classList.add('visible');

      results.querySelectorAll('.search-result').forEach(el => {
        el.addEventListener('click', () => {
          const type = el.dataset.type;
          const key = el.dataset.key;
          const activeZip = currentDataSource === 'buxton' ? datasets.buxton.zip : zipData;
          const activeCounty = currentDataSource === 'buxton' ? datasets.buxton.county : countyData;
          if (type === 'zip' && activeZip[key]) {
            const d = activeZip[key];
            if (d.lat && d.lng) {
              map.setView([d.lat, d.lng], 11);
              const cityName = zipCities[d.z] || d.c || d.zn || '';
              const stName = d.s || '';
              showInfoPanel(`ZIP ${d.z}`, `${cityName}${stName ? ', ' + stName : ''}`, d, 'zip');
            }
          } else if (type === 'county') {
            const d = activeCounty[key];
            if (d) {
              const dataProp = currentDataSource === 'buxton' ? 'buxtonData' : 'data';
              const feature = countyGeo.features.find(f => f.properties[dataProp] && f.properties[dataProp].c === d.c && f.properties[dataProp].s === d.s);
              if (feature) {
                const bounds = L.geoJSON(feature).getBounds();
                map.fitBounds(bounds, { padding: [50, 50] });
              }
              showInfoPanel(`${d.c} County`, d.s, d, 'county');
            }
          }
          results.classList.remove('visible');
          input.value = '';
        });
      });
    }, 200);
  });

  input.addEventListener('blur', () => setTimeout(() => results.classList.remove('visible'), 200));
}

function search(q) {
  const matches = [];
  const activeZip = currentDataSource === 'buxton' ? datasets.buxton.zip : zipData;
  const activeCounty = currentDataSource === 'buxton' ? datasets.buxton.county : countyData;
  const isBuxton = currentDataSource === 'buxton';

  if (/^\d/.test(q)) {
    for (const zip of Object.keys(activeZip)) {
      if (zip.startsWith(q)) {
        const d = activeZip[zip];
        const popLabel = isBuxton ? `F25-64: ${fmt(d.f2564)}` : `Pop: ${fmt(d.f7)}`;
        const loc = d.c ? `${d.c}, ${d.s}` : (d.zn || '');
        matches.push({ type: 'zip', key: zip, name: `ZIP ${zip}`, meta: `${loc} | ${popLabel} | MedSpas: ${fmt(d.ms)}` });
        if (matches.length >= 15) break;
      }
    }
  }
  for (const key of Object.keys(activeCounty)) {
    const d = activeCounty[key];
    if (d.c && d.c.toLowerCase().includes(q) || d.s && d.s.toLowerCase().includes(q)) {
      const popLabel = isBuxton ? `F25-64: ${fmt(d.f2564)}` : `Pop: ${fmt(d.f7)}`;
      matches.push({ type: 'county', key, name: `${d.c} County`, meta: `${d.s} | ${popLabel} | MedSpas: ${fmt(d.ms)}` });
      if (matches.length >= 15) break;
    }
  }
  return matches;
}

// ─── Metric Selector ─────────────────────────────────
function initMetricSelector() {
  document.querySelectorAll('.metric-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('.metric-btn.active').classList.remove('active');
      btn.classList.add('active');
      currentMetric = btn.dataset.metric;
      updateLegend();
      if (map.hasLayer(countyLayer)) countyLayer.setStyle(countyStyle);
      if (map.getZoom() >= ZIP_ZOOM) renderZipMarkers();
    });
  });
}

// ─── Data Source Toggle ─────────────────────────────
function switchDataSource(source) {
  if (source === currentDataSource) return;
  currentDataSource = source;

  // Update toggle buttons
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.source === source);
  });

  // Show/hide metric selector based on data source
  const metricSelector = document.querySelector('.metric-selector');
  if (source === 'buxton') {
    metricSelector.style.display = 'none';
    // Force to opportunity metric for Buxton (single summary view)
    currentMetric = 'opportunity';
  } else {
    metricSelector.style.display = 'flex';
  }

  // Update opportunity breaks for the active dataset
  const ds = datasets[source];
  if (ds.stats.zipOppArr && ds.stats.countyOppArr) {
    const pctFn = (arr, p) => arr[Math.floor(arr.length * p / 100)] || 0;
    colorScales.opportunity.getBreaks = (level) => {
      const arr = level === 'county' ? ds.stats.countyOppArr : ds.stats.zipOppArr;
      return [0, pctFn(arr, 25), pctFn(arr, 50), pctFn(arr, 75), pctFn(arr, 90)];
    };
  }

  // Re-render everything
  updateLegend();
  if (map.hasLayer(countyLayer)) countyLayer.setStyle(countyStyle);
  if (map.getZoom() >= ZIP_ZOOM) renderZipMarkers();

  // Close info panel on switch
  document.getElementById('info-panel').classList.remove('visible');
  hideHoverTip();
}

function initDataToggle() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => switchDataSource(btn.dataset.source));
  });
}

// ─── AMP Locations Layer ─────────────────────────────
let ampLocations = [];
let ampLayer = null;
let ampVisible = false;
const brandFilter = new Set();
const classFilter = new Set();

// Stable color per brand (hash-based)
function brandColor(brand) {
  let h = 0;
  for (let i = 0; i < brand.length; i++) h = (h * 31 + brand.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

function makePinIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
    <path d="M12 0 C5.4 0 0 5.4 0 12 C0 21 12 32 12 32 S24 21 24 12 C24 5.4 18.6 0 12 0 Z"
      fill="${color}" stroke="#0f172a" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4.5" fill="#0f172a"/>
  </svg>`;
  return L.divIcon({
    className: 'amp-pin-icon',
    html: svg,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
    popupAnchor: [0, -30],
  });
}

async function loadAmpLocations() {
  try {
    const res = await fetch('data/amp_locations.json');
    ampLocations = await res.json();
  } catch (e) {
    console.error('Failed to load AMP locations:', e);
    ampLocations = [];
  }
}

function getVisibleLocations() {
  return ampLocations.filter(l =>
    brandFilter.has(l.brand) && classFilter.has(l.classification)
  );
}

function renderAmpLayer() {
  if (!ampLayer) ampLayer = L.layerGroup();
  ampLayer.clearLayers();
  if (!ampVisible) {
    if (map.hasLayer(ampLayer)) map.removeLayer(ampLayer);
    return;
  }
  const visible = getVisibleLocations();
  visible.forEach(loc => {
    const marker = L.marker([loc.lat, loc.lng], {
      icon: makePinIcon(brandColor(loc.brand)),
      zIndexOffset: 1000,
    });
    marker.on('mouseover', (e) => {
      let precisionNote = '';
      if (loc.geocode_source === 'zip') {
        precisionNote = '<div class="tt-row" style="margin-top:4px;"><span class="tt-label" style="color:#fbbf24;font-size:10px;">&#9888; approx (ZIP centroid)</span></div>';
      } else if (loc.geocode_source === 'manual') {
        precisionNote = '<div class="tt-row" style="margin-top:4px;"><span class="tt-label" style="color:#94a3b8;font-size:10px;">&#9432; manually placed</span></div>';
      }
      const html = `
        <div class="tt-title">${loc.location}</div>
        <div class="tt-row"><span class="tt-label">Brand</span><span class="tt-value">${loc.brand}</span></div>
        <div class="tt-row"><span class="tt-label">Classification</span><span class="tt-value">${loc.classification}</span></div>
        <div class="tt-row"><span class="tt-label">City</span><span class="tt-value">${loc.city}, ${loc.state}</span></div>
        ${precisionNote}`;
      showHoverTip({ originalEvent: e.originalEvent }, html);
    });
    marker.on('mousemove', (e) => moveHoverTip({ originalEvent: e.originalEvent }));
    marker.on('mouseout', hideHoverTip);
    marker.on('click', (e) => {
      e.originalEvent._infoClick = true;
      const panel = document.getElementById('info-panel');
      document.getElementById('info-title').textContent = loc.location;
      document.getElementById('info-subtitle').textContent = `${loc.brand} — ${loc.classification}`;
      document.getElementById('info-body').innerHTML = `
        <div class="info-section">
          <h5>Location</h5>
          <div class="info-grid">
            <div class="info-stat full"><div class="label">Address</div><div class="value" style="font-size:13px;">${loc.address}</div></div>
            <div class="info-stat"><div class="label">City</div><div class="value" style="font-size:14px;">${loc.city}</div></div>
            <div class="info-stat"><div class="label">State / ZIP</div><div class="value" style="font-size:14px;">${loc.state} ${loc.zip}</div></div>
          </div>
        </div>
        <div class="info-section">
          <h5>Classification</h5>
          <div class="info-grid">
            <div class="info-stat full"><div class="label">Brand</div><div class="value highlight" style="font-size:14px;">${loc.brand}</div></div>
            <div class="info-stat full"><div class="label">Type</div><div class="value" style="font-size:14px;">${loc.classification}</div></div>
          </div>
        </div>`;
      panel.classList.add('visible');
    });
    ampLayer.addLayer(marker);
  });
  if (!map.hasLayer(ampLayer)) ampLayer.addTo(map);
}

function buildLocFilterLists() {
  const brands = [...new Set(ampLocations.map(l => l.brand))].sort((a, b) => a.localeCompare(b));
  const classes = [...new Set(ampLocations.map(l => l.classification))].sort();
  brands.forEach(b => brandFilter.add(b));
  classes.forEach(c => classFilter.add(c));

  const brandListEl = document.getElementById('loc-list-brands');
  const classListEl = document.getElementById('loc-list-classifications');

  brandListEl.innerHTML = brands.map(b => {
    const count = ampLocations.filter(l => l.brand === b).length;
    return `
      <label class="loc-item">
        <input type="checkbox" data-brand="${b.replace(/"/g, '&quot;')}" checked>
        <span class="swatch" style="background:${brandColor(b)}"></span>
        <span>${b}</span>
        <span class="count">${count}</span>
      </label>`;
  }).join('');

  classListEl.innerHTML = classes.map(c => {
    const count = ampLocations.filter(l => l.classification === c).length;
    return `
      <label class="loc-item">
        <input type="checkbox" data-class="${c.replace(/"/g, '&quot;')}" checked>
        <span>${c}</span>
        <span class="count">${count}</span>
      </label>`;
  }).join('');

  brandListEl.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.matches('input[data-brand]')) return;
    const brand = t.dataset.brand;
    if (t.checked) brandFilter.add(brand); else brandFilter.delete(brand);
    renderAmpLayer();
  });

  classListEl.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.matches('input[data-class]')) return;
    const cls = t.dataset.class;
    if (t.checked) classFilter.add(cls); else classFilter.delete(cls);
    renderAmpLayer();
  });
}

function initLocControls() {
  const toggleBtn = document.getElementById('loc-toggle-btn');
  const filterBtn = document.getElementById('loc-filter-btn');
  const panel = document.getElementById('loc-panel');
  const closeBtn = document.getElementById('loc-panel-close');

  toggleBtn.addEventListener('click', () => {
    ampVisible = !ampVisible;
    toggleBtn.classList.toggle('on', ampVisible);
    renderAmpLayer();
  });

  filterBtn.addEventListener('click', () => panel.classList.toggle('visible'));
  closeBtn.addEventListener('click', () => panel.classList.remove('visible'));

  // Tab switching
  document.querySelectorAll('.loc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      document.querySelectorAll('.loc-tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.loc-tab-body').forEach(b => {
        b.classList.toggle('active', b.id === `loc-tab-${name}`);
      });
    });
  });

  // Select All / Clear
  document.querySelectorAll('.loc-mini-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;
      const action = btn.dataset.action;
      const attr = group === 'brands' ? 'brand' : 'class';
      const set = group === 'brands' ? brandFilter : classFilter;
      document.querySelectorAll(`input[data-${attr}]`).forEach(cb => {
        cb.checked = (action === 'all');
        const val = cb.dataset[attr];
        if (action === 'all') set.add(val); else set.delete(val);
      });
      renderAmpLayer();
    });
  });
}

// ─── Target Properties Mode ──────────────────────────
const targetProperties = [];
let targetLayer = null;
let dropModeOn = false;
let rankSource = 'census';
let rankSort = { col: 'compositeRank', dir: 'asc' };
const rankBrandFilter = new Set();
const rankClassFilter = new Set();

function makeTargetIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">
    <path d="M15 0 C6.7 0 0 6.7 0 15 C0 26 15 38 15 38 S30 26 30 15 C30 6.7 23.3 0 15 0 Z"
      fill="#ec4899" stroke="#fff" stroke-width="2"/>
    <polygon points="15,6 17.2,11.8 23.5,12.1 18.7,16.2 20.3,22.3 15,18.9 9.7,22.3 11.3,16.2 6.5,12.1 12.8,11.8"
      fill="#fff"/>
  </svg>`;
  return L.divIcon({
    className: 'target-pin-icon',
    html: svg,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
  });
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}

function findNearestZip(lat, lng) {
  let best = null, bestDist = Infinity;
  for (const zip of Object.keys(zipData)) {
    const d = zipData[zip];
    if (!d.lat || !d.lng) continue;
    const dist = (d.lat - lat) ** 2 + (d.lng - lng) ** 2;
    if (dist < bestDist) { bestDist = dist; best = zip; }
  }
  return best;
}

async function geocodeAddress(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'AMP-Internal-Map/1.0 (internal use)' } });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.length) return null;
    const hit = json[0];
    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      display: hit.display_name,
      zip: hit.address?.postcode?.split('-')[0],
    };
  } catch (e) {
    return null;
  }
}

function makeTargetId() {
  return 't_' + Math.random().toString(36).slice(2, 10);
}

function setTargetStatus(msg, type) {
  const el = document.getElementById('target-status');
  el.className = 'target-status' + (type ? ' ' + type : '');
  el.textContent = msg || '';
}

async function addTargetFromLine(raw) {
  const line = raw.trim();
  if (!line) return null;
  const zipOnly = /^\d{5}$/.test(line);
  let lat, lng, zip, name;
  if (zipOnly) {
    zip = line;
    const z = zipData[zip];
    if (!z || !z.lat) return { error: `ZIP ${zip} not found` };
    lat = z.lat; lng = z.lng;
    name = `ZIP ${zip} (${z.c || ''}, ${z.s || ''})`.trim();
  } else {
    const hit = await geocodeAddress(line);
    if (!hit) return { error: `Could not geocode "${line}"` };
    lat = hit.lat; lng = hit.lng;
    zip = hit.zip;
    if (!zip || !zipData[zip]) zip = findNearestZip(lat, lng);
    name = line;
  }
  return { id: makeTargetId(), name, address: line, lat, lng, zip };
}

function addTargetFromClick(lat, lng) {
  const zip = findNearestZip(lat, lng);
  const z = zip ? zipData[zip] : null;
  const name = z ? `Dropped @ ${z.c || ''}, ${z.s || ''} ${zip}` : `Dropped @ (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  const t = { id: makeTargetId(), name, address: '', lat, lng, zip };
  targetProperties.push(t);
  renderTargets();
}

function removeTarget(id) {
  const i = targetProperties.findIndex(t => t.id === id);
  if (i >= 0) { targetProperties.splice(i, 1); renderTargets(); }
}

function clearTargets() {
  targetProperties.length = 0;
  renderTargets();
}

function renderTargets() {
  // Update list
  const listEl = document.getElementById('target-list');
  listEl.innerHTML = targetProperties.map(t => `
    <div class="target-list-item">
      <span class="tname">${t.name}</span>
      <span class="tzip">${t.zip || '?'}</span>
      <button class="tdel" data-id="${t.id}" title="Remove">&times;</button>
    </div>`).join('');
  listEl.querySelectorAll('.tdel').forEach(btn => {
    btn.addEventListener('click', () => removeTarget(btn.dataset.id));
  });

  // Update map layer
  if (!targetLayer) targetLayer = L.layerGroup().addTo(map);
  targetLayer.clearLayers();
  targetProperties.forEach(t => {
    const marker = L.marker([t.lat, t.lng], { icon: makeTargetIcon(), zIndexOffset: 2000 });
    marker.on('mouseover', (e) => {
      const z = t.zip ? zipData[t.zip] : null;
      const html = `
        <div class="tt-title">&#127919; ${t.name}</div>
        <div class="tt-row"><span class="tt-label">Type</span><span class="tt-value">Target</span></div>
        ${t.zip ? `<div class="tt-row"><span class="tt-label">ZIP</span><span class="tt-value">${t.zip}</span></div>` : ''}
        ${z?.opp ? `<div class="tt-row"><span class="tt-label">Opp Score</span><span class="tt-value">${z.opp.toLocaleString()}</span></div>` : ''}`;
      showHoverTip({ originalEvent: e.originalEvent }, html);
    });
    marker.on('mousemove', (e) => moveHoverTip({ originalEvent: e.originalEvent }));
    marker.on('mouseout', hideHoverTip);
    targetLayer.addLayer(marker);
  });

  // Open-table button
  const openBtn = document.getElementById('open-rank-btn');
  openBtn.textContent = `Open Comparison Table (${targetProperties.length})`;
  openBtn.disabled = targetProperties.length === 0;
}

async function processPastedTargets() {
  const textarea = document.getElementById('target-input');
  const text = textarea.value || '';
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) { setTargetStatus('Nothing to add.', 'error'); return; }
  setTargetStatus(`Processing ${lines.length} ${lines.length === 1 ? 'entry' : 'entries'}...`);
  let added = 0, failed = [];
  for (const line of lines) {
    const result = await addTargetFromLine(line);
    if (result && !result.error) {
      targetProperties.push(result);
      added++;
    } else {
      failed.push(line);
    }
    // rate limit Nominatim only when geocoding a non-ZIP line
    if (!/^\d{5}$/.test(line)) await new Promise(r => setTimeout(r, 1100));
  }
  renderTargets();
  textarea.value = '';
  if (failed.length) {
    setTargetStatus(`Added ${added}. Failed: ${failed.join(', ')}`, failed.length === lines.length ? 'error' : 'success');
  } else {
    setTargetStatus(`Added ${added} targets.`, 'success');
  }
}

function toggleDropMode() {
  dropModeOn = !dropModeOn;
  const btn = document.getElementById('target-drop-btn');
  btn.classList.toggle('on', dropModeOn);
  btn.textContent = `${dropModeOn ? '\u{1F4CD}' : '\u{1F4CD}'} Drop on Map: ${dropModeOn ? 'ON' : 'OFF'}`;
  map.getContainer().style.cursor = dropModeOn ? 'crosshair' : '';
}

function initTargetControls() {
  const panel = document.getElementById('target-panel');
  document.getElementById('target-toggle-btn').addEventListener('click', (e) => {
    panel.classList.toggle('visible');
    e.currentTarget.classList.toggle('on', panel.classList.contains('visible'));
  });
  document.getElementById('target-panel-close').addEventListener('click', () => {
    panel.classList.remove('visible');
    document.getElementById('target-toggle-btn').classList.remove('on');
  });
  document.getElementById('target-add-btn').addEventListener('click', processPastedTargets);
  document.getElementById('target-clear-btn').addEventListener('click', () => {
    clearTargets();
    setTargetStatus('Cleared.');
  });
  document.getElementById('target-drop-btn').addEventListener('click', toggleDropMode);
  document.getElementById('open-rank-btn').addEventListener('click', openRankModal);

  // Capture map clicks when drop mode is on
  map.on('click', (e) => {
    if (dropModeOn) {
      addTargetFromClick(e.latlng.lat, e.latlng.lng);
      e.originalEvent._infoClick = true; // don't close info panel
    }
  });
}

// ─── Ranking Table ───────────────────────────────────
function getPropertyData(zip, source) {
  if (!zip) return null;
  const ds = source === 'buxton' ? datasets.buxton.zip : zipData;
  return ds[zip] || null;
}

function buildPropertyRows() {
  // Combine AMP locations + targets into a unified row set
  const rows = [];
  ampLocations.forEach((loc, idx) => {
    rows.push({
      kind: 'amp',
      id: `amp_${idx}_${loc.location}_${loc.zip}`,
      name: loc.location,
      brand: loc.brand,
      classification: loc.classification,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
      lat: loc.lat,
      lng: loc.lng,
    });
  });
  for (const t of targetProperties) {
    rows.push({
      kind: 'target',
      id: t.id,
      name: t.name,
      brand: '—',
      classification: 'Target',
      city: t.zip && zipData[t.zip] ? zipData[t.zip].c : '',
      state: t.zip && zipData[t.zip] ? zipData[t.zip].s : '',
      zip: t.zip,
      lat: t.lat,
      lng: t.lng,
    });
  }
  // Attach ZIP-keyed census + buxton data
  for (const r of rows) {
    r.census = getPropertyData(r.zip, 'census');
    r.buxton = getPropertyData(r.zip, 'buxton');
  }
  return rows;
}

function assignRanks(rows, source) {
  // Composite opp score per source; ascending rank (1 = highest opp).
  const valKey = source === 'buxton' ? 'buxton' : 'census';
  const withScore = rows.map(r => ({
    r,
    score: r[valKey]?.opp || 0,
  }));
  // Rank only among rows that have data
  const sorted = [...withScore].sort((a, b) => b.score - a.score);
  const ranks = new Map();
  sorted.forEach((item, i) => ranks.set(item.r.id, i + 1));
  const total = sorted.length;
  return { ranks, total };
}

function openRankModal() {
  populateRankFilterDropdowns();
  renderRankTable();
  document.getElementById('rank-modal').classList.add('visible');
}

function populateRankFilterDropdowns() {
  const brands = [...new Set(ampLocations.map(l => l.brand))].sort((a, b) => a.localeCompare(b));
  const classes = [...new Set(ampLocations.map(l => l.classification))].sort();
  if (rankBrandFilter.size === 0) brands.forEach(b => rankBrandFilter.add(b));
  if (rankClassFilter.size === 0) classes.forEach(c => rankClassFilter.add(c));

  const brandListEl = document.getElementById('rank-brand-list');
  const classListEl = document.getElementById('rank-class-list');

  brandListEl.innerHTML = brands.map(b => {
    const count = ampLocations.filter(l => l.brand === b).length;
    const esc = b.replace(/"/g, '&quot;');
    return `<label class="rank-multi-item">
      <input type="checkbox" data-brand="${esc}" ${rankBrandFilter.has(b) ? 'checked' : ''}>
      <span>${b}</span>
      <span class="rcount">${count}</span>
    </label>`;
  }).join('');

  classListEl.innerHTML = classes.map(c => {
    const count = ampLocations.filter(l => l.classification === c).length;
    const esc = c.replace(/"/g, '&quot;');
    return `<label class="rank-multi-item">
      <input type="checkbox" data-class="${esc}" ${rankClassFilter.has(c) ? 'checked' : ''}>
      <span>${c}</span>
      <span class="rcount">${count}</span>
    </label>`;
  }).join('');

  // Delegate change events
  brandListEl.onchange = (e) => {
    const t = e.target;
    if (!t.matches('input[data-brand]')) return;
    const v = t.dataset.brand;
    if (t.checked) rankBrandFilter.add(v); else rankBrandFilter.delete(v);
    updateRankFilterCounts();
    renderRankTable();
  };
  classListEl.onchange = (e) => {
    const t = e.target;
    if (!t.matches('input[data-class]')) return;
    const v = t.dataset.class;
    if (t.checked) rankClassFilter.add(v); else rankClassFilter.delete(v);
    updateRankFilterCounts();
    renderRankTable();
  };

  // Select All / Clear buttons
  document.querySelectorAll('.rank-multi-actions .loc-mini-btn').forEach(btn => {
    btn.onclick = () => {
      const group = btn.dataset.rankGroup;
      const action = btn.dataset.rankAction;
      const isBrands = group === 'brands';
      const allValues = isBrands ? brands : classes;
      const set = isBrands ? rankBrandFilter : rankClassFilter;
      const listEl = isBrands ? brandListEl : classListEl;
      const attr = isBrands ? 'brand' : 'class';
      set.clear();
      if (action === 'all') allValues.forEach(v => set.add(v));
      listEl.querySelectorAll(`input[data-${attr}]`).forEach(cb => {
        cb.checked = (action === 'all');
      });
      updateRankFilterCounts();
      renderRankTable();
    };
  });

  updateRankFilterCounts();
}

function updateRankFilterCounts() {
  const brandTotal = new Set(ampLocations.map(l => l.brand)).size;
  const classTotal = new Set(ampLocations.map(l => l.classification)).size;
  const bEl = document.getElementById('rank-brands-count');
  const cEl = document.getElementById('rank-classes-count');
  if (bEl) bEl.textContent = `${rankBrandFilter.size} / ${brandTotal}`;
  if (cEl) cEl.textContent = `${rankClassFilter.size} / ${classTotal}`;
}

function fmtNum(v, isPct) {
  if (v == null || v === '') return '—';
  if (isPct) return v.toFixed(1) + '%';
  if (typeof v === 'number') return v.toLocaleString();
  return v;
}

function renderRankTable() {
  const allRows = buildPropertyRows();

  // Apply filters (targets always shown). Empty filter set = show none.
  const visible = allRows.filter(r => {
    if (r.kind === 'target') return true;
    if (!rankBrandFilter.has(r.brand)) return false;
    if (!rankClassFilter.has(r.classification)) return false;
    return true;
  });

  // Rank WITHIN the filtered/visible subset so rank denominator reflects what user sees.
  const { ranks, total } = assignRanks(visible, rankSource);

  const srcKey = rankSource === 'buxton' ? 'buxton' : 'census';
  const popLabel = rankSource === 'buxton' ? 'Female 25-64 (est. HHI $75k+)' : 'Female 25-65 (75k+)';

  // Enrich with rank and values
  const enriched = visible.map(r => {
    const d = r[srcKey] || {};
    // For Buxton, use estimated Female 25-64 with HHI $75k+ (derived field).
    // For Census, use f7 directly (already constrained to 75k+).
    const pop = rankSource === 'buxton' ? (d.f2564_75k || 0) : (d.f7 || 0);
    const penetration = (pop && pop > 0) ? ((d.rp || 0) / pop * 100) : null;
    return {
      ...r,
      opp: d.opp || 0,
      rp: d.rp || 0,
      ms: d.ms || 0,
      pop: pop || 0,
      penetration,
      compositeRank: ranks.get(r.id) ?? null,
    };
  });

  // Sort
  const { col, dir } = rankSort;
  const mult = dir === 'asc' ? 1 : -1;
  enriched.sort((a, b) => {
    const av = a[col], bv = b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });

  const isBuxton = rankSource === 'buxton';
  const cols = [
    { key: 'compositeRank', label: `Rank / ${total}`, width: 80 },
    { key: 'kind',          label: 'Type',            width: 70 },
    { key: 'name',          label: 'Name',            width: 250 },
    { key: 'brand',         label: 'Brand',           width: 180 },
    { key: 'classification',label: 'Class',           width: 110 },
    { key: 'city',          label: 'City',            width: 120 },
    { key: 'state',         label: 'ST',              width: 45 },
    { key: 'zip',           label: 'ZIP',             width: 60 },
    ...(!isBuxton ? [{ key: 'opp', label: 'Opp Score', width: 100 }] : []),
    { key: 'pop',           label: popLabel,          width: 130 },
    ...(!isBuxton ? [
      { key: 'ms',          label: 'MedSpas',         width: 80 },
      { key: 'rp',          label: 'Reg. Patients',   width: 100 },
      { key: 'penetration', label: 'Penetration',     width: 95 },
    ] : []),
  ];

  const targetCount = enriched.filter(r => r.kind === 'target').length;
  const ampCount = enriched.length - targetCount;

  document.getElementById('rank-subtitle').textContent =
    `${targetCount} target${targetCount === 1 ? '' : 's'} vs. ${ampCount} AMP location${ampCount === 1 ? '' : 's'} \u2014 ranked against ${total} total properties using ${rankSource === 'buxton' ? 'Buxton' : 'Census/Allergan'} data`;

  const table = document.getElementById('rank-table');
  const thead = '<thead><tr>' + cols.map(c => {
    const sortCls = rankSort.col === c.key ? (rankSort.dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
    return `<th data-col="${c.key}" class="${sortCls}" style="min-width:${c.width}px;">${c.label}</th>`;
  }).join('') + '</tr></thead>';

  const tbody = '<tbody>' + (enriched.length === 0
    ? `<tr><td colspan="${cols.length}" class="rank-empty">No rows match current filters. Add targets or adjust filters.</td></tr>`
    : enriched.map(r => {
      const rowCls = r.kind === 'target' ? 'target-row' : '';
      const chip = r.kind === 'target'
        ? '<span class="rank-chip target">Target</span>'
        : '<span class="rank-chip amp">AMP</span>';
      const censusCells = isBuxton ? '' : `
        <td class="rank-cell-opp">${fmtNum(r.opp)}</td>`;
    const extraCensusCells = isBuxton ? '' : `
        <td>${fmtNum(r.ms)}</td>
        <td>${fmtNum(r.rp)}</td>
        <td>${fmtNum(r.penetration, true)}</td>`;
    return `<tr class="${rowCls}">
        <td class="rank-cell-rank">${r.compositeRank ? r.compositeRank + ' / ' + total : '—'}</td>
        <td>${chip}</td>
        <td class="rank-cell-name">${r.name}</td>
        <td>${r.brand || '—'}</td>
        <td>${r.classification || '—'}</td>
        <td>${r.city || '—'}</td>
        <td>${r.state || '—'}</td>
        <td>${r.zip || '—'}</td>
        ${censusCells}
        <td>${fmtNum(r.pop)}</td>
        ${extraCensusCells}
      </tr>`;
    }).join('')) + '</tbody>';

  table.innerHTML = thead + tbody;

  // Header click → sort
  table.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (rankSort.col === col) {
        rankSort.dir = rankSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        rankSort.col = col;
        rankSort.dir = (col === 'opp' || col === 'pop' || col === 'rp' || col === 'ms' || col === 'penetration') ? 'desc' : 'asc';
      }
      renderRankTable();
    });
  });
}

function initRankModal() {
  document.getElementById('rank-modal-close').addEventListener('click', () => {
    document.getElementById('rank-modal').classList.remove('visible');
  });
  document.querySelectorAll('#rank-source-toggle .rank-source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      rankSource = btn.dataset.source;
      document.querySelectorAll('#rank-source-toggle .rank-source-btn').forEach(b =>
        b.classList.toggle('active', b === btn));
      renderRankTable();
    });
  });
  document.getElementById('rank-reset-filters').addEventListener('click', () => {
    rankBrandFilter.clear();
    rankClassFilter.clear();
    populateRankFilterDropdowns();
    renderRankTable();
  });
  // Close on backdrop click
  document.getElementById('rank-modal').addEventListener('click', (e) => {
    if (e.target.id === 'rank-modal') {
      document.getElementById('rank-modal').classList.remove('visible');
    }
  });
}

// ─── Init ────────────────────────────────────────────
async function init() {
  try {
    const { stateGeo } = await loadData();
    await loadAmpLocations();
    initMap(stateGeo);
    initSearch();
    initMetricSelector();
    initDataToggle();
    buildLocFilterLists();
    initLocControls();
    initTargetControls();
    initRankModal();
    updateLegend();

    document.getElementById('info-close').addEventListener('click', () => {
      document.getElementById('info-panel').classList.remove('visible');
    });

    document.getElementById('loading').classList.add('hidden');
  } catch (err) {
    console.error('Init error:', err);
    document.getElementById('loading-progress').textContent = `Error: ${err.message}`;
  }
}

init();
