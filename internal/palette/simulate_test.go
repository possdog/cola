package palette

import (
	"math"
	"strconv"
	"testing"

	"cola/internal/color"
)

func swatchOf(p Palette, name string, level int) Swatch {
	for _, row := range p.Colors {
		if row.Name == name {
			for _, s := range row.Swatches {
				if s.Level == level {
					return s
				}
			}
		}
	}
	panic("swatch not found: " + name + " " + strconv.Itoa(level))
}

func TestApplyFiltersGrayscaleColumnsUniform(t *testing.T) {
	// The whole point of the grayscale filter: at constant Oklab lightness,
	// every row in a column must render as the identical gray.
	p := Generate(DefaultState())
	g := ApplyFilters(p, []string{FilterGrayscale}, FilterOptions{})
	for col := range Levels {
		first := g.Colors[0].Swatches[col].Hex
		for _, row := range g.Colors {
			if got := row.Swatches[col].Hex; got != first {
				t.Errorf("level %d column not uniform: %s row shows %s, want %s",
					Levels[col], row.Name, got, first)
			}
		}
	}
	// The original palette must not be mutated.
	if swatchOf(p, "red", 500).Hex == swatchOf(g, "red", 500).Hex {
		t.Error("filtered palette shares swatches with the original")
	}
}

func TestApplyFiltersGrayscaleKeepsL(t *testing.T) {
	p := Generate(DefaultState())
	g := ApplyFilters(p, []string{FilterGrayscale}, FilterOptions{})
	orig := swatchOf(p, "red", 500)
	got := swatchOf(g, "red", 500)
	if got.L != orig.L {
		t.Errorf("grayscale changed lightness: %v -> %v", orig.L, got.L)
	}
	want := color.LCh{L: orig.L, C: 0, H: orig.H}.ToLab().Hex()
	if got.Hex != want {
		t.Errorf("grayscale hex = %s, want %s", got.Hex, want)
	}
}

// rgbDistance is the Euclidean distance between two hex colors' byte values.
func rgbDistance(a, b string) float64 {
	dr := float64(a[1]) - float64(b[1])
	dg := float64(a[3]) - float64(b[3])
	db := float64(a[5]) - float64(b[5])
	return math.Sqrt(dr*dr + dg*dg + db*db)
}

func TestApplyFiltersCVDSimulations(t *testing.T) {
	p := Generate(DefaultState())
	red := swatchOf(p, "red", 500).Hex
	green := swatchOf(p, "green", 500).Hex

	// Deuteranopia (no green perception) collapses the red/green axis, so
	// red and green must move closer together.
	d := ApplyFilters(p, []string{FilterDeuteranopia}, FilterOptions{})
	dRed := swatchOf(d, "red", 500).Hex
	dGreen := swatchOf(d, "green", 500).Hex
	if rgbDistance(dRed, dGreen) >= rgbDistance(red, green) {
		t.Errorf("deuteranopia did not reduce red/green distance: %.1f -> %.1f",
			rgbDistance(red, green), rgbDistance(dRed, dGreen))
	}

	// Tritanopia (no blue perception) should barely affect the red/green
	// pair, whose blue components are small.
	tr := ApplyFilters(p, []string{FilterTritanopia}, FilterOptions{})
	trRed := swatchOf(tr, "red", 500).Hex
	trGreen := swatchOf(tr, "green", 500).Hex
	if rgbDistance(trRed, trGreen) < rgbDistance(red, green)*0.5 {
		t.Errorf("tritanopia unexpectedly collapsed red/green: %.1f -> %.1f",
			rgbDistance(red, green), rgbDistance(trRed, trGreen))
	}

	for _, f := range []string{FilterProtanopia, FilterDeuteranopia, FilterTritanopia} {
		for _, row := range ApplyFilters(p, []string{f}, FilterOptions{}).Colors {
			for _, s := range row.Swatches {
				if !hexRE.MatchString(s.Hex) {
					t.Errorf("%s: color %s level %d produced bad hex %q", f, row.Name, s.Level, s.Hex)
				}
			}
		}
	}
}

// byteAt parses one byte of a hex color, e.g. byteAt("#102030", 5) == 0x30
// (the blue byte), so assertions can compare channel values numerically
// instead of nibble by nibble.
func byteAt(hex string, i int) int {
	v, err := strconv.ParseUint(hex[i:i+2], 16, 8)
	if err != nil {
		panic("bad hex: " + hex)
	}
	return int(v)
}

