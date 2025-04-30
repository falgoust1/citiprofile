// === IMPORTS & CONSTANTES GLOBALES ===
// Importation des couches Deck.gl utilisées dans l'application
const {
  DeckGL, ScatterplotLayer, ScreenGridLayer, GridLayer,
  HeatmapLayer, HexagonLayer, DataFilterExtension,
  GeoJsonLayer, FlyToInterpolator
} = deck;

// Indicateur de mode split (comparaison entre deux vues)
let isSplit = false;
// Activation de la synchronisation miroir entre deux vues
let mirrorEnabled = false;
// Stockage des points groupés par type de transport
let globalGeo = null;
// Pour éviter la boucle infinie lors de la synchro des vues
let syncingView = false;
// Paramètres de la couche Heatmap
let heatmapThreshold = 0.03;
let heatmapRadius = 30;
// Polygone sélectionné (quartier cliqué)
let selectedQuartierPolygon = null;

// Contiendra les différentes instances DeckGL (single, left, right)
const instances = {};

// Dictionnaire des catégories de transport utilisées, avec clé, libellé et couleur
const CATEGORY_MAP = {
  1:  { key:'aerien',   label:'Aérien',          color:[161, 66, 244] },
  30: { key:'eau',      label:'Eau',             color:[  0,188,212] },
  60: { key:'inconnu',  label:'Inconnu',         color:[158,158,158] },
  61: { key:'pieton',   label:'Piéton',          color:[ 45,175, 69] },
  62: { key:'mobilite', label:'Mobilité douce',  color:[244,180,  0] },
  63: { key:'voiture',  label:'Voiture',         color:[  7, 55,117] }
};

// Configuration par défaut pour chaque vue (position carte, filtres actifs, etc.)
const defaultState = {
  viewState: {
    longitude: -1.6992,
    latitude: 48.1119,
    zoom: 14,
    pitch: 40, //Inclinaison
    bearing: 0
  },
  filters: {
    aerien: true,
    eau: true,
    inconnu: true,
    pieton: true,
    mobilite: true,
    voiture: true,
    // Initialisation avec tous les mois et jours cochés
    months: [1,2,3,4,5,6,7,8,9,10,11,12],
    daysOfWeek: ['L', 'Ma', 'Me', 'J', 'V', 'S', 'D'],
    hours: [0, 23],
    daysOfMonth: [1, 31]
  },
  // Type de couche affichée initialement
  layerType: 'scatter',
  // Valeur max utilisée pour le filtre de points dans les bâtiments
  sliderValue: 1000,
  // Taille de cellule utilisée pour certaines couches
  cellSize: 20
};

