// script.js

// Import DeckGL layers and extensions
const {
  DeckGL,
  ScatterplotLayer,
  ScreenGridLayer,
  GridLayer,
  HeatmapLayer,
  HexagonLayer,
  DataFilterExtension,
  GeoJsonLayer,
  FlyToInterpolator
} = deck;

// Global flags, data and instance storage
let isSplit = false;
let mirrorEnabled = false;
let globalGeo = null;
let syncingView  = false;

const instances = {};

let sliderValue = 1000; // Valeur du filtre par défaut
let heatmapThreshold = 0.03;
let heatmapRadius = 30;
let selectedQuartierPolygon = null;



const CATEGORY_MAP = {
  1:  { key:'aerien',   label:'Aérien',          color:[161, 66, 244] },
  30: { key:'eau',      label:'Eau',             color:[  0,188,212] },
  60: { key:'inconnu',  label:'Inconnu',         color:[158,158,158] },
  61: { key:'pieton',   label:'Piéton',          color:[ 45,175, 69] },
  62: { key:'mobilite', label:'Mobilité douce',  color:[244,180,  0] },
  63: { key:'voiture',  label:'Voiture',         color:[  7, 55,117] }
};

// Default initial state for single view
const defaultState = {
  viewState: {
    longitude: -1.6992,
    latitude: 48.1119,
    zoom: 14,
    pitch: 40,
    bearing: 0
  },
  filters: {
    aerien:   true,
    eau:      true,
    inconnu:  true,
    pieton:   true,
    mobilite: true,
    voiture:  true,
    months: [],       // mois sélectionnés (1–12)
    daysOfWeek: [],   // jours sélectionnés (1=Lu…7=Di)
    hours: [0, 23],
    daysOfMonth: [1, 31]     
  },
  layerType: 'scatter',
  sliderValue: 1000,
  cellSize: 20
};

// Load geojson and initialize
fetch("1milion_ok.geojson")
  .then(res => res.json())
  .then(geojson => {

    // Extract points
    const points = [];
    geojson.features.forEach(f => {
      const g = f.geometry;
      if (!g || !g.coordinates) return;
      if (g.type === 'MultiPoint') {
        g.coordinates.forEach(coord => points.push({ lon: coord[0], lat: coord[1], ...f.properties }));
      } else if (g.type === 'Point') {
        const [lon, lat] = g.coordinates;
        points.push({ lon, lat, ...f.properties });
      }
    });

    console.log('points chargés =', points.length);
    console.log('exemple de propriétés =', points[0]);
    points.forEach(d => d.transp_kind = Number(d.transp_kind));
    globalGeo = {};
    Object.entries(CATEGORY_MAP).forEach(([kind, { key }]) => {
           globalGeo[key + 'Pts'] = points.filter(p => p.transp_kind === +kind);
     });


    // Create single view instance
    instances.single = createInstance({
      container: 'deck-canvas-single',
      controlsPrefix: 'single',
      donutId: 'donut-single',
      initialState: defaultState,
      geo: globalGeo
    });
    toggleLegend(defaultState.layerType);


    // Header buttons
    document.getElementById('btn-compare').addEventListener('click', enterSplit);
    document.getElementById('btn-single').addEventListener('click', exitSplit);
    document.getElementById('btn-sync').addEventListener('click', () => {
      mirrorEnabled = !mirrorEnabled;
      document.getElementById('btn-sync').textContent = `Miroir : ${mirrorEnabled ? 'on' : 'off'}`;
      if (mirrorEnabled && instances.left && instances.right) {
        const vs = instances.left.state.viewState;
        instances.right.deckgl.setProps({ viewState: vs });
        instances.right.state.viewState = vs;
      }
    });
  })
  .catch(err => console.error("Erreur JSON:", err));


