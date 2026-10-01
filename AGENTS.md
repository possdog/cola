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
- View filters (grayscale, CVD, blue light) are display-only: they affect
  only the `filtered` response copy, never the real palette or exports, and
  are never persisted.
- Dogfooding: every API response carries a `theme` derived from the current
  palette; the UI is styled from it live. When changing response shapes,
  check `static/js/` consumers (swatch.js and the preview modules read the
  response most closely).
- Go doc comments in this codebase explain the *why* behind non-obvious
  logic (see `persist.go`, `main.go` for the house style). Match it.
- New handlers get tests in `handler_test.go`; test the JSON contract, not
  just Go values.

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
