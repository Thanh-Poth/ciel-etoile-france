// État de l'application, sérialisé dans le hash de l'URL (partageable, rien n'est stocké côté serveur).
import { OBJECTIVES, type Objective } from './score';

export type LayerId = 'score' | 'light' | 'spots' | 'reserves';

export type Selection = { kind: 'spot'; id: string } | { kind: 'point'; lat: number; lon: number } | null;

export interface AppState {
  obj: Objective;
  night: number;
  layers: Set<LayerId>;
  view: { lat: number; lon: number; zoom: number };
  sel: Selection;
  red: boolean;
}

export const DEFAULT_STATE: AppState = {
  obj: 'milkyway',
  night: 0,
  layers: new Set<LayerId>(['score', 'spots', 'reserves']),
  view: { lat: 46.6, lon: 2.4, zoom: 4.8 },
  sel: null,
  red: false,
};

const LAYER_CODES: Record<LayerId, string> = { score: 's', light: 'l', spots: 'p', reserves: 'r' };

export function parseHash(hash: string): AppState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const st: AppState = { ...DEFAULT_STATE, layers: new Set(DEFAULT_STATE.layers), view: { ...DEFAULT_STATE.view } };
  const obj = p.get('o');
  if (obj && OBJECTIVES.some((o) => o.id === obj)) st.obj = obj as Objective;
  const n = Number(p.get('n'));
  if (Number.isInteger(n) && n >= 0 && n <= 3) st.night = n;
  const l = p.get('l');
  if (l !== null) {
    st.layers = new Set(
      (Object.entries(LAYER_CODES) as [LayerId, string][]).filter(([, c]) => l.split(',').includes(c)).map(([id]) => id),
    );
  }
  const m = p.get('m')?.split(',').map(Number);
  if (m && m.length === 3 && m.every(Number.isFinite)) st.view = { lat: m[0], lon: m[1], zoom: m[2] };
  const sel = p.get('sel');
  if (sel) {
    const ll = sel.split(',').map(Number);
    st.sel = ll.length === 2 && ll.every(Number.isFinite) ? { kind: 'point', lat: ll[0], lon: ll[1] } : { kind: 'spot', id: sel };
  }
  st.red = p.get('r') === '1';
  return st;
}

export function toHash(st: AppState): string {
  const p = new URLSearchParams();
  p.set('o', st.obj);
  p.set('n', String(st.night));
  p.set('l', [...st.layers].map((id) => LAYER_CODES[id]).join(','));
  p.set('m', `${st.view.lat.toFixed(3)},${st.view.lon.toFixed(3)},${st.view.zoom.toFixed(1)}`);
  if (st.sel) p.set('sel', st.sel.kind === 'spot' ? st.sel.id : `${st.sel.lat.toFixed(3)},${st.sel.lon.toFixed(3)}`);
  if (st.red) p.set('r', '1');
  return '#' + p.toString().replace(/%2C/g, ',');
}
