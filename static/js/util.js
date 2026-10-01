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

async function copyText(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast("Clipboard unavailable; copy manually from the tooltip");
  }
}

export { $, fetchJSON, fmt, esc, toast, copyText };
