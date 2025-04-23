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
let selectedQuartierPolygon = null;

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
    pied: true,
    vehicule: true,
    months: [],       // mois sélectionnés (1–12)
    daysOfWeek: [],   // jours sélectionnés (1=Lu…7=Di)
    hours: [0, 23]    // plage d’heures
  },
  layerType: 'grid',
  sliderValue: 1000
};

// Load geojson and initialize
fetch("ZN_bat_60-61_w_IDs.geojson")
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
    points.forEach(d => d.transp_kind = Number(d.transp_kind));
    const piedPts     = points.filter(d => d.transp_kind === 60);
    const vehiculePts = points.filter(d => d.transp_kind === 61);

    // Store global data
    globalGeo = { piedPts, vehiculePts };

    // Create single view instance
    instances.single = createInstance({
      container: 'deck-canvas-single',
      controlsPrefix: 'single',
      donutId: 'donut-single',
      initialState: defaultState,
      geo: globalGeo
    });

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
      pied:        initialState.filters.pied,
      vehicule:    initialState.filters.vehicule,
      months:      [...initialState.filters.months],
      daysOfWeek:  [...initialState.filters.daysOfWeek],
      hours:       [...initialState.filters.hours]
    },
    layerType:    initialState.layerType,
    sliderValue:  initialState.sliderValue
  };

  /*––– Donut –––*/
  const ctx = document.getElementById(donutId).getContext('2d');
  const chart = new Chart(ctx,{
    type:'doughnut',
    data:{ labels:['À pied','Véhicule'], datasets:[{ data:[0,0], backgroundColor:['#76c7c0','#f27c66'] }]},
    options:{ cutout:'60%', plugins:{ legend:{display:false}, datalabels:{ color:'#fff', formatter:(v,ctx)=>{ const t=ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0); return t?Math.round(v/t*100)+'%':''; }}}},
    plugins:[ChartDataLabels]
  });

  /*––– DeckGL –––*/
  const deckgl = new DeckGL({
    container,
    mapStyle:"https://openmaptiles.geo.data.gouv.fr/styles/positron/style.json",
    controller:true,
    viewState: state.viewState,
    onViewStateChange: ({viewState})=>{
      state.viewState = viewState;
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
  hourSliderEl.noUiSlider.on('update',v=>{
    state.filters.hours=v.map(n=>+n);
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
    let pts=[];
    if(state.filters.pied)     pts.push(...geo.piedPts);
    if(state.filters.vehicule) pts.push(...geo.vehiculePts);
  
    if(state.filters.months.length === 0 || state.filters.daysOfWeek.length === 0){
      pts = [];
    } else {
      pts = pts.filter(d => {
        const m = +d.month;
        const w = ('' + d.day_of_week).trim();
        const h = +d.hour;
        return (
          state.filters.months.includes(m) &&
          state.filters.daysOfWeek.includes(w) &&
          h >= state.filters.hours[0] &&
          h <= state.filters.hours[1]
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
      buildLayer(state.layerType, pts, state.sliderValue),
      quartiersLayer
    ]});
  
    chart.data.datasets[0].data = [
      pts.filter(p=>p.transp_kind===60).length,
      pts.filter(p=>p.transp_kind===61).length
    ];
    chart.update();


  }

  return { deckgl, chart, state };
}



/** Build DeckGL layer **/
function buildLayer(type, data, slider) {
  switch(type){
    case 'scatter': return new ScatterplotLayer({ 
      id:'ScatterplotLayer', 
      data, 
      radiusMinPixels:1.4, 
      radiusMaxPixels:50, 
      getRadius:1, 
      radiusUnits:'pixels', 
      getFillColor:d=>d.prixm2>4000?[202,0,32]:d.prixm2>3000?[244,165,130]:d.prixm2>2000?[146,197,222]:[5,113,176], 
      getPosition:d=>[d.lon,d.lat], 
      opacity:0.7 });
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
    case 'heat':    return new HeatmapLayer({ 
      id:'HeatmapLayer', 
      data, radiusPixels:50, 
      threshold:0.5, 
      getPosition:d=>[d.lon,d.lat] });
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
      cellSizePixels:20, 
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
    if(el) el.addEventListener('change',e=>{ if(e.target.checked){ state.layerType=type; onChange(); }});
  });
  ['pied','vehicule'].forEach(k=>{
    const cb=document.getElementById(`filter-${k}-${prefix}`);
    if(cb) cb.addEventListener('change',e=>{ state.filters[k]=e.target.checked; onChange(); });
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
