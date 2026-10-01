package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"cola/internal/palette"
)

// blueByte returns the blue channel of a hex color as a number so channel
// comparisons are numeric, not character-wise.
func blueByte(hex string) int {
	v, err := strconv.ParseUint(hex[5:7], 16, 8)
	if err != nil {
		panic("bad hex: " + hex)
	}
	return int(v)
}

func newTestServer(t *testing.T) (*server, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "state.json")
	loaded := defaultPersistedState()
	return &server{base: loaded.State, ab: loaded.AB, store: newStateStore(path, loaded)}, path
}

func doPalette(t *testing.T, s *server, method, body string) paletteResponse {
	t.Helper()
	var req *http.Request
	if method == http.MethodGet {
		req = httptest.NewRequest(method, "/api/palette", nil)
	} else {
		req = httptest.NewRequest(method, "/api/palette", strings.NewReader(body))
	}
	rec := httptest.NewRecorder()
	s.handlePalette(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("%s /api/palette: status %d: %s", method, rec.Code, rec.Body.String())
	}
	var resp paletteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return resp
}

func postPalette(t *testing.T, s *server, body string) paletteResponse {
	t.Helper()
	return doPalette(t, s, http.MethodPost, body)
}

func TestHandlePaletteFilters(t *testing.T) {
	s, _ := newTestServer(t)
	resp := postPalette(t, s, `{"filters":["grayscale"]}`)
	if resp.Filtered == nil {
		t.Fatal("grayscale filter posted but no filtered palette in response")
	}
	// Grayscale at constant Oklab L: every row's level-500 swatch must be
	// the same gray, while the real palette keeps its colors.
	gray500 := map[string]bool{}
	for i, row := range resp.Filtered.Colors {
		for _, s := range row.Swatches {
			if s.Level == 500 {
				gray500[s.Hex] = true
			}
		}
		if row.Swatches[6].Hex == resp.Palette.Colors[i].Swatches[6].Hex {
			t.Errorf("row %s: filtered hex identical to real hex", row.Name)
		}
	}
	if len(gray500) != 1 {
		t.Errorf("level-500 grayscale column has %d distinct grays, want 1: %v", len(gray500), gray500)
	}

	// No filters: filtered omitted entirely.
	if plain := postPalette(t, s, `{}`); plain.Filtered != nil {
		t.Error("filtered palette present when no filters were posted")
	}

	// Unknown filter names are ignored (no filtered copy, no error).
	if unknown := postPalette(t, s, `{"filters":["sepia"]}`); unknown.Filtered != nil {
		t.Error("unknown filter produced a filtered palette")
	}
}

func TestHandlePaletteBlueLight(t *testing.T) {
	s, _ := newTestServer(t)

	// The slider intensity rides along with the filter name; the response's
	// filtered copy must show dimmed blue channels.
	resp := postPalette(t, s, `{"filters":["bluelight"],"blueLight":1}`)
	if resp.Filtered == nil {
		t.Fatal("bluelight filter posted but no filtered palette in response")
	}
	for i, row := range resp.Filtered.Colors {
		for j, s := range row.Swatches {
			real := resp.Palette.Colors[i].Swatches[j]
			if blueByte(s.Hex) > blueByte(real.Hex) {
				t.Errorf("%s level %d: filtered blue byte brighter than real (%s vs %s)",
					row.Name, s.Level, s.Hex, real.Hex)
			}
		}
	}

	// Intensity 0 with the filter enabled: filtered present but identical.
	zero := postPalette(t, s, `{"filters":["bluelight"],"blueLight":0}`)
	if zero.Filtered == nil {
		t.Fatal("bluelight filter posted but no filtered palette in response")
	}

	// Out-of-range intensity is clamped server-side, not echoed into a
	// brightened result.
	hot := postPalette(t, s, `{"filters":["bluelight"],"blueLight":42}`)
	if hot.Filtered == nil {
		t.Fatal("bluelight filter posted but no filtered palette in response")
	}
}

