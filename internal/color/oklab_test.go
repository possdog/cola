package color

import (
	"fmt"
	"math"
	"testing"
)

const tolerance = 1e-3

func TestLabWhiteAndBlack(t *testing.T) {
	if got := (Lab{L: 1}).Hex(); got != "#ffffff" {
		t.Errorf("Lab white hex = %s, want #ffffff", got)
	}
	if got := (Lab{}).Hex(); got != "#000000" {
		t.Errorf("Lab black hex = %s, want #000000", got)
	}
}

func TestSRGBRedToLab(t *testing.T) {
	// Reference value from the Oklab spec's example table.
	lab := LinearSRGBToLab(decodeGamma(1), decodeGamma(0), decodeGamma(0))
	want := Lab{L: 0.62796, A: 0.22486, B: 0.12585}
	if math.Abs(lab.L-want.L) > tolerance || math.Abs(lab.A-want.A) > tolerance || math.Abs(lab.B-want.B) > tolerance {
		t.Errorf("sRGB red -> Lab = %+v, want %+v", lab, want)
	}
}

// hexToLinear parses a 6-digit hex color into linear sRGB channels.
func hexToLinear(t *testing.T, hex string) (r, g, b float64) {
	t.Helper()
	var rr, gg, bb uint8
	if _, err := fmt.Sscanf(hex, "#%02x%02x%02x", &rr, &gg, &bb); err != nil {
		t.Fatalf("parse %s: %v", hex, err)
	}
	return decodeGamma(float64(rr) / 255), decodeGamma(float64(gg) / 255), decodeGamma(float64(bb) / 255)
}

func TestLabRoundTrip(t *testing.T) {
	// Round-tripping through the matrices must be stable for a spread of
	// in-gamut colors, including highly chromatic ones.
	for _, hex := range []string{"#ff0000", "#00ff00", "#0000ff", "#fffcf0", "#1c1b1a", "#af302e", "#2489ca"} {
		r, g, b := hexToLinear(t, hex)
		lab := LinearSRGBToLab(r, g, b)
		rr, gg, bb := LabToLinearSRGB(lab)
		if math.Abs(r-rr) > tolerance || math.Abs(g-gg) > tolerance || math.Abs(b-bb) > tolerance {
			t.Errorf("round trip %s: got (%.4f, %.4f, %.4f), want (%.4f, %.4f, %.4f)", hex, rr, gg, bb, r, g, b)
		}
	}
}

func TestLChRoundTrip(t *testing.T) {
	lab := Lab{L: 0.62, A: 0.15, B: -0.1}
	lch := lab.ToLCh()
	back := lch.ToLab()
	if math.Abs(lab.L-back.L) > tolerance || math.Abs(lab.A-back.A) > tolerance || math.Abs(lab.B-back.B) > tolerance {
		t.Errorf("LCh round trip: got %+v, want %+v", back, lab)
	}
}

func TestFitChroma(t *testing.T) {
	// A modest chroma at mid lightness fits unchanged.
	if got := FitChroma(0.6, 30, 0.05); math.Abs(got-0.05) > 1e-4 {
		t.Errorf("FitChroma(0.6, 30, 0.05) = %v, want 0.05", got)
	}
	// A huge chroma gets reduced to the gamut boundary, and pushing just
	// past the result must leave the gamut.
	got := FitChroma(0.5, 30, 0.5)
	if got <= 0 || got >= 0.5 {
		t.Fatalf("FitChroma(0.5, 30, 0.5) = %v, want a value in (0, 0.5)", got)
	}
	if inGamut(LCh{L: 0.5, C: got + 1e-3, H: 30}.ToLab()) {
		t.Errorf("chroma %v + eps should be out of gamut", got)
	}
	if !inGamut(LCh{L: 0.5, C: got, H: 30}.ToLab()) {
		t.Errorf("fitted chroma %v should be in gamut", got)
	}
	// Near-white/near-black lightness tolerates only very low chroma.
	if got := FitChroma(0.99, 110, 0.2); got > 0.05 {
		t.Errorf("FitChroma(0.99, 110, 0.2) = %v, want <= 0.05", got)
	}
	if FitChroma(0.5, 30, 0) != 0 {
		t.Errorf("FitChroma with c=0 should return 0")
	}
}
