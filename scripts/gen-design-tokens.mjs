#!/usr/bin/env node
// Generates the web CSS variables from design/tokens.json.
// Run: node scripts/gen-design-tokens.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(join(root, "design/tokens.json"), "utf8"));

const kebab = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();

function cssColorBlock(colors) {
  return Object.entries(colors)
    .map(([name, value]) => `  --${kebab(name)}: ${value};`)
    .join("\n");
}

function gradientCss([name, stops]) {
  const list = stops.map((stop) => `${stop.color} ${stop.at}%`).join(", ");
  return `  --gradient-${kebab(name)}: linear-gradient(140deg, ${list});`;
}

let css = `/* Generated from design/tokens.json — do not edit by hand. */\n\n:root {\n`;
css += cssColorBlock(tokens.color.shared);
css += "\n\n";
css += cssColorBlock(tokens.color.light);
css += "\n\n";
css += Object.entries(tokens.gradient).map(gradientCss).join("\n");
css += "\n\n";
css += Object.entries(tokens.radius)
  .map(([name, value]) => `  --radius-${kebab(name)}: ${value}px;`)
  .join("\n");
css += "\n\n";
css += Object.entries(tokens.space)
  .map(([name, value]) => `  --space-${kebab(name)}: ${value}px;`)
  .join("\n");
css += "\n}\n\n.dark {\n";
css += cssColorBlock(tokens.color.dark);
css += "\n}\n";

const cssPath = join(root, "ui/src/generated/tokens.css");
mkdirSync(dirname(cssPath), { recursive: true });
writeFileSync(cssPath, css);
console.log(`wrote ${cssPath}`);
