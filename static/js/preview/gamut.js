// Gamut preview tab: the palette plotted in OKLCH space — angle is hue, radius
// is chroma, height is lightness — on a hand-rolled canvas renderer. Like the
// wheel this is geometry only: the frontend computes no colors, it positions
// dots from the l/c/h values the API already returns and paints them with the
// response hexes. The camera (yaw / pitch / zoom) is a display-only
// preference like the wheel's layout mode: never persisted, never part of
// the exported state.

import { store } from "../store.js";
import { $, copyText } from "../util.js";
import { titleFor } from "../swatch.js";

// Default camera: a three-quarter view from slightly above, so the lightness
// axis reads as height and the hue sweep reads as a circle from the start.
const DEFAULT_CAM = { yaw: 0.6, pitch: 0.42, zoom: 1 };
const cam = { ...DEFAULT_CAM };

// Hit-testing and hover redraw work off the projection computed by the last
// drawGamut call, so pointer handlers never re-project the scene themselves.
let canvasEl = null;
let projDots = [];
let hoveredDot = null;
let drawQueued = false;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Chroma is drawn ~2.2x its raw OKLCH scale relative to lightness. Honest
// units make the palette a tall, thin spindle (chroma tops out near 0.4
// while lightness spans almost 1.0); exaggerating the horizontal axes
// widens the scene around the center so the default palette's silhouette
// reads closer to a sphere. Display-only geometry, like the wheel's fixed
// layout: it rescales positions, never the plotted values themselves.
const CHROMA_SCALE = 2.2;

// One dot per swatch, one path per chromatic row, plus the per-level chroma
// envelope rings and the lightness axis. The base row is included: its chroma
// is near zero, so it renders as the neutral spine of the visualization —
// the axis the chromatic horns swing around.
function sceneData() {
  const pairs = store.view.colors.map((vcol, i) => ({ vcol, col: store.palette.colors[i] }));
  const dots = [];
  const paths = [];
  for (const { vcol, col } of pairs) {
    const pts = vcol.swatches.map((s, j) => {
      const real = col.swatches[j];
      // Hue 0 points at 12 o'clock and sweeps clockwise seen from above, the
      // same convention as the wheel. Height is Oklab L centered at 0.5 so
      // the scene's origin is its own midpoint.
      const a = (s.h * Math.PI) / 180;
      const r = s.c * CHROMA_SCALE;
      const dot = {
        x: r * Math.sin(a),
        y: r * Math.cos(a),
        z: s.l - 0.5,
        hex: s.hex,
        realHex: real.hex,
        label: `${col.name}-${real.level} · ${real.hex}`,
        title: titleFor(col, real),
      };
      dots.push(dot);
      return dot;
    });
    if (vcol.name !== "base") paths.push(pts);
  }

  // Envelope: one faint ring per level at the level's own maximum chroma
  // across the chromatic rows — the palette's gamut outline, level by level.
  // It passes through the outermost dots, so the ring set traces how far the
  // palette actually reaches into OKLCH space (and collapses to a thin pole
  // under the grayscale filter, the Gamut tab's analogue of the grid's gray
  // columns).
  const chrom = pairs.filter((p) => p.vcol.name !== "base");
  const rings = store.palette.levels.map((_, j) => {
    let r = 0;
    let z = 0;
    for (const { vcol } of chrom) {
      const s = vcol.swatches[j];
      r = Math.max(r, s.c * CHROMA_SCALE);
      z = s.l - 0.5;
    }
    return { r, z };
  });

  // Scene z extent from the swatches themselves (level Ls move with the
  // minL/maxL sliders, so the axis must follow them).
  let zTop = -1;
  let zBot = 1;
  for (const d of dots) {
    zTop = Math.max(zTop, d.z);
    zBot = Math.min(zBot, d.z);
  }
  return {
    dots,
    paths,
    rings,
    axis: {
      top: { z: zTop, label: store.palette.levels[0] },
      bot: { z: zBot, label: store.palette.levels[store.palette.levels.length - 1] },
    },
  };
}

