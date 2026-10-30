// Réserves internationales de ciel étoilé (RICE, DarkSky International) en France métropolitaine.
// Positions approximatives (centre de la zone cœur) et années de labellisation À VÉRIFIER sur
// https://darksky.org/places/ — la liste évolue chaque année.
// Les territoires labellisés « Villes et villages étoilés » (ANPCEN) ne sont pas encore intégrés.

export interface Reserve {
  name: string;
  lat: number;
  lon: number;
  since: string;
}

export const RESERVES: Reserve[] = [
  { name: 'RICE du Pic du Midi', lat: 42.94, lon: 0.14, since: '2013' },
  { name: 'RICE des Cévennes', lat: 44.3, lon: 3.6, since: '2018' },
  { name: 'RICE Alpes Azur Mercantour', lat: 44.1, lon: 7.1, since: '2019' },
  { name: 'RICE de Millevaches en Limousin', lat: 45.65, lon: 2.05, since: '2021-2022' },
  { name: 'RICE du Vercors', lat: 44.95, lon: 5.45, since: 'à vérifier' },
  { name: 'RICE des Landes de Gascogne', lat: 44.3, lon: -0.75, since: 'à vérifier' },
  { name: 'RICE du Morvan', lat: 47.2, lon: 4.05, since: '2025 (à vérifier)' },
];
