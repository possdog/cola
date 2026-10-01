// Package palette models a Flexoki-style palette: a fixed set of colors, each
// sampled at thirteen luminosity levels, with all swatches derived from OKLCH
// coordinates so that equal levels have equal perceived lightness across hues.
package palette

import (
	"math"

	"cola/internal/color"
)

// Levels are the thirteen luminosity steps, from lightest to darkest.
// The numbering follows the Flexoki convention: bigger number, darker color.
var Levels = []int{50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950}

// lightT positions each level between the lightest anchor (t=0, level 50,
// at State.MaxL) and the darkest anchor (t=1, level 950, at State.MinL).
// The spacing mirrors Flexoki: steps bunch toward the extremes and stretch
// through the middle, which distributes the levels more perceptually evenly
// than a linear index mapping would.
var lightT = []float64{0, 0.06, 0.12, 0.19, 0.34, 0.45, 0.55, 0.64, 0.73, 0.84, 0.88, 0.93, 1}

// hueWindow is the half-width, in degrees, of the hue range each color may
// span around its ideal center: red stays recognizably red, and so on.
const hueWindow = 30

// idealHue maps each color name to the OKLCH hue angle that best renders as
// that color. Note that OKLCH hue 0 is pink/salmon, not red: pure sRGB red
// sits near 30 degrees, so red is centered there rather than at 0. The base
// row is near-neutral, so its hue is unconstrained.
var idealHue = map[string]float64{
	"red":     30,
	"orange":  55,
	"yellow":  110,
	"green":   145,
	"cyan":    195,
	"blue":    264,
	"purple":  310,
	"magenta": 328,
}

// hueRange returns the allowed hue window [min, max] for a color name.
// Unknown names (custom rows) and the neutral base get the full circle.
func hueRange(name string) (min, max float64) {
	if center, ok := idealHue[name]; ok {
		return center - hueWindow, center + hueWindow
	}
	return 0, 360
}

// ColorSpec describes one row of the palette.
type ColorSpec struct {
	// Name is the row label, e.g. "base" or "red".
	Name string `json:"name"`
	// Hue is the OKLCH hue angle in degrees, clamped to [HueMin, HueMax]
	// during normalization.
	Hue float64 `json:"hue"`
	// HueMin and HueMax bound the hue window and are filled in by the
	// server; clients should treat them as read-only. The UI uses them as
	// slider bounds so server and browser agree on the allowed range.
	HueMin float64 `json:"hueMin"`
	HueMax float64 `json:"hueMax"`
	// Chroma is the target OKLCH chroma at peak saturation. The neutral base
	// row uses a near-zero value so it renders as a warm gray ramp.
	Chroma float64 `json:"chroma"`
}

// State is the full set of user-adjustable palette parameters.
type State struct {
	// MinL is the Oklab lightness of level 950 (darkest swatches).
	MinL float64 `json:"minL"`
	// MaxL is the Oklab lightness of level 50 (lightest swatches).
	MaxL float64 `json:"maxL"`
	// Saturation is a global multiplier applied to every color's chroma.
	Saturation float64     `json:"saturation"`
	Colors     []ColorSpec `json:"colors"`
}

// Swatch is one computed color in the grid.
type Swatch struct {
	Level int    `json:"level"`
	Hex   string `json:"hex"`
	// L, C, H are the final (post-gamut-fit) OKLCH coordinates, useful for
	// exporting or debugging the generated colors.
	L float64 `json:"l"`
	C float64 `json:"c"`
	H float64 `json:"h"`
	// Y is WCAG relative luminance; the UI picks black/white text with it.
	Y float64 `json:"y"`
}

// ColorResult is one palette row: a color and its swatches across all levels.
type ColorResult struct {
	Name     string   `json:"name"`
	Hue      float64  `json:"hue"`
	Swatches []Swatch `json:"swatches"`
}

// Palette is a fully generated palette.
type Palette struct {
	Levels []int         `json:"levels"`
	Colors []ColorResult `json:"colors"`
}

