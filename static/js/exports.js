// Palette exports for the copy buttons: CSS variables and JSON, both
// derived from the real palette (never the filtered view).

import { store } from "./store.js";

function paletteToCSS() {
  const lines = [];
  for (const col of store.palette.colors) {
    for (const s of col.swatches) {
      lines.push(`  --${col.name}-${s.level}: ${s.hex};`);
    }
  }
  return `:root {\n${lines.join("\n")}\n}\n`;
}

function paletteToJSON() {
  const out = {};
  for (const col of store.palette.colors) {
    out[col.name] = {};
    for (const s of col.swatches) out[col.name][s.level] = s.hex;
  }
  return JSON.stringify(out, null, 2) + "\n";
}

export { paletteToCSS, paletteToJSON };
