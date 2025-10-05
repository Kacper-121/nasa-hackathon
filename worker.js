export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- ✅ Save Simulation to R2 ---
    if (path === "/save_sim" && request.method === "POST") {
      try {
        const data = await request.json();
        const key = `sim-${Date.now()}.json`; // filename in R2

        await env.R2_BUCKET.put(key, JSON.stringify(data));

        return new Response(
          JSON.stringify({ message: "✅ Saved to Cloudflare!", file: key }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Existing routes ---
    if (path === "/simulate" && request.method === "POST") {
      const response = await handleSimulate(request, env);
      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/story" && request.method === "POST") {
      const response = await handleStory(request);
      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/" && request.method === "GET") {
      const html = await fetch("https://erickbm303.github.io/nasa-hackathon-fork/").then(r => r.text());
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    return new Response(
      JSON.stringify({
        message: "Asteroid Impact Simulator API",
        endpoints: ["/simulate (POST)", "/story (POST)", "/save_sim (POST)"],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  },
};
