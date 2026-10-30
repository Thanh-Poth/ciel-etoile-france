// Utilitaires partagés par les scripts de préparation (exécutés au build, jamais dans le navigateur).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const USER_AGENT = 'ciel-etoile-france/0.1 (build script, open data)';

/** Emprise de la grille fixe (France métropolitaine + Corse, avec marge). */
export const BBOX = { west: -5.5, east: 10.0, south: 41.25, north: 51.25 };

export const CACHE_DIR = path.resolve('.cache');

export async function cachedFetch(url, fileName) {
  await mkdir(CACHE_DIR, { recursive: true });
  const target = path.join(CACHE_DIR, fileName);
  if (existsSync(target)) return readFile(target, 'utf8');
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const text = await res.text();
  await writeFile(target, text);
  return text;
}

/** Polygones de la France métropolitaine (Natural Earth 1:50m, domaine public). */
export async function loadFrancePolygons() {
  const text = await cachedFetch(
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
    'ne_50m_admin_0_countries.geojson',
  );
  const fc = JSON.parse(text);
  const fr = fc.features.find((f) => f.properties.ADM0_A3 === 'FRA');
  if (!fr) throw new Error('France introuvable dans Natural Earth');
  const polys = fr.geometry.type === 'Polygon' ? [fr.geometry.coordinates] : fr.geometry.coordinates;
  // On ne garde que les polygones situés dans l'emprise métropolitaine.
  return polys.filter((poly) =>
    poly[0].every(([x, y]) => x > BBOX.west - 1 && x < BBOX.east + 1 && y > BBOX.south - 1 && y < BBOX.north + 1),
  );
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPolygons(x, y, polys) {
  for (const poly of polys) {
    if (!inRing(x, y, poly[0])) continue;
    if (poly.slice(1).some((hole) => inRing(x, y, hole))) continue;
    return true;
  }
  return false;
}

export async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}
