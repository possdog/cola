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
change, flushed on Ctrl-C, and loaded on the next start. View filters are
deliberately not persisted. A missing or corrupt state file falls back to
the default palette.

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
- **Saturation** — global chroma multiplier.
- **Per-color hue and chroma** — precise OKLCH values for each of the nine
  rows. Each chromatic color's hue is limited to ±30° around its ideal OKLCH
  center, so red stays recognizably red. (Oklab hue differs from HSL: hue 0
  is pink, and sRGB red sits at ~30°.) The near-neutral base row is
  unconstrained.

Click any swatch to copy its hex. The header buttons copy the whole palette
as CSS custom properties (`--base-50: ...`) or JSON. **A/B** (next to the
copy buttons) is a three-segment A | → | B control for comparing two
variants of the settings: click the inactive half to save the current
settings into the active slot and load the other, so clicking back and
forth flips between the two. The middle arrow copies the active slot's
settings into the other without switching; it points in the copy
direction — useful for making both slots identical before diverging
one, or for discarding the other variant. Slots are page-local — the
server keeps persisting
only the active palette — and switching to the still-empty slot seeds it
with the current settings, so the first toggle changes nothing by itself.
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
- **Code** — a syntax-highlighted TypeScript sample in a mock editor. Token
  classes map to palette rows (keywords red-400, types cyan-400, functions
  blue-400, strings green-400, numbers orange-400, properties yellow-300,
  comments base-500) on a base-950 editor background.
- **Notes** — an Obsidian-style note app: dark file sidebar, light editor,
  tag pills, wikilinks, and a checklist.
- **Branding** — a landing page for a fictional company ("Kroma"), covering
  the light end of the ramps: nav, hero, a strip of the live cyan ramp, and
  feature cards.

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
  every `POST`) plus the generated palette.
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
  display-only `filtered` copy; anything
  else in it (including a malformed body) is ignored.

State shape:

```json
{
  "minL": 0.17,
  "maxL": 0.985,
  "saturation": 1,
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

## Layout

```
main.go                    HTTP server; embeds static/
internal/color/oklab.go    Oklab/OKLCH <-> sRGB, hex output, gamut fitting
internal/palette/          State model and palette generation
static/                    UI (no build step, no dependencies)
```
