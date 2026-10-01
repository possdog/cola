// Cola UI entry point: fetches the palette from the Go backend whenever a
// control changes and re-renders the swatch grid. All color math lives
// server-side. This module owns the load-time wiring and the reset flow;
// rendering, controls, and previews live in their own modules.

import { store, cloneState } from "./store.js";
import { $, esc, fetchJSON, toast, copyText } from "./util.js";
import { renderActive, setTab } from "./tabs.js";
import { applyTheme } from "./theme.js";
import { bindSlider, buildColorControls, globalSync } from "./controls.js";
import { update, nextSeq, isLatest } from "./api.js";
import { setABButton, copyAB, swapAB } from "./ab.js";
import { paletteToCSS, paletteToJSON } from "./exports.js";
import { renderWheel, setWheelMode } from "./preview/wheel.js";
import { renderCode, setCodeMode } from "./preview/code.js";
import { setScheme } from "./preview/scheme.js";

// ---- reset -----------------------------------------------------------------

// Reset is destructive, so it takes a second click: the first arms the
// button ("Are you sure?"), the second confirms. Arming reverts by itself
// after a few seconds so a stray first click can't linger armed.
const ARM_TIMEOUT_MS = 5000;
let resetArmed = false;
let armTimer = null;

function disarmReset() {
  resetArmed = false;
  clearTimeout(armTimer);
  $("#reset").classList.remove("armed");
  $("#reset").textContent = "Reset to defaults";
}

function armReset() {
  resetArmed = true;
  const btn = $("#reset");
  btn.classList.add("armed");
  btn.textContent = "Are you sure?";
  armTimer = setTimeout(disarmReset, ARM_TIMEOUT_MS);
}

async function resetPalette() {
  // Supersede any in-flight updates so a slow response can't repaint the
  // grid with pre-reset colors over the freshly restored defaults.
  const seq = nextSeq();
  try {
    const data = await fetchJSON("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The body carries no filters: reset doubles as an escape hatch for a
      // filter enabled by accident, so it always fetches the unfiltered
      // view. activeSlot rides along so the server records the defaults as
      // the active slot's snapshot; the other slot is left untouched.
      body: JSON.stringify({ filters: [], activeSlot: store.abActive }),
    });
    if (!isLatest(seq)) return;
    store.state = data.state;
    store.palette = data.palette;
    store.view = data.filtered || data.palette;
    // Switch the View filter to Off along with the palette: someone who
    // enabled a filter by accident may not know to look there, and every
    // color looking wrong is exactly when they reach for this button. The
    // radio group and the blue-light slider follow store.filter; the
    // intensity value itself is kept, matching the filter's own off
    // behavior (toggling back on restores the chosen warmth).
    store.filter = null;
    const off = document.querySelector('input[name="view-filter"][value="off"]');
    if (off) off.checked = true;
    $("#bluelight-slider").hidden = true;
    // The active slot now holds the defaults, same rule as a swap.
    store.abSlots[store.abActive] = cloneState(data.state);
    // Move the already-bound global sliders to the restored values; the
    // per-color rows are rebuilt from scratch (fresh listeners included).
    globalSync.forEach((sync) => sync());
    buildColorControls();
    renderActive();
    applyTheme();
    toast("Palette reset to defaults");
  } catch (err) {
    toast(`Reset failed: ${err.message}`);
  }
}

// ---- load and event wiring ---------------------------------------------------

