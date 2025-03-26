const { DeckGL, ScatterplotLayer, ScreenGridLayer, GridLayer, HeatmapLayer, HexagonLayer, DataFilterExtension, GeoJsonLayer } = deck;

let sliderValue = 1000; // Valeur du filtre par défaut

// Charger le fichier JSON localement
fetch("http://127.0.0.1:5500/ZN_bat_60-61_w_IDs.geojson")
  .then(response => response.json())
  .then((geojson) => {

    const points = [];

    for (const feature of geojson.features) {
      const geom = feature.geometry;
      if (!geom || !geom.coordinates) continue;

      if (geom.type === 'MultiPoint') {
        for (const coord of geom.coordinates) {
          points.push({ lon: coord[0], lat: coord[1], ...feature.properties });
        }
      } else if (geom.type === 'Point') {
        const [lon, lat] = geom.coordinates;
        points.push({ lon, lat, ...feature.properties });
      }
    }

    let currentViewState = {
      longitude: -1.6992,
      latitude: 48.1119,
      zoom: 14,
      pitch: 50,
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
        object && object.properties && object.properties.nbpoints !== undefined
          ? `Nombre de points : ${object.properties.nbpoints}`
          : null,
      layers: []
    });

    function updateLayer() {
      const heatSelected = document.getElementById("radio-heat").checked;
      const scatterSelected = document.getElementById("radio-scatter").checked;
      const gridSelected = document.getElementById("radio-grid").checked;
      const hex3DSelected = document.getElementById("radio-hex").checked;
      const screenSelected = document.getElementById("radio-screen").checked;
      const polySelected = document.getElementById("radio-poly").checked;

      let newLayer;
      let updatedViewState = { ...currentViewState };

      if (screenSelected) {
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

      } else if (screenSelected) {
        newLayer = new ScreenGridLayer({
          id: 'ScreenGridLayer',
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
          getPosition: d => [d.lon, d.lat],
        });

      } else if (polySelected) {
        newLayer = new GeoJsonLayer({
          id: 'GeoJsonLayer',
          data: 'https://raw.githubusercontent.com/falgoust1/citiprofile/Gurwan/batis_compte.geojson',
          getPolygon: d => d.geometry.coordinates,
          filled: true,
          getLineColor: [80, 80, 80],
          getLineWidth: d => 10,
          lineWidthMinPixels: 1,
          stroked: true,
          opacity: 1,
          extruded: true,
          wireframe: false,
          extrusionbase: 0,
          elevationScale: 1,
          getElevation: d => d.properties.HAUTEUR,
          getFillColor: d =>
            d.properties.nbpoints < 7 ? [1, 152, 189] :
            d.properties.nbpoints < 39 ? [216, 254, 181] :
            d.properties.nbpoints < 672 ? [209, 55, 78] :
            [209, 55, 78],

          // ✅ Filtrage dynamique par nbpoints
          getFilterValue: d => d.properties.nbpoints,
          filterRange: [0, sliderValue],
          extensions: [new DataFilterExtension({ filterSize: 1 })]
        });
      }

      // ✅ Affichage conditionnel du slider
      document.getElementById("slider-container").style.display = polySelected ? "block" : "none";

      deckgl.setProps({
        layers: [newLayer],
        viewState: updatedViewState
      });
    }

    // 🎯 Slider dynamique
    document.getElementById("point-slider").addEventListener("input", (e) => {
      sliderValue = parseInt(e.target.value);
      document.getElementById("slider-value").innerText = sliderValue;
      updateLayer();
    });

    // 🎯 Listeners pour chaque radio bouton
    document.getElementById("radio-heat").addEventListener("change", updateLayer);
    document.getElementById("radio-scatter").addEventListener("change", updateLayer);
    document.getElementById("radio-grid").addEventListener("change", updateLayer);
    document.getElementById("radio-hex").addEventListener("change", updateLayer);
    document.getElementById("radio-screen").addEventListener("change", updateLayer);
    document.getElementById("radio-poly").addEventListener("change", updateLayer);

    updateLayer();
  })
  .catch(error => console.error("❌ Erreur lors du chargement du JSON:", error));
