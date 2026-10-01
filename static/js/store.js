// Shared, mutable app state. Everything here is written by exactly one or two
// modules and read across the app, so it lives in one object that ES-module
// imports can see mutate in place — individual `export let` bindings could
// only be reassigned from this module. The fields keep their original
// meanings:
//
// - state is the editable settings object (mutated in place by the sliders,
//   replaced wholesale by reset and A/B swaps).
// - palette is the real palette from the last response; view is what gets
//   displayed: the filtered palette when a view filter is active, otherwise
//   the real palette. Exports and copies always use palette.
// - defaults is the built-in state delivered with every palette response (the
//   same state POST /api/reset restores). Double-clicking a slider snaps just
//   that one value back to its default from here, without a reset round trip.
// - filter is the active view filter, or null when "Off" is selected
//   (server-side: grayscale is exact Oklab, CVD uses Machado 2009 matrices).
//   The panel is a radio group, so exactly one view applies at a time; the
//   request still sends a one-element array to match the API's `filters`
//   shape.
// - blueLight is the blue light filter intensity in [0,1]. A display-only
//   preference: it rides along with every request but is never part of the
//   exported palette state.
// - activeTab is the active preview tab (grid / wheel / gamut / contrast /
//   code / notes / landing / design). Grid is the default.
// - abActive / abSlots are the A/B comparison record (see ab.js).

export const store = {
  state: null,
  palette: null,
  view: null,
  defaults: null,
  activeTab: "grid",
  filter: null,
  blueLight: 0,
  abActive: "A",
  abSlots: { A: null, B: null },
};

// Sidebar identity dots per color name, kept in sync with the grid in
// grid.js so both widgets always show the same color. Populated by
// buildColorControls, read by renderGrid.
export const colorDots = new Map();

// Plain-JSON state, so a JSON round trip is a complete deep copy.
export const cloneState = (s) => JSON.parse(JSON.stringify(s));
