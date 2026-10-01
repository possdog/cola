// Palette lookups derived from the current view/palette. All color math
// lives server-side; these helpers only read what the API returned.

import { store } from "./store.js";

function swatchText(s) {
  // Server-provided WCAG luminance decides readable foreground text.
  return s.y > 0.18 ? "#0a0a0a" : "#ffffff";
}

function titleFor(col, s) {
  return `${col.name}-${s.level} · ${s.hex} · oklch(${s.l.toFixed(3)} ${s.c.toFixed(3)} ${Math.round(s.h)})`;
}

// Previews are colored from `view` (not `palette`) so the CVD/grayscale
// filters apply to them exactly like they do to the grid. Unknown name/level
// combos fall back to a mid gray instead of throwing, so a renamed row can
// never blank out a preview.
function hexOf(name, level) {
  const col = store.view.colors.find((c) => c.name === name);
  const s = col && col.swatches.find((s) => s.level === level);
  return s ? s.hex : "#888888";
}

export { swatchText, titleFor, hexOf };
