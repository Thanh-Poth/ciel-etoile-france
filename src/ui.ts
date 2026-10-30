// Rendu HTML du panneau latéral (chaînes échappées : les noms viennent d'OpenStreetMap).
import { fmtDay, fmtTime, type NightEphemeris, type SkyEvent } from './astro';
import { kpNeeded } from './aurora';
import type { PlaceNight } from './model';
import { BORTLE_COLORS, scoreCss } from './render';
import { bortleFromSqm, type Objective } from './score';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Nombre au format français (virgule décimale). */
export const num = (x: number, digits: number) =>
  x.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const KIND_LABEL = { col: 'Col', belvedere: 'Belvédère', sommet: 'Sommet' } as const;

export function scoreBadge(v: number | null): string {
  if (v === null) return '<span class="badge na">—</span>';
  const r = Math.round(v);
  // Texte clair sur les teintes sombres (scores faibles), foncé sur les teintes claires.
  return `<span class="badge" style="--c:${scoreCss(r)};--t:${r < 55 ? '#fff' : '#10121f'}" aria-label="score ${r} sur 100">${r}</span>`;
}

export const scoreWord = (v: number | null) =>
  v === null ? 'indisponible' : v >= 70 ? 'excellente' : v >= 50 ? 'bonne' : v >= 30 ? 'moyenne' : v >= 10 ? 'médiocre' : 'défavorable';

/** Courbe heure par heure (barres SVG) + tableau équivalent pour les lecteurs d'écran. */
export function hourlyChart(p: PlaceNight): string {
  const W = 340;
  const H = 120;
  const n = p.hourly.length;
  const bw = W / n;
  const bars = p.hourly
    .map((h, i) => {
      const v = Math.max(0, h.score);
      const bh = (v / 100) * (H - 22);
      const best = h.time === p.bestTime;
      const label = fmtTime(new Date(h.time));
      return `<g><title>${label} : ${Math.round(v)}/100</title><rect x="${(i * bw + 1).toFixed(1)}" y="${(H - 18 - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.max(1, bh).toFixed(1)}" rx="2" fill="${scoreCss(v)}"${best ? ' stroke="#ffe66d" stroke-width="2"' : ''}/>${
        i % 2 === 0 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${label.slice(0, 2)}h</text>` : ''
      }</g>`;
    })
    .join('');
  const rows = p.hourly
    .map((h) => {
      const w = h.detail.weather;
      return `<tr><th scope="row">${fmtTime(new Date(h.time))}</th><td>${Math.round(h.score)}</td><td>${w ? Math.round(Math.max(w.cl, w.cm, w.ch)) + ' %' : '—'}</td><td>${w ? Math.round(w.rh) + ' %' : '—'}</td><td>${w ? Math.round(w.wind) : '—'}</td><td>${w ? Math.round(w.temp) + ' °C' : '—'}</td><td>${Math.round(h.detail.cond.moonAlt)}°</td></tr>`;
    })
    .join('');
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Score heure par heure, meilleur créneau à ${fmtTime(p.bestTime ? new Date(p.bestTime) : null)}">${bars}</svg>
    <figcaption>Score heure par heure (heure de Paris). Contour jaune : meilleur créneau.</figcaption>
  </figure>
  <details><summary>Détail horaire (nuages, humidité, vent, Lune)</summary>
    <table class="hours"><thead><tr><th scope="col">Heure</th><th scope="col">Score</th><th scope="col">Nuages max</th><th scope="col">Humidité</th><th scope="col">Vent km/h</th><th scope="col">Temp.</th><th scope="col">Lune</th></tr></thead><tbody>${rows}</tbody></table>
  </details>`;
}

export function placeSection(title: string, subtitle: string, p: PlaceNight, extra = ''): string {
  const bortle = bortleFromSqm(p.sqm);
  return `<h2>${esc(title)}</h2>
    <p class="sub">${subtitle}</p>
    <div class="summary">
      ${scoreBadge(p.night)}
      <div><strong>Nuit ${scoreWord(p.night)}</strong><br/>Meilleur moment : ${fmtTime(p.bestTime ? new Date(p.bestTime) : null)}</div>
    </div>
    <p class="sky"><span class="swatch" style="background:${BORTLE_COLORS[bortle - 1]}"></span>Ciel : ${num(p.sqm, 2)} mag/arcsec² — Bortle ≈ ${bortle} (estimation)</p>
    ${extra}
    ${hourlyChart(p)}`;
}

export function tonightSection(e: NightEphemeris, events: SkyEvent[], obj: Objective, kp: number | null, auroraProb: number, lat: number): string {
  const night =
    e.astroDusk && e.astroDawn
      ? `Nuit astronomique : ${fmtTime(e.astroDusk)} → ${fmtTime(e.astroDawn)}`
      : 'Pas de nuit astronomique complète (Soleil jamais à −18°) : ciel jamais totalement noir.';
  const planets = e.planets.length
    ? e.planets.map((p) => `${p.name} (mag ${num(p.mag, 1)}, ${p.maxAlt}° vers ${fmtTime(p.at)})`).join(', ')
    : 'aucune planète brillante bien placée';
  const aurora =
    obj === 'aurora' || auroraProb > 0.01
      ? `<li><strong>Aurores :</strong> Kp max prévu ${kp === null ? 'inconnu' : num(kp, 1)} ; il faut environ Kp ${num(Math.min(9, kpNeeded(lat)), 1)}${kpNeeded(lat) > 9 ? '+ (tempête extrême)' : ''} à cette latitude. Probabilité réelle d'une aurore visible à l'œil nu : <strong>${auroraProb < 0.01 ? '< 1 %' : Math.round(auroraProb * 100) + ' %'}</strong>. En France, c'est l'affaire de quelques nuits par décennie (ex. mai et octobre 2024) ; un appareil photo la détecte un peu plus souvent.</li>`
      : '';
  return `<h2>Ce soir et cette nuit</h2>
    <ul class="facts">
      <li>Coucher du Soleil ${fmtTime(e.sunset)}, lever ${fmtTime(e.sunrise)}</li>
      <li>${night}</li>
      <li>Lune : ${e.moonPhaseName}, ${Math.round(e.moonIllum * 100)} % éclairée — lever ${fmtTime(e.moonrise)}, coucher ${fmtTime(e.moonset)}</li>
      <li>Planètes : ${planets}</li>
      ${aurora}
    </ul>
    <h3>Prochains événements</h3>
    <ul class="events">${events.map((ev) => `<li><time datetime="${ev.date.toISOString()}">${fmtDay(ev.date)}</time> — <strong>${esc(ev.title)}</strong> : ${esc(ev.detail)}</li>`).join('')}</ul>`;
}