// === CHARGEMENT DES DONNÉES GEOJSON ===
fetch("1milion_ok.geojson") // Appel réseau pour charger le fichier contenant les points GPS
  .then(res => res.json())  // Une fois chargé, on le convertit en objet JavaScript
  .then(geojson => {
    const points = [];

    // On parcourt toutes les entités GeoJSON
    geojson.features.forEach(f => {
      const g = f.geometry;
      if (!g || !g.coordinates) return; // On ignore les géométries nulles

      // Si le point est de type MultiPoint (plusieurs coordonnées)
      if (g.type === 'MultiPoint') {
        g.coordinates.forEach(coord => {
          points.push({ lon: coord[0], lat: coord[1], ...f.properties });
        });
      }
      // Si c’est un seul Point (cas le plus courant)
      else if (g.type === 'Point') {
        const [lon, lat] = g.coordinates;
        points.push({ lon, lat, ...f.properties });
      }
    });

    // On s’assure que la propriété de type de transport est bien un nombre
    points.forEach(d => d.transp_kind = Number(d.transp_kind));

    // Création d’un objet contenant les points regroupés par catégorie (aérien, voiture, etc.)
    globalGeo = {};
    Object.entries(CATEGORY_MAP).forEach(([kind, { key }]) => {
      globalGeo[key + 'Pts'] = points.filter(p => p.transp_kind === +kind);
    });

    // Initialisation de la vue unique (vue principale par défaut)
    instances.single = createInstance({
      container: 'deck-canvas-single',
      controlsPrefix: 'single',
      donutId: 'donut-single',
      initialState: defaultState,
      geo: globalGeo
    });

    // Gestion du bouton "Exporter PDF"
document.getElementById('btn-export-pdf').addEventListener('click', async () => {
  const { jsPDF } = window.jspdf;

  if (!instances.single || !instances.single.deckgl) {
    console.warn("DeckGL non prêt pour export.");
    return;
  }

  const mapCanvas = document.querySelector('.maplibregl-canvas') || document.querySelector('.mapboxgl-canvas');
  const deckCanvas = instances.single.deckgl.canvas;

  if (!mapCanvas || !deckCanvas) {
    console.warn("Canvas Mapbox ou DeckGL introuvable.");
    return;
  }

  const mergedCanvas = document.createElement('canvas');
  mergedCanvas.width = deckCanvas.width;
  mergedCanvas.height = deckCanvas.height;
  const mergedCtx = mergedCanvas.getContext('2d');
  mergedCtx.drawImage(mapCanvas, 0, 0);
  mergedCtx.drawImage(deckCanvas, 0, 0);

  const deckImage = new Image();
  deckImage.src = mergedCanvas.toDataURL('image/png');
  await new Promise((resolve, reject) => {
    deckImage.onload = resolve;
    deckImage.onerror = reject;
  });

  const headerCanvas = await html2canvas(document.getElementById('header'));
  const legendCanvas = await html2canvas(document.getElementById('legend-block'));
  const chartsCanvas = await html2canvas(document.getElementById('chart-panel-single'));

  const width = Math.max(mergedCanvas.width, headerCanvas.width, legendCanvas.width, chartsCanvas.width);
  const totalHeight = headerCanvas.height + mergedCanvas.height + legendCanvas.height + chartsCanvas.height;

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = totalHeight;
  const ctx = finalCanvas.getContext('2d');

  let y = 0;
  ctx.drawImage(headerCanvas, 0, y); y += headerCanvas.height;
  ctx.drawImage(deckImage, 0, y); y += deckImage.height;
  ctx.drawImage(legendCanvas, 0, y); y += legendCanvas.height;
  ctx.drawImage(chartsCanvas, 0, y);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [width, totalHeight] });
  const finalImg = finalCanvas.toDataURL('image/png');
  pdf.addImage(finalImg, 'PNG', 0, 0, width, totalHeight);
  pdf.save('map.pdf');
});
    // Affichage ou non de la légende selon la couche active
    toggleLegend(defaultState.layerType);

    // Gestion des boutons d’interface (passage split / single / miroir)
    document.getElementById('btn-compare').addEventListener('click', enterSplit);
    document.getElementById('btn-single').addEventListener('click', exitSplit);

    // Activation / désactivation de la synchronisation miroir
    document.getElementById('btn-sync').addEventListener('click', () => {
      mirrorEnabled = !mirrorEnabled;
      document.getElementById('btn-sync').textContent = `Miroir : ${mirrorEnabled ? 'on' : 'off'}`;

      // Si on active le miroir, on synchronise la vue droite sur la gauche
      if (mirrorEnabled && instances.left && instances.right) {
        const vs = instances.left.state.viewState;
        instances.right.deckgl.setProps({ viewState: vs });
        instances.right.state.viewState = vs;
      }
    });
  })
  // En cas d’erreur de lecture du fichier GeoJSON
  .catch(err => console.error("Erreur JSON:", err));


