// Theming: the app's own UI colors are palette swatches delivered with
// every response, applied as CSS variables. Because update() runs on every
// slider input, the interface restyles itself live alongside the grid
// (dogfooding).

const THEME_VARS = {
  bg: "--bg",
  panel: "--bg-panel",
  raised: "--bg-raised",
  border: "--border",
  text: "--text",
  textDim: "--text-dim",
  accent: "--accent",
  danger: "--danger",
};

function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(THEME_VARS)) {
    root.style.setProperty(cssVar, theme[key]);
  }
}

export { applyTheme };
