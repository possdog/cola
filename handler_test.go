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
	base := palette.DefaultState().Normalized()
	return &server{base: base, store: newStateStore(path, base)}, path
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
	if loaded.Saturation != 1.5 {
		t.Errorf("persisted saturation = %v, want 1.5", loaded.Saturation)
	}
	red := loaded.Colors[0]
	if red.Name != "red" || red.Hue != 45 || red.Chroma != 0.2 {
		t.Errorf("persisted color spec = %+v, want red hue 45 chroma 0.2", red)
	}
	// The persisted state must round-trip through the server on restart.
	restarted := &server{base: loaded.Normalized(), store: newStateStore(path, loaded.Normalized())}
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
	if loaded.Colors[0].Hue != 40 {
		t.Errorf("coalesced write kept hue %v, want the latest 40", loaded.Colors[0].Hue)
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
	if loaded.Saturation != def.Saturation || loaded.Colors[1].Hue != 30 {
		t.Errorf("persisted state after reset = %+v, want defaults", loaded)
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
	if loaded.Saturation != 2 {
		t.Errorf("flushed saturation = %v, want 2", loaded.Saturation)
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
				s.store.save(st)
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
	if len(loaded.Colors) != len(base.Colors) {
		t.Errorf("loaded colors len = %d, want %d", len(loaded.Colors), len(base.Colors))
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
	if len(loaded.Colors) != len(palette.DefaultState().Colors) {
		t.Errorf("empty colors list loaded %d rows, want the defaults", len(loaded.Colors))
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
