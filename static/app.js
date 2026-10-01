// Cola UI: fetches the palette from the Go backend whenever a control changes
// and re-renders the swatch grid. All color math lives server-side.

let state = null;
let palette = null;
// view is what gets displayed: the filtered palette when a view filter is
// active, otherwise the real palette. Exports and copies always use palette.
let view = null;
// Active preview tab (grid / wheel / code / notes / branding). Grid is the
// default.
let activeTab = "grid";
// Active view filter, or null when "Off" is selected (server-side: grayscale
// is exact Oklab, CVD uses Machado 2009 matrices). The panel is a radio
// group, so exactly one view applies at a time; the request still sends a
// one-element array to match the API's `filters` shape.
let filter = null;
// Blue light filter intensity in [0,1]. A display-only preference: it rides
// along with every request but is never part of the exported palette state.
let blueLight = 0;

const $ = (sel) => document.querySelector(sel);

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// ---- rendering -----------------------------------------------------------

function swatchText(s) {
  // Server-provided WCAG luminance decides readable foreground text.
  return s.y > 0.18 ? "#0a0a0a" : "#ffffff";
}

function titleFor(col, s) {
  return `${col.name}-${s.level} · ${s.hex} · oklch(${s.l.toFixed(3)} ${s.c.toFixed(3)} ${Math.round(s.h)})`;
}

