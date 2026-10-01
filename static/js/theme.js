// Theming: the app's own UI colors are palette swatches looked up from the
// fetched view and applied as CSS variables. Because update() runs on every
// slider input, the interface restyles itself live alongside the grid
// (dogfooding). The chrome is authored on its dark face and resolves
// through the global light/dark scheme (scheme.js), so the header's
// Light/Dark pill flips the whole interface along with the previews — no
// new request, the levels just resolve against the already-fetched view.
// The response's `theme` object stays the API's own dark-face mapping for
// direct consumers; the UI reads the view so both faces come from the
// same response.

import { store } from "./store.js";
import { levelFor } from "./preview/scheme.js";

const THEME_VARS = {
  bg: "--bg",
  panel: "--bg-panel",
  raised: "--bg-raised",
  track: "--bg-track",
  border: "--border",
  text: "--text",
  textDim: "--text-dim",
  accent: "--accent",
  danger: "--danger",
};

// Each slot's swatch on the chrome's native dark face: [row, level,
// fallback row, fallback level]. Accent and danger fall back to the base
// ramp when their rows are absent, so every slot is always a real swatch —
// the same mapping the server's Theme() ships in the `theme` object.
const SLOTS = {
  bg: ["base", 950],
  panel: ["base", 900],
  raised: ["base", 850],
  track: ["base", 700],
  border: ["base", 800],
  text: ["base", 100],
  textDim: ["base", 400],
  accent: ["cyan", 400, "base", 300],
  danger: ["red", 400, "base", 600],
};

// Hex of the named row at the level closest to the one asked for
// (generated rows carry all thirteen levels, so this is normally an exact
// hit). null when the row is missing entirely — a partial POST can drop
// rows.
function hexAt(name, level) {
  const row = store.view && store.view.colors.find((c) => c.name === name);
  if (!row || !row.swatches.length) return null;
  let best = row.swatches[0];
  for (const s of row.swatches) {
    if (Math.abs(s.level - level) < Math.abs(best.level - level)) best = s;
  }
  return best.hex;
}

function applyTheme() {
  if (!store.view) return;
  // No base row means no theme, the same contract as a nil `theme` from the
  // server: the stylesheet's built-in fallback colors stay in place.
  if (!hexAt("base", 950)) return;
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(THEME_VARS)) {
    const [name, level, fbName, fbLevel] = SLOTS[key];
    let hex = hexAt(name, levelFor("app", level));
    if (!hex && fbName) hex = hexAt(fbName, levelFor("app", fbLevel));
    if (hex) root.style.setProperty(cssVar, hex);
  }
}

export { applyTheme };
