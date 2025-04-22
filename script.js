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
  GeoJsonLayer
} = deck;

// Global flags, data and instance storage
let isSplit = false;
let mirrorEnabled = false;
let globalGeo = null;
const instances = {};

// Default initial state for single view
const defaultState = {
  viewState: {
    longitude: -1.6992,
    latitude: 48.1119,
    zoom: 14,
    pitch: 40,
    bearing: 0
  },
  filters: { pied: true, vehicule: true },
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
    filters: { ...initialState.filters },
    layerType: initialState.layerType,
    sliderValue: initialState.sliderValue
  };

  // Chart.js donut
  const ctx = document.getElementById(donutId).getContext('2d');
  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['À pied','Véhicule'],
      datasets: [{ data: [0,0], backgroundColor: ['#76c7c0','#f27c66'], hoverOffset: 8 }]
    },
    options: {
      cutout: '60%',
      plugins: {
        title: { display:true, text:"Part de piétons et d'automobilistes", color:'#fff', font:{size:18}, padding:{top:10,bottom:20} },
        legend:{ display:false },
        datalabels:{ color:'#fff', formatter:(v,ctx)=>{
          const tot = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
          return tot?`${Math.round(v/tot*100)}%`:'';
        }}
      }
    },
    plugins: [ChartDataLabels]
  });

  // DeckGL
  const deckgl = new DeckGL({
    container,
    crossOrigin:'anonymous',
    mapStyle:"https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
    controller:true,
    viewState: state.viewState,
    onViewStateChange: ({viewState})=>{
      state.viewState = viewState;
      if(isSplit && mirrorEnabled){
        const other = container==='canvas-left'?'right':'left';
        if(instances[other]){
          instances[other].deckgl.setProps({ viewState });
          instances[other].state.viewState = viewState;
        }
      }
      deckgl.setProps({ viewState: state.viewState });
    },
    getTooltip: ({object})=> makeTooltip(object),
    layers: []
  });

  // Controls listeners
  attachControlListeners(controlsPrefix, state, updateView);

  // Initial update
  updateView();

  function updateView() {
    const pts = [];
    if(state.filters.pied) pts.push(...geo.piedPts);
    if(state.filters.vehicule) pts.push(...geo.vehiculePts);
    const layer = buildLayer(state.layerType, pts, state.sliderValue);
    deckgl.setProps({ layers:[layer], viewState: state.viewState });
    const cP = pts.filter(d=>d.transp_kind===60).length;
    const cV = pts.filter(d=>d.transp_kind===61).length;
    chart.data.datasets[0].data=[cP,cV]; chart.update();
  }

  return { deckgl, chart, state };
}

/** Build DeckGL layer **/
function buildLayer(type, data, slider) {
  switch(type){
    case 'scatter': return new ScatterplotLayer({ id:'ScatterplotLayer', data, radiusMinPixels:1.4, radiusMaxPixels:50, getRadius:1, radiusUnits:'pixels', getFillColor:d=>d.prixm2>4000?[202,0,32]:d.prixm2>3000?[244,165,130]:d.prixm2>2000?[146,197,222]:[5,113,176], getPosition:d=>[d.lon,d.lat], opacity:0.7 });
    case 'grid': return new GridLayer({ id:'GridLayer', data, cellSize:100, coverage:0.8, extruded:true, getPosition:d=>[d.lon,d.lat], getElevationValue:pts=>pts.length, colorAggregation:'SUM', colorScaleType:'quantile', opacity:1, pickable:true, colorRange:[[1,152,189],[73,227,206],[216,254,181],[254,237,177],[254,173,84],[209,55,78]] });
    case 'heat': return new HeatmapLayer({ id:'HeatmapLayer', data, radiusPixels:50, threshold:0.5, getPosition:d=>[d.lon,d.lat] });
    case 'hex': return new HexagonLayer({ id:'HexagonLayer', data, getPosition:d=>[d.lon,d.lat], radius:50, coverage:0.8, extruded:true, getElevationValue:pts=>pts.length, colorAggregation:'SUM', colorScaleType:'quantile', opacity:0.8, pickable:true, colorRange:[[1,152,189],[73,227,206],[216,254,181],[254,237,177],[254,173,84],[209,55,78]] });
    case 'screen': return new ScreenGridLayer({ id:'ScreenGridLayer', data, cellSizePixels:20, opacity:0.8, getPosition:d=>[d.lon,d.lat], colorRange:[[1,152,189],[73,227,206],[216,254,181],[254,237,177],[254,173,84],[209,55,78]] });
    case 'poly': return new GeoJsonLayer({ id:'GeoJsonLayer', data:'https://raw.githubusercontent.com/falgoust1/citiprofile/Gurwan/bat6061s2.geojson', extruded:true, pickable:true, getPolygon:d=>d.geometry.coordinates, getElevation:d=>d.properties.HAUTEUR, getFillColor:d=>d.properties.nbpoints<10?[1,152,189]:d.properties.nbpoints<40?[216,254,181]:[209,55,78], getFilterValue:d=>d.properties.nbpoints, filterRange:[0,slider], extensions:[new DataFilterExtension({filterSize:1})] });
    default: return new ScatterplotLayer({ id:'empty', data:[] });
  }
}

/** Tooltip generator **/
function makeTooltip(obj){
  if(!obj) return null;
  if(obj.properties && obj.properties.nbpoints!==undefined) return { html:`<b>Bâtiment</b><br>Points: ${obj.properties.nbpoints}`, style:{backgroundColor:'#333',color:'#fff',padding:'6px',fontSize:'0.9em'} };
  if(obj.count!==undefined) return { html:`<b>Agrégation</b><br>Points: ${obj.count}`, style:{backgroundColor:'#2a2a2a',color:'#eee',padding:'6px',fontSize:'0.9em'} };
  return null;
}

/** Controls listeners **/
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
      container:`canvas-${side}`, controlsPrefix:side, donutId:`donut-${side}`, initialState:instances.single.state, geo:globalGeo
    });
  });
}

/** Exit split **/
function exitSplit(){
  if(!isSplit) return; isSplit=false;
  ['left','right'].forEach(side=>{
    const inst=instances[side]; if(inst){ inst.deckgl.finalize(); inst.chart.destroy(); delete instances[side]; }
  });
  document.getElementById('split-view').style.display='none';
  document.getElementById('single-view').style.display='block';
  document.getElementById('btn-compare').style.display='inline-block';
  document.getElementById('btn-single').style.display='none';
  document.getElementById('btn-sync').style.display='none';
}