async function load() {
  const data = await fetchJSON("/api/palette");
  store.state = data.state;
  store.palette = data.palette;
  store.view = data.filtered || data.palette;
  store.defaults = data.defaults;

  bindSlider("maxL", "maxL", 3);
  bindSlider("minL", "minL", 3);
  bindSlider("saturation", "saturation", 2);
  // The tint mixes one fixed color into every swatch: hue, luminosity, and
  // chroma pick the color (all server-side, like every other color here),
  // intensity how strongly it blends in. Default intensity 0 keeps the
  // untinted palette. Like the other global sliders all four are part of
  // the state, so they persist and ride along with the A/B snapshots.
  bindSlider("tintHue", "tintHue", 0, (v) => `${Math.round(v)}°`);
  bindSlider("tintL", "tintL", 3);
  bindSlider("tintChroma", "tintChroma", 3);
  bindSlider("tintIntensity", "tintIntensity", 2);
  // Bend is centered at 0, which is the identity for the power-law skew:
  // a zero state renders exactly the Flexoki spacing. Like the other
  // global sliders it is part of the state, so it persists and rides
  // along with the A/B snapshots.
  bindSlider("bend", "bend", 2);
  // Pinch and Pinch center reshape the (already bent) distribution around
  // one point: pinch 0 is the identity, so the pinch center only matters
  // once the pinch departs from 0. Both are part of the state like the
  // other globals, so they persist and ride along with the A/B snapshots.
  bindSlider("pinch", "pinch", 2);
  bindSlider("pinchCenter", "pinchCenter", 2);
  buildColorControls();
  renderActive();
  applyTheme();

  // Preview tabs: the panes share the palette fetching pipeline; a tab click
  // just swaps visibility and redraws the newly shown pane.
  document.querySelectorAll("#tabs .tab").forEach((b) => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
  });

  // View filter is a radio group ("off" plus one entry per filter): the
  // filters are alternate views of the same palette (protanopia AND
  // deuteranopia is meaningless), so they are mutually exclusive. The UI
  // never sends combinations; the API still accepts a `filters` array and
  // composes server-side for direct API callers.
  document.querySelectorAll('input[name="view-filter"]').forEach((rb) => {
    rb.addEventListener("change", () => {
      store.filter = rb.value === "off" ? null : rb.value;
      // Blue light is the only filter with an intensity control; the slider
      // appears while the filter is on but keeps its value when it is off,
      // so toggling back on restores the chosen warmth.
      $("#bluelight-slider").hidden = store.filter !== "bluelight";
      update();
    });
  });

  // Blue light intensity slider: same live-update pattern as the state
  // sliders, but it only affects the filtered view, not the palette state.
  const blSlider = $("#blueLight");
  const blVal = $("#blueLight-val");
  const blLabel = () => {
    blVal.textContent = `${Math.round(store.blueLight * 100)}%`;
  };
  store.blueLight = Number(blSlider.value);
  blLabel();
  blSlider.addEventListener("input", () => {
    store.blueLight = Number(blSlider.value);
    blLabel();
    update();
  });

  $("#grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".swatch");
    if (cell) copyText(cell.dataset.hex, `Copied ${cell.dataset.hex}`);
  });
  // Same copy affordance as the grid, for the wheel's SVG dots/wedges and the
  // base legend ramp (all carry data-hex), plus the layout-mode toggle.
  // closest() works on SVG elements too. Mode switches redraw from the
  // already-fetched response — no new request needed.
  $("#wheel-preview").addEventListener("click", (e) => {
    const modeBtn = e.target.closest(".wheel-mode-btn");
    if (modeBtn && setWheelMode(modeBtn.dataset.mode)) {
      renderWheel();
      return;
    }
    const swatch = e.target.closest(".wheel-dot, .wheel-wedge, .legend-swatch");
    if (swatch) copyText(swatch.dataset.hex, `Copied ${swatch.dataset.hex}`);
  });
  // Code preview mode buttons (Graphical / Terminal / Agent), the same
  // pattern as the wheel's layout toggle: a redraw from the already-fetched
  // response, no new request.
  $("#code-preview").addEventListener("click", (e) => {
    const modeBtn = e.target.closest(".code-mode-btn");
    if (modeBtn && setCodeMode(modeBtn.dataset.mode)) renderCode();
  });
  // Global light/dark scheme (the header's Light/Dark pill): flips the app
  // chrome and the Code, Notes, Landing, and Design previews together.
  // Like the mode buttons this is a display-only preference: theme.js
  // restyles the chrome and the pane redraw complements the levels of the
  // already-fetched response, so no new request is needed and nothing is
  // persisted. Only the active pane is redrawn here; the other panes
  // re-render with the new scheme when their tab is next shown.
  const schemePill = $("#scheme");
  schemePill.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg");
    if (!btn || !setScheme(btn.dataset.scheme)) return;
    schemePill.querySelectorAll(".seg").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on);
    });
    applyTheme();
    renderActive();
  });
  $("#copy-css").addEventListener("click", () => copyText(paletteToCSS(), "CSS variables copied"));
  $("#copy-json").addEventListener("click", () => copyText(paletteToJSON(), "JSON copied"));
  // A/B: restore the server-persisted record — both slots and which one is
  // active — so a reload or restart keeps both variants, not just the active
  // palette. A missing record (older server) falls back to seeding slot A
  // from the loaded state.
  const ab = data.ab;
  store.abActive = ab && ab.active === "B" ? "B" : "A";
  store.abSlots.A = ab && ab.slots && ab.slots.A ? cloneState(ab.slots.A) : null;
  store.abSlots.B = ab && ab.slots && ab.slots.B ? cloneState(ab.slots.B) : null;
  if (!store.abSlots[store.abActive]) store.abSlots[store.abActive] = cloneState(store.state);
  setABButton();
  // Segmented A/B: the halves swap slots (clicking the active half is a
  // no-op); the middle arrow, the only segment without a data-slot, copies
  // the active slot into the other.
  $("#ab").addEventListener("click", (e) => {
    const seg = e.target.closest(".seg");
    if (!seg) return;
    if (!seg.dataset.slot) copyAB();
    else if (seg.dataset.slot !== store.abActive) swapAB();
  });
  $("#reset").addEventListener("click", () => {
    if (!resetArmed) {
      armReset();
      return;
    }
    disarmReset();
    resetPalette();
  });
}

load().catch((err) => {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p style="padding:16px;color:#e06c60">Failed to load palette: ${esc(err.message)}</p>`
  );
});