/** Create DeckGL + Chart + controls instance **/
function createInstance({ container, controlsPrefix, donutId, initialState, geo }) {
  const state = {
    viewState: { ...initialState.viewState },
    filters: {
      aerien:   initialState.filters.aerien,
      eau:      initialState.filters.eau,
      inconnu:  initialState.filters.inconnu,
      pieton:   initialState.filters.pieton,
      mobilite: initialState.filters.mobilite,
      voiture:  initialState.filters.voiture,
      months:      [...initialState.filters.months],
      daysOfWeek:  [...initialState.filters.daysOfWeek],
      hours:       [...initialState.filters.hours],
      daysOfMonth: [...initialState.filters.daysOfMonth],

    },
    layerType:    initialState.layerType,
    sliderValue:  initialState.sliderValue,
    cellSize:    initialState.cellSize
  };


  // 1. Créer l'élément canvas pour l'histogramme
  const histoCtx = document.getElementById(`${controlsPrefix}-hour-histogram`).getContext('2d');
  const histoChart = new Chart(histoCtx, {
  type: 'bar',
  data: {
    labels: Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0')), // '00' à '23'
    datasets: [{
      label: 'Points par heure',
      data: new Array(24).fill(0),
      backgroundColor: '#073775'
    }]
  },
  options: {
    responsive: true,
    scales: {
      x: {
        // ... tes options de titre et ticks
        grid: {
          color: '#ffffff',  
          opacity: 0,      // facultatif : couleur des lignes de fond
          lineWidth: 2, 
          display: false,         // ← ÉPAISSEUR des lignes
        }
      },
      y: {
        beginAtZero: true,
        // ... titre et ticks
        grid: {
          color: '#ffffff',  
          opacity: 0,
          lineWidth: 2,
          display: false,
        }
      }
    }
    ,
    plugins: {
      legend: { display: false }
    }
  }
});

  /*––– Donut –––*/
  const labels   = Object.values(CATEGORY_MAP).map(c => c.label);
  const bgColors = Object.values(CATEGORY_MAP).map(({ color }) => `rgb(${color.join(',')})`);
                       
  
  const ctx = document.getElementById(donutId).getContext('2d');
  const chart = new Chart(ctx,{
    type:'doughnut',
    data:{ labels, datasets:[{ data:new Array(6).fill(0), backgroundColor:bgColors }]},
    options:{ cutout:'60%', plugins:{ legend:{display:false},
      datalabels:{ color:'#fff',
        formatter:(v,ctx)=>{
          const t=ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
          return t?Math.round(v/t*100)+'%':''; }}}},
    plugins:[ChartDataLabels]
  });
  

  /*––– DeckGL –––*/
  const deckgl = new DeckGL({
    container,
    mapStyle:"https://openmaptiles.geo.data.gouv.fr/styles/positron/style.json",
    controller:true,
    viewState: state.viewState,
    getTooltip: ({object}) => makeTooltip(object),
    onViewStateChange: ({viewState})=>{
      state.viewState = viewState;
       // Ajout : si on a un quartier sélectionné ET qu'on dézoome sous le seuil, on réinitialise le filtre spatial
    if (selectedQuartierPolygon && viewState.zoom < 13) {
      selectedQuartierPolygon = null;
      updateView(); // recharge les données sans filtre spatial
      document.querySelector('#quartier-nom').textContent = ''; // supprime le nom du quartier affiché
    }
       /* ---- synchronisation miroir ---- */
    if (isSplit && mirrorEnabled && !syncingView) {
      const other = container.includes("left") ? "right"
                  : container.includes("right") ? "left"
                  : null;

      if (other && instances[other]) {
        syncingView = true;                  // on inhibe le callback de l’autre carte
        instances[other].deckgl.setProps({ viewState });
        instances[other].state.viewState = viewState;
        syncingView = false;
      }
    }
      deckgl.setProps({ viewState });
    },
    layers:[]
  });

      attachControlListeners(controlsPrefix, state, updateView);

      const thresholdSlider = document.getElementById('threshold-slider');
      const radiusSlider = document.getElementById('radius-slider');
      const thresholdValueEl = document.getElementById('threshold-value');
      const radiusValueEl = document.getElementById('radius-value');
      const cellSlider  = document.getElementById(`cell-slider-${controlsPrefix}`);
      const cellValueEl = document.getElementById(`cell-value-${controlsPrefix}`);

      if (cellSlider) {
        cellSlider.addEventListener('input', e => {
          state.cellSize         = +e.target.value;   // valeur stockée dans l’état de la vue
          cellValueEl.textContent = state.cellSize;   // maj de l’affichage “20”, “21”, …
          updateView();                               // re-rendu immédiat
        });
      }

      if (thresholdSlider) {
        thresholdSlider.addEventListener('input', e => {
          heatmapThreshold = parseFloat(e.target.value);
          thresholdValueEl.textContent = heatmapThreshold.toFixed(2);
          updateView(); // recharge la carte
        });
      }

  if (radiusSlider) {
    radiusSlider.addEventListener('input', e => {
      heatmapRadius = parseInt(e.target.value);
      radiusValueEl.textContent = heatmapRadius;
      updateView(); // recharge la carte
    });
  }

 

      const mapSelect = document.getElementById('map-style-select');

      const styleUrls = {
        positron: 'https://openmaptiles.geo.data.gouv.fr/styles/positron/style.json',
        dark: 'https://openmaptiles.geo.data.gouv.fr/styles/dark-matter/style.json',
        satellite: 'https://raw.githubusercontent.com/falgoust1/citiprofile/refs/heads/Gurwan/satelite.json'
      };
      
      mapSelect.addEventListener('change', (e) => {
        const newStyle = styleUrls[e.target.value];
      
        // single view
        if (instances.single) {
          instances.single.deckgl.setProps({ mapStyle: newStyle });
        }
      
        // split views
        if (instances.left) {
          instances.left.deckgl.setProps({ mapStyle: newStyle });
        }
        if (instances.right) {
          instances.right.deckgl.setProps({ mapStyle: newStyle });
        }
      
        // Mode sombre automatique si dark
        document.body.classList.toggle('dark-mode', e.target.value === 'dark');
      });
  









  /*––– Helpers –––*/
  const getCheckedMonths = id => Array.from(document.querySelectorAll(`#${id} input:checked`)).map(e=>+e.value);
  const getCheckedDays   = id => Array.from(document.querySelectorAll(`#${id} input:checked`)).map(e=>e.value);
  const setGroupChecked  = (id,check)=>document.querySelectorAll(`#${id} input`).forEach(cb=>cb.checked=check);
  const attachToggleButton = (btn,id) =>{
    if(!btn) return;
    btn.addEventListener('click',()=>{
      const boxes=document.querySelectorAll(`#${id} input`);
      const all=Array.from(boxes).every(cb=>cb.checked);
      setGroupChecked(id,!all);
      btn.textContent = all?'Tout cocher':'Tout décocher';
      state.filters.months     = id.startsWith('month') ? getCheckedMonths(id):state.filters.months;
      state.filters.daysOfWeek = id.startsWith('dow')   ? getCheckedDays(id):state.filters.daysOfWeek;
      onFiltersChange();
    });
  };

  /*––– Listeners cases –––*/
  document.querySelectorAll(`#month-checkboxes-${controlsPrefix} input`)
          .forEach(cb=>cb.addEventListener('change',()=>{
            state.filters.months=getCheckedMonths(`month-checkboxes-${controlsPrefix}`);
            onFiltersChange();
          }));
  document.querySelectorAll(`#dow-checkboxes-${controlsPrefix} input`)
          .forEach(cb=>cb.addEventListener('change',()=>{
            state.filters.daysOfWeek=getCheckedDays(`dow-checkboxes-${controlsPrefix}`);
            onFiltersChange();
          }));

  /*––– Boutons toggle –––*/
  attachToggleButton(
    document.querySelector(`.toggle-btn[data-target="month-checkboxes-${controlsPrefix}"]`),
    `month-checkboxes-${controlsPrefix}`
  );
  attachToggleButton(
    document.querySelector(`.toggle-btn[data-target="dow-checkboxes-${controlsPrefix}"]`),
    `dow-checkboxes-${controlsPrefix}`
  );

  /*––– Slider heures –––*/
  // valeurs cochées par défaut  ➜  on remplit d'emblée les filtres
state.filters.months     = getCheckedMonths(`month-checkboxes-${controlsPrefix}`);
state.filters.daysOfWeek = getCheckedDays  (`dow-checkboxes-${controlsPrefix}`);

// rendu initial de la carte
updateView();

  const hourSliderEl = document.getElementById(`hour-slider-${controlsPrefix}`);
  noUiSlider.create(hourSliderEl,{
    start:state.filters.hours, connect:true, step:1, range:{min:0,max:23},
    format:{ to:v=>Math.round(v), from:v=>+v }
  });
  // Crée des spans pour afficher les heures formatées
const hourLabels = [document.createElement('div'), document.createElement('div')];
hourLabels.forEach(label => {
  label.style.marginTop = '4px';
  label.style.textAlign = 'center';
  label.style.fontSize = '13px';
  label.style.color = 'black';
  label.style.fontFamily = 'Poppins';
  hourSliderEl.appendChild(label);
});

hourSliderEl.noUiSlider.on('update', (v, handle) => {
  state.filters.hours = v.map(n => +n);
  hourLabels.forEach((label, i) => {
    label.textContent = `${Math.round(v[i])}h`;
    const percent = (v[i] / 23) * 100;
    label.style.position = 'absolute';
    label.style.left = `calc(${percent}% - 10px)`; // centrer horizontalement
  });
  onFiltersChange();
});


/*––– Slider jours du mois –––*/
const domSliderEl = document.getElementById(`dom-slider-${controlsPrefix}`);
noUiSlider.create(domSliderEl, {
  start: state.filters.daysOfMonth,   // [1, 31]
  connect: true,
  step: 1,
  range: { min: 1, max: 31 },
  format: { to: v => Math.round(v), from: v => +v }
});

// labels optionnels
const domLabels = [document.createElement('div'), document.createElement('div')];
domLabels.forEach(l => {
  l.style.marginTop = '4px';
  l.style.textAlign = 'center';
  l.style.fontSize = '13px';
  l.style.color = 'black';
  l.style.position = 'absolute';
  domSliderEl.appendChild(l);
});

domSliderEl.noUiSlider.on('update', vals => {
  state.filters.daysOfMonth = vals.map(v => +v);
  vals.forEach((v, i) => {
    domLabels[i].textContent = v;
    domLabels[i].style.left = `calc(${(v - 1) / 30 * 100}% - 10px)`;
  });
  onFiltersChange();
});

/*––– Reset –––*/
document.getElementById(`reset-temporal-filters-${controlsPrefix}`)
        .addEventListener('click', () => {
          ['month-checkboxes', 'dow-checkboxes']
            .forEach(id => setGroupChecked(`${id}-${controlsPrefix}`, false));

          state.filters.months = [];
          state.filters.daysOfWeek = [];

          hourSliderEl.noUiSlider.set([0, 23]);
          domSliderEl.noUiSlider.set([1, 31]);   // ← ajoute cette ligne
          onFiltersChange();
        });



  /*––– Reset –––*/
  document.getElementById(`reset-temporal-filters-${controlsPrefix}`)
          .addEventListener('click',()=>{
            ['month-checkboxes','dow-checkboxes'].forEach(id=>setGroupChecked(`${id}-${controlsPrefix}`,false));
            state.filters.months=[]; state.filters.daysOfWeek=[];
            hourSliderEl.noUiSlider.set([0,23]);
            onFiltersChange();
          });

  function onFiltersChange(){ updateView(); }

  function updateView(){
    let pts = [];
    Object.values(CATEGORY_MAP).forEach(({ key }) => {
    if (state.filters[key]) pts = pts.concat(geo[key + 'Pts']);
  });

  
    if(state.filters.months.length === 0 || state.filters.daysOfWeek.length === 0){
      pts = [];
    } else {
      pts = pts.filter(d => {
        const m    = +d.MM;              // mois (1-12)
        const w    = ('' + d.day_of_week).trim(); // L, Ma, …
        const h    = +d.hh;              // heure (0-23)
        const dday = +d.JJ;              // 👈 nouveau : jour du mois (1-31)
      
        return (
          state.filters.months.includes(m) &&
          state.filters.daysOfWeek.includes(w) &&
          h    >= state.filters.hours[0]      && h    <= state.filters.hours[1] &&
          dday >= state.filters.daysOfMonth[0] && dday <= state.filters.daysOfMonth[1]  // 👈 test JJ
        );
      });
      
    
      // 🔥 Et seulement ensuite : filtrage spatial si un quartier est sélectionné
      if (selectedQuartierPolygon) {
        pts = pts.filter(pt =>
          turf.booleanPointInPolygon([pt.lon, pt.lat], selectedQuartierPolygon)
        );
      }
    }
  
    const quartiersLayer = new deck.GeoJsonLayer({
      id: 'quartiers-layer',
      data: 'https://data.rennesmetropole.fr/api/explore/v2.1/catalog/datasets/perimetres-des-12-quartiers-de-la-ville-de-rennes/exports/geojson?lang=fr&timezone=Europe%2FBerlin',
      stroked: true,
      filled: true,
      getLineColor: [37, 211, 102],
      lineWidthMinPixels: 2,
      getFillColor: [0, 0, 0, 0],
      pickable: true,
      autoHighlight: true,
      highlightColor: [102, 205, 170, 70],
      onHover: info => {
        if (info.object) {
          const nomQuartier = info.object.properties.nom;
          document.querySelector('#quartier-nom').innerHTML = `<span style="padding-right: 16px;">|</span>Quartier ${nomQuartier}`;
        }
      },
      onClick: info => {
        if (info.object) {
          const nomQuartier = info.object.properties.nom;
          document.querySelector('#quartier-nom').textContent = `| Quartier ${nomQuartier}`;
          selectedQuartierPolygon = info.object.geometry;
  
          const centroid = turf.centroid(selectedQuartierPolygon);
          const [longitude, latitude] = centroid.geometry.coordinates;
  
          const newViewState = {
            ...state.viewState,
            longitude,
            latitude,
            zoom: 13.5,
            transitionDuration: 500,
            transitionInterpolator: new FlyToInterpolator(),
          };
          state.viewState = newViewState;
          deckgl.setProps({ viewState: newViewState });
  
          updateView(); // 👈 ça déclenchera le filtrage immédiat 
        }
      }
    });
  
    // Ajoute la couche des quartiers en plus de la couche principale
    deckgl.setProps({ layers: [
      buildLayer(state.layerType, pts, state.sliderValue,state.cellSize),
      quartiersLayer
    ]});
  
    chart.data.datasets[0].data = Object.keys(CATEGORY_MAP).map(k =>
      pts.filter(p => p.transp_kind === +k).length
    );
    chart.update();
    
    
    const hourlyCount = new Array(24).fill(0);
    pts.forEach(p => {
      const h = +p.hh;
      if (h >= 0 && h < 24) hourlyCount[h]++;
    });
    histoChart.data.datasets[0].data = hourlyCount;
    histoChart.update();


  }

  return { deckgl, chart, state };
}



