// Calcul du score d'observation (0 à 100). Fonctions pures, testées dans tests/score.test.ts.
//
// score horaire = 100 × crépuscule × cible × Π facteur_i ^ poids_i
// Chaque facteur vaut entre 0 et 1 ; le poids (exposant) dépend de l'objectif choisi.
// Le score de la nuit est la meilleure moyenne sur 2 heures consécutives.

export type Objective = 'milkyway' | 'meteors' | 'planets' | 'moon' | 'deepsky' | 'aurora';

export const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: 'milkyway', label: 'Voie lactée' },
  { id: 'meteors', label: "Étoiles filantes" },
  { id: 'planets', label: 'Planètes' },
  { id: 'moon', label: 'Lune' },
  { id: 'deepsky', label: 'Ciel profond' },
  { id: 'aurora', label: 'Aurores' },
];

export interface Weights {
  darkness: number;
  clouds: number;
  /** part des nuages hauts (souvent fins) dans l'opacité */
  highCloudOpacity: number;
  moon: number;
  haze: number;
  wind: number;
  altitude: number;
  /** nuit astronomique (soleil < -18°) ou nautique suffisante */
  twilight: 'astronomical' | 'nautical';
}

export const WEIGHTS: Record<Objective, Weights> = {
  milkyway: { darkness: 1.6, clouds: 1.4, highCloudOpacity: 0.7, moon: 1.3, haze: 0.8, wind: 0.15, altitude: 0.5, twilight: 'astronomical' },
  meteors: { darkness: 1.0, clouds: 1.4, highCloudOpacity: 0.7, moon: 1.0, haze: 0.6, wind: 0.15, altitude: 0.3, twilight: 'astronomical' },
  planets: { darkness: 0.15, clouds: 1.2, highCloudOpacity: 0.4, moon: 0.05, haze: 0.4, wind: 0.6, altitude: 0.3, twilight: 'nautical' },
  moon: { darkness: 0, clouds: 1.2, highCloudOpacity: 0.4, moon: 0, haze: 0.4, wind: 0.4, altitude: 0.2, twilight: 'nautical' },
  deepsky: { darkness: 1.8, clouds: 1.5, highCloudOpacity: 0.85, moon: 1.6, haze: 1.0, wind: 0.4, altitude: 0.6, twilight: 'astronomical' },
  aurora: { darkness: 0.5, clouds: 1.4, highCloudOpacity: 0.6, moon: 0.5, haze: 0.6, wind: 0.1, altitude: 0.2, twilight: 'astronomical' },
};

export interface HourConditions {
  sunAlt: number;
  moonAlt: number;
  /** fraction éclairée de la Lune, 0 à 1 */
  moonIllum: number;
  /** couverture nuageuse basse, moyenne, haute (%) */
  cl: number;
  cm: number;
  ch: number;
  /** humidité relative (%) */
  rh: number;
  /** visibilité (km), null si inconnue */
  visKm: number | null;
  /** vent à 10 m (km/h) */
  wind: number;
  /** altitude (m) */
  elev: number;
  /** hauteur maximale d'une planète brillante (°) */
  planetAlt: number;
  /** hauteur du centre galactique (°) */
  galacticCenterAlt: number;
  /** probabilité d'aurore visible, 0 à 1 */
  auroraProb: number;
}

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const DEG = Math.PI / 180;

/** Classe de Bortle estimée à partir de la brillance du ciel (mag/arcsec²). */
export function bortleFromSqm(sqm: number): number {
  const limits = [21.99, 21.89, 21.69, 20.49, 19.5, 18.94, 18.38, 17.8];
  const idx = limits.findIndex((l) => sqm >= l);
  return idx === -1 ? 9 : idx + 1;
}

/** Obscurité du ciel : 18 mag/arcsec² (ville) → 0,05 ; 21,9 (ciel vierge) → 1. */
export const darknessFactor = (sqm: number) => 0.05 + 0.95 * clamp((sqm - 18) / 3.9);

/** Fraction de ciel dégagé, en combinant les trois couches. */
export const clearSkyFactor = (cl: number, cm: number, ch: number, highOpacity: number) =>
  clamp((1 - cl / 100) * (1 - (0.9 * cm) / 100) * (1 - (highOpacity * ch) / 100));

