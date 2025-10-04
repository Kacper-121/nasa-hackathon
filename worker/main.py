from workers import WorkerEntrypoint, Response
from urllib.parse import urlparse
import math
import os
import requests

NASA_KEY = os.environ.get("NASA_API_KEY", "DEMO_KEY")
NEO_LOOKUP_URL = "https://api.nasa.gov/neo/rest/v1/neo/{}?api_key={}"

INDEX_PAGE = """
<!DOCTYPE html>
<html>
<head>
    <title>Assets Example</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div class="container">
        <h1>Assets Handling Example</h1>
        <p>This demonstrates serving static content from a Python Worker.</p>
        <img src="/image.svg" alt="Example circle image" />
    </div>
    <script src="/script.js"></script>
</body>
</html>
"""

class Default(WorkerEntrypoint):
    async def fetch(self, request):
        path = urlparse(request.url).path
        if path in ["/", "/index.html"]:
            return Response(INDEX_PAGE, headers={"Content-Type": "text/html"})

        if path.startswith("/assets/"):
            return await self.env.ASSETS.fetch(request.js_object)

        return Response("Not Found", status=404)
