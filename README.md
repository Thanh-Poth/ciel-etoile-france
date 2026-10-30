# Ciel étoilé France

Application web gratuite qui indique **où observer le ciel étoilé en France métropolitaine ce soir et les 3 nuits suivantes**. On choisit ce qu'on veut observer ; la carte affiche alors un score de la nuit (0 à 100) par zone et les spots accessibles en voiture.

- Objectifs : Voie lactée, étoiles filantes, planètes, Lune, ciel profond, aurores (avec la probabilité réelle, très faible en France).
- Score par maille de 1/40° (≈ 2,5 km). Il combine la pollution lumineuse (classe de Bortle estimée), les nuages bas, moyens et hauts heure par heure, la Lune, l'humidité et la brume, le vent et l'altitude.
- Couches : score de la nuit, pollution lumineuse, 50 spots (cols, belvédères et sommets avec parking, d'après OpenStreetMap), réserves internationales de ciel étoilé.
- Panneau « Ce soir » : nuit astronomique, lever et coucher de la Lune, planètes visibles, prochains événements (essaims d'étoiles filantes, éclipses). Tout est calculé dans le navigateur.
- Courbe heure par heure pour le spot ou le point sélectionné, choix de la nuit parmi 4.
- Recherche de commune hors ligne, bouton « Me localiser » traité localement, état partageable dans l'URL (`#o=deepsky&n=1&…`), mode lumière rouge, interface mobile d'abord, en français.

Application statique (Vite + TypeScript + MapLibre GL JS), sans backend, sans clé API et sans service payant.

## Installation

Prérequis : Node.js 20 ou plus récent.

```bash
npm ci
npm run fetch:weather   # prévisions du moment → public/data/weather.json et aurora.json
npm run dev             # http://localhost:5173
```

Autres commandes :

| Commande | Rôle |
| --- | --- |
| `npm test` | tests unitaires (score, éphémérides comparées à des références, état de l'URL, aurores) |
| `npm run lint` | ESLint (TypeScript) |
| `npm run build` | vérification des types + build de production dans `dist/` |
| `npm run preview` | sert le build localement |

## Données préparées au build (versionnées)

Ces fichiers changent rarement. Ils sont générés une fois puis commités dans `public/data/` :

| Fichier | Script | Source |
| --- | --- | --- |
| `light.bin`, `light.json` | `npm run prepare:light -- <chemin>/World_Atlas_2015.tif` | Atlas Falchi et al. (voir plus bas). Il faut télécharger `World_Atlas_2015.zip` (653 Mo) depuis [GFZ Data Services](https://doi.org/10.5880/GFZ.1.4.2016.001) puis le décompresser. Le fichier source n'est pas versionné. |
| `communes.json` | `npm run prepare:communes` | geo.api.gouv.fr |
| `spots.json` | `npm run prepare:spots` (50 par défaut) | OpenStreetMap via Overpass API, requêtes découpées en tuiles |

Le contour de la France (masque) provient de Natural Earth ; il est téléchargé dans `.cache/` (ignoré par git).

## Workflow planifié (prévisions toutes les 3 heures)

Le fichier `.github/workflows/deploy.yml` s'exécute toutes les 3 heures (`cron: '20 */3 * * *'`), à chaque push sur `main`, et peut aussi être lancé à la main. Il enchaîne :

1. `npm ci`, lint et tests ;
2. `npm run fetch:weather` : interroge Open-Meteo sur une grille de 0,5° couvrant la France (≈ 380 points, par lots de 50 espacés de 8 s), puis la prévision Kp du NOAA ;
3. build, puis publication sur GitHub Pages.

Les prévisions ne sont **pas commitées** : l'historique git ne grossit pas. Si une API est indisponible, le job échoue et la version déjà en ligne reste servie ; l'application signale des prévisions de plus de 9 heures.

Volume : environ 380 appels × 8 exécutions ≈ 3 000 appels par jour, sous la limite gratuite d'Open-Meteo (10 000 par jour). Le navigateur des visiteurs n'appelle jamais Open-Meteo.

> GitHub suspend les workflows planifiés d'un dépôt public resté 60 jours sans activité. Il suffit alors de les réactiver dans l'onglet *Actions*.

## Déploiement gratuit

### GitHub Pages (recommandé)

1. Créer un dépôt GitHub et y pousser le projet (branche `main`).
2. *Settings → Pages → Build and deployment → Source : GitHub Actions*.
3. Lancer le workflow une fois (*Actions → Prévisions et déploiement → Run workflow*).

Le build utilise des chemins relatifs (`base: './'`) et fonctionne donc dans le sous-dossier `https://<compte>.github.io/<dépôt>/`.

### Cloudflare Pages (alternative)

Créer un projet Pages relié au dépôt avec la commande de build `npm run fetch:weather && npm run build` et le dossier de sortie `dist`. Pour rafraîchir les prévisions toutes les 3 heures, il faut un *Deploy Hook* (gratuit), appelé par un cron, par exemple un workflow GitHub qui fait un `curl -X POST` sur l'URL du hook, stockée en secret.

### Option PMTiles auto-hébergées (fond de carte)

Par défaut, le fond sombre vient d'[OpenFreeMap](https://openfreemap.org/) (gratuit, sans clé ni cookie). Pour ne dépendre d'aucun tiers :

1. extraire la France d'un planet Protomaps : `pmtiles extract https://build.protomaps.com/<date>.pmtiles france.pmtiles --bbox=-5.5,41.2,10,51.3` ;
2. héberger `france.pmtiles` sur un stockage gratuit qui gère les requêtes HTTP Range (Cloudflare R2, par exemple ; GitHub Pages limite les fichiers à 100 Mo) ;
3. écrire un style MapLibre dont la source est `pmtiles://https://…/france.pmtiles` (par exemple avec le paquet `@protomaps/basemaps`), puis builder avec `VITE_MAP_STYLE=https://…/style.json npm run build`.

Le protocole `pmtiles://` est déjà enregistré dans l'application. Si le fond de carte est injoignable, l'application bascule sur un fond uni et les couches restent utilisables.

## Sources et licences

| Donnée | Source | Licence / conditions | Accès |
| --- | --- | --- | --- |
| Pollution lumineuse (luminance artificielle du ciel, 2015) | Falchi F. et al. (2016), *Supplement to: The New World Atlas of Artificial Night Sky Brightness*, GFZ Data Services, [doi:10.5880/GFZ.1.4.2016.001](https://doi.org/10.5880/GFZ.1.4.2016.001), article [Science Advances](https://doi.org/10.1126/sciadv.1600377) | **CC BY-NC 4.0** (métadonnées DOI officielles, depuis la fin de l'embargo en novembre 2019). Le README de l'archive, daté de 2016, mentionnait une interdiction de redistribution et précisait que les évolutions seraient annoncées sur la page d'accès ; la licence publiée aujourd'hui est CC BY-NC 4.0. **Usage non commercial uniquement, double citation obligatoire.** | Téléchargement libre, sans compte |
| Météo (nuages bas/moyens/hauts, humidité, visibilité, vent, température) | [Open-Meteo](https://open-meteo.com/) | Données CC BY 4.0 ; API gratuite réservée à l'usage non commercial (< 10 000 appels/jour) | Sans clé, appelée par le workflow uniquement |
| Spots (cols, belvédères, sommets, parkings) | © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright) via Overpass API | ODbL 1.0 : `spots.json` est une base dérivée, publiée sous ODbL | Sans clé |
| Fond de carte | [OpenFreeMap](https://openfreemap.org/), © OpenMapTiles, données OpenStreetMap | Gratuit, sans limite déclarée, attribution | Sans clé ni cookie |
| Communes | [geo.api.gouv.fr](https://geo.api.gouv.fr/) | Licence Ouverte / Etalab 2.0 | Sans clé |
| Contour de la France | [Natural Earth](https://www.naturalearthdata.com/) 1:50m | Domaine public | — |
| Indice Kp prévu | [NOAA SWPC](https://www.swpc.noaa.gov/) | Domaine public (gouvernement américain) | Sans clé, appelé par le workflow |
| Éphémérides | [astronomy-engine](https://github.com/cosinekitty/astronomy) | MIT | Bibliothèque embarquée |
| Carte | [MapLibre GL JS](https://maplibre.org/), [pmtiles](https://github.com/protomaps/PMTiles) | BSD-3-Clause | Bibliothèques embarquées |
| Réserves internationales de ciel étoilé | [DarkSky International](https://darksky.org/places/) | Liste et positions approximatives saisies à la main, **à vérifier** | — |

Sources étudiées mais non retenues :

- **VIIRS (Earth Observation Group, Colorado School of Mines)** : radiance mesurée par satellite, plus récente, sous CC BY 4.0 pour la plupart des produits. Le téléchargement exige un compte gratuit et donne une radiance au sol, pas une luminance du ciel ; il faudrait un modèle de propagation pour l'utiliser. C'est une piste pour une mise à jour.
- **Trame noire (data.gouv.fr, Cerema, OFB)** : les jeux de données sont locaux (métropoles, parcs) et hétérogènes. Certains sont sous Licence Ouverte, d'autres n'ont pas de licence explicite. Ils ne couvrent pas tout le territoire.

Toutes les attributions sont affichées dans l'application (attribution de la carte et rubrique « Sources, licences et confidentialité »).

**Conséquence importante : l'application doit rester non commerciale** (CC BY-NC pour l'atlas, conditions de l'API gratuite Open-Meteo) : pas de publicité, pas d'abonnement.

## Méthode du score

Pour chaque heure de la nuit et chaque lieu :

```
score_h = 100 × crépuscule × cible × Π facteur_i ^ poids_i
```

| Facteur (0 à 1) | Calcul |
| --- | --- |
| Obscurité du site | SQM (mag/arcsec²) issu de l'atlas Falchi (luminance artificielle + 0,171 mcd/m² naturelle) : 18 → 0,05 ; 21,9 → 1 |
| Ciel dégagé | (1 − bas) × (1 − 0,9·moyens) × (1 − k·hauts), avec k entre 0,4 et 0,85 selon l'objectif (les cirrus fins gênent peu les planètes) |
| Lune | 1 − 0,85 × fraction éclairée × f(hauteur) ; vaut 1 sous l'horizon |
| Brume | humidité > 75 % (rosée, brume) et visibilité < 20 km |
| Vent | 10 km/h → 1 ; 50 km/h → 0,2 |
| Altitude | 0,85 au niveau de la mer → 1 à partir de 1 500 m |
| Crépuscule (porte) | nuit astronomique (Soleil < −18°) ou nautique selon l'objectif |
| Cible (porte) | Voie lactée : centre galactique levé (sinon 0,7) ; planètes : hauteur de la plus haute planète brillante ; Lune : Lune levée et non nouvelle ; aurores : probabilité selon Kp |

Poids (exposants) par objectif :

| Objectif | Obscurité | Nuages | Lune | Brume | Vent | Altitude | Nuit requise |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Voie lactée | 1,6 | 1,4 | 1,3 | 0,8 | 0,15 | 0,5 | astronomique |
| Étoiles filantes | 1,0 | 1,4 | 1,0 | 0,6 | 0,15 | 0,3 | astronomique |
| Planètes | 0,15 | 1,2 | 0,05 | 0,4 | 0,6 | 0,3 | nautique |
| Lune | 0 | 1,2 | — | 0,4 | 0,4 | 0,2 | nautique |
| Ciel profond | 1,8 | 1,5 | 1,6 | 1,0 | 0,4 | 0,6 | astronomique |
| Aurores | 0,5 | 1,4 | 0,5 | 0,6 | 0,1 | 0,2 | astronomique |

Le **score de la nuit** est la meilleure moyenne sur 2 heures consécutives : un créneau stable vaut mieux qu'un trou isolé. La météo est interpolée (bilinéaire) depuis la grille de 0,5° ; le Soleil, la Lune et les planètes sont calculés heure par heure avec astronomy-engine. La Lune est calculée au centre de la France (parallaxe négligeable à l'échelle du score).

**Aurores** : il faut un Kp d'environ 7 + (51 − latitude) / 2,5 pour une lueur visible à l'œil nu (≈ 8 à Paris, 9 et plus dans le Midi). La probabilité affichée suit une sigmoïde plafonnée à 80 %. En pratique, elle est presque toujours nulle.

Ces pondérations sont empiriques. Elles sont faites pour classer les zones entre elles, pas pour prédire une magnitude limite.

## Confidentialité

- Aucun compte, aucun cookie, aucun outil d'analyse d'audience, aucun traceur.
- La position (« Me localiser ») est demandée seulement au clic, utilisée dans le navigateur et jamais transmise ni enregistrée.
- La recherche de commune se fait localement, sur une liste téléchargée avec le site : aucune requête de géocodage n'est envoyée.
- Polices système et bibliothèques empaquetées avec le site : aucun CDN.
- Seules les tuiles du fond de carte sont chargées depuis OpenFreeMap (sans cookie). Comme toute requête web, elle transmet l'adresse IP à ce serveur. L'option PMTiles auto-hébergées supprime cette dépendance.
- L'état de l'application (objectif, nuit, vue) est stocké dans le hash de l'URL, qui n'est jamais envoyé au serveur.
- Le dépôt ne contient aucune donnée personnelle (auteur des commits : `anonymous`), et `.env` est exclu par `.gitignore`.

## Sécurité

- **Aucun secret** : ni clé API, ni jeton, ni mot de passe dans le code ou le workflow (toutes les sources sont publiques et sans clé).
- **Politique CSP** injectée au build : scripts du site uniquement (pas de script en ligne ni d'`eval`), connexions limitées au site et au serveur du fond de carte, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`. Avec un style PMTiles personnel, son origine est ajoutée automatiquement (`VITE_MAP_STYLE`, ou `VITE_EXTRA_ORIGINS` pour d'autres origines).
- **Données affichées** : les noms issus d'OpenStreetMap et des communes sont échappés avant insertion HTML. Les spots sont validés au chargement (identifiant, type, coordonnées). L'état lu dans l'URL est filtré par une liste blanche.
- **Workflow** : permissions minimales par job (`contents: read` pour le build ; `pages: write` et `id-token: write` pour la seule publication), actions épinglées par SHA de commit, `persist-credentials: false`, `npm ci --ignore-scripts`, `npm audit` bloquant sur les failles hautes.
- **Dependabot** propose chaque mois les mises à jour npm et GitHub Actions.
- Liens externes en `rel="noopener noreferrer"` et `referrer` désactivé.

## Avertissements

Routes de montagne de nuit (verglas, faune, absence de réseau), cols d'altitude fermés l'hiver, froid nocturne même en été, stationnement interdit sur les terrains privés et dans certaines zones protégées : la présence d'un parking dans OpenStreetMap ne garantit pas qu'il soit autorisé la nuit. Les prévisions nuageuses sont indicatives.

## Licence

Code sous licence MIT (voir `LICENSE`). Les données de `public/data/` restent soumises à leurs licences respectives (voir le tableau ci-dessus).
