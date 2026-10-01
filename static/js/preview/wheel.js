// Wheel preview tab: the palette plotted as a color wheel. Geometry only —
// the frontend computes no colors; it plots the h/l/c values the API
// already returns (the same ones the grid tooltips use).

import { store } from "../store.js";
import { $, esc, setPaneHTML } from "../util.js";
import { titleFor } from "../swatch.js";

// Wheel layout mode: "hue" plots each swatch at its actual OKLCH hue angle;
// "fixed" gives every row an equal sector in grid order, so adjacent rows —
// and therefore adjacent hues — sit side by side at every level no matter
// where the hue sliders are. A display-only preference like the view
// filters: never persisted, never part of the exported state.
let wheelMode = "hue";

// Shared geometry: a 1000x1000 design space (the viewBox adds margin for the
// fixed mode's outside labels), radius running from level 50 at the rim to
// 950 at the center. This is geometry only; the frontend computes no colors —
// it plots the h/l/c values the API already returns (the same ones the grid
// tooltips use).
const WHEEL = { cx: 500, cy: 500, rOut: 470, rIn: 78, dot: 14 };

function wheelRadius(j, n) {
  return WHEEL.rOut - (j * (WHEEL.rOut - WHEEL.rIn)) / (n - 1);
}

// Hue 0 sits at 12 o'clock, increasing clockwise — the same sweep direction
// as the hue sliders' painted tracks.
function wheelPos(r, deg) {
  const a = (deg * Math.PI) / 180;
  return { x: WHEEL.cx + r * Math.sin(a), y: WHEEL.cy - r * Math.cos(a) };
}

