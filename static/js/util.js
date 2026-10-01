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
// panes are their own scroll containers, and a wholesale innerHTML swap
// tears down the scrolled content, so the browser clamps scrollTop back
// to 0 — a live palette edit would yank the visible region out of view.
// Capturing the offsets before the swap and restoring them after keeps
// the viewport anchored; assigning scrollTop re-clamps against the new
// content, so a shorter render still lands on a valid position.
function setPaneHTML(pane, html) {
  const top = pane.scrollTop;
  const left = pane.scrollLeft;
  pane.innerHTML = html;
  pane.scrollTop = top;
  pane.scrollLeft = left;
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
