// ---------------------------------------------------------------
// Small DOM + formatting helpers. No dependencies.
// ---------------------------------------------------------------

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const $  = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

/** Delegate a click handler for every element matching `sel` inside `root`. */
export function on(root, sel, fn) {
  $$(sel, root).forEach(el => el.addEventListener('click', ev => fn(el, ev)));
}

export function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

export function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

export function mmss(secs) {
  secs = Math.max(0, Math.round(secs));
  const m = Math.floor(secs / 60), s = secs % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/** Human duration for larger spans: 1h 04m, 12m 30s, 45s */
export function dur(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return m + 'm ' + String(r).padStart(2, '0') + 's';
  const h = Math.floor(m / 60);
  return h + 'h ' + String(m % 60).padStart(2, '0') + 'm';
}

export function dayStamp(t) {
  const d = new Date(t == null ? Date.now() : t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function shortDate(t) {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Mulberry32 — small seeded PRNG so a session can be replayed exactly. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = arr.slice();
  const r = rand || Math.random;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

export function sample(arr, n, rand) { return shuffle(arr, rand).slice(0, n); }

let toastTimer = null;
export function toast(msg, ms) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, ms || 2200);
}

/** Accuracy → semantic bucket used for colour everywhere. */
export function band(p) { return p >= 80 ? 'ok' : p >= 60 ? 'mid' : 'bad'; }

export function meter(ok, mid, bad) {
  const t = ok + mid + bad || 1;
  return '<div class="meter">' +
    '<i class="ok" style="width:' + (ok / t * 100) + '%"></i>' +
    '<i class="mid" style="width:' + (mid / t * 100) + '%"></i>' +
    '<i class="bad" style="width:' + (bad / t * 100) + '%"></i>' +
    '</div>';
}

/** Strip leading articles/punctuation for fuzzy comparisons in the audit tools. */
export function normStr(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
