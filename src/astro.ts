// Éphémérides calculées localement dans le navigateur avec astronomy-engine (licence MIT).
import {
  Body,
  Equator,
  Horizon,
  Illumination,
  MoonPhase,
  Observer,
  SearchAltitude,
  SearchLocalSolarEclipse,
  SearchLunarEclipse,
  SearchRiseSet,
  SiderealTime,
  AstroTime,
} from 'astronomy-engine';

export const TZ = 'Europe/Paris';
const DEG = Math.PI / 180;
const HOUR = 3_600_000;

/** Date (AAAA-MM-JJ) du soir de la nuit en cours à Paris : avant midi, c'est encore la nuit de la veille. */
export function currentNightDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  const d = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day));
  if (+parts.hour < 12) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Heures (UTC, pleines) couvrant une nuit en France : de 15 h UTC le soir à 7 h UTC le lendemain. */
export function nightHours(date: string): number[] {
  const t0 = Date.parse(`${date}T15:00:00Z`);
  return Array.from({ length: 17 }, (_, i) => t0 + i * HOUR);
}

export interface RaDec {
  ra: number; // heures
  dec: number; // degrés
}

/** Hauteur (°) d'un astre de coordonnées équatoriales données, sans réfraction. */
export function altitudeOf(pos: RaDec, gastHours: number, lat: number, lon: number): number {
  const ha = (gastHours + lon / 15 - pos.ra) * 15 * DEG;
  const s = Math.sin(lat * DEG) * Math.sin(pos.dec * DEG) + Math.cos(lat * DEG) * Math.cos(pos.dec * DEG) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
}

const CENTER = new Observer(46.6, 2.4, 200);
const GALACTIC_CENTER: RaDec = { ra: 17.761, dec: -29.008 };
export const PLANETS = [
  { body: Body.Mercury, name: 'Mercure' },
  { body: Body.Venus, name: 'Vénus' },
  { body: Body.Mars, name: 'Mars' },
  { body: Body.Jupiter, name: 'Jupiter' },
  { body: Body.Saturn, name: 'Saturne' },
];

/** Positions précalculées pour une heure donnée, réutilisables pour toute la grille. */
export interface HourSky {
  time: number;
  gast: number;
  sun: RaDec;
  moon: RaDec;
  moonIllum: number;
  planets: RaDec[];
}

export function hourSky(timeMs: number): HourSky {
  const t = new AstroTime(new Date(timeMs));
  const eq = (b: Body) => {
    const e = Equator(b, t, CENTER, true, true);
    return { ra: e.ra, dec: e.dec };
  };
  return {
    time: timeMs,
    gast: SiderealTime(t),
    sun: eq(Body.Sun),
    moon: eq(Body.Moon),
    moonIllum: Illumination(Body.Moon, t).phase_fraction,
    // Mercure n'est retenu que s'il est bien dégagé du Soleil ; on garde les planètes brillantes.
    planets: PLANETS.filter((p) => p.body !== Body.Mercury).map((p) => eq(p.body)),
  };
}

export function skyAt(s: HourSky, lat: number, lon: number) {
  return {
    sunAlt: altitudeOf(s.sun, s.gast, lat, lon),
    moonAlt: altitudeOf(s.moon, s.gast, lat, lon),
    moonIllum: s.moonIllum,
    planetAlt: Math.max(...s.planets.map((p) => altitudeOf(p, s.gast, lat, lon))),
    galacticCenterAlt: altitudeOf(GALACTIC_CENTER, s.gast, lat, lon),
  };
}

export interface NightEphemeris {
  sunset: Date | null;
  sunrise: Date | null;
  astroDusk: Date | null;
  astroDawn: Date | null;
  moonrise: Date | null;
  moonset: Date | null;
  moonIllum: number;
  moonPhaseName: string;
  planets: { name: string; maxAlt: number; at: Date; mag: number }[];
}

export function moonPhaseName(angle: number): string {
  if (angle < 10 || angle >= 350) return 'Nouvelle lune';
  if (angle < 80) return 'Premier croissant';
  if (angle < 100) return 'Premier quartier';
  if (angle < 170) return 'Gibbeuse croissante';
  if (angle < 190) return 'Pleine lune';
  if (angle < 260) return 'Gibbeuse décroissante';
  if (angle < 280) return 'Dernier quartier';
  return 'Dernier croissant';
}

const toDate = (t: AstroTime | null) => (t ? t.date : null);

