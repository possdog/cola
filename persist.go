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

// abSnapshot holds the settings snapshot for each A/B slot. A slot that has
// never been saved — or whose saved copy carries no colors — is null in JSON
// and nil here.
type abSnapshot struct {
	A *palette.State `json:"A"`
	B *palette.State `json:"B"`
}

// get returns the snapshot for a slot name ("A" or "B"); anything else reads
// as slot A, matching how the rest of the code treats an unknown name.
func (s abSnapshot) get(name string) *palette.State {
	if name == "B" {
		return s.B
	}
	return s.A
}

func (s *abSnapshot) set(name string, st *palette.State) {
	if name == "B" {
		s.B = st
	} else {
		s.A = st
	}
}

// abState is the A/B comparison record: which slot is active and the settings
// snapshot for each slot. server.updateAB keeps the active slot's snapshot
// equal to the main state, so the record always describes both variants.
type abState struct {
	Active string     `json:"active"`
	Slots  abSnapshot `json:"slots"`
}

// persistedState is the state.json envelope: the active palette settings
// plus the A/B record. The two are written and loaded atomically together —
// persisting one without the other could resurrect a stale variant.
type persistedState struct {
	State palette.State `json:"state"`
	AB    abState       `json:"ab"`
}

// defaultPersistedState is the record used when no state file exists yet:
// the built-in palette as slot A, slot B never saved.
func defaultPersistedState() persistedState {
	st := palette.DefaultState().Normalized()
	return persistedState{State: st, AB: abState{Active: "A", Slots: abSnapshot{A: &st}}}
}

// stateStore debounces and persists the palette state and A/B record. The
// caller hands it the latest pair on every change; the store keeps only the
// newest one and writes it to disk once per saveDelay window.
type stateStore struct {
	path  string
	delay time.Duration

	mu      sync.Mutex
	pending persistedState
	timer   *time.Timer
}

// newStateStore creates a store around an initial (already normalized)
// record. Scheduling a save for an identical record is a no-op, so
// filter-only updates never touch the disk.
func newStateStore(path string, initial persistedState) *stateStore {
	return &stateStore{path: path, delay: saveDelay, pending: initial}
}

// save records the state and A/B record to persist, (re)starting the debounce
// window.
func (s *stateStore) save(st palette.State, ab abState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := persistedState{State: st, AB: ab}
	if reflect.DeepEqual(s.pending, next) {
		return
	}
	s.pending = next
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

// write persists the record atomically — temp file then rename — so a crash
// or kill mid-write can never leave a truncated state file behind.
func (s *stateStore) write(ps persistedState) error {
	data, err := json.MarshalIndent(ps, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// cleanSlot normalizes a slot snapshot into a private deep copy (Normalized
// clones the color slice), or drops it: a snapshot with no colors is not a
// palette anyone saved, so it counts as never saved rather than persisting
// an empty grid.
func cleanSlot(st *palette.State) *palette.State {
	if st == nil || len(st.Colors) == 0 {
		return nil
	}
	n := st.Normalized()
	return &n
}

// sanitizeAB repairs an A/B record loaded from disk: an unknown active slot
// falls back to A, snapshots are normalized or dropped, and the active slot
// is seeded from the main state when missing so it can never be absent.
func sanitizeAB(ab abState, active palette.State) abState {
	if ab.Active != "A" && ab.Active != "B" {
		ab.Active = "A"
	}
	ab.Slots.A = cleanSlot(ab.Slots.A)
	ab.Slots.B = cleanSlot(ab.Slots.B)
	if ab.Slots.get(ab.Active) == nil {
		ab.Slots.set(ab.Active, cleanSlot(&active))
	}
	return ab
}

// loadState reads the persisted record, falling back to defaults when the
// file is missing. A corrupt file is reported to the caller, which decides
// whether to fall back to defaults.
func loadState(path string) (persistedState, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return defaultPersistedState(), nil
	}
	if err != nil {
		return persistedState{}, err
	}
	// Files written before the A/B feature hold a bare state object; the
	// envelope nests it under "state", so probing that key tells the two
	// shapes apart without failing the parse.
	var probe struct {
		State json.RawMessage `json:"state"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return persistedState{}, fmt.Errorf("parse %s: %w", path, err)
	}
	ps := persistedState{AB: abState{Active: "A"}}
	if len(probe.State) == 0 || string(probe.State) == "null" {
		if err := json.Unmarshal(data, &ps.State); err != nil {
			return persistedState{}, fmt.Errorf("parse %s: %w", path, err)
		}
	} else if err := json.Unmarshal(data, &ps); err != nil {
		return persistedState{}, fmt.Errorf("parse %s: %w", path, err)
	}
	// A missing, null, or empty colors list falls back to the defaults: an
	// empty array unmarshals to a non-nil zero-length slice, which must not
	// persist as an empty palette across restarts.
	if len(ps.State.Colors) == 0 {
		ps.State.Colors = palette.DefaultState().Colors
	}
	ps.AB = sanitizeAB(ps.AB, ps.State)
	return ps, nil
}