// Annular sector path from angle a1 to a2 (clockwise) between radii r1
// (inner) and r2 (outer). Every sector here is far under 180°, so both
// large-arc flags are always 0.
function wheelSector(a1, a2, r1, r2) {
  const f = (p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  const p1 = wheelPos(r2, a1);
  const p2 = wheelPos(r2, a2);
  const p3 = wheelPos(r1, a2);
  const p4 = wheelPos(r1, a1);
  return `M ${f(p1)} A ${r2.toFixed(1)} ${r2.toFixed(1)} 0 0 1 ${f(p2)} L ${f(p3)} A ${r1.toFixed(1)} ${r1.toFixed(1)} 0 0 0 ${f(p4)} Z`;
}

// Level labels at the three anchor levels, drawn on the 12 o'clock axis. Only
// used in hue mode: no default hue window covers hue 0, so nothing sits
// under the labels there. Fixed mode's sectors start at 12 o'clock instead,
// so it relies on the hint text (and tooltips) for the radius direction.
function wheelLevelLabels(n) {
  return [0, 6, 12]
    .map((j) => {
      const y = (WHEEL.cy - wheelRadius(j, n) - 8).toFixed(1);
      return `<text class="wheel-label" x="${WHEEL.cx}" y="${y}">${store.palette.levels[j]}</text>`;
    })
    .join("");
}

// Base legend ramp, shared by both layouts: the near-neutral base row has
// no meaningful hue, so instead of a position on the wheel it renders as its
// ramp below the wheel.
function wheelBaseRamp(pairs) {
  const base = pairs.find((p) => p.vcol.name === "base");
  if (!base) return "";
  return `<div class="wheel-legend"><span class="legend-name">${esc(base.col.name)}</span>${base.vcol.swatches
    .map((s, j) => {
      const real = base.col.swatches[j];
      return `<span class="legend-swatch" style="background:${s.hex}" data-hex="${real.hex}" title="${titleFor(base.col, real)}"></span>`;
    })
    .join("")}</div>`;
}

// "hue" mode: a dot per swatch at its actual hue angle, so each chromatic
// row reads as a spoke and hue coverage — or a gap — shows at a glance.
function renderWheelHue(pairs, n) {
  const spokes = pairs.filter((p) => p.vcol.name !== "base");
  // One faint ring per level: a ring is one fixed Oklab lightness, so under
  // the grayscale filter each ring should collapse to one uniform gray —
  // the same check the grid's columns provide.
  const rings = store.palette.levels
    .map((_, j) => `<circle class="wheel-ring" cx="${WHEEL.cx}" cy="${WHEEL.cy}" r="${wheelRadius(j, n).toFixed(1)}"></circle>`)
    .join("");
  const dots = spokes
    .flatMap(({ vcol, col }) =>
      vcol.swatches.map((s, j) => {
        const real = col.swatches[j];
        const { x, y } = wheelPos(wheelRadius(j, n), s.h);
        return `<circle class="wheel-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${WHEEL.dot}" fill="${s.hex}" data-hex="${real.hex}"><title>${titleFor(col, real)}</title></circle>`;
      })
    )
    .join("");
  return {
    svg: `${rings}${wheelLevelLabels(n)}${dots}`,
    below: `${wheelBaseRamp(pairs)}<p class="wheel-hint">Angle is OKLCH hue; radius is level (50 at the rim, 950 at the center). Click any swatch to copy its hex.</p>`,
  };
}

// "fixed" mode: the grid rolled into a circle. Each chromatic row gets an
// equal sector in grid order, and each sector's thirteen concentric bands
// are its levels, 50 at the rim and 950 at the center. Equal levels share a
// radius, so adjacent hues compare directly along any ring, and the
// arrangement never moves no matter where the hue sliders are. The base row
// sits below the wheel (see wheelBaseRamp), exactly like in hue mode.
function renderWheelFixed(pairs, n) {
  // Bands tile [rOut, rIn] evenly (n bands of step each), unlike hue mode's
  // dots, which sit on n rings with the innermost at rIn.
  const step = (WHEEL.rOut - WHEEL.rIn) / n;
  const bandGap = 1.5; // radial hairline between level bands
  // Angular hairline between rows, ~3px at the rim — the same separation as
  // the grid's cell gap — tapering to a hairline toward the center.
  const sectorGap = 0.4;
  const sectors = pairs.filter((p) => p.vcol.name !== "base");
  const sector = 360 / sectors.length;
  const bands = [];
  const names = [];
  sectors.forEach(({ vcol, col }, i) => {
    const a1 = i * sector + sectorGap;
    const a2 = (i + 1) * sector - sectorGap;
    vcol.swatches.forEach((s, j) => {
      const r2 = WHEEL.rOut - j * step - bandGap;
      const r1 = WHEEL.rOut - (j + 1) * step + bandGap;
      const real = col.swatches[j];
      bands.push(`<path class="wheel-wedge" d="${wheelSector(a1, a2, r1, r2)}" fill="${s.hex}" data-hex="${real.hex}"><title>${titleFor(col, real)}</title></path>`);
    });
    // Row name just outside its sector's mid-angle, the circular analogue of
    // the grid's row headers.
    const p = wheelPos(WHEEL.rOut + 36, (i + 0.5) * sector);
    names.push(`<text class="wheel-name" x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}">${esc(col.name)}</text>`);
  });
  return {
    svg: `${bands.join("")}${names.join("")}`,
    below: `${wheelBaseRamp(pairs)}<p class="wheel-hint">Each sector is one color in grid order; radius is level (50 at the rim, 950 at the center). Click any swatch to copy its hex.</p>`,
  };
}

export function renderWheel() {
  // Pair display (view) and real columns by index, like renderGrid does.
  const pairs = store.view.colors.map((vcol, i) => ({ vcol, col: store.palette.colors[i] }));
  const n = store.palette.levels.length;
  const mode = wheelMode === "fixed" ? renderWheelFixed(pairs, n) : renderWheelHue(pairs, n);
  const btn = (m, label) =>
    `<button type="button" class="wheel-mode-btn${wheelMode === m ? " active" : ""}" aria-pressed="${wheelMode === m}" data-mode="${m}">${label}</button>`;
  setPaneHTML($("#wheel-preview"), `
    <div class="wheel-mode" role="group" aria-label="Wheel layout">
      ${btn("hue", "By hue")}${btn("fixed", "Fixed")}
    </div>
    <svg class="wheel-svg" viewBox="-60 -20 1120 1040" role="img" aria-label="Palette color wheel">
      ${mode.svg}
    </svg>
    ${mode.below}`);
}

// Switch the wheel layout (By hue / Fixed). Returns whether the mode
// changed, so the click handler can skip a redundant redraw.
export function setWheelMode(mode) {
  if (mode === wheelMode) return false;
  wheelMode = mode;
  return true;
}
