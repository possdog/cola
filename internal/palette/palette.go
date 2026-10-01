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
	"red":    30,
	"orange": 55,
	// 90, not pure sRGB yellow's ~110: at 110 the default reads chartreuse,
	// i.e. skewed green next to the orange and green rows around it.
	"yellow":  90,
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
	Saturation float64 `json:"saturation"`
	// Bend skews how the thirteen levels are distributed between the two
	// lightness anchors, using a power-law curve: 0 keeps the Flexoki
	// spacing, +1 bunches the intermediate steps toward the light end
	// (finer dark shades), and -1 bunches them toward the dark end (finer
	// light shades). See bendT.
	Bend float64 `json:"bend"`
	// Pinch and PinchCenter reshape the (already bent) distribution
	// around one point: Pinch concentrates the steps near that point or,
	// when negative, pushes them toward the anchors. It is clamped to
	// +/-0.5, well short of the +/-1 extremes where the curve degenerates
	// (everything onto the center, resp. onto the nearer edge), so every
	// slider position keeps a useful, strictly monotonic ramp.
	// PinchCenter is the point's position between the anchors (0 = level
	// 50, 1 = level 950). See pinchAt.
	Pinch       float64 `json:"pinch"`
	PinchCenter float64 `json:"pinchCenter"`
	// TintHue and TintChroma describe a hidden tenth row of the palette:
	// a color that rides the palette's own thirteen-level lightness ramp
	// (its lightness at each level is that level's L) and is mixed into
	// every other row, level by level, by TintIntensity. The intensity is
	// the mix fraction, clamped to [0,0.25] — beyond a quarter mix the
	// palette stops reading as itself, so the silly end of the range stays
	// out of reach. Hue and chroma only matter once the intensity departs
	// from 0.
	TintHue       float64 `json:"tintHue"`
	TintChroma    float64 `json:"tintChroma"`
	TintIntensity float64 `json:"tintIntensity"`
	// Colors is the per-row spec list.
	Colors []ColorSpec `json:"colors"`
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
		// Bend is the power-law skew of the luminosity distribution; 0 is
		// the default, so the default palette keeps the Flexoki spacing.
		// Pinch/PinchCenter likewise default to their identity (0 pinch;
		// the pinch center itself only matters once pinch departs from 0).
		Bend:        0,
		Pinch:       0,
		PinchCenter: 0.5,
		// The tint color's own coordinates are arbitrary but chosen to
		// read as a warm red; only the zero intensity (tint off) is
		// load-bearing as the default, keeping the default palette
		// exactly the untinted one.
		TintHue:       30,
		TintChroma:    0.15,
		TintIntensity: 0,
		Colors: []ColorSpec{
			{Name: "base", Hue: 90, Chroma: 0.006},
			{Name: "red", Hue: 30, Chroma: 0.16},
			{Name: "orange", Hue: 55, Chroma: 0.15},
			{Name: "yellow", Hue: 90, Chroma: 0.16},
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
	out.Bend = clamp(s.Bend, -1, 1)
	out.Pinch = clamp(s.Pinch, -0.5, 0.5)
	out.PinchCenter = clamp(s.PinchCenter, 0, 1)
	// The tint mirrors the per-color clamps: the same [0,0.4] chroma cap
	// and the full hue circle. Lightness is not a tint parameter — the
	// tint row rides the palette's own lightness ramp — and zero values
	// (a legacy state file written before the tint feature) are harmless:
	// intensity 0 keeps the tint out of the palette entirely.
	out.TintHue = clamp(s.TintHue, 0, 360)
	out.TintChroma = clamp(s.TintChroma, 0, 0.4)
	out.TintIntensity = clamp(s.TintIntensity, 0, 0.25)
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

// bendT skews a level's position t between the two lightness anchors with a
// power law: the exponent is 2^bend, so bend 0 is the identity (the Flexoki
// spacing) and each unit of bend doubles or halves the exponent, making the
// two directions feel equally strong. Positive bend (exponent > 1) pulls
// intermediate levels toward the light anchor, spreading the dark shades
// across a wider range; negative bend does the opposite. t=0 and t=1 are
// fixed points, so levels 50 and 950 stay pinned to MaxL and MinL at any
// bend, and the curve is strictly monotonic, so the ramp's lightness order
// can never invert.
func bendT(t, bend float64) float64 {
	if bend == 0 {
		return t
	}
	return math.Pow(t, math.Exp2(bend))
}

// pinchAt reshapes a position v in [0,1] around a center point c: pinch f
// concentrates values near c (f = 1 collapses everything onto it) or, when
// negative, pushes them toward the edges (f = -1 flattens every interior
// value onto the nearer of 0 and 1). f = 0 is the identity for any c. Each
// side of c is normalized to its own [0,1] span first, so the curve is
// symmetric in strength even when c sits off the middle; a center pinned at
// an edge degenerates to the constant c. For |f| < 1 the mapping fixes 0, c,
// and 1 and is strictly monotonic, so the ramp's lightness order can never
// invert; at f = +/-1 it degenerates instead (f = 1 collapses everything
// onto c, anchors included; f = -1 flattens everything onto the nearer
// edge) — extremes the state's +/-0.5 clamp deliberately keeps out of
// reach. Ported from the reference TypeScript implementation.
func pinchAt(v, f, c float64) float64 {
	// Short-circuit the identity, like bendT: the general path below is
	// algebraically v but not bit-identical to it, and a zero pinch must
	// leave the default palette untouched exactly.
	if f == 0 {
		return v
	}
	e := v - c
	if e == 0 {
		return c
	}
	m := 1 - c
	if e < 0 {
		m = c
	}
	if m == 0 {
		return c
	}
	if f >= 1 {
		return c
	}
	if f <= -1 {
		if e < 0 {
			return 0
		}
		return 1
	}
	k := (1 + f) / (1 - f)
	sign := 1.0
	if e < 0 {
		sign = -1
	}
	return c + sign*math.Pow(math.Abs(e)/m, k)*m
}

// levelT maps a level's base position t (the Flexoki spacing) to its final
// position between the anchors: the power-law bend first, then the pinch
// around the pinch center. Pinch runs last so PinchCenter names a position
// in the final distribution — the level at that spot stays exactly there —
// and both stages fix 0 and 1, so the anchors are never moved by either.
func levelT(t float64, s State) float64 {
	return pinchAt(bendT(t, s.Bend), s.Pinch, s.PinchCenter)
}

// tintMix blends one swatch toward the tint color at its level. The mix runs
// in Oklab, where a straight line is the perceptual gradient between two
// colors. The tint row rides the palette's own lightness ramp, so the tint's
// L is bit-identical to the swatch's own level L and the mixed L —
// (1-k)·L + k·L — stays exactly L: tinting can pull hue and chroma around
// but never lightness, so the palette's guarantee of equal perceived
// lightness per level survives by construction.
// Oklab interpolation can leave the sRGB gamut, so the mix is re-fitted in
// OKLCH — lightness and hue of the mix held fixed, chroma reduced until it
// fits — the same discipline the untinted swatch already gets. k=0 must
// short-circuit: the OKLCH round trip below is algebraically the identity
// but not bit-identical, and an untinted state has to reproduce the
// tint-free palette exactly.
func tintMix(c color.LCh, tint color.Lab, k float64) color.LCh {
	if k == 0 {
		return c
	}
	lab := c.ToLab()
	m := color.Lab{
		L: lab.L + (tint.L-lab.L)*k,
		A: lab.A + (tint.A-lab.A)*k,
		B: lab.B + (tint.B-lab.B)*k,
	}.ToLCh()
	m.C = color.FitChroma(m.L, m.H, m.C)
	return m
}

// Generate computes every swatch of the palette for the given state.
func Generate(s State) Palette {
	s = s.Normalized()
	p := Palette{Levels: Levels}
	// The tint is a hidden tenth row: like every other row it rides the
	// palette's lightness ramp (same bend and pinch, so its L at each
	// level is that level's own L) and gets the same saturation scaling,
	// chroma taper, and gamut fit. Two consequences fall out of that.
	// Mixing a color with a same-L target leaves L exactly unchanged, so
	// tinting can never break the equal-perceived-lightness-per-level
	// guarantee; and a tint whose hue and chroma match a palette row makes
	// that row mix with itself, so the intensity slider has no effect on
	// it — the tint row *is* that row.
	tint := make([]color.Lab, len(Levels))
	for i := range Levels {
		L := s.MaxL - levelT(lightT[i], s)*(s.MaxL-s.MinL)
		tint[i] = color.LCh{
			L: L,
			C: color.FitChroma(L, s.TintHue, s.TintChroma*s.Saturation*taper(L)),
			H: s.TintHue,
		}.ToLab()
	}
	for _, cs := range s.Colors {
		hue := cs.Hue
		row := ColorResult{Name: cs.Name, Hue: hue}
		for i, level := range Levels {
			L := s.MaxL - levelT(lightT[i], s)*(s.MaxL-s.MinL)
			C := color.FitChroma(L, hue, cs.Chroma*s.Saturation*taper(L))
			c := tintMix(color.LCh{L: L, C: C, H: hue}, tint[i], s.TintIntensity)
			lab := c.ToLab()
			row.Swatches = append(row.Swatches, Swatch{
				Level: level,
				Hex:   lab.Hex(),
				L:     c.L,
				C:     c.C,
				H:     c.H,
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
