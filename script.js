const {DeckGL, GridLayer} = deck;

fetch('http://127.0.0.1:5500/ZN_bat_60-61_w_IDs.geojson')
  .then((response) => response.json())
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

    // points est désormais un tableau de {lon, lat, ...}
    // Vous pouvez maintenant créer une GridLayer avec data = points




    
    const layer = new GridLayer({
      id: 'GridLayer',
      data: points,  // <-- on met le tableau de points
      cellSize: 50,
      coverage: 0.8,
      elevationScale: 4,
      extruded: true,
      // position = [longitude, latitude]
      getPosition: (d) => [d.lon, d.lat],
      getElevationValue: (pts) => pts.length, // combien de points dans chaque cellule
      colorAggregation: 'SUM',
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

    new DeckGL({
      mapStyle: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      initialViewState: {
        longitude: -1.6992,
        latitude: 48.1119,
        zoom: 11,
        maxZoom: 20,
        pitch: 40,
        bearing: 0
      },
      controller: true,
      getTooltip: ({object}) =>
        object && `Points: ${object.points.length}`,
      layers: [layer]
    });
  })
  .catch((error) => {
    console.error('Error fetching data:', error);
  });
