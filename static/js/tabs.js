// Preview tab switching. The panes share the palette fetching pipeline; a
// tab click just swaps visibility and redraws the newly shown pane.

import { store } from "./store.js";
import { $ } from "./util.js";
import { renderGrid } from "./grid.js";
import { renderWheel } from "./preview/wheel.js";
import { renderGamut } from "./preview/gamut.js";
import { renderCode } from "./preview/code.js";
import { renderNotes } from "./preview/notes.js";
import { renderBranding } from "./preview/branding.js";

const TAB_PANES = {
  grid: "#grid-wrap",
  wheel: "#wheel-preview",
  "3d": "#gamut-preview",
  code: "#code-preview",
  notes: "#notes-preview",
  branding: "#branding-preview",
};

function renderActive() {
  // The grid is always patched (in-place, cheap) so row/sidebar dots stay in
  // sync even while another tab is showing; then the visible pane is drawn.
  renderGrid();
  const { activeTab } = store;
  if (activeTab === "wheel") renderWheel();
  else if (activeTab === "3d") renderGamut();
  else if (activeTab === "code") renderCode();
  else if (activeTab === "notes") renderNotes();
  else if (activeTab === "branding") renderBranding();
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