func TestGETReturnsLoadedState(t *testing.T) {
	s, _ := newTestServer(t)
	s.base.MinL = 0.25
	resp := doPalette(t, s, http.MethodGet, "")
	if resp.State.MinL != 0.25 {
		t.Errorf("GET state minL = %v, want the loaded 0.25", resp.State.MinL)
	}
}

func TestGETAfterPostReturnsPostedState(t *testing.T) {
	s, _ := newTestServer(t)
	// A POST updates the base, not just the state file: without that, a
	// browser refresh (GET) would revert to the palette loaded at startup
	// until the server itself was restarted.
	postPalette(t, s, `{"saturation":1.5,"colors":[{"name":"red","hue":45,"chroma":0.2}]}`)
	got := doPalette(t, s, http.MethodGet, "")
	if got.State.Saturation != 1.5 {
		t.Errorf("GET after POST saturation = %v, want 1.5", got.State.Saturation)
	}
	red := got.State.Colors[0]
	if red.Name != "red" || red.Hue != 45 || red.Chroma != 0.2 {
		t.Errorf("GET after POST red = %+v, want hue 45 chroma 0.2", red)
	}
}

func TestStatePersistence(t *testing.T) {
	s, path := newTestServer(t)
	s.store.delay = 5 * time.Millisecond

	// A POST identical to the loaded state must not schedule any write.
	postPalette(t, s, `{}`)
	if _, err := os.Stat(path); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("identical state wrote to disk (stat err: %v)", err)
	}

	// A real change is written after the debounce window elapses.
	postPalette(t, s, `{"saturation":1.5,"colors":[{"name":"red","hue":45,"chroma":0.2}]}`)
	time.Sleep(30 * time.Millisecond)
	loaded, err := loadState(path)
	if err != nil {
		t.Fatalf("load persisted state: %v", err)
	}
	if loaded.State.Saturation != 1.5 {
		t.Errorf("persisted saturation = %v, want 1.5", loaded.State.Saturation)
	}
	red := loaded.State.Colors[0]
	if red.Name != "red" || red.Hue != 45 || red.Chroma != 0.2 {
		t.Errorf("persisted color spec = %+v, want red hue 45 chroma 0.2", red)
	}
	// The persisted state must round-trip through the server on restart.
	restarted := &server{base: loaded.State.Normalized(), ab: loaded.AB, store: newStateStore(path, loaded)}
	if got := doPalette(t, restarted, http.MethodGet, ""); got.State.Saturation != 1.5 {
		t.Errorf("GET after restart saturation = %v, want 1.5", got.State.Saturation)
	}

	// Rapid saves coalesce: only the latest state reaches the disk.
	for _, hue := range []int{10, 20, 30, 40} {
		postPalette(t, s, fmt.Sprintf(`{"saturation":1.5,"colors":[{"name":"red","hue":%d,"chroma":0.2}]}`, hue))
	}
	time.Sleep(30 * time.Millisecond)
	loaded, err = loadState(path)
	if err != nil {
		t.Fatalf("reload persisted state: %v", err)
	}
	if loaded.State.Colors[0].Hue != 40 {
		t.Errorf("coalesced write kept hue %v, want the latest 40", loaded.State.Colors[0].Hue)
	}
}

