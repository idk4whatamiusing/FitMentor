#!/usr/bin/env node
// Generates Android launcher and splash assets from the brand mark.
// Run: node scripts/gen-android-icons.mjs
//
// Output lives in ui/resources/android and is copied into the generated
// Android project by scripts/setup-capacitor.mjs.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const uiDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(uiDir, "src/assets/brand/fm-icon.png");
const outRoot = join(uiDir, "resources/android/res");

const INK = "#0B0B0B";

const LAUNCHER = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const FOREGROUND = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

const SPLASH = {
  "drawable": [480, 320],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
};

/** Bounding box of the orange mark inside the black rounded square. */
async function markBox() {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      const isMark = a > 40 && r > 90 && r > g * 1.4;
      if (!isMark) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function canvas(size, glyph, ratio, background) {
  const width = Math.round(size * ratio);
  const scaled = await sharp(glyph).resize({ width, fit: "inside" }).toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, gravity: "center" }])
    .png()
    .toBuffer();
}

function circular(buffer, size) {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  return sharp(buffer)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function main() {
  const box = await markBox();
  const glyph = await sharp(source).ensureAlpha().extract(box).png().toBuffer();

  const icon1024 = await canvas(1024, glyph, 0.62, INK);
  const foreground1024 = await canvas(1024, glyph, 0.54);
  const splash = await canvas(2732, glyph, 0.34, INK);

  for (const [density, size] of Object.entries(LAUNCHER)) {
    const dir = join(outRoot, `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    const square = await sharp(icon1024).resize(size, size).png().toBuffer();
    writeFileSync(join(dir, "ic_launcher.png"), square);
    writeFileSync(join(dir, "ic_launcher_round.png"), await circular(square, size));
  }

  for (const [density, size] of Object.entries(FOREGROUND)) {
    const dir = join(outRoot, `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "ic_launcher_foreground.png"),
      await sharp(foreground1024).resize(size, size).png().toBuffer(),
    );
  }

  for (const [dirName, [width, height]] of Object.entries(SPLASH)) {
    const dir = join(outRoot, dirName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "splash.png"),
      await sharp(splash).resize(width, height, { fit: "cover" }).png().toBuffer(),
    );
  }

  const values = join(outRoot, "values");
  mkdirSync(values, { recursive: true });
  writeFileSync(
    join(values, "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${INK}</color>
</resources>
`,
  );

  console.log(`wrote Android assets to ${outRoot}`);
}

await main();
