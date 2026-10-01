// A/B slots: the A/B buttons compare two variants of the settings, the
// halves swap slots and the middle arrow copies the active slot into the
// other. The server persists the whole record (see persist.go), so both
// variants survive a reload or a server restart — the client keeps its own
// copy for instant interaction and syncs it with every update. The record
// itself lives in the store; this module owns the actions and the button.

import { store, cloneState } from "./store.js";
import { $, toast } from "./util.js";
import { update } from "./api.js";
import { globalSync, buildColorControls } from "./controls.js";

function setABButton() {
  // The segmented control marks the active half; the middle arrow points in
  // the copy direction (toward the slot a copy would overwrite). Halves are
  // found by their data-slot, the same attribute the click handler keys on,
  // so markup and JS share one source of truth.
  document.querySelectorAll("#ab .seg[data-slot]").forEach((seg) => {
    const on = seg.dataset.slot === store.abActive;
    seg.classList.toggle("active", on);
    seg.setAttribute("aria-pressed", on);
  });
  $("#ab-copy").textContent = store.abActive === "A" ? "→" : "←";
}

// Copy-to-other overwrites the inactive slot with the active settings
// without switching: a way to make both slots identical before diverging
// one of them, or to discard the other variant. Nothing on screen changes,
// so the toast is the only feedback.
function copyAB() {
  const other = store.abActive === "A" ? "B" : "A";
  store.abSlots[other] = cloneState(store.state);
  toast(`Copied ${store.abActive} to ${other}`);
  // The overwritten slot must reach the server; the palette itself is
  // unchanged, so this sync only updates the persisted A/B record.
  update();
}

async function swapAB() {
  store.abSlots[store.abActive] = cloneState(store.state);
  const other = store.abActive === "A" ? "B" : "A";
  // Switching to an empty slot seeds it with the current settings, so the
  // first toggle is a no-op and the two variants only diverge from there.
  store.abSlots[other] = store.abSlots[other] || cloneState(store.state);
  store.abActive = other;
  store.state = cloneState(store.abSlots[other]);
  // Move the bound global sliders to the loaded values and rebuild the
  // per-color rows (fresh listeners included), then regenerate — the same
  // plumbing as reset, since a slot swap is a full state replacement.
  globalSync.forEach((sync) => sync());
  buildColorControls();
  setABButton();
  await update();
}

export { setABButton, copyAB, swapAB };
