// Small DOM and browser helpers shared across the app.

const $ = (sel) => document.querySelector(sel);

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

function fmt(v, digits = 3) {
  return Number(v).toFixed(digits);
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 1600);
}

// Replace a preview pane's content without losing the user's place. The
// panes do not only scroll at the pane level: several previews scroll
// inside nested mock regions instead (the Landing and Design page bodies,
// the Notes editor and sidebar, the Code terminal/agent scrollbacks), and
// a wholesale innerHTML swap tears down every one of those regions, so
// each restarts at offset 0 and the visible region is yanked out of view.
// The helper therefore snapshots scrollTop/scrollLeft of the pane and any
// scrolled descendant before the swap and replays them onto the rebuilt
// tree. Descendants are matched by document-order index, and only when
// the old and new trees have the same element count: a render that
// restructures the pane (a mode or scheme switch presenting a different
// mock) resets instead, which is the honest behavior for a new layout.
// Reassigning scrollTop re-clamps against the new content, so a shorter
// render still lands on a valid position.
function setPaneHTML(pane, html) {
  const oldAll = [pane, ...pane.querySelectorAll("*")];
  const scrolled = [];
  for (let i = 0; i < oldAll.length; i++) {
    const el = oldAll[i];
    if (el.scrollTop || el.scrollLeft) scrolled.push([i, el.scrollTop, el.scrollLeft]);
  }
  pane.innerHTML = html;
  const newAll = [pane, ...pane.querySelectorAll("*")];
  if (newAll.length !== oldAll.length) return;
  for (const [i, top, left] of scrolled) {
    newAll[i].scrollTop = top;
    newAll[i].scrollLeft = left;
  }
}

async function copyText(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast("Clipboard unavailable; copy manually from the tooltip");
  }
}

export { $, fetchJSON, fmt, esc, toast, copyText, setPaneHTML };
