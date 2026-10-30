// Éphémérides comparées à des valeurs de référence publiées (IMCCE / USNO / NASA).
import { Body, Equator, Horizon, Observer, AstroTime } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { addDays, currentNightDate, hourSky, moonPhaseName, nightEphemeris, skyAt, upcomingEvents } from '../src/astro';

const PARIS = { lat: 48.8566, lon: 2.3522 };
const minutesBetween = (a: Date | null, iso: string) => Math.abs((a?.getTime() ?? NaN) - Date.parse(iso)) / 60000;

describe('nuit en cours', () => {
  it('avant midi (heure de Paris), on est encore dans la nuit de la veille', () => {
    expect(currentNightDate(new Date('2026-10-30T23:00:00Z'))).toBe('2026-10-30');
    expect(currentNightDate(new Date('2026-10-31T09:00:00Z'))).toBe('2026-10-30');
    expect(currentNightDate(new Date('2026-10-31T13:00:00Z'))).toBe('2026-10-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('Soleil et Lune à Paris', () => {
  it('solstice d’été 2024 : coucher 19 h 58 UTC, lever 3 h 47 UTC, pas de nuit astronomique', () => {
    const e = nightEphemeris('2024-06-21', PARIS.lat, PARIS.lon);
    expect(minutesBetween(e.sunset, '2024-06-21T19:58:00Z')).toBeLessThan(3);
    expect(minutesBetween(e.sunrise, '2024-06-22T03:47:00Z')).toBeLessThan(3);
    expect(e.astroDusk).toBeNull();
  });

  it('solstice d’hiver 2024 : coucher 15 h 56 UTC, lever 7 h 42 UTC, nuit astronomique ≈ 17 h 50 UTC', () => {
    const e = nightEphemeris('2024-12-21', PARIS.lat, PARIS.lon);
    expect(minutesBetween(e.sunset, '2024-12-21T15:56:00Z')).toBeLessThan(3);
    expect(minutesBetween(e.sunrise, '2024-12-22T07:42:00Z')).toBeLessThan(3);
    expect(minutesBetween(e.astroDusk, '2024-12-21T17:50:00Z')).toBeLessThan(6);
  });

  it('pleine lune du 23 avril 2024 (23 h 49 UTC) : Lune ~100 % éclairée', () => {
    const s = hourSky(Date.parse('2024-04-23T23:49:00Z'));
    expect(s.moonIllum).toBeGreaterThan(0.99);
    expect(moonPhaseName(180)).toBe('Pleine lune');
    expect(moonPhaseName(2)).toBe('Nouvelle lune');
  });

  it('le calcul rapide de hauteur concorde avec astronomy-engine (< 0,3°)', () => {
    for (const iso of ['2024-06-21T12:00:00Z', '2024-12-21T22:00:00Z', '2025-03-01T03:00:00Z']) {
      const t = Date.parse(iso);
      const fast = skyAt(hourSky(t), 43.6, 1.44); // Toulouse
      const obs = new Observer(43.6, 1.44, 0);
      const at = new AstroTime(new Date(t));
      for (const [body, alt] of [
        [Body.Sun, fast.sunAlt],
        [Body.Moon, fast.moonAlt],
      ] as const) {
        const eq = Equator(body, at, obs, true, true);
        expect(Math.abs(Horizon(at, obs, eq.ra, eq.dec).altitude - alt)).toBeLessThan(0.3);
      }
    }
  });
});

describe('événements', () => {
  it('éclipse totale de Lune du 7 septembre 2025, maximum 18 h 12 UTC (NASA)', () => {
    const ev = upcomingEvents(new Date('2025-09-01T00:00:00Z'), PARIS.lat, PARIS.lon, 10);
    const ecl = ev.find((e) => e.title.startsWith('Éclipse de Lune'));
    expect(ecl?.title).toContain('totale');
    expect(minutesBetween(ecl!.date, '2025-09-07T18:12:00Z')).toBeLessThan(5);
  });

  it('éclipse de Soleil du 12 août 2026, partielle et très forte à Paris', () => {
    const ev = upcomingEvents(new Date('2026-08-01T00:00:00Z'), PARIS.lat, PARIS.lon, 10);
    const sol = ev.find((e) => e.title.startsWith('Éclipse de Soleil'));
    expect(sol?.date.toISOString().slice(0, 10)).toBe('2026-08-12');
    expect(sol?.title).toContain('partielle');
  });

  it('août 2027 : éclipse de Soleil du 2 (partielle à Paris), puis les Perséides', () => {
    const ev = upcomingEvents(new Date('2027-08-01T00:00:00Z'), PARIS.lat, PARIS.lon, 2);
    expect(ev[0].title).toContain('Éclipse de Soleil partielle');
    expect(ev[0].date.toISOString().slice(0, 10)).toBe('2027-08-02');
    expect(ev[1].title).toContain('Perséides');
  });
});
