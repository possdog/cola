package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"reflect"
	"sync"
	"time"

	"cola/internal/palette"
)

// saveDelay bounds how often the state file is rewritten. Palette updates
// arrive on every slider input event, so writes are coalesced: only the most
// recent state is written, once the sliders settle.
const saveDelay = 500 * time.Millisecond

// stateStore debounces and persists the palette state. The caller hands it
// the latest state on every change; the store keeps only the newest one and
// writes it to disk once per saveDelay window.
type stateStore struct {
	path  string
	delay time.Duration

	mu      sync.Mutex
	pending palette.State
	timer   *time.Timer
}

// newStateStore creates a store around an initial (already normalized)
// state. Scheduling a save for an identical state is a no-op, so filter-only
// updates never touch the disk.
func newStateStore(path string, initial palette.State) *stateStore {
	return &stateStore{path: path, delay: saveDelay, pending: initial}
}

// save records st as the state to persist, (re)starting the debounce window.
func (s *stateStore) save(st palette.State) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if reflect.DeepEqual(s.pending, st) {
		return
	}
	s.pending = st
	if s.timer == nil {
		s.timer = time.AfterFunc(s.delay, s.writePending)
	} else {
		s.timer.Reset(s.delay)
	}
}

func (s *stateStore) writePending() {
	// Hold the lock across the whole write. Stop and Reset do not wait for an
	// in-flight AfterFunc callback, so this run can overlap flushNow at
	// shutdown or a re-armed callback after Reset; two concurrent writes would
	// interleave on the same temp file, letting one rename publish a
	// half-written state. Writes are debounced and tiny, so contention is
	// irrelevant.
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.write(s.pending); err != nil {
		log.Printf("save state: %v", err)
	}
}

// flushNow writes the pending state immediately and cancels any scheduled
// write. Used at shutdown so the last debounce window isn't lost.
func (s *stateStore) flushNow() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.timer != nil {
		s.timer.Stop()
		s.timer = nil
	}
	return s.write(s.pending)
}

// write persists st atomically — temp file then rename — so a crash or kill
// mid-write can never leave a truncated state file behind.
func (s *stateStore) write(st palette.State) error {
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// loadState reads the persisted state, falling back to defaults when the
// file is missing. A corrupt file is reported to the caller, which decides
// whether to fall back to defaults.
func loadState(path string) (palette.State, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return palette.DefaultState(), nil
	}
	if err != nil {
		return palette.State{}, err
	}
	var st palette.State
	if err := json.Unmarshal(data, &st); err != nil {
		return palette.State{}, fmt.Errorf("parse %s: %w", path, err)
	}
	// A missing, null, or empty colors list falls back to the defaults: an
	// empty array unmarshals to a non-nil zero-length slice, which must not
	// persist as an empty palette across restarts.
	if len(st.Colors) == 0 {
		st.Colors = palette.DefaultState().Colors
	}
	return st, nil
}
