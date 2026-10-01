// The editor controls: the global sliders and the per-color hue/chroma
// rows. Slider drags mutate the state in place and call update(); nothing
// here fetches or renders on its own.

import { store, colorDots } from "./store.js";
import { $, fmt, esc } from "./util.js";
import { update } from "./api.js";

// Sync functions that push the current state back into the global sliders.
// They are bound once at load; after a reset the sliders must move to the
// restored defaults without re-attaching their input listeners.
const globalSync = [];

// format is optional; the default fixed-precision fmt covers every global
// slider, but a plain number is a poor label for some values (the tint hue
// reads as "30°", like the per-color hue rows).
function bindSlider(id, key, digits, format) {
  const show = format || ((v) => fmt(v, digits));
  const input = $(`#${id}`);
  const val = $(`#${id}-val`);
  const sync = () => {
    input.value = store.state[key];
    val.textContent = show(store.state[key]);
  };
  sync();
  globalSync.push(sync);
  input.addEventListener("input", () => {
    store.state[key] = Number(input.value);
    val.textContent = show(input.value);
    update();
  });
  // Double-click snaps the slider back to the default Reset to defaults
  // would restore for this field. sync() moves the thumb and the label;
  // update() regenerates exactly like a manual move, so the change
  // persists and rides with the A/B snapshots like any drag.
  input.addEventListener("dblclick", () => {
    if (!store.defaults) return;
    store.state[key] = store.defaults[key];
    sync();
    update();
  });
}

function buildColorControls() {
  const wrap = $("#color-controls");
  wrap.innerHTML = "";
  colorDots.clear();
  store.state.colors.forEach((c, i) => {
    // Per-row defaults, looked up by index: rows are positional everywhere
    // else (a full reset replaces them wholesale), so a rename can't
    // orphan the lookup.
    const def = store.defaults && store.defaults.colors[i];
    // The server defines each color's allowed hue window (hueMin/hueMax);
    // the slider bounds come straight from it so UI and API can't disagree.
    const hMin = c.hueMin ?? 0;
    const hMax = c.hueMax ?? 360;
    // Paint the slider track with the actual hue window it spans. Use evenly
    // spaced stops (~60 degrees apart) rather than just start/mid/end: hue
    // 0 and 360 are the same color, so a three-stop 360-degree gradient would
    // collapse to pink-teal-pink instead of a full spectrum.
    const span = hMax - hMin;
    const segments = Math.max(2, Math.round(span / 60));
    const stops = Array.from({ length: segments + 1 }, (_, i) =>
      `oklch(60% 0.15 ${hMin + (span * i) / segments})`
    );
    const track = `linear-gradient(90deg, ${stops.join(", ")})`;
    // Chroma max mirrors the server's 0.4 clamp (palette.Normalized), the
    // same UI/API agreement as the hue bounds: a state loaded with a higher
    // value could never be shown or edited faithfully otherwise.
    const row = document.createElement("div");
    row.className = "color-row";
    row.innerHTML = `
      <div class="color-name"><span class="color-dot"></span>${esc(c.name)}</div>
      <label class="slider-group">
        <span class="label">Hue</span><span class="val">${Math.round(c.hue)}°</span>
        <input type="range" class="hue-slider" style="background:${track}"
               min="${hMin}" max="${hMax}" step="1" value="${c.hue}">
      </label>
      <label class="slider-group">
        <span class="label">Chroma</span><span class="val">${fmt(c.chroma)}</span>
        <input type="range" min="0" max="0.4" step="0.005" value="${c.chroma}">
      </label>`;
    const [hueIn, chromaIn] = row.querySelectorAll("input");
    const [hueVal, chromaVal] = row.querySelectorAll(".val");
    hueIn.addEventListener("input", () => {
      c.hue = Number(hueIn.value);
      // Round like the initial label does, so a fractional posted hue (direct
      // API state) doesn't read differently once the thumb moves.
      hueVal.textContent = `${Math.round(c.hue)}°`;
      update();
    });
    // Double-click snaps the hue to its default, the same value Reset to
    // defaults would restore for this row. The state gets the exact
    // default even when the thumb snaps to the step grid on screen —
    // matching what a full reset leaves behind.
    hueIn.addEventListener("dblclick", () => {
      if (!def) return;
      c.hue = def.hue;
      hueIn.value = c.hue;
      hueVal.textContent = `${Math.round(c.hue)}°`;
      update();
    });
    chromaIn.addEventListener("input", () => {
      c.chroma = Number(chromaIn.value);
      chromaVal.textContent = fmt(chromaIn.value);
      update();
    });
    chromaIn.addEventListener("dblclick", () => {
      if (!def) return;
      c.chroma = def.chroma;
      chromaIn.value = c.chroma;
      chromaVal.textContent = fmt(c.chroma);
      update();
    });
    colorDots.set(c.name, row.querySelector(".color-dot"));
    // The same divider style as the Global panel's sub-sections (a single
    // .divider rule in style.css), so both sidebars separate their groups
    // identically; every row after the first gets one before it.
    if (i > 0) {
      const divider = document.createElement("hr");
      divider.className = "divider";
      wrap.appendChild(divider);
    }
    wrap.appendChild(row);
  });
}

export { globalSync, bindSlider, buildColorControls };
