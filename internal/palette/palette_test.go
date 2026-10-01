package palette

import (
	"encoding/json"
	"math"
	"regexp"
	"testing"

	"cola/internal/color"
)

var hexRE = regexp.MustCompile(`^#[0-9a-f]{6}$`)

func TestGenerateDefault(t *testing.T) {
	p := Generate(DefaultState())
	if len(p.Colors) != 9 {
		t.Fatalf("got %d colors, want 9", len(p.Colors))
	}
	if len(p.Levels) != 13 || len(lightT) != len(Levels) {
		t.Fatalf("levels = %v (len %d), want 13; lightT len %d", p.Levels, len(p.Levels), len(lightT))
	}
	for _, row := range p.Colors {
		if len(row.Swatches) != 13 {
			t.Fatalf("color %s: got %d swatches, want 13", row.Name, len(row.Swatches))
		}
		// Lightness must decrease monotonically as the level number grows.
		for i := 1; i < len(row.Swatches); i++ {
			if row.Swatches[i].L >= row.Swatches[i-1].L {
				t.Errorf("color %s: level %d L %.3f >= level %d L %.3f",
					row.Name, row.Swatches[i].Level, row.Swatches[i].L,
					row.Swatches[i-1].Level, row.Swatches[i-1].L)
			}
			if row.Swatches[i].Level <= row.Swatches[i-1].Level {
				t.Errorf("color %s: levels not ascending: %v", row.Name, row.Swatches)
			}
		}
		for _, s := range row.Swatches {
			if !hexRE.MatchString(s.Hex) {
				t.Errorf("color %s level %d: bad hex %q", row.Name, s.Level, s.Hex)
			}
			if s.Y < 0 || s.Y > 1 {
				t.Errorf("color %s level %d: luminance %v out of [0,1]", row.Name, s.Level, s.Y)
			}
		}
	}
}

func TestGenerateAnchors(t *testing.T) {
	s := DefaultState()
	p := Generate(s)
	row := p.Colors[0]
	if row.Swatches[0].Level != 50 || math.Abs(row.Swatches[0].L-s.MaxL) > 1e-9 {
		t.Errorf("level 50 L = %v, want %v", row.Swatches[0].L, s.MaxL)
	}
	last := row.Swatches[len(row.Swatches)-1]
	if last.Level != 950 || math.Abs(last.L-s.MinL) > 1e-9 {
		t.Errorf("level 950 L = %v, want %v", last.L, s.MinL)
	}
}

func TestGenerateZeroSaturationIsGray(t *testing.T) {
	s := DefaultState()
	s.Saturation = 0
	p := Generate(s)
	for _, row := range p.Colors {
		for _, sw := range row.Swatches {
			if sw.C > 1e-9 {
				t.Fatalf("color %s level %d: chroma %v, want ~0", row.Name, sw.Level, sw.C)
			}
		}
	}
	// With zero chroma every row is the same gray ramp as base.
	base := p.Colors[0]
	for _, row := range p.Colors[1:] {
		for i := range row.Swatches {
			if row.Swatches[i].Hex != base.Swatches[i].Hex {
				t.Fatalf("color %s level %d differs from base at zero saturation", row.Name, row.Swatches[i].Level)
			}
		}
	}
}

func TestGenerateGamutFitted(t *testing.T) {
	// Even absurd chroma targets must produce valid in-gamut hexes.
	s := DefaultState()
	s.Saturation = 3
	for _, cs := range s.Colors {
		cs.Chroma = 0.4
	}
	p := Generate(s)
	for _, row := range p.Colors {
		for _, sw := range row.Swatches {
			if !hexRE.MatchString(sw.Hex) {
				t.Errorf("color %s level %d: bad hex %q", row.Name, sw.Level, sw.Hex)
			}
		}
	}
}

