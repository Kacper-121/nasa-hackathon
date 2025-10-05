// Cloudflare Worker for Asteroid Impact Simulator + R2 Save

const NEO_LOOKUP_URL = "https://api.nasa.gov/neo/rest/v1/neo/";

// ---------- Physics helpers ----------
function sphereMass(diameterM, density = 3000.0) {
  const r = diameterM / 2.0;
  return (4.0 / 3.0) * Math.PI * Math.pow(r, 3) * density;
}
function kineticEnergyJoules(massKg, velocityMs) { return 0.5 * massKg * Math.pow(velocityMs, 2); }
function tntEquivalentMegatons(eJoules) { return eJoules / 4.184e15; }
function craterDiameterEstimateM(eJoules) { return 0.07 * Math.pow(eJoules, 1.0 / 3.0); }
function seismicMwEquivalent(eJoules) { if (eJoules <= 0) return 0; return (Math.log10(eJoules) - 5.24) / 1.44; }
function tsunamiInitialWaveHeightM(eJoules, waterDepthM = 4000.0) {
  const scale = Math.pow(eJoules / 1e15, 0.25);
  const depthFactor = Math.max(0.5, Math.min(2.0, 4000.0 / Math.max(1.0, waterDepthM)));
  return Math.max(0.01, Math.min(0.5 * scale * depthFactor, 200.0));
}

// ---------- Utilities ----------
async function fetchNeoById(neoId, apiKey) {
  try {
    const response = await fetch(`${NEO_LOOKUP_URL}${neoId}?api_key=${apiKey}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ---------- Route Handlers ----------
async function handleSimulate(request, env) {
  const data = await request.json();
  const apiKey = env.NASA_API_KEY; // Secret from Cloudflare

  if (data.neo_id) {
    const neo = await fetchNeoById(data.neo_id, apiKey);
    if (!neo.error) data.diameter_m = neo.estimated_diameter.meters.estimated_diameter_max;
  }

  const D = parseFloat(data.diameter_m || 50.0);
  const v = parseFloat(data.velocity_m_s || 20000.0);
  const rho = parseFloat(data.density || 3000.0);
  const waterDepth = parseFloat(data.water_depth_m || 4000.0);
  const deflection = parseFloat(data.deflection_m_s || 0.0);

  const vEffective = Math.max(0.0, v - deflection);
  const mass = sphereMass(D, rho);
  const E = kineticEnergyJoules(mass, vEffective);
  const tntMt = tntEquivalentMegatons(E);
  const craterM = craterDiameterEstimateM(E);
  const seismicMw = seismicMwEquivalent(E);
  const tsunamiH = tsunamiInitialWaveHeightM(E, waterDepth);
  const tsunamiRadiusKm = Math.min(5000.0, 100.0 * Math.pow(Math.max(0.001, tntMt), 0.25));

  return new Response(JSON.stringify({
    input: { diameter_m: D, velocity_m_s: v, density: rho, deflection_m_s: deflection, impact_lat: data.impact_lat, impact_lon: data.impact_lon, water_depth_m: waterDepth },
    results: { mass_kg: mass, energy_joules: E, tnt_megatons: tntMt, crater_diameter_m: craterM, seismic_mw_equivalent: seismicMw, tsunami_initial_height_m: tsunamiH, tsunami_radius_km: tsunamiRadiusKm },
    notes: "All estimates are rough heuristics for demo/educational purposes."
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

// ---------- Save simulation data to R2 ----------
async function handleSave(request, env) {
  try {
    const data = await request.json();
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const random = Math.random().toString(36).substring(2, 8);
    const objectKey = `impact_${timestamp}_${random}.json`;

    await env.R2_BUCKET.put(objectKey, JSON.stringify(data, null, 2), {
      httpMetadata: { contentType: "application/json" }
    });

    return new Response(JSON.stringify({ success: true, key: objectKey }), { 
      status: 200, 
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, 
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
    });
  }
}

// ---------- Main Worker Handler ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/simulate")) return handleSimulate(request, env);
    if (url.pathname.startsWith("/save")) return handleSave(request, env);
    return new Response("Not Found", { status: 404 });
  }
};