// === CONSTRUCTION DES COUCHES DECK.GL ===
function buildLayer(type, data, slider, cellSize = 20) {
  switch(type) {

    // === CAS 1 : SCATTERPLOT (points simples, ronds) ===
    case 'scatter': return new ScatterplotLayer({
      id: 'ScatterplotLayer',
      data,
      radiusMinPixels: 1.6,              // Taille min des points
      radiusMaxPixels: 50,               // Taille max
      getRadius: 1,                      // Rayon de chaque point (identique ici)
      radiusUnits: 'pixels',            // Unité de rayon (pixels écran)
      getFillColor: d => CATEGORY_MAP[d.transp_kind]?.color || [0,0,0], // Couleur selon le type
      getPosition: d => [d.lon, d.lat], // Position GPS
      opacity: 0.7
    });

    // === CAS 2 : GRILLE 3D ===
    case 'grid': return new GridLayer({
      id: 'GridLayer',
      data,
      cellSize: 100,                  // Taille de chaque cellule
      coverage: 0.8,                  // Combien de la cellule est remplie (0–1)
      extruded: true,                 // Hauteur = nombre de points
      getPosition: d => [d.lon, d.lat],
      getElevationValue: pts => pts.length, // Hauteur = nombre de points dans la cellule
      colorAggregation: 'SUM',       // Agrégation couleur = somme
      colorScaleType: 'quantile',    // Échelle de couleur = quantiles
      opacity: 1,
      pickable: true,
      colorRange: [                  // Dégradé de couleurs
        [1,152,189],
        [73,227,206],
        [216,254,181],
        [254,237,177],
        [254,173,84],
        [209,55,78]
      ]
    });

    // === CAS 3 : HEATMAP ===
    case 'heat': return new HeatmapLayer({
      id: 'HeatmapLayer',
      data,
      getPosition: d => [d.lon, d.lat],
      getWeight: d => d.value || 1,       // Poids de chaque point (valeur par défaut = 1)
      radiusPixels: heatmapRadius,        // Rayon d’influence
      threshold: heatmapThreshold         // Seuil d’opacité minimale
    });

    // === CAS 4 : HEXAGON LAYER (grille hexagonale 3D) ===
    case 'hex': return new HexagonLayer({
      id: 'HexagonLayer',
      data,
      getPosition: d => [d.lon, d.lat],
      radius: 50,                        // Rayon des hexagones
      coverage: 0.8,
      extruded: true,                    // Hauteur selon nb de points
      getElevationValue: pts => pts.length,
      colorAggregation: 'SUM',
      colorScaleType: 'quantile',
      opacity: 0.8,
      pickable: true,
      colorRange: [
        [1,152,189],
        [73,227,206],
        [216,254,181],
        [254,237,177],
        [254,173,84],
        [209,55,78]
      ]
    });

    // === CAS 5 : SCREEN GRID (grille fixe à l’écran) ===
    case 'screen': return new ScreenGridLayer({
      id: 'ScreenGridLayer',
      data,
      cellSizePixels: cellSize,           // Taille des cellules en pixels (écran)
      opacity: 0.8,
      getPosition: d => [d.lon, d.lat],
      colorRange: [
        [1,152,189],
        [73,227,206],
        [216,254,181],
        [254,237,177],
        [254,173,84],
        [209,55,78]
      ]
    });

    // === CAS 6 : BÂTIMENTS 3D (GeoJSON extrudé) ===
    case 'poly': return new GeoJsonLayer({
      id: 'GeoJsonLayer',
      data: 'https://raw.githubusercontent.com/falgoust1/citiprofile/Gurwan/bat6061s2.geojson',
      extruded: true,
      pickable: true,
      getPolygon: d => d.geometry.coordinates,
      getElevation: d => d.properties.HAUTEUR, // Hauteur selon attribut du bâtiment
      getFillColor: d =>
        d.properties.nbpoints < 10 ? [1,152,189] :
        d.properties.nbpoints < 40 ? [216,254,181] :
        [209,55,78],
      getFilterValue: d => d.properties.nbpoints,
      filterRange: [0, slider], // Utilise le slider pour filtrer les bâtiments
      extensions: [new DataFilterExtension({ filterSize: 1 })]
    });

    // === PAR DÉFAUT : couche vide ===
    default: return new ScatterplotLayer({ id: 'empty', data: [] });
  }
}


// === AFFICHAGE LÉGENDE ===
function toggleLegend(layerType) {
  const legend = document.getElementById('legend-block');
  if (!legend) return;

  // On n'affiche la légende que pour les couches de type agrégée
  // Ces couches utilisent une colorRange qui a du sens visuellement
  legend.style.display = ['grid', 'hex', 'screen'].includes(layerType)
    ? 'flex'
    : 'none';
}


