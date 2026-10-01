// Package color provides conversions between Oklab/OKLCH and sRGB, plus
// sRGB gamut fitting.
//
// Oklab is used because its L channel approximates perceived lightness
// independently of hue, so a palette built on constant-L slices stays evenly
// luminous across all hues.
package color

import (
	"fmt"
	"math"
)

// Lab is a color in Oklab. L in [0,1] is perceived lightness; a and b are
// opponent green-red and blue-yellow axes.
type Lab struct {
	L, A, B float64
}

// LCh is a color in the cylindrical form of Oklab (OKLCH). L in [0,1] is
// perceived lightness, C >= 0 is chroma, and H in degrees places the hue on
// the a/b plane (H=0 points along +a, towards red-pink).
type LCh struct {
	L, C, H float64
}

// ToLCh converts a Lab color to its cylindrical OKLCH representation.
func (lab Lab) ToLCh() LCh {
	return LCh{
		L: lab.L,
		C: math.Hypot(lab.A, lab.B),
		H: math.Mod(math.Atan2(lab.B, lab.A)*180/math.Pi+360, 360),
	}
}

// ToLab converts an OKLCH color back to rectangular Oklab.
func (c LCh) ToLab() Lab {
	h := c.H * math.Pi / 180
	return Lab{
		L: c.L,
		A: c.C * math.Cos(h),
		B: c.C * math.Sin(h),
	}
}

// LinearSRGBToLab converts linear sRGB coordinates (each in [0,1] for in-gamut
// colors) to Oklab, using the reference matrices from the Oklab spec.
func LinearSRGBToLab(r, g, b float64) Lab {
	l := 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
	m := 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
	s := 0.0883024619*r + 0.2817188376*g + 0.6299787005*b

	// Oklab applies a cube-root non-linearity to the LMS-like intermediates.
	l_ := math.Cbrt(l)
	m_ := math.Cbrt(m)
	s_ := math.Cbrt(s)

	return Lab{
		L: 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
		A: 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
		B: 0.0259040371*l_ + 0.7827717662*m_ - 0.8086297750*s_,
	}
}

// LabToLinearSRGB converts Oklab back to linear sRGB. Channels may fall
// outside [0,1] when the color is outside the sRGB gamut.
func LabToLinearSRGB(lab Lab) (r, g, b float64) {
	l_ := lab.L + 0.3963377774*lab.A + 0.2158037573*lab.B
	m_ := lab.L - 0.1055613458*lab.A - 0.0638541728*lab.B
	s_ := lab.L - 0.0894841775*lab.A - 1.2914855480*lab.B

	l := l_ * l_ * l_
	m := m_ * m_ * m_
	s := s_ * s_ * s_

	r = 4.0767416621*l - 3.3077115913*m + 0.2309699292*s
	g = -1.2684380046*l + 2.6097574011*m - 0.3413192767*s
	b = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
	return r, g, b
}

// encodeGamma applies the sRGB transfer function to one linear channel.
func encodeGamma(c float64) float64 {
	if c <= 0.0031308 {
		return 12.92 * c
	}
	return 1.055*math.Pow(c, 1/2.4) - 0.055
}

// decodeGamma inverts the sRGB transfer function for one encoded channel.
func decodeGamma(c float64) float64 {
	if c <= 0.04045 {
		return c / 12.92
	}
	return math.Pow((c+0.055)/1.055, 2.4)
}

// HexFromLinear renders linear sRGB channels as a 6-digit lowercase hex
// string, clamping out-of-range values into the gamut.
func HexFromLinear(r, g, b float64) string {
	toByte := func(c float64) byte {
		return byte(math.Round(math.Min(math.Max(encodeGamma(c), 0), 1) * 255))
	}
	return fmt.Sprintf("#%02x%02x%02x", toByte(r), toByte(g), toByte(b))
}

// Hex renders an Oklab color as a 6-digit lowercase hex string. Out-of-gamut
// channels are clamped, so prefer FitChroma first for palette generation.
func (lab Lab) Hex() string {
	r, g, b := LabToLinearSRGB(lab)
	return HexFromLinear(r, g, b)
}

// Simulate applies a 3x3 row-major matrix to this color's linear sRGB
// channels and returns the clamped result as a new Lab. This is how color
// vision deficiency simulations work: the matrices are defined for linear
// light, not gamma-encoded values.
func (lab Lab) Simulate(m [9]float64) Lab {
	r, g, b := LabToLinearSRGB(lab)
	return LinearSRGBToLab(
		clamp01(m[0]*r+m[1]*g+m[2]*b),
		clamp01(m[3]*r+m[4]*g+m[5]*b),
		clamp01(m[6]*r+m[7]*g+m[8]*b),
	)
}

func clamp01(c float64) float64 {
	return math.Min(math.Max(c, 0), 1)
}

// RelativeLuminance returns the WCAG relative luminance of the clamped color
// (linear combination of the linear sRGB channels), used to pick readable
// text colors on swatches.
func (lab Lab) RelativeLuminance() float64 {
	r, g, b := LabToLinearSRGB(lab)
	r, g, b = clamp01(r), clamp01(g), clamp01(b)
	return 0.2126*r + 0.7152*g + 0.0722*b
}

// inGamut reports whether the OKLCH color maps to linear sRGB channels all
// within [0,1] (with a small epsilon for float noise).
func inGamut(lab Lab) bool {
	eps := 1e-6
	r, g, b := LabToLinearSRGB(lab)
	return r >= -eps && r <= 1+eps && g >= -eps && g <= 1+eps && b >= -eps && b <= 1+eps
}

// FitChroma returns the largest chroma no greater than c such that the OKLCH
// color (L, C, H) fits inside the sRGB gamut. L and H are held fixed so that
// lightness and hue relationships survive the fit: this is what keeps
// perceived luminosity consistent across hues even after gamut clipping.
// It assumes L itself is representable (roughly [0,1]).
func FitChroma(L, H, c float64) float64 {
	if c <= 0 {
		return 0
	}
	// A tiny tolerance keeps near-white/near-black fits from collapsing to 0
	// when rounding noise alone pushes a channel epsilon out of range.
	tol := 1e-4
	if inGamut(LCh{L: L, C: c + tol, H: H}.ToLab()) {
		return c
	}
	lo, hi := 0.0, c
	for i := 0; i < 24; i++ {
		mid := (lo + hi) / 2
		if inGamut(LCh{L: L, C: mid, H: H}.ToLab()) {
			lo = mid
		} else {
			hi = mid
		}
	}
	return lo
}
