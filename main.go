// Command cola serves a web-based UI palette designer. All color math runs
// server-side; the browser only renders the returned swatches.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"slices"
	"sync"
	"syscall"
	"time"

	"cola/internal/palette"
)

//go:embed static
var staticFiles embed.FS

// paletteRequest is the POST body: the palette state plus view filters.
// The embedded State keeps the previous flat JSON shape working.
type paletteRequest struct {
	palette.State
	// Filters are view filters (grayscale, color-blindness simulations).
	// They affect only the "filtered" copy in the response, never the real
	// palette used for exports.
	Filters []string `json:"filters"`
	// BlueLight is the blue light filter intensity in [0,1]; it only applies
	// while "bluelight" is in Filters. Like other view filters it is
	// display-only and never persisted.
	BlueLight float64 `json:"blueLight"`
}

// paletteResponse is the JSON body for both GET (defaults) and POST
// (custom state) on /api/palette. The state is echoed back after
// normalization so the UI can sync to server-side clamping.
type paletteResponse struct {
	State   palette.State   `json:"state"`
	Palette palette.Palette `json:"palette"`
	// Filtered is the palette as seen through the requested view filters,
	// omitted when none are active. Display only — exports must use Palette.
	Filtered *palette.Palette `json:"filtered,omitempty"`
	// Theme is the app UI's own color scheme, dogfooded from the palette
	// being designed. When view filters are active it is derived from the
	// filtered copy so the UI itself displays the filtered appearance.
	Theme *palette.Theme `json:"theme,omitempty"`
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode response: %v", err)
	}
}

// server carries the loaded palette state and the persistence store.
type server struct {
	// mu guards base: handlers run concurrently, and POSTs and resets
	// replace the base while other requests are seeding from it.
	mu sync.RWMutex
	// base is the current state: it seeds GET responses and fills in any
	// fields a partial POST leaves out.
	base  palette.State
	store *stateStore
}

// currentBase returns a copy of the base state that shares no slice with
// the stored one, so callers can decode requests into it safely.
func (s *server) currentBase() palette.State {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneState(s.base)
}

func (s *server) setBase(st palette.State) {
	s.mu.Lock()
	s.base = st
	s.mu.Unlock()
}

// buildResponse renders a normalized state (plus optional view filters) as
// the API payload shared by the palette and reset handlers.
func buildResponse(st palette.State, filterNames []string, opts palette.FilterOptions) paletteResponse {
	resp := paletteResponse{State: st, Palette: palette.Generate(st)}
	// Only recognized filters produce a filtered copy; unknown names in the
	// list are dropped rather than erroring.
	if active := slices.DeleteFunc(slices.Clone(filterNames), func(f string) bool { return !palette.IsFilter(f) }); len(active) > 0 {
		filtered := palette.ApplyFilters(resp.Palette, active, opts)
		resp.Filtered = &filtered
		// Dogfooding extends to the view filters: when one is active, the
		// UI's own theme comes from the filtered palette so the app chrome
		// itself shows the filtered appearance (grayscale UI under
		// grayscale, warm UI under blue light).
		resp.Theme = filtered.Theme()
		return resp
	}
	resp.Theme = resp.Palette.Theme()
	return resp
}

// cloneState returns a copy of st that shares no slice with the original.
// json.Unmarshal reuses a slice's backing array when decoding, so requests
// must never be seeded with slices the server also keeps — the request
// would silently overwrite the stored state in place.
func cloneState(st palette.State) palette.State {
	st.Colors = append([]palette.ColorSpec(nil), st.Colors...)
	return st
}