/** Gêne due à la Lune : dépend de la phase et de la hauteur. */
export function moonFactor(moonAlt: number, illum: number): number {
  if (moonAlt < -0.8) return 1;
  const light = illum * clamp(Math.sin(Math.max(0, moonAlt) * DEG) * 2 + 0.2);
  return 1 - 0.85 * light;
}

/** Obscurité liée au Soleil (1 = nuit noire, 0 = jour/crépuscule clair). */
export function twilightFactor(sunAlt: number, mode: Weights['twilight']): number {
  if (mode === 'nautical') return clamp((-4 - sunAlt) / 6);
  if (sunAlt <= -18) return 1;
  if (sunAlt <= -12) return 1 - ((sunAlt + 18) / 6) * 0.75;
  return clamp((0.25 * (-6 - sunAlt)) / 6);
}

/** Humidité (rosée, brume) et visibilité. */
export function hazeFactor(rh: number, visKm: number | null): number {
  const rhF = rh <= 75 ? 1 : 1 - ((rh - 75) / 25) * 0.5;
  const visF = visKm === null ? 1 : clamp(0.2 + (0.8 * (visKm - 2)) / 18, 0.2, 1);
  return rhF * visF;
}

/** Vent : turbulence, vibrations de l'instrument, froid ressenti. */
export const windFactor = (wind: number) => clamp(1 - (0.8 * (wind - 10)) / 40, 0.2, 1);

/** Altitude : au-dessus des brumes et d'une partie des aérosols. */
export const altitudeFactor = (elev: number) => 0.85 + 0.15 * clamp(elev / 1500);

/** Disponibilité de la cible propre à l'objectif. */
export function targetFactor(obj: Objective, c: HourConditions): number {
  switch (obj) {
    case 'milkyway':
      return c.galacticCenterAlt > 5 ? 1 : 0.7; // bande d'hiver/automne moins contrastée que le cœur
    case 'planets':
      return clamp((c.planetAlt - 5) / 20);
    case 'moon':
      return c.moonIllum < 0.03 ? 0 : clamp(c.moonAlt / 20);
    case 'aurora':
      return clamp(c.auroraProb);
    default:
      return 1;
  }
}

export interface Factors {
  darkness: number;
  clouds: number;
  moon: number;
  haze: number;
  wind: number;
  altitude: number;
  twilight: number;
  target: number;
}

export function factors(obj: Objective, sqm: number, c: HourConditions): Factors {
  const w = WEIGHTS[obj];
  return {
    darkness: darknessFactor(sqm),
    clouds: clearSkyFactor(c.cl, c.cm, c.ch, w.highCloudOpacity),
    moon: moonFactor(c.moonAlt, c.moonIllum),
    haze: hazeFactor(c.rh, c.visKm),
    wind: windFactor(c.wind),
    altitude: altitudeFactor(c.elev),
    twilight: twilightFactor(c.sunAlt, w.twilight),
    target: targetFactor(obj, c),
  };
}

/** Partie du score qui dépend des conditions (tout sauf l'obscurité du site). */
export function conditionsScore(obj: Objective, c: HourConditions): number {
  const w = WEIGHTS[obj];
  const f = factors(obj, 21, c);
  return (
    100 *
    f.twilight *
    f.target *
    f.clouds ** w.clouds *
    f.moon ** w.moon *
    f.haze ** w.haze *
    f.wind ** w.wind *
    f.altitude ** w.altitude
  );
}

/** Multiplicateur lié à la pollution lumineuse du site. */
export const darknessMultiplier = (obj: Objective, sqm: number) => darknessFactor(sqm) ** WEIGHTS[obj].darkness;

export const hourScore = (obj: Objective, sqm: number, c: HourConditions) =>
  conditionsScore(obj, c) * darknessMultiplier(obj, sqm);

/** Score de la nuit : meilleure moyenne glissante sur 2 heures. Renvoie aussi l'index de la meilleure heure. */
export function nightScore(hourly: (number | null)[]): { score: number; bestIndex: number } | null {
  const vals = hourly.map((v) => v ?? -1);
  if (!vals.some((v) => v >= 0)) return null;
  let best = -1;
  let bestIndex = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] < 0) continue;
    const next = i + 1 < vals.length && vals[i + 1] >= 0 ? vals[i + 1] : null;
    const avg = next === null ? vals[i] : (vals[i] + next) / 2;
    if (avg > best) {
      best = avg;
      bestIndex = next !== null && next > vals[i] ? i + 1 : i;
    }
  }
  return { score: best, bestIndex };
}
