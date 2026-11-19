/* ==========================================================================
   Monitor views — Overview, Pipelines, Timeline, Alerts
   Each view: { title, subtitle, render(el, filters) } → fetches via OC.api.
   ========================================================================== */
(function (OC) {
  'use strict';
  const U = OC.utils, ui = OC.ui, W = OC.widgets, C = OC.charts, api = OC.api;
  OC.views = OC.views || {};
  const RANGE_LBL = { '24h': 'prior 24h', '7d': 'prior 7d', '30d': 'prior 30d' };

  function delta(cur, prev, opts) {
    opts = opts || {};
    if (prev == null || (prev === 0 && cur === 0)) return '<span class="k-delta">no change</span>';
    const d = opts.abs ? cur - prev : (prev ? 100 * (cur - prev) / prev : 100);
    if (Math.abs(d) < 0.05) return '<span class="k-delta">no change ' + (opts.vs || '') + '</span>';
    const up = d > 0;
    const good = opts.upIsGood ? up : !up;
    const txt = (up ? '↑ ' : '↓ ') + (opts.abs ? (opts.unit === 'pts' ? Math.abs(d).toFixed(1) + ' pts' : Math.abs(Math.round(d))) : Math.abs(d).toFixed(1) + '%');
    return '<span class="k-delta"><span class="' + (good ? 'delta-up-good' : 'delta-up-bad') + '">' + txt + '</span> ' + (opts.vs || '') + '</span>';
  }

  function kpiCard(o) {
    return '<div class="card kpi fade-in" style="--kc:' + o.color + ';--kcs:' + o.soft + '" data-go="' + (o.go || '') + '" data-chip="' + (o.chip || '') + '">' +
      '<div class="k-top"><span class="k-ic">' + ui.icon(o.icon) + '</span>' + o.label + '</div>' +
      '<div class="k-val num">' + o.value + '</div>' +
      '<div class="k-foot"><div>' + o.delta + (o.sub ? '<div class="k-sub">' + o.sub + '</div>' : '') + '</div>' + (o.spark ? '<div>' + C.sparkline(o.spark, o.sparkColor || o.colorHex, 70, 24) + '</div>' : '') + '</div></div>';
  }

  /* ======================================================================
     OVERVIEW
     ====================================================================== */
  OC.views.overview = {
    title: 'Overview',
    subtitle: 'Platform health at a glance — failures, SLA risk and what to investigate first.',
    async render(el, f) {
      const [o, rows, alerts, tl, sla, dq, dm] = await Promise.all([
        api.getOverview(f), api.getPipelines(f), api.getAlerts(f), api.getTimeline(f, 24), api.getSla(f), api.getDataQuality(f), api.getDataMetrics(f)
      ]);
      const c = o.counts, vs = 'vs ' + RANGE_LBL[o.range];
      const bannerCls = o.health.label === 'Healthy' ? 'ok' : c.failed ? 'crit' : 'warn';
      const top = o.priorities[0];
      const issues = [];
      if (c.failed) issues.push(c.failed + ' failed');
      if (c.delayed) issues.push(c.delayed + ' delayed');
      if (c.blocked) issues.push(c.blocked + ' blocked downstream');
      if (sla.counts.breached) issues.push(sla.counts.breached + ' SLA breach' + (sla.counts.breached > 1 ? 'es' : ''));
      if (dq.totals.fail) issues.push(dq.totals.fail + ' DQ check failures');

      el.innerHTML =
        '<div class="banner ' + bannerCls + ' fade-in">' +
          '<div class="b-icon">' + ui.icon(bannerCls === 'ok' ? 'checkCircle' : bannerCls === 'crit' ? 'xCircle' : 'alert', 'lg') + '</div>' +
          '<div style="min-width:0"><div class="b-title">PLATFORM ' + o.health.label.toUpperCase() + ' <span class="muted" style="font-weight:500;font-size:12px;margin-left:6px">' + f.env.toUpperCase() + ' · health score ' + o.health.score + '/100</span></div>' +
          '<div class="b-sub">' + (issues.length ? issues.join(' · ') : 'All pipelines healthy and within SLA.') + (top ? ' — <b style="color:var(--text)">Investigate first:</b> <a href="#" data-open="' + top.pipelineId + '">' + U.esc(top.name) + ' →</a>' : '') + '</div></div>' +
          '<div class="b-stats"><div class="b-stat"><div class="v num">' + o.openAlerts.total + '</div><div class="l">Open alerts</div></div><div class="b-stat"><div class="v num" style="color:#ff8080">' + o.openAlerts.critical + '</div><div class="l">Critical</div></div><div class="b-stat"><div class="v num">' + U.fmtPct(sla.compliance) + '</div><div class="l">SLA compliance</div></div></div>' +
        '</div>' +
        '<div class="kpis">' +
          kpiCard({ label: 'Total Pipelines', icon: 'layers', value: c.total, color: 'var(--accent)', soft: 'var(--accent-soft)', colorHex: '#4c8dff', delta: '<span class="k-delta">' + U.fmtInt(o.runs) + ' runs ' + (o.range === '24h' ? 'today' : 'in ' + o.range) + '</span>', spark: o.spark.runs, go: 'pipelines', chip: 'all' }) +
          kpiCard({ label: 'Running', icon: 'play', value: c.running, color: 'var(--run)', soft: 'var(--run-soft)', colorHex: '#3b8ef0', delta: '<span class="k-delta">' + (c.delayed ? '<span class="delta-up-bad">+' + rows.filter((r) => r.status === 'delayed' && r.execStatus === 'running').length + ' running over SLA</span>' : 'all within SLA') + '</span>', spark: o.spark.running, go: 'pipelines', chip: 'running' }) +
          kpiCard({ label: 'Successful', icon: 'checkCircle', value: c.success, color: 'var(--ok)', soft: 'var(--ok-soft)', colorHex: '#22b357', delta: '<span class="k-delta">+' + c.warning + ' with warnings</span>', spark: o.spark.success, go: 'pipelines', chip: 'success' }) +
          kpiCard({ label: 'Failed', icon: 'xCircle', value: c.failed, color: 'var(--fail)', soft: 'var(--fail-soft)', colorHex: '#ef4c4c', delta: delta(o.failedRuns, o.failedRunsPrev, { abs: true, vs: 'runs ' + vs }), spark: o.spark.failed, go: 'pipelines', chip: 'failed' }) +
          kpiCard({ label: 'Warning / Delayed', icon: 'clock', value: c.warning + c.delayed, color: 'var(--warn)', soft: 'var(--warn-soft)', colorHex: '#f5a524', delta: '<span class="k-delta">' + c.delayed + ' delayed · ' + c.warning + ' warnings</span>', spark: o.spark.sla, go: 'pipelines', chip: 'warn' }) +
          kpiCard({ label: 'Queued / Blocked', icon: 'hourglass', value: c.queued + c.blocked, color: 'var(--queue)', soft: 'var(--queue-soft)', colorHex: '#8a97ad', delta: '<span class="k-delta">' + (c.blocked ? '<span style="color:#cdb2ff">' + c.blocked + ' blocked by upstream</span>' : c.queued + ' waiting') + '</span>', spark: o.spark.queue, go: 'pipelines', chip: 'queued' }) +
          kpiCard({ label: 'Success Rate', icon: 'percent', value: o.successRate.toFixed(1) + '<small>%</small>', color: o.successRate >= 98 ? 'var(--ok)' : 'var(--warn)', soft: o.successRate >= 98 ? 'var(--ok-soft)' : 'var(--warn-soft)', colorHex: o.successRate >= 98 ? '#22b357' : '#f5a524', delta: delta(o.successRate, o.successRatePrev, { abs: true, unit: 'pts', upIsGood: true, vs: vs }), spark: o.spark.rate, go: 'metrics' }) +
          kpiCard({ label: 'Data Processed (' + o.range + ')', icon: 'database', value: U.fmtGB(o.dataGB).replace(/ (TB|GB|MB)/, '<small>$1</small>'), color: 'var(--s5)', soft: 'rgba(144,133,233,0.15)', colorHex: '#9085e9', delta: delta(o.dataGB, o.dataGBPrev, { upIsGood: true, vs: vs }), sub: U.fmtNum(o.records) + ' records', spark: o.spark.gb, go: 'metrics' }) +
        '</div>' +
        '<div class="grid g-12">' +
          '<div class="card span-7"><div class="card-h">' + ui.icon('zap') + '<h3>Where to investigate first</h3><span class="sub">ranked by severity × downstream impact</span><div class="right"><button class="link-btn" data-go="alerts">All alerts ' + ui.icon('chevR', 'sm') + '</button></div></div><div class="card-b flush" id="ov-prio"></div></div>' +
          '<div class="card span-5"><div class="card-h">' + ui.icon('bell') + '<h3>Active alerts</h3><span class="sub">' + alerts.filter((a) => a.status !== 'resolved').length + ' open / acknowledged</span><div class="right"><button class="link-btn" data-go="alerts">Alert center ' + ui.icon('chevR', 'sm') + '</button></div></div><div class="card-b flush" id="ov-alerts" style="max-height:372px;overflow:auto"></div></div>' +
          '<div class="card span-12"><div class="card-h">' + ui.icon('gantt') + '<h3>Pipeline execution timeline</h3><span class="sub">last 24 hours · now marker · dashed = not started / planned</span><div class="right">' + W.timelineLegend() + '<button class="link-btn" data-go="timeline">Full timeline ' + ui.icon('chevR', 'sm') + '</button></div></div><div class="card-b flush" id="ov-tl" style="max-height:360px;overflow:auto"></div></div>' +
          '<div class="card span-8"><div class="card-h">' + ui.icon('table') + '<h3>Pipeline health</h3><span class="sub">issues first · click a row for details</span><div class="right"><button class="link-btn" data-go="pipelines">All ' + rows.length + ' pipelines ' + ui.icon('chevR', 'sm') + '</button></div></div><div class="card-b flush" id="ov-table"></div></div>' +
          '<div class="span-4" style="display:flex;flex-direction:column;gap:16px">' +
            '<div class="card"><div class="card-h">' + ui.icon('activity') + '<h3>Current status distribution</h3></div><div class="card-b" id="ov-donut"></div></div>' +
            '<div class="card"><div class="card-h">' + ui.icon('gauge') + '<h3>SLA compliance</h3><span class="sub">' + o.range + ' · ' + sla.runsEvaluated + ' runs</span><div class="right"><button class="link-btn" data-go="sla">Details ' + ui.icon('chevR', 'sm') + '</button></div></div><div class="card-b" id="ov-gauge"></div></div>' +
            '<div class="card"><div class="card-h">' + ui.icon('shield') + '<h3>Data quality</h3><div class="right"><button class="link-btn" data-go="quality">Details ' + ui.icon('chevR', 'sm') + '</button></div></div><div class="card-b" id="ov-dq"></div></div>' +
          '</div>' +
          '<div class="card span-6"><div class="card-h">' + ui.icon('bars') + '<h3>Records processed</h3><span class="sub">' + (o.range === '24h' ? 'per hour' : 'per day') + '</span></div><div class="card-b" id="ov-records"></div></div>' +
          '<div class="card span-6"><div class="card-h">' + ui.icon('trend') + '<h3>Run outcomes</h3><span class="sub">' + (o.range === '24h' ? 'per hour' : 'per day') + '</span></div><div class="card-b" id="ov-outcomes"></div></div>' +
        '</div>';

      // priorities
      const pe = U.$('#ov-prio', el);
      pe.innerHTML = o.priorities.length ? '<div class="prio">' + o.priorities.map((p, i) =>
        '<div class="prio-item" data-open="' + p.pipelineId + '"><span class="rank">' + (i + 1) + '</span><div style="min-width:0"><div class="t">' + U.esc(p.name) + ' ' + ui.badge(p.health, p.kind) + (p.impact ? '<span class="impact">' + ui.icon('network', 'sm').replace('class="icon sm"', 'class="icon sm" style="display:inline;vertical-align:-2px"') + ' ' + p.impact + ' downstream</span>' : '') + '</div><div class="r">' + U.esc(p.reason) + '</div></div><div class="meta">' + U.fmtAgo(p.since) + '<div>' + U.esc(p.owner) + '</div></div></div>').join('') + '</div>'
        : '<div class="empty">' + ui.icon('checkCircle', 'lg') + '<div>Nothing needs attention.</div></div>';
      W.alertList(U.$('#ov-alerts', el), alerts.filter((a) => a.status !== 'resolved').sort((a, b) => sevRank(a) - sevRank(b) || b.ts - a.ts).slice(0, 6), { compact: true });
      W.timeline(U.$('#ov-tl', el), tl, { sortBy: 'status' });
      const order = ['failed', 'delayed', 'blocked', 'warning', 'running', 'queued', 'success'];
      W.pipelineTable(U.$('#ov-table', el), rows.slice().sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)), { compact: true, limit: 10 });
      const go = (chip) => () => { OC.store.local('pipelines').chip = chip; OC.app.nav('pipelines'); };
      C.donut(U.$('#ov-donut', el), {
        size: 132, thickness: 15, center: { value: c.total, label: 'pipelines' },
        segments: [
          { label: 'Success', value: c.success, color: '#22b357', onClick: go('success') },
          { label: 'Running', value: c.running, color: '#3b8ef0', onClick: go('running') },
          { label: 'Warning / Delayed', value: c.warning + c.delayed, color: '#f5a524', onClick: go('warn') },
          { label: 'Failed', value: c.failed, color: '#ef4c4c', onClick: go('failed') },
          { label: 'Queued / Blocked', value: c.queued + c.blocked, color: '#8a97ad', onClick: go('queued') }
        ]
      });
      C.gauge(U.$('#ov-gauge', el), { value: sla.compliance, min: 90, max: 100, target: 98, label: 'target 98% · ' + sla.breachedRuns + ' breached runs', width: 230 });
      U.$('#ov-gauge', el).insertAdjacentHTML('beforeend', '<div style="display:flex;justify-content:space-around;margin-top:6px;font-size:12px"><span class="sla-met">' + sla.counts.met + ' within</span><span class="sla-at_risk">' + sla.counts.at_risk + ' at risk</span><span class="sla-breached">' + sla.counts.breached + ' breached</span></div>');
      const t = dq.totals;
      U.$('#ov-dq', el).innerHTML = '<div class="stat-row" style="grid-template-columns:repeat(4,1fr);margin:0"><div class="stat"><div class="l">Checks</div><div class="v num">' + t.total + '</div></div><div class="stat"><div class="l sla-met">' + ui.icon('check', 'sm') + 'Passed</div><div class="v num">' + t.pass + '</div></div><div class="stat"><div class="l sla-at_risk">' + ui.icon('alert', 'sm') + 'Warn</div><div class="v num">' + t.warn + '</div></div><div class="stat"><div class="l sla-breached">' + ui.icon('x', 'sm') + 'Failed</div><div class="v num">' + t.fail + '</div></div></div>' +
        (dq.issues.length ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">' + dq.issues.slice(0, 3).map((i) => '<div style="display:flex;gap:8px;align-items:center;font-size:12px;cursor:pointer" data-open-dq="' + i.pipelineId + '"><span class="dq-cell ' + i.status + '" style="width:20px;height:20px">' + ui.icon(i.status === 'fail' ? 'x' : 'alert') + '</span><b style="font-weight:600">' + U.esc(i.pipelineName) + '</b><span class="dim" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.esc(i.name) + '</span></div>').join('') + '</div>' : '');
      C.bars(U.$('#ov-records', el), { labels: dm.series.map((s) => s.label), series: [{ name: 'Records read', color: '#3987e5', values: dm.series.map((s) => s.records) }], height: 190 });
      C.bars(U.$('#ov-outcomes', el), { labels: dm.series.map((s) => s.label), stacked: true, height: 190, yFmt: (v) => U.fmtInt(v), series: [{ name: 'Success', color: '#22b357', values: dm.series.map((s) => s.success) }, { name: 'Succeeded after retry', color: '#f5a524', values: dm.series.map((s) => s.retried) }, { name: 'Failed', color: '#ef4c4c', values: dm.series.map((s) => s.failed) }] });

      bindCommon(el);
    }
  };
  const sevRank = (a) => ['critical', 'high', 'medium', 'low'].indexOf(a.severity);

  function bindCommon(el) {
    U.$$('[data-open]', el).forEach((b) => b.addEventListener('click', (ev) => { ev.preventDefault(); OC.drawer.open({ pipelineId: b.dataset.open }); }));
    U.$$('[data-open-dq]', el).forEach((b) => b.addEventListener('click', () => OC.drawer.open({ pipelineId: b.dataset.openDq, tab: 'dq' })));
    U.$$('[data-go]', el).forEach((b) => b.addEventListener('click', () => { if (!b.dataset.go) return; if (b.dataset.chip) OC.store.local('pipelines').chip = b.dataset.chip; OC.app.nav(b.dataset.go); }));
  }
  OC.views._bindCommon = bindCommon;

  /* ======================================================================
     PIPELINES
     ====================================================================== */
  const CHIPS = [
    { id: 'all', label: 'All', match: () => true, color: 'var(--accent)' },
    { id: 'failed', label: 'Failed', match: (r) => r.status === 'failed', color: 'var(--fail)' },
    { id: 'warn', label: 'Warning / Delayed', match: (r) => r.status === 'warning' || r.status === 'delayed', color: 'var(--warn)' },
    { id: 'running', label: 'Running', match: (r) => r.status === 'running', color: 'var(--run)' },
    { id: 'queued', label: 'Queued / Blocked', match: (r) => r.status === 'queued' || r.status === 'blocked', color: 'var(--queue)' },
    { id: 'success', label: 'Success', match: (r) => r.status === 'success', color: 'var(--ok)' }
  ];
  OC.views.pipelines = {
    title: 'Pipelines',
    subtitle: 'Every pipeline across platforms with its latest execution. Search, filter, sort and drill in.',
    async render(el, f) {
      const local = OC.store.local('pipelines');
      local.chip = local.chip || 'all';
      const opts = await api.getFilterOptions(f);
      const all = await api.getPipelines(f);
      el.innerHTML = '<div class="card"><div class="toolbar">' +
        '<div class="input-wrap">' + ui.icon('search') + '<input class="input" id="pl-q" placeholder="Search name, id, owner, source, target…" value="' + U.esc(local.q || '') + '"></div>' +
        '<div class="status-chips" id="pl-chips"></div>' +
        '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">' +
          '<select class="sel ' + (f.domain ? 'set' : '') + '" id="pl-domain"><option value="">All domains</option>' + opts.domains.map((d) => '<option ' + (f.domain === d ? 'selected' : '') + '>' + d + '</option>').join('') + '</select>' +
          '<select class="sel" id="pl-env">' + opts.environments.map((e) => '<option value="' + e.id + '" ' + (f.env === e.id ? 'selected' : '') + '>' + e.label + '</option>').join('') + '</select>' +
          '<button class="btn" id="pl-export">' + ui.icon('download', 'sm') + 'Export CSV</button>' +
        '</div></div><div id="pl-table"></div><div class="muted" style="padding:10px 16px;font-size:11.5px" id="pl-foot"></div></div>';
      const draw = () => {
        const q = (local.q || '').toLowerCase();
        const base = all.filter((r) => !q || [r.name, r.id, r.owner, r.source, r.target, r.domain, r.platformName, r.type].join(' ').toLowerCase().indexOf(q) >= 0);
        U.$('#pl-chips', el).innerHTML = CHIPS.map((c) => '<span class="schip ' + (local.chip === c.id ? 'active' : '') + '" data-chip="' + c.id + '"><span class="d" style="background:' + c.color + '"></span>' + c.label + ' <span class="n">' + base.filter(c.match).length + '</span></span>').join('');
        U.$$('.schip', el).forEach((s) => s.addEventListener('click', () => { local.chip = s.dataset.chip; draw(); }));
        const chip = CHIPS.find((c) => c.id === local.chip);
        const rows = base.filter(chip.match);
        local.rows = rows;
        W.pipelineTable(U.$('#pl-table', el), rows, { local, selected: OC.drawer.currentPipeline() });
        U.$('#pl-foot', el).textContent = 'Showing ' + rows.length + ' of ' + all.length + ' pipelines · ' + f.env.toUpperCase() + ' · data refreshed ' + U.fmtTime(Date.now());
      };
      draw();
      U.$('#pl-q', el).addEventListener('input', U.debounce((ev) => { local.q = ev.target.value; draw(); }, 150));
      U.$('#pl-domain', el).addEventListener('change', (ev) => OC.store.setFilters({ domain: ev.target.value }));
      U.$('#pl-env', el).addEventListener('change', (ev) => OC.store.setFilters({ env: ev.target.value }));
      U.$('#pl-export', el).addEventListener('click', () => {
        const rows = local.rows || all;
        const head = ['id', 'name', 'platform', 'domain', 'source', 'target', 'type', 'status', 'start_time', 'duration_sec', 'records', 'last_run', 'sla_status', 'owner'];
        const csv = [head.join(',')].concat(rows.map((r) => [r.id, r.name, r.platformName, r.domain, r.source, r.target, r.type, r.status, r.startTime ? new Date(r.startTime).toISOString() : '', Math.round(r.durationSec || 0), r.recordsProcessed || 0, new Date(r.lastRun).toISOString(), r.slaStatus, r.owner].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(','))).join('\n');
        U.downloadText('pipelines_' + f.env + '.csv', csv);
      });
    }
  };

  /* ======================================================================
     TIMELINE
     ====================================================================== */
  OC.views.timeline = {
    title: 'Execution Timeline',
    subtitle: 'Gantt view of every execution — spot long-running, overlapping, failed, late and not-started pipelines.',
    async render(el, f) {
      const local = OC.store.local('timeline');
      local.hours = local.hours || 24; local.sort = local.sort || 'group';
      const tl = await api.getTimeline(f, local.hours);
      const bars = [].concat.apply([], tl.rows.map((r) => r.bars.map((b) => Object.assign({ pipeline: r.name }, b))));
      const real = bars.filter((b) => !b.planned && !b.notStarted);
      // peak concurrency
      const evts = []; real.forEach((b) => { evts.push([b.start, 1]); evts.push([b.end, -1]); });
      evts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let cur = 0, peak = 0, peakAt = null; evts.forEach((e) => { cur += e[1]; if (cur > peak) { peak = cur; peakAt = e[0]; } });
      const longest = real.filter((b) => !b.running || true).sort((a, b) => b.durationSec - a.durationSec)[0];
      el.innerHTML =
        '<div class="stat-row">' +
          stat('Executions in window', U.fmtInt(real.length), real.filter((b) => b.running).length + ' running now') +
          stat('Failed', '<span style="color:#ff8080">' + real.filter((b) => b.status === 'failed').length + '</span>', 'executions') +
          stat('Over SLA', '<span style="color:#ffc15a">' + real.filter((b) => b.sla).length + '</span>', 'finished or running late') +
          stat('Not started / blocked', bars.filter((b) => b.notStarted).length, 'past scheduled time') +
          stat('Peak concurrency', peak, peakAt ? 'at ' + U.fmtHM(peakAt) : '') +
          stat('Longest run', longest ? U.fmtDur(longest.durationSec) : '—', longest ? U.esc(longest.pipeline) : '') +
        '</div>' +
        '<div class="card"><div class="card-h"><div class="seg" id="tl-hours">' + [6, 12, 24, 48].map((h) => '<button class="' + (local.hours === h ? 'active' : '') + '" data-h="' + h + '">' + h + 'h</button>').join('') + '</div>' +
        '<div class="seg" id="tl-sort"><button data-s="group" class="' + (local.sort === 'group' ? 'active' : '') + '">Group by domain</button><button data-s="status" class="' + (local.sort === 'status' ? 'active' : '') + '">Issues first</button></div>' +
        '<label class="toggle ' + (local.issues ? 'on' : '') + '" id="tl-issues"><span class="sw"></span>Only pipelines with issues</label>' +
        '<div class="right">' + W.timelineLegend() + '</div></div><div class="card-b flush" id="tl-body"></div></div>';
      W.timeline(U.$('#tl-body', el), tl, { group: local.sort === 'group', sortBy: local.sort, onlyIssues: local.issues });
      U.$$('#tl-hours button', el).forEach((b) => b.addEventListener('click', () => { local.hours = +b.dataset.h; OC.app.render(); }));
      U.$$('#tl-sort button', el).forEach((b) => b.addEventListener('click', () => { local.sort = b.dataset.s; OC.app.render(); }));
      U.$('#tl-issues', el).addEventListener('click', () => { local.issues = !local.issues; OC.app.render(); });
    }
  };
  function stat(l, v, s, ic) { return '<div class="stat"><div class="l">' + (ic ? ui.icon(ic, 'sm') : '') + l + '</div><div class="v num">' + v + '</div><div class="s">' + (s || '&nbsp;') + '</div></div>'; }
  OC.views._stat = stat;

  /* ======================================================================
     ALERTS
     ====================================================================== */
  OC.views.alerts = {
    title: 'Failure & Alert Center',
    subtitle: 'Failures, SLA breaches, data-quality issues, missing data, dependency and infrastructure events.',
    async render(el, f) {
      const local = OC.store.local('alerts');
      local.type = local.type || 'all'; local.status = local.status || 'active';
      const all = await api.getAlerts(Object.assign({}, f, { severity: '' }));
      const active = all.filter((a) => a.status !== 'resolved');
      const sevSel = f.severity || local.sev || '';
      const sc = (s) => active.filter((a) => a.severity === s).length;
      el.innerHTML = '<div class="sev-cards">' +
        ['critical', 'high', 'medium', 'low'].map((s) => '<div class="card sev-card ' + (sevSel === s ? 'active' : '') + '" data-sev="' + s + '" style="border-top:3px solid ' + ui.SEV[s].color + '"><div class="l">' + ui.icon(ui.SEV[s].icon, 'sm') + ui.SEV[s].label + '</div><div class="v num">' + sc(s) + '</div><div class="muted" style="font-size:11px">active</div></div>').join('') +
        '<div class="card sev-card ' + (!sevSel ? 'active' : '') + '" data-sev=""><div class="l">' + ui.icon('bell', 'sm') + 'All active</div><div class="v num">' + active.length + '</div><div class="muted" style="font-size:11px">' + all.filter((a) => a.status === 'open').length + ' unacknowledged</div></div>' +
        '</div>' +
        '<div class="card"><div class="tabs" id="al-tabs"></div><div class="toolbar" style="border-bottom:0;padding-bottom:4px"><div class="seg" id="al-status">' + [['active', 'Active'], ['open', 'Open'], ['acknowledged', 'Acknowledged'], ['resolved', 'Resolved'], ['all', 'All']].map((x) => '<button data-s="' + x[0] + '" class="' + (local.status === x[0] ? 'active' : '') + '">' + x[1] + '</button>').join('') + '</div><span class="muted" id="al-count" style="margin-left:auto;font-size:12px"></span></div><div id="al-list"></div></div>';
      const types = ['all'].concat(Object.keys(ui.ALERT_TYPES));
      const base = all.filter((a) => !sevSel || a.severity === sevSel).filter((a) => local.status === 'all' ? true : local.status === 'active' ? a.status !== 'resolved' : a.status === local.status);
      U.$('#al-tabs', el).innerHTML = types.filter((t) => t === 'all' || all.some((a) => a.type === t)).map((t) => '<button class="tab ' + (local.type === t ? 'active' : '') + '" data-t="' + t + '">' + (t === 'all' ? 'All' : ui.ALERT_TYPES[t]) + ' <span class="c">' + base.filter((a) => t === 'all' || a.type === t).length + '</span></button>').join('');
      const list = base.filter((a) => local.type === 'all' || a.type === local.type).sort((a, b) => sevRank(a) - sevRank(b) || b.ts - a.ts);
      U.$('#al-count', el).textContent = list.length + ' alerts · sorted by severity, then most recent';
      W.alertList(U.$('#al-list', el), list, {});
      U.$$('[data-sev]', el).forEach((c) => c.addEventListener('click', () => { local.sev = c.dataset.sev; if (f.severity) OC.store.setFilters({ severity: '' }); else OC.app.render(); }));
      U.$$('#al-tabs .tab', el).forEach((b) => b.addEventListener('click', () => { local.type = b.dataset.t; OC.app.render(); }));
      U.$$('#al-status button', el).forEach((b) => b.addEventListener('click', () => { local.status = b.dataset.s; OC.app.render(); }));
    }
  };
})(window.OpsCenter);
