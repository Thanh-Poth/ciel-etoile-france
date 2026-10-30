import { describe, expect, it } from 'vitest';
import { auroraProbability, kpNeeded, nightMaxKp } from '../src/aurora';
import { DEFAULT_STATE, parseHash, toHash } from '../src/state';

describe('état dans le hash', () => {
  it('aller-retour', () => {
    const st = parseHash('#o=deepsky&n=2&l=s,l&m=44.100,6.200,8.0&sel=n123&r=1');
    expect(st.obj).toBe('deepsky');
    expect(st.night).toBe(2);
    expect([...st.layers].sort()).toEqual(['light', 'score']);
    expect(st.sel).toEqual({ kind: 'spot', id: 'n123' });
    expect(st.red).toBe(true);
    expect(parseHash(toHash(st))).toEqual(st);
  });

  it('valeurs invalides → défauts', () => {
    const st = parseHash('#o=hack&n=9&m=a,b,c');
    expect(st.obj).toBe(DEFAULT_STATE.obj);
    expect(st.night).toBe(0);
    expect(st.view).toEqual(DEFAULT_STATE.view);
  });

  it('point sélectionné', () => {
    expect(parseHash('#sel=45.5,6.25').sel).toEqual({ kind: 'point', lat: 45.5, lon: 6.25 });
  });
});

describe('aurores', () => {
  it('il faut un Kp plus fort au sud', () => {
    expect(kpNeeded(43)).toBeGreaterThan(kpNeeded(50));
  });
  it('probabilité quasi nulle par activité calme, notable lors d’une tempête extrême au nord', () => {
    expect(auroraProbability(3, 48.8)).toBe(0);
    expect(auroraProbability(9, 50.5)).toBeGreaterThan(0.5);
  });
  it('Kp max de la nuit', () => {
    const f = {
      generatedAt: '',
      kp: [
        { t: '2026-10-30T15:00:00Z', kp: 6, observed: 'predicted' },
        { t: '2026-10-30T21:00:00Z', kp: 3.33, observed: 'predicted' },
        { t: '2026-10-31T03:00:00Z', kp: 4, observed: 'predicted' },
        { t: '2026-10-31T09:00:00Z', kp: 8, observed: 'predicted' },
      ],
    };
    expect(nightMaxKp(f, '2026-10-30')).toBe(4);
    expect(nightMaxKp(null, '2026-10-30')).toBeNull();
  });
});
