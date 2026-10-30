// Probabilité d'aurore visible en France à partir de l'indice Kp prévu (NOAA SWPC).
// Modèle volontairement simple et prudent : en France les aurores visibles sont exceptionnelles
// (quelques nuits par décennie, par ex. 10-11 mai 2024 et 10 octobre 2024).
import type { KpForecast } from './data';

/** Kp minimal pour une lueur basse sur l'horizon nord, à l'œil nu, selon la latitude. */
export const kpNeeded = (lat: number) => 7 + (51 - lat) / 2.5;

/** Probabilité (0 à 1) d'une aurore visible à l'œil nu pour un Kp prévu donné. */
export function auroraProbability(kp: number, lat: number): number {
  const p = 0.8 / (1 + Math.exp(-2.2 * (kp - kpNeeded(lat))));
  return p < 0.005 ? 0 : p;
}

/** Kp maximal prévu sur la nuit (blocs de 3 h entre 18 h et 6 h UTC). */
export function nightMaxKp(forecast: KpForecast | null, eveningDate: string): number | null {
  if (!forecast) return null;
  const t0 = Date.parse(`${eveningDate}T18:00:00Z`);
  const t1 = t0 + 12 * 3_600_000;
  const vals = forecast.kp.filter((k) => {
    const t = Date.parse(k.t);
    return t + 3 * 3_600_000 > t0 && t < t1;
  });
  return vals.length ? Math.max(...vals.map((k) => k.kp)) : null;
}
