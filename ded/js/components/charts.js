/* ==========================================================================
   Lightweight SVG chart kit (no external dependency → runs offline).
   line · bars (grouped/stacked) · donut · gauge · sparkline
   All charts: thin marks, recessive grid, hover tooltip/crosshair.
   ========================================================================== */
(function (OC) {
  'use strict';
  const U = OC.utils;
  const NS = 'http://www.w3.org/2000/svg';
  const tip = () => OC.ui.tip;

  function niceMax(v) {
    if (!v || v <= 0) return 1;
    const raw = v / 4;
    const exp = Math.pow(10, Math.floor(Math.log10(raw)));
    const steps = exp >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
    const f = raw / exp;
    const nf = steps.find((x) => f <= x + 1e-9) || 10;
    return nf * exp * 4;
  }
  function frame(el, opts) {
    const W = Math.max(240, el.clientWidth || 600);
    const H = opts.height || 200;
    const m = Object.assign({ l: 46, r: 12, t: 10, b: 24 }, opts.margin || {});
    return { W, H, m, iw: W - m.l - m.r, ih: H - m.t - m.b };
  }
  function legendHtml(series, type) {
    if (!series || series.length < 2) return '';
    return '<div class="chart-legend">' + series.map((s) => '<span><i class="' + (type === 'line' && !s.area ? 'line' : '') + '" style="background:' + s.color + '"></i>' + U.esc(s.name) + '</span>').join('') + '</div>';
  }
  function xLabelIdx(n, iw) {
    const maxLabels = Math.max(2, Math.floor(iw / 62));
    const step = Math.max(1, Math.ceil(n / maxLabels));
    const out = [];
    for (let i = 0; i < n; i += step) out.push(i);
    return out;
  }
  function yAxis(f, max, fmt, min) {
    min = min || 0;
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const v = min + (max - min) * i / 4;
      const y = f.m.t + f.ih - f.ih * i / 4;
      s += '<line class="' + (i === 0 ? 'axisline' : 'gridline') + '" x1="' + f.m.l + '" x2="' + (f.W - f.m.r) + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text x="' + (f.m.l - 8) + '" y="' + (y + 3.5) + '" text-anchor="end">' + fmt(v) + '</text>';
    }
    return s;
  }

  /* ---------- Line / area ---------- */
  function line(el, o) {
    const f = frame(el, o);
    const fmt = o.yFmt || ((v) => U.fmtNum(v));
    const n = o.labels.length;
    const all = [].concat.apply([], o.series.map((s) => s.values));
    const min = o.yMin != null ? o.yMin : 0;
    const max = o.yMax != null ? o.yMax : niceMax(Math.max.apply(null, all.concat([o.ref ? o.ref.value : 0])) * 1.05);
    const x = (i) => f.m.l + (n === 1 ? f.iw / 2 : (f.iw * i) / (n - 1));
    const y = (v) => f.m.t + f.ih - (f.ih * (U.clamp(v, min, max) - min)) / (max - min || 1);
    let s = yAxis(f, max, fmt, min);
    xLabelIdx(n, f.iw).forEach((i) => { s += '<text x="' + x(i) + '" y="' + (f.H - 6) + '" text-anchor="middle">' + U.esc(o.labels[i]) + '</text>'; });
    if (o.ref) {
      const ry = y(o.ref.value);
      s += '<line x1="' + f.m.l + '" x2="' + (f.W - f.m.r) + '" y1="' + ry + '" y2="' + ry + '" stroke="' + (o.ref.color || 'var(--warn)') + '" stroke-dasharray="4 4" stroke-width="1"/>';
      s += '<text x="' + (f.W - f.m.r) + '" y="' + (ry - 5) + '" text-anchor="end" style="fill:' + (o.ref.color || 'var(--warn)') + '">' + U.esc(o.ref.label) + '</text>';
    }
    o.series.forEach((ser, si) => {
      const pts = ser.values.map((v, i) => [x(i), y(v)]);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
      if (ser.area) {
        const gid = 'g' + Math.random().toString(36).slice(2, 8);
        s += '<defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + ser.color + '" stop-opacity="0.28"/><stop offset="1" stop-color="' + ser.color + '" stop-opacity="0.02"/></linearGradient></defs>';
        s += '<path d="' + d + 'L' + x(n - 1) + ',' + y(min) + 'L' + x(0) + ',' + y(min) + 'Z" fill="url(#' + gid + ')"/>';
      }
      s += '<path d="' + d + '" fill="none" stroke="' + ser.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + (ser.dash ? ' stroke-dasharray="5 4"' : '') + '/>';
      const last = pts[pts.length - 1];
      if (last) s += '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3.5" fill="' + ser.color + '" stroke="var(--panel)" stroke-width="2"/>';
    });
    s += '<g class="hover-layer" style="display:none"><line class="crosshair" y1="' + f.m.t + '" y2="' + (f.m.t + f.ih) + '"/>' + o.series.map((ser) => '<circle r="4.5" fill="' + ser.color + '" stroke="var(--panel)" stroke-width="2"/>').join('') + '</g>';
    s += '<rect class="hit" x="' + f.m.l + '" y="' + f.m.t + '" width="' + f.iw + '" height="' + f.ih + '"/>';
    el.innerHTML = legendHtml(o.series, 'line') + '<svg class="chart" width="' + f.W + '" height="' + f.H + '" viewBox="0 0 ' + f.W + ' ' + f.H + '">' + s + '</svg>';
    const svg = el.querySelector('svg'), hit = svg.querySelector('.hit'), layer = svg.querySelector('.hover-layer');
    hit.addEventListener('mousemove', (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const i = U.clamp(Math.round(((px - f.m.l) / f.iw) * (n - 1)), 0, n - 1);
      layer.style.display = '';
      const cl = layer.querySelector('line'); cl.setAttribute('x1', x(i)); cl.setAttribute('x2', x(i));
      layer.querySelectorAll('circle').forEach((c, si) => { c.setAttribute('cx', x(i)); c.setAttribute('cy', y(o.series[si].values[i])); });
      const tf = o.tipFmt || fmt;
      tip().show('<div class="tt-h">' + U.esc(o.tipLabels ? o.tipLabels[i] : o.labels[i]) + '</div>' + o.series.map((ser) => OC.ui.ttRow(ser.color, ser.name, tf(ser.values[i]))).join(''), ev.clientX, ev.clientY, 'chart');
    });
    hit.addEventListener('mouseleave', () => { layer.style.display = 'none'; tip().hide(); });
  }

  /* ---------- Bars (grouped or stacked) ---------- */
  function roundTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return '';
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }
  function bars(el, o) {
    const f = frame(el, o);
    const fmt = o.yFmt || ((v) => U.fmtNum(v));
    const n = o.labels.length;
    const totals = o.labels.map((_, i) => o.stacked ? U.sum(o.series, (s) => s.values[i] || 0) : Math.max.apply(null, o.series.map((s) => s.values[i] || 0)));
    const max = o.yMax || niceMax(Math.max.apply(null, totals) * 1.05);
    const band = f.iw / n;
    const gap = Math.max(1, Math.min(band * 0.28, 10));
    const bw = band - gap;
    const y = (v) => f.m.t + f.ih - (f.ih * v) / max;
    let s = yAxis(f, max, fmt);
    xLabelIdx(n, f.iw).forEach((i) => { s += '<text x="' + (f.m.l + band * i + band / 2) + '" y="' + (f.H - 6) + '" text-anchor="middle">' + U.esc(o.labels[i]) + '</text>'; });
    for (let i = 0; i < n; i++) {
      const x0 = f.m.l + band * i + gap / 2;
      if (o.stacked) {
        let acc = 0;
        const top = o.series.reduce((t, ser, si) => (ser.values[i] > 0 ? si : t), -1);
        o.series.forEach((ser, si) => {
          const v = ser.values[i] || 0; if (v <= 0) return;
          const y1 = y(acc + v), h = y(acc) - y1 - (acc > 0 ? 1 : 0);
          s += si === top ? '<path class="bar-rect" data-i="' + i + '" d="' + roundTop(x0, y1, bw, Math.max(1, h), 3) + '" fill="' + ser.color + '"/>' : '<rect class="bar-rect" data-i="' + i + '" x="' + x0 + '" y="' + y1 + '" width="' + bw + '" height="' + Math.max(1, h) + '" fill="' + ser.color + '"/>';
          acc += v;
        });
      } else {
        const k = o.series.length, sw = (bw - (k - 1) * 2) / k;
        o.series.forEach((ser, si) => {
          const v = ser.values[i] || 0; const y1 = y(v);
          const col = typeof ser.color === 'function' ? ser.color(v, i) : ser.color;
          s += '<path class="bar-rect" data-i="' + i + '" d="' + roundTop(x0 + si * (sw + 2), y1, sw, f.m.t + f.ih - y1, 3) + '" fill="' + col + '"/>';
        });
      }
    }
    for (let i = 0; i < n; i++) s += '<rect class="hit" data-i="' + i + '" x="' + (f.m.l + band * i) + '" y="' + f.m.t + '" width="' + band + '" height="' + f.ih + '" style="cursor:' + (o.onClick ? 'pointer' : 'default') + '"/>';
    el.innerHTML = legendHtml(o.series, 'bar') + '<svg class="chart" width="' + f.W + '" height="' + f.H + '" viewBox="0 0 ' + f.W + ' ' + f.H + '">' + s + '</svg>';
    const svg = el.querySelector('svg');
    svg.querySelectorAll('.hit').forEach((h) => {
      const i = +h.getAttribute('data-i');
      h.addEventListener('mousemove', (ev) => {
        svg.querySelectorAll('.bar-rect').forEach((b) => b.classList.toggle('dimmed', +b.getAttribute('data-i') !== i));
        const tf = o.tipFmt || fmt;
        const rows = o.series.map((ser) => OC.ui.ttRow(typeof ser.color === 'function' ? ser.color(ser.values[i], i) : ser.color, ser.name, tf(ser.values[i] || 0))).join('');
        tip().show('<div class="tt-h">' + U.esc(o.tipLabels ? o.tipLabels[i] : o.labels[i]) + '</div>' + rows + (o.stacked && o.series.length > 1 ? OC.ui.ttRow('', 'Total', tf(totals[i])) : ''), ev.clientX, ev.clientY, 'chart');
      });
      h.addEventListener('mouseleave', () => { svg.querySelectorAll('.bar-rect').forEach((b) => b.classList.remove('dimmed')); tip().hide(); });
      if (o.onClick) h.addEventListener('click', () => o.onClick(i));
    });
  }

  /* ---------- Donut ---------- */
  function arc(cx, cy, r, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return 'M' + (cx + r * Math.cos(a0)) + ',' + (cy + r * Math.sin(a0)) + 'A' + r + ',' + r + ' 0 ' + large + ' 1 ' + (cx + r * Math.cos(a1)) + ',' + (cy + r * Math.sin(a1));
  }
  function donut(el, o) {
    const size = o.size || 150, th = o.thickness || 16, r = size / 2 - th / 2 - 2, c = size / 2;
    const total = U.sum(o.segments, (s) => s.value) || 1;
    let a = -Math.PI / 2;
    let s = '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="var(--panel-3)" stroke-width="' + th + '"/>';
    const gapA = o.segments.filter((x) => x.value > 0).length > 1 ? 0.025 : 0;
    o.segments.forEach((seg, i) => {
      if (!seg.value) return;
      const sweep = (seg.value / total) * Math.PI * 2;
      const a1 = a + sweep - gapA;
      s += '<path data-i="' + i + '" d="' + arc(c, c, r, a + gapA / 2, Math.max(a + gapA / 2 + 0.001, a1)) + '" fill="none" stroke="' + seg.color + '" stroke-width="' + th + '" style="cursor:pointer;transition:stroke-width .12s"/>';
      a += sweep;
    });
    if (o.center) s += '<text x="' + c + '" y="' + (c + 2) + '" text-anchor="middle" style="fill:var(--text);font-size:' + (o.centerSize || 22) + 'px;font-weight:700">' + o.center.value + '</text><text x="' + c + '" y="' + (c + 18) + '" text-anchor="middle" style="fill:var(--muted);font-size:10.5px">' + o.center.label + '</text>';
    const svg = '<svg class="chart" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="flex:none">' + s + '</svg>';
    const leg = o.legend === false ? '' : '<div class="donut-legend">' + o.segments.map((seg) => '<div class="row"' + (seg.onClick ? ' style="cursor:pointer"' : '') + '><i style="background:' + seg.color + '"></i>' + U.esc(seg.label) + '<b class="num">' + (o.fmt ? o.fmt(seg.value) : seg.value) + '</b></div>').join('') + '</div>';
    el.innerHTML = '<div class="donut-wrap">' + svg + leg + '</div>';
    el.querySelectorAll('path[data-i]').forEach((p) => {
      const seg = o.segments[+p.getAttribute('data-i')];
      p.addEventListener('mousemove', (ev) => { p.setAttribute('stroke-width', th + 4); tip().show('<div class="tt-h">' + U.esc(seg.label) + '</div>' + OC.ui.ttRow(seg.color, 'Count', seg.value) + OC.ui.ttRow('', 'Share', U.fmtPct(100 * seg.value / total)), ev.clientX, ev.clientY, 'chart'); });
      p.addEventListener('mouseleave', () => { p.setAttribute('stroke-width', th); tip().hide(); });
      if (seg.onClick) p.addEventListener('click', seg.onClick);
    });
    el.querySelectorAll('.donut-legend .row').forEach((row, i) => { if (o.segments[i].onClick) row.addEventListener('click', o.segments[i].onClick); });
  }

  /* ---------- Gauge (semicircle) ---------- */
  function gauge(el, o) {
    const W = o.width || 220, H = W * 0.62, cx = W / 2, cy = H - 14, r = W / 2 - 18, th = 14;
    const min = o.min || 0, max = o.max || 100;
    const t = U.clamp((o.value - min) / (max - min), 0, 1);
    const a0 = Math.PI, a1 = Math.PI + t * Math.PI;
    const col = o.value >= (o.good || 98) ? 'var(--ok)' : o.value >= (o.warn || 95) ? 'var(--warn)' : 'var(--fail)';
    let s = '<path d="' + arc(cx, cy, r, Math.PI, 2 * Math.PI) + '" fill="none" stroke="var(--panel-3)" stroke-width="' + th + '" stroke-linecap="round"/>';
    s += '<path d="' + arc(cx, cy, r, a0, Math.max(a0 + 0.01, a1)) + '" fill="none" stroke="' + col + '" stroke-width="' + th + '" stroke-linecap="round"/>';
    // target tick
    if (o.target != null) {
      const ta = Math.PI + U.clamp((o.target - min) / (max - min), 0, 1) * Math.PI;
      s += '<line x1="' + (cx + (r - 12) * Math.cos(ta)) + '" y1="' + (cy + (r - 12) * Math.sin(ta)) + '" x2="' + (cx + (r + 12) * Math.cos(ta)) + '" y2="' + (cy + (r + 12) * Math.sin(ta)) + '" stroke="var(--text-2)" stroke-width="2"/>';
    }
    s += '<text x="' + cx + '" y="' + (cy - 14) + '" text-anchor="middle" style="fill:var(--text);font-size:30px;font-weight:700">' + o.value.toFixed(1) + '%</text>';
    s += '<text x="' + (cx - r) + '" y="' + (cy + 14) + '" text-anchor="middle">' + min + '%</text><text x="' + (cx + r) + '" y="' + (cy + 14) + '" text-anchor="middle">' + max + '%</text>';
    el.innerHTML = '<svg class="chart" width="' + W + '" height="' + (H + 6) + '" viewBox="0 0 ' + W + ' ' + (H + 6) + '" style="margin:0 auto">' + s + '</svg>' + (o.label ? '<div style="text-align:center;font-size:11.5px;color:var(--muted);margin-top:2px">' + U.esc(o.label) + '</div>' : '');
  }

  /* ---------- Sparkline (returns markup) ---------- */
  function sparkline(values, color, w, h) {
    w = w || 84; h = h || 24;
    if (!values || !values.length) return '';
    const max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    const rng = max - min || 1;
    const pts = values.map((v, i) => [(w * i) / (values.length - 1 || 1), h - 2 - ((h - 4) * (v - min)) / rng]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="overflow:visible"><path d="' + d + 'L' + w + ',' + h + 'L0,' + h + 'Z" fill="' + color + '" opacity="0.12"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linejoin="round"/><circle cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="2.2" fill="' + color + '"/></svg>';
  }

  OC.charts = { line, bars, donut, gauge, sparkline, niceMax };
})(window.OpsCenter);