/** Build DeckGL layer **/
function buildLayer(type, data, slider, cellSize = 20) {
  switch(type){
    case 'scatter': return new ScatterplotLayer({
      id: 'ScatterplotLayer',
      data,
      radiusMinPixels: 1.4,
      radiusMaxPixels: 50,
      getRadius: 1,
      radiusUnits: 'pixels',
      getFillColor: d => CATEGORY_MAP[d.transp_kind]?.color || [0,0,0],
      getPosition: d => [d.lon, d.lat],
      opacity: 0.7 });
    case 'grid':    return new GridLayer({ id:'GridLayer', 
      data, 
      cellSize:100, 
      coverage:0.8, 
      extruded:true, 
      getPosition:d=>[d.lon,d.lat], 
      getElevationValue:pts=>pts.length, 
      colorAggregation:'SUM', 
      colorScaleType:'quantile', 
      opacity:1, 
      pickable:true, 
      colorRange:[[1,152,189],[73,227,206],[216,254,181],[254,237,177],[254,173,84],[209,55,78]] });
    case 'heat': return new HeatmapLayer({
      id: 'HeatmapLayer',
      data,
      getPosition: d => [d.lon, d.lat],
      getWeight: d => d.value || 1,
      radiusPixels: heatmapRadius,
      threshold: heatmapThreshold });
    case 'hex':     return new HexagonLayer({ 
      id:'HexagonLayer', 
      data, 
      getPosition:d=>[d.lon,d.lat], 
      radius:50, 
      coverage:0.8, 
      extruded:true, 
      getElevationValue:pts=>pts.length, 
      colorAggregation:'SUM', 
      colorScaleType:'quantile', 
      opacity:0.8, 
      pickable:true, 
      colorRange:[[1,152,189],[73,227,206],[216,254,181],[254,237,177],[254,173,84],[209,55,78]] });
    case 'screen':  return new ScreenGridLayer({ 
      id:'ScreenGridLayer', 
      data, 
      cellSizePixels:cellSize, 
      opacity:0.8, 
      getPosition:d=>[d.lon,d.lat], 
      colorRange:[[1,152,189],[73,227,206],[216,254,181],[254,237,177],[254,173,84],[209,55,78]] });
    case 'poly':    return new GeoJsonLayer({ 
      id:'GeoJsonLayer', 
      data:'https://raw.githubusercontent.com/falgoust1/citiprofile/Gurwan/bat6061s2.geojson', 
      extruded:true, 
      pickable:true, 
      getPolygon:d=>d.geometry.coordinates, 
      getElevation:d=>d.properties.HAUTEUR, 
      getFillColor:d=>d.properties.nbpoints<10?[1,152,189]:d.properties.nbpoints<40?[216,254,181]:[209,55,78], 
      getFilterValue:d=>d.properties.nbpoints, 
      filterRange:[0,slider], 
      extensions:[new DataFilterExtension({filterSize:1})] });
    default:       return new ScatterplotLayer({ id:'empty', data:[] });
  }
  }
  function toggleLegend(layerType) {
    const legend = document.getElementById('legend-block');
    if (['grid', 'hex', 'screen'].includes(layerType)) {
      legend.style.display = 'flex';
    } else {
      legend.style.display = 'none';
    }
  }
  




