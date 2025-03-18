console.log("deck.gl chargé :", deck);

// Vérification que `deck` est bien défini avant d’accéder à ses propriétés
if (typeof deck !== "undefined") {
  const DeckGL = deck.DeckGL;
  const GeoJsonLayer = deck.GeoJsonLayer;
  

// Pour faire tourner le script avec les données en local :
  //Lancer un environnement python depuis le terminal de ce dossier :
    //1 - Télécharger les scripts depuis github et les mettre dans un même dossier
    //2 - Les ouvrirs dans VScode en ouvrant le dossier les contenant
    //3 - Ajouter les données que l'on veut (au format geojson) au dossier
    //4 - Ouvrir le terminal VScode
    //5 - Lancer un environnement python avec la commande : python -m http.server 8000


  fetch('http://localhost:8000/ZN_bat_60-61_w_IDs.geojson') //Renseigner son http localhost
    .then((response) => response.json())
    .then((geojson) => {
      console.log("Données chargées :", geojson); // Vérification dans la console

      const layer = new GeoJsonLayer({
        id: 'geojson-layer',
        data: geojson, // Utilisation directe du GeoJSON
        pickable: true,
        stroked: false,
        filled: true,
        extruded: false,
        pointType: "circle",
        getFillColor: [255, 140, 0, 180], // Orange semi-transparent
        getRadius: 5, // Taille des points
      });

      new DeckGL({
        mapStyle: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        initialViewState: {
          longitude: -1.6992, // Ajuste selon tes données
          latitude: 48.1119,
          zoom: 13,
          pitch: 0,
          bearing: 0,
        },
        controller: true,
        getTooltip: ({ object }) => object && `ID: ${object.properties.ID}`,
        layers: [layer],
      });
    })
    .catch((error) => console.error('Erreur de chargement du GeoJSON:', error));
} else {
  console.error("deck.gl n'est pas chargé correctement !");
}