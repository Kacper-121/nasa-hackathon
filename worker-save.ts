const map = L.map('map').setView([40.7, -74.0], 9);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18, attribution: '© OpenStreetMap'
}).addTo(map);

let impactMarker = L.circleMarker([40.67, -74.0], {radius:6, color:'red'}).addTo(map);
let impactCircle = null;
let tsunamiCircle = null;

map.on('click', e => impactMarker.setLatLng(e.latlng));

// Sliders
const diam = document.getElementById('diam'), diamLabel = document.getElementById('diamLabel');
const vel = document.getElementById('vel'), velLabel = document.getElementById('velLabel');
const def = document.getElementById('def'), defLabel = document.getElementById('defLabel');
const depthInput = document.getElementById('depth');

diam.oninput = () => diamLabel.innerText = diam.value;
vel.oninput = () => velLabel.innerText = vel.value;
def.oninput = () => defLabel.innerText = def.value;

const info = document.getElementById('info');
const storyDiv = document.getElementById('story');

async function simulate(){
  const latlng = impactMarker.getLatLng();
  const payload = {
    diameter_m: Number(diam.value),
    velocity_m_s: Number(vel.value) * 1000,
    density: 3000,
    impact_lat: latlng.lat,
    impact_lon: latlng.lng,
    water_depth_m: Number(depthInput.value),
    deflection_m_s: Number(def.value)
  };

  info.innerText = "Simulating...";
  try {
    const res = await fetch("http://127.0.0.1:5000/simulate", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    displayResults(data);
  } catch(err){
    info.innerText = "Failed to contact backend. Is Flask running?";
    console.error(err);
  }
}

function displayResults(data){
  const r = data.results;
  info.innerHTML = `
    <b>Mass:</b> ${(r.mass_kg).toExponential(3)} kg<br/>
    <b>Energy:</b> ${(r.energy_joules).toExponential(3)} J<br/>
    <b>TNT equiv:</b> ${r.tnt_megatons.toFixed(3)} megatons<br/>
    <b>Crater:</b> ${(r.crater_diameter_m/1000).toFixed(2)} km diameter<br/>
    <b>Seismic Mw (approx):</b> ${r.seismic_mw_equivalent.toFixed(2)}<br/>
    <b>Initial tsunami (heuristic):</b> ${r.tsunami_initial_height_m.toFixed(2)} m<br/>
    <b>Tsunami radius heuristic:</b> ${r.tsunami_radius_km.toFixed(0)} km
  `;

  // Draw circles
  if (impactCircle) map.removeLayer(impactCircle);
  if (tsunamiCircle) map.removeLayer(tsunamiCircle);

  const latlng = impactMarker.getLatLng();
  const crater_km = r.crater_diameter_m / 1000.0;
  impactCircle = L.circle(latlng, {radius: crater_km * 1000 / 2, color:'orangered', fill:false}).addTo(map);

  const tsunami_km = Math.min(2000, r.tsunami_radius_km);
  tsunamiCircle = L.circle(latlng, {radius: tsunami_km * 1000, color:'blue', fill:false, dashArray:'6 6'}).addTo(map);

  map.fitBounds(L.featureGroup([impactCircle, tsunamiCircle]).getBounds().pad(0.6));

  fetchStory({input: data.input, results: r});
}

async function fetchStory(sim){
  storyDiv.innerText = "Generating narrative...";
  try {
    const res = await fetch("http://127.0.0.1:5000/story", {
      method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(sim)
    });
    const data = await res.json();
    storyDiv.innerText = data.story;
  } catch(err){
    storyDiv.innerText = "Failed to generate narrative locally.";
    console.error(err);
  }
}

document.getElementById('simulateBtn').addEventListener('click', simulate);
document.getElementById('saveBtn').addEventListener('click', () => {
  alert("Cloudflare save disabled for local testing.");
});
