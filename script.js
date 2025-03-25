


const { DeckGL, ScatterplotLayer, GridLayer, HeatmapLayer, HexagonLayer, ScreenGridLayer, DataFilterExtension } = deck;



// Charger le fichier JSON localement
fetch("http://127.0.0.1:5500/ZN_63_IDs.geojson")
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
    
    // Création de l'instance DeckGL après chargement des données
    const deckgl = new DeckGL({
      container: "deck-canvas", // ID du conteneur HTML
      mapStyle: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
      initialViewState: {
        longitude: -1.6992,
        latitude: 48.1119,
        zoom: 14,
        maxZoom: 20,
        pitch: 40,
        bearing: 0
      },
      controller: true,
      getTooltip: ({object}) =>
        object && `Nombre de points : ${object.points.length}`,
      layers: [] // Pas de couche initiale, on va l'ajouter après
    });

    // Fonction pour recréer la couche sélectionnée
    function updateLayer() {
      const heatSelected = document.getElementById("radio-heat").checked;
      const scatterSelected = document.getElementById("radio-scatter").checked;
      const gridSelected = document.getElementById("radio-grid").checked;
      const hex3DSelected = document.getElementById("radio-hex").checked;
      const ScreenSelected = document.getElementById("radio-screen").checked;

      let newLayer;

      if (scatterSelected) {
        newLayer = new ScatterplotLayer({
          id: "ScatterplotLayer",
          data: points,
          radiusMinPixels: 1,
          radiusMaxPixels: 50,
          getRadius: 1,
          radiusUnits: "pixels",
          getFillColor: [255, 0, 0],
          getPosition: d => [d.lon, d.lat],
          opacity: 0.7
        });

      } else if (gridSelected) {
        newLayer = new GridLayer({
          id: "GridLayer",
          data: points,
          cellSize: 50,
          coverage: 0.8,
          elevationScale: 4,
          extruded: true,
          getPosition: d => [d.lon, d.lat],
          getElevationValue: points => points.length,
          colorAggregation: "SUM",
          colorScaleType: "quantile",
          opacity: 0.8,
          pickable: true,
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
          id: "ScreenGridLayer",
          data: points,
          opacity: 0.8,
          cellSizePixels: 20,
          colorRange: [
            [255, 255, 178, 25],
            [254, 217, 118, 85],
            [254, 178, 76, 127],
            [253, 141, 60, 170],
            [240, 59, 32, 212],
            [189, 0, 38, 255]
          ],
          getPosition: d => [d.lon, d.lat]
        });

      } else if (heatSelected) {
        newLayer = new HeatmapLayer({
          id: "HeatmapLayer",
          data: points,
          Intensity: 2.3,
          radiusPixels: 100,
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
          elevationScale: 4,
          extruded: true,
          getElevationValue: points => points.length,
          colorAggregation: "SUM",
          colorScaleType: "quantile",
          opacity: 0.8,
          pickable: true,
          colorRange: [
            [1, 152, 189],
            [73, 227, 206],
            [216, 254, 181],
            [254, 237, 177],
            [254, 173, 84],
            [209, 55, 78]
          ]
          
        });
      }

      // Mise à jour de la carte avec la nouvelle couche
      deckgl.setProps({ layers: [newLayer] });
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
