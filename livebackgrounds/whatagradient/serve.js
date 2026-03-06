/**
 * serve.js — local dev server for whatagradient
 *
 * Uses only Node.js built-in modules (no npm install needed).
 *
 * Usage:
 *   node serve.js
 *   node serve.js 8080          # custom port
 *   PORT=8080 node serve.js     # via env var
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT = parseInt(process.argv[2] || process.env.PORT || "3000", 10);
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

const server = http.createServer((req, res) => {
  // Normalize URL — strip query string, decode URI
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  // Default to the gradient page
  if (urlPath === "/" || urlPath === "") urlPath = "/whatagradient.html";

  const filePath = path.join(ROOT, urlPath);

  // Prevent path traversal outside ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(`404 Not Found: ${urlPath}`);
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Internal Server Error");
      }
      return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": mime,
      // Disable caching during development so edits reload immediately
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Whatagradient dev server running at:`);
  console.log(`  http://localhost:${PORT}/whatagradient.html`);
  console.log(`\nPress Ctrl+C to stop.`);
});
