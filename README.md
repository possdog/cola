# Cola

A web-based designer for UI-ready color palettes, modeled on the structure of
[Flexoki](https://stephango.com/flexoki): nine colors (base, red, orange,
yellow, green, cyan, blue, purple, magenta), each sampled at thirteen
luminosity levels (50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 850, 900,
950 — bigger number, darker color).

All swatches are computed in [Oklab](https://bottosson.github.io/posts/oklab/):
every level sits at a fixed Oklab lightness, so equal levels have equal
perceived luminosity regardless of hue. Colors that fall outside the sRGB
gamut are pulled back by reducing chroma at fixed lightness and hue.

## Run

```sh
go run .            # serves HTTPS on https://127.0.0.1:8443
go run . -addr :9000
go run . -http      # plain HTTP, for scripting
```

The server remembers your palette settings between runs: they are written to
`state.json` (override with `-state`) about half a second after the last
change, flushed on Ctrl-C, and loaded on the next start. The A/B comparison
record (both slots and which one is active) is persisted in the same file,
so neither variant is lost to a reload or restart. View filters are
deliberately not persisted. A missing or corrupt state file falls back to
the default palette; files written before the A/B feature (a bare state
object) still load and count as slot A.

The server serves HTTPS by default. On first run it generates a self-signed
certificate for `localhost`, `127.0.0.1`, and `::1` into `certs/` and reuses it
on later runs. Browsers will show a warning for it until you trust it once.

On macOS:

```sh
sudo security add-trusted-cert -d -r trustRoot -p ssl \
  -k /Library/Keychains/System.keychain certs/localhost.crt
```

On Linux, copy `certs/localhost.crt` to your distribution's CA directory
(e.g. `/usr/local/share/ca-certificates/`) and run `update-ca-certificates`.
In Firefox, import the certificate under Settings > Privacy & Security >
Certificates > Authorities. Alternatively, click through the warning each
time, or point [mkcert](https://github.com/FiloSottile/mkcert) at it and pass
its files via `-cert`/`-key`.

Scripts can skip TLS friction entirely with `-http`, or verify properly:

```sh
curl --cacert certs/localhost.crt https://127.0.0.1:8443/api/palette
```

## Controls

- **Lightest / darkest L** — Oklab lightness of levels 50 and 950; the eleven
  intermediate levels are distributed between them with Flexoki-style spacing
  (steps bunch toward the extremes).
- **Bend** — power-law skew of that distribution, centered at 0 (no skew).
  Each level's position between the two anchors is raised to the exponent
  2^bend, so a unit of bend doubles or halves the curve's strength and both
  directions feel equally strong. Positive bend pulls intermediate levels
  toward the light anchor — the light steps crowd together while the dark
  shades spread across a wider range — and negative bend does the opposite.
  Levels 50 and 950 are fixed points of the power law, so the anchors never
  move, and the skew can never invert the ramp's lightness order.
- **Pinch** — bunches the (already bent) steps around one point, centered at
  0 (no pinch) and clamped to ±0.5. Each side of that point is remapped with
  the exponent (1+f)/(1-f), so both directions feel symmetric in strength:
  positive values concentrate the steps near the point and negative values
  push them toward the anchors. Throughout the clamped range the mapping is
  strictly monotonic, so the lightness order can never invert; the ±1
  extremes of the underlying curve, where the ramp would degenerate, stay
  out of reach.
- **Pinch center** — where the pinch focuses, as a position between the
  anchors (0 = level 50, 1 = level 950; default 0.5). It has no effect while
  pinch is 0. The pinch runs after the bend, so the pinch center names a spot
  in the final distribution: the step at that spot stays exactly there.
- **Saturation** — global chroma multiplier.
- **Per-color hue and chroma** — precise OKLCH values for each of the nine
  rows. Each chromatic color's hue is limited to ±30° around its ideal OKLCH
  center, so red stays recognizably red. (Oklab hue differs from HSL: hue 0
  is pink, and sRGB red sits at ~30°.) The near-neutral base row is
  unconstrained.

Double-click any of these sliders to snap just that one back to its default
value — the same value **Reset to defaults** would restore for it, without
touching anything else. (The blue-light intensity slider is not part of the
palette state and has no default to restore.)

Click any swatch to copy its hex. The header buttons copy the whole palette
as CSS custom properties (`--base-50: ...`) or JSON. **A/B** (next to the
copy buttons) is a three-segment A | → | B control for comparing two
variants of the settings: click the inactive half to save the current
settings into the active slot and load the other, so clicking back and
forth flips between the two. The middle arrow copies the active slot's
settings into the other without switching; it points in the copy
direction — useful for making both slots identical before diverging
one, or for discarding the other variant. Both slots are persisted by the
server (see HTTP API below), so a reload or restart restores the whole
record — the first toggle after a fresh start still seeds an empty slot
with the current settings, so it changes nothing by itself.
**Reset to defaults** restores the built-in palette (two clicks: the first
arms the button and the second confirms); the restored defaults are
persisted like any other change.

**View filters** (radio buttons, display-only — copies and exports always use
the real palette). The filters are alternate views of the same palette, so
they are mutually exclusive: the panel is a radio group with an **Off** choice
at the top, and only one filter can apply at a time.

- **Grayscale** — drops chroma at constant Oklab lightness. Each column
  collapses to a single uniform gray, which is the direct test that apparent
  luminosity is consistent across hues.
- **Protanopia / deuteranopia / tritanopia** — color vision deficiency
  simulations (Machado et al. 2009 matrices, severity 1.0, applied in linear
  RGB). Useful for checking that semantic color pairs stay distinguishable.
- **Blue light** — simulates a warm screen filter like f.lux or Night Shift:
  red passes through while green, and especially blue, are dimmed in linear
  RGB (at full intensity blue keeps 15%, green 80%). Paired with an intensity
  slider that appears when the filter is on. The UI sends at most one filter,
  but the API still accepts an array and composes multiple filters in a fixed
  order: CVD simulations, then grayscale, then blue light (the blue light
  filter is the last thing "in front of the screen").

**Preview tabs** (above the preview area):

- **Grid** — the swatch matrix, as before.
- **Wheel** — a polar view of the palette with two layouts, toggled at the
  top of the pane (a display-only preference, never persisted):
  - *By hue* — angle is each swatch's OKLCH hue and radius is its level
    (50 at the rim, 950 at the center), so each chromatic row reads as a
    spoke and hue coverage or gaps show at a glance. The faint rings are
    the fixed-lightness levels — under the grayscale filter each ring,
    like each grid column, should collapse to one uniform gray.
  - *Fixed* — the grid rolled into a circle: each chromatic row, in grid
    order, gets an equal sector, with its thirteen levels as concentric
    bands (50 at the rim, 950 at the center). Adjacent hues sit side by
    side at every level, and the arrangement never moves no matter where
    the hue sliders are.
  In both layouts the near-neutral base row — whose hue is unconstrained —
  appears as a legend ramp under the wheel instead of a wheel position.
  Click any swatch to copy its hex.
- **Gamut** — an interactive plot of the palette in OKLCH space on a canvas
  renderer (no libraries, no build step): angle is hue, radius is chroma,
  and height is Oklab lightness, with level 50 at the top of the axis.
  Chroma is drawn exaggerated relative to lightness, set by a **Chroma
  scale** slider at the top of the pane (1x–4x, default 2.2x; a display-only
  preference like the camera, never persisted). It rescales positions, never
  the plotted values: honest 1x units make the palette a tall thin spindle
  (chroma tops out near 0.4 while lightness spans almost 1.0), and higher
  values widen the scene around the center so the silhouette reads closer
  to a sphere.
  Every swatch is a dot, each chromatic row is traced by a path (the ramp's
  characteristic rise-and-fall of chroma across levels), and the faint rings
  are the per-level chroma envelope — the palette's own gamut outline, which
  collapses toward the axis under the grayscale filter. The near-neutral
  base row lands on the lightness axis, the spine the chromatic rows swing
  around. Drag to rotate, scroll to zoom, double-click empty space to reset
  the view; hover shows name-level and hex, and clicking a swatch copies its
  hex. Like the wheel's layout mode, the camera is a display-only preference
  that is never persisted. Geometry only, as everywhere in the UI: dots are
  positioned from the l/c/h values the API already returns and painted with
  the response hexes.
- **Contrast** — a WCAG AA report on realistic foreground/background
  combinations, in two groups. *Interface pairings* are the combos a UI built
  on the palette actually makes: body, heading, secondary, and disabled text
  in light and dark UIs, accent links in both modes, a button label on
  blue-600, a destructive label on red-600, and success/warning badge text.
  *Ramp pairings* are the two standard pairs every chromatic ramp must
  support: level-800 ink on its level-100 tint, and its 400 step on base-950.
  Each card renders the real ground and ink at the size class the AA tier
  assumes (body vs large text) and shows the contrast ratio plus a PASS/FAIL
  chip — 4.5:1 for body text, 3:1 for large text. The ratios are plain
  arithmetic on the server-provided WCAG luminance each swatch already
  carries (no color math in the browser), and since the pane reads the
  filtered view, contrast can be re-checked under the grayscale, CVD, and
  blue-light filters. The PASS/FAIL chips themselves use the green and red
  ramps with luminance-picked ink, so the report scores the palette with the
  palette.
- **Code** — a syntax-highlighted TypeScript sample shown in three programming
  environments, toggled at the top of the pane beside a Light/Dark theme
  toggle (display-only preferences, never persisted):
  - *Graphical* — a modern editor in the VS Code / Sublime mold: activity
    rail (one SVG icon per chromatic row at its 400 step), file sidebar with
    per-type dots, a yellow git-modified marker, tab strip with per-file
    accent underlines, breadcrumbs, a minimap strip (one bar per token in
    the token's own color), and a blue-600 status bar carrying level-50 ink.
    Token classes map one row each (keywords red-400, types cyan-400,
    functions blue-400, strings green-400, numbers orange-400, properties
    yellow-300, constants purple-300, template interpolations magenta-400,
    comments base-500) on a base-950 editor background.
  - *Terminal* — a Neovim-style TUI over the same tokenized sample: a
    cursorline with cyan-400 line number, a search match inverted onto its
    yellow-300 ground with base-950 ink, a `:Colorscheme` completion popup
    whose selected row is cyan-600 on level-50 ink, and a lualine-style
    statusline (blue-600 NORMAL block, green branch, red/yellow diagnostics).
  - *Agent* — a coding-agent chat TUI: a cyan-branded banner, Read/Plan/Edit
    tool boxes (the Read box shows a slice of the same sample), a diff whose
    deletions are red-400 on red-950 against green-400 on green-950
    additions, a green/yellow/base todo list, a yellow-bordered permission
    prompt with the green-allow / red-deny / cyan-always options, a token
    meter, and an input line — the semantic pairs (add vs delete, allow vs
    deny) an agent UI must never let blur together.
- **Notes** — an Obsidian-style note app, uniform per face under the pane's
  Light/Dark toggle (an all-light app or an all-dark one, never the mixed
  dark-sidebar/light-editor split): file sidebar with a search field and a
  cyan "New note" button, editor, tag pills in several hues, inline code
  and highlight spans, a checklist, an orange callout, wikilinks, and blue
  backlinks. A "Pairings" section renders one card per chromatic row
  showing its two standard pairings — level-800 ink on the row's level-100
  ground, and its 400 step on base-950.
- **Landing** — a landing page for a fictional company ("Kroma") that walks
  the ramps through every register a brand needs: nav, hero, a strip of the
  live cyan ramp, and feature cards on the light end; an announcement ribbon
  graded across every chromatic ramp's 600 step (a cross-hue gradient, where
  equal lightness keeps the band an even wash and the level-50 ink at one
  contrast); logo marks for every
  chromatic ramp (the 600 step solid, the 100 step tinted, ink from the
  base ramp); primary buttons from every ramp's 600 step with 700-outline
  secondaries, the base ramp's disabled pair, a red destructive action, and
  status badges (100 ground, 800 ink, 500 dot); a stacked usage chart of
  the 300/500/700 steps per ramp (a grayscale check: the three segments
  must stay three distinct grays); pricing cards with one inverted
  chromatic block; and a dark CTA band on base-950 covering the dark end.
- **Design** — the palette dropped into contemporary graphic-design
  scenarios, exercising the ramps as flat compositions rather than UI
  registers: a Swiss-style poster series (one per ramp, the 500 step as
  ground with oversized level-50 ink and a 200-step disc bleeding off the
  edge — a grayscale check, since the disc must stay lighter than its
  ground); a magazine spread on the light end of base (red kicker, cyan
  drop cap and pull quote, body copy drawn as tinted bars, and an abstract
  full-bleed "photo" plate on the facing page); gradient album art per
  ramp (the 400-to-800 span blended by CSS, so the preview shows the
  sRGB interpolation a designer would actually ship); duotones — each
  ramp blended into its wheel neighbor at the shared 500 step, a
  cross-hue gradient that crosses hue but not lightness (under the
  grayscale filter each tile should flatten to one gray, the
  equal-lightness check in reverse); geometric pattern
  tiles (disc, half disc, quarter, and bars from the 300/600/800 trio on
  a 100 ground); and a type specimen where each ramp's 300/600/900 steps
  play display-type weight classes on the lightest ground.

**Light/dark toggle**: the Code, Notes, Landing, and Design previews each
carry a Light/Dark button pair at the top of the pane (beside the Code
pane's environment group). Like the wheel layout and code environment
modes it is a display-only preference: never persisted, applied by
redrawing from the already-fetched response. The dark face is the level
complement — every level resolves to its opposite across the ramp's
midpoint (50↔950, 200↔800, 500 fixed; a bijection on all thirteen
levels) — so every authored pairing keeps its perceived-lightness gap
with the faces swapped, which is exactly the guarantee the
equal-lightness ramp exists to make. Defaults match each mock's native
face (the code environments are dark, the other three light), and copy
that names levels (the Notes pairing chips, the Landing legend, the
Design section blurbs) is generated from the resolved levels so the
labels stay honest after a toggle.

The previews re-render live from the palette being designed, so moving a
slider restyles them exactly like the grid; they also honor the view filters
(display-only, same as the grid).

**Dogfooding**: the app's own interface is themed from the palette being
designed. Backgrounds, borders, and text come from the base ramp (950 through
800, 100, 400), the accent color is cyan-400, and the armed reset button uses
red-400. Every API response carries this `theme` object, and the UI applies
it live — so moving a slider restyles the very controls you're dragging. View
filters extend the dogfooding: when one is active the theme is derived from
the filtered copy, so the whole UI (radio buttons, sliders, tabs) shows the
filtered appearance too — grayscale chrome under grayscale, a warm interface
under blue light.

## HTTP API

- `GET /api/palette` — the current state (loaded at startup and updated by
  every `POST`) plus the generated palette. Every response also carries
  `defaults`: the built-in default state (the one `POST /api/reset`
  restores), so the UI can reset a single slider client-side.
- `POST /api/palette` — JSON state body plus optional `filters` array
  (`grayscale`, `protanopia`, `deuteranopia`, `tritanopia`, `bluelight`) and
  optional `blueLight` intensity in `[0,1]` (only applies while `bluelight`
  is active; out-of-range values are clamped); returns the
  normalized state, the generated palette, and (when filters are active) a
  display-only `filtered` copy. Invalid bodies return `400`. The response's
  `theme` (the app UI's own colors) is derived from the filtered copy when
  filters are active, otherwise from the real palette.
- `POST /api/reset` — restores the built-in default state and persists it;
  returns the same response shape as above. The body is optional and may
  carry the same `filters` array and `blueLight` intensity for the
  display-only `filtered` copy, plus `activeSlot` so the defaults become the
  active slot's snapshot; anything
  else in it (including a `slots` map and a malformed body) is ignored — a
  reset must never clobber the variant being compared against.

**A/B record.** Every response carries `ab`: the active slot (`"A"` or
`"B"`) and each slot's settings snapshot (`null` when never saved). The
record is persisted in `state.json` together with the active state. A
`POST` may include `activeSlot` and a `slots` map: the active slot's
snapshot always becomes the posted state, and the other slot changes only
when the request carries a non-null snapshot for it (the swap and copy
buttons are the only such moments). Requests without these fields keep the
stored record, so plain API clients are unaffected.

State shape:

```json
{
  "minL": 0.17,
  "maxL": 0.985,
  "saturation": 1,
  "bend": 0,
  "pinch": 0,
  "pinchCenter": 0.5,
  "colors": [
    { "name": "base", "hue": 90, "chroma": 0.006 },
    { "name": "red", "hue": 30, "chroma": 0.16 }
  ]
}
```

`hue` is the OKLCH hue angle in degrees, clamped server-side to the color's
±30° window around its ideal center; `chroma` is the target OKLCH chroma
at peak lightness (chroma tapers toward the light/dark extremes so the
endpoints don't look oversaturated).

`state.json` wraps this object in an envelope:

```json
{
  "state": { "minL": 0.17, "maxL": 0.985, "saturation": 1, "bend": 0, "pinch": 0, "pinchCenter": 0.5, "colors": [] },
  "ab": { "active": "A", "slots": { "A": { "…": "the state shape above" }, "B": null } }
}
```

## Layout

```
main.go                    HTTP server; embeds static/
internal/color/oklab.go    Oklab/OKLCH <-> sRGB, hex output, gamut fitting
internal/palette/          State model and palette generation
static/                    UI (no build step, no dependencies)
static/js/                 UI logic as ES modules: app.js is the entry point
                           (load + event wiring), store.js holds the shared
                           mutable state, and each concern — grid, tabs,
                           theme, controls, API calls, A/B slots, exports —
                           has its own module, with one file per preview tab
                           under static/js/preview/
```
