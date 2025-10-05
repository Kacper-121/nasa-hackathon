@@ -113,41 +113,43 @@ async function handleStory(request) {

// ---------- Main Worker Handler ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = { 
      'Access-Control-Allow-Origin': '*', 
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 
      'Access-Control-Allow-Headers': 'Content-Type' 
    };

    if (request.method === "OPTIONS") 
      return new Response(null, { headers: corsHeaders });

    if (path === "/simulate" && request.method === "POST") {
      const resp = await handleSimulate(request, env);
      return new Response(JSON.stringify(resp), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/save" && request.method === "POST") {
      return await handleSave(request, env);
    }

    if (path === "/story" && request.method === "POST") {
      const resp = await handleStory(request);
      return new Response(JSON.stringify(resp), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/" && request.method === "GET") {
      const html = await fetch("https://erickbm303.github.io/nasa-hackathon-fork/").then(r => r.text());
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    return new Response(JSON.stringify({ 
      message: "Asteroid Impact Simulator API", 
      endpoints: ["/simulate (POST)", "/story (POST)", "/save (POST)"] 
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  async function handleSave(request, env) {
  try {
    const data = await request.json();

    // Generate a more readable auto filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-"); // e.g. 2025-10-05T02-15-33-123Z
    const random = Math.random().toString(36).substring(2, 8); // short random ID
    const objectKey = `impact_${timestamp}_${random}.json`;

    // Save JSON to R2
    await env.R2_BUCKET.put(objectKey, JSON.stringify(data, null, 2), {
      httpMetadata: { contentType: "application/json" }
    });

    // Response with success + key
    return new Response(
      JSON.stringify({ success: true, key: objectKey }),
      { 
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        } 
      }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        } 
      }
    );
  }
};
}
