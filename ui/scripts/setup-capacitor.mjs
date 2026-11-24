// Generates the Capacitor Android project from the mobile SPA build.
//
// The config is committed at ui/capacitor.config.json and points at
// dist-mobile/client, so the APK ships the app's own assets instead of
// loading the deployed site over the network.
import { appendFileSync, existsSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const uiDir = resolve(scriptDir, "..");
const rootDir = resolve(uiDir, "..");

const log = (msg) => {
  console.log(msg);
  appendFileSync("/tmp/capacitor-setup.log", msg + "\n");
};

const run = (args, cwd = uiDir) => {
  log("RUN: node " + args.join(" "));
  const output = execFileSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  log("EXIT OK (" + output.length + " chars)");
  return output;
};

try {
  log("UI: " + uiDir);
  log("Node: " + process.version);

  const shell = join(uiDir, "dist-mobile/client/index.html");
  if (!existsSync(shell)) {
    throw new Error(
      "dist-mobile/client/index.html is missing — run `npm run build:mobile` first",
    );
  }
  log("SPA shell: " + shell);

  // The CLI may be hoisted to the workspace root or live in ui/.
  const candidates = [
    join(uiDir, "node_modules/@capacitor/cli/bin/capacitor"),
    join(rootDir, "node_modules/@capacitor/cli/bin/capacitor"),
  ];
  const capBin = candidates.map((p) => (existsSync(p) ? realpathSync(p) : null)).find(Boolean);
  if (!capBin) {
    throw new Error(
      "Capacitor CLI not found in ui/node_modules or the workspace root",
    );
  }
  log("CLI: " + capBin);

  if (!existsSync(join(uiDir, "android"))) {
    run([capBin, "add", "android"]);
  }
  run([capBin, "sync", "android"]);

  log("SUCCESS");
} catch (e) {
  log("ERROR: " + (e.message || "unknown"));
  log("STDERR: " + (e.stderr || "none"));
  process.exit(1);
}
