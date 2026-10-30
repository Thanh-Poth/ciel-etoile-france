// Liste des communes de France métropolitaine pour la recherche de ville 100 % locale (aucune requête
// de géocodage envoyée à un tiers). Source : API Découpage administratif (geo.api.gouv.fr),
// Licence Ouverte / Etalab 2.0.
import { USER_AGENT, writeJson } from './geo-utils.mjs';

const res = await fetch('https://geo.api.gouv.fr/communes?fields=nom,centre,population,codeDepartement&format=json', {
  headers: { 'User-Agent': USER_AGENT },
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const communes = await res.json();

const rows = communes
  .filter((c) => c.centre && !c.codeDepartement.startsWith('97') && !c.codeDepartement.startsWith('98'))
  .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
  .map((c) => [c.nom, +c.centre.coordinates[1].toFixed(4), +c.centre.coordinates[0].toFixed(4), c.codeDepartement]);

await writeJson('public/data/communes.json', {
  source: 'geo.api.gouv.fr — Licence Ouverte / Etalab 2.0',
  fields: ['nom', 'lat', 'lon', 'departement'],
  rows,
});
console.log(`${rows.length} communes`);