// Orthographic camera: yaw spins the scene around the lightness axis, pitch
// tilts it toward/away from the viewer. Screen y grows downward on the
// canvas; depth grows away from the viewer, so painter's-order drawing is a
// descending-depth sort.
function projector(scale, cx, cy) {
  const cyaw = Math.cos(cam.yaw);
  const syaw = Math.sin(cam.yaw);
  const cpit = Math.cos(cam.pitch);
  const spit = Math.sin(cam.pitch);
  return (p) => {
    const x1 = p.x * cyaw - p.y * syaw;
    const y1 = p.x * syaw + p.y * cyaw;
    return {
      px: cx + x1 * scale,
      py: cy - (p.z * cpit + y1 * spit) * scale,
      depth: y1 * cpit - p.z * spit,
    };
  };
}

function drawGamut() {
  const canvas = canvasEl;
  if (!canvas || !store.palette || !store.view) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return; // pane is hidden; nothing to paint

  // Match the backing store to the layout box times the device pixel ratio,
  // so dots stay crisp on HiDPI screens.
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cs = getComputedStyle(document.documentElement);
  const cssVar = (name) => cs.getPropertyValue(name).trim();
  const border = cssVar("--border");
  const textDim = cssVar("--text-dim");
  const raised = cssVar("--bg-raised");

  const scene = sceneData();

  // Fit: scale so the scene's worst-case projected extent (chroma radius or
  // half the lightness span, whichever is larger) fits the shorter canvas
  // axis with margin, then let the user's zoom ride on top.
  let maxR = 0.15;
  for (const d of scene.dots) maxR = Math.max(maxR, Math.hypot(d.x, d.y));
  const halfZ = (scene.axis.top.z - scene.axis.bot.z) / 2;
  const extent = Math.max(maxR + 0.08, halfZ + 0.08);
  const scale = ((Math.min(w, h) / 2) - 26) / extent * cam.zoom;
  const project = projector(scale, w / 2, h / 2);

  // Envelope rings first, faint: they are the wireframe the dots sit on, and
  // their strokes are subtle enough that drawing them under everything is
  // the right trade against per-ring depth sorting.
  ctx.lineWidth = 1;
  ctx.strokeStyle = border;
  ctx.globalAlpha = 0.5;
  for (const ring of scene.rings) {
    ctx.beginPath();
    for (let k = 0; k <= 72; k++) {
      const a = (k / 72) * 2 * Math.PI;
      const p = project({ x: ring.r * Math.sin(a), y: ring.r * Math.cos(a), z: ring.z });
      if (k === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Painter's algorithm: collect dots and path segments, sort by depth
  // (farthest first), and draw in order. Segments carry the average depth of
  // their endpoints, which is plenty for these short, mostly-convex rows.
  const items = [];
  for (const d of scene.dots) {
    const p = project(d);
    items.push({ depth: p.depth, kind: "dot", p, d });
  }
  for (const pts of scene.paths) {
    for (let j = 0; j < pts.length - 1; j++) {
      const a = project(pts[j]);
      const b = project(pts[j + 1]);
      items.push({ depth: (a.depth + b.depth) / 2, kind: "seg", a, b, color: pts[j + 1].hex });
    }
  }
  items.sort((u, v) => v.depth - u.depth);

  projDots = [];
  const R = Math.max(3, 7 * Math.min(cam.zoom, 1.6));
  for (const it of items) {
    if (it.kind === "seg") {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = it.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(it.a.px, it.a.py);
      ctx.lineTo(it.b.px, it.b.py);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    const { p, d } = it;
    projDots.push({ px: p.px, py: p.py, dot: d });
    ctx.beginPath();
    ctx.arc(p.px, p.py, R, 0, 2 * Math.PI);
    ctx.fillStyle = d.hex;
    ctx.fill();
    // Dark hairline so same-hue neighbors stay separable on any background.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();
    if (d === hoveredDot) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = cssVar("--text");
      ctx.stroke();
    }
  }

  // Lightness axis and its end labels, drawn on top of the rings but the
  // labels after the dots so they can't be hidden by the spine of base dots.
  const top = project({ x: 0, y: 0, z: scene.axis.top.z + 0.04 });
  const bot = project({ x: 0, y: 0, z: scene.axis.bot.z - 0.04 });
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(top.px, top.py);
  ctx.lineTo(bot.px, bot.py);
  ctx.stroke();
  ctx.fillStyle = textDim;
  ctx.font = "12px -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`L ${scene.axis.top.label}`, clamp(top.px, 24, w - 24), clamp(top.py - 4, 14, h));
  ctx.textBaseline = "top";
  ctx.fillText(`L ${scene.axis.bot.label}`, clamp(bot.px, 24, w - 24), clamp(bot.py + 4, 0, h - 14));

  // Hover tooltip: name-level and hex for the hovered dot, clamped inside the
  // canvas. Canvas has no per-element titles, so this is the Gamut tab's
  // analogue of the SVG swatches' <title>.
  if (hoveredDot) {
    const hit = projDots.find((q) => q.dot === hoveredDot);
    if (hit) {
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      const tw = ctx.measureText(hoveredDot.label).width;
      const bw = tw + 14;
      const bh = 20;
      const bx = clamp(hit.px + 12, 4, w - bw - 4);
      const by = clamp(hit.py - bh - 8, 4, h - bh - 4);
      ctx.fillStyle = raised;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = cssVar("--text");
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(hoveredDot.label, bx + 7, by + bh / 2 + 0.5);
    }
  }
}

function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    drawGamut();
  });
}

