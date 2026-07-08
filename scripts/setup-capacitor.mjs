import { mkdirSync, writeFileSync, rmSync, appendFileSync } from "fs";
import { execSync } from "child_process";

const log = (msg) => {
  console.log(msg);
  appendFileSync("/tmp/capacitor-setup.log", msg + "\n");
};
const run = (cmd) => {
  log("RUN: " + cmd);
  const r = execSync(cmd, { encoding: "utf8", stdio: "pipe" });
  log("EXIT: " + r);
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

  run("npx cap add android");
  run("npx cap copy android");

  log("SUCCESS");
} catch (e) {
  log("ERROR: " + e.message);
  if (e.stdout) log("STDOUT: " + e.stdout);
  if (e.stderr) log("STDERR: " + e.stderr);
  process.exit(1);
}
