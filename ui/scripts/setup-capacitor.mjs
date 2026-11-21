import {
  appendFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { execFileSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const uiDir = resolve(scriptDir, "..");
const rootDir = resolve(uiDir, "..");

const log = (msg) => {
  console.log(msg);
  appendFileSync("/tmp/capacitor-setup.log", msg + "\n");
};

const run = (args) => {
  log("RUN: node " + args.join(" "));
  const output = execFileSync("node", args, {
    cwd: uiDir,
    encoding: "utf8",
    stdio: "pipe",
  });
  log("EXIT OK (" + output.length + " chars)");
  return output;
};

try {
  log("UI: " + uiDir);
  log("Node: " + process.version);

  const config = {
    appId: "ai.fitmentor.app",
    appName: "FitMentor",
    webDir: "dist",
    server: {
      url: "https://fitmentor-ey9.pages.dev",
      cleartext: false,
      androidScheme: "https",
    },
  };

  mkdirSync(join(uiDir, "dist"), { recursive: true });
  writeFileSync(
    join(uiDir, "dist/index.html"),
    "<html><body>FitMentor</body></html>",
  );
  rmSync(join(uiDir, "capacitor.config.ts"), { force: true });
  writeFileSync(
    join(uiDir, "capacitor.config.json"),
    JSON.stringify(config, null, 2),
  );
  log("Config files written");

  // Capacitor may be hoisted to the workspace root or installed in ui/.
  const candidates = [
    join(uiDir, "node_modules/@capacitor/cli/bin/capacitor"),
    join(rootDir, "node_modules/@capacitor/cli/bin/capacitor"),
  ];
  const capBin = candidates.find(existsSync);
  if (!capBin) {
    throw new Error(
      "Capacitor CLI not found in ui/node_modules or the workspace root",
    );
  }
  log("CLI: " + capBin);

  run([capBin, "add", "android"]);
  run([capBin, "copy", "android"]);

  log("SUCCESS");
} catch (e) {
  log("ERROR: " + (e.message || "unknown"));
  log("STDERR: " + (e.stderr || "none"));
  process.exit(1);
}
