// TanStack Start's SPA mode emits the boot document as `_shell.html`.
// Capacitor copies `webDir` and always opens `index.html`,
// so the shell is copied into place after the mobile build.
import { copyFileSync, existsSync } from "node:fs";

const dir = new URL("../dist-mobile/client/", import.meta.url);
const shell = new URL("_shell.html", dir);
const index = new URL("index.html", dir);

if (!existsSync(shell)) {
  console.error("mobile build missing _shell.html — run the SPA build first");
  process.exit(1);
}

copyFileSync(shell, index);
console.log("mobile SPA ready: dist-mobile/client/index.html");