// buildGridStructure creates the DOM skeleton (header row, one row head and
// one empty swatch cell per level, per color). Values are filled in by
// renderGrid so re-renders can patch cells in place instead of rebuilding.
function buildGridStructure(grid) {
  grid.style.gridTemplateColumns = `140px repeat(${palette.levels.length}, 1fr)`;
  // One compact header row, then each color row stretches to share the
  // grid-wrap's viewport height equally.
  grid.style.gridTemplateRows = `auto repeat(${palette.colors.length}, 1fr)`;

  const head =
    `<div class="cell head"></div>` +
    palette.levels.map((l) => `<div class="cell head">${l}</div>`).join("");
  const rows = palette.colors
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

function fmt(v, digits = 3) {
  return Number(v).toFixed(digits);
}

// ---- preview tabs ----------------------------------------------------------

// Previews are colored from `view` (not `palette`) so the CVD/grayscale
// filters apply to them exactly like they do to the grid. Unknown name/level
// combos fall back to a mid gray instead of throwing, so a renamed row can
// never blank out a preview.
function hexOf(name, level) {
  const col = view.colors.find((c) => c.name === name);
  const s = col && col.swatches.find((s) => s.level === level);
  return s ? s.hex : "#888888";
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TAB_PANES = {
  grid: "#grid-wrap",
  wheel: "#wheel-preview",
  code: "#code-preview",
  notes: "#notes-preview",
  branding: "#branding-preview",
};

function renderActive() {
  // The grid is always patched (in-place, cheap) so row/sidebar dots stay in
  // sync even while another tab is showing; then the visible pane is drawn.
  renderGrid();
  if (activeTab === "wheel") renderWheel();
  else if (activeTab === "code") renderCode();
  else if (activeTab === "notes") renderNotes();
  else if (activeTab === "branding") renderBranding();
}

function setTab(tab) {
  activeTab = tab;
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

// ---- Code preview ----------------------------------------------------------

// A fixed TypeScript sample, hand-tokenized as [type, text] pairs. Keeping
// tokens explicit avoids shipping a regex tokenizer for one static snippet;
// renderCode only swaps in the palette-derived colors.
const CODE_SAMPLE = [
  [["com", "// palette.ts — one ramp per semantic name"]],
  [["kw", "import"], ["p", " { "], ["fn", "oklch"], ["p", ", "], ["fn", "hex"], ["p", " } "], ["kw", "from"], ["str", ' "../color"'], ["p", ";"]],
  [],
  [["com", "// Thirteen steps of equal perceived lightness, so any"]],
  [["com", "// two levels pair with a predictable contrast."]],
  [["kw", "export"], ["p", " "], ["kw", "interface"], ["p", " "], ["type", "Ramp"], ["p", " {"]],
  [["p", "  "], ["prop", "name"], ["p", ": "], ["type", "string"], ["p", ";"]],
  [["p", "  "], ["prop", "levels"], ["p", ": "], ["type", "Record"], ["p", "<"], ["type", "number"], ["p", ", "], ["type", "string"], ["p", ">;"]],
  [["p", "}"]],
  [],
  [["kw", "export"], ["p", " "], ["kw", "function"], ["p", " "], ["fn", "ramp"], ["p", "("], ["prop", "name"], ["p", ": "], ["type", "string"], ["p", ", "], ["prop", "spec"], ["p", ": "], ["type", "Spec"], ["p", "): "], ["type", "Ramp"], ["p", " {"]],
  [["p", "  "], ["kw", "const"], ["p", " "], ["prop", "levels"], ["p", " = {};"]],
  [["p", "  "], ["kw", "for"], ["p", " ("], ["kw", "const"], ["p", " "], ["prop", "step"], ["p", " "], ["kw", "of"], ["p", " "], ["prop", "STEPS"], ["p", ") {"]],
  [["p", "    "], ["prop", "levels"], ["p", "["], ["prop", "step"], ["p", "] = "], ["fn", "hex"], ["p", "("], ["fn", "oklch"], ["p", "("], ["prop", "spec"], ["p", ", "], ["prop", "step"], ["p", "));"]],
  [["p", "  }"]],
  [["p", "  "], ["kw", "return"], ["p", " { "], ["prop", "name"], ["p", ", "], ["prop", "levels"], ["p", " };"]],
  [["p", "}"]],
  [],
  [["kw", "const"], ["p", " "], ["prop", "teal"], ["p", " = "], ["fn", "ramp"], ["p", "("], ["str", '"cyan"'], ["p", ", { "], ["prop", "hue"], ["p", ": "], ["num", "195"], ["p", ", "], ["prop", "chroma"], ["p", ": "], ["num", "0.12"], ["p", " });"]],
  [["kw", "const"], ["p", " "], ["prop", "gray"], ["p", " = "], ["fn", "ramp"], ["p", "("], ["str", '"base"'], ["p", ", { "], ["prop", "hue"], ["p", ": "], ["num", "90"], ["p", ", "], ["prop", "chroma"], ["p", ": "], ["num", "0.006"], ["p", " });"]],
  [],
  [["kw", "export"], ["p", " "], ["kw", "const"], ["p", " "], ["prop", "palette"], ["p", " = { "], ["prop", "gray"], ["p", ", "], ["prop", "teal"], ["p", " };"]],
];

function renderCode() {
  // Editor chrome uses the dark end of the ramps; token colors the mid
  // chromatic levels, mimicking a typical dark-theme syntax scheme.
  const tokenColor = {
    kw: hexOf("red", 400),
    type: hexOf("cyan", 400),
    fn: hexOf("blue", 400),
    str: hexOf("green", 400),
    num: hexOf("orange", 400),
    prop: hexOf("yellow", 300),
    com: hexOf("base", 500),
    p: hexOf("base", 100),
  };
  const lines = CODE_SAMPLE.map((line) =>
    line.map(([t, text]) => `<span style="color:${tokenColor[t]}">${esc(text)}</span>`).join("")
  );
  const gutter = CODE_SAMPLE.map((_, i) => `<span>${i + 1}</span>`).join("");
  $("#code-preview").innerHTML = `
    <div class="window">
      <div class="window-bar" style="background:${hexOf("base", 900)}">
        <span class="light" style="background:${hexOf("red", 400)}"></span>
        <span class="light" style="background:${hexOf("yellow", 400)}"></span>
        <span class="light" style="background:${hexOf("green", 400)}"></span>
        <span class="window-title" style="color:${hexOf("base", 300)}">palette.ts</span>
      </div>
      <div class="window-body" style="background:${hexOf("base", 950)}">
        <div class="code-gutter" style="color:${hexOf("base", 700)}">${gutter}</div>
        <pre class="code"><code>${lines.join("\n")}</code></pre>
      </div>
      <div class="window-status" style="background:${hexOf("base", 900)};color:${hexOf("base", 400)}">
        <span>TypeScript</span><span>UTF-8</span><span class="grow"></span><span>oklch · 13 steps</span>
      </div>
    </div>`;
}

// ---- Notes preview ---------------------------------------------------------

function renderNotes() {
  const tags = ["#oklab", "#palette", "#dogfood"];
  const noteItem = (label, active = false) =>
    `<div class="notes-item${active ? " active" : ""}"${active ? ` style="background:${hexOf("base", 800)};color:${hexOf("base", 50)};border-left-color:${hexOf("cyan", 400)}"` : ""}>${label}</div>`;
  $("#notes-preview").innerHTML = `
    <div class="notes-app">
      <aside class="notes-side" style="background:${hexOf("base", 900)}">
        <div class="notes-side-head" style="color:${hexOf("base", 200)}">Cola vault</div>
        <div class="notes-group" style="color:${hexOf("base", 500)}">Design</div>
        ${noteItem("Palette review", true)}
        ${noteItem("Swatch audit")}
        ${noteItem("Naming scheme")}
        <div class="notes-group" style="color:${hexOf("base", 500)}">Research</div>
        ${noteItem("Oklab notes")}
        ${noteItem("Flexoki teardown")}
      </aside>
      <div class="notes-editor" style="background:${hexOf("base", 50)};color:${hexOf("base", 900)}">
        <div class="notes-title" style="color:${hexOf("base", 950)}">Palette review</div>
        <div class="notes-meta">
          ${tags.map((t) => `<span class="tag" style="background:${hexOf("magenta", 100)};color:${hexOf("magenta", 800)}">${t}</span>`).join("")}
          <span class="notes-date" style="color:${hexOf("base", 500)}">edited today</span>
        </div>
        <p>Equal levels must hold their <b style="color:${hexOf("base", 950)}">perceived lightness</b> across every hue. The grayscale filter is the fastest check: each column should collapse to one uniform gray.</p>
        <h3 style="color:${hexOf("base", 800)}">Todos</h3>
        <ul class="notes-checks">
          <li class="done" style="color:${hexOf("base", 600)}"><span class="checkbox on" style="background:${hexOf("green", 600)}"></span>Verify the base ramp covers 100 through 950</li>
          <li class="done" style="color:${hexOf("base", 600)}"><span class="checkbox on" style="background:${hexOf("green", 600)}"></span>Pair the accent with text at 4.5:1</li>
          <li><span class="checkbox" style="border-color:${hexOf("base", 400)}"></span>Re-test semantic pairs under deuteranopia</li>
        </ul>
        <h3 style="color:${hexOf("base", 800)}">Links</h3>
        <p>Compare with <span class="notes-link" style="color:${hexOf("purple", 700)}">Flexoki</span> and the <span class="notes-link" style="color:${hexOf("purple", 700)}">Oklab</span> write-up; details live in <span class="notes-link" style="color:${hexOf("purple", 700)}">Swatch audit</span>.</p>
        <blockquote style="border-left-color:${hexOf("cyan", 500)};background:${hexOf("base", 100)}">Ship the ramp when every column collapses to one gray.</blockquote>
      </div>
    </div>`;
}

// ---- Wheel preview ---------------------------------------------------------

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
      return `<text class="wheel-label" x="${WHEEL.cx}" y="${y}">${palette.levels[j]}</text>`;
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
  const rings = palette.levels
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

function renderWheel() {
  // Pair display (view) and real columns by index, like renderGrid does.
  const pairs = view.colors.map((vcol, i) => ({ vcol, col: palette.colors[i] }));
  const n = palette.levels.length;
  const mode = wheelMode === "fixed" ? renderWheelFixed(pairs, n) : renderWheelHue(pairs, n);
  const btn = (m, label) =>
    `<button type="button" class="wheel-mode-btn${wheelMode === m ? " active" : ""}" aria-pressed="${wheelMode === m}" data-mode="${m}">${label}</button>`;
  $("#wheel-preview").innerHTML = `
    <div class="wheel-mode" role="group" aria-label="Wheel layout">
      ${btn("hue", "By hue")}${btn("fixed", "Fixed")}
    </div>
    <svg class="wheel-svg" viewBox="-60 -20 1120 1040" role="img" aria-label="Palette color wheel">
      ${mode.svg}
    </svg>
    ${mode.below}`;
}

// ---- Branding preview ------------------------------------------------------

function renderBranding() {
  // The light end of the ramps gets nearly all the work here — the app's own
  // chrome already demos the dark end. Fall back to the first row when
  // "cyan" is absent, same policy as hexOf: previews never blank out.
  const stripRow = view.colors.find((c) => c.name === "cyan") || view.colors[0];
  const strip = stripRow.swatches
    .map((s) => `<span style="background:${s.hex}"></span>`)
    .join("");
  const cards = [
    ["Equal lightness", "Every level sits at a fixed Oklab L, so mixed hues at the same level read as equally bright.", "green"],
    ["Gamut-safe", "Out-of-range colors pull back in chroma, never lightness. No muddy endpoints, ever.", "purple"],
    ["One export", "CSS variables, JSON, and design tokens from a single source of truth.", "orange"],
  ].map(([title, body, color]) => `
    <div class="brand-card" style="background:${hexOf("base", 100)};border-color:${hexOf("base", 200)}">
      <span class="brand-icon" style="background:${hexOf(color, 500)}"></span>
      <h4 style="color:${hexOf("base", 900)}">${title}</h4>
      <p style="color:${hexOf("base", 600)}">${body}</p>
    </div>`).join("");
  $("#branding-preview").innerHTML = `
    <div class="brand-page" style="background:${hexOf("base", 50)}">
      <nav class="brand-nav">
        <span class="brand-mark" style="background:${hexOf("cyan", 500)};color:${hexOf("base", 50)}">K</span>
        <span class="brand-word" style="color:${hexOf("base", 950)}">Kroma</span>
        <span class="grow"></span>
        <span class="brand-links" style="color:${hexOf("base", 600)}">Product</span>
        <span class="brand-links" style="color:${hexOf("base", 600)}">Docs</span>
        <span class="brand-links" style="color:${hexOf("base", 600)}">Pricing</span>
        <span class="brand-cta" style="border-color:${hexOf("base", 400)};color:${hexOf("base", 800)}">Get started</span>
      </nav>
      <div class="brand-hero">
        <p class="brand-eyebrow" style="color:${hexOf("cyan", 700)}">Design tokens, perceptually uniform</p>
        <h2 style="color:${hexOf("base", 950)}">Colors that stay in sync.</h2>
        <p class="brand-sub" style="color:${hexOf("base", 600)}">Kroma turns one palette into CSS variables, JSON, and platform tokens — thirteen steps of equal perceived lightness, straight out of the box.</p>
        <div class="brand-actions">
          <span class="brand-btn-primary" style="background:${hexOf("cyan", 600)};color:${hexOf("base", 50)}">Start free</span>
          <span class="brand-btn-ghost" style="border-color:${hexOf("base", 300)};color:${hexOf("base", 800)}">Read the docs</span>
        </div>
      </div>
      <div class="brand-strip">${strip}</div>
      <div class="brand-cards">${cards}</div>
      <p class="brand-foot" style="color:${hexOf("base", 400)}">Kroma Labs — built on Oklab.</p>
    </div>`;
}


// Sync functions that push the current state back into the global sliders.
// They are bound once at load; after a reset the sliders must move to the
// restored defaults without re-attaching their input listeners.
const globalSync = [];

function bindSlider(id, key, digits) {
  const input = $(`#${id}`);
  const val = $(`#${id}-val`);
  const sync = () => {
    input.value = state[key];
    val.textContent = fmt(state[key], digits);
  };
  sync();
  globalSync.push(sync);
  input.addEventListener("input", () => {
    state[key] = Number(input.value);
    val.textContent = fmt(input.value, digits);
    update();
  });
}

// Sidebar identity dots per color name, kept in sync with the grid in
// renderGrid so both widgets always show the same color.
const colorDots = new Map();

function buildColorControls() {
  const wrap = $("#color-controls");
  wrap.innerHTML = "";
  colorDots.clear();
  state.colors.forEach((c) => {
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
        <input type="range" min="0" max="0.3" step="0.005" value="${c.chroma}">
      </label>`;
    const [hueIn, chromaIn] = row.querySelectorAll("input");
    const [hueVal, chromaVal] = row.querySelectorAll(".val");
    hueIn.addEventListener("input", () => {
      c.hue = Number(hueIn.value);
      hueVal.textContent = `${hueIn.value}°`;
      update();
    });
    chromaIn.addEventListener("input", () => {
      c.chroma = Number(chromaIn.value);
      chromaVal.textContent = fmt(chromaIn.value);
      update();
    });
    colorDots.set(c.name, row.querySelector(".color-dot"));
    wrap.appendChild(row);
  });
}

// ---- theming --------------------------------------------------------------

// Dogfooding: the app's own UI colors are palette swatches delivered with
// every response, applied as CSS variables. Because update() runs on every
// slider input, the interface restyles itself live alongside the grid.
const THEME_VARS = {
  bg: "--bg",
  panel: "--bg-panel",
  raised: "--bg-raised",
  border: "--border",
  text: "--text",
  textDim: "--text-dim",
  accent: "--accent",
  danger: "--danger",
};

function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(THEME_VARS)) {
    root.style.setProperty(cssVar, theme[key]);
  }
}

// ---- palette fetching ----------------------------------------------------

let updateSeq = 0;

// Updates fire immediately — the localhost round trip is fast enough that
// slider drags feel live. When several requests overlap (e.g. rapid slider
// movement), only the most recent one is applied; superseded responses are
// dropped so colors never jump back to a stale position.
async function update() {
  const seq = ++updateSeq;
  try {
    const data = await fetchJSON("/api/palette", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...state, filters: filter ? [filter] : [], blueLight }),
    });
    if (seq !== updateSeq) return;
    palette = data.palette;
    view = data.filtered || data.palette;
    renderActive();
    applyTheme(data.theme);
  } catch (err) {
    toast(`Failed to update palette: ${err.message}`);
  }
}

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
  const seq = ++updateSeq;
  try {
    const data = await fetchJSON("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters: filter ? [filter] : [], blueLight }),
    });
    if (seq !== updateSeq) return;
    state = data.state;
    palette = data.palette;
    view = data.filtered || data.palette;
    // Move the already-bound global sliders to the restored values; the
    // per-color rows are rebuilt from scratch (fresh listeners included).
    globalSync.forEach((sync) => sync());
    buildColorControls();
    renderActive();
    applyTheme(data.theme);
    toast("Palette reset to defaults");
  } catch (err) {
    toast(`Reset failed: ${err.message}`);
  }
}

// ---- A/B slots ---------------------------------------------------------------

// The A/B button compares two variants of the settings: clicking saves the
// current state into the active slot, then loads the other slot. The slots
// hold full settings snapshots in the page only — the server keeps
// persisting just the active palette — so a reload starts a fresh A and an
// empty B.
let abActive = "A";
const abSlots = { A: null, B: null };

// Plain-JSON state, so a JSON round trip is a complete deep copy.
const cloneState = (s) => JSON.parse(JSON.stringify(s));

function setABButton() {
  $("#ab").textContent = `A/B: ${abActive}`;
}

async function swapAB() {
  abSlots[abActive] = cloneState(state);
  const other = abActive === "A" ? "B" : "A";
  // Switching to an empty slot seeds it with the current settings, so the
  // first toggle is a no-op and the two variants only diverge from there.
  abSlots[other] = abSlots[other] || cloneState(state);
  abActive = other;
  state = cloneState(abSlots[other]);
  // Move the bound global sliders to the loaded values and rebuild the
  // per-color rows (fresh listeners included), then regenerate — the same
  // plumbing as reset, since a slot swap is a full state replacement.
  globalSync.forEach((sync) => sync());
  buildColorControls();
  setABButton();
  await update();
}

// ---- exports -------------------------------------------------------------

function paletteToCSS() {
  const lines = [];
  for (const col of palette.colors) {
    for (const s of col.swatches) {
      lines.push(`  --${col.name}-${s.level}: ${s.hex};`);
    }
  }
  return `:root {\n${lines.join("\n")}\n}\n`;
}

function paletteToJSON() {
  const out = {};
  for (const col of palette.colors) {
    out[col.name] = {};
    for (const s of col.swatches) out[col.name][s.level] = s.hex;
  }
  return JSON.stringify(out, null, 2) + "\n";
}

// ---- misc ----------------------------------------------------------------

let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 1600);
}

async function copyText(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast("Clipboard unavailable; copy manually from the tooltip");
  }
}

async function load() {
  const data = await fetchJSON("/api/palette");
  state = data.state;
  palette = data.palette;
  view = data.filtered || data.palette;

  bindSlider("maxL", "maxL", 3);
  bindSlider("minL", "minL", 3);
  bindSlider("saturation", "saturation", 2);
  buildColorControls();
  renderActive();
  applyTheme(data.theme);

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
      filter = rb.value === "off" ? null : rb.value;
      // Blue light is the only filter with an intensity control; the slider
      // appears while the filter is on but keeps its value when it is off,
      // so toggling back on restores the chosen warmth.
      $("#bluelight-slider").hidden = filter !== "bluelight";
      update();
    });
  });

  // Blue light intensity slider: same live-update pattern as the state
  // sliders, but it only affects the filtered view, not the palette state.
  const blSlider = $("#blueLight");
  const blVal = $("#blueLight-val");
  const blLabel = () => {
    blVal.textContent = `${Math.round(blueLight * 100)}%`;
  };
  blueLight = Number(blSlider.value);
  blLabel();
  blSlider.addEventListener("input", () => {
    blueLight = Number(blSlider.value);
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
    if (modeBtn && modeBtn.dataset.mode !== wheelMode) {
      wheelMode = modeBtn.dataset.mode;
      renderWheel();
      return;
    }
    const swatch = e.target.closest(".wheel-dot, .wheel-wedge, .legend-swatch");
    if (swatch) copyText(swatch.dataset.hex, `Copied ${swatch.dataset.hex}`);
  });
  $("#copy-css").addEventListener("click", () => copyText(paletteToCSS(), "CSS variables copied"));
  $("#copy-json").addEventListener("click", () => copyText(paletteToJSON(), "JSON copied"));
  // A/B: slot A starts as the loaded settings; B stays empty until the
  // first toggle seeds it.
  abSlots.A = cloneState(state);
  setABButton();
  $("#ab").addEventListener("click", swapAB);
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
