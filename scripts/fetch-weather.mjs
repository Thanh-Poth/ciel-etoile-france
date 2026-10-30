// Récupère les prévisions (nuages par couche, humidité, visibilité, vent, température) sur une grille
// de 0,5° couvrant la France, via Open-Meteo (gratuit pour un usage non commercial, données CC BY 4.0),
// ainsi que la prévision Kp à 3 jours du NOAA SWPC (domaine public) pour les aurores.
// Exécuté par le workflow GitHub Actions planifié toutes les 3 heures — jamais par le navigateur.
import { readFile } from 'node:fs/promises';
import { BBOX, USER_AGENT, writeJson } from './geo-utils.mjs';

const STEP = 0.5;
const BATCH = 50;
const PAUSE_MS = 8000; // reste largement sous 600 appels/minute
const VARS = [
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'relative_humidity_2m',
  'visibility',
  'wind_speed_10m',
  'temperature_2m',
];
const KEYS = ['cl', 'cm', 'ch', 'rh', 'vis', 'wind', 'temp'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 5) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) return await res.json();
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt >= tries - 1) throw err;
      await sleep(5000 * 2 ** attempt);
    }
  }
}

/** Points de grille dont le carré de ±STEP contient au moins une cellule de France. */
async function gridPoints() {
  const meta = JSON.parse(await readFile('public/data/light.json', 'utf8'));
  const bin = await readFile('public/data/light.bin');
  const n = meta.width * meta.height;
  const pts = [];
  for (let lat = BBOX.south; lat <= BBOX.north + 1e-9; lat += STEP) {
    for (let lon = BBOX.west; lon <= BBOX.east + 1e-9; lon += STEP) {
      const i0 = Math.max(0, Math.floor((lon - STEP - meta.west) / meta.cellDeg));
      const i1 = Math.min(meta.width - 1, Math.floor((lon + STEP - meta.west) / meta.cellDeg));
      const j0 = Math.max(0, Math.floor((meta.north - lat - STEP) / meta.cellDeg));
      const j1 = Math.min(meta.height - 1, Math.floor((meta.north - lat + STEP) / meta.cellDeg));
      let hit = false;
      for (let j = j0; j <= j1 && !hit; j++) {
        for (let i = i0; i <= i1; i++) {
          if (bin[n + j * meta.width + i]) {
            hit = true;
            break;
          }
        }
      }
      if (hit) pts.push([+lat.toFixed(2), +lon.toFixed(2)]);
    }
  }
  return pts;
}

function encode(key, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return -999; // valeur manquante
  if (key === 'vis') return Math.min(500, Math.round(v / 100)); // hectomètres, plafonné à 50 km
  return Math.round(v);
}

const points = await gridPoints();
console.log(`${points.length} points de grille`);

const out = { elev: [], start: null, hours: 0 };
for (const k of KEYS) out[k] = [];

for (let b = 0; b < points.length; b += BATCH) {
  const chunk = points.slice(b, b + BATCH);
  const url =
    'https://api.open-meteo.com/v1/forecast?' +
    new URLSearchParams({
      latitude: chunk.map((p) => p[0]).join(','),
      longitude: chunk.map((p) => p[1]).join(','),
      hourly: VARS.join(','),
      forecast_days: '5',
      timezone: 'GMT',
    });
  let res = await fetchJson(url);
  if (!Array.isArray(res)) res = [res];
  for (const loc of res) {
    if (!out.start) {
      out.start = loc.hourly.time[0] + ':00Z';
      out.hours = loc.hourly.time.length;
    }
    out.elev.push(Math.round(loc.elevation ?? 0));
    VARS.forEach((v, idx) => out[KEYS[idx]].push(loc.hourly[v].map((x) => encode(KEYS[idx], x))));
  }
  if (b + BATCH < points.length) await sleep(PAUSE_MS);
}

await writeJson('public/data/weather.json', {
  generatedAt: new Date().toISOString(),
  source: 'Open-Meteo.com (CC BY 4.0) — modèles Météo-France et autres, sélection automatique',
  step: STEP,
  points,
  ...out,
});

// Indice Kp prévu (NOAA SWPC). Un échec ne doit pas bloquer le déploiement.
try {
  const kp = await fetchJson('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', 3);
  const rows = Array.isArray(kp[0]) ? kp.slice(1).map((r) => ({ time_tag: r[0], kp: +r[1], observed: r[2] })) : kp;
  await writeJson('public/data/aurora.json', {
    generatedAt: new Date().toISOString(),
    source: 'NOAA Space Weather Prediction Center (domaine public)',
    kp: rows.map((r) => ({ t: r.time_tag + 'Z', kp: +r.kp, observed: r.observed })),
  });
} catch (err) {
  console.warn('Prévision Kp indisponible :', err.message);
}
console.log('weather.json écrit');
