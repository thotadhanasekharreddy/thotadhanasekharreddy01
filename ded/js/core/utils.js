/* ==========================================================================
   Core utilities — formatting, seeded RNG, DOM helpers.
   No dependencies. Everything hangs off the global `OpsCenter` namespace so
   the app runs straight from file:// (no ES-module CORS issues).
   ========================================================================== */
window.OpsCenter = window.OpsCenter || {};

(function (OC) {
  'use strict';
  const U = {};

  /* ---------- Seeded random (deterministic mock data) ---------- */
  U.hash = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  U.rng = function (seed) {
    let a = typeof seed === 'string' ? U.hash(seed) : seed >>> 0;
    const next = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      range: (lo, hi) => lo + next() * (hi - lo),
      int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      hex: (n) => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(next() * 16).toString(16); return s; }
    };
  };

  /* ---------- Number / size / time formatting ---------- */
  U.fmtInt = (n) => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-US');
  U.fmtNum = function (n, digits) {
    if (n == null || isNaN(n)) return '—';
    const d = digits == null ? 1 : digits;
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(d).replace(/\.0+$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(d).replace(/\.0+$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(d).replace(/\.0+$/, '') + 'K';
    return String(Math.round(n));
  };
  U.fmtGB = function (gb, digits) {
    if (gb == null || isNaN(gb)) return '—';
    const d = digits == null ? 1 : digits;
    if (gb >= 1000) return (gb / 1000).toFixed(2) + ' TB';
    if (gb >= 1) return gb.toFixed(gb >= 100 ? 0 : d) + ' GB';
    return Math.round(gb * 1024) + ' MB';
  };
  U.fmtPct = (x, d) => (x == null || isNaN(x)) ? '—' : x.toFixed(d == null ? 1 : d) + '%';
  U.fmtDur = function (sec) {
    if (sec == null || isNaN(sec)) return '—';
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  };
  U.fmtMin = (min) => U.fmtDur(min * 60);
  const pad = (n) => String(n).padStart(2, '0');
  U.fmtTime = (t) => { if (!t) return '—'; const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  U.fmtHM = (t) => { if (!t) return '—'; const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  U.fmtDay = (t) => { const d = new Date(t); return MON[d.getMonth()] + ' ' + d.getDate(); };
  U.fmtDow = (t) => DOW[new Date(t).getDay()];
  U.fmtDateTime = (t) => { if (!t) return '—'; const d = new Date(t); return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + U.fmtHM(t); };
  U.fmtAgo = function (t, now) {
    if (!t) return '—';
    const s = Math.round(((now || Date.now()) - t) / 1000);
    if (s < 0) return 'in ' + U.fmtAgo(now || Date.now(), (now || Date.now()) - s * 1000).replace(' ago', '');
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h + 'h ' + (m ? m + 'm ' : '') + 'ago'; }
    return Math.floor(s / 86400) + 'd ago';
  };

  /* ---------- Collections ---------- */
  U.sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x || 0), 0);
  U.avg = (arr, f) => arr.length ? U.sum(arr, f) / arr.length : 0;
  U.max = (arr, f) => arr.reduce((a, x) => Math.max(a, f ? f(x) : x), -Infinity);
  U.groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
  U.uniq = (arr) => Array.from(new Set(arr));
  U.clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  /* ---------- DOM ---------- */
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.debounce = function (fn, ms) { let t; return function () { const args = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, args), ms); }; };
  U.downloadText = function (filename, text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  };

  OC.utils = U;
})(window.OpsCenter);
