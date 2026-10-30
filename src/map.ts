// Carte MapLibre : fond sombre OpenFreeMap (ou style PMTiles auto-hébergé), couches du score, de la
// pollution lumineuse, des spots et des réserves.
import { AttributionControl, Map as MlMap, NavigationControl, ScaleControl, addProtocol, setWorkerUrl, type GeoJSONSource, type ImageSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Le worker de MapLibre v6 est un fichier séparé : Vite le copie dans le build et on lui indique son URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import type { FeatureCollection } from 'geojson';
import type { LightGrid, Spot } from './data';
import { gridCoordinates, SCORE_STOPS } from './render';
import { RESERVES } from './reserves';
import type { LayerId } from './state';

// VITE_MAP_STYLE permet de pointer vers un style utilisant des PMTiles auto-hébergées (pmtiles://...).
const STYLE_URL: string = import.meta.env.VITE_MAP_STYLE || 'https://tiles.openfreemap.org/styles/dark';
const ATTRIBUTION =
  'Pollution lumineuse : Falchi et al. 2016 (CC BY-NC 4.0) · Météo : <a href="https://open-meteo.com/">Open-Meteo</a> · Spots : © contributeurs OpenStreetMap';

const FALLBACK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'bg', type: 'background' as const, paint: { 'background-color': '#070914' } }],
};

export interface MapHandlers {
  onSpot: (id: string) => void;
  onPoint: (lat: number, lon: number) => void;
  onMove: (lat: number, lon: number, zoom: number) => void;
}

export class SkyMap {
  readonly map: MlMap;

  constructor(container: HTMLElement, view: { lat: number; lon: number; zoom: number }, private light: LightGrid, h: MapHandlers) {
    setWorkerUrl(workerUrl);
    addProtocol('pmtiles', new Protocol().tile);
    this.map = new MlMap({
      container,
      style: STYLE_URL,
      center: [view.lon, view.lat],
      zoom: view.zoom,
      minZoom: 4,
      maxZoom: 14,
      maxBounds: [
        [-12, 38],
        [17, 54],
      ],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    this.map.addControl(new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');

    let styleFailed = false;
    this.map.on('error', (e) => {
      // Fond de carte injoignable (hors ligne…) : on bascule sur un fond uni pour garder les couches.
      const failedUrl = (e.error as { url?: string } | undefined)?.url;
      if (!styleFailed && failedUrl === STYLE_URL) {
        styleFailed = true;
        this.map.setStyle(FALLBACK_STYLE);
      }
    });

    this.map.on('style.load', () => this.addOverlays());
    // Attribution repliée au départ (bouton « i ») pour ne pas masquer la carte sur mobile.
    this.map.once('load', () => container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));

    this.map.on('click', (e) => {
      const hit = this.map.queryRenderedFeatures(e.point, { layers: ['spots'].filter((l) => this.map.getLayer(l)) });
      if (hit.length) h.onSpot(String(hit[0].properties.id));
      else h.onPoint(e.lngLat.lat, e.lngLat.lng);
    });
    this.map.on('mouseenter', 'spots', () => (this.map.getCanvas().style.cursor = 'pointer'));
    this.map.on('mouseleave', 'spots', () => (this.map.getCanvas().style.cursor = ''));
    this.map.on('moveend', () => {
      const c = this.map.getCenter();
      h.onMove(c.lat, c.lng, this.map.getZoom());
    });
  }


  private firstSymbolLayer(): string | undefined {
    return this.map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  }

  private overlayData = {
    score: null as HTMLCanvasElement | null,
    light: null as HTMLCanvasElement | null,
    spots: { type: 'FeatureCollection', features: [] } as FeatureCollection,
    selection: { type: 'FeatureCollection', features: [] } as FeatureCollection,
    visible: new Set<LayerId>(),
  };

  private addOverlays() {
    const m = this.map;
    const coords = gridCoordinates(this.light);
    const before = this.firstSymbolLayer();
    for (const id of ['light', 'score'] as const) {
      m.addSource(id, { type: 'image', coordinates: coords } as never);
      m.addLayer({ id, type: 'raster', source: id, paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, before);
      const canvas = this.overlayData[id];
      if (canvas) (m.getSource(id) as ImageSource).updateImage({ image: canvas });
    }
    m.addSource('reserves', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: RESERVES.map((r) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties: { name: r.name } })),
      },
    });
    m.addLayer({
      id: 'reserves',
      type: 'circle',
      source: 'reserves',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 14, 9, 60], 'circle-color': '#7fb2ff', 'circle-opacity': 0.12, 'circle-stroke-color': '#7fb2ff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.8 },
    });
    m.addSource('spots', { type: 'geojson', data: this.overlayData.spots });
    const ramp: unknown[] = ['interpolate', ['linear'], ['get', 'score']];
    for (const [v, [r, g, b]] of SCORE_STOPS) ramp.push(v, `rgb(${r},${g},${b})`);
    m.addLayer({
      id: 'spots',
      type: 'circle',
      source: 'spots',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 9],
        'circle-color': ramp as never,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    });
    m.addSource('selection', { type: 'geojson', data: this.overlayData.selection });
    m.addLayer({
      id: 'selection',
      type: 'circle',
      source: 'selection',
      paint: { 'circle-radius': 11, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffe66d', 'circle-stroke-width': 3 },
    });
    this.applyVisibility();
  }

  setScoreImage(canvas: HTMLCanvasElement) {
    this.overlayData.score = canvas;
    (this.map.getSource('score') as ImageSource | undefined)?.updateImage({ image: canvas });
  }

  setLightImage(canvas: HTMLCanvasElement) {
    this.overlayData.light = canvas;
    (this.map.getSource('light') as ImageSource | undefined)?.updateImage({ image: canvas });
  }

  setSpots(spots: Spot[], scores: Map<string, number | null>) {
    this.overlayData.spots = {
      type: 'FeatureCollection',
      features: spots.map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: { id: s.id, name: s.name, score: scores.get(s.id) ?? 0 },
      })),
    };
    (this.map.getSource('spots') as GeoJSONSource | undefined)?.setData(this.overlayData.spots);
  }

  setSelection(lat: number | null, lon: number | null) {
    this.overlayData.selection = {
      type: 'FeatureCollection',
      features: lat === null || lon === null ? [] : [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} }],
    };
    (this.map.getSource('selection') as GeoJSONSource | undefined)?.setData(this.overlayData.selection);
  }

  setVisible(layers: Set<LayerId>) {
    this.overlayData.visible = new Set(layers);
    this.applyVisibility();
  }

  private applyVisibility() {
    for (const id of ['score', 'light', 'spots', 'reserves'] as const) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', this.overlayData.visible.has(id) ? 'visible' : 'none');
    }
  }

  flyTo(lat: number, lon: number, zoom = 9) {
    this.map.flyTo({ center: [lon, lat], zoom: Math.max(this.map.getZoom(), zoom) });
  }
}