// === CRÉATION INSTANCE ===
function createInstance({ container, controlsPrefix, donutId, initialState, geo }) {
  // On crée une copie indépendante de l'état initial (pour éviter de modifier defaultState)
  const state = JSON.parse(JSON.stringify(initialState));

  // === HISTOGRAMME (heures) ===

  // Récupère le canvas du graphique horaire (ex. : single-hour-histogram)
  const histoCanvas = document.getElementById(`${controlsPrefix}-hour-histogram`);

  // Si un ancien graphique existe (ex. lors d’un split précédent), on le détruit proprement
  const prevHisto = Chart.getChart(histoCanvas);
  if (prevHisto) prevHisto.destroy();

  // Création du nouveau graphique histogramme (type barres verticales)
  const histoChart = new Chart(histoCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')), // '00', '01', ..., '23'
      datasets: [{
        label: 'Points par heure',
        data: new Array(24).fill(0), // Initialisé à zéro partout
        backgroundColor: '#073775'
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });

  // === DIAGRAMME EN DONUT (répartition des types de transport) ===

  const donutCanvas = document.getElementById(donutId);
  const prevDonut = Chart.getChart(donutCanvas);
  if (prevDonut) prevDonut.destroy(); // Détruit un graphique existant s’il y en a un

  // Labels : les noms des catégories
  const labels = Object.values(CATEGORY_MAP).map(c => c.label);

  // Couleurs : on utilise la palette de couleurs de CATEGORY_MAP
  const bgColors = Object.values(CATEGORY_MAP).map(c => `rgb(${c.color.join(',')})`);

  const chart = new Chart(donutCanvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: new Array(6).fill(0), // Valeurs initiales (0 partout)
        backgroundColor: bgColors
      }]
    },
    options: {
      cutout: '60%', // épaisseur du donut (centre vide)
      plugins: {
        legend: { display: false }, // Pas de légende à droite
        datalabels: {
          color: '#fff',
          formatter: (v, ctx) => {
            const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
            return total ? Math.round((v / total) * 100) + '%' : '';
          }
        }
      }
    },
    plugins: [ChartDataLabels]
  });

    // === CRÉATION DE L'INSTANCE DE Deck.gl ===
    const deckgl = new DeckGL({
      container,               // ID du conteneur HTML où insérer la carte
      mapLib: maplibregl,      // Librairie utilisée pour le fond de carte (ici MapLibre)
      mapStyle: "https://openmaptiles.geo.data.gouv.fr/styles/positron/style.json", // fond clair par défaut
      controller: true,        // Autorise les interactions (zoom, pan, etc.)
      viewState: state.viewState, // État de la vue (zoom, latitude, etc.)
      parameters: {
        preserveDrawingBuffer: true  // ← important pour l’export
      },
      // Fonction de tooltip affichée au survol d’un objet
      getTooltip: ({ object }) => makeTooltip(object),
  
      // Fonction appelée à chaque changement de vue (zoom, déplacement, etc.)
      onViewStateChange: ({ viewState }) => {
        state.viewState = viewState; // Mise à jour du state local
  
        // Si un quartier est sélectionné mais que l’utilisateur dézoome trop,
        // on annule le filtre spatial (quartier désélectionné)
        if (selectedQuartierPolygon && viewState.zoom < 13) {
          selectedQuartierPolygon = null;
          updateView(); // recharge la carte sans filtre spatial
          document.querySelector('#quartier-nom').textContent = '';
        }
  
        // Si on est en mode split avec miroir actif, synchronise la vue opposée
        if (isSplit && mirrorEnabled && !syncingView) {
          const other = container.includes("left") ? "right" : "left";
          if (instances[other]) {
            syncingView = true; // évite boucle infinie
            instances[other].deckgl.setProps({ viewState });
            instances[other].state.viewState = viewState;
            syncingView = false;
          }
        }
  
        // On applique le nouveau viewState à l’instance en cours
        deckgl.setProps({ viewState });
      },
  
      layers: [] // Aucune couche à l'initialisation, elles seront ajoutées dans updateView()
    });
  
    // === AJOUT D’UNE ÉCHELLE CARTOGRAPHIQUE ===
    deckgl.getMapboxMap().once('load', () => {
      deckgl.getMapboxMap().addControl(
        new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
        'bottom-left'
      );
    });

   // === MISE À JOUR DE LA CARTE ET DES GRAPHIQUES ===
   function updateView() {
    let pts = [];

    // 1. Sélection des points à afficher selon les types de transport cochés
    Object.values(CATEGORY_MAP).forEach(({ key }) => {
      if (state.filters[key]) {
        pts = pts.concat(geo[key + 'Pts']); // Ajoute les points de la catégorie
      }
    });

    // 2. Si aucun mois ou jour sélectionné, on affiche rien (évite surcharge)
    if (state.filters.months.length === 0 || state.filters.daysOfWeek.length === 0) {
      pts = [];
    } else {
      // 3. Filtrage temporel précis (mois, jour de semaine, heure, jour du mois)
      pts = pts.filter(d => {
        const m     = +d.MM;
        const w     = ('' + d.day_of_week).trim(); // Ex : "Ma", "V"
        const h     = +d.hh;
        const dday  = +d.JJ;

        return (
          state.filters.months.includes(m) &&
          state.filters.daysOfWeek.includes(w) &&
          h >= state.filters.hours[0] && h <= state.filters.hours[1] &&
          dday >= state.filters.daysOfMonth[0] && dday <= state.filters.daysOfMonth[1]
        );
      });

      // 4. Si un polygone de quartier est sélectionné, on filtre spatialement
      if (selectedQuartierPolygon) {
        pts = pts.filter(pt =>
          turf.booleanPointInPolygon([pt.lon, pt.lat], selectedQuartierPolygon)
        );
      }
    }

    // 5. Création dynamique de la couche GeoJSON des quartiers
    const quartiersLayer = new GeoJsonLayer({
      id: 'quartiers-layer',
      data: 'https://data.rennesmetropole.fr/api/explore/v2.1/catalog/datasets/perimetres-des-12-quartiers-de-la-ville-de-rennes/exports/geojson?lang=fr&timezone=Europe%2FBerlin',
      stroked: true,
      filled: true,
      getLineColor: [37, 211, 102],
      lineWidthMinPixels: 2,
      getFillColor: [0, 0, 0, 0],
      pickable: true,
      autoHighlight: true,
      highlightColor: [102, 205, 170, 70],

      // Survol : nom du quartier dans l’en-tête
      onHover: info => {
        if (info.object) {
          const nom = info.object.properties.nom;
          document.querySelector('#quartier-nom').innerHTML = `<span style="padding-right: 16px;">|</span>Quartier ${nom}`;
        }
      },

      // Clic sur un quartier : zoom et filtrage spatial
      onClick: info => {
        if (info.object) {
          const nom = info.object.properties.nom;
          document.querySelector('#quartier-nom').textContent = `| Quartier ${nom}`;
          selectedQuartierPolygon = info.object.geometry;

          const centroid = turf.centroid(selectedQuartierPolygon);
          const [lon, lat] = centroid.geometry.coordinates;

          const newViewState = {
            ...state.viewState,
            longitude: lon,
            latitude: lat,
            zoom: 13.5,
            transitionDuration: 500,
            transitionInterpolator: new FlyToInterpolator()
          };

          state.viewState = newViewState;
          deckgl.setProps({ viewState: newViewState });
          updateView(); // recharge après sélection
        }
      }
    });

    // 6. Rendu des couches Deck.gl : couche principale + couche quartiers
    deckgl.setProps({
      layers: [
        buildLayer(state.layerType, pts, state.sliderValue, state.cellSize),
        quartiersLayer
      ]
    });

    // 7. Mise à jour du diagramme en donut (répartition des types de transport)
    chart.data.datasets[0].data = Object.keys(CATEGORY_MAP).map(k =>
      pts.filter(p => p.transp_kind === +k).length
    );
    chart.update();

    // 8. Mise à jour de l’histogramme horaire
    const hourlyCount = new Array(24).fill(0);
    pts.forEach(p => {
      const h = +p.hh;
      if (h >= 0 && h < 24) hourlyCount[h]++;
    });
    histoChart.data.datasets[0].data = hourlyCount;
    histoChart.update();
  }

  // Écoute tous les contrôles (sliders, filtres, boutons)
  attachControlListeners(controlsPrefix, state, updateView);

  // Premier affichage au chargement
  updateView();

  // Retourne l'objet complet (utile pour split ou export PDF)
  return { deckgl, chart, state };
}