/** Éphémérides d'une nuit (soir de `date`) pour un lieu. */
export function nightEphemeris(date: string, lat: number, lon: number): NightEphemeris {
  const obs = new Observer(lat, lon, 0);
  const noon = new AstroTime(new Date(`${date}T11:00:00Z`));
  const sunset = SearchRiseSet(Body.Sun, obs, -1, noon, 1);
  const sunrise = SearchRiseSet(Body.Sun, obs, +1, sunset ?? noon, 1);
  const astroDusk = SearchAltitude(Body.Sun, obs, -1, noon, 1, -18);
  const astroDawn = astroDusk ? SearchAltitude(Body.Sun, obs, +1, astroDusk, 1, -18) : null;
  const start = sunset ?? noon;
  const end = sunrise ?? noon.AddDays(1);
  const moonrise = SearchRiseSet(Body.Moon, obs, +1, start, end.ut - start.ut);
  const moonset = SearchRiseSet(Body.Moon, obs, -1, start, end.ut - start.ut);
  const mid = start.AddDays((end.ut - start.ut) / 2);

  const planets: NightEphemeris['planets'] = [];
  for (const p of PLANETS) {
    let best = { alt: -90, t: start };
    for (let h = 0; h <= (end.ut - start.ut) * 24; h += 0.25) {
      const t = start.AddDays(h / 24);
      const sunAlt = Horizon(t, obs, ...radec(Body.Sun, t, obs), 'normal').altitude;
      if (sunAlt > -6) continue;
      const alt = Horizon(t, obs, ...radec(p.body, t, obs), 'normal').altitude;
      if (alt > best.alt) best = { alt, t };
    }
    if (best.alt > 8) {
      planets.push({ name: p.name, maxAlt: Math.round(best.alt), at: best.t.date, mag: Illumination(p.body, best.t).mag });
    }
  }

  return {
    sunset: toDate(sunset),
    sunrise: toDate(sunrise),
    astroDusk: astroDusk && (!sunrise || astroDusk.ut < sunrise.ut) ? astroDusk.date : null,
    astroDawn: astroDusk && astroDawn && (!sunrise || astroDusk.ut < sunrise.ut) ? astroDawn.date : null,
    moonrise: toDate(moonrise),
    moonset: toDate(moonset),
    moonIllum: Illumination(Body.Moon, mid).phase_fraction,
    moonPhaseName: moonPhaseName(MoonPhase(mid)),
    planets,
  };
}

function radec(body: Body, t: AstroTime, obs: Observer): [number, number] {
  const e = Equator(body, t, obs, true, true);
  return [e.ra, e.dec];
}

// --- Événements à venir -----------------------------------------------------------------------

/** Principaux essaims d'étoiles filantes (dates de maximum moyennes, IMO). */
export const METEOR_SHOWERS = [
  { name: 'Quadrantides', month: 1, day: 3, zhr: 110 },
  { name: 'Lyrides', month: 4, day: 22, zhr: 18 },
  { name: 'Êta Aquarides', month: 5, day: 6, zhr: 50 },
  { name: 'Perséides', month: 8, day: 12, zhr: 100 },
  { name: 'Draconides', month: 10, day: 8, zhr: 10 },
  { name: 'Orionides', month: 10, day: 21, zhr: 20 },
  { name: 'Taurides du Nord', month: 11, day: 12, zhr: 5 },
  { name: 'Léonides', month: 11, day: 17, zhr: 15 },
  { name: 'Géminides', month: 12, day: 14, zhr: 150 },
  { name: 'Ursides', month: 12, day: 22, zhr: 10 },
];

export interface SkyEvent {
  date: Date;
  title: string;
  detail: string;
}

export function upcomingEvents(from: Date, lat: number, lon: number, count = 4): SkyEvent[] {
  const events: SkyEvent[] = [];
  const year = from.getUTCFullYear();
  for (const y of [year, year + 1]) {
    for (const s of METEOR_SHOWERS) {
      const d = new Date(Date.UTC(y, s.month - 1, s.day, 22));
      if (d.getTime() >= from.getTime() - 86_400_000) {
        events.push({ date: d, title: `${s.name} (étoiles filantes)`, detail: `maximum vers le ${fmtDay(d)}, jusqu'à ~${s.zhr} météores/h dans un ciel idéal` });
      }
    }
  }
  const t0 = new AstroTime(from);
  let lunar = SearchLunarEclipse(t0);
  for (let i = 0; i < 3; i++) {
    const kinds: Record<string, string> = { penumbral: 'pénombrale', partial: 'partielle', total: 'totale' };
    const obs = new Observer(lat, lon, 0);
    const alt = Horizon(lunar.peak, obs, ...radec(Body.Moon, lunar.peak, obs), 'normal').altitude;
    events.push({
      date: lunar.peak.date,
      title: `Éclipse de Lune ${kinds[lunar.kind] ?? lunar.kind}`,
      detail: alt > 0 ? 'visible depuis la France (Lune levée au maximum)' : 'Lune sous l’horizon au maximum depuis ce lieu',
    });
    lunar = SearchLunarEclipse(lunar.peak.AddDays(10));
  }
  const solar = SearchLocalSolarEclipse(t0, new Observer(lat, lon, 0));
  const solarKinds: Record<string, string> = { partial: 'partielle', annular: 'annulaire', total: 'totale' };
  events.push({
    date: solar.peak.time.date,
    title: `Éclipse de Soleil ${solarKinds[solar.kind] ?? solar.kind} (depuis ce lieu)`,
    detail: `obscuration ${Math.round(solar.obscuration * 100)} % — ne jamais regarder le Soleil sans filtre homologué`,
  });
  return events.filter((e) => e.date.getTime() >= from.getTime() - 86_400_000).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, count);
}

export const fmtTime = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d) : '—';
export const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
export const fmtNight = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00Z`));
