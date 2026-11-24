#!/usr/bin/env node
// Generates the web CSS variables and the Slint token global from design/tokens.json.
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
  const list = stops
    .map((stop) => `${stop.color} ${stop.at}%`)
    .join(", ");
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

let slint = `// Generated from design/tokens.json — do not edit by hand.\n\n`;
slint += `export global Tokens {\n`;
for (const [name, value] of Object.entries(tokens.color.shared)) {
  slint += `    out property <color> ${kebab(name)}: ${value};\n`;
}
slint += "\n";
for (const [name, value] of Object.entries(tokens.color.light)) {
  slint += `    out property <color> ${kebab(name)}-light: ${value};\n`;
}
slint += "\n";
for (const [name, value] of Object.entries(tokens.color.dark)) {
  slint += `    out property <color> ${kebab(name)}-dark: ${value};\n`;
}
slint += "\n";
for (const [name, stops] of Object.entries(tokens.gradient)) {
  stops.forEach((stop, index) => {
    slint += `    out property <color> ${kebab(name)}-${index}: ${stop.color};\n`;
  });
}
slint += "\n";
for (const [name, value] of Object.entries(tokens.radius)) {
  slint += `    out property <length> radius-${kebab(name)}: ${value}px;\n`;
}
slint += "\n";
for (const [name, value] of Object.entries(tokens.space)) {
  slint += `    out property <length> space-${kebab(name)}: ${value}px;\n`;
}
slint += "\n";
for (const [name, value] of Object.entries(tokens.font)) {
  slint += `    out property <string> font-${kebab(name)}: "${value}";\n`;
}
slint += `}\n`;

const cssPath = join(root, "ui/src/generated/tokens.css");
const slintPath = join(root, "apps/native/ui/generated-tokens.slint");
mkdirSync(dirname(cssPath), { recursive: true });
writeFileSync(cssPath, css);
writeFileSync(slintPath, slint);
console.log(`wrote ${cssPath}`);
console.log(`wrote ${slintPath}`);
