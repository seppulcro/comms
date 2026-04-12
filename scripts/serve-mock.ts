/**
 * Static file server for mock mode testing.
 * Serves client/ directory with ?mock query parameter.
 */
Bun.serve({
  port: 3333,
  async fetch(req) {
    const u = new URL(req.url)
    let path = u.pathname === "/" ? "/app.html" : u.pathname
    const file = Bun.file("./client" + path)
    if (await file.exists()) {
      return new Response(file)
    }
    return new Response("Not found", { status: 404 })
  },
})

console.log("[serve-mock] listening on http://localhost:3333/?mock")
