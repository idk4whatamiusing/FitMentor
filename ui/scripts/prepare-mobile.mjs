// Capacitor always opens index.html at `/`, but the native app starts on Home
// (the marketing page is web-only). Rewriting the path in the shell before the
// router boots avoids a redirect during hydration.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../dist-mobile/client/", import.meta.url);
const shell = new URL("_shell.html", dir);
const index = new URL("index.html", dir);

if (!existsSync(shell)) {
  console.error("mobile build missing _shell.html — run the SPA build first");
  process.exit(1);
}

const boot = `<script>(function(){var p=location.pathname;if(p==="/"||p==="/index.html"){history.replaceState(null,"","/dashboard")}})()</script>`;

let html = readFileSync(shell, "utf8");
if (html.includes("</head>")) {
  html = html.replace("</head>", `${boot}</head>`);
} else {
  html = boot + html;
}

writeFileSync(index, html);
console.log("mobile SPA ready: dist-mobile/client/index.html");
