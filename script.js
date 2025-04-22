const { DeckGL, ScatterplotLayer, ScreenGridLayer, GeoJsonLayer, GridLayer, HeatmapLayer, HexagonLayer,Slider, DataFilterExtension } = deck;

// Définissez la vue initiale de la carte (latitude, longitude, zoom, etc.)
const INITIAL_VIEW_STATE = {
    latitude: 48.11,
    longitude: -1.67,
    zoom: 11,
    pitch: 0,
    bearing: 0
  };
  
  d3.dsv(';', 'http://127.0.0.1:5500/ZN_all_signal.csv').then(data => {
    const formattedData = data.map(d => {
      return {
        position: [ +d.lon, +d.lat ],
        value: +d.valeur
      };
    });
  
    const scatterLayer = new deck.GridLayer({
      id: 'GridLayer',
      data: formattedData,
      cellSize: 100,
      coverage: 0.8,
      elevationScale: 1,
      extruded: true,
      getPosition: d => d.position,
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
  
    const deckgl = new deck.DeckGL({
      container: 'deck-canvas',
      mapLib: maplibregl,
      mapStyle: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      initialViewState: INITIAL_VIEW_STATE,
      controller: true,
      layers: [scatterLayer]
    });
  }).catch(error => {
    console.error('Erreur lors du chargement du CSV :', error);
  });