//attachControlListeners() – Connexion interface - filtre
function attachControlListeners(prefix, state, onChange) {
  // === Radios de sélection du type de couche ===
  ['scatter', 'grid', 'heat', 'hex', 'screen', 'poly'].forEach(type => {
    const el = document.getElementById(`radio-${type}-${prefix}`);
    if (el) {
      el.addEventListener('change', e => {
        if (e.target.checked) {
          state.layerType = type;     // Met à jour le type de couche dans l’état
          onChange();                 // Rafraîchit la carte
          toggleLegend(type);        // Affiche ou non la légende
        }
      });
    }
  });

  // === Checkboxes des types de transport ===
  Object.values(CATEGORY_MAP).forEach(({ key }) => {
    const cb = document.getElementById(`filter-${key}-${prefix}`);
    if (cb) {
      cb.addEventListener('change', e => {
        state.filters[key] = e.target.checked; // Active / désactive la catégorie
        onChange();                            // Rafraîchit la carte
      });
    }
  });

  // === Slider pour le filtre sur nb de points par bâtiment (layer poly) ===
  const slider = document.getElementById(`point-slider-${prefix}`);
  const label  = document.getElementById(`slider-value-${prefix}`);
  if (slider) {
    slider.addEventListener('input', e => {
      state.sliderValue = +e.target.value;
      if (label) label.textContent = e.target.value;
      onChange();
    });
  }

  // === Slider de taille des cellules pour ScreenGrid ===
  const cellSlider = document.getElementById(`cell-slider-${prefix}`);
  const cellLabel  = document.getElementById(`cell-value-${prefix}`);
  if (cellSlider) {
    cellSlider.addEventListener('input', e => {
      state.cellSize = +e.target.value;
      if (cellLabel) cellLabel.textContent = state.cellSize;
      onChange();
    });
  }

  // === Sliders spécifiques à la Heatmap ===
  const thresholdSlider = document.getElementById(`threshold-slider-${prefix}`);
  const thresholdLabel  = document.getElementById(`threshold-value-${prefix}`);
  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', e => {
      heatmapThreshold = parseFloat(e.target.value);
      if (thresholdLabel) thresholdLabel.textContent = heatmapThreshold.toFixed(2);
      onChange();
    });
  }

  const radiusSlider = document.getElementById(`radius-slider-${prefix}`);
  const radiusLabel  = document.getElementById(`radius-value-${prefix}`);
  if (radiusSlider) {
    radiusSlider.addEventListener('input', e => {
      heatmapRadius = parseInt(e.target.value);
      if (radiusLabel) radiusLabel.textContent = heatmapRadius;
      onChange();
    });
  }

  // === Checkboxes des mois ===
  const getCheckedNums = id =>
    Array.from(document.querySelectorAll(`#${id} input:checked`)).map(e => +e.value);
  const getChecked     = id =>
    Array.from(document.querySelectorAll(`#${id} input:checked`)).map(e => e.value);

  document.querySelectorAll(`#month-checkboxes-${prefix} input`).forEach(cb =>
    cb.addEventListener('change', () => {
      state.filters.months = getCheckedNums(`month-checkboxes-${prefix}`);
      onChange();
    })
  );

  // === Checkboxes des jours de la semaine ===
  document.querySelectorAll(`#dow-checkboxes-${prefix} input`).forEach(cb =>
    cb.addEventListener('change', () => {
      state.filters.daysOfWeek = getChecked(`dow-checkboxes-${prefix}`);
      onChange();
    })
  );

  // === Slider des heures (avec noUiSlider) ===
  const hourSlider = document.getElementById(`hour-slider-${prefix}`);
  if (hourSlider && noUiSlider) {
    if (hourSlider.noUiSlider) hourSlider.noUiSlider.destroy(); // Destruction d'un ancien slider
    noUiSlider.create(hourSlider, {
      start: state.filters.hours,
      connect: true,
      step: 1,
      range: { min: 0, max: 23 },
      format: { to: v => Math.round(v), from: v => +v }
    });

    hourSlider.noUiSlider.on('update', vals => {
      state.filters.hours = vals.map(v => +v);
      onChange();
    });
  }

  // === Slider des jours du mois ===
  const domSlider = document.getElementById(`dom-slider-${prefix}`);
  if (domSlider && noUiSlider) {
    if (domSlider.noUiSlider) domSlider.noUiSlider.destroy();
    noUiSlider.create(domSlider, {
      start: state.filters.daysOfMonth,
      connect: true,
      step: 1,
      range: { min: 1, max: 31 },
      format: { to: v => Math.round(v), from: v => +v }
    });

    domSlider.noUiSlider.on('update', vals => {
      state.filters.daysOfMonth = vals.map(v => +v);
      onChange();
    });
  }

  // === Bouton de réinitialisation des filtres temporels ===
  const resetBtn = document.getElementById(`reset-temporal-filters-${prefix}`);
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      ['month-checkboxes', 'dow-checkboxes'].forEach(id => {
        document.querySelectorAll(`#${id}-${prefix} input`).forEach(cb => (cb.checked = false));
      });
      state.filters.months = [];
      state.filters.daysOfWeek = [];

      if (hourSlider?.noUiSlider) hourSlider.noUiSlider.set([0, 23]);
      if (domSlider?.noUiSlider) domSlider.noUiSlider.set([1, 31]);
      onChange();
    });
  }
}


