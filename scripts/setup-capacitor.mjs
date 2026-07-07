import { mkdirSync, writeFileSync, rmSync, readdirSync } from "fs";
import { execSync } from "child_process";

try {
  console.log("CWD:", process.cwd());
  console.log("Node:", process.version);
  console.log("Files in root:", readdirSync(".").slice(0, 20));
  console.log("cap bin exists:", !!readdirSync("node_modules/.bin").find((f) => f === "cap"));

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
  console.log("Config written OK");

  execSync("./node_modules/.bin/cap add android", { stdio: "inherit" });
  console.log("cap add android OK");

  execSync("./node_modules/.bin/cap copy android", { stdio: "inherit" });
  console.log("cap copy android OK");
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(1);
}