/** Tooltip generator **/
function makeTooltip(obj){
  if(!obj) return null;
  if(obj.properties && obj.properties.nbpoints!==undefined)
    return { html:`<b>Bâtiment</b><br>Points: ${obj.properties.nbpoints}`, style:{backgroundColor:'#333',color:'#fff',padding:'6px',fontSize:'0.9em'} };
  if(obj.count!==undefined)
    return { html:`<b>Agrégation</b><br>Points: ${obj.count}`, style:{backgroundColor:'#2a2a2a',color:'#eee',padding:'6px',fontSize:'0.9em'} };
  return null;
}

/** Controls listeners (couches & transport) **/
function attachControlListeners(prefix, state, onChange){
  ['scatter','grid','heat','hex','screen','poly'].forEach(type=>{
    const el=document.getElementById(`radio-${type}-${prefix}`);
    if(el) el.addEventListener('change',e=>{ if(e.target.checked){ state.layerType=type; onChange(); toggleLegend(type); }});
  });
  ['aerien','eau','inconnu','pieton','mobilite','voiture']
  .forEach(k=>{
     const cb=document.getElementById(`filter-${k}-${prefix}`);
     if(cb) cb.addEventListener('change',e=>{
       state.filters[k]=e.target.checked;
       onChange();
     });
});
  const sl=document.getElementById(`point-slider-${prefix}`);
  const lb=document.getElementById(`slider-value-${prefix}`);
  if(sl) sl.addEventListener('input',e=>{ state.sliderValue=+e.target.value; if(lb)lb.textContent=e.target.value; onChange(); });
}

