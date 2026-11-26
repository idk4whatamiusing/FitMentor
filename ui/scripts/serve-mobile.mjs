// Serves the native SPA bundle on your machine and proxies API calls.
//
// The Android build talks to the API natively, so the browser needs a
// same-origin proxy to get past CORS. Build with `VITE_API_URL=/` so the
// bundle calls `/v1/...` instead of the Lambda host.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const uiDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(uiDir, "dist-mobile/client");
const port = Number(process.env.PORT || 8090);
const upstream = (
  process.env.API_URL ||
  "https://vfvwjpw567ghnqwknc2m74thx40jmpiw.lambda-url.ap-south-1.on.aws"
).replace(/\/+$/, "");

if (!existsSync(join(root, "index.html"))) {
  console.error("dist-mobile/client/index.html missing — run `npm run build:mobile` first");
  process.exit(1);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendFile(res, file) {
  res.writeHead(200, {
    "content-type": types[extname(file)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
}

async function proxy(req, res, url) {
  const headers = {};
  for (const name of ["authorization", "content-type", "accept"]) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  try {
    const response = await fetch(`${upstream}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, {
      "content-type": response.headers.get("content-type") || "application/json",
      "content-length": body.length,
      "access-control-allow-origin": "*",
    });
    res.end(body);
  } catch (error) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `upstream unreachable: ${error.message}` }));
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/v1/")) {
    await proxy(req, res, url);
    return;
  }

  const safe = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, safe);
  if (existsSync(file) && statSync(file).isFile()) {
    sendFile(res, file);
    return;
  }
  // SPA fallback: the app owns routing.
  sendFile(res, join(root, "index.html"));
}

function announce(boundPort) {
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry && entry.family === "IPv4" && !entry.internal);

  console.log(`\n  FitMentor native bundle`);
  console.log(`  local:   http://localhost:${boundPort}`);
  if (lan) console.log(`  network: http://${lan.address}:${boundPort}`);
  console.log(`  api:     ${upstream}\n`);
}

// Pick the next free port instead of failing when another preview is open.
function start(candidate, attempt = 0) {
  const server = createServer(handleRequest);
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attempt < 10) {
      start(candidate + 1, attempt + 1);
      return;
    }
    console.error(`Could not start on port ${candidate}: ${error.message}`);
    process.exit(1);
  });
  server.listen(candidate, "0.0.0.0", () => announce(candidate));
}

start(port);