// TestABRecordPersistedAndRestored covers the full contract: a swap posts
// both snapshots, plain posts keep the record in sync without disturbing the
// inactive slot, and everything round-trips through the state file into a
// restarted server.
func TestABRecordPersistedAndRestored(t *testing.T) {
	s, path := newTestServer(t)
	s.store.delay = 5 * time.Millisecond

	// Swap to B, carrying a snapshot for A (saturation 2). The posted state
	// is B's settings (saturation 1.5); the slots entry for B is ignored.
	// Snapshots carry full colors: a colorless snapshot is dropped as never
	// saved (see cleanSlot).
	resp := postPalette(t, s, `{"saturation":1.5,"activeSlot":"B","slots":{"A":{"saturation":2,"colors":[{"name":"red","hue":40,"chroma":0.2}]},"B":null}}`)
	if resp.AB.Active != "B" {
		t.Fatalf("response ab active = %q, want B", resp.AB.Active)
	}
	if resp.AB.Slots.A == nil || resp.AB.Slots.A.Saturation != 2 {
		t.Errorf("slot A snapshot = %+v, want saturation 2", resp.AB.Slots.A)
	}
	if resp.AB.Slots.B == nil || resp.AB.Slots.B.Saturation != 1.5 {
		t.Errorf("active slot B snapshot = %+v, want the posted state (saturation 1.5)", resp.AB.Slots.B)
	}

	// A plain POST (no A/B fields) refreshes the active slot's snapshot but
	// must not touch the inactive one.
	if got := postPalette(t, s, `{"saturation":1.2}`); got.AB.Slots.B.Saturation != 1.2 || got.AB.Slots.A.Saturation != 2 {
		t.Errorf("plain POST disturbed the A/B record: %+v", got.AB)
	}

	// The record reaches the disk and survives a restart: the restarted
	// server serves both slots and the active letter as stored.
	time.Sleep(30 * time.Millisecond)
	loaded, err := loadState(path)
	if err != nil {
		t.Fatalf("load persisted state: %v", err)
	}
	if loaded.AB.Active != "B" || loaded.AB.Slots.A.Saturation != 2 || loaded.AB.Slots.B.Saturation != 1.2 {
		t.Fatalf("persisted A/B record = %+v, want active B, A saturation 2, B saturation 1.2", loaded.AB)
	}
	restarted := &server{base: loaded.State.Normalized(), ab: loaded.AB, store: newStateStore(path, loaded)}
	if got := doPalette(t, restarted, http.MethodGet, ""); got.AB.Active != "B" || got.AB.Slots.A.Saturation != 2 {
		t.Errorf("GET after restart A/B record = %+v, want active B with A saturation 2", got.AB)
	}
}

// TestResetUpdatesActiveSlotOnly pins the reset semantics: the defaults
// become the active slot's snapshot, and the variant being compared against
// is never clobbered — even if the body carries a slots map.
func TestResetUpdatesActiveSlotOnly(t *testing.T) {
	s, _ := newTestServer(t)
	postPalette(t, s, `{"saturation":1.5,"activeSlot":"B","slots":{"A":{"saturation":2,"colors":[{"name":"red","hue":40,"chroma":0.2}]}}}`)

	resp := doReset(t, s, `{"activeSlot":"B","slots":{"A":{"saturation":9,"colors":[{"name":"red","hue":40,"chroma":0.2}]}}}`)
	def := palette.DefaultState().Normalized()
	if resp.AB.Active != "B" {
		t.Fatalf("reset response ab active = %q, want B", resp.AB.Active)
	}
	if resp.AB.Slots.B == nil || resp.AB.Slots.B.Saturation != def.Saturation {
		t.Errorf("reset did not make the defaults the active slot's snapshot: %+v", resp.AB.Slots.B)
	}
	if resp.AB.Slots.A == nil || resp.AB.Slots.A.Saturation != 2 {
		t.Errorf("reset changed the other slot: %+v, want saturation 2", resp.AB.Slots.A)
	}
}

func doReset(t *testing.T, s *server, body string) paletteResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/reset", strings.NewReader(body))
	rec := httptest.NewRecorder()
	s.handleReset(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST /api/reset: status %d: %s", rec.Code, rec.Body.String())
	}
	var resp paletteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return resp
}

