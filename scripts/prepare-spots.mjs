// Sélectionne des spots d'observation accessibles en voiture depuis OpenStreetMap (Overpass API).
// Données © contributeurs OpenStreetMap, licence ODbL 1.0 : public/data/spots.json est une base dérivée
// publiée sous la même licence.
//
// Critères « accessible en voiture » :
//  - col (mountain_pass=yes) situé sur une route carrossable ;
//  - belvédère (tourism=viewpoint) ou sommet (natural=peak) avec un parking à moins de 250 m.
// Puis on retient les plus sombres (atlas Falchi) avec une bonne répartition géographique.
import { readFile } from 'node:fs/promises';
import { BBOX, USER_AGENT, writeJson } from './geo-utils.mjs';

const TARGET = Number(process.argv[2] ?? 50);
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const ROADS = '^(trunk|primary|secondary|tertiary|unclassified|residential)$';
const TILE = 2.5; // requêtes découpées en tuiles de 2,5° pour ménager les serveurs publics

const query = (bbox) => `[out:json][timeout:180][bbox:${bbox}];
node["mountain_pass"="yes"]["name"]->.p;
way(bn.p)["highway"~"${ROADS}"]->.w;
node.p(w.w)->.cols;
node["tourism"="viewpoint"]["name"]->.v;
nwr["amenity"="parking"](around.v:250)->.pk;
node.v(around.pk:250)->.views;
node["natural"="peak"]["name"]->.k;
nwr["amenity"="parking"](around.k:250)->.pk2;
node.k(around.pk2:250)->.peaks;
(.cols; .views; .peaks;);
out body;`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(240_000),
      });
      if (res.ok) return await res.json();
      console.warn(`${url} -> HTTP ${res.status}`);
    } catch (err) {
      console.warn(`${url} -> ${err.message}`);
    }
    await sleep(10000 * 2 ** Math.floor(attempt / MIRRORS.length));
  }
  throw new Error('Overpass indisponible');
}

const meta = JSON.parse(await readFile('public/data/light.json', 'utf8'));
const bin = await readFile('public/data/light.bin');
const N = meta.width * meta.height;
function lightAt(lat, lon) {
  const i = Math.floor((lon - meta.west) / meta.cellDeg);
  const j = Math.floor((meta.north - lat) / meta.cellDeg);
  if (i < 0 || j < 0 || i >= meta.width || j >= meta.height) return null;
  const k = j * meta.width + i;
  if (!bin[N + k] || bin[k] === 255) return null;
  return 16 + bin[k] / 40;
}

function distKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const elements = new Map();
for (let s = BBOX.south; s < BBOX.north; s += TILE) {
  for (let w = BBOX.west; w < BBOX.east; w += TILE) {
    // On saute les tuiles sans aucune cellule française (mer, pays voisins).
    let any = false;
    for (let lat = s; lat < s + TILE && !any; lat += 0.1) for (let lon = w; lon < w + TILE && !any; lon += 0.1) any = lightAt(lat, lon) !== null;
    if (!any) continue;
    const data = await overpass(query(`${s},${w},${Math.min(s + TILE, BBOX.north)},${Math.min(w + TILE, BBOX.east)}`));
    for (const el of data.elements) elements.set(el.id, el);
    console.log(`tuile ${s},${w} : ${data.elements.length} éléments`);
    await sleep(2000);
  }
}
const candidates = [];
for (const el of elements.values()) {
  if (el.type !== 'node') continue;
  const t = el.tags ?? {};
  const sqm = lightAt(el.lat, el.lon);
  if (sqm === null) continue; // hors France métropolitaine
  if (t.access === 'private' || t.access === 'no') continue;
  const kind = t.mountain_pass === 'yes' ? 'col' : t.tourism === 'viewpoint' ? 'belvedere' : 'sommet';
  const ele = Number.parseFloat(t.ele);
  candidates.push({
    id: `n${el.id}`,
    name: t.name,
    kind,
    lat: +el.lat.toFixed(5),
    lon: +el.lon.toFixed(5),
    ele: Number.isFinite(ele) ? Math.round(ele) : null,
    sqm: +sqm.toFixed(2),
  });
}
console.log(`${candidates.length} candidats`);

// Classement : obscurité d'abord, petit bonus d'altitude (au-dessus des brumes).
const rank = (c) => c.sqm + Math.min(c.ele ?? 0, 2000) / 4000;
candidates.sort((a, b) => rank(b) - rank(a));

const chosen = [];
const farEnough = (c, minKm) => chosen.every((s) => distKm(s, c) >= minKm);
// 1) le meilleur spot de chaque carré de 2° (répartition sur tout le territoire)
const boxes = new Set();
for (const c of candidates) {
  const box = `${Math.floor(c.lat / 2)}:${Math.floor(c.lon / 2)}`;
  if (boxes.has(box) || c.sqm < 20.4) continue;
  boxes.add(box);
  chosen.push(c);
}
// 2) compléter avec les plus sombres, espacés d'au moins 35 km
for (const c of candidates) {
  if (chosen.length >= TARGET) break;
  if (!chosen.includes(c) && farEnough(c, 35)) chosen.push(c);
}

await writeJson('public/data/spots.json', {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: '© contributeurs OpenStreetMap (ODbL 1.0) via Overpass API',
  spots: chosen.slice(0, TARGET),
});
console.log(`${Math.min(TARGET, chosen.length)} spots retenus`);
