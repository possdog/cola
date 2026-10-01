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
	// ActiveSlot is the A/B slot the client is working in ("A" or "B").
	// Together with Slots it lets the server persist both comparison
	// variants; a request without it keeps the stored active slot.
	ActiveSlot string `json:"activeSlot"`
	// Slots carries the client's A/B snapshots. Only the inactive slot's
	// entry is read — the active slot is always the posted state itself,
	// which cannot be staler than the palette it just produced.
	Slots *abSnapshot `json:"slots"`
}

// paletteResponse is the JSON body for both GET (defaults) and POST
// (custom state) on /api/palette. The state is echoed back after
// normalization so the UI can sync to server-side clamping.
type paletteResponse struct {
	State   palette.State   `json:"state"`
	Palette palette.Palette `json:"palette"`
	// AB is the A/B comparison record (active slot plus both snapshots), so
	// a reload restores both variants, not just the active palette.
	AB abState `json:"ab"`
	// Filtered is the palette as seen through the requested view filters,
	// omitted when none are active. Display only — exports must use Palette.
	Filtered *palette.Palette `json:"filtered,omitempty"`
	// Theme is the app UI's own color scheme, dogfooded from the palette
	// being designed. When view filters are active it is derived from the
	// filtered copy so the UI itself displays the filtered appearance.
	Theme *palette.Theme `json:"theme,omitempty"`
	// Defaults is the built-in default state, the same one /api/reset
	// restores. The UI carries it so a double-click on any slider can snap
	// just that one value back to its default without a reset round trip.
	Defaults palette.State `json:"defaults"`
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
	base palette.State
	// ab is the A/B comparison record. Its active slot's snapshot always
	// equals base (commit maintains that), so the two never contradict.
	ab    abState
	store *stateStore
}

// snapshot returns the base state and the A/B record under one lock, so a
// response can never mix two generations of a concurrent update. The state
// copy shares no slice with the stored one, so callers can decode requests
// into it safely; the record copy is shallow, which is safe because slot
// snapshots are only ever replaced, never mutated in place.
func (s *server) snapshot() (palette.State, abState) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneState(s.base), s.ab
}

// commit installs a new base state with its matching A/B record and hands
// both to the persistence store, all under one lock acquisition. Locking
// per step instead would let a concurrent request interleave — its base
// could land between this request's base swap and record update — leaving
// the active slot's snapshot contradicting the stored base (the invariant
// the ab field documents) and persisting a torn pair.
func (s *server) commit(req paletteRequest, st palette.State) abState {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.base = st
	ab := s.updateABLocked(req, st)
	s.store.save(st, ab)
	return ab
}

// updateABLocked merges a request's A/B fields into the stored record and
// returns it. The active slot's snapshot becomes the freshly posted state (it
// cannot be staler than the palette itself); the other slot changes only when
// the request carries a snapshot for it — swap and copy are the only such
// moments. A request without a valid activeSlot keeps the stored active
// slot, so plain state posts from older clients still refresh the record.
// Callers must hold s.mu.
func (s *server) updateABLocked(req paletteRequest, active palette.State) abState {
	slot := req.ActiveSlot
	if slot != "A" && slot != "B" {
		slot = s.ab.Active
		if slot != "A" && slot != "B" {
			slot = "A"
		}
	}
	other := "B"
	if slot == "B" {
		other = "A"
	}
	// The other slot keeps its stored snapshot unless the request carries
	// one; cleanSlot normalizes into a private deep copy or drops an
	// entryless snapshot, so the stored record never aliases the request.
	otherSnap := s.ab.Slots.get(other)
	if req.Slots != nil && req.Slots.get(other) != nil {
		otherSnap = req.Slots.get(other)
	}
	ab := abState{Active: slot}
	ab.Slots.set(slot, cleanSlot(&active))
	ab.Slots.set(other, cleanSlot(otherSnap))
	s.ab = ab
	return ab
}

// buildResponse renders a normalized state (plus optional view filters and
// the A/B record) as the API payload shared by the palette and reset
// handlers.
func buildResponse(st palette.State, ab abState, filterNames []string, opts palette.FilterOptions) paletteResponse {
	resp := paletteResponse{State: st, AB: ab, Palette: palette.Generate(st), Defaults: palette.DefaultState().Normalized()}
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
	// Snapshot the base and record once per request: fetching them again
	// below would let a concurrent update splice new-base colors into
	// old-base scalars.
	base, baseAB := s.snapshot()
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
	// already a private clone (see snapshot/cloneState), so the state handed
	// to the store never aliases the server's stored slice.
	st := req.State.Normalized()
	if len(st.Colors) == 0 {
		st.Colors = base.Colors
	}
	if r.Method == http.MethodPost {
		// The normalized state becomes the new base so a later GET (a
		// browser refresh) and any partial POST seed from the latest
		// palette rather than the one loaded at startup, and the A/B
		// record plus the debounced disk write follow it in the same
		// atomic step (see commit). View filters are deliberately not
		// part of State and so are never persisted.
		ab := s.commit(req, st)
		writeJSON(w, buildResponse(st, ab, req.Filters, palette.FilterOptions{BlueLight: req.BlueLight}))
		return
	}
	writeJSON(w, buildResponse(st, baseAB, req.Filters, palette.FilterOptions{BlueLight: req.BlueLight}))
}

// handleReset restores the built-in defaults atomically and persists them.
// The optional body may carry view filters (same names as /api/palette) and
// activeSlot, so the response matches what the client is looking at and the
// reset defaults become the active slot's snapshot; anything else in it —
// including a slots map, which must never let a reset clobber the variant
// being compared against — is ignored, and a missing or malformed body is
// fine too: resetting should never fail on account of the body.
func (s *server) handleReset(w http.ResponseWriter, r *http.Request) {
	var req paletteRequest
	if body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)); err == nil {
		_ = json.Unmarshal(body, &req)
	}
	req.Slots = nil
	st := palette.DefaultState().Normalized()
	ab := s.commit(req, st)
	writeJSON(w, buildResponse(st, ab, req.Filters, palette.FilterOptions{BlueLight: req.BlueLight}))
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
		loaded = defaultPersistedState()
	}
	base := loaded.State.Normalized()
	srv := &server{base: base, ab: loaded.AB, store: newStateStore(*stateFile, loaded)}

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