func TestNormalizedClamps(t *testing.T) {
	s := DefaultState()
	s.MinL = -1
	s.MaxL = 5
	s.Saturation = 100
	s.Bend = 9
	n := s.Normalized()
	if n.MinL < 0.02 || n.MaxL > 0.995 || n.MaxL-n.MinL < 0.1 {
		t.Errorf("lightness not clamped: min %.3f max %.3f", n.MinL, n.MaxL)
	}
	if n.Saturation > 3 {
		t.Errorf("saturation not clamped: %v", n.Saturation)
	}
	if n.Bend > 1 {
		t.Errorf("bend not clamped: %v", n.Bend)
	}
	s.Bend = -9
	if n2 := s.Normalized(); n2.Bend != -1 {
		t.Errorf("negative bend not clamped: %v", n2.Bend)
	}
	s.Pinch = 9
	s.PinchCenter = -3
	n3 := s.Normalized()
	if n3.Pinch != 0.5 {
		t.Errorf("pinch not clamped: %v", n3.Pinch)
	}
	if n3.PinchCenter != 0 {
		t.Errorf("pinch center not clamped: %v", n3.PinchCenter)
	}
	s.Pinch = -9
	s.PinchCenter = 3
	n4 := s.Normalized()
	if n4.Pinch != -0.5 {
		t.Errorf("negative pinch not clamped: %v", n4.Pinch)
	}
	if n4.PinchCenter != 1 {
		t.Errorf("pinch center not clamped from above: %v", n4.PinchCenter)
	}
	// The tint mirrors the per-color chroma cap and the anchors' lightness
	// bounds; the hue covers the full circle.
	s.TintHue = -5
	s.TintL = 5
	s.TintChroma = 9
	s.TintIntensity = 9
	n5 := s.Normalized()
	if n5.TintHue != 0 || n5.TintL != 0.995 || n5.TintChroma != 0.4 || n5.TintIntensity != 1 {
		t.Errorf("tint not clamped from above: hue %v L %v C %v k %v",
			n5.TintHue, n5.TintL, n5.TintChroma, n5.TintIntensity)
	}
	s.TintL = -1
	s.TintIntensity = -1
	n6 := s.Normalized()
	if n6.TintL != 0.02 || n6.TintIntensity != 0 {
		t.Errorf("tint not clamped from below: L %v k %v", n6.TintL, n6.TintIntensity)
	}
}

// TestPinchAt pins the ported pinch math against hand-computed cases,
// including the degenerate extremes the guards short-circuit.
func TestPinchAt(t *testing.T) {
	cases := []struct {
		v, f, c, want float64
	}{
		// f = 0 is the identity for any center.
		{0.25, 0, 0.5, 0.25},
		{0.25, 0, 0.8, 0.25},
		// v = c is a fixed point.
		{0.5, 0.75, 0.5, 0.5},
		// f = 1 collapses everything onto the center.
		{0.25, 1, 0.7, 0.7},
		{0.9, 1, 0.7, 0.7},
		// f = -1 flattens interior values onto the nearer edge.
		{0.25, -1, 0.5, 0},
		{0.75, -1, 0.5, 1},
		{0.2, -1, 0.3, 0},
		{0.5, -1, 0.3, 1},
		// Symmetric center: k = 3, so 0.25 -> 0.5 - 0.5^3 * 0.5.
		{0.25, 0.5, 0.5, 0.4375},
		{0.75, 0.5, 0.5, 0.5625},
		// Center pinned at an edge: each side normalizes to the full span
		// (k = 3, so 0.3^3 and 1 - 0.7^3).
		{0.3, 0.5, 0, 0.027},
		{0.3, 0.5, 1, 0.657},
	}
	for _, tc := range cases {
		if got := pinchAt(tc.v, tc.f, tc.c); math.Abs(got-tc.want) > 1e-12 {
			t.Errorf("pinchAt(%v, %v, %v) = %v, want %v", tc.v, tc.f, tc.c, got, tc.want)
		}
	}
}

