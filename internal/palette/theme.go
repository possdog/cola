package palette

// Theme is the app UI's own color scheme, dogfooded straight from the
// generated palette: every value is an existing swatch, so the interface
// restyles itself live as the palette is edited.
type Theme struct {
	Bg      string `json:"bg"`
	Panel   string `json:"panel"`
	Raised  string `json:"raised"`
	Track   string `json:"track"`
	Border  string `json:"border"`
	Text    string `json:"text"`
	TextDim string `json:"textDim"`
	Accent  string `json:"accent"`
	Danger  string `json:"danger"`
}

// swatchHex returns the hex of the named color at the given level, falling
// back to the closest available level. ok is false when the palette has no
// row with that name at all.
func (p Palette) swatchHex(name string, level int) (hex string, ok bool) {
	var row *ColorResult
	for i := range p.Colors {
		if p.Colors[i].Name == name {
			row = &p.Colors[i]
			break
		}
	}
	if row == nil {
		return "", false
	}
	// A row with no swatches (possible in a caller-built Palette, never in
	// one from Generate) must fall through to the same "not found" path
	// rather than index out of range below.
	if len(row.Swatches) == 0 {
		return "", false
	}
	best, bestDist := 0, 1<<30
	for i, s := range row.Swatches {
		if dist := abs(s.Level - level); dist < bestDist {
			best, bestDist = i, dist
		}
	}
	return row.Swatches[best].Hex, true
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

// Theme maps palette swatches onto the UI's CSS variables. It returns nil
// when the palette has no base row (e.g. a partial POST dropped it), in
// which case the client keeps the stylesheet's built-in fallback colors.
func (p Palette) Theme() *Theme {
	bg, ok := p.swatchHex("base", 950)
	if !ok {
		return nil
	}
	panel, _ := p.swatchHex("base", 900)
	raised, _ := p.swatchHex("base", 850)
	// Slider tracks are thin 4px bars, too small for the one-level step
	// between panel and raised to read; two levels above raised keeps them
	// visible against the panel (the ramp has no 750, and one level would
	// land exactly on the border color).
	track, _ := p.swatchHex("base", 700)
	border, _ := p.swatchHex("base", 800)
	text, _ := p.swatchHex("base", 100)
	dim, _ := p.swatchHex("base", 400)
	// Accent and danger fall back to the base ramp when their rows are
	// absent, so every slot is always a real swatch.
	accent, ok := p.swatchHex("cyan", 400)
	if !ok {
		accent, _ = p.swatchHex("base", 300)
	}
	danger, ok := p.swatchHex("red", 400)
	if !ok {
		danger, _ = p.swatchHex("base", 600)
	}
	return &Theme{
		Bg:      bg,
		Panel:   panel,
		Raised:  raised,
		Track:   track,
		Border:  border,
		Text:    text,
		TextDim: dim,
		Accent:  accent,
		Danger:  danger,
	}
}
