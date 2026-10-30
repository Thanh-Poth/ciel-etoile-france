// Chargement des données statiques (préparées au build ou par le workflow planifié) et accès aux grilles.

export interface LightGrid {
  west: number;
  north: number;
  cellDeg: number;
  width: number;
  height: number;
  /** SQM codé (16 + b/40), 255 = sans donnée */
  sqm: Uint8Array;
  /** 1 = cellule en France métropolitaine */
  mask: Uint8Array;
}

export interface WeatherGrid {
  generatedAt: string;
  step: number;
  points: [number, number][];
  elev: number[];
  start: string;
  hours: number;
  cl: number[][];
  cm: number[][];
  ch: number[][];
  rh: number[][];
  vis: number[][];
  wind: number[][];
  temp: number[][];
}

export interface Spot {
  id: string;
  name: string;
  kind: 'col' | 'belvedere' | 'sommet';
  lat: number;
  lon: number;
  ele: number | null;
  sqm: number;
}

export interface KpForecast {
  generatedAt: string;
  kp: { t: string; kp: number; observed: string }[];
}

export interface HourWeather {
  cl: number;
  cm: number;
  ch: number;
  rh: number;
  /** km, null si indisponible */
  visKm: number | null;
  wind: number;
  temp: number;
  elev: number;
}

const url = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

async function getJson<T>(file: string): Promise<T | null> {
  try {
    const res = await fetch(url(file), { cache: 'no-cache' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function loadLight(): Promise<LightGrid> {
  const [meta, buf] = await Promise.all([
    getJson<Omit<LightGrid, 'sqm' | 'mask'>>('light.json'),
    fetch(url('light.bin')).then((r) => r.arrayBuffer()),
  ]);
  if (!meta) throw new Error('light.json manquant');
  const n = meta.width * meta.height;
  return { ...meta, sqm: new Uint8Array(buf, 0, n), mask: new Uint8Array(buf, n, n) };
}

export const loadWeather = () => getJson<WeatherGrid>('weather.json');
export const loadAurora = () => getJson<KpForecast>('aurora.json');
export const loadSpots = async () => (await getJson<{ spots: Spot[] }>('spots.json'))?.spots ?? [];

export interface Commune {
  nom: string;
  lat: number;
  lon: number;
  dep: string;
}
let communesCache: Promise<Commune[]> | null = null;
export function loadCommunes(): Promise<Commune[]> {
  communesCache ??= getJson<{ rows: [string, number, number, string][] }>('communes.json').then(
    (d) => d?.rows.map(([nom, lat, lon, dep]) => ({ nom, lat, lon, dep })) ?? [],
  );
  return communesCache;
}

/** SQM (mag/arcsec²) à une position, ou null hors grille / sans donnée. */
export function sqmAt(g: LightGrid, lat: number, lon: number): number | null {
  const i = Math.floor((lon - g.west) / g.cellDeg);
  const j = Math.floor((g.north - lat) / g.cellDeg);
  if (i < 0 || j < 0 || i >= g.width || j >= g.height) return null;
  const b = g.sqm[j * g.width + i];
  return b === 255 ? null : 16 + b / 40;
}

/** Index des points météo par position de grille, pour l'interpolation bilinéaire. */
export class WeatherIndex {
  readonly startMs: number;
  private readonly lookup = new Map<string, number>();
  private readonly lat0: number;
  private readonly lon0: number;

  constructor(readonly w: WeatherGrid) {
    this.startMs = Date.parse(w.start);
    this.lat0 = Math.min(...w.points.map((p) => p[0]));
    this.lon0 = Math.min(...w.points.map((p) => p[1]));
    w.points.forEach(([lat, lon], idx) => this.lookup.set(this.key(lat, lon), idx));
  }

  private key(lat: number, lon: number) {
    return `${Math.round((lat - this.lat0) / this.w.step)}:${Math.round((lon - this.lon0) / this.w.step)}`;
  }

  hourIndex(timeMs: number): number | null {
    const h = Math.round((timeMs - this.startMs) / 3_600_000);
    return h >= 0 && h < this.w.hours ? h : null;
  }

  /** Météo interpolée (bilinéaire, avec repli sur les voisins disponibles). */
  at(lat: number, lon: number, hour: number): HourWeather | null {
    const s = this.w.step;
    const fy = (lat - this.lat0) / s;
    const fx = (lon - this.lon0) / s;
    const y0 = Math.floor(fy);
    const x0 = Math.floor(fx);
    const ty = fy - y0;
    const tx = fx - x0;
    const corners: [number, number][] = [];
    for (const [dy, dx, wgt] of [
      [0, 0, (1 - ty) * (1 - tx)],
      [0, 1, (1 - ty) * tx],
      [1, 0, ty * (1 - tx)],
      [1, 1, ty * tx],
    ] as const) {
      const idx = this.lookup.get(`${y0 + dy}:${x0 + dx}`);
      if (idx !== undefined && wgt > 0) corners.push([idx, wgt]);
    }
    if (!corners.length) return null;
    const total = corners.reduce((a, [, wgt]) => a + wgt, 0);
    const avg = (arr: number[][]) => {
      let sum = 0;
      let wsum = 0;
      for (const [idx, wgt] of corners) {
        const v = arr[idx][hour];
        if (v > -900) {
          sum += v * wgt;
          wsum += wgt;
        }
      }
      return wsum > 0 ? sum / wsum : null;
    };
    const vis = avg(this.w.vis);
    return {
      cl: avg(this.w.cl) ?? 0,
      cm: avg(this.w.cm) ?? 0,
      ch: avg(this.w.ch) ?? 0,
      rh: avg(this.w.rh) ?? 0,
      visKm: vis === null ? null : vis / 10,
      wind: avg(this.w.wind) ?? 0,
      temp: avg(this.w.temp) ?? 0,
      elev: corners.reduce((a, [idx, wgt]) => a + this.w.elev[idx] * wgt, 0) / total,
    };
  }
}
