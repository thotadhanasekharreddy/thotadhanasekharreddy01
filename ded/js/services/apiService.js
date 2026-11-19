/* ==========================================================================
   SERVICE LAYER  —  the ONLY thing the UI talks to.
   --------------------------------------------------------------------------
   OpsCenter.api exposes async methods that return plain JSON. Today they are
   backed by MockAdapter (in-browser aggregation over js/data/mockData.js).
   Switch OpsCenter.config.dataSource to 'rest' and implement the endpoints
   listed in RestAdapter / README to plug in a real monitoring backend.
   ========================================================================== */
(function (OC) {
  'use strict';
  const U = OC.utils, M = OC.MockData;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  OC.config = Object.assign({
    dataSource: 'mock',            // 'mock' | 'rest'
    apiBaseUrl: '/api/v1',         // used by RestAdapter
    mockLatencyMs: 90,             // simulate network latency
    autoRefreshSec: 30
  }, OC.config || {});

  const RANGE_MS = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY };
  const delay = (v) => new Promise((res) => setTimeout(() => res(v), OC.config.mockLatencyMs));

  /* ======================================================================
     Mock adapter — performs the aggregation a backend would do.
     ====================================================================== */
  function MockAdapter() { this.dbs = {}; }
  MockAdapter.prototype.db = function (env) {
    const now = Date.now();
    if (!this.dbs[env]) this.dbs[env] = M.build(env, now);
    M.advance(this.dbs[env], now);
    return this.dbs[env];
  };

  /* ---- helpers ---- */
  function pipelineHealth(db, p, now) {
    const e = M.liveExecution(db.byPipeline[p.id][0], p, now);
    const dq = db.dq[p.id] || [];
    const dqFail = dq.some((c) => c.status === 'fail');
    const dqWarn = dq.some((c) => c.status === 'warn');
    let health = e.status;
    if (e.status === 'running' && e.slaBreached) health = 'delayed';
    if (e.status === 'success' && (e.slaBreached || dqFail || dqWarn)) health = 'warning';
    const lastSuccess = db.byPipeline[p.id].find((x) => x.status === 'success' && x.end);
    const reasons = [];
    if (e.status === 'failed') reasons.push(e.error);
    if (health === 'delayed' && e.status === 'running') reasons.push('Running ' + U.fmtDur(e.durationSec) + ' vs SLA ' + U.fmtMin(p.sla.maxDurationMin));
    if (e.status === 'delayed') reasons.push(e.reason);
    if (e.status === 'blocked') reasons.push('Blocked by upstream: ' + nameOf(db, e.blockedBy));
    if (e.status === 'queued') reasons.push('Waiting on ' + (findP(db, e.waitingOn) ? nameOf(db, e.waitingOn) : e.waitingOn));
    if (e.status === 'success' && e.slaBreached) reasons.push('Finished ' + U.fmtDur(e.durationSec - p.sla.maxDurationMin * 60) + ' over SLA');
    dq.filter((c) => c.status !== 'pass').forEach((c) => reasons.push('DQ ' + c.status + ': ' + c.name + ' — ' + c.observed));
    return {
      health, latest: e, lastSuccess: lastSuccess ? lastSuccess.end : null, reasons,
      dqSummary: { total: dq.length, pass: dq.filter((c) => c.status === 'pass').length, warn: dq.filter((c) => c.status === 'warn').length, fail: dq.filter((c) => c.status === 'fail').length },
      slaStatus: slaStatusOf(p, e)
    };
  }
  function slaStatusOf(p, e) {
    const sla = p.sla.maxDurationMin * 60;
    if (!e.start) return e.status === 'delayed' ? 'at_risk' : e.status === 'blocked' ? 'at_risk' : 'pending';
    const r = e.durationSec / sla;
    if (r > 1) return 'breached';
    if (r >= 0.8) return 'at_risk';
    return 'met';
  }
  const findP = (db, id) => db.pipelines.find((x) => x.id === id);
  const nameOf = (db, id) => { const p = findP(db, id); return p ? p.name : id; };

  function matchPipeline(p, h, f) {
    if (f.domain && p.domain !== f.domain) return false;
    if (f.platform && p.platform !== f.platform) return false;
    if (f.source && p.source !== f.source) return false;
    if (f.target && p.target !== f.target) return false;
    if (f.owner && p.owner !== f.owner) return false;
    if (f.pipeline && p.id !== f.pipeline) return false;
    if (f.status && h.health !== f.status) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if ([p.name, p.id, p.domain, p.source, p.target, p.owner, p.platformName, p.type].join(' ').toLowerCase().indexOf(q) < 0) return false;
    }
    return true;
  }
  function filtered(db, f, now) {
    return db.pipelines.map((p) => Object.assign({}, p, pipelineHealth(db, p, now))).filter((p) => matchPipeline(p, p, f || {}));
  }
  function execsIn(db, ids, from, to, now) {
    const set = new Set(ids);
    return db.executions.filter((e) => set.has(e.pipelineId) && e.start && e.start >= from && e.start < to)
      .map((e) => e.status === 'running' ? M.liveExecution(e, findP(db, e.pipelineId), now) : e);
  }
  function buckets(range, now) {
    const out = [];
    if (range === '24h') {
      const end = Math.ceil(now / HOUR) * HOUR;
      for (let i = 23; i >= 0; i--) { const s = end - (i + 1) * HOUR; out.push({ from: s, to: s + HOUR, label: U.fmtHM(s) }); }
    } else {
      const n = range === '7d' ? 7 : 30;
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      const end = d.getTime() + DAY;
      for (let i = n - 1; i >= 0; i--) { const s = end - (i + 1) * DAY; out.push({ from: s, to: s + DAY, label: n === 7 ? U.fmtDow(s) + ' ' + new Date(s).getDate() : U.fmtDay(s) }); }
    }
    return out;
  }
  function inBucket(execs, b) { return execs.filter((e) => e.start >= b.from && e.start < b.to); }
  function successRate(list) {
    const done = list.filter((e) => e.status === 'success' || e.status === 'failed');
    return done.length ? 100 * done.filter((e) => e.status === 'success').length / done.length : 100;
  }
  function dailySeries(db, ids, days, now, fn) {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    const out = [];
    const all = execsIn(db, ids, d.getTime() - (days - 1) * DAY, now + 1, now);
    for (let i = days - 1; i >= 0; i--) {
      const s = d.getTime() - i * DAY;
      out.push(fn(all.filter((e) => e.start >= s && e.start < s + DAY)));
    }
    return out;
  }

  /* ---- endpoints ---- */
  MockAdapter.prototype.getFilterOptions = function (f) {
    const db = this.db(f.env);
    const ps = db.pipelines;
    return {
      environments: [{ id: 'prod', label: 'Production' }, { id: 'uat', label: 'UAT' }, { id: 'dev', label: 'Development' }],
      domains: U.uniq(ps.map((p) => p.domain)).sort(),
      platforms: U.uniq(ps.map((p) => p.platform)).map((id) => ({ id, label: M.PLATFORMS[id].name })),
      sources: U.uniq(ps.map((p) => p.source)).sort(),
      targets: U.uniq(ps.map((p) => p.target)).sort(),
      owners: U.uniq(ps.map((p) => p.owner)).sort(),
      pipelines: ps.map((p) => ({ id: p.id, label: p.name })).sort((a, b) => a.label.localeCompare(b.label)),
      statuses: ['success', 'running', 'failed', 'delayed', 'warning', 'queued', 'blocked'],
      severities: ['critical', 'high', 'medium', 'low']
    };
  };

  MockAdapter.prototype.getOverview = function (f) {
    const now = Date.now(), db = this.db(f.env);
    const ps = filtered(db, f, now);
    const ids = ps.map((p) => p.id);
    const count = (s) => ps.filter((p) => p.health === s).length;
    const c = { total: ps.length, running: count('running'), success: count('success'), failed: count('failed'), delayed: count('delayed'), warning: count('warning'), queued: count('queued'), blocked: count('blocked') };
    const range = f.range || '24h', span = RANGE_MS[range];
    const cur = execsIn(db, ids, now - span, now + 1, now);
    const prev = execsIn(db, ids, now - 2 * span, now - span, now);
    const gb = (l) => U.sum(l, (e) => e.volumeInGB || 0);
    const recs = (l) => U.sum(l, (e) => e.recordsRead || 0);
    // impact analysis (downstream blocked)
    const deps = this.getDependencies(f, true);
    const priorities = [];
    ps.forEach((p) => {
      const impact = (deps.impactOf[p.id] || []).length;
      let score = 0, kind = '';
      if (p.health === 'failed') { score = 100 + impact * 5; kind = 'Failed'; }
      else if (p.health === 'delayed') { score = 70 + impact * 5; kind = p.latest.start ? 'SLA breach (running)' : 'Not started'; }
      else if (p.health === 'blocked') { score = 55; kind = 'Blocked'; }
      else if (p.health === 'warning' && p.dqSummary.fail) { score = 50; kind = 'DQ failure'; }
      else if (p.health === 'warning') { score = 30; kind = p.latest.slaBreached ? 'Late finish' : 'DQ warning'; }
      else if (p.health === 'queued') { score = 15; kind = 'Queued'; }
      if (score) priorities.push({ pipelineId: p.id, name: p.name, health: p.health, kind, reason: p.reasons[0] || '', impact, score, owner: p.owner, since: p.latest.end || p.latest.start || p.latest.scheduledTime });
    });
    priorities.sort((a, b) => b.score - a.score);
    const weight = c.failed * 1 + c.delayed * 0.6 + c.blocked * 0.5 + c.warning * 0.3;
    const score = c.total ? Math.round(100 * (1 - weight / c.total)) : 100;
    const openAlerts = db.alerts.filter((a) => a.status !== 'resolved' && ids.indexOf(a.pipelineId) >= 0);
    return {
      asOf: now, env: f.env, range,
      counts: c,
      health: { score, label: c.failed || score < 70 ? (score < 60 ? 'Critical' : 'Degraded') : score < 90 ? 'Degraded' : 'Healthy' },
      successRate: successRate(cur), successRatePrev: successRate(prev),
      runs: cur.length, runsPrev: prev.length,
      failedRuns: cur.filter((e) => e.status === 'failed').length, failedRunsPrev: prev.filter((e) => e.status === 'failed').length,
      dataGB: gb(cur), dataGBPrev: gb(prev), records: recs(cur), recordsPrev: recs(prev),
      slaBreaches: cur.filter((e) => e.slaBreached).length,
      openAlerts: { total: openAlerts.length, critical: openAlerts.filter((a) => a.severity === 'critical').length, high: openAlerts.filter((a) => a.severity === 'high').length },
      blockedDownstream: deps.blockedCount,
      priorities: priorities.slice(0, 7),
      spark: {
        runs: dailySeries(db, ids, 14, now, (l) => l.length),
        success: dailySeries(db, ids, 14, now, (l) => l.filter((e) => e.status === 'success').length),
        failed: dailySeries(db, ids, 14, now, (l) => l.filter((e) => e.status === 'failed').length),
        sla: dailySeries(db, ids, 14, now, (l) => l.filter((e) => e.slaBreached).length),
        rate: dailySeries(db, ids, 14, now, successRate),
        gb: dailySeries(db, ids, 14, now, gb),
        queue: dailySeries(db, ids, 14, now, (l) => U.avg(l, (e) => e.queueSec || 0)),
        running: dailySeries(db, ids, 14, now, (l) => U.sum(l, (e) => e.durationSec || 0) / 86400)
      }
    };
  };

  MockAdapter.prototype.getPipelines = function (f) {
    const now = Date.now(), db = this.db(f.env);
    return filtered(db, f, now).map((p) => {
      const e = p.latest;
      const hist = db.byPipeline[p.id].filter((x) => x.end).slice(0, 14).reverse();
      return {
        id: p.id, name: p.name, platform: p.platform, platformName: p.platformName, platformShort: p.platformShort, type: p.type, domain: p.domain,
        source: p.source, target: p.target, owner: p.owner, schedule: p.schedule, sla: p.sla, environment: p.environment,
        status: p.health, execStatus: e.status, executionId: e.id, startTime: e.start, endTime: e.end, scheduledTime: e.scheduledTime,
        durationSec: e.durationSec, recordsProcessed: e.recordsRead, dataVolumeGB: e.volumeInGB, progress: e.progress,
        lastRun: e.start || e.scheduledTime, lastSuccess: p.lastSuccess, slaStatus: p.slaStatus, reasons: p.reasons, dq: p.dqSummary,
        retries: e.retries, history: hist.map((x) => ({ status: x.status, durationSec: x.durationSec })),
        openAlerts: db.alerts.filter((a) => a.pipelineId === p.id && a.status !== 'resolved').length
      };
    });
  };

  MockAdapter.prototype.getPipeline = function (env, id) {
    const now = Date.now(), db = this.db(env);
    const p = findP(db, id);
    const h = pipelineHealth(db, p, now);
    return Object.assign({}, p, h, {
      upstreamDetail: p.upstream.map((u) => ({ id: u, name: nameOf(db, u), status: pipelineHealth(db, findP(db, u), now).health })),
      downstreamDetail: db.pipelines.filter((x) => x.upstream.indexOf(id) >= 0).map((x) => ({ id: x.id, name: x.name, status: pipelineHealth(db, x, now).health })),
      alerts: db.alerts.filter((a) => a.pipelineId === id),
      dataQuality: db.dq[id] || []
    });
  };

  MockAdapter.prototype.getExecutions = function (env, pipelineId, limit) {
    const now = Date.now(), db = this.db(env), p = findP(db, pipelineId);
    return db.byPipeline[pipelineId].slice(0, limit || 40).map((e) => M.liveExecution(e, p, now));
  };

  MockAdapter.prototype.getExecution = function (env, execId) {
    const now = Date.now(), db = this.db(env);
    const e = db.executions.find((x) => x.id === execId);
    const p = findP(db, e.pipelineId);
    return Object.assign({}, M.liveExecution(e, p, now), { steps: M.getSteps(db, e, now), pipelineName: p.name, slaMin: p.sla.maxDurationMin });
  };

  MockAdapter.prototype.getLogs = function (env, execId) {
    const now = Date.now(), db = this.db(env);
    const e = db.executions.find((x) => x.id === execId);
    return M.getLogs(db, e, now);
  };

  MockAdapter.prototype.getAlerts = function (f) {
    const now = Date.now(), db = this.db(f.env);
    const ids = new Set(filtered(db, Object.assign({}, f, { status: '' }), now).map((p) => p.id));
    return db.alerts.filter((a) => ids.has(a.pipelineId) && (!f.severity || a.severity === f.severity))
      .map((a) => Object.assign({}, a)).sort((a, b) => b.ts - a.ts);
  };
  MockAdapter.prototype.updateAlert = function (env, id, patch) {
    const a = this.db(env).alerts.find((x) => x.id === id);
    Object.assign(a, patch);
    return Object.assign({}, a);
  };
  MockAdapter.prototype.rerun = function (env, pipelineId) {
    return { accepted: true, pipelineId, message: 'Re-run request submitted (mock). A real backend would call the platform adapter.' };
  };

  MockAdapter.prototype.getTimeline = function (f, hours) {
    const now = Date.now(), db = this.db(f.env);
    const from = now - hours * HOUR, to = now + Math.max(1, Math.round(hours / 12)) * HOUR;
    const rows = filtered(db, f, now).map((p) => {
      const bars = [];
      db.byPipeline[p.id].forEach((raw) => {
        const e = raw.status === 'running' ? M.liveExecution(raw, p, now) : raw;
        if (e.start) {
          const end = e.end || now;
          if (end < from || e.start > to) return;
          let st = e.status;
          if (st === 'running' && e.slaBreached) st = 'delayed';
          bars.push({ execId: e.id, status: st, start: e.start, end, running: e.status === 'running', durationSec: e.durationSec, records: e.recordsRead, sla: e.slaBreached, scheduled: e.scheduledTime, retries: e.retries });
        } else if (e.scheduledTime <= now && e.scheduledTime >= from - DAY) {
          bars.push({ execId: e.id, status: e.status, start: Math.max(e.scheduledTime, from), end: now, notStarted: true, scheduled: e.scheduledTime, reason: e.reason || e.blockedBy || e.waitingOn });
        }
      });
      // next planned run
      const latest = db.byPipeline[p.id][0];
      const next = latest.scheduledTime + p.schedule.everyMin * MIN;
      if (!p.streaming && next > now && next < to) bars.push({ status: 'planned', start: next, end: next + p.baseline.avgMin * MIN, planned: true, scheduled: next });
      return { id: p.id, name: p.name, domain: p.domain, health: p.health, platformShort: p.platformShort, bars };
    });
    return { from, to, now, rows };
  };

  MockAdapter.prototype.getDataMetrics = function (f) {
    const now = Date.now(), db = this.db(f.env);
    const ps = filtered(db, f, now), ids = ps.map((p) => p.id);
    const range = f.range || '24h';
    const bs = buckets(range, now);
    const all = execsIn(db, ids, bs[0].from, now + 1, now);
    const series = bs.map((b) => {
      const l = inBucket(all, b);
      const mins = U.sum(l, (e) => (e.durationSec || 0) / 60);
      const gbIn = U.sum(l, (e) => e.volumeInGB || 0);
      const hours = (b.to - b.from) / HOUR;
      return {
        label: b.label, from: b.from,
        records: U.sum(l, (e) => e.recordsRead || 0),
        written: U.sum(l, (e) => e.recordsWritten || 0),
        gbIn, gbOut: U.sum(l, (e) => e.volumeOutGB || 0),
        avgDurMin: l.length ? mins / l.length : 0,
        success: l.filter((e) => e.status === 'success' && !e.retries).length,
        retried: l.filter((e) => e.status === 'success' && e.retries).length,
        failed: l.filter((e) => e.status === 'failed').length,
        recPerMin: U.sum(l, (e) => e.recordsRead || 0) / (hours * 60),
        gbPerHour: gbIn / hours
      };
    });
    const durTrend = (days) => dailySeries(db, ids.filter((id) => !findP(db, id).streaming), days, now, (l) => U.avg(l, (e) => (e.durationSec || 0) / 60));
    const byP = ps.map((p) => {
      const l = all.filter((e) => e.pipelineId === p.id);
      return { id: p.id, name: p.name, gb: U.sum(l, (e) => e.volumeInGB || 0), records: U.sum(l, (e) => e.recordsRead || 0) };
    }).sort((a, b) => b.gb - a.gb);
    return {
      range, series,
      totals: { records: U.sum(series, (s) => s.records), gbIn: U.sum(series, (s) => s.gbIn), gbOut: U.sum(series, (s) => s.gbOut), runs: all.length,
        recPerMin: U.sum(series, (s) => s.records) / ((bs[bs.length - 1].to - bs[0].from) / MIN), gbPerHour: U.sum(series, (s) => s.gbIn) / ((bs[bs.length - 1].to - bs[0].from) / HOUR) },
      duration7: { labels: lastDays(7, now), values: durTrend(7) },
      duration30: { labels: lastDays(30, now), values: durTrend(30) },
      topVolume: byP.slice(0, 10)
    };
  };
  function lastDays(n, now) { const d = new Date(now); d.setHours(0, 0, 0, 0); const out = []; for (let i = n - 1; i >= 0; i--) out.push(n <= 7 ? U.fmtDow(d.getTime() - i * DAY) : U.fmtDay(d.getTime() - i * DAY)); return out; }

  MockAdapter.prototype.getOpsMetrics = function (f) {
    const now = Date.now(), db = this.db(f.env);
    const ps = filtered(db, f, now), ids = ps.map((p) => p.id);
    const range = f.range || '24h';
    const bs = buckets(range, now);
    const all = execsIn(db, ids, bs[0].from, now + 1, now);
    const batch = all.filter((e) => !findP(db, e.pipelineId).streaming);
    const done = all.filter((e) => e.status === 'success' || e.status === 'failed');
    const series = bs.map((b) => {
      const l = inBucket(all, b);
      return { label: b.label, count: l.length, retries: U.sum(l, (e) => e.retries || 0), queue: U.avg(l, (e) => e.queueSec || 0), depWait: U.avg(l, (e) => e.depWaitSec || 0), failRate: l.length ? 100 * l.filter((e) => e.status === 'failed').length / l.length : 0 };
    });
    // compute utilisation by hour of day (last 24h)
    const util = [];
    for (let i = 23; i >= 0; i--) {
      const s = Math.floor(now / HOUR) * HOUR - i * HOUR, e2 = s + HOUR;
      let busy = 0;
      execsIn(db, ids, now - 2 * DAY, now + 1, now).forEach((e) => { const st = Math.max(e.start, s), en = Math.min(e.end || now, e2); if (en > st) busy += (en - st) * (findP(db, e.pipelineId).platform === 'databricks' ? 2.2 : 1); });
      util.push({ label: U.fmtHM(s), value: Math.min(98, 100 * busy / (HOUR * 9.5)) });
    }
    const perPipeline = ps.map((p) => {
      const l = batch.filter((e) => e.pipelineId === p.id && e.durationSec);
      const lastOk = db.byPipeline[p.id].find((e) => e.status === 'success' && e.end);
      const freshMin = lastOk ? (now - lastOk.end) / MIN : null;
      const expect = p.schedule.everyMin + p.sla.maxDurationMin;
      return {
        id: p.id, name: p.name, streaming: p.streaming, platform: p.platformShort,
        avgMin: l.length ? U.avg(l, (e) => e.durationSec) / 60 : null,
        maxMin: l.length ? U.max(l, (e) => e.durationSec) / 60 : null,
        freshnessMin: freshMin, expectedFreshMin: expect, stale: freshMin != null && freshMin > expect,
        depWaitMin: U.avg(all.filter((e) => e.pipelineId === p.id), (e) => e.depWaitSec || 0) / 60,
        runs: all.filter((e) => e.pipelineId === p.id).length
      };
    });
    const platforms = U.groupBy(all, (e) => findP(db, e.pipelineId).platformShort);
    return {
      range, series, util,
      tiles: {
        runs: all.length,
        avgDurMin: U.avg(batch.filter((e) => e.durationSec), (e) => e.durationSec) / 60,
        maxDurMin: batch.length ? U.max(batch, (e) => e.durationSec || 0) / 60 : 0,
        retries: U.sum(all, (e) => e.retries || 0),
        failureRate: done.length ? 100 * done.filter((e) => e.status === 'failed').length / done.length : 0,
        queueSec: U.avg(all, (e) => e.queueSec || 0),
        throughput: U.sum(all, (e) => e.recordsRead || 0) / ((now - bs[0].from) / MIN),
        computeUtil: U.avg(util, (u) => u.value),
        computeHours: U.sum(all, (e) => e.computeHours || 0),
        staleCount: perPipeline.filter((x) => x.stale).length,
        depWaitMin: U.avg(all.filter((e) => e.depWaitSec), (e) => e.depWaitSec) / 60
      },
      perPipeline,
      failureByPlatform: Object.keys(platforms).map((k) => { const l = platforms[k].filter((e) => e.status !== 'running'); return { label: k, runs: platforms[k].length, rate: l.length ? 100 * l.filter((e) => e.status === 'failed').length / l.length : 0 }; }).sort((a, b) => b.rate - a.rate)
    };
  };

  MockAdapter.prototype.getSla = function (f) {
    const now = Date.now(), db = this.db(f.env);
    const ps = filtered(db, f, now), ids = ps.map((p) => p.id);
    const range = f.range || '24h';
    const cur = execsIn(db, ids, now - RANGE_MS[range], now + 1, now).filter((e) => e.status !== 'running' || e.slaBreached);
    const rows = ps.map((p) => {
      const e = p.latest;
      const slaSec = p.sla.maxDurationMin * 60;
      const actual = e.start ? e.durationSec : (e.status === 'delayed' ? (now - e.scheduledTime) / 1000 : null);
      return { id: p.id, name: p.name, domain: p.domain, owner: p.owner, slaMin: p.sla.maxDurationMin, actualSec: actual, varianceSec: actual == null ? null : actual - slaSec, pct: actual == null ? null : 100 * actual / slaSec, status: p.slaStatus, running: e.status === 'running', execStatus: e.status, notStarted: !e.start };
    });
    const order = { breached: 0, at_risk: 1, met: 2, pending: 3 };
    rows.sort((a, b) => order[a.status] - order[b.status] || (b.pct || 0) - (a.pct || 0));
    const met = cur.filter((e) => !e.slaBreached).length;
    return {
      range,
      compliance: cur.length ? 100 * met / cur.length : 100,
      counts: { met: rows.filter((r) => r.status === 'met').length, at_risk: rows.filter((r) => r.status === 'at_risk').length, breached: rows.filter((r) => r.status === 'breached').length, pending: rows.filter((r) => r.status === 'pending').length },
      runsEvaluated: cur.length, breachedRuns: cur.length - met,
      trend: { labels: lastDays(30, now), values: dailySeries(db, ids, 30, now, (l) => { const d = l.filter((e) => e.status !== 'running'); return d.length ? 100 * d.filter((e) => !e.slaBreached).length / d.length : 100; }) },
      rows
    };
  };

  MockAdapter.prototype.getDataQuality = function (f) {
    const now = Date.now(), db = this.db(f.env);
    const ps = filtered(db, f, now);
    const checks = [];
    ps.forEach((p) => (db.dq[p.id] || []).forEach((c) => checks.push(Object.assign({ pipelineName: p.name, domain: p.domain, owner: p.owner }, c))));
    const byType = M.DQ_TYPES.map((t) => { const l = checks.filter((c) => c.type === t.type); return { type: t.type, name: t.name, pass: l.filter((c) => c.status === 'pass').length, warn: l.filter((c) => c.status === 'warn').length, fail: l.filter((c) => c.status === 'fail').length }; });
    const R = U.rng('dq-trend-' + f.env);
    const trend = lastDays(14, now).map((label, i) => {
      const total = checks.length;
      const fail = i === 13 ? checks.filter((c) => c.status === 'fail').length : R.int(0, 3);
      const warn = i === 13 ? checks.filter((c) => c.status === 'warn').length : R.int(1, 6);
      return { label, pass: total - fail - warn, warn, fail };
    });
    return {
      totals: { total: checks.length, pass: checks.filter((c) => c.status === 'pass').length, warn: checks.filter((c) => c.status === 'warn').length, fail: checks.filter((c) => c.status === 'fail').length },
      byType, trend,
      matrix: ps.map((p) => ({ id: p.id, name: p.name, domain: p.domain, cells: M.DQ_TYPES.map((t) => { const c = (db.dq[p.id] || []).find((x) => x.type === t.type); return c ? { status: c.status, observed: c.observed, expected: c.expected, name: c.name } : null; }) })),
      types: M.DQ_TYPES,
      issues: checks.filter((c) => c.status !== 'pass').sort((a, b) => (a.status === 'fail' ? 0 : 1) - (b.status === 'fail' ? 0 : 1))
    };
  };

  MockAdapter.prototype.getDependencies = function (f, internal) {
    const now = Date.now(), db = this.db(f.env);
    const health = {};
    db.pipelines.forEach((p) => { health[p.id] = pipelineHealth(db, p, now).health; });
    // depth (layer) for layout
    const depth = {};
    const dfs = (id) => { if (depth[id] != null) return depth[id]; const p = findP(db, id); depth[id] = p.upstream.length ? 1 + Math.max.apply(null, p.upstream.map(dfs)) : 0; return depth[id]; };
    db.pipelines.forEach((p) => dfs(p.id));
    // downstream impact (transitive) for failed / blocked / delayed nodes
    const children = {};
    db.pipelines.forEach((p) => p.upstream.forEach((u) => (children[u] = children[u] || []).push(p.id)));
    const impactOf = {};
    const walk = (id, seen) => (children[id] || []).forEach((c) => { if (!seen.has(c)) { seen.add(c); walk(c, seen); } });
    db.pipelines.forEach((p) => { const s = new Set(); walk(p.id, s); impactOf[p.id] = Array.from(s); });
    const impacted = new Set();
    db.pipelines.forEach((p) => { if (['failed', 'blocked', 'delayed'].indexOf(health[p.id]) >= 0) impactOf[p.id].forEach((x) => impacted.add(x)); });
    const visible = internal ? null : new Set(filtered(db, f, now).map((p) => p.id));
    const nodes = db.pipelines.map((p) => ({ id: p.id, name: p.name, domain: p.domain, platform: p.platformShort, status: health[p.id], layer: depth[p.id], impacted: impacted.has(p.id) && ['success', 'running'].indexOf(health[p.id]) < 0, atRisk: impacted.has(p.id), dim: visible ? !visible.has(p.id) : false, downstream: impactOf[p.id].length }));
    // consumers (BI / ML) as terminal nodes
    const maxL = Math.max.apply(null, nodes.map((n) => n.layer)) + 1;
    const consumers = [
      { id: 'c_powerbi', name: 'Power BI / Reporting', consumer: true, layer: maxL, from: ['exec_dashboard_refresh', 'finance_reporting', 'daily_revenue'] },
      { id: 'c_ml', name: 'ML / Churn Model', consumer: true, layer: maxL, from: ['churn_features'] },
      { id: 'c_mktg', name: 'Marketing Dashboards', consumer: true, layer: maxL, from: ['marketing_analytics'] }
    ];
    consumers.forEach((c) => { c.status = c.from.some((x) => ['failed', 'blocked', 'delayed'].indexOf(health[x]) >= 0 || impacted.has(x)) ? 'at_risk' : 'ok'; c.atRisk = c.status === 'at_risk'; });
    const edges = [];
    db.pipelines.forEach((p) => p.upstream.forEach((u) => edges.push({ from: u, to: p.id, broken: ['failed', 'blocked', 'delayed'].indexOf(health[u]) >= 0 || (impacted.has(u) && ['success'].indexOf(health[u]) < 0) })));
    consumers.forEach((c) => c.from.forEach((u) => edges.push({ from: u, to: c.id, broken: ['failed', 'blocked', 'delayed'].indexOf(health[u]) >= 0 || (impacted.has(u) && health[u] !== 'success') })));
    return { nodes: nodes.concat(consumers), edges, impactOf, blockedCount: nodes.filter((n) => n.status === 'blocked' || n.impacted).length };
  };

  MockAdapter.prototype.search = function (env, q) {
    const db = this.db(env), s = q.toLowerCase();
    const ps = db.pipelines.filter((p) => (p.name + ' ' + p.id + ' ' + p.domain + ' ' + p.owner + ' ' + p.source + ' ' + p.target).toLowerCase().indexOf(s) >= 0).slice(0, 6).map((p) => ({ kind: 'pipeline', id: p.id, label: p.name, sub: p.domain + ' · ' + p.platformName }));
    const ex = db.executions.filter((e) => e.id.indexOf(s) >= 0).slice(0, 4).map((e) => ({ kind: 'execution', id: e.id, pipelineId: e.pipelineId, label: e.id, sub: nameOf(db, e.pipelineId) }));
    const al = db.alerts.filter((a) => (a.title + ' ' + a.description).toLowerCase().indexOf(s) >= 0).slice(0, 4).map((a) => ({ kind: 'alert', id: a.id, pipelineId: a.pipelineId, label: a.title, sub: a.severity + ' · ' + a.pipelineName }));
    return ps.concat(ex, al);
  };

  /* ======================================================================
     REST adapter — same contract, real HTTP. Endpoints documented in README.
     ====================================================================== */
  function RestAdapter(base) { this.base = base; }
  RestAdapter.prototype.get = function (path, params) {
    const qs = params ? '?' + Object.keys(params).filter((k) => params[k] !== '' && params[k] != null).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&') : '';
    return fetch(this.base + path + qs, { headers: { Accept: 'application/json' } }).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.json(); });
  };
  RestAdapter.prototype.send = function (method, path, body) {
    return fetch(this.base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json());
  };
  const R = RestAdapter.prototype;
  R.getFilterOptions = function (f) { return this.get('/filters', { env: f.env }); };
  R.getOverview = function (f) { return this.get('/overview', f); };
  R.getPipelines = function (f) { return this.get('/pipelines', f); };
  R.getPipeline = function (env, id) { return this.get('/pipelines/' + id, { env }); };
  R.getExecutions = function (env, id, limit) { return this.get('/pipelines/' + id + '/executions', { env, limit }); };
  R.getExecution = function (env, execId) { return this.get('/executions/' + execId, { env }); };
  R.getLogs = function (env, execId) { return this.get('/executions/' + execId + '/logs', { env }); };
  R.getAlerts = function (f) { return this.get('/alerts', f); };
  R.updateAlert = function (env, id, patch) { return this.send('PATCH', '/alerts/' + id + '?env=' + env, patch); };
  R.rerun = function (env, id) { return this.send('POST', '/pipelines/' + id + '/runs?env=' + env); };
  R.getTimeline = function (f, hours) { return this.get('/timeline', Object.assign({ hours }, f)); };
  R.getDataMetrics = function (f) { return this.get('/metrics/data', f); };
  R.getOpsMetrics = function (f) { return this.get('/metrics/operations', f); };
  R.getSla = function (f) { return this.get('/sla', f); };
  R.getDataQuality = function (f) { return this.get('/data-quality', f); };
  R.getDependencies = function (f) { return this.get('/dependencies', f); };
  R.search = function (env, q) { return this.get('/search', { env, q }); };

  /* ======================================================================
     Public API — async facade, adapter chosen by config
     ====================================================================== */
  let adapter = null;
  function A() {
    if (!adapter) adapter = OC.config.dataSource === 'rest' ? new RestAdapter(OC.config.apiBaseUrl) : new MockAdapter();
    return adapter;
  }
  const wrap = (name) => function () {
    const ad = A();
    const r = ad[name].apply(ad, arguments);
    return r && typeof r.then === 'function' ? r : delay(r);
  };
  OC.api = {};
  ['getFilterOptions', 'getOverview', 'getPipelines', 'getPipeline', 'getExecutions', 'getExecution', 'getLogs', 'getAlerts', 'updateAlert', 'rerun',
    'getTimeline', 'getDataMetrics', 'getOpsMetrics', 'getSla', 'getDataQuality', 'getDependencies', 'search'].forEach((n) => { OC.api[n] = wrap(n); });
})(window.OpsCenter);