/** Split view **/
function enterSplit(){
  if(isSplit) return; isSplit=true;
  document.getElementById('single-view').style.display='none';
  document.getElementById('split-view').style.display='flex';
  document.getElementById('btn-compare').style.display='none';
  document.getElementById('btn-single').style.display='inline-block';
  document.getElementById('btn-sync').style.display='inline-block';

  ['left','right'].forEach(side=>{
    instances[side]=createInstance({
      container:`canvas-${side}`,
      controlsPrefix:side,
      donutId:`donut-${side}`,
      initialState: instances.single.state,
      geo: globalGeo
    });
    toggleLegend(instances[side].state.layerType);
      });
}

/** Exit split **/
function exitSplit(){
  if(!isSplit) return; isSplit=false;
  ['left','right'].forEach(side=>{
    const inst=instances[side];
    if(inst){ inst.deckgl.finalize(); inst.chart.destroy(); delete instances[side]; }
  });
  document.getElementById('split-view').style.display='none';
  document.getElementById('single-view').style.display='block';
  document.getElementById('btn-compare').style.display='inline-block';
  document.getElementById('btn-single').style.display='none';
  document.getElementById('btn-sync').style.display='none';

 

}

// À placer à la fin de script.js ou dans un fichier séparé exportPdf.js
document.getElementById('btn-export-pdf').addEventListener('click', async () => {
  const { jsPDF } = window.jspdf;

  // Étape 1 : capturer les deux canvas WebGL (fond de carte + données DeckGL)
  const mapCanvas = document.querySelector('.mapboxgl-canvas');
  const deckCanvas = instances.single.deckgl.canvas;

  // Fusionne les deux dans un seul canvas
  const mergedCanvas = document.createElement('canvas');
  mergedCanvas.width = deckCanvas.width;
  mergedCanvas.height = deckCanvas.height;
  const mergedCtx = mergedCanvas.getContext('2d');

  // 1. Fond de carte
  mergedCtx.drawImage(mapCanvas, 0, 0);

  // 2. Données Deck.gl
  mergedCtx.drawImage(deckCanvas, 0, 0);

  // Image combinée
  const deckImage = new Image();
  deckImage.src = mergedCanvas.toDataURL('image/png');
  await new Promise(resolve => deckImage.onload = resolve);

  // Étape 2 : capturer les autres éléments (header, légende, graphiques)
  const headerCanvas = await html2canvas(document.getElementById('header'));
  const legendCanvas = await html2canvas(document.getElementById('legend-block'));
  const chartsCanvas = await html2canvas(document.getElementById('chart-panel-single'));

  // Étape 3 : créer un canvas final combiné
  const width = Math.max(
    mergedCanvas.width,
    headerCanvas.width,
    legendCanvas.width,
    chartsCanvas.width
  );
  const totalHeight = headerCanvas.height + mergedCanvas.height + legendCanvas.height + chartsCanvas.height;

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = totalHeight;
  const ctx = finalCanvas.getContext('2d');

  // Dessiner chaque section
  let y = 0;
  ctx.drawImage(headerCanvas, 0, y);
  y += headerCanvas.height;
  ctx.drawImage(deckImage, 0, y);
  y += deckImage.height;
  ctx.drawImage(legendCanvas, 0, y);
  y += legendCanvas.height;
  ctx.drawImage(chartsCanvas, 0, y);

  // Étape 4 : générer le PDF
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [width, totalHeight] });
  const finalImg = finalCanvas.toDataURL('image/png');
  pdf.addImage(finalImg, 'PNG', 0, 0, width, totalHeight);
  pdf.save('map.pdf');
});


// Gestion indépendante des menus latéraux
document.querySelectorAll('.sidebar-btn').forEach(btn=>{
  btn.addEventListener('click', () =>{
    const targetId = btn.dataset.target;                       // ex. layers-panel-left
    const scope    = btn.closest('.layer-controls');           // on reste dans la vue
    scope.querySelectorAll('.sidebar-panel').forEach(panel=>{
      panel.style.display =
        (panel.id === targetId && panel.style.display!=='block') ? 'block' : 'none';
    });
    /* ─────────── ALIGNE LE PANNEAU SUR LE BOUTON ─────────── */
      const panel = scope.querySelector('#' + targetId);
      if (panel && panel.style.display === 'block') {
        /* distance verticale du bouton à l’intérieur de .layer-controls */
        panel.style.top = btn.offsetTop + 'px';
    }
  });
});
