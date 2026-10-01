package palette

import "testing"

func TestTheme(t *testing.T) {
	p := Generate(DefaultState())
	theme := p.Theme()
	if theme == nil {
		t.Fatal("Theme() = nil for the default palette")
	}
	check := func(slot, got string, name string, level int) {
		t.Helper()
		if want := hexOf(t, p, name, level); got != want {
			t.Errorf("theme %s = %s, want %s swatch %s-%d", slot, got, want, name, level)
		}
	}
	check("Bg", theme.Bg, "base", 950)
	check("Panel", theme.Panel, "base", 900)
	check("Raised", theme.Raised, "base", 850)
	check("Border", theme.Border, "base", 800)
	check("Text", theme.Text, "base", 100)
	check("TextDim", theme.TextDim, "base", 400)
	check("Accent", theme.Accent, "cyan", 400)
	check("Danger", theme.Danger, "red", 400)
}

func TestThemeMissingRows(t *testing.T) {
	// No base row: no theme at all.
	partial := Generate(DefaultState())
	partial.Colors = partial.Colors[1:]
	if theme := partial.Theme(); theme != nil {
		t.Error("Theme() non-nil without a base row")
	}

	// Base present but accent/danger rows absent: fall back to base swatches
	// so every slot is still a real color.
	baseOnly := Generate(DefaultState())
	baseOnly.Colors = baseOnly.Colors[:1]
	theme := baseOnly.Theme()
	if theme == nil {
		t.Fatal("Theme() = nil with only a base row")
	}
	if theme.Accent != hexOf(t, baseOnly, "base", 300) {
		t.Errorf("Accent = %s, want base-300 fallback", theme.Accent)
	}
	if theme.Danger != hexOf(t, baseOnly, "base", 600) {
		t.Errorf("Danger = %s, want base-600 fallback", theme.Danger)
	}

	// Partial level lists fall back to the closest level rather than
	// yielding an empty color.
	gappy := Generate(DefaultState())
	gappy.Colors[0].Swatches = gappy.Colors[0].Swatches[:1] // only level 50
	if theme := gappy.Theme(); theme.Bg != hexOf(t, gappy, "base", 50) {
		t.Errorf("Bg = %s, want closest swatch base-50", theme.Bg)
	}

	// A row with no swatches at all (possible in a caller-built Palette)
	// must behave like a missing row, not panic.
	empty := Generate(DefaultState())
	empty.Colors[0].Swatches = nil
	if theme := empty.Theme(); theme != nil {
		t.Error("Theme() non-nil with an empty base row")
	}
	emptyAccents := Generate(DefaultState())
	emptyAccents.Colors = emptyAccents.Colors[:1]
	emptyAccents.Colors[0].Swatches = nil
	if theme := emptyAccents.Theme(); theme != nil {
		t.Error("Theme() non-nil when the base row has no swatches")
	}
}

func hexOf(t *testing.T, p Palette, name string, level int) string {
	t.Helper()
	for _, c := range p.Colors {
		if c.Name != name {
			continue
		}
		for _, s := range c.Swatches {
			if s.Level == level {
				return s.Hex
			}
		}
	}
	t.Fatalf("palette has no %s-%d swatch", name, level)
	return ""
}
