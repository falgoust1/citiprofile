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

//chargement des couches
map.on('load', function () {
    addLayers(); // Fonction pour ajouter les couches
});


// Sélectionner le toggle switch
const toggle = document.getElementById("map-toggle");

// Fonction pour changer le fond de carte
function switchMapStyle() {
    const lightStyle = "https://openmaptiles.geo.data.gouv.fr/styles/positron/style.json";
    const darkStyle = "https://openmaptiles.geo.data.gouv.fr/styles/dark-matter/style.json";

    const selectedStyle = toggle.checked ? darkStyle : lightStyle;

    // Changer le style de la carte
    map.setStyle(selectedStyle);

    // Attendre que le style soit chargé avant de rajouter les couches
    map.once('styledata', function () {
        addLayers(); // Fonction pour réajouter les couches après le changement de style
    });
}

// Ajouter un écouteur d'événement sur le toggle
toggle.addEventListener("change", switchMapStyle);
  
  // Ajout Echelle cartographique
  map.addControl(new maplibregl.ScaleControl({
      maxWidth: 120,
      unit: 'metric'
  }), 'top-right');
  
  // Boutons de navigation 
  var nav = new maplibregl.NavigationControl();
  map.addControl(nav, 'top-right');
  
  //Ajout crédit source
  map.addControl(new maplibregl.AttributionControl({
    customAttribution: '© <a href="https://esigat.wordpress.com/" target="_blank">Master SIGAT</a> | © <a href="https://www.citiprofile.com" target="_blank">Citiprofile</a>'
}));

/*Ajout de la couche des quartiers de rennes*/
/* mettre le remplissage que lorsque la souris passe sur le quartier */


function addLayers() {
    map.addSource('geojson-layer', {
        type: 'geojson',
        data: 'https://data.rennesmetropole.fr/api/explore/v2.1/catalog/datasets/perimetres-des-12-quartiers-de-la-ville-de-rennes/exports/geojson?lang=fr&timezone=Europe%2FBerlin'
    });

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
}

//pour changement de titre
 map.on('click', 'geojson-layer-fill', function (e) {
        if (e.features.length > 0) {
            let quartierNom = e.features[0].properties.nom; // Récupération du nom du quartier
            document.querySelector("#quartier-nom").textContent = `| Quartier ${quartierNom}`; // Mise à jour du header
        }
    });