const { DeckGL, ScatterplotLayer, ScreenGridLayer, GridLayer, HeatmapLayer, HexagonLayer,Slider, DataFilterExtension } = deck;



// Charger le fichier JSON localement
fetch("http://127.0.0.1:5500/ZN_bat_60-61_w_IDs.geojson")
  .then(response => response.json())
  .then((geojson) => {
    
// On va parcourir le FeatureCollection
const points = [];

for (const feature of geojson.features) {
  const geom = feature.geometry;

  // Par sécurité, vérifier qu'on a bien un geometry
  if (!geom || !geom.coordinates) {
    continue;
  }

  if (geom.type === 'MultiPoint') {
    // Pour chaque coordonnée de MultiPoint
    for (const coord of geom.coordinates) {
      // coord = [lon, lat]
      points.push({
        lon: coord[0],
        lat: coord[1],
        // On peut aussi recopier des propriétés du feature si besoin
        ...feature.properties
      });
    }
  } else if (geom.type === 'Point') {
    const [lon, lat] = geom.coordinates;
    points.push({
      lon,
      lat,
      ...feature.properties
    });
  }
  // Si vous avez d'autres types (LineString, etc.), il faut aussi les gérer ou les ignorer
}



// ViewState réactif
let currentViewState = {
  longitude: -1.6992,
  latitude: 48.1119,
  zoom: 14,
  pitch: 50,
  bearing: 0
};



    // Création de l'instance DeckGL après chargement des données
    const deckgl = new DeckGL({
      container: "deck-canvas", // ID du conteneur HTML
      mapStyle: "https://openmaptiles.geo.data.gouv.fr/styles/positron/style.json", //Ajout du fond de carte
      controller: true,
      viewState: currentViewState,
      onViewStateChange: ({ viewState }) => {
        currentViewState = viewState;
        deckgl.setProps({ viewState });
      },
      getTooltip: ({ object }) =>
        object && `Nombre de points : ${object.points.length}`,
      layers: [] // Pas de couche initial, on va l'ajouter apres
    });










//                 Partie pour le switch Clair / Foncé

// Sélectionner le toggle switch
const toggle = document.getElementById("map-toggle");


// Écoute l’événement "change"
toggle.addEventListener('change', (e) => {
  if (e.target.checked) {
    // Case cochée => style sombre
    deckgl.setProps({
      mapStyle: 'https://openmaptiles.geo.data.gouv.fr/styles/dark-matter/style.json' 
    });
  } else {
    // Case décochée => style clair
    deckgl.setProps({
      mapStyle: 'https://openmaptiles.geo.data.gouv.fr/styles/positron/style.json'
    });
  }
});

















    // Fonction pour recréer la couche sélectionnée
    function updateLayer() {
      const heatSelected = document.getElementById("radio-heat").checked;
      const scatterSelected = document.getElementById("radio-scatter").checked;
      const gridSelected = document.getElementById("radio-grid").checked;
      const hex3DSelected = document.getElementById("radio-hex").checked;
      const ScreenSelected = document.getElementById("radio-screen").checked;

      let newLayer;
      let updatedViewState = { ...currentViewState };

      // 🔁 Mise à jour de la vue selon la couche
      if (ScreenSelected) {
        updatedViewState.pitch = 0;
        updatedViewState.bearing = 0;
      } else {
        updatedViewState.pitch = 50;
        updatedViewState.bearing = 0;
      }

      if (scatterSelected) {
        newLayer = new ScatterplotLayer({
          id: "ScatterplotLayer",
          data: points,
          radiusMinPixels: 1.4,
          radiusMaxPixels: 50,
          getRadius: 1,
          radiusUnits: "pixels",
          getFillColor: d =>
            d.prixm2 > 4000 ? [202, 0, 32] :
            d.prixm2 > 3000 ? [244, 165, 130] :
            d.prixm2 > 2000 ? [146, 197, 222] :
                              [5, 113, 176],
          getPosition: d => [d.lon, d.lat],
          opacity: 0.7
        });
      } else if (gridSelected) {
        newLayer = new GridLayer({
          id: "GridLayer",
          data: points,
          cellSize: 100,
          coverage: 0.8,
          elevationScale: 1,
          extruded: true,
          getPosition: d => [d.lon, d.lat],
          getElevationValue: points => points.length,
        
          colorAggregation: "SUM",
          colorScaleType: "quantile",
          opacity: 1,
          pickable: false,
          colorRange: [
            [1, 152, 189],
            [73, 227, 206],
            [216, 254, 181],
            [254, 237, 177],
            [254, 173, 84],
            [209, 55, 78]
          ]
        });
      } else if (heatSelected) {
        newLayer = new HeatmapLayer({
          id: "HeatmapLayer",
          data: points,
          radiusPixels: 50,
          threshold: 0.5,
          getPosition: d => [d.lon, d.lat]
        });
      } else if (hex3DSelected) {
        newLayer = new HexagonLayer({
          id: "HexagonLayer",
          data: points,
          getPosition: d => [d.lon, d.lat],
          radius: 50,
          coverage: 0.8,
          elevationScale: 1,
          extruded: true,
          getElevationValue: points => points.length,
          colorAggregation: "SUM",
          colorScaleType: "quantile",
          opacity: 0.8,
          pickable: false,
          colorRange: [
            [1, 152, 189],
            [73, 227, 206],
            [216, 254, 181],
            [254, 237, 177],
            [254, 173, 84],
            [209, 55, 78]
          ]
        });
      } else if (ScreenSelected) {
          newLayer = new ScreenGridLayer({
            id: 'ScreenGridLayer',
            data: points,
            opacity: 0.5,
            cellSizePixels: 20,
            colorRange: [
              [1, 152, 189],
              [73, 227, 206],
              [216, 254, 181],
              [254, 237, 177],
              [254, 173, 84],
              [209, 55, 78]
            ],
            getPosition: d => [d.lon, d.lat],
          });
        }






        // Exemple de couche GeoJsonLayer pour dessiner les quartiers de Rennes
        const quartiersLayer = new deck.GeoJsonLayer({
          id: 'quartiers-layer',
          data: 'https://data.rennesmetropole.fr/api/explore/v2.1/catalog/datasets/perimetres-des-12-quartiers-de-la-ville-de-rennes/exports/geojson?lang=fr&timezone=Europe%2FBerlin',
          
          /* Options de style */
          stroked: true,                  // on dessine la bordure
          filled: true,                   // on autorise un remplissage
          getLineColor: [37, 211, 102],   // #25d366 => en [R, G, B]
          lineWidthMinPixels: 2,
          
          /* Couleurs de remplissage par défaut = transparent */
          getFillColor: [0, 0, 0, 0],     // invisible quand pas survolé
          
          /* Interactions */
          pickable: false,         // rend la couche "cliquable/hoverable"
          autoHighlight: false,    // active un effet de survol automatique
          highlightColor: [255, 255, 255, 40], // couleur survol: blanc semi-transparent
          
          /* Clic sur le quartier => mise à jour du #quartier-nom */
          onClick: info => {
            if (info.object) {
              const nomQuartier = info.object.properties.nom;
              document.querySelector('#quartier-nom').textContent = `| Quartier ${nomQuartier}`;
            }
          }
        });
        





      // Mise à jour de la carte avec la nouvelle couche
      deckgl.setProps({ 
        layers: [newLayer,
          quartiersLayer
        ],
        viewState: updatedViewState //Passer du pitch 50 au 0 en fct de la couche
      });
      
    }

    // Ajouter les écouteurs sur les boutons radio
    document.getElementById("radio-heat").addEventListener("change", updateLayer);
    document.getElementById("radio-scatter").addEventListener("change", updateLayer);
    document.getElementById("radio-grid").addEventListener("change", updateLayer);
    document.getElementById("radio-hex").addEventListener("change", updateLayer);
    document.getElementById("radio-screen").addEventListener("change", updateLayer);

    // Afficher GridLayer par défaut au chargement
    updateLayer();
  })
  .catch(error => console.error("❌ Erreur lors du chargement du JSON:", error));



