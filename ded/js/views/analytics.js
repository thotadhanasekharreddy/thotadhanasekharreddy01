/* ==========================================================================
   Analytics views — Data Metrics, Operations, SLA, Data Quality, Dependencies
   ========================================================================== */
(function (OC) {
  'use strict';
  const U = OC.utils, ui = OC.ui, W = OC.widgets, C = OC.charts, api = OC.api;
  const stat = (l, v, s, ic) => OC.views._stat(l, v, s, ic);
  const card = (id, icon, title, sub, span, right) => '<div class="card ' + span + '"><div class="card-h">' + ui.icon(icon) + '<h3>' + title + '</h3>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + (right ? '<div class="right">' + right + '</div>' : '') + '</div><div class="card-b" id="' + id + '"></div></div>';
  const per = (r) => r === '24h' ? 'per hour' : 'per day';
  const S = { s1: '#3987e5', s2: '#d95926', s3: '#199e70', s4: '#c98500', s5: '#9085e9', ok: '#22b357', fail: '#ef4c4c', warn: '#f5a524', run: '#3b8ef0', queue: '#8a97ad' };

  /* ======================================================================
     DATA PROCESSING METRICS
     ====================================================================== */
  OC.views.metrics = {
    title: 'Data Processing Metrics',
    subtitle: 'Records, data volume, processing time, throughput and run outcomes over time.',
    async render(el, f) {
      const local = OC.store.local('metrics'); local.dur = local.dur || 7;
      const d = await api.getDataMetrics(f);
      const t = d.totals, s = d.series, labels = s.map((x) => x.label);
      el.innerHTML = '<div class="stat-row">' +
        stat('Records processed', U.fmtNum(t.records, 2), U.fmtInt(t.runs) + ' runs · ' + f.range, 'bars') +
        stat('Input volume', U.fmtGB(t.gbIn), 'read from sources', 'download') +
        stat('Output volume', U.fmtGB(t.gbOut), Math.round(100 * t.gbOut / (t.gbIn || 1)) + '% of input after compaction', 'hdd') +
        stat('Throughput', U.fmtNum(t.recPerMin) + '<small class="muted" style="font-size:12px"> rec/min</small>', 'average across window', 'zap') +
        stat('Throughput (volume)', t.gbPerHour.toFixed(1) + '<small class="muted" style="font-size:12px"> GB/hour</small>', 'average across window', 'activity') +
        '</div><div class="grid g-12">' +
        card('m-rec', 'bars', 'Records processed', per(f.range), 'span-6') +
        card('m-vol', 'database', 'Data volume — input vs output', per(f.range) + ' · GB', 'span-6') +
        card('m-dur', 'clock', 'Average pipeline duration', 'batch pipelines · minutes', 'span-6', '<div class="seg" id="m-durseg"><button data-d="7" class="' + (local.dur === 7 ? 'active' : '') + '">7 days</button><button data-d="30" class="' + (local.dur === 30 ? 'active' : '') + '">30 days</button></div>') +
        card('m-succ', 'trend', 'Pipeline success trend', 'successful · retried · failed runs ' + per(f.range), 'span-6') +
        card('m-tp', 'zap', 'Throughput — records / minute', per(f.range), 'span-6') +
        card('m-gbh', 'activity', 'Throughput — GB / hour', per(f.range), 'span-6') +
        card('m-top', 'layers', 'Top pipelines by data volume', f.range + ' · click to drill in', 'span-12') +
        '</div>';
      C.bars(U.$('#m-rec', el), { labels, series: [{ name: 'Records read', color: S.s1, values: s.map((x) => x.records) }, { name: 'Records written', color: S.s3, values: s.map((x) => x.written) }], height: 220 });
      C.line(U.$('#m-vol', el), { labels, series: [{ name: 'Input GB', color: S.s1, values: s.map((x) => x.gbIn), area: true }, { name: 'Output GB', color: S.s2, values: s.map((x) => x.gbOut) }], height: 220, yFmt: (v) => U.fmtNum(v), tipFmt: (v) => U.fmtGB(v) });
      const dd = local.dur === 7 ? d.duration7 : d.duration30;
      C.line(U.$('#m-dur', el), { labels: dd.labels, series: [{ name: 'Avg duration', color: S.s5, values: dd.values, area: true }], height: 220, yFmt: (v) => Math.round(v) + 'm', tipFmt: (v) => U.fmtMin(v) });
      C.bars(U.$('#m-succ', el), { labels, stacked: true, height: 220, yFmt: (v) => U.fmtInt(v), series: [{ name: 'Successful', color: S.ok, values: s.map((x) => x.success) }, { name: 'Succeeded after retry', color: S.warn, values: s.map((x) => x.retried) }, { name: 'Failed', color: S.fail, values: s.map((x) => x.failed) }] });
      C.line(U.$('#m-tp', el), { labels, series: [{ name: 'Records / min', color: S.s1, values: s.map((x) => x.recPerMin), area: true }], height: 200 });
      C.line(U.$('#m-gbh', el), { labels, series: [{ name: 'GB / hour', color: S.s3, values: s.map((x) => x.gbPerHour), area: true }], height: 200, yFmt: (v) => v.toFixed(v < 10 ? 1 : 0), tipFmt: (v) => v.toFixed(2) + ' GB/h' });
      W.hbars(U.$('#m-top', el), d.topVolume.map((p) => ({ id: p.id, label: p.name, value: p.gb, color: S.s1, tip: '<div class="tt-h">' + U.esc(p.name) + '</div>' + ui.ttRow('', 'Volume', U.fmtGB(p.gb)) + ui.ttRow('', 'Records', U.fmtInt(p.records)) })), { fmt: (v) => U.fmtGB(v) });
      U.$$('#m-durseg button', el).forEach((b) => b.addEventListener('click', () => { local.dur = +b.dataset.d; OC.app.render(); }));
    }
  };

  /* ======================================================================
     OPERATIONAL METRICS
     ====================================================================== */
  OC.views.operations = {
    title: 'Operational Metrics',
    subtitle: 'Execution counts, durations, retries, failure rate, queue time, compute, freshness and dependency waits.',
    async render(el, f) {
      const d = await api.getOpsMetrics(f);
      const t = d.tiles, s = d.series, labels = s.map((x) => x.label);
      el.innerHTML = '<div class="stat-row">' +
        stat('Executions', U.fmtInt(t.runs), f.range, 'play') +
        stat('Avg duration', U.fmtMin(t.avgDurMin), 'batch pipelines', 'clock') +
        stat('Max duration', U.fmtMin(t.maxDurMin), 'longest single run', 'hourglass') +
        stat('Retries', U.fmtInt(t.retries), 'retry attempts', 'retry') +
        stat('Failure rate', U.fmtPct(t.failureRate, 2), 'of completed runs', 'xCircle') +
        stat('Avg queue time', U.fmtDur(t.queueSec), 'schedule → start', 'queued') +
        stat('Throughput', U.fmtNum(t.throughput), 'records / min', 'zap') +
        stat('Compute utilisation', U.fmtPct(t.computeUtil, 0), U.fmtNum(t.computeHours) + ' compute-hours', 'cpu') +
        stat('Stale datasets', '<span style="color:' + (t.staleCount ? '#ffc15a' : 'inherit') + '">' + t.staleCount + '</span>', 'freshness beyond expectation', 'database') +
        stat('Dependency wait', U.fmtMin(t.depWaitMin), 'avg upstream wait', 'network') +
        '</div><div class="grid g-12">' +
        card('o-count', 'bars', 'Pipeline execution count', per(f.range), 'span-6') +
        card('o-fail', 'percent', 'Failure rate', per(f.range) + ' · %', 'span-6') +
        card('o-dur', 'clock', 'Average vs maximum duration', 'bar = avg · tick = max · batch pipelines', 'span-6') +
        card('o-util', 'cpu', 'Compute utilisation', 'last 24h · % of provisioned capacity', 'span-6') +
        card('o-queue', 'queued', 'Average queue time', per(f.range) + ' · seconds from schedule to start', 'span-6') +
        card('o-plat', 'server', 'Failure rate by platform', f.range, 'span-6') +
        card('o-fresh', 'database', 'Data freshness', 'time since last successful load · tick = expected', 'span-6') +
        card('o-dep', 'network', 'Dependency wait time', 'avg minutes waiting on upstream', 'span-6') +
        '</div>';
      C.bars(U.$('#o-count', el), { labels, series: [{ name: 'Executions', color: S.s1, values: s.map((x) => x.count) }], height: 200, yFmt: (v) => U.fmtInt(v) });
      C.line(U.$('#o-fail', el), { labels, series: [{ name: 'Failure rate', color: S.fail, values: s.map((x) => x.failRate), area: true }], height: 200, yFmt: (v) => v.toFixed(0) + '%', tipFmt: (v) => v.toFixed(2) + '%', ref: { value: 2, label: 'threshold 2%' } });
      const dur = d.perPipeline.filter((p) => !p.streaming && p.avgMin).sort((a, b) => b.maxMin - a.maxMin).slice(0, 10);
      W.hbars(U.$('#o-dur', el), dur.map((p) => ({ id: p.id, label: p.name, value: p.avgMin, marker: p.maxMin, color: S.s5, tip: '<div class="tt-h">' + U.esc(p.name) + '</div>' + ui.ttRow(S.s5, 'Average', U.fmtMin(p.avgMin)) + ui.ttRow('', 'Maximum', U.fmtMin(p.maxMin)) + ui.ttRow('', 'Runs', p.runs) })), { fmt: (v, it) => U.fmtMin(v) });
      C.line(U.$('#o-util', el), { labels: d.util.map((u) => u.label), series: [{ name: 'Utilisation', color: S.s3, values: d.util.map((u) => u.value), area: true }], height: 200, yMax: 100, yFmt: (v) => v + '%', tipFmt: (v) => v.toFixed(0) + '%', ref: { value: 85, label: 'saturation 85%' } });
      C.bars(U.$('#o-queue', el), { labels, series: [{ name: 'Avg queue time', color: S.s1, values: s.map((x) => x.queue) }], height: 200, yFmt: (v) => U.fmtInt(v) + 's', tipFmt: (v) => U.fmtDur(v) });
      W.hbars(U.$('#o-plat', el), d.failureByPlatform.map((p) => ({ label: p.label + ' (' + p.runs + ' runs)', value: p.rate, color: p.rate > 2 ? S.fail : S.s1 })), { fmt: (v) => v.toFixed(2) + '%' });
      const fr = d.perPipeline.filter((p) => p.freshnessMin != null).sort((a, b) => (b.freshnessMin / b.expectedFreshMin) - (a.freshnessMin / a.expectedFreshMin)).slice(0, 12);
      W.hbars(U.$('#o-fresh', el), fr.map((p) => ({ id: p.id, label: p.name, value: p.freshnessMin / 60, marker: p.expectedFreshMin / 60, color: p.stale ? S.warn : S.s3, tip: '<div class="tt-h">' + U.esc(p.name) + '</div>' + ui.ttRow('', 'Last success', U.fmtMin(p.freshnessMin) + ' ago') + ui.ttRow('', 'Expected within', U.fmtMin(p.expectedFreshMin)) + (p.stale ? ui.ttRow(S.warn, 'Status', 'Stale') : '') })), { fmt: (v) => v < 1 ? Math.round(v * 60) + 'm' : v.toFixed(1) + 'h' });
      const dw = d.perPipeline.filter((p) => p.depWaitMin > 0).sort((a, b) => b.depWaitMin - a.depWaitMin);
      W.hbars(U.$('#o-dep', el), dw.map((p) => ({ id: p.id, label: p.name, value: p.depWaitMin, color: S.s4 })), { fmt: (v) => v.toFixed(1) + 'm' });
    }
  };

  /* ======================================================================
     SLA MONITORING
     ====================================================================== */
  OC.views.sla = {
    title: 'SLA Monitoring',
    subtitle: 'Pipelines within SLA, approaching breach and breached — plus compliance trend.',
    async render(el, f) {
      const d = await api.getSla(f);
      el.innerHTML = '<div class="grid g-12">' +
        '<div class="card span-4"><div class="card-h">' + ui.icon('gauge') + '<h3>SLA compliance</h3><span class="sub">' + f.range + ' · ' + d.runsEvaluated + ' runs evaluated</span></div><div class="card-b" id="s-gauge"></div></div>' +
        '<div class="card span-3"><div class="card-h">' + ui.icon('activity') + '<h3>Current pipelines</h3></div><div class="card-b" id="s-donut"></div></div>' +
        card('s-trend', 'trend', 'Daily SLA compliance', 'last 30 days · %', 'span-5') +
        '<div class="card span-12"><div class="card-h">' + ui.icon('table') + '<h3>SLA detail</h3><span class="sub">breaches first · latest execution per pipeline</span></div><div class="card-b flush" id="s-table"></div></div></div>';
      C.gauge(U.$('#s-gauge', el), { value: d.compliance, min: 90, max: 100, target: 98, label: 'target 98% · ' + d.breachedRuns + ' of ' + d.runsEvaluated + ' runs breached', width: 260 });
      C.donut(U.$('#s-donut', el), { size: 120, thickness: 14, center: { value: d.counts.breached, label: 'breached' }, segments: [{ label: 'Within SLA', value: d.counts.met, color: S.ok }, { label: 'Approaching', value: d.counts.at_risk, color: S.warn }, { label: 'Breached', value: d.counts.breached, color: S.fail }, { label: 'Not yet run', value: d.counts.pending, color: S.queue }] });
      C.line(U.$('#s-trend', el), { labels: d.trend.labels, series: [{ name: 'Compliance', color: S.ok, values: d.trend.values, area: true }], height: 190, yMin: 80, yMax: 100, yFmt: (v) => v.toFixed(0) + '%', tipFmt: (v) => v.toFixed(1) + '%', ref: { value: 98, label: 'target 98%' } });
      U.$('#s-table', el).innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pipeline</th><th>Domain</th><th>Owner</th><th>SLA</th><th>Actual</th><th class="td-r">Variance</th><th style="width:220px">SLA consumed</th><th>Status</th></tr></thead><tbody>' +
        d.rows.map((r) => {
          const col = r.status === 'breached' ? 'var(--fail)' : r.status === 'at_risk' ? 'var(--warn)' : r.status === 'met' ? 'var(--ok)' : 'var(--queue)';
          return '<tr class="clickable ' + (r.status === 'breached' ? 'row-failed' : r.status === 'at_risk' ? 'row-warning' : '') + '" data-id="' + r.id + '"><td class="pname">' + U.esc(r.name) + '</td><td>' + U.esc(r.domain) + '</td><td class="dim">' + U.esc(r.owner) + '</td><td class="num">' + U.fmtMin(r.slaMin) + '</td>' +
            '<td class="num">' + (r.actualSec == null ? '<span class="muted">' + (r.execStatus === 'blocked' ? 'blocked' : 'not started') + '</span>' : U.fmtDur(r.actualSec) + (r.running ? ' <span class="muted">(running)</span>' : r.notStarted ? ' <span class="muted">(waiting)</span>' : '')) + '</td>' +
            '<td class="td-r num" style="color:' + (r.varianceSec > 0 ? '#ff7b7b' : 'var(--text-2)') + '">' + (r.varianceSec == null ? '—' : (r.varianceSec > 0 ? '+' : '−') + U.fmtDur(Math.abs(r.varianceSec))) + '</td>' +
            '<td><div class="durbar"><span class="bar" style="width:150px"><i style="width:' + Math.min(100, r.pct || 0) + '%;background:' + col + '"></i></span><span class="num dim">' + (r.pct == null ? '—' : Math.round(r.pct) + '%') + '</span></div></td>' +
            '<td>' + ui.slaTag(r.status) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      U.$$('#s-table tr[data-id]', el).forEach((tr) => tr.addEventListener('click', () => OC.drawer.open({ pipelineId: tr.dataset.id })));
    }
  };

  /* ======================================================================
     DATA QUALITY
     ====================================================================== */
  OC.views.quality = {
    title: 'Data Quality Monitoring',
    subtitle: 'Null, duplicate, referential-integrity, schema, row-count and freshness checks across all pipelines.',
    async render(el, f) {
      const d = await api.getDataQuality(f);
      const t = d.totals;
      el.innerHTML = '<div class="stat-row">' +
        stat('Total quality checks', t.total, d.matrix.length + ' pipelines', 'shield') +
        stat('<span class="sla-met">Passed</span>', t.pass, U.fmtPct(100 * t.pass / (t.total || 1)) + ' pass rate', 'checkCircle') +
        stat('<span class="sla-at_risk">Warning</span>', t.warn, 'above warning threshold', 'alert') +
        stat('<span class="sla-breached">Failed</span>', t.fail, 'blocking / critical', 'xCircle') +
        '</div><div class="grid g-12">' +
        '<div class="card span-8"><div class="card-h">' + ui.icon('table') + '<h3>Quality scorecard</h3><span class="sub">pipeline × check type · click a cell to drill in</span></div><div class="card-b flush" id="q-matrix"></div></div>' +
        '<div class="span-4" style="display:flex;flex-direction:column;gap:16px">' +
          card('q-type', 'bars', 'Results by check type', 'pass · warn · fail', '') +
          card('q-trend', 'trend', 'Check results trend', 'last 14 days', '') +
        '</div>' +
        '<div class="card span-12"><div class="card-h">' + ui.icon('alert') + '<h3>Open quality issues</h3><span class="sub">' + d.issues.length + ' checks not passing</span></div><div class="card-b flush" id="q-issues"></div></div></div>';
      const iconFor = (s) => s === 'pass' ? 'check' : s === 'warn' ? 'alert' : 'x';
      U.$('#q-matrix', el).innerHTML = '<div class="tbl-wrap"><table class="tbl dq-matrix"><thead><tr><th>Pipeline</th>' + d.types.map((x) => '<th>' + x.name.replace(' validation', '').replace(' check', '').replace('Referential integrity', 'Ref. integrity').replace('Data freshness', 'Freshness') + '</th>').join('') + '<th class="td-r">Score</th></tr></thead><tbody>' +
        d.matrix.map((r) => {
          const cells = r.cells.filter(Boolean);
          const score = Math.round(100 * cells.filter((c) => c.status === 'pass').length / (cells.length || 1));
          return '<tr><td><span class="pname" style="cursor:pointer" data-open="' + r.id + '">' + U.esc(r.name) + '</span><div class="pid">' + r.domain + '</div></td>' + r.cells.map((c) => c ? '<td><span class="dq-cell ' + c.status + '" data-open="' + r.id + '" data-tip="' + U.esc('<div class="tt-h">' + c.name + '</div>' + ui.ttRow('', 'Observed', U.esc(c.observed)) + ui.ttRow('', 'Expected', U.esc(c.expected))) + '">' + ui.icon(iconFor(c.status)) + '</span></td>' : '<td><span class="dq-cell na">–</span></td>').join('') +
            '<td class="td-r num" style="color:' + (score === 100 ? '#5fd88a' : score >= 80 ? '#ffc15a' : '#ff7b7b') + ';font-weight:650">' + score + '%</td></tr>';
        }).join('') + '</tbody></table></div>';
      U.$$('#q-matrix [data-open]', el).forEach((c) => c.addEventListener('click', () => OC.drawer.open({ pipelineId: c.dataset.open, tab: 'dq' })));
      C.bars(U.$('#q-type', el), { labels: d.byType.map((x) => x.name.replace(' validation', '').replace(' check', '').replace('Referential integrity', 'Ref. integrity').replace('Data freshness', 'Freshness')), stacked: true, height: 190, yFmt: (v) => U.fmtInt(v), series: [{ name: 'Passed', color: S.ok, values: d.byType.map((x) => x.pass) }, { name: 'Warning', color: S.warn, values: d.byType.map((x) => x.warn) }, { name: 'Failed', color: S.fail, values: d.byType.map((x) => x.fail) }] });
      C.bars(U.$('#q-trend', el), { labels: d.trend.map((x) => x.label), stacked: true, height: 170, yFmt: (v) => U.fmtInt(v), series: [{ name: 'Warning', color: S.warn, values: d.trend.map((x) => x.warn) }, { name: 'Failed', color: S.fail, values: d.trend.map((x) => x.fail) }] });
      U.$('#q-issues', el).innerHTML = d.issues.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Status</th><th>Pipeline</th><th>Check</th><th>Target</th><th>Observed</th><th>Expected</th><th>Owner</th><th>Last evaluated</th></tr></thead><tbody>' +
        d.issues.map((i) => '<tr class="clickable row-' + (i.status === 'fail' ? 'failed' : 'warning') + '" data-id="' + i.pipelineId + '"><td><span class="badge b-' + (i.status === 'fail' ? 'failed' : 'warning') + '">' + ui.icon(iconFor(i.status)) + (i.status === 'fail' ? 'Failed' : 'Warning') + '</span></td><td class="pname">' + U.esc(i.pipelineName) + '</td><td>' + U.esc(i.name) + '</td><td class="dim">' + U.esc(i.target) + '</td><td>' + U.esc(i.observed) + '</td><td class="dim">' + U.esc(i.expected) + '</td><td class="dim">' + U.esc(i.owner) + '</td><td class="dim">' + U.fmtAgo(i.lastRun) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">All checks passing.</div>';
      U.$$('#q-issues tr[data-id]', el).forEach((tr) => tr.addEventListener('click', () => OC.drawer.open({ pipelineId: tr.dataset.id, tab: 'dq' })));
    }
  };

  /* ======================================================================
     DEPENDENCIES
     ====================================================================== */
  OC.views.dependencies = {
    title: 'Dependency Monitoring',
    subtitle: 'Upstream → downstream lineage. Failures propagate: blocked and at-risk downstream pipelines are highlighted.',
    async render(el, f) {
      const d = await api.getDependencies(f);
      const failedRoots = d.nodes.filter((n) => !n.consumer && (n.status === 'failed' || n.status === 'delayed'));
      el.innerHTML = '<div class="grid g-12">' +
        '<div class="card span-12"><div class="card-h">' + ui.icon('network') + '<h3>Pipeline dependency graph</h3><span class="sub">hover a node to trace lineage · click to open</span><div class="right"><div class="legend"><span class="lg"><span class="sw" style="background:var(--fail)"></span>Failed</span><span class="lg"><span class="sw" style="background:var(--warn)"></span>Delayed</span><span class="lg"><span class="sw" style="border:1px dashed var(--blocked)"></span>Blocked</span><span class="lg"><span class="sw" style="height:2px;background:var(--fail)"></span>Broken dependency</span></div></div></div><div class="card-b" id="d-graph"></div></div>' +
        '<div class="card span-12"><div class="card-h">' + ui.icon('alert') + '<h3>Impact analysis</h3><span class="sub">failed / delayed pipelines and what they block downstream</span></div><div class="card-b" id="d-impact" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:4px 28px"></div></div></div>';
      // layout
      const layers = U.groupBy(d.nodes, (n) => n.layer);
      const nodeH = 44, rowGap = 12, padT = 24;
      const nLayers = U.uniq(d.nodes.map((n) => n.layer)).length;
      const avail = Math.max(900, (U.$('#d-graph', el).clientWidth || 1200) - 8);
      const colGap = 44, nodeW = Math.min(200, Math.floor((avail - (nLayers - 1) * colGap) / nLayers));
      const pos = {};
      const keys = Object.keys(layers).map(Number).sort((a, b) => a - b);
      const sortKey = (n) => (n.domain || 'zz') + n.name;
      keys.forEach((L) => {
        layers[L].sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1);
        layers[L].forEach((n, i) => { pos[n.id] = { x: L * (nodeW + colGap), y: padT + i * (nodeH + rowGap) }; });
      });
      // relax: centre each non-root node on its parents
      for (let it = 0; it < 2; it++) keys.slice(1).forEach((L) => {
        const items = layers[L].map((n) => { const par = d.edges.filter((e) => e.to === n.id).map((e) => pos[e.from]).filter(Boolean); return { n, want: par.length ? U.avg(par, (p) => p.y) : pos[n.id].y }; }).sort((a, b) => a.want - b.want);
        let y = padT;
        items.forEach((it2) => { const ny = Math.max(y, it2.want); pos[it2.n.id].y = ny; y = ny + nodeH + rowGap; });
      });
      const width = keys.length * (nodeW + colGap) - colGap + 4;
      const height = Math.max.apply(null, Object.keys(pos).map((k) => pos[k].y)) + nodeH + 10;
      const LBL = ['Sources / ingest', 'Transform', 'Curated / master', 'Integrated', 'Serving', 'Consumers', 'Consumers'];
      let html = '<div class="dep-canvas" style="height:' + Math.min(height + 10, 720) + 'px"><div style="position:relative;width:' + width + 'px;height:' + height + 'px">';
      keys.forEach((L) => { html += '<div class="layer-label" style="left:' + (L * (nodeW + colGap)) + 'px">' + (L === keys[keys.length - 1] ? 'Consumers' : LBL[L] || 'Layer ' + L) + '</div>'; });
      html += '<svg class="dep-svg" width="' + width + '" height="' + height + '">' + d.edges.map((e) => {
        const a = pos[e.from], b = pos[e.to]; if (!a || !b) return '';
        const x1 = a.x + nodeW, y1 = a.y + nodeH / 2, x2 = b.x, y2 = b.y + nodeH / 2, mx = (x1 + x2) / 2;
        return '<path data-from="' + e.from + '" data-to="' + e.to + '" class="' + (e.broken ? 'broken' : '') + '" d="M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2 + '"/>';
      }).join('') + '</svg>';
      d.nodes.forEach((n) => {
        const p = pos[n.id];
        if (n.consumer) {
          html += '<div class="dep-node consumer ' + (n.atRisk ? 'at-risk' : '') + '" data-id="' + n.id + '" style="left:' + p.x + 'px;top:' + p.y + 'px;width:' + nodeW + 'px"><div class="dn-t">' + ui.icon(n.atRisk ? 'alert' : 'bars', 'sm') + U.esc(n.name) + '</div><div class="dn-s"><span>' + (n.atRisk ? '<span style="color:#ff8080">stale data risk</span>' : 'up to date') + '</span><span>consumer</span></div></div>';
        } else {
          html += '<div class="dep-node st-' + n.status + (n.impacted ? ' impacted' : '') + (n.dim ? ' faded' : '') + '" data-id="' + n.id + '" style="left:' + p.x + 'px;top:' + p.y + 'px;width:' + nodeW + 'px" data-tip="' + U.esc('<div class="tt-h">' + n.name + '</div>' + ui.ttRow((ui.STATUS[n.status] || ui.STATUS.pending).color, 'Status', ui.STATUS[n.status].label) + ui.ttRow('', 'Domain', n.domain) + ui.ttRow('', 'Downstream', n.downstream + ' pipelines') + (n.atRisk ? ui.ttRow('var(--blocked)', 'Impact', 'Upstream issue') : '')) + '"><div class="dn-t">' + ui.dot(n.status) + U.esc(n.name) + '</div><div class="dn-s"><span>' + ui.STATUS[n.status].label + (n.atRisk && n.status !== 'blocked' ? ' · at risk' : '') + '</span><span class="chip" style="font-size:9.5px;padding:0 4px">' + n.platform + '</span></div></div>';
        }
      });
      html += '</div></div>';
      U.$('#d-graph', el).innerHTML = html;
      const g = U.$('#d-graph', el);
      const lineage = (id) => {
        const set = new Set([id]);
        const up = (x) => d.edges.filter((e) => e.to === x).forEach((e) => { if (!set.has(e.from)) { set.add(e.from); up(e.from); } });
        const down = (x) => d.edges.filter((e) => e.from === x).forEach((e) => { if (!set.has(e.to)) { set.add(e.to); down(e.to); } });
        up(id); down(id); return set;
      };
      U.$$('.dep-node', g).forEach((nd) => {
        nd.addEventListener('mouseenter', () => {
          const set = lineage(nd.dataset.id);
          U.$$('.dep-node', g).forEach((x) => { x.classList.toggle('faded', !set.has(x.dataset.id)); x.classList.toggle('hl', x.dataset.id === nd.dataset.id); });
          U.$$('path', g).forEach((p) => { const on = set.has(p.dataset.from) && set.has(p.dataset.to); p.classList.toggle('faded', !on); p.classList.toggle('hl', on && !p.classList.contains('broken')); });
        });
        nd.addEventListener('mouseleave', () => { U.$$('.dep-node', g).forEach((x) => { x.classList.remove('hl'); x.classList.toggle('faded', !!(d.nodes.find((n) => n.id === x.dataset.id) || {}).dim); }); U.$$('path', g).forEach((p) => p.classList.remove('faded', 'hl')); });
        if (!nd.classList.contains('consumer')) nd.addEventListener('click', () => OC.drawer.open({ pipelineId: nd.dataset.id, tab: 'overview' }));
      });
      // impact panel
      const byId = {}; d.nodes.forEach((n) => { byId[n.id] = n; });
      U.$('#d-impact', el).innerHTML = failedRoots.length ? failedRoots.map((r) => {
        const imp = (d.impactOf[r.id] || []).map((id) => byId[id]);
        return '<div style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:8px;cursor:pointer" data-open="' + r.id + '">' + ui.badge(r.status) + '<b>' + U.esc(r.name) + '</b></div>' +
          (imp.length ? '<div class="muted" style="font-size:11.5px;margin:6px 0 4px">Blocks / puts at risk ' + imp.length + ' downstream:</div>' + imp.map((n) => '<div style="display:flex;align-items:center;gap:8px;padding:3px 0 3px 10px;border-left:2px solid var(--blocked);margin-left:6px;cursor:pointer;font-size:12px" data-open="' + n.id + '">' + ui.dot(n.status) + U.esc(n.name) + '<span class="muted" style="margin-left:auto">' + ui.STATUS[n.status].label + '</span></div>').join('') : '<div class="muted" style="font-size:11.5px;margin-top:6px">No downstream pipelines affected.</div>') + '</div>';
      }).join('') + (d.nodes.some((n) => n.consumer && n.atRisk) ? '<div class="callout info" style="margin-top:8px;grid-column:1/-1">' + ui.icon('zap', 'sm') + '<div>Consumers at risk: ' + d.nodes.filter((n) => n.consumer && n.atRisk).map((n) => '<b>' + U.esc(n.name) + '</b>').join(', ') + '</div></div>' : '')
        : '<div class="empty">' + ui.icon('checkCircle', 'lg') + '<div>No upstream failures — all dependencies healthy.</div></div>';
      OC.views._bindCommon(U.$('#d-impact', el));
    }
  };
})(window.OpsCenter);