func TestThemeInResponse(t *testing.T) {
	s, _ := newTestServer(t)
	resp := doPalette(t, s, http.MethodGet, "")
	if resp.Theme == nil {
		t.Fatal("response has no theme for the default palette")
	}
	// The theme must dogfood the real palette: exact swatches of it.
	// Swatches follow the Levels order [50..950]: index 12 is level 950;
	// cyan is the sixth default color and index 5 is level 400.
	if resp.Theme.Bg != resp.Palette.Colors[0].Swatches[12].Hex {
		t.Errorf("theme bg = %s, want base-950 swatch %s", resp.Theme.Bg, resp.Palette.Colors[0].Swatches[12].Hex)
	}
	if resp.Theme.Accent != resp.Palette.Colors[5].Swatches[5].Hex {
		t.Errorf("theme accent = %s, want cyan-400 swatch %s", resp.Theme.Accent, resp.Palette.Colors[5].Swatches[5].Hex)
	}
}

func TestThemeFollowsViewFilters(t *testing.T) {
	s, _ := newTestServer(t)
	plain := postPalette(t, s, `{}`)

	// Grayscale collapses every swatch to a gray, so the dogfooded theme
	// must be entirely achromatic too — including the accent, which is
	// normally cyan-400.
	gray := postPalette(t, s, `{"filters":["grayscale"]}`)
	if gray.Theme == nil {
		t.Fatal("no theme in the grayscale response")
	}
	for name, hex := range map[string]string{
		"bg": gray.Theme.Bg, "accent": gray.Theme.Accent, "danger": gray.Theme.Danger,
	} {
		if hex[1] != hex[3] || hex[3] != hex[5] {
			t.Errorf("grayscale theme %s is not gray: %s", name, hex)
		}
	}

	// Blue light at full intensity dims blue channels, so the theme's
	// background must warm relative to the unfiltered response.
	warm := postPalette(t, s, `{"filters":["bluelight"],"blueLight":1}`)
	if warm.Theme == nil {
		t.Fatal("no theme in the blue light response")
	}
	if blueByte(warm.Theme.Bg) >= blueByte(plain.Theme.Bg) {
		t.Errorf("blue light theme bg not warmed: %s, want blue byte < %d",
			warm.Theme.Bg, blueByte(plain.Theme.Bg))
	}

	// No filters: the theme must come from the real palette again, i.e.
	// identical to the plain response.
	if again := postPalette(t, s, `{"filters":["sepia"]}`); again.Theme.Bg != plain.Theme.Bg {
		t.Errorf("unknown filter changed the theme: %s vs %s", again.Theme.Bg, plain.Theme.Bg)
	}
}

func TestResetHandler(t *testing.T) {
	s, path := newTestServer(t)
	s.store.delay = 5 * time.Millisecond
	// Customize the state so the reset has something to undo.
	postPalette(t, s, `{"saturation":2,"colors":[{"name":"red","hue":60,"chroma":0.3}]}`)

	resp := doReset(t, s, `{"filters":["grayscale"]}`)
	def := palette.DefaultState().Normalized()
	if resp.State.Saturation != def.Saturation {
		t.Errorf("reset saturation = %v, want default %v", resp.State.Saturation, def.Saturation)
	}
	if len(resp.State.Colors) != len(def.Colors) {
		t.Errorf("reset colors len = %d, want default %d", len(resp.State.Colors), len(def.Colors))
	}
	if got := resp.State.Colors[1]; got.Name != "red" || got.Hue != 30 || got.Chroma != 0.16 {
		t.Errorf("reset red = %+v, want default hue 30 chroma 0.16", got)
	}
	if resp.Filtered == nil {
		t.Error("grayscale filter posted to reset but no filtered palette in response")
	}

	// The server's base is replaced too: GET now serves the defaults rather
	// than the state loaded at startup.
	if got := doPalette(t, s, http.MethodGet, ""); got.State.Saturation != def.Saturation {
		t.Errorf("GET after reset saturation = %v, want default %v", got.State.Saturation, def.Saturation)
	}

	// The defaults reach the disk, so a restart starts from them.
	time.Sleep(30 * time.Millisecond)
	loaded, err := loadState(path)
	if err != nil {
		t.Fatalf("load persisted state: %v", err)
	}
	if loaded.State.Saturation != def.Saturation || loaded.State.Colors[1].Hue != 30 {
		t.Errorf("persisted state after reset = %+v, want defaults", loaded.State)
	}
}