func (s *server) handlePalette(w http.ResponseWriter, r *http.Request) {
	// Snapshot the base once per request: fetching it again below would let
	// a concurrent reset splice new-base colors into old-base scalars.
	base := s.currentBase()
	req := paletteRequest{State: base}
	if r.Method == http.MethodPost {
		// Guard against unbounded request bodies on localhost.
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			http.Error(w, "read body: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, "invalid state JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	// A POST with no colors (null, missing, or an empty array) falls back to
	// the current colors so the grid never renders empty rows. base.Colors is
	// already a private clone (currentBase), so the state handed to the store
	// never aliases the server's stored slice.
	st := req.State.Normalized()
	if len(st.Colors) == 0 {
		st.Colors = base.Colors
	}
	if r.Method == http.MethodPost {
		// The normalized state becomes the new base so a later GET (a
		// browser refresh) and any partial POST seed from the latest
		// palette rather than the one loaded at startup. st shares no
		// slice with the previous base (see currentBase/cloneState), so
		// the swap is safe without further copying.
		s.setBase(st)
		// Remember the palette settings across restarts. View filters are
		// deliberately not part of State and so are never persisted. The
		// store debounces the disk write.
		s.store.save(st)
	}
	writeJSON(w, buildResponse(st, req.Filters, palette.FilterOptions{BlueLight: req.BlueLight}))
}

// handleReset restores the built-in defaults atomically and persists them.
// The optional body may carry view filters (same names as /api/palette) so
// the response matches what the client is looking at; anything else in it
// is ignored, and a missing or malformed body is fine too — resetting
// should never fail on account of the body.
func (s *server) handleReset(w http.ResponseWriter, r *http.Request) {
	var req paletteRequest
	if body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)); err == nil {
		_ = json.Unmarshal(body, &req)
	}
	st := palette.DefaultState().Normalized()
	s.setBase(st)
	s.store.save(st)
	writeJSON(w, buildResponse(st, req.Filters, palette.FilterOptions{BlueLight: req.BlueLight}))
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8443", "listen address")
	certFile := flag.String("cert", "certs/localhost.crt", "TLS certificate file (self-signed pair is generated when missing)")
	keyFile := flag.String("key", "certs/localhost.key", "TLS private key file (self-signed pair is generated when missing)")
	plainHTTP := flag.Bool("http", false, "serve plain HTTP instead of HTTPS (self-signed certs annoy browsers, but scripts don't mind)")
	stateFile := flag.String("state", "state.json", "palette state file to persist between runs")
	flag.Parse()

	// Load the remembered state, falling back to defaults for a missing or
	// corrupt file rather than refusing to start.
	loaded, err := loadState(*stateFile)
	if err != nil {
		log.Printf("state file %s: %v; starting from defaults", *stateFile, err)
		loaded = palette.DefaultState()
	}
	base := loaded.Normalized()
	srv := &server{base: base, store: newStateStore(*stateFile, base)}

	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/palette", srv.handlePalette)
	mux.HandleFunc("POST /api/palette", srv.handlePalette)
	mux.HandleFunc("POST /api/reset", srv.handleReset)
	mux.Handle("/", http.FileServer(http.FS(staticFS)))

	// ReadHeaderTimeout bounds how long a stalled connection may hold the
	// server in header parsing; there is no deadline on the body so slow
	// local requests still complete.
	httpSrv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}

	// On Ctrl-C/SIGTERM, stop accepting requests and flush the pending
	// state so the write debounce can't lose the last tweak.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	// flushed closes once shutdown has fully finished, so main can wait for
	// the final state write before the process exits.
	flushed := make(chan struct{})
	go func() {
		defer close(flushed)
		<-ctx.Done()
		log.Println("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shutdownCtx)
		// Shutdown only returns once in-flight handlers are done, so the
		// flush must happen here, after it: ListenAndServe has already
		// returned by this point, and a handler that saved after an
		// earlier flush would arm a debounce timer the process never
		// waits for — silently losing that tweak.
		if err := srv.store.flushNow(); err != nil {
			log.Printf("flush state: %v", err)
		}
	}()

	var serveErr error
	if *plainHTTP {
		log.Printf("cola palette designer listening on http://%s", *addr)
		serveErr = httpSrv.ListenAndServe()
	} else {
		if err := ensureCert(*certFile, *keyFile); err != nil {
			log.Fatal(err)
		}
		log.Printf("cola palette designer listening on https://%s", *addr)
		log.Printf("(self-signed certificate at %s; browsers warn until you trust it — see README)", *certFile)
		serveErr = httpSrv.ListenAndServeTLS(*certFile, *keyFile)
	}
	if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
		log.Fatal(serveErr)
	}
	// ErrServerClosed means Shutdown was triggered, which only happens
	// after ctx.Done, so this wait always completes; it can't deadlock.
	<-flushed
}
