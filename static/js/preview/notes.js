// Notes preview tab: a note-taking app mock demonstrating the standard
// light-UI pairings every ramp must provide.

import { store } from "../store.js";
import { $, esc } from "../util.js";
import { hexFor, levelFor, schemeToggle } from "./scheme.js";

// Tag pills cycle through several chromatic rows: a pill's ground is the
// row's level-100 step and its ink the level-800 step — the standard pairing
// a light UI makes of a ramp. Cycling hues shows the pattern holds across
// the palette instead of on one lucky color.
const NOTES_TAGS = [
  ["blue", "#oklab"],
  ["cyan", "#palette"],
  ["green", "#contrast"],
  ["orange", "#cvd"],
  ["magenta", "#dogfood"],
];

export function renderNotes() {
  // Scheme-bound lookups: the mock is authored as a light UI, and the toggle
  // complements every level so the whole app flips to its dark face.
  const hex = hexFor("notes");
  const lvl = (n) => levelFor("notes", n);
  const tag = ([name, label]) =>
    `<span class="tag" style="background:${hex(name, 100)};color:${hex(name, 800)}">${label}</span>`;
  const noteItem = (label, active = false) =>
    `<div class="notes-item${active ? " active" : ""}"${active ? ` style="background:${hex("base", 800)};color:${hex("base", 50)};border-left-color:${hex("cyan", 400)}"` : ""}>${label}</div>`;

  // One card per chromatic row, named from the live palette so a renamed row
  // keeps its real label; hex grays out the chips if a level goes missing.
  // The two chips are the classic pairings a UI needs from every ramp: dark
  // ink on a light ground (light mode) and the 400 step on base-950 (dark
  // mode). The labels name the levels actually shown, so under the dark
  // scheme the same chips read as the complemented pairings (200 ink on a
  // 900 ground, 600 on base-50). The base row itself is demonstrated by the
  // editor pane around it.
  const pairs = store.view.colors
    .filter((c) => c.name !== "base")
    .map((c) => {
      const name = esc(c.name);
      return `
        <div class="pair">
          <span class="pair-name" style="color:${hex("base", 600)}">${name}</span>
          <span class="pair-chip" style="background:${hex(c.name, 100)};color:${hex(c.name, 800)}">${name}-${lvl(800)} on ${name}-${lvl(100)}</span>
          <span class="pair-chip" style="background:${hex("base", 950)};color:${hex(c.name, 400)}">${name}-${lvl(400)} on base-${lvl(950)}</span>
        </div>`;
    })
    .join("");

  $("#notes-preview").innerHTML = `
    <div class="preview-tools">${schemeToggle("notes")}</div>
    <div class="notes-app">
      <aside class="notes-side" style="background:${hex("base", 900)}">
        <div class="notes-search" style="background:${hex("base", 800)};border-color:${hex("base", 700)};color:${hex("base", 400)}">Search notes…</div>
        <div class="notes-side-head" style="color:${hex("base", 200)}">Cola vault</div>
        <div class="notes-group" style="color:${hex("base", 500)}">Design</div>
        ${noteItem("Palette review", true)}
        ${noteItem("Swatch audit")}
        ${noteItem("Naming scheme")}
        <div class="notes-group" style="color:${hex("base", 500)}">Research</div>
        ${noteItem("Oklab notes")}
        ${noteItem("Flexoki teardown")}
        <div class="notes-new" style="background:${hex("cyan", 600)};color:${hex("base", 50)}">New note</div>
      </aside>
      <div class="notes-editor" style="background:${hex("base", 50)};color:${hex("base", 900)}">
        <div class="notes-title" style="color:${hex("base", 950)}">Palette review</div>
        <div class="notes-meta">
          ${NOTES_TAGS.map(tag).join("")}
          <span class="notes-date" style="color:${hex("base", 500)}">edited today</span>
        </div>
        <p>Every level is pinned to a fixed Oklab <b style="color:${hex("base", 950)}">lightness</b>, written <code style="background:${hex("red", 100)};color:${hex("red", 800)}">oklch(L C H)</code>, so <mark style="background:${hex("yellow", 200)};color:${hex("yellow", 950)}">equal levels share perceived luminosity</mark> across every hue. The grayscale filter is the fastest check: each column should collapse to one uniform gray.</p>
        <h3 style="color:${hex("base", 800)}">Todos</h3>
        <ul class="notes-checks">
          <li class="done" style="color:${hex("base", 600)}"><span class="checkbox on" style="background:${hex("green", 600)}"></span>Verify the base ramp covers 100 through 950</li>
          <li class="done" style="color:${hex("base", 600)}"><span class="checkbox on" style="background:${hex("green", 600)}"></span>Pair the accent with text at 4.5:1</li>
          <li><span class="checkbox" style="border-color:${hex("base", 400)}"></span>Re-test semantic pairs under deuteranopia</li>
          <li><span class="checkbox" style="border-color:${hex("base", 400)}"></span>Audit the pairings below after every hue move</li>
        </ul>
        <h3 style="color:${hex("base", 800)}">Pairings</h3>
        <div class="pairs">${pairs}</div>
        <div class="notes-callout" style="background:${hex("orange", 100)};border-left-color:${hex("orange", 500)}">
          <span class="notes-callout-title" style="color:${hex("orange", 900)}">Hue windows</span>
          <p style="color:${hex("base", 800)}">Chromatic hues clamp to ±30° around their ideal center, so red stays red — but the pairings above still shift when a slider moves, so re-check them.</p>
        </div>
        <h3 style="color:${hex("base", 800)}">Links</h3>
        <p>Compare with <span class="notes-link" style="color:${hex("purple", 700)}">Flexoki</span> and the <span class="notes-link" style="color:${hex("purple", 700)}">Oklab</span> write-up; details live in <span class="notes-link" style="color:${hex("purple", 700)}">Swatch audit</span>.</p>
        <blockquote style="border-left-color:${hex("cyan", 500)};background:${hex("base", 100)}">Ship the ramp when every column collapses to one gray.</blockquote>
        <div class="notes-backlinks" style="border-top-color:${hex("base", 200)}">
          <span style="color:${hex("base", 500)}">2 links to this note</span>
          <span class="notes-bl" style="background:${hex("base", 100)};color:${hex("blue", 700)}">Oklab notes</span>
          <span class="notes-bl" style="background:${hex("base", 100)};color:${hex("blue", 700)}">Flexoki teardown</span>
        </div>
      </div>
    </div>`;
}
