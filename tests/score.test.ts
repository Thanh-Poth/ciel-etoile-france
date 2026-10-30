import { describe, expect, it } from 'vitest';
import {
  bortleFromSqm,
  clearSkyFactor,
  conditionsScore,
  hazeFactor,
  hourScore,
  moonFactor,
  nightScore,
  OBJECTIVES,
  twilightFactor,
  WEIGHTS,
  type HourConditions,
} from '../src/score';

const ideal: HourConditions = {
  sunAlt: -30,
  moonAlt: -20,
  moonIllum: 0,
  cl: 0,
  cm: 0,
  ch: 0,
  rh: 60,
  visKm: 40,
  wind: 5,
  elev: 1500,
  planetAlt: 40,
  galacticCenterAlt: 20,
  auroraProb: 0,
};

describe('facteurs', () => {
  it('estime la classe de Bortle', () => {
    expect(bortleFromSqm(22.0)).toBe(1);
    expect(bortleFromSqm(21.5)).toBe(4);
    expect(bortleFromSqm(19.0)).toBe(6);
    expect(bortleFromSqm(17.5)).toBe(9);
  });

  it('les nuages bas pèsent plus que les nuages hauts', () => {
    expect(clearSkyFactor(50, 0, 0, 0.7)).toBeLessThan(clearSkyFactor(0, 0, 50, 0.7));
    expect(clearSkyFactor(100, 0, 0, 0.7)).toBe(0);
    expect(clearSkyFactor(0, 0, 0, 0.7)).toBe(1);
  });

  it('la Lune ne gêne pas sous l’horizon, gêne beaucoup pleine et haute', () => {
    expect(moonFactor(-10, 1)).toBe(1);
    expect(moonFactor(40, 1)).toBeCloseTo(0.15, 2);
    expect(moonFactor(40, 0.1)).toBeGreaterThan(0.9);
  });

  it('crépuscule : 0 de jour, 1 en nuit astronomique', () => {
    expect(twilightFactor(5, 'astronomical')).toBe(0);
    expect(twilightFactor(-20, 'astronomical')).toBe(1);
    expect(twilightFactor(-15, 'astronomical')).toBeGreaterThan(0);
    expect(twilightFactor(-15, 'astronomical')).toBeLessThan(1);
    expect(twilightFactor(-11, 'nautical')).toBe(1);
  });

  it('brume et visibilité restent entre 0 et 1', () => {
    expect(hazeFactor(100, 0.5)).toBeGreaterThan(0);
    expect(hazeFactor(50, null)).toBe(1);
    expect(hazeFactor(95, 5)).toBeLessThan(hazeFactor(70, 30));
  });
});

describe('score horaire', () => {
  it('reste entre 0 et 100 pour tous les objectifs', () => {
    for (const { id } of OBJECTIVES) {
      const c = { ...ideal, moonAlt: 30, moonIllum: 0.5, auroraProb: 0.5 };
      const s = hourScore(id, 22, c);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
      expect(WEIGHTS[id]).toBeDefined();
    }
  });

  it('nuit idéale sur site vierge ≈ 100 pour la Voie lactée', () => {
    expect(hourScore('milkyway', 21.95, ideal)).toBeGreaterThan(95);
  });

  it('un ciel couvert donne un score quasi nul', () => {
    expect(hourScore('deepsky', 21.9, { ...ideal, cl: 100 })).toBe(0);
    expect(hourScore('milkyway', 21.9, { ...ideal, cm: 95, ch: 90 })).toBeLessThan(10);
  });

  it('la pollution lumineuse pénalise le ciel profond bien plus que les planètes', () => {
    const ratio = (o: 'deepsky' | 'planets') => hourScore(o, 18.0, ideal) / hourScore(o, 21.9, ideal);
    expect(ratio('deepsky')).toBeLessThan(0.01);
    expect(ratio('planets')).toBeGreaterThan(0.6);
  });

  it('la pleine Lune pénalise le ciel profond, pas l’objectif Lune', () => {
    const full = { ...ideal, moonAlt: 35, moonIllum: 1 };
    expect(conditionsScore('deepsky', full)).toBeLessThan(10);
    expect(conditionsScore('moon', full)).toBeGreaterThan(80);
    expect(conditionsScore('moon', ideal)).toBe(0); // Lune sous l'horizon
  });

  it('planètes : nul sans planète au-dessus de l’horizon', () => {
    expect(conditionsScore('planets', { ...ideal, planetAlt: -10 })).toBe(0);
  });

  it('aurores : proportionnel à la probabilité', () => {
    expect(conditionsScore('aurora', ideal)).toBe(0);
    expect(conditionsScore('aurora', { ...ideal, auroraProb: 0.5 })).toBeGreaterThan(40);
  });

  it('nul en plein jour', () => {
    for (const { id } of OBJECTIVES) expect(hourScore(id, 21.9, { ...ideal, sunAlt: 20, auroraProb: 1, moonAlt: 30, moonIllum: 0.5 })).toBe(0);
  });
});

describe('score de la nuit', () => {
  it('prend la meilleure moyenne sur 2 heures et ignore les heures de jour', () => {
    const r = nightScore([null, 10, 80, 90, 20, null]);
    expect(r?.score).toBe(85);
    expect(r?.bestIndex).toBe(3);
  });
  it('un pic isolé compte moins qu’un créneau stable', () => {
    expect(nightScore([0, 100, 0])!.score).toBe(50);
  });
  it('renvoie null sans heure de nuit', () => {
    expect(nightScore([null, null])).toBeNull();
  });
});
