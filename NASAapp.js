// Cloudflare Worker for Asteroid Impact Simulator

const NASA_KEY = "DEMO_KEY"; // Replace with your NASA API key in environment variables
const NEO_LOOKUP_URL = "https://api.nasa.gov/neo/rest/v1/neo/";

// ---------- Physics helpers ----------
function sphereMass(diameterM, density = 3000.0) {
  const r = diameterM / 2.0;
  return (4.0 / 3.0) * Math.PI * Math.pow(r, 3) * density;
}

function kineticEnergyJoules(massKg, velocityMs) {
  return 0.5 * massKg * Math.pow(velocityMs, 2);
}

function tntEquivalentMegatons(eJoules) {
  return eJoules / 4.184e15;
}

function craterDiameterEstimateM(eJoules) {
  return 0.07 * Math.pow(eJoules, 1.0 / 3.0);
}

function seismicMwEquivalent(eJoules) {
  if (eJoules <= 0) return 0;
  return (Math.log10(eJoules) - 5.24) / 1.44;
}

function tsunamiInitialWaveHeightM(eJoules, waterDepthM = 4000.0) {
  const scale = Math.pow(eJoules / 1e15, 0.25);
  const depthFactor = Math.max(0.5, Math.min(2.0, 4000.0 / Math.max(1.0, waterDepthM)));
  const h = 0.5 * scale * depthFactor;
  return Math.max(0.01, Math.min(h, 200.0));
}

// ---------- Utilities ----------
async function fetchNeoById(neoId, apiKey) {
  try {
    const response = await fetch(`${NEO_LOOKUP_URL}${neoId}?api_key=${apiKey}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ---------- Route Handlers ----------
async function handleSimulate(request, env) {
  try {
    const data = await request.json();
    const apiKey = env.NASA_API_KEY || NASA_KEY;
    
    // Fetch NEO data if ID provided
    if (data.neo_id) {
      const neo = await fetchNeoById(data.neo_id, apiKey);
      if (neo.error) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch NEO: " + neo.error }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      try {
        data.diameter_m = neo.estimated_diameter.meters.estimated_diameter_max;
      } catch (e) {
        // Continue with provided diameter
      }
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

    let tsunamiRadiusKm = 0.0;
    try {
      tsunamiRadiusKm = Math.min(5000.0, 100.0 * Math.pow(Math.max(0.001, tntMt), 0.25));
    } catch (e) {
      tsunamiRadiusKm = 0.0;
    }

    const resp = {
      input: {
        diameter_m: D,
        velocity_m_s: v,
        density: rho,
        deflection_m_s: deflection,
        impact_lat: data.impact_lat,
        impact_lon: data.impact_lon,
        water_depth_m: waterDepth
      },
      results: {
        mass_kg: mass,
        energy_joules: E,
        tnt_megatons: tntMt,
        crater_diameter_m: craterM,
        seismic_mw_equivalent: seismicMw,
        tsunami_initial_height_m: tsunamiH,
        tsunami_radius_km: tsunamiRadiusKm
      },
      notes: "All estimates are rough heuristics for demo/educational purposes."
    };

    return new Response(JSON.stringify(resp), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleStory(request) {
  try {
    const s = await request.json();
    const r = s.results || s;
    const lat = s.input?.impact_lat || null;
    const lon = s.input?.impact_lon || null;

    const tnt = r.tnt_megatons;
    const craterKm = (r.crater_diameter_m || 0) / 1000.0;
    const tsunamiH = r.tsunami_initial_height_m;
    const tsunamiRadius = r.tsunami_radius_km;
    const mw = r.seismic_mw_equivalent;

    const locationText = lat && lon ? ` at (${lat.toFixed(3)}, ${lon.toFixed(3)})` : "";
    const para = `Impact simulation${locationText}: The asteroid would release approximately ` +
      `${tnt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} megatons of TNT equivalent, producing an estimated crater about ` +
      `${craterKm.toFixed(2)} km in diameter. The impact energy corresponds roughly to an earthquake ` +
      `of magnitude ${mw.toFixed(2)}. If the impact occurs in water, our heuristic predicts an initial ` +
      `tsunami wave of about ${tsunamiH.toFixed(2)} meters and potential coastal effects out to roughly ` +
      `${tsunamiRadius.toFixed(0)} km from the source. These results are approximate and intended for ` +
      "education/demonstration only.";

    return new Response(JSON.stringify({ story: para }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ---------- Main Worker Handler ----------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route handling
    if (path === '/simulate' && request.method === 'POST') {
      const response = await handleSimulate(request, env);
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders
      });
    }

    if (path === '/story' && request.method === 'POST') {
      const response = await handleStory(request);
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders
      });
    }

    // Default response for root or unknown paths
    return new Response(
      JSON.stringify({ 
        message: "Asteroid Impact Simulator API",
        endpoints: ["/simulate (POST)", "/story (POST)"]
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
};
