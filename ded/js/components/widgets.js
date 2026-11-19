/* ==========================================================================
   Reusable dashboard widgets — pipeline table, timeline (Gantt), alert list,
   horizontal bar list. Used by several views.
   ========================================================================== */
(function (OC) {
  'use strict';
  const U = OC.utils, ui = OC.ui;
  const W = {};

  /* ---------- Pipeline table ---------- */
  const COLS = [
    { k: 'name', t: 'Pipeline', sort: (r) => r.name },
    { k: 'domain', t: 'Domain', sort: (r) => r.domain },
    { k: 'st', t: 'Source → Target', sort: (r) => r.source },
    { k: 'type', t: 'Type', sort: (r) => r.type },
    { k: 'status', t: 'Status', sort: (r) => ['failed', 'delayed', 'blocked', 'warning', 'running', 'queued', 'success'].indexOf(r.status) },
    { k: 'start', t: 'Start Time', sort: (r) => r.startTime || 0 },
    { k: 'dur', t: 'Duration', sort: (r) => r.durationSec || 0 },
    { k: 'records', t: 'Records', sort: (r) => r.recordsProcessed || 0, r: true },
    { k: 'last', t: 'Last Run', sort: (r) => r.lastRun || 0 },
    { k: 'sla', t: 'SLA', sort: (r) => ['breached', 'at_risk', 'met', 'pending'].indexOf(r.slaStatus) },
    { k: 'trend', t: 'Last 14 runs' }
  ];
  const COMPACT = ['name', 'status', 'dur', 'records', 'last', 'sla'];

  function durCell(r) {
    if (r.durationSec == null) {
      if (r.status === 'delayed') return '<span class="sla-at_risk">Not started · ' + U.fmtAgo(r.scheduledTime).replace(' ago', '') + ' late</span>';
      return '<span class="muted">—</span>';
    }
    const pct = 100 * r.durationSec / (r.sla.maxDurationMin * 60);
    const col = pct > 100 ? 'var(--fail)' : pct >= 80 ? 'var(--warn)' : r.execStatus === 'running' ? 'var(--run)' : 'var(--ok)';
    return '<div class="durbar" data-tip="' + U.esc('<div class="tt-h">' + U.fmtDur(r.durationSec) + ' of ' + U.fmtMin(r.sla.maxDurationMin) + ' SLA</div>' + ui.ttRow('', 'SLA used', Math.round(pct) + '%')) + '"><span class="num" style="min-width:58px">' + U.fmtDur(r.durationSec) + '</span><span class="bar"><i style="width:' + Math.min(100, pct) + '%;background:' + col + '"></i></span></div>';
  }
  function histCell(r) {
    const max = Math.max.apply(null, r.history.map((h) => h.durationSec || 0).concat([1]));
    return '<div class="mini-hist">' + r.history.map((h) => '<i style="height:' + Math.max(3, 18 * (h.durationSec || 0) / max) + 'px;background:' + (h.status === 'failed' ? 'var(--fail)' : 'rgba(148,170,210,0.45)') + '"></i>').join('') + '</div>';
  }
  function cell(k, r) {
    switch (k) {
      case 'name': return '<td><div class="pname">' + U.esc(r.name) + '</div><div class="pid">' + '<span class="chip">' + r.platformShort + '</span> ' + r.id + (r.openAlerts ? ' · <span style="color:#ff9a9a">' + r.openAlerts + ' alert' + (r.openAlerts > 1 ? 's' : '') + '</span>' : '') + '</div></td>';
      case 'domain': return '<td>' + U.esc(r.domain) + '</td>';
      case 'st': return '<td><div class="st">' + U.esc(r.source) + '<span class="arrow-r">→</span>' + U.esc(r.target) + '</div></td>';
      case 'type': return '<td class="dim">' + U.esc(r.type) + '</td>';
      case 'status': return '<td><span data-tip="' + U.esc(r.reasons.length ? '<div class="tt-h">Why</div>' + r.reasons.map((x) => '<div class="tt-r">' + U.esc(x) + '</div>').join('') : '') + '">' + ui.badge(r.status, r.status === 'running' && r.progress ? 'Running ' + Math.round(r.progress * 100) + '%' : null) + '</span></td>';
      case 'start': return '<td class="num">' + (r.startTime ? U.fmtHM(r.startTime) : '<span class="muted">sched ' + U.fmtHM(r.scheduledTime) + '</span>') + '</td>';
      case 'dur': return '<td>' + durCell(r) + '</td>';
      case 'records': return '<td class="td-r num">' + (r.recordsProcessed ? U.fmtInt(r.recordsProcessed) : '<span class="muted">—</span>') + '</td>';
      case 'last': return '<td class="dim">' + U.fmtAgo(r.lastRun) + '</td>';
      case 'sla': return '<td>' + ui.slaTag(r.slaStatus) + '</td>';
      case 'trend': return '<td>' + histCell(r) + '</td>';
    }
    return '<td></td>';
  }

  W.pipelineTable = function (el, rows, o) {
    o = o || {};
    const local = o.local || {};
    const cols = o.compact ? COLS.filter((c) => COMPACT.indexOf(c.k) >= 0) : COLS;
    if (local.sortKey) {
      const col = COLS.find((c) => c.k === local.sortKey);
      if (col && col.sort) rows = rows.slice().sort((a, b) => { const x = col.sort(a), y = col.sort(b); return (x > y ? 1 : x < y ? -1 : 0) * (local.sortDir || 1); });
    }
    if (o.limit) rows = rows.slice(0, o.limit);
    const head = '<tr>' + cols.map((c) => '<th class="' + (c.sort ? 'sortable ' : '') + (local.sortKey === c.k ? 'sorted ' : '') + (c.r ? 'td-r' : '') + '" data-k="' + c.k + '">' + c.t + (c.sort ? '<span class="arrow">' + (local.sortKey === c.k ? (local.sortDir === 1 ? '▲' : '▼') : '↕') + '</span>' : '') + '</th>').join('') + '</tr>';
    const body = rows.length ? rows.map((r) => '<tr class="clickable row-' + r.status + (o.selected === r.id ? ' selected' : '') + '" data-id="' + r.id + '">' + cols.map((c) => cell(c.k, r)).join('') + '</tr>').join('')
      : '<tr><td colspan="' + cols.length + '"><div class="empty">No pipelines match the current filters.</div></td></tr>';
    el.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    el.querySelectorAll('th.sortable').forEach((th) => th.addEventListener('click', () => {
      const k = th.getAttribute('data-k');
      if (local.sortKey === k) local.sortDir = -(local.sortDir || 1); else { local.sortKey = k; local.sortDir = 1; }
      W.pipelineTable(el, o.rawRows || rows, Object.assign({}, o, { rawRows: o.rawRows || rows }));
    }));
    el.querySelectorAll('tbody tr[data-id]').forEach((tr) => tr.addEventListener('click', () => {
      el.querySelectorAll('tr.selected').forEach((x) => x.classList.remove('selected'));
      tr.classList.add('selected');
      OC.drawer.open({ pipelineId: tr.getAttribute('data-id') });
    }));
  };

  /* ---------- Timeline (Gantt) ---------- */
  W.timeline = function (el, data, o) {
    o = o || {};
    const span = data.to - data.from;
    const pct = (t) => U.clamp(100 * (t - data.from) / span, 0, 100);
    const hours = span / 3600000;
    const step = hours > 30 ? 4 : hours > 13 ? 2 : 1;
    const ticks = [];
    const first = Math.ceil(data.from / 3600000) * 3600000;
    for (let t = first; t <= data.to; t += 3600000) { const h = new Date(t).getHours(); if (h % step === 0) ticks.push(t); }
    const grid = '<div class="gantt-grid" style="left:var(--gl)">' + ticks.map((t) => '<div class="vl" style="left:' + pct(t) + '%"></div>').join('') + '<div class="future" style="left:' + pct(data.now) + '%"></div><div class="now" style="left:' + pct(data.now) + '%"></div></div>';
    const axis = '<div class="gantt-axis"><div style="padding:6px 16px;font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;font-weight:650">Pipeline</div><div class="ga">' + ticks.map((t) => '<span class="tick" style="left:' + pct(t) + '%">' + (new Date(t).getHours() === 0 ? '<b style="color:var(--text-2)">' + U.fmtDay(t) + '</b>' : U.fmtHM(t)) + '</span>').join('') + '</div></div>';
    let rows = data.rows;
    if (o.onlyIssues) rows = rows.filter((r) => ['success', 'running'].indexOf(r.health) < 0);
    const order = { failed: 0, delayed: 1, blocked: 2, warning: 3, running: 4, queued: 5, success: 6 };
    if (o.sortBy === 'status') rows = rows.slice().sort((a, b) => order[a.health] - order[b.health]);
    let html = '';
    const renderRow = (r) => {
      const bars = r.bars.map((b) => {
        const left = pct(b.start), width = Math.max(0.25, pct(b.end) - left);
        let cls = b.planned ? 'planned' : b.notStarted ? 'notstarted ' + b.status : b.status;
        if (b.sla && b.status === 'success') cls += ' sla';
        const tipH = '<div class="tt-h">' + U.esc(r.name) + '</div>' +
          ui.ttRow((ui.STATUS[b.status] || ui.STATUS.pending).color, 'Status', b.planned ? 'Planned' : b.notStarted ? (b.status === 'delayed' ? 'Not started (late)' : ui.STATUS[b.status].label) : ui.STATUS[b.status].label + (b.retries ? ' · ' + b.retries + ' retr' + (b.retries > 1 ? 'ies' : 'y') : '')) +
          ui.ttRow('', b.notStarted || b.planned ? 'Scheduled' : 'Start', U.fmtDateTime(b.notStarted || b.planned ? b.scheduled : b.start)) +
          (b.notStarted || b.planned ? '' : ui.ttRow('', b.running ? 'Elapsed' : 'Duration', U.fmtDur(b.durationSec))) +
          (b.records ? ui.ttRow('', 'Records', U.fmtInt(b.records)) : '') +
          (b.sla ? ui.ttRow('var(--warn)', 'SLA', 'Breached') : '') +
          (b.reason ? '<div class="tt-r" style="margin-top:4px;max-width:260px;white-space:normal">' + U.esc(b.reason) + '</div>' : '') +
          (b.execId ? '<div class="tt-r muted" style="font-size:11px">Click to open execution</div>' : '');
        return '<div class="gbar ' + cls + '" style="left:' + left + '%;width:' + width + '%" data-exec="' + (b.execId || '') + '" data-pid="' + r.id + '" data-tip="' + U.esc(tipH) + '"></div>';
      }).join('');
      return '<div class="gantt-row"><div class="gl" data-pid="' + r.id + '">' + ui.dot(r.health) + '<span class="nm">' + U.esc(r.name) + '</span></div><div class="gt">' + bars + '</div></div>';
    };
    if (o.group) {
      const g = U.groupBy(rows, (r) => r.domain);
      Object.keys(g).sort().forEach((d) => { html += '<div class="gantt-group">' + U.esc(d) + ' · ' + g[d].length + '</div>' + g[d].map(renderRow).join(''); });
    } else html = rows.map(renderRow).join('');
    el.innerHTML = '<div class="gantt">' + axis + '<div style="position:relative">' + grid + html + '</div></div>';
    el.querySelectorAll('.gbar[data-exec]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.exec) { ui.tip.hide(); OC.drawer.open({ pipelineId: b.dataset.pid, execId: b.dataset.exec, tab: 'flow' }); } }));
    el.querySelectorAll('.gl[data-pid]').forEach((b) => b.addEventListener('click', () => OC.drawer.open({ pipelineId: b.dataset.pid })));
  };
  W.timelineLegend = function () {
    const sw = (bg, label, extra) => '<span class="lg"><span class="sw" style="background:' + bg + ';' + (extra || '') + '"></span>' + label + '</span>';
    return '<div class="legend">' + sw('var(--ok)', 'Success') + sw('var(--fail)', 'Failed') + sw('var(--run)', 'Running') + sw('var(--warn)', 'Delayed / over SLA') + sw('transparent', 'Not started / blocked', 'border:1px dashed var(--warn)') + sw('transparent', 'Planned', 'border:1px dashed var(--queue)') + '</div>';
  };

  /* ---------- Alert list ---------- */
  W.alertList = function (el, alerts, o) {
    o = o || {};
    if (!alerts.length) { el.innerHTML = '<div class="empty">' + ui.icon('checkCircle', 'lg') + '<div style="margin-top:8px">No alerts for the current filters.</div></div>'; return; }
    el.innerHTML = '<div class="alert-list">' + alerts.map((a) => {
      const col = ui.SEV[a.severity].color;
      return '<div class="alert ' + (o.compact ? 'compact ' : '') + (a.status === 'resolved' ? 'resolved' : '') + '" data-id="' + a.id + '">' +
        '<div class="stripe" style="background:' + col + '"></div>' +
        '<div style="min-width:0"><div class="a-top">' + ui.sevTag(a.severity) + '<span class="a-title">' + U.esc(a.title) + '</span>' + (o.compact ? '' : '<span class="type-tag">' + ui.ALERT_TYPES[a.type] + '</span>') + '</div>' +
        '<div class="a-desc">' + U.esc(a.description) + '</div>' +
        '<div class="a-meta"><span>' + ui.icon('clock', 'sm') + U.fmtAgo(a.ts) + '</span><span>' + ui.icon('layers', 'sm') + U.esc(a.pipelineName) + '</span>' + (o.compact ? '' : '<span>' + ui.icon('user', 'sm') + 'Owner: ' + U.esc(a.owner) + '</span><span class="mono muted">' + a.id + '</span>') + '</div></div>' +
        '<div class="a-act"><span class="pill ' + a.status + '">' + a.status.charAt(0).toUpperCase() + a.status.slice(1) + '</span>' +
        '<div style="display:flex;gap:6px">' + (!o.compact && a.status === 'open' ? '<button class="btn sm ghost" data-act="ack">Acknowledge</button>' : '') + (!o.compact && a.status !== 'resolved' ? '<button class="btn sm ghost" data-act="resolve">Resolve</button>' : '') + '<button class="btn sm" data-act="view">View details ' + ui.icon('chevR', 'sm') + '</button></div></div></div>';
    }).join('') + '</div>';
    el.querySelectorAll('.alert').forEach((row) => {
      const a = alerts.find((x) => x.id === row.dataset.id);
      row.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const act = b.dataset.act;
        if (act === 'view') OC.drawer.open({ pipelineId: a.pipelineId, tab: a.type === 'data_quality' ? 'dq' : a.type === 'failure' || a.type === 'retry' || a.type === 'long_running' ? 'flow' : 'overview' });
        else OC.api.updateAlert(OC.store.filters().env, a.id, { status: act === 'ack' ? 'acknowledged' : 'resolved' }).then(() => { ui.toast(a.id + ' ' + (act === 'ack' ? 'acknowledged' : 'resolved')); OC.app.refresh(true); });
      }));
    });
  };

  /* ---------- Horizontal bar list ---------- */
  W.hbars = function (el, items, o) {
    o = o || {};
    const max = o.max || Math.max.apply(null, items.map((i) => Math.max(i.value || 0, i.marker || 0)).concat([1]));
    el.innerHTML = '<div class="hbar-list">' + items.map((it) => '<div class="hbar ' + (it.id ? 'clickable' : '') + '" data-id="' + (it.id || '') + '"' + (it.tip ? ' data-tip="' + U.esc(it.tip) + '"' : '') + '><span class="hl" title="' + U.esc(it.label) + '">' + U.esc(it.label) + '</span><span class="ht"><i style="width:' + (100 * (it.value || 0) / max) + '%;background:' + (it.color || 'var(--s1)') + '"></i>' + (it.marker != null ? '<span class="mk" style="left:' + Math.min(100, 100 * it.marker / max) + '%"></span>' : '') + '</span><span class="hv">' + (o.fmt ? o.fmt(it.value, it) : it.value) + '</span></div>').join('') + '</div>';
    el.querySelectorAll('.hbar[data-id]').forEach((h) => { if (h.dataset.id) h.addEventListener('click', () => OC.drawer.open({ pipelineId: h.dataset.id })); });
  };

  OC.widgets = W;
})(window.OpsCenter);
