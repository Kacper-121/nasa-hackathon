from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS  # <-- add this
import math 
import os
import requests

app = Flask(__name__, static_url_path='', static_folder='.')

NASA_KEY = os.environ.get("NASA_API_KEY", "DEMO_KEY")
NEO_LOOKUP_URL = "https://api.nasa.gov/neo/rest/v1/neo/{}?api_key={}"

# ---------- Physics helpers ----------
def sphere_mass(diameter_m, density=3000.0):
    r = diameter_m / 2.0
    return (4.0/3.0) * math.pi * (r**3) * density

def kinetic_energy_joules(mass_kg, velocity_m_s):
    return 0.5 * mass_kg * (velocity_m_s**2)

def tnt_equivalent_megatons(E_joules):
    return E_joules / 4.184e15

def crater_diameter_estimate_m(E_joules):
    return 0.07 * (E_joules ** (1.0/3.0))

def seismic_mw_equivalent(E_joules):
    if E_joules <= 0:
        return 0
    return (math.log10(E_joules) - 5.24) / 1.44

def tsunami_initial_wave_height_m(E_joules, water_depth_m=4000.0):
    scale = (E_joules / 1e15) ** 0.25
    depth_factor = max(0.5, min(2.0, 4000.0 / max(1.0, water_depth_m)))
    h = 0.5 * scale * depth_factor
    return max(0.01, min(h, 200.0))

# ---------- Utilities ----------
def fetch_neo_by_id(neo_id):
    try:
        r = requests.get(NEO_LOOKUP_URL.format(neo_id, NASA_KEY), timeout=8)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e)}

# ---------- Routes ----------
@app.route("/")
def index():
    return send_from_directory('.', 'index.html')

@app.route("/simulate", methods=["POST"])
def simulate():
    data = request.get_json(force=True)
    if data.get("neo_id"):
        neo = fetch_neo_by_id(data["neo_id"])
        if "error" in neo:
            return jsonify({"error": "Failed to fetch NEO: " + neo["error"]}), 500
        try:
            data["diameter_m"] = neo["estimated_diameter"]["meters"]["estimated_diameter_max"]
        except Exception:
            pass

    D = float(data.get("diameter_m", 50.0))
    v = float(data.get("velocity_m_s", 20000.0))
    rho = float(data.get("density", 3000.0))
    water_depth = float(data.get("water_depth_m", 4000.0))
    deflection = float(data.get("deflection_m_s", 0.0))

    v_effective = max(0.0, v - deflection)
    mass = sphere_mass(D, rho)
    E = kinetic_energy_joules(mass, v_effective)
    tnt_mt = tnt_equivalent_megatons(E)
    crater_m = crater_diameter_estimate_m(E)
    seismic_mw = seismic_mw_equivalent(E)
    tsunami_h = tsunami_initial_wave_height_m(E, water_depth)

    try:
        tsunami_radius_km = min(5000.0, 100.0 * (max(0.001, tnt_mt) ** 0.25))
    except Exception:
        tsunami_radius_km = 0.0

    resp = {
        "input": {
            "diameter_m": D, "velocity_m_s": v, "density": rho,
            "deflection_m_s": deflection,
            "impact_lat": data.get("impact_lat"), "impact_lon": data.get("impact_lon"),
            "water_depth_m": water_depth
        },
        "results": {
            "mass_kg": mass,
            "energy_joules": E,
            "tnt_megatons": tnt_mt,
            "crater_diameter_m": crater_m,
            "seismic_mw_equivalent": seismic_mw,
            "tsunami_initial_height_m": tsunami_h,
            "tsunami_radius_km": tsunami_radius_km
        },
        "notes": "All estimates are rough heuristics for demo/educational purposes."
    }
    return jsonify(resp)

@app.route("/story", methods=["POST"])
def story():
    s = request.get_json(force=True)
    r = s.get("results", s)
    lat = s.get("input", {}).get("impact_lat", None)
    lon = s.get("input", {}).get("impact_lon", None)

    tnt = r.get("tnt_megatons")
    crater_km = r.get("crater_diameter_m", 0) / 1000.0
    tsunami_h = r.get("tsunami_initial_height_m")
    tsunami_radius = r.get("tsunami_radius_km")
    mw = r.get("seismic_mw_equivalent")

    location_text = f" at ({lat:.3f}, {lon:.3f})" if lat and lon else ""
    para = (
        f"Impact simulation{location_text}: The asteroid would release approximately "
        f"{tnt:,.2f} megatons of TNT equivalent, producing an estimated crater about "
        f"{crater_km:.2f} km in diameter. The impact energy corresponds roughly to an earthquake "
        f"of magnitude {mw:.2f}. If the impact occurs in water, our heuristic predicts an initial "
        f"tsunami wave of about {tsunami_h:.2f} meters and potential coastal effects out to roughly "
        f"{tsunami_radius:.0f} km from the source. These results are approximate and intended for "
        "education/demonstration only."
    )
    return jsonify({"story": para})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
