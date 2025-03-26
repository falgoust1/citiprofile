const { DeckGL, ScatterplotLayer, GridLayer, HeatmapLayer, HexagonLayer, ScreenGridLayer, DataFilterExtension } = deck;

fetch("http://127.0.0.1:5500/ZN_63_IDs.geojson")
  .then(response => response.json())
  .then((geojson) => {
    const points = [];

    for (const feature of geojson.features) {
      const geom = feature.geometry;
      if (!geom || !geom.coordinates) continue;

      if (geom.type === 'MultiPoint') {
        for (const coord of geom.coordinates) {
          points.push({
            lon: coord[0],
            lat: coord[1],
            ...feature.properties
          });
        }
      } else if (geom.type === 'Point') {
        const [lon, lat] = geom.coordinates;
        points.push({ lon, lat, ...feature.properties });
      }
    }

    // ViewState réactif
    let currentViewState = {
      longitude: -1.6992,
      latitude: 48.1119,
      zoom: 14,
      pitch: 40,
      bearing: 0
    };

    const deckgl = new DeckGL({
      container: "deck-canvas",
      mapStyle: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
      controller: true,
      viewState: currentViewState,
      onViewStateChange: ({ viewState }) => {
        currentViewState = viewState;
        deckgl.setProps({ viewState });
      },
      getTooltip: ({ object }) =>
        object && `Nombre de points : ${object.points.length}`,
      layers: []
    });

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
        updatedViewState.pitch = 40;
        updatedViewState.bearing = 0;
      }

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
            [1, 152, 189],
            [73, 227, 206],
            [216, 254, 181],
            [254, 237, 177],
            [254, 173, 84],
            [209, 55, 78]
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

      deckgl.setProps({
        layers: [newLayer],
        viewState: updatedViewState
      });
    }

    // 🎯 Ajout des événements
    document.getElementById("radio-heat").addEventListener("change", updateLayer);
    document.getElementById("radio-scatter").addEventListener("change", updateLayer);
    document.getElementById("radio-grid").addEventListener("change", updateLayer);
    document.getElementById("radio-hex").addEventListener("change", updateLayer);
    document.getElementById("radio-screen").addEventListener("change", updateLayer);

    updateLayer(); // couche par défaut
  })
  .catch(error => console.error("❌ Erreur lors du chargement du JSON:", error));