function hitTest(px, py) {
  let best = null;
  let bestDist = 10; // generous grab radius; dots are 7px
  for (const q of projDots) {
    const dist = Math.hypot(q.px - px, q.py - py);
    if (dist < bestDist) {
      best = q;
      bestDist = dist;
    }
  }
  return best;
}

// Pointer + wheel interaction, attached once per canvas. Drag rotates, wheel
// zooms, a click on a swatch copies its hex (the same affordance as the grid
// and the wheel), and a double-click on empty space resets the camera.
// Listeners live here rather than in app.js because the canvas is created
// once and kept across re-renders, so module-local wiring stays simplest.
function attachGamutControls(canvas) {
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX;
      lastY = e.clientY;
      cam.yaw += dx * 0.01;
      cam.pitch = clamp(cam.pitch + dy * 0.01, -1.45, 1.45);
      requestDraw();
      return;
    }
    const hit = hitTest(e.offsetX, e.offsetY);
    if ((hit && hit.dot) !== hoveredDot) {
      hoveredDot = hit ? hit.dot : null;
      canvas.style.cursor = hit ? "pointer" : "grab";
      requestDraw();
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    dragging = false;
    canvas.classList.remove("dragging");
    // A press that never traveled is a click: copy the swatch under it. The
    // movement threshold keeps a rotation that ends on a dot from copying.
    if (moved < 5) {
      const hit = hitTest(e.offsetX, e.offsetY);
      if (hit) copyText(hit.dot.realHex, `Copied ${hit.dot.realHex}`);
    }
  });
  canvas.addEventListener("pointerleave", () => {
    if (hoveredDot) {
      hoveredDot = null;
      requestDraw();
    }
  });
  canvas.addEventListener("dblclick", (e) => {
    if (!hitTest(e.offsetX, e.offsetY)) {
      Object.assign(cam, DEFAULT_CAM);
      requestDraw();
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0012), 0.35, 5);
      requestDraw();
    },
    { passive: false }
  );
}

export function renderGamut() {
  const pane = $("#gamut-preview");
  let canvas = pane.querySelector("canvas");
  // The pane skeleton (canvas + hint) is built once and kept across updates,
  // like the grid's in-place patching: a camera drag must survive the slider
  // responses that re-render the pane, and rebuilding the canvas would drop
  // pointer capture mid-gesture.
  if (!canvas) {
    pane.innerHTML = `
      <canvas id="gamut-canvas" role="img" aria-label="Palette gamut in OKLCH space"></canvas>
      <p class="gamut-hint">OKLCH space: angle is hue, radius is chroma (exaggerated 2.2x for legibility), height is lightness (level ${store.palette.levels[0]} at the top). Drag to rotate, scroll to zoom, click a swatch to copy its hex, double-click empty space to reset the view.</p>`;
    canvas = pane.querySelector("canvas");
    canvasEl = canvas;
    attachGamutControls(canvas);
    // A window resize reflows the pane after the last draw; redraw so the
    // backing store tracks the new canvas box, but only while visible.
    window.addEventListener("resize", () => {
      if (store.activeTab === "gamut" && !pane.hidden) requestDraw();
    });
  }
  drawGamut();
}
