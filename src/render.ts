// Rendu des grilles en images (reprojetées en Web Mercator) pour les sources image de MapLibre.
import type { LightGrid } from './data';
import { bortleFromSqm } from './score';

type RGBA = [number, number, number, number];

/** Rampe du score (sombre = mauvais, clair = bon), lisible sur fond sombre. */
export const SCORE_STOPS: [number, RGBA][] = [
  [0, [40, 20, 70, 110]],
  [25, [95, 40, 140, 140]],
  [50, [190, 60, 120, 160]],
  [75, [245, 145, 60, 175]],
  [100, [250, 245, 150, 190]],
];

export function scoreColor(v: number): RGBA {
  for (let s = 1; s < SCORE_STOPS.length; s++) {
    const [v1, c1] = SCORE_STOPS[s];
    if (v <= v1) {
      const [v0, c0] = SCORE_STOPS[s - 1];
      const t = (v - v0) / (v1 - v0);
      return c0.map((x, i) => Math.round(x + (c1[i] - x) * t)) as RGBA;
    }
  }
  return SCORE_STOPS[SCORE_STOPS.length - 1][1];
}

export const scoreCss = (v: number) => {
  const [r, g, b] = scoreColor(v);
  return `rgb(${r} ${g} ${b})`;
};

/** Couleurs conventionnelles par classe de Bortle (1 à 9). */
export const BORTLE_COLORS: string[] = ['#0b0b1e', '#26306e', '#1f6fb4', '#2ca02c', '#e6c229', '#f28e2b', '#d62728', '#ff9da7', '#ffffff'];
const BORTLE_RGBA: RGBA[] = BORTLE_COLORS.map((hex, i) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  i === 0 ? 60 : 150,
]);

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latFromMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

export function gridCoordinates(g: LightGrid): [[number, number], [number, number], [number, number], [number, number]] {
  const east = g.west + g.width * g.cellDeg;
  const south = g.north - g.height * g.cellDeg;
  return [
    [g.west, g.north],
    [east, g.north],
    [east, south],
    [g.west, south],
  ];
}

/** Dessine une grille (une couleur par cellule) dans un canvas en projection Mercator. */
function paint(g: LightGrid, colorOf: (k: number) => RGBA | null, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas ?? document.createElement('canvas');
  const south = g.north - g.height * g.cellDeg;
  const rows = Math.round(g.height * 1.3);
  c.width = g.width;
  c.height = rows;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(g.width, rows);
  const yN = mercY(g.north);
  const yS = mercY(south);
  for (let r = 0; r < rows; r++) {
    const lat = latFromMercY(yN + ((yS - yN) * (r + 0.5)) / rows);
    const j = Math.min(g.height - 1, Math.floor((g.north - lat) / g.cellDeg));
    for (let i = 0; i < g.width; i++) {
      const col = colorOf(j * g.width + i);
      if (!col) continue;
      img.data.set(col, (r * g.width + i) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function paintScore(g: LightGrid, values: Float32Array, canvas?: HTMLCanvasElement) {
  return paint(g, (k) => (Number.isNaN(values[k]) ? null : scoreColor(values[k])), canvas);
}

export function paintLight(g: LightGrid) {
  return paint(g, (k) => (g.mask[k] && g.sqm[k] !== 255 ? BORTLE_RGBA[bortleFromSqm(16 + g.sqm[k] / 40) - 1] : null));
}