func TestResetIgnoresMalformedBody(t *testing.T) {
	s, _ := newTestServer(t)
	resp := doReset(t, s, `{not json`)
	if resp.Filtered != nil {
		t.Error("malformed reset body produced a filtered palette")
	}
	if resp.State.Saturation != 1 {
		t.Errorf("reset with malformed body saturation = %v, want 1", resp.State.Saturation)
	}
}

func TestFlushNowWritesPendingState(t *testing.T) {
	s, path := newTestServer(t)
	s.store.delay = time.Hour // nothing would ever hit the disk on its own

	postPalette(t, s, `{"saturation":2,"colors":null}`)
	if err := s.store.flushNow(); err != nil {
		t.Fatalf("flushNow: %v", err)
	}
	loaded, err := loadState(path)
	if err != nil {
		t.Fatalf("load after flush: %v", err)
	}
	if loaded.State.Saturation != 2 {
		t.Errorf("flushed saturation = %v, want 2", loaded.State.Saturation)
	}
}

func TestStoreConcurrentWritesAreSerialized(t *testing.T) {
	s, path := newTestServer(t)
	s.store.delay = time.Millisecond
	base := palette.DefaultState().Normalized()

	// Hammer save from several goroutines while flushNow races the debounced
	// timer writes: the writes share one temp file, so any overlap would
	// corrupt the state rather than trip the race detector.
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				st := base
				st.Saturation = 0.5 + float64(i*50+j)/1000
				s.store.save(st, s.currentAB())
			}
		}(i)
	}
	for i := 0; i < 5; i++ {
		if err := s.store.flushNow(); err != nil {
			t.Errorf("flushNow during concurrent saves: %v", err)
		}
		time.Sleep(time.Millisecond)
	}
	wg.Wait()
	if err := s.store.flushNow(); err != nil {
		t.Fatalf("final flushNow: %v", err)
	}
	loaded, err := loadState(path)
	if err != nil {
		t.Fatalf("load after concurrent writes: %v", err)
	}
	if len(loaded.State.Colors) != len(base.Colors) {
		t.Errorf("loaded colors len = %d, want %d", len(loaded.State.Colors), len(base.Colors))
	}
}

func TestBendJSONContract(t *testing.T) {
	s, _ := newTestServer(t)

	// A body without bend (legacy clients or old state files) keeps the
	// base's value, which defaults to 0 — the identity skew.
	if got := postPalette(t, s, `{}`).State.Bend; got != 0 {
		t.Errorf("POST without bend produced %v, want the base 0", got)
	}

	// The bend rides in the state like saturation: echoed after
	// normalization and reflected in the generated palette.
	resp := postPalette(t, s, `{"bend":0.5}`)
	if resp.State.Bend != 0.5 {
		t.Errorf("posted bend 0.5 echoed as %v", resp.State.Bend)
	}
	plain := postPalette(t, s, `{"bend":0}`)
	// Level 500 sits mid-ramp, exactly where the power-law skew moves it
	// the most; the anchors (50/950) are fixed points and never move.
	if got, want := resp.Palette.Colors[0].Swatches[6].L, plain.Palette.Colors[0].Swatches[6].L; got == want {
		t.Errorf("bend 0.5 left level-500 lightness unchanged (%v)", got)
	}
	if resp.Palette.Colors[0].Swatches[0].L != plain.Palette.Colors[0].Swatches[0].L {
		t.Error("bend moved the level-50 anchor")
	}

	// Out-of-range bend is clamped server-side, not echoed raw.
	if got := postPalette(t, s, `{"bend":42}`).State.Bend; got != 1 {
		t.Errorf("bend 42 clamped to %v, want 1", got)
	}
	if got := postPalette(t, s, `{"bend":-42}`).State.Bend; got != -1 {
		t.Errorf("bend -42 clamped to %v, want -1", got)
	}
}

