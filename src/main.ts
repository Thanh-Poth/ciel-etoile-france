import './style.css';
import { addDays, currentNightDate, fmtNight, nightEphemeris, upcomingEvents } from './astro';
import { auroraProbability } from './aurora';
import { loadAurora, loadCommunes, loadLight, loadSpots, loadWeather, sqmAt, WeatherIndex, type Commune, type KpForecast, type LightGrid, type Spot } from './data';
import { SkyMap } from './map';
import { buildNight, placeNight, scoreGrid, type NightContext } from './model';
import { BORTLE_COLORS, paintLight, paintScore, SCORE_STOPS } from './render';
import { OBJECTIVES } from './score';
import { parseHash, toHash, type AppState, type LayerId } from './state';
import { esc, KIND_LABEL, num, placeSection, scoreBadge, tonightSection } from './ui';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let state: AppState = parseHash(location.hash);
let light: LightGrid;
let wi: WeatherIndex | null = null;
let kp: KpForecast | null = null;
let spots: Spot[] = [];
let skyMap: SkyMap;
let night: NightContext;
let spotScores = new Map<string, number | null>();
let userPos: { lat: number; lon: number } | null = null;
const scoreCanvas = document.createElement('canvas');
const baseNight = currentNightDate(new Date());

const nightDate = () => addDays(baseNight, state.night);

function syncHash() {
  history.replaceState(null, '', toHash(state));
}

function setStatus(msg: string) {
  $('status').textContent = msg;
}

function renderControls() {
  $('objectives').innerHTML = OBJECTIVES.map(
    (o) => `<button type="button" data-obj="${o.id}" aria-pressed="${o.id === state.obj}">${o.label}</button>`,
  ).join('');
  const labels = ['Ce soir', 'Demain'];
  $('nights').innerHTML = [0, 1, 2, 3]
    .map((n) => {
      const d = addDays(baseNight, n);
      const name = labels[n] ?? fmtNight(d).split(' ')[0];
      return `<button type="button" data-night="${n}" aria-pressed="${n === state.night}" title="Nuit du ${fmtNight(d)}">${name[0].toUpperCase() + name.slice(1)}</button>`;
    })
    .join('');
  document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach((cb) => (cb.checked = state.layers.has(cb.dataset.layer as LayerId)));
  $('red-toggle').setAttribute('aria-pressed', String(state.red));
  document.documentElement.classList.toggle('red', state.red);
  renderLegend();
}

