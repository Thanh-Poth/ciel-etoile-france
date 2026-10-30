// Assemble données + éphémérides + score : grilles de la nuit et courbes horaires.
import { hourSky, nightHours, skyAt, type HourSky } from './astro';
import { auroraProbability, nightMaxKp } from './aurora';
import type { HourWeather, KpForecast, LightGrid, WeatherIndex } from './data';
import { conditionsScore, darknessMultiplier, nightScore, type HourConditions, type Objective } from './score';

/** Hypothèses utilisées si les prévisions sont indisponibles (ciel supposé dégagé). */
const FALLBACK_WEATHER: HourWeather = { cl: 0, cm: 0, ch: 0, rh: 60, visKm: null, wind: 5, temp: 10, elev: 300 };

export interface NightContext {
  date: string;
  hours: number[];
  skies: HourSky[];
  kp: number | null;
}

export function buildNight(date: string, kp: KpForecast | null): NightContext {
  const hours = nightHours(date);
  return { date, hours, skies: hours.map(hourSky), kp: nightMaxKp(kp, date) };
}

export interface HourDetail {
  time: number;
  cond: HourConditions;
  weather: HourWeather | null;
  /** score des conditions, hors pollution lumineuse */
  score: number;
}

export function hourDetails(
  obj: Objective,
  ctx: NightContext,
  wi: WeatherIndex | null,
  lat: number,
  lon: number,
  elevOverride?: number | null,
): HourDetail[] {
  const aurora = auroraProbability(ctx.kp ?? 0, lat);
  return ctx.hours.map((time, i) => {
    const h = wi?.hourIndex(time);
    const weather = wi && h !== null && h !== undefined ? wi.at(lat, lon, h) : null;
    const w = weather ?? FALLBACK_WEATHER;
    const cond: HourConditions = {
      ...skyAt(ctx.skies[i], lat, lon),
      cl: w.cl,
      cm: w.cm,
      ch: w.ch,
      rh: w.rh,
      visKm: w.visKm,
      wind: w.wind,
      elev: elevOverride ?? w.elev,
      auroraProb: aurora,
    };
    return { time, cond, weather, score: conditionsScore(obj, cond) };
  });
}

export interface PlaceNight {
  sqm: number;
  hourly: { time: number; score: number; detail: HourDetail }[];
  night: number | null;
  bestTime: number | null;
}

export function placeNight(
  obj: Objective,
  ctx: NightContext,
  wi: WeatherIndex | null,
  sqm: number,
  lat: number,
  lon: number,
  elev?: number | null,
): PlaceNight {
  const mult = darknessMultiplier(obj, sqm);
  const details = hourDetails(obj, ctx, wi, lat, lon, elev);
  const hourly = details.map((d) => ({ time: d.time, score: d.score * mult, detail: d }));
  // On ne garde que les heures de nuit (au moins crépuscule nautique) pour le score de la nuit.
  const ns = nightScore(hourly.map((h) => (h.detail.cond.sunAlt < -6 ? h.score : null)));
  return { sqm, hourly, night: ns?.score ?? null, bestTime: ns ? hourly[ns.bestIndex].time : null };
}

export const COARSE = 4; // grille des conditions : 4 × 1/40° = 0,1°

/** Score de la nuit sur toute la grille (NaN hors France). */
export function scoreGrid(obj: Objective, ctx: NightContext, wi: WeatherIndex | null, light: LightGrid): Float32Array {
  const cw = Math.ceil(light.width / COARSE) + 1;
  const chh = Math.ceil(light.height / COARSE) + 1;
  const coarse = new Float32Array(cw * chh);
  const step = light.cellDeg * COARSE;
  for (let cj = 0; cj < chh; cj++) {
    const lat = light.north - cj * step;
    for (let ci = 0; ci < cw; ci++) {
      const lon = light.west + ci * step;
      const details = hourDetails(obj, ctx, wi, lat, lon);
      const ns = nightScore(details.map((d) => (d.cond.sunAlt < -6 ? d.score : null)));
      coarse[cj * cw + ci] = ns?.score ?? 0;
    }
  }
  const out = new Float32Array(light.width * light.height).fill(NaN);
  const mults = new Float32Array(251);
  for (let b = 0; b <= 250; b++) mults[b] = darknessMultiplier(obj, 16 + b / 40);
  for (let j = 0; j < light.height; j++) {
    const fy = (j + 0.5) / COARSE;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let i = 0; i < light.width; i++) {
      const k = j * light.width + i;
      if (!light.mask[k] || light.sqm[k] === 255) continue;
      const fx = (i + 0.5) / COARSE;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const c =
        coarse[y0 * cw + x0] * (1 - tx) * (1 - ty) +
        coarse[y0 * cw + x0 + 1] * tx * (1 - ty) +
        coarse[(y0 + 1) * cw + x0] * (1 - tx) * ty +
        coarse[(y0 + 1) * cw + x0 + 1] * tx * ty;
      out[k] = c * mults[light.sqm[k]];
    }
  }
  return out;
}
