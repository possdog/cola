// Landing preview tab: a landing-page mock exercising the light end of
// every ramp, plus one closing dark CTA band.

import { store } from "../store.js";
import { $, esc } from "../util.js";
import { hexFor, levelFor, schemeToggle } from "./scheme.js";

// Width mixes for the usage chart's stacked bars. A handful of fixed ratios
// rotated by row index, so the bars read as distinct data series instead of
// one uniform stack; the numbers are arbitrary — the chart exists to show
// three ramp steps of every hue side by side.
const BRAND_MIXES = [
  [45, 35, 20],
  [22, 50, 28],
  [58, 27, 15],
  [34, 41, 25],
];

export function renderLanding() {
  // Scheme-bound lookups: the page is authored on its light face, and the
  // toggle complements every level so the whole brand site flips dark. lvl
  // keeps the section copy naming the levels actually on screen.
  const hex = hexFor("landing");
  const lvl = (n) => levelFor("landing", n);
  // The light end of the ramps gets most of the work here — the app's own
  // chrome already demos the dark end — plus one closing dark CTA band, so
  // the page covers both faces of every ramp. Per-row sections iterate the
  // live chromatic rows so renames carry through, and hexOf's gray fallback
  // keeps every piece visible even when a referenced level goes missing.
  // Colors resolve through the scheme-bound hex, so the same page renders
  // its dark face when the toolbar toggle is switched.
  const stripRow = store.view.colors.find((c) => c.name === "cyan") || store.view.colors[0];
  const strip = stripRow.swatches
    .map((s) => `<span style="background:${s.hex}"></span>`)
    .join("");
  const cards = [
    ["Equal lightness", "Every level sits at a fixed Oklab L, so mixed hues at the same level read as equally bright.", "green"],
    ["Gamut-safe", "Out-of-range colors pull back in chroma, never lightness. No muddy endpoints, ever.", "purple"],
    ["One export", "CSS variables, JSON, and design tokens from a single source of truth.", "orange"],
  ].map(([title, body, color]) => `
    <div class="brand-card" style="background:${hex("base", 100)};border-color:${hex("base", 200)}">
      <span class="brand-icon" style="background:${hex(color, 500)}"></span>
      <h4 style="color:${hex("base", 900)}">${title}</h4>
      <p style="color:${hex("base", 600)}">${body}</p>
    </div>`).join("");

  const chrom = store.view.colors.filter((c) => c.name !== "base");

  // Section heading, so each demo block reads as a landing-page section
  // rather than a pile of unlabeled swatches.
  const sec = (title, sub) => `
    <div class="brand-sec">
      <h3 style="color:${hex("base", 950)}">${title}</h3>
      <p style="color:${hex("base", 500)}">${sub}</p>
    </div>`;

  // One logo set per chromatic ramp in both faces a brand needs: the 600
  // step as the solid tile with light ink, the 100 step as the tinted tile
  // with dark ink. Tile ink comes from the base ramp rather than the row's
  // own extremes — a wordmark's ink is a brand decision, not a ramp step.
  const marks = chrom.map((c) => `
    <div class="brand-markset" style="background:${hex("base", 100)};border-color:${hex("base", 200)}">
      <span class="brand-marktile" style="background:${hex(c.name, 600)};color:${hex("base", 50)}">K</span>
      <span class="brand-marktile" style="background:${hex(c.name, 100)};color:${hex(c.name, 800)}">K</span>
      <span class="brand-markname" style="color:${hex("base", 700)}">${esc(c.name)}</span>
    </div>`).join("");

  // The 600 step is the canonical primary from every ramp — dark enough to
  // carry level-50 ink — with a 700-outline ghost as its secondary. The
  // base ramp supplies the disabled pair, and red the destructive action.
  const primaries = chrom.map((c) =>
    `<span class="brand-btn-primary" style="background:${hex(c.name, 600)};color:${hex("base", 50)}">${esc(c.name)}</span>`
  ).join("");
  const ghosts = chrom.map((c) =>
    `<span class="brand-btn-ghost" style="border-color:${hex(c.name, 700)};color:${hex(c.name, 700)}">${esc(c.name)}</span>`
  ).join("");
  const states = `
    <span class="brand-btn-primary" style="background:${hex("base", 200)};color:${hex("base", 500)}">Disabled</span>
    <span class="brand-btn-primary" style="background:${hex("red", 600)};color:${hex("base", 50)}">Delete project</span>`;

  // Announcement ribbon: a cross-hue gradient through every chromatic ramp's
  // 600 step. Equal lightness is what makes a multi-hue gradient wearable —
  // every stop shares one Oklab L, so the band reads as an even wash and the
  // level-50 ink holds one contrast across its whole run. Built from the
  // live chromatic rows so renames carry through. Skipped when there are no
  // chromatic rows: with no stops the gradient is invalid CSS, and the
  // base-50 ink would vanish on the base-50 page.
  const banner = chrom.length ? `
    <div class="brand-banner" style="background:linear-gradient(90deg, ${chrom.map((c) => hex(c.name, 600)).join(", ")})">
      <span class="brand-banner-tag" style="background:${hex("base", 50)};color:${hex("base", 800)}">New</span>
      <span style="color:${hex("base", 50)}">Token exports now map levels straight to platform variables.</span>
    </div>` : "";

  // Status badges: the 100-ground/800-ink pairing from the Notes tab, with a
  // 500 dot — the three steps a status pill leans on, in one glance.
  const badges = chrom.map((c) => `
    <span class="brand-badge" style="background:${hex(c.name, 100)};color:${hex(c.name, 800)}">
      <span class="brand-badgedot" style="background:${hex(c.name, 500)}"></span>${esc(c.name)}
    </span>`).join("");

  // Stacked usage bars: the 300/500/700 steps of every ramp in one bar.
  // These are the interesting three under the grayscale filter — the
  // segments must keep three distinct lightnesses, the equal-lightness
  // property in miniature.
  const bars = chrom.map((c, i) => {
    const [a, b, d] = BRAND_MIXES[i % BRAND_MIXES.length];
    const seg = (lvl, w) => `<span style="background:${hex(c.name, lvl)};width:${w}%"></span>`;
    return `
      <div class="brand-bar">
        <span class="brand-barname" style="color:${hex("base", 700)}">${esc(c.name)}</span>
        <div class="brand-bartrack" style="background:${hex("base", 100)}">${seg(300, a)}${seg(500, b)}${seg(700, d)}</div>
      </div>`;
  }).join("");
  // The legend labels name the levels actually rendered, which under the
  // dark scheme are the complements of the authored 300/500/700 trio.
  const legend = [300, 500, 700].map((l) => `
    <span class="brand-legendchip"><span class="brand-badgedot" style="background:${hex("cyan", l)}"></span><span style="color:${hex("base", 600)}">level ${lvl(l)}</span></span>`
  ).join("");

  // Pricing: light cards on the flanks and one inverted card, to show a
  // large chromatic block carrying light ink at reading sizes. Feature
  // dots come from each card's own ground so they read on either face.
  const feat = (dot, text, ink) =>
    `<li><span class="brand-featdot" style="background:${dot}"></span><span style="color:${ink}">${text}</span></li>`;
  const plans = `
    <div class="brand-plan" style="background:${hex("base", 50)};border-color:${hex("base", 200)}">
      <span class="brand-plan-name" style="color:${hex("base", 600)}">Hobby</span>
      <div class="brand-plan-price" style="color:${hex("base", 950)}">$0<span style="color:${hex("base", 500)}"> /mo</span></div>
      <p class="brand-plan-blurb" style="color:${hex("base", 600)}">For weekend palettes.</p>
      <ul class="brand-feats">
        ${feat(hex("green", 500), "One palette", hex("base", 700))}
        ${feat(hex("green", 500), "CSS and JSON export", hex("base", 700))}
      </ul>
      <span class="brand-btn-ghost" style="border-color:${hex("base", 400)};color:${hex("base", 800)}">Choose Hobby</span>
    </div>
    <div class="brand-plan" style="background:${hex("cyan", 600)};border-color:${hex("cyan", 700)}">
      <span class="brand-plan-name" style="color:${hex("cyan", 100)}">Studio</span>
      <div class="brand-plan-price" style="color:${hex("base", 50)}">$12<span style="color:${hex("cyan", 100)}"> /mo</span></div>
      <p class="brand-plan-blurb" style="color:${hex("cyan", 100)}">For teams shipping brands.</p>
      <ul class="brand-feats">
        ${feat(hex("cyan", 200), "Unlimited palettes", hex("base", 50))}
        ${feat(hex("cyan", 200), "A/B slots and CVD checks", hex("base", 50))}
        ${feat(hex("cyan", 200), "Token export to any platform", hex("base", 50))}
      </ul>
      <span class="brand-btn-primary" style="background:${hex("base", 50)};color:${hex("cyan", 800)}">Choose Studio</span>
    </div>
    <div class="brand-plan" style="background:${hex("base", 100)};border-color:${hex("base", 200)}">
      <span class="brand-plan-name" style="color:${hex("base", 600)}">Agency</span>
      <div class="brand-plan-price" style="color:${hex("base", 950)}">$49<span style="color:${hex("base", 500)}"> /mo</span></div>
      <p class="brand-plan-blurb" style="color:${hex("base", 600)}">Shared palettes, reviewed together.</p>
      <ul class="brand-feats">
        ${feat(hex("green", 500), "Everything in Studio", hex("base", 700))}
        ${feat(hex("green", 500), "Live review links", hex("base", 700))}
      </ul>
      <span class="brand-btn-ghost" style="border-color:${hex("base", 400)};color:${hex("base", 800)}">Choose Agency</span>
    </div>`;

  $("#landing-preview").innerHTML = `
    <div class="preview-tools">${schemeToggle("landing")}</div>
    <div class="brand-page" style="background:${hex("base", 50)}">
      <nav class="brand-nav">
        <span class="brand-mark" style="background:${hex("cyan", 500)};color:${hex("base", 50)}">K</span>
        <span class="brand-word" style="color:${hex("base", 950)}">Kroma</span>
        <span class="grow"></span>
        <span class="brand-links" style="color:${hex("base", 600)}">Product</span>
        <span class="brand-links" style="color:${hex("base", 600)}">Docs</span>
        <span class="brand-links" style="color:${hex("base", 600)}">Pricing</span>
        <span class="brand-cta" style="border-color:${hex("base", 400)};color:${hex("base", 800)}">Get started</span>
      </nav>
      <div class="brand-hero">
        <p class="brand-eyebrow" style="color:${hex("cyan", 700)}">Design tokens, perceptually uniform</p>
        <h2 style="color:${hex("base", 950)}">Colors that stay in sync.</h2>
        <p class="brand-sub" style="color:${hex("base", 600)}">Kroma turns one palette into CSS variables, JSON, and platform tokens — thirteen steps of equal perceived lightness, straight out of the box.</p>
        <div class="brand-actions">
          <span class="brand-btn-primary" style="background:${hex("cyan", 600)};color:${hex("base", 50)}">Start free</span>
          <span class="brand-btn-ghost" style="border-color:${hex("base", 300)};color:${hex("base", 800)}">Read the docs</span>
        </div>
      </div>
      ${banner}
      <div class="brand-strip">${strip}</div>
      <div class="brand-cards">${cards}</div>
      ${sec("Marks", `Every ramp as a logo: the ${lvl(600)} step solid, the ${lvl(100)} step tinted, each with ink from the base ramp.`)}
      <div class="brand-marks">${marks}</div>
      ${sec("Components", "Primary and secondary buttons from every ramp, the base pair for disabled, red for destructive, and status badges.")}
      <div class="brand-row">${primaries}${states}</div>
      <div class="brand-row">${ghosts}</div>
      <div class="brand-row">${badges}</div>
      ${sec("Usage", "The 300/500/700 steps of every ramp stacked as data — under the grayscale filter the segments must stay three distinct grays.")}
      <div class="brand-bars">${bars}</div>
      <div class="brand-legend">${legend}</div>
      ${sec("Pricing", `${lvl(50) === 50 ? "Light" : "Dark"} cards on the flanks; one inverted card shows a large chromatic block carrying ${lvl(50) === 50 ? "light" : "dark"} ink.`)}
      <div class="brand-plans">${plans}</div>
      <div class="brand-dark" style="background:${hex("base", 950)}">
        <h3 style="color:${hex("base", 50)}">Ready when your palette is.</h3>
        <p style="color:${hex("base", 400)}">Every level is a fixed Oklab lightness — what you preview is what ships.</p>
        <div class="brand-actions">
          <span class="brand-btn-primary" style="background:${hex("cyan", 300)};color:${hex("base", 950)}">Start free</span>
          <span class="brand-btn-ghost" style="border-color:${hex("base", 600)};color:${hex("base", 100)}">Talk to us</span>
        </div>
      </div>
      <p class="brand-foot" style="color:${hex("base", 400)}">Kroma Labs — built on Oklab.</p>
    </div>`;
}
