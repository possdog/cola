// Code preview tab: a tokenized TypeScript sample rendered three ways —
// a graphical editor, a terminal TUI, and a coding-agent chat TUI —
// colored entirely from the palette via hexOf.

import { $, esc } from "../util.js";
import { hexOf } from "../swatch.js";

// Code preview modes, modeled on the three environments a palette ships in:
// a graphical editor ("graphical", VS Code / Sublime style), a terminal TUI
// ("terminal", Neovim style), and a coding-agent chat TUI ("agent"). Like
// the wheel's layout modes this is a display-only preference: never
// persisted, never part of the exported state.
let codeMode = "graphical";

// A fixed TypeScript sample, hand-tokenized as [type, text] pairs. Keeping
// tokens explicit avoids shipping a regex tokenizer for one static snippet;
// the renderers only swap in the palette-derived colors. Token classes are
// chosen so all nine rows get work: base for chrome and comments, and one
// chromatic row per token type — including purple module constants (decl)
// and magenta template interpolations (tpl).
const CODE_SAMPLE = [
  [["com", "// palette.ts — one ramp per semantic name"]],
  [["kw", "import"], ["p", " { "], ["fn", "oklch"], ["p", ", "], ["fn", "hex"], ["p", " } "], ["kw", "from"], ["str", ' "../color"'], ["p", ";"]],
  [],
  [["com", "// Thirteen steps of equal perceived lightness, so any"]],
  [["com", "// two levels pair with a predictable contrast."]],
  [["kw", "export"], ["p", " "], ["kw", "interface"], ["p", " "], ["type", "Ramp"], ["p", " {"]],
  [["p", "  "], ["prop", "name"], ["p", ": "], ["type", "string"], ["p", ";"]],
  [["p", "  "], ["prop", "levels"], ["p", ": "], ["type", "Record"], ["p", "<"], ["type", "number"], ["p", ", "], ["type", "string"], ["p", ">;"]],
  [["p", "}"]],
  [],
  [["kw", "export"], ["p", " "], ["kw", "function"], ["p", " "], ["fn", "ramp"], ["p", "("], ["prop", "name"], ["p", ": "], ["type", "string"], ["p", ", "], ["prop", "spec"], ["p", ": "], ["type", "Spec"], ["p", "): "], ["type", "Ramp"], ["p", " {"]],
  [["p", "  "], ["kw", "const"], ["p", " "], ["prop", "levels"], ["p", " = {};"]],
  [["p", "  "], ["kw", "for"], ["p", " ("], ["kw", "const"], ["p", " "], ["prop", "step"], ["p", " "], ["kw", "of"], ["p", " "], ["prop", "STEPS"], ["p", ") {"]],
  [["p", "    "], ["prop", "levels"], ["p", "["], ["prop", "step"], ["p", "] = "], ["fn", "hex"], ["p", "("], ["fn", "oklch"], ["p", "("], ["prop", "spec"], ["p", ", "], ["prop", "step"], ["p", "));"]],
  [["p", "  }"]],
  [["p", "  "], ["kw", "return"], ["p", " { "], ["prop", "name"], ["p", ", "], ["prop", "levels"], ["p", " };"]],
  [["p", "}"]],
  [],
  [["kw", "const"], ["p", " "], ["prop", "teal"], ["p", " = "], ["fn", "ramp"], ["p", "("], ["str", '"cyan"'], ["p", ", { "], ["prop", "hue"], ["p", ": "], ["num", "195"], ["p", ", "], ["prop", "chroma"], ["p", ": "], ["num", "0.12"], ["p", " });"]],
  [["kw", "const"], ["p", " "], ["prop", "gray"], ["p", " = "], ["fn", "ramp"], ["p", "("], ["str", '"base"'], ["p", ", { "], ["prop", "hue"], ["p", ": "], ["num", "90"], ["p", ", "], ["prop", "chroma"], ["p", ": "], ["num", "0.006"], ["p", " });"]],
  [],
  [["kw", "export"], ["p", " "], ["kw", "const"], ["p", " "], ["prop", "palette"], ["p", " = { "], ["prop", "gray"], ["p", ", "], ["prop", "teal"], ["p", " };"]],
  [],
  [["com", "// Pairing helper: level-800 ink on a level-100 ground."]],
  [["kw", "export"], ["p", " "], ["kw", "function"], ["p", " "], ["fn", "pairing"], ["p", "("], ["prop", "name"], ["p", ": "], ["type", "string"], ["p", "): "], ["type", "string"], ["p", " {"]],
  [["p", "  "], ["kw", "return"], ["p", " `"], ["tpl", "${name}"], ["p", "-800 on "], ["tpl", "${name}"], ["p", "-100`;"]],
  [["p", "}"]],
  [],
  [["kw", "export"], ["p", " "], ["kw", "const"], ["p", " "], ["decl", "PAIRINGS"], ["p", " ["], ["str", '"pairing"'], ["p", ", "], ["str", '"oklch"'], ["p", ", "], ["str", '"flexoki"'], ["p", "];"]],
];

