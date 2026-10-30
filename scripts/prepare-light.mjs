// Prépare la grille de pollution lumineuse à partir du World Atlas of Artificial Night Sky Brightness
// (Falchi et al. 2016, GFZ Data Services, doi:10.5880/GFZ.1.4.2016.001, licence CC BY-NC 4.0).
//
// Usage : node scripts/prepare-light.mjs <chemin/vers/World_Atlas_2015.tif>
// Le fichier source (3 Go décompressé) n'est PAS versionné ; seul le produit dérivé ré-échantillonné l'est.
//
// Sortie : public/data/light.bin = [W*H octets SQM] + [W*H octets masque France (1/0)]
//          public/data/light.json = métadonnées de la grille.
import { fromFile } from 'geotiff';
import { writeFile, mkdir } from 'node:fs/promises';
import { BBOX, loadFrancePolygons, inPolygons, writeJson } from './geo-utils.mjs';

const CELLS_PER_DEG = 40; // 1/40° ≈ 2,8 km × 1,9 km
const NATURAL_MCD = 0.171; // luminance naturelle de référence (≈ 22,0 mag/arcsec²)

function sqmFromArtificial(artificialMcd) {
  const total = Math.max(0, artificialMcd) + NATURAL_MCD;
  return -2.5 * Math.log10(total / 1000 / 108000);
}

const tifPath = process.argv[2];
if (!tifPath) {
  console.error('Usage : node scripts/prepare-light.mjs <World_Atlas_2015.tif>');
  process.exit(1);
}

const tiff = await fromFile(tifPath);
const image = await tiff.getImage();
const [originX, originY] = image.getOrigin();
const [resX, resY] = image.getResolution();

const x0 = Math.floor((BBOX.west - originX) / resX);
const x1 = Math.ceil((BBOX.east - originX) / resX);
const y0 = Math.floor((BBOX.north - originY) / resY);
const y1 = Math.ceil((BBOX.south - originY) / resY);
const [raster] = await image.readRasters({ window: [x0, y0, x1, y1] });
const winW = x1 - x0;

const W = Math.round((BBOX.east - BBOX.west) * CELLS_PER_DEG);
const H = Math.round((BBOX.north - BBOX.south) * CELLS_PER_DEG);
const sum = new Float64Array(W * H);
const count = new Uint32Array(W * H);

for (let py = 0; py < y1 - y0; py++) {
  const lat = originY + (y0 + py + 0.5) * resY;
  const j = Math.floor((BBOX.north - lat) * CELLS_PER_DEG);
  if (j < 0 || j >= H) continue;
  for (let px = 0; px < winW; px++) {
    const lon = originX + (x0 + px + 0.5) * resX;
    const i = Math.floor((lon - BBOX.west) * CELLS_PER_DEG);
    if (i < 0 || i >= W) continue;
    const v = raster[py * winW + px];
    if (!(v >= 0) || v > 1e6) continue; // nodata
    sum[j * W + i] += v;
    count[j * W + i]++;
  }
}

const polys = await loadFrancePolygons();
const out = new Uint8Array(W * H * 2);
let inFrance = 0;
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (count[k] === 0) {
      out[k] = 255;
    } else {
      const sqm = sqmFromArtificial(sum[k] / count[k]);
      out[k] = Math.max(0, Math.min(250, Math.round((sqm - 16) * 40)));
    }
    const lon = BBOX.west + (i + 0.5) / CELLS_PER_DEG;
    const lat = BBOX.north - (j + 0.5) / CELLS_PER_DEG;
    const d = 0.5 / CELLS_PER_DEG;
    const masked =
      inPolygons(lon, lat, polys) ||
      inPolygons(lon - d, lat - d, polys) ||
      inPolygons(lon + d, lat - d, polys) ||
      inPolygons(lon - d, lat + d, polys) ||
      inPolygons(lon + d, lat + d, polys);
    out[W * H + k] = masked ? 1 : 0;
    if (masked) inFrance++;
  }
}

await mkdir('public/data', { recursive: true });
await writeFile('public/data/light.bin', out);
await writeJson('public/data/light.json', {
  west: BBOX.west,
  north: BBOX.north,
  cellDeg: 1 / CELLS_PER_DEG,
  width: W,
  height: H,
  encoding: 'octet b : SQM = 16 + b/40 mag/arcsec² (255 = sans donnée) ; puis masque France 0/1',
  source:
    'Falchi et al. (2016), World Atlas of Artificial Night Sky Brightness, GFZ Data Services, doi:10.5880/GFZ.1.4.2016.001 — CC BY-NC 4.0. Ré-échantillonné à 1/40° (moyenne), luminance naturelle 0,171 mcd/m² ajoutée.',
});
console.log(`light.bin : ${W}×${H}, ${inFrance} cellules en France`);