function renderLegend() {
  const parts: string[] = [];
  if (state.layers.has('score')) {
    const grad = SCORE_STOPS.map(([v, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${v}%`).join(',');
    parts.push(`<div><span>Score de la nuit</span><div class="ramp" style="background:linear-gradient(90deg,${grad})"></div><div class="ramp-labels"><span>0 défavorable</span><span>100 idéal</span></div></div>`);
  }
  if (state.layers.has('light')) {
    parts.push(`<div><span>Classe de Bortle estimée</span><div class="bortle">${BORTLE_COLORS.map((c, i) => `<span style="background:${c};color:${i >= 4 ? '#000' : '#fff'}">${i + 1}</span>`).join('')}</div><div class="ramp-labels"><span>ciel noir</span><span>centre-ville</span></div></div>`);
  }
  $('legend').innerHTML = parts.join('');
}

/** Recalcule la grille, les spots et le panneau pour l'objectif et la nuit choisis. */
function recompute() {
  night = buildNight(nightDate(), kp);
  const grid = scoreGrid(state.obj, night, wi, light);
  skyMap.setScoreImage(paintScore(light, grid, scoreCanvas));
  spotScores = new Map(spots.map((s) => [s.id, placeNight(state.obj, night, wi, s.sqm, s.lat, s.lon, s.ele).night]));
  skyMap.setSpots(spots, spotScores);
  renderSelection();
  renderTonight();
  renderTopSpots();
}

function selectedLatLon(): { lat: number; lon: number } | null {
  if (!state.sel) return null;
  if (state.sel.kind === 'point') return state.sel;
  const id = state.sel.id;
  const s = spots.find((x) => x.id === id);
  return s ? { lat: s.lat, lon: s.lon } : null;
}

function renderSelection() {
  const el = $('selection');
  const pos = selectedLatLon();
  skyMap.setSelection(pos?.lat ?? null, pos?.lon ?? null);
  if (!state.sel || !pos) {
    el.innerHTML = '<p class="hint">Touchez un spot ou un endroit de la carte pour voir la courbe heure par heure.</p>';
    return;
  }
  if (state.sel.kind === 'spot') {
    const id = state.sel.id;
    const s = spots.find((x) => x.id === id)!;
    const p = placeNight(state.obj, night, wi, s.sqm, s.lat, s.lon, s.ele);
    const sub = `${KIND_LABEL[s.kind]}${s.ele ? ` · ${s.ele} m` : ''} · <a href="https://www.openstreetmap.org/node/${s.id.slice(1)}" rel="noopener noreferrer">voir sur OSM</a>`;
    const month = Number(nightDate().slice(5, 7));
    const winter = s.kind === 'col' && (s.ele ?? 0) >= 1200 && (month >= 11 || month <= 5);
    const notes =
      (winter ? '<p class="note"><strong>Col d’altitude : souvent fermé ou enneigé de novembre à mai.</strong> Vérifiez l’ouverture de la route avant de partir.</p>' : '') +
      '<p class="note">Accès routier et parking d\'après OpenStreetMap : vérifiez sur place la réglementation du stationnement.</p>';
    el.innerHTML = placeSection(s.name, sub, p, notes);
  } else {
    const sqm = sqmAt(light, pos.lat, pos.lon);
    if (sqm === null) {
      el.innerHTML = '<p class="hint">Hors de la zone couverte (France métropolitaine).</p>';
      return;
    }
    const p = placeNight(state.obj, night, wi, sqm, pos.lat, pos.lon);
    el.innerHTML = placeSection('Point sélectionné', `${num(pos.lat, 3)}° N, ${num(pos.lon, 3)}° E`, p);
  }
}

function renderTonight() {
  const pos = selectedLatLon() ?? userPos ?? { lat: state.view.lat, lon: state.view.lon };
  const date = nightDate();
  const eph = nightEphemeris(date, pos.lat, pos.lon);
  const events = upcomingEvents(new Date(`${date}T12:00:00Z`), pos.lat, pos.lon);
  $('tonight').innerHTML = tonightSection(eph, events, state.obj, night.kp, auroraProbability(night.kp ?? 0, pos.lat), pos.lat);
}

function distKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return 6371 * Math.hypot(x, y);
}

function renderTopSpots() {
  const ref = userPos ?? (state.sel?.kind === 'point' ? state.sel : null);
  let list = spots.map((s) => ({ s, score: spotScores.get(s.id) ?? 0, d: ref ? distKm(ref, s) : null }));
  if (ref) list = list.filter((x) => x.d! < 250);
  list.sort((a, b) => b.score - a.score);
  const title = ref ? 'Meilleurs spots à moins de 250 km' : 'Meilleurs spots cette nuit';
  $('top-spots').innerHTML = `<h2>${title}</h2>${
    list.length
      ? `<ol class="spots">${list
          .slice(0, 10)
          .map(
            ({ s, score, d }) =>
              `<li><button type="button" data-spot="${esc(s.id)}">${scoreBadge(score)}<span><strong>${esc(s.name)}</strong><small>${KIND_LABEL[s.kind]}${s.ele ? ` · ${s.ele} m` : ''}${d !== null ? ` · ${Math.round(d)} km` : ''}</small></span></button></li>`,
          )
          .join('')}</ol>`
      : '<p class="hint">Aucun spot référencé dans ce rayon.</p>'
  }`;
}

function selectSpot(id: string, fly = false) {
  state.sel = { kind: 'spot', id };
  const s = spots.find((x) => x.id === id);
  if (s && fly) skyMap.flyTo(s.lat, s.lon, 9);
  syncHash();
  renderSelection();
  renderTonight();
  if (window.matchMedia('(max-width: 899px)').matches) $('selection').scrollIntoView({ behavior: 'smooth' });
}

function selectPoint(lat: number, lon: number, fly = false) {
  state.sel = { kind: 'point', lat, lon };
  if (fly) skyMap.flyTo(lat, lon, 9);
  syncHash();
  renderSelection();
  renderTonight();
  renderTopSpots();
}

// --- Recherche de commune (100 % locale) ---------------------------------------------------------
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-'’]/g, ' ');
let communes: Commune[] = [];
let matches: Commune[] = [];
const communeLabel = (c: Commune) => `${c.nom} (${c.dep})`;

async function onSearchInput(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!communes.length) communes = await loadCommunes();
  const exact = matches.find((c) => communeLabel(c) === input.value);
  if (exact) {
    selectPoint(exact.lat, exact.lon, true);
    input.blur();
    return;
  }
  const q = norm(input.value.trim());
  if (q.length < 2) return;
  matches = communes.filter((c) => norm(c.nom).startsWith(q)).slice(0, 8);
  $('search-list').innerHTML = matches.map((c) => `<option value="${esc(communeLabel(c))}"></option>`).join('');
}

function onSearchSubmit(e: KeyboardEvent) {
  if (e.key !== 'Enter') return;
  const input = e.target as HTMLInputElement;
  const q = norm(input.value.replace(/\s*\(.*\)$/, '').trim());
  const c = matches.find((m) => communeLabel(m) === input.value) ?? matches.find((m) => norm(m.nom) === q) ?? matches[0];
  if (c) {
    input.value = communeLabel(c);
    selectPoint(c.lat, c.lon, true);
  } else setStatus('Commune introuvable.');
}

function locate() {
  if (!('geolocation' in navigator)) return setStatus('Géolocalisation non disponible sur cet appareil.');
  setStatus('Localisation en cours (calcul local, rien n’est envoyé)…');
  navigator.geolocation.getCurrentPosition(
    (p) => {
      userPos = { lat: p.coords.latitude, lon: p.coords.longitude };
      setStatus('Position trouvée. Les spots sont triés dans un rayon de 250 km.');
      selectPoint(userPos.lat, userPos.lon, true);
    },
    () => setStatus('Position refusée ou indisponible.'),
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
  );
}

function bindEvents() {
  $('objectives').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-obj]');
    if (!b) return;
    state.obj = b.dataset.obj as AppState['obj'];
    renderControls();
    syncHash();
    recompute();
  });
  $('nights').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-night]');
    if (!b) return;
    state.night = Number(b.dataset.night);
    renderControls();
    syncHash();
    recompute();
  });
  document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const id = cb.dataset.layer as LayerId;
      if (cb.checked) state.layers.add(id);
      else state.layers.delete(id);
      skyMap.setVisible(state.layers);
      renderLegend();
      syncHash();
    }),
  );
  $('top-spots').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-spot]');
    if (b) selectSpot(b.dataset.spot!, true);
  });
  $('red-toggle').addEventListener('click', () => {
    state.red = !state.red;
    renderControls();
    syncHash();
  });
  $('panel-toggle').addEventListener('click', () => {
    const body = $('panel-body');
    const open = body.hidden;
    body.hidden = !open;
    $('panel-toggle').setAttribute('aria-expanded', String(open));
    $('panel-toggle').textContent = open ? 'Réduire' : 'Ouvrir';
    $('app').classList.toggle('collapsed', !open);
    skyMap.map.resize();
  });
  const search = $<HTMLInputElement>('search');
  search.addEventListener('input', onSearchInput);
  search.addEventListener('keydown', onSearchSubmit);
  search.addEventListener('focus', () => void loadCommunes().then((c) => (communes = c)), { once: true });
  $('locate').addEventListener('click', locate);
  window.addEventListener('hashchange', () => {
    if (location.hash === toHash(state)) return;
    state = parseHash(location.hash);
    renderControls();
    skyMap.setVisible(state.layers);
    recompute();
  });
}

async function init() {
  renderControls();
  setStatus('Chargement des données…');
  const [l, w, a, s] = await Promise.all([loadLight(), loadWeather(), loadAurora(), loadSpots()]);
  light = l;
  wi = w ? new WeatherIndex(w) : null;
  kp = a;
  spots = s;

  skyMap = new SkyMap($('map'), state.view, light, {
    onSpot: (id) => selectSpot(id),
    onPoint: (lat, lon) => selectPoint(lat, lon),
    onMove: (lat, lon, zoom) => {
      state.view = { lat, lon, zoom };
      syncHash();
    },
  });
  skyMap.setLightImage(paintLight(light));
  skyMap.setVisible(state.layers);
  bindEvents();
  recompute();

  const fresh = $('freshness');
  if (w) {
    const age = (Date.now() - Date.parse(w.generatedAt)) / 3_600_000;
    fresh.textContent = `Prévisions météo générées le ${new Date(w.generatedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.`;
    setStatus(age > 9 ? `Attention : prévisions datant de ${Math.round(age)} h.` : '');
  } else {
    setStatus('Prévisions météo indisponibles : le score suppose un ciel dégagé.');
  }
  syncHash();
}

init().catch((err) => {
  console.error(err);
  setStatus('Erreur de chargement des données. Réessayez plus tard.');
});