// DefaultState returns the starting palette: nine colors with Flexoki-ish
// hue placements, a warm near-neutral base, and a full-range lightness ramp.
func DefaultState() State {
	return State{
		MinL:       0.17,
		MaxL:       0.985,
		Saturation: 1,
		Colors: []ColorSpec{
			{Name: "base", Hue: 90, Chroma: 0.006},
			{Name: "red", Hue: 30, Chroma: 0.16},
			{Name: "orange", Hue: 55, Chroma: 0.15},
			{Name: "yellow", Hue: 110, Chroma: 0.16},
			{Name: "green", Hue: 145, Chroma: 0.14},
			{Name: "cyan", Hue: 195, Chroma: 0.12},
			{Name: "blue", Hue: 264, Chroma: 0.15},
			{Name: "purple", Hue: 310, Chroma: 0.14},
			{Name: "magenta", Hue: 328, Chroma: 0.16},
		},
	}
}

// Normalized returns a copy of the state with all parameters clamped to sane
// ranges and the lightness anchors ordered, so generation can never produce
// degenerate output regardless of what the client posts.
func (s State) Normalized() State {
	out := s
	out.MinL = clamp(s.MinL, 0.02, 0.6)
	out.MaxL = clamp(s.MaxL, 0.5, 0.995)
	// Keep at least a small lightness range so the ramp stays monotonic.
	if out.MaxL-out.MinL < 0.1 {
		out.MaxL = math.Min(0.995, out.MinL+0.1)
	}
	out.Saturation = clamp(s.Saturation, 0, 3)
	// Copy the color slice before clamping in place: ColorSpec holds only
	// scalars, so a slice copy is a full deep copy. Without it, the writes
	// below would mutate the caller's backing array — and anything aliasing
	// it, such as the server's loaded base state.
	out.Colors = append([]ColorSpec(nil), s.Colors...)
	// Chroma is capped high enough that every slider position is meaningful;
	// FitChroma pulls out-of-gamut values back at generation time. Hue is
	// clamped into each color's window so a chromatic row can never drift
	// into a different hue family (red stays red).
	for i := range out.Colors {
		cs := &out.Colors[i]
		cs.HueMin, cs.HueMax = hueRange(cs.Name)
		cs.Hue = clamp(s.Colors[i].Hue, cs.HueMin, cs.HueMax)
		cs.Chroma = clamp(s.Colors[i].Chroma, 0, 0.4)
	}
	return out
}

// taper reduces chroma towards the lightness extremes. Pure Oklab lightness
// ramps stay even, but fully saturated near-white or near-black swatches look
// unnatural, so chroma is scaled down as L departs from the 0.55 peak.
func taper(L float64) float64 {
	const peak = 0.55
	const halfWidth = 0.55
	x := (L - peak) / halfWidth
	t := 1 - x*x
	if t < 0 {
		return 0
	}
	return math.Sqrt(t)
}

// Generate computes every swatch of the palette for the given state.
func Generate(s State) Palette {
	s = s.Normalized()
	p := Palette{Levels: Levels}
	for _, cs := range s.Colors {
		hue := cs.Hue
		row := ColorResult{Name: cs.Name, Hue: hue}
		for i, level := range Levels {
			L := s.MaxL - lightT[i]*(s.MaxL-s.MinL)
			C := color.FitChroma(L, hue, cs.Chroma*s.Saturation*taper(L))
			lab := color.LCh{L: L, C: C, H: hue}.ToLab()
			row.Swatches = append(row.Swatches, Swatch{
				Level: level,
				Hex:   lab.Hex(),
				L:     L,
				C:     C,
				H:     hue,
				Y:     lab.RelativeLuminance(),
			})
		}
		p.Colors = append(p.Colors, row)
	}
	return p
}

func clamp(v, lo, hi float64) float64 {
	return math.Min(math.Max(v, lo), hi)
}
