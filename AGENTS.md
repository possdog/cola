# AGENTS.md

This file guides AI coding agents working in this repository.

## Project overview

Cola is a web-based designer for Flexoki-style color palettes: nine colors at
thirteen Oklab lightness levels, computed server-side in OKLCH. Single Go
module (`cola`, Go 1.27.1, zero external dependencies); the browser only
renders what the API returns. `README.md` documents the color model, API, and
UI behavior in depth — read it before changing anything color-related.

## Commands (all verified)

```sh
go vet ./...                      # must be clean
gofmt -l .                        # must print nothing
go test ./...                     # full suite, ~1s, fully self-contained
go test ./internal/palette -run TestGenerate -count=1   # single test subset
go run .                          # serve HTTPS on https://127.0.0.1:8443
go run . -http -addr 127.0.0.1:9000   # plain HTTP, for curl/scripting
```

Run `go vet` and `gofmt -w` before considering any Go change done. Tests
need no fixtures, containers, or network.

## Repository layout

```
main.go, handler_test.go   HTTP handlers, request/response shapes, shutdown
persist.go                  debounced, atomic state.json persistence
tls.go                      self-signed localhost certificate generation
internal/color              Oklab/OKLCH <-> sRGB, gamut fitting
internal/palette            state model, palette generation, view filters, theme
static/                     UI (vanilla JS/CSS, no build step, embedded via go:embed)
static/js/                  ES modules: app.js (entry + wiring), store.js (shared
                            mutable state), one module per concern; one file per
                            preview tab plus shared preview helpers (scheme.js)
                            under static/js/preview/
```

## Conventions

- All color math is server-side. The frontend never computes colors; it
  fetches `/api/palette` and renders. Keep it that way.
- Dogfooding: every API response carries a `theme` derived from the current
  palette; the API-facing mapping stays server-side, while the UI styles
  itself from the fetched view through the global light/dark scheme
  (`theme.js`). When changing response shapes,
  check `static/js/` consumers (swatch.js and the preview modules read the
  response most closely).
- Go doc comments in this codebase explain the *why* behind non-obvious
  logic (see `persist.go`, `main.go` for the house style). Match it.
- New handlers get tests in `handler_test.go`; test the JSON contract, not
  just Go values.

## Behavior invariants

Guarantees the UI and API currently make. Preserve them when touching the
relevant code; `README.md` documents the user-facing behavior in depth.

- Palette state and the A/B record are the only persisted things. Every
  other preference (wheel layout, gamut camera and chroma scale, code
  environment, the global light/dark scheme) is display-only: never
  persisted, never posted. Blue-light intensity is posted per request but
  is not part of the state.
- View filters affect only the `filtered` response copy — never the real
  palette, exports, or the persisted state. Multiple filters compose in a
  fixed server-side order: CVD simulations, then grayscale, then blue light.
  The UI sends at most one; the API accepts the array. When filters are
  active, `theme` is derived from the `filtered` copy, not the real palette.
- Every response carries `defaults` (the state `POST /api/reset` restores)
  and `ab` (the A/B record), so single-slider reset and the slot UI work
  client-side. A `POST`'s `activeSlot`/`slots` fields update the record;
  requests without them keep the stored record. `POST /api/reset` must
  never clobber the inactive slot: anything in its body besides `filters`,
  `blueLight`, and `activeSlot` is ignored.
- Per-color hue is clamped server-side to ±30° around each chromatic
  color's ideal OKLCH center; the near-neutral base row is unconstrained.
  Keep the clamp server-side.
- `state.json` wraps state in an envelope (`state` + `ab`). A bare legacy
  state object (files written before the A/B feature) still loads and
  counts as slot A; a missing or corrupt file falls back to the default
  palette.
- Preview panes re-render by swapping their markup wholesale. Render
  through `setPaneHTML` in `static/js/util.js`: it snapshots and replays
  the scroll offsets of the pane and any scrolled descendant, so a
  re-render never scrolls the preview out from under the user.
- The light/dark toggle is one global setting (header pill), not per-pane:
  it flips the app chrome and the Code, Notes, Landing, and Design previews
  together by mapping every level to its complement (50↔950, 500 fixed).
  Each surface keeps its own native face, so a mock is complemented only
  when the global scheme is not its own. Copy that names levels (pairing
  chips, legends, blurbs) must be generated from the resolved levels, not
  the authored ones, so labels stay correct after a toggle.

## Dangerous operations and boundaries

- **Never commit or edit** `certs/` (generated TLS pair, contains a private
  key) or `state.json` (runtime-persisted settings). Both are gitignored
  runtime artifacts.
- The server binds to localhost by default; don't widen the default address.
- POST bodies are capped at 1 MiB (`io.LimitReader`); preserve that guard
  when touching handlers.

## Maintenance

If this file contradicts reality, fix the file. Update it when commands,
structure, or policy change.
