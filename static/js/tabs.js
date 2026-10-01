// Preview tab switching. The panes share the palette fetching pipeline; a
// tab click just swaps visibility and redraws the newly shown pane.

import { store } from "./store.js";
import { $ } from "./util.js";
import { renderGrid } from "./grid.js";
import { renderWheel } from "./preview/wheel.js";
import { renderGamut } from "./preview/gamut.js";
import { renderContrast } from "./preview/contrast.js";
import { renderCode } from "./preview/code.js";
import { renderNotes } from "./preview/notes.js";
import { renderLanding } from "./preview/landing.js";
import { renderDesign } from "./preview/design.js";

const TAB_PANES = {
  grid: "#grid-wrap",
  wheel: "#wheel-preview",
  gamut: "#gamut-preview",
  contrast: "#contrast-preview",
  code: "#code-preview",
  notes: "#notes-preview",
  landing: "#landing-preview",
  design: "#design-preview",
};

function renderActive() {
  // The grid is always patched (in-place, cheap) so row/sidebar dots stay in
  // sync even while another tab is showing; then the visible pane is drawn.
  renderGrid();
  const { activeTab } = store;
  if (activeTab === "wheel") renderWheel();
  else if (activeTab === "gamut") renderGamut();
  else if (activeTab === "contrast") renderContrast();
  else if (activeTab === "code") renderCode();
  else if (activeTab === "notes") renderNotes();
  else if (activeTab === "landing") renderLanding();
  else if (activeTab === "design") renderDesign();
}

function setTab(tab) {
  store.activeTab = tab;
  document.querySelectorAll("#tabs .tab").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
  });
  for (const [name, sel] of Object.entries(TAB_PANES)) {
    $(sel).hidden = name !== tab;
  }
  renderActive();
}

export { renderActive, setTab };
