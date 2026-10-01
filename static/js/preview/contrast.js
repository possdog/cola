// Contrast preview tab: realistic foreground/background combinations drawn
// from the palette, each scored against WCAG AA. Every swatch already carries
// its WCAG relative luminance (y) from the server, so the ratio here is plain
// arithmetic on returned values — no color math runs in the browser, and
// because the pane reads the view copy, the filters re-check contrast too
// (grayscale, CVD, and blue light all change luminance relationships).

import { store } from "../store.js";
import { $, esc } from "../util.js";
import { swatchText } from "../swatch.js";

// AA thresholds. "large" is WCAG's large-text class (>=24px, or >=18.66px
// bold), which gets the looser 3:1 tier; everything else is body text.
const AA_NORMAL = 4.5;
const AA_LARGE = 3;

// Fixed interface pairings every UI built on the palette will need. The rows
// are referenced by design name; a renamed row falls back to the mid gray
// (like hexOf) so the card still renders and visibly reads as broken.
const PAIRS = [
  { fg: ["base", 800], bg: ["base", 50], large: false, label: "Body text — light UI", sample: "Ship ramps that read at a glance." },
  { fg: ["base", 950], bg: ["base", 50], large: true, label: "Heading — light UI", sample: "Announcement" },
  { fg: ["base", 600], bg: ["base", 50], large: false, label: "Secondary text — light UI", sample: "Edited 3 minutes ago" },
  { fg: ["base", 400], bg: ["base", 50], large: false, label: "Disabled text — light UI", sample: "This field is disabled" },
  { fg: ["base", 100], bg: ["base", 950], large: false, label: "Body text — dark UI", sample: "The same ramp, inverted." },
  { fg: ["base", 400], bg: ["base", 950], large: false, label: "Secondary text — dark UI", sample: "Press ? for shortcuts" },
  { fg: ["cyan", 700], bg: ["base", 50], large: false, label: "Accent link — light UI", sample: "Read the Oklab write-up" },
  { fg: ["cyan", 400], bg: ["base", 950], large: false, label: "Accent link — dark UI", sample: "Open contrast report" },
  { fg: ["base", 50], bg: ["blue", 600], large: false, label: "Button label on blue-600", sample: "Create palette" },
  { fg: ["base", 50], bg: ["red", 600], large: false, label: "Destructive label on red-600", sample: "Delete swatch" },
  { fg: ["green", 800], bg: ["green", 100], large: false, label: "Success text — light badge", sample: "All checks passed" },
  { fg: ["yellow", 900], bg: ["yellow", 100], large: false, label: "Warning text — light badge", sample: "Near the gamut edge" },
];

function swatchOf(name, level) {
  const col = store.view.colors.find((c) => c.name === name);
  const s = col && col.swatches.find((x) => x.level === level);
  // Same fallback convention as hexOf: a missing row/level grays out instead
  // of throwing. #888888's relative luminance keeps the ratio well-defined.
  return s || { hex: "#888888", y: 0.246 };
}

// WCAG contrast ratio: (lighter + 0.05) / (darker + 0.05). The order of the
// pair doesn't matter — the lighter side is always the numerator.
function contrast(a, b) {
  const hi = Math.max(a.y, b.y);
  const lo = Math.min(a.y, b.y);
  return (hi + 0.05) / (lo + 0.05);
}

function card(fg, bg, { large = false, label, sample, pairText }) {
  const ratio = contrast(fg, bg);
  const threshold = large ? AA_LARGE : AA_NORMAL;
  const pass = ratio >= threshold;
  // The badge itself must stay readable whatever the palette does to green
  // and red, so its ink follows the chip ground's luminance (swatchText).
  const chip = swatchOf(pass ? "green" : "red", pass ? 600 : 400);
  return `
    <div class="contrast-card">
      <div class="contrast-stage" style="background:${bg.hex}">
        <span class="contrast-sample${large ? " lg" : ""}" style="color:${fg.hex}">${sample}</span>
      </div>
      <div class="contrast-meta">
        <span class="contrast-label">${label}</span>
        <span class="contrast-pair">${pairText}</span>
        <span class="contrast-score">
          <span class="contrast-ratio">${ratio.toFixed(2)}:1 / ${threshold}:1</span>
          <span class="contrast-badge" style="background:${chip.hex};color:${swatchText(chip)}">${pass ? "PASS" : "FAIL"}</span>
        </span>
      </div>
    </div>`;
}

export function renderContrast() {
  // Interface pairings: the fixed fg/bg combos a real UI makes of the ramps.
  const fixed = PAIRS.map((p) => {
    const fg = swatchOf(...p.fg);
    const bg = swatchOf(...p.bg);
    const name = ([n, l]) => `${n}-${l}`;
    return card(fg, bg, { large: p.large, label: p.label, sample: p.sample, pairText: `${name(p.fg)} on ${name(p.bg)}` });
  }).join("");

  // Ramp pairings: the two standard combinations every chromatic row must
  // support (dark ink on its own light tint; its 400 step on base-950 dark
  // mode), named from the live palette so a renamed row keeps its real label.
  const perRamp = store.view.colors
    .filter((c) => c.name !== "base")
    .flatMap((c) => [
      {
        fg: swatchOf(c.name, 800),
        bg: swatchOf(c.name, 100),
        label: `Light mode — ${esc(c.name)}`,
        sample: `${esc(c.name)} in ink`,
        pairText: `${esc(c.name)}-800 on ${esc(c.name)}-100`,
      },
      {
        fg: swatchOf(c.name, 400),
        bg: swatchOf("base", 950),
        label: `Dark mode — ${esc(c.name)}`,
        sample: `${esc(c.name)} accent`,
        pairText: `${esc(c.name)}-400 on base-950`,
      },
    ])
    .map((p) => card(p.fg, p.bg, p))
    .join("");

  $("#contrast-preview").innerHTML = `
    <div class="contrast-wrap">
      <div class="contrast-sec">
        <h3>Interface pairings</h3>
        <p>Realistic text combinations a UI built on this palette needs. PASS requires ${AA_NORMAL}:1 for body text and ${AA_LARGE}:1 for large text (WCAG AA).</p>
        <div class="contrast-grid">${fixed}</div>
      </div>
      <div class="contrast-sec">
        <h3>Ramp pairings</h3>
        <p>The two standard pairs every chromatic ramp must support: level-800 ink on its level-100 tint, and the 400 step on base-950.</p>
        <div class="contrast-grid">${perRamp}</div>
      </div>
    </div>`;
}
