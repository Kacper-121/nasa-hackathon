from workers import WorkerEntrypoint, Response

INDEX_PAGE = """
<!DOCTYPE html>
<html>
<head>
</head>
<body>
    <div class="container">
        <h1>Hello</h1>
    </div>
</body>
</html>
"""

class Default(WorkerEntrypoint):
    async def fetch(self, request):
        path = urlparse(request.url).path
        if path in ["/", "/index.html"]:
            return Response(INDEX_PAGE, headers={"Content-Type": "text/html"})

        return Response("Not Found", status=404)
