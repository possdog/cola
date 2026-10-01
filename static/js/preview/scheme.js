// Global light/dark scheme for the whole app: the Code, Notes, Landing, and
// Design previews resolve their levels through it, and so does the app's
// own chrome (theme.js), so one setting flips the interface and the mock
// surfaces together. The scheme is the level complement: every level is
// swapped for its opposite across the ramp's midpoint (50<->950,
// 200<->800, 500 fixed), which lands on a real step for all thirteen
// levels. Because every level sits at a fixed Oklab lightness, the
// complement preserves each pairing's perceived-lightness gap with the
// faces swapped — the exact property a Flexoki-style ramp exists to
// guarantee, so dark mode is literally the complement of light mode with
// no re-tuning. The default is dark, the app chrome's native face. Like
// the wheel layout and code environment modes, this is a display-only
// preference: never persisted, never part of the exported state.

import { hexOf } from "../swatch.js";

let scheme = "dark";

// The face each surface is authored on: the app chrome and the code
// environments on dark, the other three previews on light. The complement
// must be applied relative to this face — levels stay literal while the
// scheme matches it and complement otherwise — otherwise a natively-dark
// mock like the code preview would render complemented (light) under its
// own default "Dark" scheme.
const NATIVE = {
  app: "dark",
  code: "dark",
  notes: "light",
  landing: "light",
  design: "light",
};

// Resolve a level through the global scheme: literal in the surface's
// native face, complemented in the other. Used both for colors (via
// hexFor) and for preview copy that names the levels it is showing, so the
// labels stay honest after a toggle.
function levelFor(tab, level) {
  return scheme === NATIVE[tab] ? level : 1000 - level;
}

// hexOf bound to a tab's scheme: the previews keep authoring their native
// pairings, and the global scheme resolves them to the current face.
function hexFor(tab) {
  return (name, level) => hexOf(name, levelFor(tab, level));
}

// Switch the global scheme. Returns whether the scheme changed, so the
// click handler can skip a redundant redraw.
function setScheme(next) {
  if (next === scheme) return false;
  scheme = next;
  return true;
}

export { levelFor, hexFor, setScheme };