//makeTooltip() – Gère le contenu des infobulles au survol
function makeTooltip(obj) {
  if (!obj) return null; // Aucun objet à afficher → pas de tooltip

  // Cas 1 : survol d’un bâtiment (couche "poly")
  if (obj.properties && obj.properties.nbpoints !== undefined) {
    return {
      html: `<b>Bâtiment</b><br>Points: ${obj.properties.nbpoints}`,
      style: {
        backgroundColor: '#333',
        color: '#fff',
        padding: '6px',
        fontSize: '0.9em'
      }
    };
  }

  // Cas 2 : survol d’une cellule agrégée (grille, hexagone…)
  if (obj.count !== undefined) {
    return {
      html: `<b>Agrégation</b><br>Points: ${obj.count}`,
      style: {
        backgroundColor: '#2a2a2a',
        color: '#eee',
        padding: '6px',
        fontSize: '0.9em'
      }
    };
  }
  // Cas par défaut : pas de tooltip utile
  return null;
}


//enterSplit() – Passage en mode comparatif (double vue)
function enterSplit() {
  if (isSplit) return; // Si déjà en mode split, on ne fait rien
  isSplit = true;

  // Masque la carte unique, affiche les deux cartes côte à côte
  document.getElementById('single-view').style.display = 'none';
  document.getElementById('split-view').style.display = 'flex';
  document.getElementById('btn-compare').style.display = 'none';
  document.getElementById('btn-single').style.display = 'inline-block';
  document.getElementById('btn-sync').style.display = 'inline-block';

  // Crée les deux vues "left" et "right" avec le même état de départ
  ['left', 'right'].forEach(side => {
    instances[side] = createInstance({
      container: `canvas-${side}`,           // Conteneur Deck.gl correspondant
      controlsPrefix: side,                  // Permet d’avoir des IDs uniques
      donutId: `donut-${side}`,              // ID du graphique donut
      initialState: instances.single.state,  // Copie l’état actuel de la vue unique
      geo: globalGeo                         // Données déjà filtrées et prêtes
    });
    toggleLegend(instances[side].state.layerType); // Affiche légende si besoin
  });
}

