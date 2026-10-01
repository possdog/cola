package palette

import (
	"math"

	"cola/internal/color"
)

// View filter names, as posted by the UI.
const (
	// FilterGrayscale drops chroma while keeping Oklab lightness fixed. That
	// is the exact luminosity-consistency check: every swatch in a column
	// must collapse to the identical gray, no matter which row it is from.
	FilterGrayscale    = "grayscale"
	FilterProtanopia   = "protanopia"
	FilterDeuteranopia = "deuteranopia"
	FilterTritanopia   = "tritanopia"
	FilterBlueLight    = "bluelight"
)

// FilterOptions carries the parameters of filters that need more than an
// on/off switch. Zero values are always safe.
type FilterOptions struct {
	// BlueLight is the blue light filter intensity, clamped to [0,1] by
	// ApplyFilters. It only applies while FilterBlueLight is in the filter
	// list; 0 leaves every swatch unchanged.
	BlueLight float64
}

// cvdMatrices are the severity-1.0 color vision deficiency simulation
// matrices from Machado, Oliveira & Fernandes (2009). They operate on
// linear sRGB channels (see Lab.Simulate).
var cvdMatrices = map[string][9]float64{
	FilterProtanopia: {
		0.152286, 1.052583, -0.204868,
		0.114503, 0.786281, 0.099216,
		-0.003882, -0.048116, 1.051998,
	},
	FilterDeuteranopia: {
		0.367322, 0.860646, -0.227968,
		0.280085, 0.672501, 0.047413,
		-0.011820, 0.042940, 0.968881,
	},
	FilterTritanopia: {
		1.255528, -0.076749, -0.178779,
		-0.078411, 0.930809, 0.147602,
		0.004733, 0.691367, 0.303900,
	},
}

// IsFilter reports whether name is a recognized view filter. Unknown names
// are ignored by the filter pipeline.
func IsFilter(name string) bool {
	if name == FilterGrayscale || name == FilterBlueLight {
		return true
	}
	_, ok := cvdMatrices[name]
	return ok
}

// blueLightMatrix scales the linear sRGB channels the way a warm screen
// filter (f.lux, Night Shift) does: red passes through untouched while
// green, and especially blue, are dimmed as the intensity rises. The
// per-channel scaling acts on linear light, which is what a physical filter
// over the display would do, and why the result warms rather than shifts
// hue mechanically. At intensity 1 blue keeps 15% and green 80%.
func blueLightMatrix(t float64) [9]float64 {
	return [9]float64{
		1, 0, 0,
		0, 1 - 0.20*t, 0,
		0, 0, 1 - 0.85*t,
	}
}

// cvdOrder is the fixed pipeline order when several filters are active at
// once. Grayscale runs after the CVD simulations so it collapses whatever
// the matrices produced; blue light runs last because it emulates a filter
// placed in front of the finished screen. The relative order of the CVD
// stages is arbitrary but must be deterministic.
var cvdOrder = []string{FilterProtanopia, FilterDeuteranopia, FilterTritanopia}

// ApplyFilters returns a copy of p with every swatch's hex (and luminance)
// replaced by its appearance under the given view filters. Swatch OKLCH
// coordinates are left untouched so tooltips still describe the real
// palette. Unknown filter names are ignored; with no applicable filter the
// original palette is returned unchanged.
func ApplyFilters(p Palette, filters []string, opts FilterOptions) Palette {
	active := make(map[string]bool, len(filters))
	for _, f := range filters {
		if IsFilter(f) {
			active[f] = true
		}
	}
	if len(active) == 0 {
		return p
	}
	blueLight := 0.0
	if active[FilterBlueLight] {
		// Clamp so a hostile or buggy client cannot brighten blue or
		// flip it negative; intensity 0 means the filter is a no-op.
		blueLight = math.Min(math.Max(opts.BlueLight, 0), 1)
	}

	out := Palette{Levels: p.Levels, Colors: make([]ColorResult, len(p.Colors))}
	for i, row := range p.Colors {
		nrow := ColorResult{Name: row.Name, Hue: row.Hue, Swatches: make([]Swatch, len(row.Swatches))}
		for j, s := range row.Swatches {
			lab := color.LCh{L: s.L, C: s.C, H: s.H}.ToLab()
			for _, f := range cvdOrder {
				if active[f] {
					lab = lab.Simulate(cvdMatrices[f])
				}
			}
			if active[FilterGrayscale] {
				// Collapse the current color — including any CVD result —
				// to its Oklab lightness, rather than rebuilding from the
				// original swatch: that would silently discard the
				// simulation and make gray+CVD identical to gray alone.
				lab = color.Lab{L: lab.L}
			}
			if blueLight > 0 {
				lab = lab.Simulate(blueLightMatrix(blueLight))
			}
			s.Hex = lab.Hex()
			s.Y = lab.RelativeLuminance()
			nrow.Swatches[j] = s
		}
		out.Colors[i] = nrow
	}
	return out
}
