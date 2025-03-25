// Configuration de la carte avec MapLibre
var map = new maplibregl.Map({
    container: 'map',  
    style: 'https://openmaptiles.geo.data.gouv.fr/styles/positron/style.json',  
    center: [-1.6658424068410043, 48.12729238983067],  
    zoom: 11.5,  
    pitch: 0,   
    bearing: 0, 
    attributionControl: false  // mettre true = avoir une source automatique
});

// changement de fond de carte
document.getElementById('style-selector').addEventListener('change', function () {
    map.setStyle(this.value);  // Change le style de la carte avec la valeur sélectionnée
    map.once('style.load', addLayers);  // Recharge les couches après le chargement du nouveau style
});
  
  // Ajout Echelle cartographique
  map.addControl(new maplibregl.ScaleControl({
      maxWidth: 120,
      unit: 'metric'
  }));
  
  // Boutons de navigation 
  var nav = new maplibregl.NavigationControl();
  map.addControl(nav, 'top-right');
  
  //Ajout crédit source
  map.addControl(new maplibregl.AttributionControl({
    customAttribution: '© <a href="https://esigat.wordpress.com/" target="_blank">Master SIGAT</a> | © <a href="https://www.citiprofile.com" target="_blank">Citiprofile</a>'
}));

/*Ajout de la couche des quartiers de rennes*/
/* mettre le remplissage que lorsque la souris passe sur le quartier */


map.on('load', function () {
    map.addSource('geojson-layer', {
        type: 'geojson',
        data: 'https://data.rennesmetropole.fr/api/explore/v2.1/catalog/datasets/perimetres-des-12-quartiers-de-la-ville-de-rennes/exports/geojson?lang=fr&timezone=Europe%2FBerlin'
    });

    // Ajouter une couche LIGNE (contour des quartiers)
    map.addLayer({
        id: 'geojson-layer-line',
        type: 'line',  
        source: 'geojson-layer',
        paint: {
            'line-color': '#25d366', 
            'line-width': 1 
        }
    });

    map.addLayer({
        id: 'geojson-layer-fill',
        type: 'fill',
        source: 'geojson-layer',
        paint: {
            'fill-color': '#ffffff',
            'fill-opacity': 0.1
        }
    });
});

/*événement quand on survole le quartier*/

map.on('mouseenter', 'geojson-layer-fill', function (e) {
    var id = e.features[0].properties.nom; //
    
    map.setPaintProperty('geojson-layer-fill', 'fill-color', [
        'case',
        ['==', ['get', 'nom'], id],  
        '#25d366', // Vert
        '#ffffff' // Gris pour les autres
    ]);
});

/*événement quand on ne survole plus le quartier*/ 
map.on('mouseleave', 'geojson-layer-fill', function () {
    map.setPaintProperty('geojson-layer-fill', 'fill-color', '#ffffff'); // Remettre gris pour tous
});


/*zoom sur le quartier sur lequel on clique*/ 
map.on('click', 'geojson-layer-fill', function (e) {
    // Récupérer les coordonnées du quartier cliqué
    var coordinates = e.features[0].geometry.coordinates;
    
    // Calculer le centre du quartier (pour les polygones, il faut prendre le centre du bounding box)
    var bounds = e.features[0].geometry.bounds;
    var center = [
        (bounds[0] + bounds[2]) / 2, // Longitude
        (bounds[1] + bounds[3]) / 2  // Latitude
    ];
    
    // Utiliser la méthode flyTo pour centrer la carte sur le quartier et zoomer
    map.flyTo({
        center: center,
        zoom: 5,  // Ajustez le niveau de zoom selon vos besoins
        essential: true // Cela garantit que le vol de caméra soit effectué
    });
});
