// worker.js — Cloudflare Worker for Asteroid Impact Simulator + R2 Save

const NASA_KEY = "DEMO_KEY"; // fallback key
const NEO_LOOKUP_URL = "https://api.nasa.gov/neo/rest/v1/neo/";

// ---------- Physics helpers ----------
function sphereMass(diameterM, density = 3000.0) {
  const r = diameterM / 2.0;
  return (4 / 3) * Math.PI * r ** 3 * density;
}
function kineticEnergyJoules(massKg, velocityMs) {
  return 0.5 * massKg * velocityMs ** 2;
}
function tntEquivalentMegatons(eJoules) {
  return eJoules / 4.184e15;
}
function craterDiameterEstimateM(eJoules) {
  return 0.07 * eJoules ** (1 / 3);
}
function seismicMwEquivalent(eJoules) {
  if (eJoules <= 0) return 0;
  return (Math.log10(eJoules) - 5.24) / 1.44;
}
function tsunamiInitialWaveHeightM(eJoules, waterDepthM = 4000.0) {
  const scale = (eJoules / 1e15) ** 0.25;
  const depthFactor = Math.max(0.5, Math.min(2.0, 4000.0 / Math.max(1.0, waterDepthM)));
  return Math.max(0.01, Math.min(0.5 * scale * depthFactor, 200.0));
}

// ---------- NASA helper ----------
async function fetchNeoById(neoId, apiKey) {
  try {
    const res = await fetch(`${NEO_LOOKUP_URL}${neoId}?api_key=${apiKey}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ---------- /simulate ----------
async function handleSimulate(request, env) {
  const data = await request.json();
  const apiKey = env.NASA_API_KEY || NASA_KEY;

  if (data.neo_id) {
    const neo = await fetchNeoById(data.neo_id, apiKey);
    if (!neo.error) data.diameter_m = neo.estimated_diameter.meters.estimated_diameter_max;
  }

  const D = parseFloat(data.diameter_m || 50);
  const v = parseFloat(data.velocity_m_s || 20000);
  const rho = parseFloat(data.density || 3000);
  const waterDepth = parseFloat(data.water_depth_m || 4000);
  const deflection = parseFloat(data.deflection_m_s || 0);

  const vEff = Math.max(0, v - deflection);
  const m = sphereMass(D, rho);
  const E = kineticEnergyJoules(m, vEff);
  const tnt = tntEquivalentMegatons(E);
  const crater = craterDiameterEstimateM(E);
  const mw = seismicMwEquivalent(E);
  const tsunamiH = tsunamiInitialWaveHeightM(E, waterDepth);
  const tsunamiR = Math.min(5000, 100 * Math.pow(Math.max(0.001, tnt), 0.25));

  return {
    input: { diameter_m: D, velocity_m_s: v, density: rho, deflection_m_s: deflection, water_depth_m: waterDepth, impact_lat: data.impact_lat, impact_lon: data.impact_lon },
    results: { mass_kg: m, energy_joules: E, tnt_megatons: tnt, crater_diameter_m: crater, seismic_mw_equivalent: mw, tsunami_initial_height_m: tsunamiH, tsunami_radius_km: tsunamiR },
    notes: "Approximate demo calculation"
  };
}

// ---------- /save ----------
async function handleSave(request, env) {
  try {
    const data = await request.json();

    // auto-generate readable filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const random = Math.random().toString(36).slice(2, 8);
    const objectKey = `impact_${timestamp}_${random}.json`;

    await env.R2_BUCKET.put(objectKey, JSON.stringify(data, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });

    return new Response(
      JSON.stringify({ success: true, key: objectKey }),
      { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
}

// ---------- /story ----------
async function handleStory(request) {
  const s = await request.json();
  const r = s.results || s;
  const lat = s.input?.impact_lat || null;
  const lon = s.input?.impact_lon || null;

  const tnt = r.tnt_megatons;
  const craterKm = (r.crater_diameter_m || 0) / 1000;
  const tsunamiH = r.tsunami_initial_height_m;
  const tsunamiR = r.tsunami_radius_km;
  const mw = r.seismic_mw_equivalent;

  const loc = lat && lon ? ` at (${lat.toFixed(3)}, ${lon.toFixed(3)})` : "";
  const text = `Impact${loc}: releases ${tnt.toFixed(2)} Mt TNT, forming ~${craterKm.toFixed(2)} km crater, equivalent to M${mw.toFixed(2)} quake, tsunami ${tsunamiH.toFixed(2)} m high reaching ${tsunamiR.toFixed(0)} km.`;

  return { story: text };
}

// ---------- Main Handler ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (path === "/simulate" && request.method === "POST")
      return new Response(JSON.stringify(await handleSimulate(request, env)), { headers: { ...cors, "Content-Type": "application/json" } });

    if (path === "/save" && request.method === "POST")
      return await handleSave(request, env);

    if (path === "/story" && request.method === "POST")
      return new Response(JSON.stringify(await handleStory(request)), { headers: { ...cors, "Content-Type": "application/json" } });

    if (path === "/" && request.method === "GET") {
      const html = await fetch("https://erickbm303.github.io/nasa-hackathon-fork/").then(r => r.text());
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    return new Response(JSON.stringify({ ok: true, endpoints: ["/simulate", "/story", "/save"] }), { headers: { ...cors, "Content-Type": "application/json" } });
  },
};