// TestGeneratePinch checks the pinch's contract through Generate: anchors
// never move, positive pinch pulls every interior level toward the pinch
// center and negative pinch pushes them away, pinch 0 is the exact identity
// regardless of the center, and full pinch collapses the interior onto the
// center's lightness.
func TestGeneratePinch(t *testing.T) {
	flat := Generate(DefaultState())
	s := DefaultState()

	// Pinch 0 with any pinch center reproduces the default palette exactly.
	s.PinchCenter = 0.8
	if got := Generate(s); got.Colors[0].Swatches[3].L != flat.Colors[0].Swatches[3].L {
		t.Error("pinch 0 with a moved pinch center changed the palette")
	}

	// Positive pinch concentrates the interior around the center; negative
	// spreads it toward the anchors. Compare distances to the center's
	// lightness rather than raw L, since levels on opposite sides move in
	// opposite directions.
	s.PinchCenter = 0.5
	s.Pinch = 0.5
	up := Generate(s)
	s.Pinch = -0.5
	down := Generate(s)
	def := DefaultState()
	centerL := def.MaxL - 0.5*(def.MaxL-def.MinL)
	last := len(flat.Levels) - 1
	for i, row := range flat.Colors {
		for j, sw := range row.Swatches {
			if j == 0 || j == last {
				for _, bent := range []Palette{up, down} {
					if bent.Colors[i].Swatches[j].L != sw.L {
						t.Errorf("%s level %d anchor moved under pinch", row.Name, sw.Level)
					}
				}
				continue
			}
			for name, bent := range map[string]Palette{"positive": up, "negative": down} {
				got := bent.Colors[i].Swatches[j].L
				gotDist, wantDist := math.Abs(got-centerL), math.Abs(sw.L-centerL)
				if name == "positive" && gotDist >= wantDist {
					t.Errorf("%s level %d: positive pinch distance %v not below flat %v",
						row.Name, sw.Level, gotDist, wantDist)
				}
				if name == "negative" && gotDist <= wantDist {
					t.Errorf("%s level %d: negative pinch distance %v not above flat %v",
						row.Name, sw.Level, gotDist, wantDist)
				}
			}
		}
	}
}

// TestGenerateBend checks the power-law skew's contract: the anchors never
// move, bend 0 reproduces the unbent palette, and the two directions skew
// every intermediate level toward opposite anchors while keeping the ramp
// strictly monotonic in lightness.
func TestGenerateBend(t *testing.T) {
	flat := Generate(DefaultState())
	s := DefaultState()
	s.Bend = 1
	up := Generate(s)
	s.Bend = -1
	down := Generate(s)
	last := len(flat.Levels) - 1
	for i, row := range flat.Colors {
		for j, sw := range row.Swatches {
			upSw := up.Colors[i].Swatches[j]
			downSw := down.Colors[i].Swatches[j]
			if j == 0 || j == last {
				// Levels 50 and 950 are fixed points of the power law.
				if upSw.L != sw.L || downSw.L != sw.L {
					t.Errorf("%s level %d moved: %v -> up %v / down %v",
						row.Name, sw.Level, sw.L, upSw.L, downSw.L)
				}
				continue
			}
			if upSw.L <= sw.L {
				t.Errorf("%s level %d: positive bend L %v not above flat %v",
					row.Name, sw.Level, upSw.L, sw.L)
			}
			if downSw.L >= sw.L {
				t.Errorf("%s level %d: negative bend L %v not below flat %v",
					row.Name, sw.Level, downSw.L, sw.L)
			}
		}
		// The skew must never invert the ramp's lightness order.
		for _, bent := range []Palette{up, down} {
			for j := 1; j < len(row.Swatches); j++ {
				if bent.Colors[i].Swatches[j].L >= bent.Colors[i].Swatches[j-1].L {
					t.Errorf("%s: bend inverted lightness at level %d",
						row.Name, bent.Colors[i].Swatches[j].Level)
				}
			}
		}
	}
	// Bend 0 is exactly the identity, not merely close to it.
	s.Bend = 0
	if again := Generate(s); again.Colors[0].Swatches[3].L != flat.Colors[0].Swatches[3].L {
		t.Error("bend 0 did not reproduce the unbent palette")
	}
}

