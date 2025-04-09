const { DeckGL, ScatterplotLayer, ScreenGridLayer, GeoJsonLayer, GridLayer, HeatmapLayer, HexagonLayer,Slider, DataFilterExtension } = deck;

let sliderValue = 1000; // Valeur du filtre par défaut

// Charger le fichier JSON localement
fetch("http://127.0.0.1:5500/ZN_bat_60-61_w_IDs.geojson")
  .then(response => response.json())
  .then((geojson) => {
    
// On va parcourir le FeatureCollection
const points = [];

//pour le pie chart
let count60 = 0;
let count61 = 0;
//pour le bar chart
let hourCounts = {
  0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0,
  10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0,
  19: 0, 20: 0, 21: 0, 22: 0, 23: 0
};

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
  //pie
      const transpKinds = feature.properties.transp_kind;
      if (Array.isArray(transpKinds)) {
        for (const kind of transpKinds) {
          if (kind === 60) count60++;
          else if (kind === 61) count61++;
        }
      }

      //bar
  const heures = feature.properties.hour;
  if (Array.isArray(heures)) {
    for (const h of heures) {
      if (hourCounts.hasOwnProperty(h)) {
        hourCounts[h]++;
      }
    }
  }
      
}



// ViewState réactif
let currentViewState = {
  longitude: -1.6992,
  latitude: 48.1119,
  zoom: 14,
  pitch: 50,
  bearing: 0
};



// Paramétrage et création de l'instance DeckGL
const deckgl = new DeckGL({
  container: "deck-canvas",
  mapStyle: "https://openmaptiles.geo.data.gouv.fr/styles/positron/style.json", // ou remplace par dark-matter si besoin
  controller: true,
  viewState: currentViewState,
  onViewStateChange: ({ viewState }) => {
    currentViewState = viewState;
    deckgl.setProps({ viewState });
  },

  getTooltip: ({ object }) => {
    if (!object) return null;

    // Cas GeoJsonLayer (ex : bâtiments avec attribut nbpoints)
    if (object.properties && object.properties.nbpoints !== undefined) {
      return {
        html: `<b>Bâtiment</b><br>Nombre de points : ${object.properties.nbpoints}`,
        style: {
          backgroundColor: "#333",
          color: "#fff",
          fontSize: "0.9em",
          padding: "6px"
        }
      };
    }

    // Cas GridLayer ou HexagonLayer (agrégation simple)
    if (object.count !== undefined) {
      return {
        html: `<b>Agrégation</b><br>Nombre de points : ${object.count}`,
        style: {
          backgroundColor: "#2a2a2a",
          color: "#eee",
          fontSize: "0.9em",
          padding: "6px"
        }
      };
    }

    // Cas générique (ex : objets avec .points)
    if (object.points && Array.isArray(object.points)) {
      return {
        html: `<b>Agrégation</b><br>Nombre de points : ${object.points.length}`,
        style: {
          backgroundColor: "#444",
          color: "#fff",
          fontSize: "0.9em",
          padding: "6px"
        }
      };
    }

    return null;
  },

  layers: [] // Les couches seront ajoutées dynamiquement après chargement des données
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
      const polySelected = document.getElementById("radio-poly").checked;

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
        } else if (polySelected) {
          newLayer = new GeoJsonLayer({
            id: 'GeoJsonLayer',
            /* Appel du geojson prétraité sur qgis du nombre de point compté par bâtiments, attention à bien changer la source*/
  
            data: 'https://raw.githubusercontent.com/falgoust1/citiprofile/Gurwan/bat6061s.geojson',
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
            pickable: true,
            getElevationBase: d => 0,
            getElevation: d => d.properties.HAUTEUR,
            getFillColor: d =>
              d.properties.nbpoints < 10 ? [1, 152, 189] :
              d.properties.nbpoints < 40 ? [216, 254, 181] :
              d.properties.nbpoints < 450 ? [209, 55, 78] :
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
      

        // 🎯 Slider dynamique
        document.getElementById("point-slider").addEventListener("input", (e) => {
          sliderValue = parseInt(e.target.value);
          document.getElementById("slider-value").innerText = sliderValue;
          updateLayer();
        });


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
    document.getElementById("radio-poly").addEventListener("change", updateLayer);


    // Afficher GridLayer par défaut au chargement
    updateLayer();
    //piechart
    const pieData = [
      { label: 'Transport 60', value: count60 },
      { label: 'Transport 61', value: count61 }
    ];
    console.log("Pie chart data:", pieData);
    // Appel de la fonction pour créer le graphique
    const width = 300;
  const height = 200;
  const radius = Math.min(width, height) / 2;

  // Création du SVG dans l'élément #pie-chart
  const svg = d3.select("#pie-chart")
    .attr("width", width)
    .attr("height", height)

  const g = svg.append("g")
    .attr("transform", `translate(${width / 2}, ${height / 2})`);

  const color = d3.scaleOrdinal()
    .domain(pieData.map(d => d.label))
    .range(["#1f77b4", "#ff7f0e"]);

  const pie = d3.pie().value(d => d.value);
  const arc = d3.arc().innerRadius(0).outerRadius(radius);

  const arcs = g.selectAll("arc")
    .data(pie(pieData))
    .enter()
    .append("g")
    .attr("class", "arc");

  arcs.append("path")
    .attr("d", arc)
    .attr("fill", d => color(d.data.label));

  arcs.append("text")
    .attr("transform", d => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .attr("fill", "white")
    .text(d => `${d.data.label} (${d.data.value})`);

    // Transformation de hourCounts en tableau d'objets
const hourData = Object.keys(hourCounts).map(hour => ({
  hour: hour,
  count: hourCounts[hour]
}));

// Dimensions du graphique (plus petites)
const widthB = 800;  // Largeur réduite
const heightB = 250; // Hauteur réduite
const margin = { top: 20, right: 20, bottom: 40, left: 40 };

// Création du SVG pour le graphique
const svgB = d3.select("#bar-chart")
  .attr("width", width)
  .attr("height", height);

// Définir l'échelle pour l'axe X (heures)
const x = d3.scaleBand()
  .domain(hourData.map(d => d.hour))  // Les heures de 0 à 23
  .range([margin.left, width - margin.right])
  .padding(0.1);

// Définir l'échelle pour l'axe Y (comptage des heures)
const y = d3.scaleLinear()
  .domain([0, d3.max(hourData, d => d.count)])  // La valeur maximale des comptes
  .nice()
  .range([height - margin.bottom, margin.top]);

// Ajouter l'axe X
svg.append("g")
  .selectAll(".x-axis")
  .data(hourData)
  .enter()
  .append("text")
  .attr("x", d => x(d.hour) + x.bandwidth() / 2)
  .attr("y", height - margin.bottom + 15)
  .attr("text-anchor", "middle")
  .text(d => d.hour);

// Ajouter l'axe Y
svg.append("g")
  .call(d3.axisLeft(y))
  .attr("transform", `translate(${margin.left}, 0)`);

// Ajouter les barres du graphique
svg.append("g")
  .selectAll(".bar")
  .data(hourData)
  .enter()
  .append("rect")
  .attr("class", "bar")
  .attr("x", d => x(d.hour))
  .attr("y", d => y(d.count))
  .attr("width", x.bandwidth())
  .attr("height", d => height - margin.bottom - y(d.count))
  .attr("fill", "#69b3a2");

  })
  .catch(error => console.error("❌ Erreur lors du chargement du JSON:", error));


