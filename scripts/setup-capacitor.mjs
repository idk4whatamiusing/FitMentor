import { mkdirSync, writeFileSync, rmSync, appendFileSync } from "fs";
import { execSync } from "child_process";

const log = (msg) => {
  console.log(msg);
  appendFileSync("/tmp/capacitor-setup.log", msg + "\n");
};
const run = (cmd, opts = {}) => {
  log("RUN: " + cmd);
  const r = execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts });
  log("EXIT OK (" + r.length + " chars)");
  return r;
};

try {
  log("CWD: " + process.cwd());
  log("Node: " + process.version);

  const config = {
    appId: "ai.fitmentor.app",
    appName: "FitMentor",
    webDir: "dist",
    server: {
      url: "https://fitmentor-ai-ruddy.vercel.app",
      cleartext: false,
      androidScheme: "https",
    },
  };

  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/index.html", "<html><body>FitMentor</body></html>");
  rmSync("capacitor.config.ts", { force: true });
  writeFileSync("capacitor.config.json", JSON.stringify(config));
  log("Config files written");

  // Use the direct path to cap binary (bin symlinks may not be created on GH runners)
  const capBin = "node node_modules/@capacitor/cli/bin/capacitor";
  run(capBin + " add android");
  run(capBin + " copy android");

  log("SUCCESS");
} catch (e) {
  log("ERROR: " + (e.message || "unknown"));
  log("STDERR: " + (e.stderr || "none"));
  process.exit(1);
}