// TestGenerateTint checks the tint's contract through Generate: intensity 0
// reproduces the untinted palette exactly no matter the tint color, intensity
// 1 collapses every swatch onto the gamut-fitted tint itself, and an
// intermediate intensity pulls every swatch's lightness to the mix point
// while keeping each level's lightness equal across hues.
func TestGenerateTint(t *testing.T) {
	plain := Generate(DefaultState())

	// Intensity 0 is the exact identity, whatever the tint color is.
	s := DefaultState()
	s.TintHue, s.TintL, s.TintChroma = 200, 0.4, 0.3
	if got := Generate(s); got.Colors[3].Swatches[5].Hex != plain.Colors[3].Swatches[5].Hex {
		t.Error("tint intensity 0 changed the palette")
	}

	// Full intensity replaces every swatch with the fitted tint; the tint
	// itself is gamut-fitted, so its hex is what a swatch must land on.
	s.TintIntensity = 1
	tinted := Generate(s)
	wantHex := color.LCh{
		L: s.TintL,
		C: color.FitChroma(s.TintL, s.TintHue, s.TintChroma),
		H: s.TintHue,
	}.ToLab().Hex()
	for _, row := range tinted.Colors {
		for _, sw := range row.Swatches {
			if sw.Hex != wantHex {
				t.Errorf("%s level %d: full tint gave %s, want the tint %s",
					row.Name, sw.Level, sw.Hex, wantHex)
			}
		}
	}

	// Half intensity: the mixed lightness sits exactly at the mix point of
	// the level's base L and the tint's L (chroma fitting holds L fixed),
	// and it is shared by every row at that level — the tint preserves the
	// equal-perceived-lightness-per-level guarantee.
	s.TintIntensity = 0.5
	half := Generate(s)
	for i, row := range plain.Colors {
		for j, sw := range row.Swatches {
			got := half.Colors[i].Swatches[j]
			if want := (sw.L + s.TintL) / 2; math.Abs(got.L-want) > 1e-9 {
				t.Errorf("%s level %d: tinted L %v, want the mix point %v",
					row.Name, sw.Level, got.L, want)
			}
		}
	}
	for j := range plain.Levels {
		for _, row := range half.Colors[1:] {
			if row.Swatches[j].L != half.Colors[0].Swatches[j].L {
				t.Errorf("level %d: tint broke equal lightness across hues (%v vs %v)",
					row.Swatches[j].Level, row.Swatches[j].L, half.Colors[0].Swatches[j].L)
			}
		}
	}
}

func TestHueWindows(t *testing.T) {
	// Every chromatic color is pinned to +/-hueWindow degrees around its
	// ideal OKLCH center; base is unconstrained.
	s := DefaultState()
	for _, cs := range s.Colors {
		wantMin, wantMax := hueRange(cs.Name)
		st := State{
			MinL: 0.2, MaxL: 0.95, Saturation: 1,
			Colors: []ColorSpec{{Name: cs.Name, Hue: 999, Chroma: cs.Chroma}},
		}.Normalized()
		got := st.Colors[0]
		if got.HueMin != wantMin || got.HueMax != wantMax {
			t.Errorf("%s: window [%v, %v], want [%v, %v]", cs.Name, got.HueMin, got.HueMax, wantMin, wantMax)
		}
		if got.Hue != wantMax {
			t.Errorf("%s: out-of-window hue clamped to %v, want %v", cs.Name, got.Hue, wantMax)
		}
	}

	// Red spans [0, 60] around its ideal center at 30 degrees (sRGB red's
	// OKLCH hue is ~29, not 0 as it would be in HSL).
	if min, max := hueRange("red"); min != 0 || max != 60 {
		t.Errorf("red window = [%v, %v], want [0, 60]", min, max)
	}
	if min, max := hueRange("base"); min != 0 || max != 360 {
		t.Errorf("base window = [%v, %v], want [0, 360]", min, max)
	}
}

func TestGenerateUsesClampedHue(t *testing.T) {
	// A posted hue far outside the window must not leak into the palette.
	s := DefaultState()
	s.Colors[1].Hue = 300 // would turn "red" blue-purple
	p := Generate(s)
	red := p.Colors[1]
	if red.Hue < 0 || red.Hue > 60 {
		t.Errorf("red row hue = %v, want within [0, 60]", red.Hue)
	}
	for _, sw := range red.Swatches {
		if sw.H != red.Hue {
			t.Errorf("swatch hue %v != row hue %v", sw.H, red.Hue)
		}
	}
}

func TestStateJSONRoundTrip(t *testing.T) {
	s := DefaultState()
	data, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var back State
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatal(err)
	}
	if len(back.Colors) != len(s.Colors) {
		t.Fatalf("colors lost in round trip: %d vs %d", len(back.Colors), len(s.Colors))
	}
	if back.Colors[6].Hue != s.Colors[6].Hue || back.Colors[6].Chroma != s.Colors[6].Chroma {
		t.Errorf("blue spec mismatch: %+v vs %+v", back.Colors[6], s.Colors[6])
	}
}
