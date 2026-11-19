/* ==========================================================================
   Pipeline detail drawer — the drill-down path:
   Dashboard → Pipeline → Execution → Step → Logs / Metrics / Data Quality
   ========================================================================== */
(function (OC) {
  'use strict';
  const U = OC.utils, ui = OC.ui, C = OC.charts, W = OC.widgets, api = OC.api;
  const st = { open: false, pipelineId: null, execId: null, stepId: null, tab: 'overview', logLevel: 'ALL', logQ: '', logStep: '' };
  let cache = {};
  let el, scrim;

  const TABS = [['overview', 'Overview', 'dashboard'], ['executions', 'Executions', 'table'], ['flow', 'Flow & Steps', 'network'], ['logs', 'Logs', 'terminal'], ['dq', 'Data Quality', 'shield'], ['alerts', 'Alerts', 'bell']];

  function ensure() {
    if (el) return;
    scrim = document.createElement('div'); scrim.className = 'scrim';
    el = document.createElement('aside'); el.className = 'drawer'; el.setAttribute('aria-label', 'Pipeline details');
    document.body.appendChild(scrim); document.body.appendChild(el);
    scrim.addEventListener('click', close);
  }

  async function open(opts) {
    ensure();
    const changedPipeline = opts.pipelineId !== st.pipelineId;
    Object.assign(st, { pipelineId: opts.pipelineId, execId: opts.execId || (changedPipeline ? null : st.execId), stepId: opts.stepId || null, tab: opts.tab || 'overview' });
    if (changedPipeline) { st.logLevel = 'ALL'; st.logQ = ''; st.logStep = ''; }
    st.open = true;
    el.classList.add('open'); scrim.classList.add('open');
    if (changedPipeline || !cache.p) el.innerHTML = '<div class="dr-body"><div class="skeleton" style="height:80px"></div><div class="skeleton" style="height:200px"></div><div class="skeleton" style="height:260px"></div></div>';
    await load();
    render();
  }
  function close() {
    if (!el) return;
    st.open = false; el.classList.remove('open'); scrim.classList.remove('open');
    U.$$('tr.selected').forEach((x) => x.classList.remove('selected'));
  }
  async function load() {
    const env = OC.store.filters().env;
    const [p, execs] = await Promise.all([api.getPipeline(env, st.pipelineId), api.getExecutions(env, st.pipelineId, 40)]);
    if (!st.execId || !execs.find((e) => e.id === st.execId)) st.execId = execs[0].id;
    const [ex, logs] = await Promise.all([api.getExecution(env, st.execId), api.getLogs(env, st.execId)]);
    cache = { p, execs, ex, logs };
    if (st.stepId && !ex.steps.find((s) => s.id === st.stepId)) st.stepId = null;
  }
  async function selectExec(id, tab) { st.execId = id; st.stepId = null; st.logStep = ''; if (tab) st.tab = tab; await load(); render(); }

  /* ---------- render ---------- */
  function render() {
    const { p, ex } = cache;
    const isLatest = ex.id === cache.execs[0].id;
    const step = st.stepId ? ex.steps.find((s) => s.id === st.stepId) : null;
    const counts = { alerts: p.alerts.filter((a) => a.status !== 'resolved').length, dq: p.dataQuality.filter((c) => c.status !== 'pass').length, logs: cache.logs.filter((l) => l.level === 'ERROR').length };
    el.innerHTML =
      '<div class="dr-head">' +
        '<div class="breadcrumb"><button data-bc="dash">Dashboard</button>' + ui.icon('chevR', 'sm') +
          '<button data-bc="pipe" class="' + (st.tab === 'overview' && !step ? 'cur' : '') + '">' + U.esc(p.name) + '</button>' + ui.icon('chevR', 'sm') +
          '<button data-bc="exec" class="mono ' + (!step && st.tab !== 'overview' ? 'cur' : '') + '">Execution ' + ex.id + (isLatest ? ' (latest)' : '') + '</button>' +
          (step ? ui.icon('chevR', 'sm') + '<span class="cur">Step: ' + U.esc(step.name) + '</span>' : '') + '</div>' +
        '<div class="dr-title"><h2>' + U.esc(p.name) + '</h2>' + ui.badge(p.health) +
          '<div class="dr-actions"><button class="btn" data-act="rerun">' + ui.icon('retry', 'sm') + 'Re-run</button><button class="btn" data-act="ext">' + ui.icon('external', 'sm') + 'Open in ' + p.platformShort + '</button><button class="icon-btn" data-act="close" title="Close (Esc)">' + ui.icon('x') + '</button></div></div>' +
        '<div class="dr-meta"><span>' + ui.icon('server', 'sm') + U.esc(p.platformName) + '</span><span>' + ui.icon('layers', 'sm') + U.esc(p.domain) + '</span><span>' + ui.icon('user', 'sm') + U.esc(p.owner) + '</span><span>' + ui.icon('clock', 'sm') + U.esc(p.schedule.label) + '</span><span class="chip">' + p.environment.toUpperCase() + '</span></div>' +
        '<div class="tabs" style="padding:0;border:0">' + TABS.map((t) => '<button class="tab ' + (st.tab === t[0] ? 'active' : '') + '" data-tab="' + t[0] + '">' + ui.icon(t[2], 'sm') + t[1] + (t[0] === 'alerts' && counts.alerts ? ' <span class="c" style="background:var(--fail-soft);color:#ff9a9a">' + counts.alerts + '</span>' : '') + (t[0] === 'dq' && counts.dq ? ' <span class="c" style="background:var(--warn-soft);color:#ffc15a">' + counts.dq + '</span>' : '') + (t[0] === 'logs' && counts.logs ? ' <span class="c" style="background:var(--fail-soft);color:#ff9a9a">' + counts.logs + '</span>' : '') + '</button>').join('') + '</div>' +
      '</div><div class="dr-body fade-in" id="dr-body"></div>';
    const body = U.$('#dr-body', el);
    ({ overview: rOverview, executions: rExecutions, flow: rFlow, logs: rLogs, dq: rDQ, alerts: rAlerts })[st.tab](body);
    // wiring
    U.$$('[data-tab]', el).forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; if (st.tab !== 'flow') st.stepId = null; render(); }));
    U.$$('[data-bc]', el).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.bc;
      if (k === 'dash') { close(); OC.app.nav('overview'); }
      if (k === 'pipe') { st.stepId = null; st.tab = 'overview'; render(); }
      if (k === 'exec') { st.stepId = null; st.tab = 'flow'; render(); }
    }));
    U.$('[data-act="close"]', el).addEventListener('click', close);
    U.$('[data-act="rerun"]', el).addEventListener('click', () => api.rerun(p.environment, p.id).then((r) => ui.toast('Re-run submitted for <b>' + U.esc(p.name) + '</b> (mock)', 'play')));
    U.$('[data-act="ext"]', el).addEventListener('click', () => ui.toast('Would deep-link to ' + U.esc(p.platformName) + ' run page for ' + ex.id, 'external'));
  }

  function callout(p) {
    const e = p.latest;
    if (p.health === 'failed') return '<div class="callout fail">' + ui.icon('xCircle') + '<div><b>Latest execution failed</b> ' + U.fmtAgo(e.end) + ' after ' + U.fmtDur(e.durationSec) + (e.retries ? ' and ' + e.retries + ' retries' : '') + '.<br>' + U.esc(e.error) + (p.downstreamDetail.length ? '<br><span style="opacity:.85">Downstream impact: ' + p.downstreamDetail.map((d) => U.esc(d.name)).join(', ') + '</span>' : '') + '</div></div>';
    if (p.health === 'delayed') return '<div class="callout warn">' + ui.icon('clock') + '<div><b>' + (e.start ? 'Running beyond SLA' : 'Not started') + '</b> — ' + U.esc(p.reasons.join(' · ')) + '</div></div>';
    if (p.health === 'blocked') return '<div class="callout blocked">' + ui.icon('ban') + '<div><b>Blocked</b> — ' + U.esc(p.reasons[0]) + '. Will start automatically once upstream succeeds.</div></div>';
    if (p.health === 'warning') return '<div class="callout warn">' + ui.icon('alert') + '<div><b>Completed with warnings</b><br>' + p.reasons.map(U.esc).join('<br>') + '</div></div>';
    if (p.health === 'queued') return '<div class="callout info">' + ui.icon('hourglass') + '<div><b>Queued</b> — ' + U.esc(p.reasons[0]) + '</div></div>';
    if (p.health === 'running') return '<div class="callout info">' + ui.icon('loader') + '<div><b>Running</b> — ' + Math.round((e.progress || 0) * 100) + '% complete, elapsed ' + U.fmtDur(e.durationSec) + ' of ' + U.fmtMin(p.sla.maxDurationMin) + ' SLA.</div></div>';
    return '';
  }
  const kv = (pairs) => '<div class="kv">' + pairs.map((x) => '<div><div class="k">' + x[0] + '</div><div class="v" title="' + U.esc(String(x[1]).replace(/<[^>]+>/g, '')) + '">' + x[1] + '</div></div>').join('') + '</div>';
  function execKv(e) {
    return kv([
      ['Execution ID', '<span class="mono">' + e.id + '</span>'], ['Status', ui.badge(e.status === 'running' && e.slaBreached ? 'delayed' : e.status)], ['Trigger', e.trigger],
      ['Scheduled', U.fmtDateTime(e.scheduledTime)], ['Start time', e.start ? U.fmtDateTime(e.start) + ':' + String(new Date(e.start).getSeconds()).padStart(2, '0') : '—'], ['End time', e.end ? U.fmtDateTime(e.end) : e.status === 'running' ? 'in progress' : '—'],
      ['Duration', e.durationSec != null ? U.fmtDur(e.durationSec) + (e.slaBreached ? ' <span class="sla-breached">(over SLA)</span>' : '') : '—'], ['Records read', U.fmtInt(e.recordsRead)], ['Records written', U.fmtInt(e.recordsWritten)],
      ['Rejected / quarantined', U.fmtInt(e.recordsRejected)], ['Files processed', U.fmtInt(e.filesProcessed)], ['Data volume (in / out)', U.fmtGB(e.volumeInGB) + ' / ' + U.fmtGB(e.volumeOutGB)],
      ['Retries', e.retries ? '<span class="sla-at_risk">' + e.retries + '</span>' : '0'], ['Compute time', (e.computeHours || 0).toFixed(1) + ' node-hours'], ['Queue time', U.fmtDur(e.queueSec)]
    ]);
  }
  function flowHtml(steps, compact) {
    return '<div class="flow ' + (compact ? 'compact' : '') + '">' + steps.map((s, i) => {
      const slow = s.status === 'running' && cache.ex.stuckAt != null;
      return (i ? '<div class="flow-arrow ' + (steps[i - 1].status === 'success' ? 'done' : '') + '">' + ui.icon('arrowR', 'sm') + '</div>' : '') +
        '<div class="flow-node ' + s.status + (slow ? ' slow' : '') + (st.stepId === s.id ? ' picked' : '') + '" data-step="' + s.id + '"><div class="fn-k">' + ui.icon((ui.STATUS[s.status] || ui.STATUS.pending).icon, 'sm') + (slow ? 'Slow' : (ui.STATUS[s.status] || ui.STATUS.pending).label) + '</div><div class="fn-n">' + s.name + '</div><div class="fn-a">' + U.esc(s.activity) + '</div><div class="fn-d"><span>' + (s.durationSec ? U.fmtDur(s.durationSec) : '—') + '</span><span>' + (s.recordsOut != null ? U.fmtNum(s.recordsOut) : '') + '</span></div></div>';
    }).join('') + '</div>';
  }

  function rOverview(b) {
    const { p, ex, execs } = cache;
    b.innerHTML = callout(p) +
      '<div class="section-t">Overview</div>' +
      kv([['Pipeline', U.esc(p.name)], ['Pipeline ID', '<span class="mono">' + p.id + '</span>'], ['Current status', ui.badge(p.health)], ['Environment', p.environment.toUpperCase()], ['Owner', U.esc(p.owner)], ['Business domain', U.esc(p.domain)],
        ['Platform', U.esc(p.platformName) + ' <span class="muted">(' + p.cloud + ')</span>'], ['Type', U.esc(p.type)], ['Schedule', U.esc(p.schedule.label) + ' <span class="mono muted">' + p.schedule.cron + '</span>'],
        ['SLA', U.esc(p.sla.label)], ['Last successful run', p.lastSuccess ? U.fmtDateTime(p.lastSuccess) + ' <span class="muted">(' + U.fmtAgo(p.lastSuccess) + ')</span>' : '—'], ['Current execution ID', '<span class="mono">' + p.latest.id + '</span>'],
        ['Source', U.esc(p.source)], ['Target', U.esc(p.target)], ['Data quality', p.dqSummary.pass + '/' + p.dqSummary.total + ' checks passing']]) +
      '<div class="section-t">Execution information <span class="mono" style="text-transform:none;letter-spacing:0">' + ex.id + '</span><button class="link-btn" style="margin-left:auto" data-goto="executions">Other executions ' + ui.icon('chevR', 'sm') + '</button></div>' + execKv(ex) +
      '<div class="section-t">Pipeline flow<button class="link-btn" style="margin-left:auto" data-goto="flow">Step details ' + ui.icon('chevR', 'sm') + '</button></div>' + flowHtml(ex.steps, false) +
      '<div class="section-t">Recent runs — duration vs SLA</div><div class="card" style="padding:12px 14px"><div id="dr-runs"></div></div>' +
      '<div class="section-t">Lineage</div><div class="grid g-12"><div class="card span-6" style="padding:12px 14px"><div class="muted" style="font-size:11px;margin-bottom:6px">UPSTREAM</div>' + (p.upstreamDetail.length ? p.upstreamDetail.map(lin).join('') : '<span class="muted">None — source pipeline</span>') + '</div><div class="card span-6" style="padding:12px 14px"><div class="muted" style="font-size:11px;margin-bottom:6px">DOWNSTREAM</div>' + (p.downstreamDetail.length ? p.downstreamDetail.map(lin).join('') : '<span class="muted">No downstream pipelines</span>') + '</div></div>';
    const runs = execs.filter((e) => e.durationSec != null).slice(0, 24).reverse();
    C.bars(U.$('#dr-runs', b), {
      labels: runs.map((e) => (p.schedule.everyMin >= 1440 ? U.fmtDay(e.start) : U.fmtHM(e.start))), tipLabels: runs.map((e) => e.id + ' · ' + U.fmtDateTime(e.start)), height: 170,
      series: [{ name: 'Duration', color: (v, i) => runs[i].status === 'failed' ? '#ef4c4c' : runs[i].status === 'running' ? '#3b8ef0' : runs[i].slaBreached ? '#f5a524' : '#3987e5', values: runs.map((e) => e.durationSec / 60) }],
      yMax: C.niceMax(Math.max(p.sla.maxDurationMin * 1.1, Math.max.apply(null, runs.map((e) => e.durationSec / 60)) * 1.05)),
      yFmt: (v) => Math.round(v) + 'm', tipFmt: (v) => U.fmtMin(v), onClick: (i) => selectExec(runs[i].id, 'flow')
    });
    // SLA reference line overlay
    const svg = U.$('#dr-runs svg', b);
    if (svg) {
      const H = 170, top = 10, ih = H - 10 - 24, max = C.niceMax(Math.max(p.sla.maxDurationMin * 1.1, Math.max.apply(null, runs.map((e) => e.durationSec / 60)) * 1.05));
      const y = top + ih - ih * p.sla.maxDurationMin / max;
      svg.insertAdjacentHTML('beforeend', '<line x1="46" x2="' + (svg.getAttribute('width') - 12) + '" y1="' + y + '" y2="' + y + '" stroke="#f5a524" stroke-dasharray="4 4" style="pointer-events:none"/><text x="' + (svg.getAttribute('width') - 12) + '" y="' + (y - 4) + '" text-anchor="end" style="fill:#f5a524">SLA ' + U.fmtMin(p.sla.maxDurationMin) + '</text>');
    }
    wireCommon(b);
  }
  const lin = (d) => '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer" data-pipe="' + d.id + '">' + ui.dot(d.status) + '<span>' + U.esc(d.name) + '</span><span style="margin-left:auto">' + ui.badge(d.status) + '</span></div>';

  function rExecutions(b) {
    const { p, execs, ex } = cache;
    b.innerHTML = '<div class="section-t">Last ' + execs.length + ' executions · click to inspect</div><div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Execution ID</th><th>Status</th><th>Scheduled</th><th>Start</th><th>Duration</th><th class="td-r">Records</th><th class="td-r">Volume</th><th class="td-r">Retries</th><th>Trigger</th></tr></thead><tbody>' +
      execs.map((e) => {
        const s = e.status === 'running' && e.slaBreached ? 'delayed' : e.status;
        const pct = e.durationSec ? 100 * e.durationSec / (p.sla.maxDurationMin * 60) : 0;
        return '<tr class="clickable ' + (e.id === ex.id ? 'selected' : '') + ' row-' + s + '" data-exec="' + e.id + '"><td class="mono">' + e.id + '</td><td>' + ui.badge(s) + '</td><td class="num dim">' + U.fmtDateTime(e.scheduledTime) + '</td><td class="num">' + (e.start ? U.fmtHM(e.start) : '—') + '</td>' +
          '<td>' + (e.durationSec != null ? '<div class="durbar"><span class="num" style="min-width:58px">' + U.fmtDur(e.durationSec) + '</span><span class="bar"><i style="width:' + Math.min(100, pct) + '%;background:' + (pct > 100 ? 'var(--fail)' : pct > 80 ? 'var(--warn)' : 'var(--ok)') + '"></i></span></div>' : '—') + '</td>' +
          '<td class="td-r num">' + U.fmtInt(e.recordsRead) + '</td><td class="td-r num">' + U.fmtGB(e.volumeInGB) + '</td><td class="td-r num">' + (e.retries ? '<span class="sla-at_risk">' + e.retries + '</span>' : '0') + '</td><td class="dim">' + e.trigger + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    U.$$('tr[data-exec]', b).forEach((tr) => tr.addEventListener('click', () => selectExec(tr.dataset.exec, 'flow')));
  }

  function rFlow(b) {
    const { ex, p } = cache;
    if (!st.stepId) { const s = ex.steps.find((x) => x.status === 'failed' || x.status === 'running') || ex.steps.find((x) => x.start) || ex.steps[0]; st.stepId = s.id; }
    const s = ex.steps.find((x) => x.id === st.stepId);
    const stepLogs = cache.logs.filter((l) => l.stepId === s.id);
    const isVal = s.kind === 'validate';
    b.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="mono dim">' + ex.id + '</span>' + ui.badge(ex.status === 'running' && ex.slaBreached ? 'delayed' : ex.status) + '<span class="dim">' + (ex.start ? 'started ' + U.fmtDateTime(ex.start) : 'scheduled ' + U.fmtDateTime(ex.scheduledTime)) + '</span>' + (ex.durationSec != null ? '<span class="dim">· ' + U.fmtDur(ex.durationSec) + '</span>' : '') +
      '<select class="sel" id="dr-exsel" style="margin-left:auto">' + cache.execs.slice(0, 20).map((e) => '<option value="' + e.id + '" ' + (e.id === ex.id ? 'selected' : '') + '>' + (e.start ? U.fmtDateTime(e.start) : 'scheduled ' + U.fmtHM(e.scheduledTime)) + ' · ' + e.status + '</option>').join('') + '</select></div>' +
      (ex.error ? '<div class="callout fail">' + ui.icon('xCircle') + '<div>' + U.esc(ex.error) + '</div></div>' : '') +
      '<div class="section-t">Pipeline flow · click a step</div>' + flowHtml(ex.steps, false) +
      '<div class="card" style="padding:14px 16px"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><h3 style="margin:0;font-size:14px">Step: ' + U.esc(s.name) + '</h3>' + ui.badge(s.status) + '<span class="dim">' + U.esc(s.activity) + '</span></div>' +
        (s.message ? '<div class="callout fail" style="margin-bottom:10px">' + ui.icon('xCircle') + '<div>' + U.esc(s.message) + (s.attempts > 1 ? '<br><span style="opacity:.8">' + s.attempts + ' attempts</span>' : '') + '</div></div>' : '') +
        (s.status === 'running' && ex.stuckAt != null ? '<div class="callout warn" style="margin-bottom:10px">' + ui.icon('clock') + '<div>Step running ' + U.fmtDur(s.durationSec) + ' — about 2× slower than its 30-day p95. Likely cause: data skew on <span class="mono">customer_id</span>. Consider salting the join key or enabling AQE skew handling.</div></div>' : '') +
        '<div class="section-t" style="margin:0 0 8px">Step metrics</div>' +
        kv([['Status', ui.badge(s.status)], ['Start', s.start ? U.fmtTime(s.start) : '—'], ['End', s.end ? U.fmtTime(s.end) : s.status === 'running' ? 'in progress' : '—'], ['Duration', s.durationSec ? U.fmtDur(s.durationSec) : '—'],
          ['Records in', s.recordsIn != null ? U.fmtInt(s.recordsIn) : '—'], ['Records out', s.recordsOut != null ? U.fmtInt(s.recordsOut) : '—'], ['Rejected', U.fmtInt(s.rejected)], ['Throughput', s.throughput ? U.fmtNum(s.throughput) + ' rec/min' : '—'],
          ['Attempts', s.attempts], ['CPU', s.cpuUtil ? s.cpuUtil + '%' : '—'], ['Memory', s.memoryGB ? s.memoryGB + ' GB' : '—']]) +
        (isVal ? '<div class="section-t" style="margin:14px 0 8px">Data-quality checks evaluated in this step</div>' + dqTable(p.dataQuality, true) : '') +
        '<div class="section-t" style="margin:14px 0 8px">Step logs <button class="link-btn" style="margin-left:auto" data-alllogs="1">Open in log viewer ' + ui.icon('chevR', 'sm') + '</button></div>' + logBox(stepLogs.length ? stepLogs : [], '') +
      '</div>';
    U.$$('[data-step]', b).forEach((n) => n.addEventListener('click', () => { st.stepId = n.dataset.step; render(); }));
    U.$('#dr-exsel', b).addEventListener('change', (ev) => selectExec(ev.target.value, 'flow'));
    U.$('[data-alllogs]', b).addEventListener('click', () => { st.logStep = s.id; st.tab = 'logs'; render(); });
  }

  function logBox(lines, q) {
    if (!lines.length) return '<div class="logbox"><div class="logline"><span class="msg muted">No log lines.</span></div></div>';
    const stepName = (id) => { const s = cache.ex.steps.find((x) => x.id === id); return s ? s.name : 'pipeline'; };
    const hl = (m) => { const e = U.esc(m); if (!q) return e; const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'); return e.replace(re, '<mark>$1</mark>'); };
    return '<div class="logbox">' + lines.map((l) => '<div class="logline l-' + l.level + '"><span class="ts">' + U.fmtTime(l.ts) + '</span><span class="lv lv-' + l.level + '">' + l.level + '</span><span class="stp">' + stepName(l.stepId) + '</span><span class="msg">' + hl(l.message) + '</span></div>').join('') + '</div>';
  }

  function rLogs(b) {
    const { logs, ex } = cache;
    const lv = ['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'];
    const draw = () => {
      const q = st.logQ.toLowerCase();
      const lines = logs.filter((l) => (st.logLevel === 'ALL' || l.level === st.logLevel) && (!st.logStep || l.stepId === st.logStep) && (!q || l.message.toLowerCase().indexOf(q) >= 0));
      U.$('#lg-box', b).innerHTML = logBox(lines, st.logQ);
      U.$('#lg-count', b).textContent = lines.length + ' of ' + logs.length + ' lines';
      U.$$('#lg-lv .schip', b).forEach((c) => c.classList.toggle('active', c.dataset.lv === st.logLevel));
    };
    b.innerHTML = '<div class="toolbar" style="padding:0;border:0"><div class="input-wrap">' + ui.icon('search') + '<input class="input" id="lg-q" placeholder="Search logs…" value="' + U.esc(st.logQ) + '"></div>' +
      '<div class="status-chips" id="lg-lv">' + lv.map((l) => '<span class="schip" data-lv="' + l + '"><span class="lv-' + l + '" style="font-weight:700;font-size:11px">' + l + '</span> <span class="n">' + (l === 'ALL' ? logs.length : logs.filter((x) => x.level === l).length) + '</span></span>').join('') + '</div>' +
      '<select class="sel" id="lg-step"><option value="">All steps</option>' + ex.steps.map((s) => '<option value="' + s.id + '" ' + (st.logStep === s.id ? 'selected' : '') + '>' + s.name + '</option>').join('') + '</select>' +
      '<button class="btn" id="lg-dl" style="margin-left:auto">' + ui.icon('download', 'sm') + 'Download logs</button></div>' +
      '<div class="muted" style="font-size:11.5px;display:flex;gap:10px"><span class="mono">' + ex.id + '</span><span id="lg-count"></span></div><div id="lg-box"></div>';
    draw();
    U.$('#lg-q', b).addEventListener('input', U.debounce((ev) => { st.logQ = ev.target.value; draw(); }, 120));
    U.$$('#lg-lv .schip', b).forEach((c) => c.addEventListener('click', () => { st.logLevel = c.dataset.lv; draw(); }));
    U.$('#lg-step', b).addEventListener('change', (ev) => { st.logStep = ev.target.value; draw(); });
    U.$('#lg-dl', b).addEventListener('click', () => {
      const txt = logs.map((l) => new Date(l.ts).toISOString() + ' ' + l.level.padEnd(5) + ' [' + (l.stepId || 'pipeline') + '] ' + l.message).join('\n');
      U.downloadText(cache.p.id + '_' + ex.id + '.log', txt);
      ui.toast('Downloaded ' + logs.length + ' log lines', 'download');
    });
  }

  function dqTable(checks, compact) {
    const ic = (s) => s === 'pass' ? 'check' : s === 'warn' ? 'alert' : 'x';
    return '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Result</th><th>Check</th>' + (compact ? '' : '<th>Target</th>') + '<th>Observed</th><th>Expected</th>' + (compact ? '' : '<th>Last evaluated</th>') + '</tr></thead><tbody>' +
      checks.map((c) => '<tr class="' + (c.status === 'fail' ? 'row-failed' : c.status === 'warn' ? 'row-warning' : '') + '"><td><span class="dq-cell ' + c.status + '" style="width:22px;height:22px">' + ui.icon(ic(c.status)) + '</span></td><td style="font-weight:600">' + c.name + '</td>' + (compact ? '' : '<td class="dim">' + U.esc(c.target) + '</td>') + '<td>' + U.esc(c.observed) + '</td><td class="dim">' + U.esc(c.expected) + '</td>' + (compact ? '' : '<td class="dim">' + U.fmtAgo(c.lastRun) + '</td>') + '</tr>').join('') + '</tbody></table></div></div>';
  }
  function rDQ(b) {
    const { p } = cache;
    const s = p.dqSummary;
    b.innerHTML = '<div class="stat-row" style="grid-template-columns:repeat(4,1fr)">' + OC.views._stat('Checks', s.total) + OC.views._stat('<span class="sla-met">Passed</span>', s.pass) + OC.views._stat('<span class="sla-at_risk">Warning</span>', s.warn) + OC.views._stat('<span class="sla-breached">Failed</span>', s.fail) + '</div>' +
      '<div class="section-t">Results from last completed run</div>' + dqTable(p.dataQuality, false) +
      '<div class="muted" style="font-size:11.5px">Checks are platform-agnostic rules (Great Expectations, Deequ, dbt tests, Delta expectations or custom SQL) normalised into a common result model.</div>';
  }
  function rAlerts(b) {
    b.innerHTML = '<div class="card" id="dr-al"></div>';
    W.alertList(U.$('#dr-al', b), cache.p.alerts.slice().sort((a, b2) => b2.ts - a.ts), {});
  }
  function wireCommon(b) {
    U.$$('[data-step]', b).forEach((n) => n.addEventListener('click', () => { st.stepId = n.dataset.step; st.tab = 'flow'; render(); }));
    U.$$('[data-goto]', b).forEach((n) => n.addEventListener('click', () => { st.tab = n.dataset.goto; render(); }));
    U.$$('[data-pipe]', b).forEach((n) => n.addEventListener('click', () => open({ pipelineId: n.dataset.pipe })));
  }

  OC.drawer = {
    open, close,
    isOpen: () => st.open,
    currentPipeline: () => (st.open ? st.pipelineId : null),
    async refresh() { if (!st.open) return; const sc = U.$('#dr-body', el) ? U.$('#dr-body', el).scrollTop : 0; await load(); render(); const bd = U.$('#dr-body', el); if (bd) bd.scrollTop = sc; }
  };
})(window.OpsCenter);