func TestApplyFiltersBlueLight(t *testing.T) {
	p := Generate(DefaultState())
	origBlue := swatchOf(p, "blue", 500).Hex
	origRed := swatchOf(p, "red", 500).Hex

	// Intensity 0 must be a no-op even with the filter enabled.
	if got := ApplyFilters(p, []string{FilterBlueLight}, FilterOptions{}); !sameHexes(p, got) {
		t.Error("blue light at intensity 0 changed the palette")
	}

	// At full intensity the blue row's blue channel must drop sharply while
	// red barely moves (its blue component is tiny).
	warm := ApplyFilters(p, []string{FilterBlueLight}, FilterOptions{BlueLight: 1})
	if got := byteAt(swatchOf(warm, "blue", 500).Hex, 5); got >= byteAt(origBlue, 5) {
		t.Errorf("blue light did not dim the blue channel: %s blue byte %d -> %d", origBlue, byteAt(origBlue, 5), got)
	}
	if got := byteAt(swatchOf(warm, "red", 500).Hex, 5); got > byteAt(origRed, 5) {
		t.Errorf("blue light brightened red's blue channel: %s blue byte %d -> %d", origRed, byteAt(origRed, 5), got)
	}

	// The filter must run after grayscale: a gray column under blue light
	// becomes a warm-tinted (blue-dimmed) gray, not the original gray.
	gray := ApplyFilters(p, []string{FilterGrayscale}, FilterOptions{})
	warmGray := ApplyFilters(p, []string{FilterGrayscale, FilterBlueLight}, FilterOptions{BlueLight: 1})
	if got := byteAt(swatchOf(warmGray, "blue", 500).Hex, 5); got >= byteAt(swatchOf(gray, "blue", 500).Hex, 5) {
		t.Error("blue light did not dim the grayscale result")
	}

	// Out-of-range intensity is clamped, never brightens blue.
	over := ApplyFilters(p, []string{FilterBlueLight}, FilterOptions{BlueLight: 5})
	if got := byteAt(swatchOf(over, "blue", 500).Hex, 5); got >= byteAt(origBlue, 5) {
		t.Errorf("unclamped blue light brightened blue: %s blue byte %d -> %d", origBlue, byteAt(origBlue, 5), got)
	}
}

func TestApplyFiltersGrayscaleComposesWithCVD(t *testing.T) {
	// Grayscale must collapse the CVD-simulated color, not rebuild from the
	// original swatch: protanopia shifts a saturated red's Oklab lightness,
	// so gray+protanopia has to differ from plain grayscale somewhere.
	p := Generate(DefaultState())
	gray := swatchOf(ApplyFilters(p, []string{FilterGrayscale}, FilterOptions{}), "red", 500)
	composed := swatchOf(ApplyFilters(p, []string{FilterProtanopia, FilterGrayscale}, FilterOptions{}), "red", 500)
	if gray.Hex == composed.Hex {
		t.Errorf("gray+protanopia = plain grayscale for red-500 (%s); CVD output was discarded", gray.Hex)
	}
	// Desaturating keeps the color achromatic: equal RGB channels.
	if composed.Hex[1] != composed.Hex[3] || composed.Hex[3] != composed.Hex[5] {
		t.Errorf("gray+protanopia red-500 is not gray: %s", composed.Hex)
	}
}

func TestApplyFiltersUnknownAndNone(t *testing.T) {
	p := Generate(DefaultState())
	if got := ApplyFilters(p, nil, FilterOptions{}); !sameHexes(p, got) {
		t.Error("nil filters changed the palette")
	}
	if got := ApplyFilters(p, []string{"sepia"}, FilterOptions{}); !sameHexes(p, got) {
		t.Error("unknown filter changed the palette")
	}
}

func sameHexes(a, b Palette) bool {
	if len(a.Colors) != len(b.Colors) {
		return false
	}
	for i := range a.Colors {
		for j := range a.Colors[i].Swatches {
			if a.Colors[i].Swatches[j].Hex != b.Colors[i].Swatches[j].Hex {
				return false
			}
		}
	}
	return true
}
