// The swatch grid: the main "grid" preview tab. Values are patched in place
// on every response so a slider drag never rebuilds the DOM.

import { store, colorDots } from "./store.js";
import { $, esc } from "./util.js";
import { swatchText, titleFor } from "./swatch.js";

// buildGridStructure creates the DOM skeleton (header row, one row head and
// one empty swatch cell per level, per color). Values are filled in by
// renderGrid so re-renders can patch cells in place instead of rebuilding.
function buildGridStructure(grid) {
  grid.style.gridTemplateColumns = `140px repeat(${store.palette.levels.length}, 1fr)`;
  // One compact header row, then each color row stretches to share the
  // grid-wrap's viewport height equally.
  grid.style.gridTemplateRows = `auto repeat(${store.palette.colors.length}, 1fr)`;

  const head =
    `<div class="cell head"></div>` +
    store.palette.levels.map((l) => `<div class="cell head">${l}</div>`).join("");
  const rows = store.palette.colors
    .map(
      (col) =>
        `<div class="cell rowhead"><span class="color-dot"></span><span>${esc(col.name)}</span></div>` +
        col.swatches.map(() => `<div class="cell swatch"><span></span></div>`).join("")
    )
    .join("");
  grid.innerHTML = head + rows;
}

function renderGrid() {
  const grid = $("#grid");
  const { palette, view } = store;
  const offset = 1 + palette.levels.length;
  const expected = offset + palette.colors.length * offset;
  if (grid.childElementCount !== expected) {
    buildGridStructure(grid);
  }

  // Patch cells in place: during a slider drag this runs on every response,
  // and rebuilding innerHTML at that rate both flickers and needlessly
  // destroys/recreates a few hundred DOM nodes.
  palette.colors.forEach((col, i) => {
    const vcol = view.colors[i];
    // Level 500 as the row's identity dot, mirrored in both the grid row
    // header and the editor panel.
    const mid = vcol.swatches.find((s) => s.level === 500) || vcol.swatches[0];
    const sidebarDot = colorDots.get(col.name);
    if (sidebarDot) sidebarDot.style.background = mid.hex;
    grid.children[offset + i * offset].querySelector(".color-dot").style.background = mid.hex;

    vcol.swatches.forEach((s, j) => {
      const el = grid.children[offset + i * offset + 1 + j];
      const real = col.swatches[j];
      el.style.background = s.hex;
      el.style.color = swatchText(s);
      el.dataset.hex = real.hex;
      el.title = titleFor(col, real);
      el.firstElementChild.textContent = real.hex;
    });
  });
}

export { renderGrid };