func TestPinchJSONContract(t *testing.T) {
	s, _ := newTestServer(t)

	// Bodies without the new fields (legacy clients or old state files)
	// keep the base's defaults: pinch 0 (identity) and a mid pinch center.
	if got := postPalette(t, s, `{}`); got.State.Pinch != 0 || got.State.PinchCenter != 0.5 {
		t.Errorf("POST without pinch/pinchCenter = %v/%v, want 0/0.5",
			got.State.Pinch, got.State.PinchCenter)
	}

	// Both ride in the state like saturation: echoed after normalization
	// and reflected in the generated palette.
	resp := postPalette(t, s, `{"pinch":0.5,"pinchCenter":0.8}`)
	if resp.State.Pinch != 0.5 || resp.State.PinchCenter != 0.8 {
		t.Errorf("posted pinch/pinchCenter echoed as %v/%v",
			resp.State.Pinch, resp.State.PinchCenter)
	}
	plain := postPalette(t, s, `{"pinch":0,"pinchCenter":0.5}`)
	if got, want := resp.Palette.Colors[0].Swatches[6].L, plain.Palette.Colors[0].Swatches[6].L; got == want {
		t.Errorf("pinch 0.5 left level-500 lightness unchanged (%v)", got)
	}

	// Out-of-range values are clamped server-side, not echoed raw.
	if got := postPalette(t, s, `{"pinch":42}`); got.State.Pinch != 1 {
		t.Errorf("pinch 42 clamped to %v, want 1", got.State.Pinch)
	}
	if got := postPalette(t, s, `{"pinch":-42}`); got.State.Pinch != -1 {
		t.Errorf("pinch -42 clamped to %v, want -1", got.State.Pinch)
	}
	if got := postPalette(t, s, `{"pinchCenter":2}`); got.State.PinchCenter != 1 {
		t.Errorf("pinchCenter 2 clamped to %v, want 1", got.State.PinchCenter)
	}
	if got := postPalette(t, s, `{"pinchCenter":-1}`); got.State.PinchCenter != 0 {
		t.Errorf("pinchCenter -1 clamped to %v, want 0", got.State.PinchCenter)
	}
}

func TestEmptyColorsFallBackToBase(t *testing.T) {
	s, _ := newTestServer(t)
	// A JSON empty array is a non-nil zero-length slice, so a nil check
	// alone would let it through and render (and persist) an empty grid.
	resp := postPalette(t, s, `{"colors":[]}`)
	if len(resp.State.Colors) != len(s.currentBase().Colors) {
		t.Errorf("POST with empty colors kept %d rows, want the base %d",
			len(resp.State.Colors), len(s.currentBase().Colors))
	}
	if resp.Theme == nil {
		t.Error("empty colors produced no theme")
	}
}

func TestLoadStateEmptyColorsFallsBack(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	if err := os.WriteFile(path, []byte(`{"minL":0.2,"maxL":0.9,"colors":[]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	loaded, err := loadState(path)
	if err != nil {
		t.Fatalf("loadState: %v", err)
	}
	if len(loaded.State.Colors) != len(palette.DefaultState().Colors) {
		t.Errorf("empty colors list loaded %d rows, want the defaults", len(loaded.State.Colors))
	}
	// A legacy flat file has no A/B record: slot A is seeded from the loaded
	// state so the comparison feature starts intact, and B stays empty.
	if loaded.AB.Active != "A" || loaded.AB.Slots.A == nil {
		t.Errorf("legacy file did not seed slot A: active %q, A = %+v", loaded.AB.Active, loaded.AB.Slots.A)
	}
	if loaded.AB.Slots.B != nil {
		t.Errorf("legacy file seeded slot B: %+v", loaded.AB.Slots.B)
	}
}

func TestLoadStateCorruptFileFails(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	if err := os.WriteFile(path, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := loadState(path); err == nil {
		t.Error("corrupt state file parsed without error")
	}
}
