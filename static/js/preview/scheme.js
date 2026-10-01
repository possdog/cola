// Light/dark scheme for the Code, Notes, Landing, and Design previews.
// The scheme is the level complement: every level is swapped for its
// opposite across the ramp's midpoint (50<->950, 200<->800, 500 fixed),
// which lands on a real step for all thirteen levels. Because every level
// sits at a fixed Oklab lightness, the complement preserves each pairing's
// perceived-lightness gap with the faces swapped — the exact property a
// Flexoki-style ramp exists to guarantee, so dark mode is literally the
// complement of light mode with no re-tuning. Defaults match each mock's
// native look (the code environments are dark; the other three are light).
// Like the wheel layout and code environment modes, this is a display-only
// preference: never persisted, never part of the exported state.

import { hexOf } from "../swatch.js";

const schemes = {
  code: "dark",
  notes: "light",
  landing: "light",
  design: "light",
};

// Resolve a level through the tab's scheme: literal in the tab's native
// face, complemented in the other. Used both for colors (via hexFor) and
// for preview copy that names the levels it is showing, so the labels stay
// honest after a toggle.
function levelFor(tab, level) {
  return schemes[tab] === "dark" ? 1000 - level : level;
}

// hexOf bound to a tab's scheme: the previews keep authoring their native
// (light) pairings, and the toggle resolves them to the current face.
function hexFor(tab) {
  return (name, level) => hexOf(name, levelFor(tab, level));
}

// Toggle the tab's scheme. Returns whether the scheme changed, so the
// click handler can skip a redundant redraw.
function setScheme(tab, scheme) {
  if (scheme === schemes[tab]) return false;
  schemes[tab] = scheme;
  return true;
}

// Toolbar markup shared by the four schemable previews, matching the
// wheel/code mode button groups. Callers wrap it in a .preview-tools row;
// the Code pane puts it beside its environment group.
function schemeToggle(tab) {
  const btn = (s, label) =>
    `<button type="button" class="scheme-btn${schemes[tab] === s ? " active" : ""}" aria-pressed="${schemes[tab] === s}" data-tab="${tab}" data-scheme="${s}">${label}</button>`;
  return `<div class="scheme-toggle" role="group" aria-label="Preview light/dark theme">${btn("light", "Light")}${btn("dark", "Dark")}</div>`;
}

export { levelFor, hexFor, setScheme, schemeToggle };