//exitSplit() – Retour à la vue unique
function exitSplit() {
  if (!isSplit) return;
  isSplit = false;

  ['left', 'right'].forEach(side => {
    const inst = instances[side];
    if (inst) {
      inst.deckgl.finalize();
      inst.chart.destroy();
      const histoCanvas = document.getElementById(`${side}-hour-histogram`);
      const histoChart = Chart.getChart(histoCanvas);
      if (histoChart) histoChart.destroy();
      const container = document.getElementById(`canvas-${side}`);
      if (container) container.innerHTML = '';
      delete instances[side];
    }
  });

  document.getElementById('split-view').style.display = 'none';
  document.getElementById('single-view').style.display = 'block';
  document.getElementById('btn-compare').style.display = 'inline-block';
  document.getElementById('btn-single').style.display = 'none';
  document.getElementById('btn-sync').style.display = 'none';
}

document.querySelectorAll('.sidebar-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const scope = btn.closest('.layer-controls');

    // Ferme tous les panneaux sauf le bon
    scope.querySelectorAll('.sidebar-panel').forEach(panel => {
      panel.style.display = (panel.id === targetId && panel.style.display !== 'block') ? 'block' : 'none';
    });

    // Auto-hide intelligent
    const panel = scope.querySelector('#' + targetId);
    if (panel && panel.style.display === 'block') {
      panel.style.top = btn.offsetTop + 'px';
      const HIDE_DELAY = 250;
      let hideTimer = null;

      const startHide = () => {
        hideTimer = setTimeout(() => panel.style.display = 'none', HIDE_DELAY);
      };
      const cancelHide = () => {
        clearTimeout(hideTimer);
        hideTimer = null;
      };

      ['mouseenter', 'mouseleave'].forEach(evt => {
        panel.removeEventListener(evt, cancelHide);
        panel.removeEventListener(evt, startHide);
        btn.removeEventListener(evt, cancelHide);
        btn.removeEventListener(evt, startHide);
      });

      panel.addEventListener('mouseenter', cancelHide);
      panel.addEventListener('mouseleave', startHide);
      btn.addEventListener('mouseenter', cancelHide);
      btn.addEventListener('mouseleave', startHide);
    }
  });
});