// Token colors, shared by all three environments: a keyword is red-400 in a
// GUI editor and in a terminal TUI alike, so switching modes shows the same
// token mapping across very different surfaces.
function codeTokenColors() {
  return {
    kw: hexOf("red", 400),
    type: hexOf("cyan", 400),
    fn: hexOf("blue", 400),
    str: hexOf("green", 400),
    num: hexOf("orange", 400),
    prop: hexOf("yellow", 300),
    decl: hexOf("purple", 300),
    tpl: hexOf("magenta", 400),
    com: hexOf("base", 500),
    p: hexOf("base", 100),
  };
}

// Render a tokenized sample as one HTML string per line. `match` lets a mode
// decorate individual tokens (the terminal's search highlight): it receives
// the line index and token, and returns extra inline CSS for matches.
function codeLines(sample, colors, match) {
  return sample.map((line, li) =>
    line
      .map(([t, text]) => {
        const extra = match ? match(li, t, text) : "";
        return `<span style="${extra}color:${colors[t] || colors.p}">${esc(text)}</span>`;
      })
      .join("")
  );
}

// Graphical mode: a modern editor window in the VS Code / Sublime mold.
// Chrome comes from the base ramp's dark end, and every chromatic row gets
// a job beyond the tokens themselves — activity icons, file-type dots, the
// tab dot, status-bar branch/problems — so the whole IDE reads from the
// palette being designed.
function renderCodeGraphical() {
  const tc = codeTokenColors();
  const lines = codeLines(CODE_SAMPLE, tc).join("\n");
  const gutter = CODE_SAMPLE.map((_, i) => `<span>${i + 1}</span>`).join("");

  // Activity rail: one icon per chromatic row at its 400 step (dimmed to 500
  // when inactive), the active one raised like VS Code's selection. The
  // icons are inline SVG strokes so they take `currentColor` from the row.
  const icons = [
    ["blue", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3.5 1.5h5l3 3v10h-8z"/><path d="M8.5 1.5v3h3"/></svg>', true],
    ["cyan", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6.5" cy="6.5" r="4"/><path d="M9.7 9.7 14 14"/></svg>'],
    ["green", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="5" cy="4" r="1.8"/><circle cx="5" cy="12" r="1.8"/><path d="M5 6v4"/><circle cx="11.5" cy="8" r="1.8"/></svg>'],
    ["orange", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="4.2" height="4.2"/><rect x="8.8" y="3" width="4.2" height="4.2"/><rect x="3" y="8.8" width="4.2" height="4.2"/><rect x="8.8" y="8.8" width="4.2" height="4.2"/></svg>'],
    ["purple", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5h3"/></svg>'],
  ];
  const rail = icons
    .map(([row, svg, active]) =>
      `<span class="ed-icon${active ? " active" : ""}" style="color:${hexOf(row, active ? 400 : 500)};${active ? `background:${hexOf("base", 800)};` : ""}">${svg}</span>`
    )
    .join("");

  // Sidebar tree: a type dot per file (one row each at 400), a blue
  // selection bar on the open file, and a yellow git-modified marker —
  // the "M" real editors tint from the theme's modified color.
  const file = (name, row, opts = {}) =>
    `<div class="ed-file${opts.active ? " active" : ""}"${opts.active ? ` style="background:${hexOf("base", 800)};box-shadow:inset 2px 0 0 ${hexOf("blue", 400)}"` : ""}><span class="ed-dot" style="background:${hexOf(row, 400)}"></span><span style="color:${hexOf("base", opts.active ? 100 : 400)}">${name}</span>${opts.dirty ? `<span class="ed-mod" style="color:${hexOf("yellow", 400)}">M</span>` : ""}</div>`;
  const side = `
    <div class="ed-side-head" style="color:${hexOf("base", 500)}">cola</div>
    <div class="ed-side-head" style="color:${hexOf("base", 500)}">src</div>
    ${file("main.go", "blue")}
    ${file("oklab.go", "cyan")}
    ${file("generate.go", "green")}
    ${file("theme.go", "purple")}
    ${file("palette.ts", "magenta", { active: true })}
    ${file("state.json", "orange", { dirty: true })}
    <div class="ed-side-head" style="color:${hexOf("base", 500)}">static</div>
    ${file("app.js", "yellow")}
    ${file("style.css", "red")}
    ${file("README.md", "green")}`;

  // Tabs: the active one merges into the editor background with the file's
  // own row color as its underline — the per-file accent a theme needs.
  const tab = (name, row, active) =>
    `<div class="ed-tab${active ? " active" : ""}"${active ? ` style="background:${hexOf("base", 950)};box-shadow:inset 0 -2px 0 ${hexOf(row, 400)};color:${hexOf("base", 100)}"` : ` style="color:${hexOf("base", 400)}"`}><span class="ed-dot" style="background:${hexOf(row, 400)}"></span>${name}</div>`;

  // Minimap: one 2px bar per token, as wide as the token is long, in the
  // token's own color — the syntax scheme seen from across the room.
  // Whitespace-only tokens take the gutter gray so indentation still reads.
  const minimap = CODE_SAMPLE.map((line) =>
    line.length
      ? `<div class="mm-line">${line.map(([t, text]) => `<span style="width:${Math.min(text.length, 24) * 2}px;background:${text.trim() ? tc[t] || tc.p : hexOf("base", 700)}"></span>`).join("")}</div>`
      : `<div class="mm-line"></div>`
  ).join("");

  // Status bar: the brand-colored strip VS Code themes — here blue-600
  // carrying level-50 ink, with branch and problem counts as colored dots.
  const status = `
    <span class="st-item"><span class="st-dot" style="background:${hexOf("green", 300)}"></span>main*</span>
    <span class="st-item"><span class="st-dot" style="background:${hexOf("red", 300)}"></span>0</span>
    <span class="st-item"><span class="st-dot" style="background:${hexOf("yellow", 300)}"></span>2</span>
    <span class="grow"></span>
    <span>Ln 15, Col 24</span><span>Spaces: 2</span><span>UTF-8</span><span>LF</span><span>TypeScript</span>`;

  return `
    <div class="ide">
      <div class="window-bar" style="background:${hexOf("base", 900)}">
        <span class="light" style="background:${hexOf("red", 400)}"></span>
        <span class="light" style="background:${hexOf("yellow", 400)}"></span>
        <span class="light" style="background:${hexOf("green", 400)}"></span>
        <span class="window-title" style="color:${hexOf("base", 300)}">palette.ts — cola</span>
      </div>
      <div class="ide-body">
        <div class="ed-activity" style="background:${hexOf("base", 950)}">${rail}</div>
        <aside class="ed-side" style="background:${hexOf("base", 900)}">${side}</aside>
        <div class="ed-main">
          <div class="ed-tabs" style="background:${hexOf("base", 850)};border-bottom-color:${hexOf("base", 800)}">
            ${tab("palette.ts", "magenta", true)}
            ${tab("oklab.go", "cyan", false)}
          </div>
          <div class="ed-crumbs" style="background:${hexOf("base", 950)}"><span style="color:${hexOf("cyan", 400)}">src</span><span style="color:${hexOf("base", 600)}">›</span><span style="color:${hexOf("magenta", 400)}">palette.ts</span></div>
          <div class="window-body" style="background:${hexOf("base", 950)}">
            <div class="code-gutter" style="color:${hexOf("base", 700)}">${gutter}</div>
            <pre class="code"><code>${lines}</code></pre>
            <div class="ed-minimap" style="background:${hexOf("base", 950)};border-left-color:${hexOf("base", 800)}">${minimap}</div>
          </div>
          <div class="ed-status" style="background:${hexOf("blue", 600)};color:${hexOf("base", 50)}">${status}</div>
        </div>
      </div>
    </div>`;
}

// Terminal mode: a Neovim-style TUI on a base-950 screen. The terminal is
// where a colorscheme's structural pairings show up — cursorline, inverted
// search match, completion selection row, statusline mode blocks — drawn
// from the same ramps the GUI theme used.
const TERM_CURSOR = 15; // 1-based sample line the cursorline sits on
const TERM_MATCH = 13; // 1-based sample line carrying the search match

function renderCodeTerminal() {
  const tc = codeTokenColors();
  const lines = codeLines(CODE_SAMPLE, tc, (li, t, text) =>
    // Search match: the inverted pairing (light ground, dark ink) every
    // colorscheme must keep legible, here yellow-300 onto base-950 ink.
    li + 1 === TERM_MATCH && t === "fn" && text === "oklch"
      ? `background:${hexOf("yellow", 300)};color:${hexOf("base", 950)};`
      : ""
  );
  const rows = lines
    .map((html, li) => {
      const cursor = li + 1 === TERM_CURSOR;
      const numColor = cursor ? hexOf("cyan", 400) : hexOf("base", 600);
      return `<div class="term-row"${cursor ? ` style="background:${hexOf("base", 900)}"` : ""}><span class="term-num" style="color:${numColor}">${li + 1}</span><span class="term-code">${html || " "}</span></div>`;
    })
    .join("");

  // Command line with a floating completion menu: the selected row is the
  // accent pairing (cyan-600 ground, level-50 ink) a menu always needs,
  // the rest dimmed like any non-focused entry.
  const pop = ["cola_night", "cola_dawn", "cola_paper"]
    .map((name, i) =>
      i === 0
        ? `<span class="term-pop-item" style="background:${hexOf("cyan", 600)};color:${hexOf("base", 50)}">${name}</span>`
        : `<span class="term-pop-item" style="color:${hexOf("base", 300)}">${name}</span>`
    )
    .join("");
  const cmd = `
    <div class="term-cmd"><span style="color:${hexOf("base", 400)}">:</span><span style="color:${hexOf("base", 100)}">Colorscheme cola_</span><span class="term-cursor" style="background:${hexOf("base", 300)}"></span></div>
    <div class="term-pop" style="background:${hexOf("base", 900)};border-color:${hexOf("base", 700)}">${pop}</div>`;

  // Statusline: lualine-style blocks — the blue-600 NORMAL block is the
  // classic brand-ground/light-ink pairing, with the git branch, red/yellow
  // diagnostics, and position each in their semantic row.
  const status = `
    <span class="term-block" style="background:${hexOf("blue", 600)};color:${hexOf("base", 50)}">NORMAL</span>
    <span class="term-block" style="background:${hexOf("base", 800)};color:${hexOf("base", 100)}">palette.ts</span>
    <span style="color:${hexOf("green", 400)}">main*</span>
    <span style="color:${hexOf("red", 400)}">E1</span>
    <span style="color:${hexOf("yellow", 400)}">W2</span>
    <span class="grow"></span>
    <span style="color:${hexOf("cyan", 400)}">TypeScript</span>
    <span style="color:${hexOf("base", 400)}">utf-8</span>
    <span style="color:${hexOf("base", 300)}">Ln ${TERM_CURSOR}:24</span>
    <span style="color:${hexOf("base", 300)}">52%</span>`;

  return `
    <div class="term" style="background:${hexOf("base", 950)};border-color:${hexOf("base", 700)}">
      <div class="term-scroll">${rows}${cmd}</div>
      <div class="term-status" style="background:${hexOf("base", 900)};border-top-color:${hexOf("base", 800)}">${status}</div>
    </div>`;
}

// Agent mode: a coding-agent chat TUI. An agent UI leans on semantic pairs
// the palette must keep distinct — green adds against red deletes, green
// allow against red deny, yellow warnings — all over the base ramp's dark
// end, which is exactly where those pairings are hardest to hold.
function renderCodeAgent() {
  const tc = codeTokenColors();

  // Tool boxes: the verb in the agent's brand row (cyan), the body on
  // base-900. The Read box shows a slice of the same sample file, tokenized
  // with the same colors, so the agent demonstrably reads what the other
  // modes show.
  const toolBox = (verb, target, body, foot) =>
    `<div class="agent-tool" style="border-color:${hexOf("base", 700)}"><div class="agent-tool-head" style="background:${hexOf("base", 900)};border-bottom-color:${hexOf("base", 700)}"><span style="color:${hexOf("cyan", 400)}">${verb}</span><span style="color:${hexOf("base", 300)}">${target}</span></div><div class="agent-tool-body" style="background:${hexOf("base", 900)}">${body}</div>${foot ? `<div class="agent-tool-foot" style="background:${hexOf("base", 900)};border-top-color:${hexOf("base", 700)};color:${hexOf("base", 500)}">${foot}</div>` : ""}</div>`;

  const readBody = codeLines(CODE_SAMPLE.slice(10, 16), tc)
    .map((l) => `<span class="tline">${l || " "}</span>`)
    .join("");

  // Diff body: deletions and additions as the classic red/green pairs —
  // the 950 grounds are why every ramp needs a dark end at all.
  const diff = (sign, text, row) =>
    `<span class="tline" style="background:${hexOf(row, 950)};color:${hexOf(row, 400)}">${sign} ${text}</span>`;
  const editBody = [
    diff("-", 'const GROUND = level("yellow", 200);', "red"),
    diff("+", 'const GROUND = level("yellow", 300);', "green"),
  ].join("");

  // Plan box: done items checked in green, the running one marked in
  // yellow, pending ones dimmed — three states, three rows.
  const todoRow = (mark, markColor, text, textColor) =>
    `<div class="agent-todo"><span style="color:${markColor}">[${mark}]</span><span style="color:${textColor}">${text}</span></div>`;
  const plan = [
    todoRow("x", hexOf("green", 400), "Locate the search highlight definition", hexOf("base", 400)),
    todoRow("x", hexOf("green", 400), "Re-check the pairing under grayscale", hexOf("base", 400)),
    todoRow(">", hexOf("yellow", 400), "Swap level 200 for level 300 in palette.ts", hexOf("base", 100)),
    todoRow(" ", hexOf("base", 600), "Verify contrast stays above 4.5:1", hexOf("base", 300)),
  ].join("");

  const say = (html) => `<div class="agent-say" style="color:${hexOf("base", 200)}">${html}</div>`;
  const ref = (text) => `<code style="background:${hexOf("base", 800)};color:${hexOf("cyan", 300)};padding:1px 5px;border-radius:4px">${text}</code>`;

  // Permission prompt: the yellow-bordered warning carrying the allow/deny
  // pair in green/red — the decision a user must never misread.
  const perm = `
    <div class="agent-perm" style="border-color:${hexOf("yellow", 500)};background:${hexOf("base", 900)}">
      <div class="agent-perm-title" style="color:${hexOf("base", 100)}">Edit palette.ts</div>
      <div style="color:${hexOf("base", 500)}">1 line changed — allow this edit?</div>
      <div class="agent-perm-opts">
        <span><b style="color:${hexOf("green", 400)}">y</b> <span style="color:${hexOf("base", 300)}">allow</span></span>
        <span><b style="color:${hexOf("red", 400)}">n</b> <span style="color:${hexOf("base", 300)}">deny</span></span>
        <span><b style="color:${hexOf("cyan", 400)}">a</b> <span style="color:${hexOf("base", 300)}">always for this file</span></span>
      </div>
    </div>`;

  return `
    <div class="agent" style="background:${hexOf("base", 950)};border-color:${hexOf("base", 700)}">
      <div class="agent-scroll">
        <div class="agent-banner" style="border-bottom-color:${hexOf("base", 800)}">
          <span style="color:${hexOf("cyan", 400)};font-weight:700">cola agent</span>
          <span style="color:${hexOf("base", 600)}">v0.4.0</span>
          <span class="grow"></span>
          <span style="color:${hexOf("base", 600)}">cola/palette</span>
        </div>
        <div class="agent-user"><span style="color:${hexOf("magenta", 400)}">></span><span style="color:${hexOf("base", 100)}">The search highlight reads thin — can we use level 300 instead of 200?</span></div>
        ${say(`The 200 ground keeps its chroma but loses contrast against the ink. Checking the definition in ${ref("palette.ts")} first.`)}
        ${toolBox("Read", "palette.ts (1-29)", readBody, "29 lines")}
        ${toolBox("Plan", "4 items", plan, "")}
        ${say(`The highlight pins its ground to level 200. One-line change:`)}
        ${toolBox("Edit", "palette.ts", editBody, "1 line changed")}
        ${say(`Level 300 keeps the yellow's chroma and stays the darkest cell in its row under grayscale — the pairing holds.`)}
        ${perm}
      </div>
      <div class="agent-foot" style="border-top-color:${hexOf("base", 800)}">
        <div class="agent-usage">
          <div class="agent-usage-bar" style="background:${hexOf("base", 900)}"><span style="width:9%;background:${hexOf("green", 500)}"></span></div>
          <span style="color:${hexOf("base", 500)}">18k / 200k tokens</span>
        </div>
        <div class="agent-input">
          <span style="color:${hexOf("cyan", 400)}">></span>
          <span class="agent-caret" style="background:${hexOf("base", 400)}"></span>
          <span style="color:${hexOf("base", 600)}">Reply, or press Esc to interrupt…</span>
        </div>
      </div>
    </div>`;
}

export function renderCode() {
  const btn = (m, label) =>
    `<button type="button" class="code-mode-btn${codeMode === m ? " active" : ""}" aria-pressed="${codeMode === m}" data-mode="${m}">${label}</button>`;
  const body =
    codeMode === "terminal" ? renderCodeTerminal() : codeMode === "agent" ? renderCodeAgent() : renderCodeGraphical();
  $("#code-preview").innerHTML = `
    <div class="code-mode" role="group" aria-label="Code environment">
      ${btn("graphical", "Graphical")}${btn("terminal", "Terminal")}${btn("agent", "Agent")}
    </div>
    ${body}`;
}

// Switch the code environment (Graphical / Terminal / Agent). Returns whether
// the mode changed, so the click handler can skip a redundant redraw.
export function setCodeMode(mode) {
  if (mode === codeMode) return false;
  codeMode = mode;
  return true;
}
