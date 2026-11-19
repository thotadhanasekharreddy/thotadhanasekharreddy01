/* ==========================================================================
   MOCK DATA LAYER
   --------------------------------------------------------------------------
   Generates a realistic, deterministic dataset that follows the generic,
   vendor-neutral pipeline model below. Nothing in here is UI code — the UI
   only ever talks to OpsCenter.api (js/services/apiService.js).

   Generic model
     Pipeline  { id, name, platform, type, domain, source, target, owner,
                 schedule, sla, upstream[], steps[] (template), tags }
     Execution { id, pipelineId, env, status, scheduledTime, start, end,
                 durationSec, recordsRead, recordsWritten, recordsRejected,
                 filesProcessed, volumeInGB, volumeOutGB, retries, queueSec,
                 depWaitSec, computeHours, cpuUtil, trigger, slaBreached, error }
     Step      { id, name, kind, activity, status, start, end, durationSec,
                 recordsIn, recordsOut, ... }
     LogLine   { ts, level, stepId, message }
     DQCheck   { id, pipelineId, type, name, target, status, observed,
                 expected, lastRun }
     Alert     { id, severity, type, ts, pipelineId, title, description,
                 owner, status }
   ========================================================================== */
(function (OC) {
  'use strict';
  const U = OC.utils;
  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  /* ---------- Platform registry (adapters plug in here later) ---------- */
  const PLATFORMS = {
    adf:           { name: 'Azure Data Factory', short: 'ADF', cloud: 'Azure' },
    databricks:    { name: 'Databricks Workflows', short: 'DBX', cloud: 'Multi-cloud' },
    logicapps:     { name: 'Azure Logic Apps', short: 'LGA', cloud: 'Azure' },
    airflow:       { name: 'Apache Airflow', short: 'AFW', cloud: 'GCP Composer' },
    dbt:           { name: 'dbt Cloud', short: 'DBT', cloud: 'SaaS' },
    glue:          { name: 'AWS Glue', short: 'GLU', cloud: 'AWS' },
    stepfunctions: { name: 'AWS Step Functions', short: 'SFN', cloud: 'AWS' },
    informatica:   { name: 'Informatica IDMC', short: 'INF', cloud: 'SaaS' },
    snowflake:     { name: 'Snowflake Tasks', short: 'SNF', cloud: 'SaaS' }
  };

  /* Activity names per platform for the 6 canonical step kinds */
  const ACTIVITIES = {
    adf:           ['Lookup: source watermark', 'Copy Data', 'Mapping Data Flow', 'Validation Activity', 'Copy Data (sink)', 'Web Activity: notify'],
    databricks:    ['Auto Loader: discover', 'Notebook: bronze_ingest', 'Notebook: silver_transform', 'Delta Live Expectations', 'MERGE INTO gold', 'Unity Catalog: publish'],
    logicapps:     ['HTTP: health probe', 'HTTP: fetch pages', 'Liquid map transform', 'Schema validate', 'SQL: bulk upsert', 'Service Bus: publish'],
    airflow:       ['Sensor: source ready', 'Operator: extract_api', 'BigQuery: transform', 'GE: validate', 'BigQuery: load', 'Trigger: downstream'],
    dbt:           ['Source freshness', 'dbt seed / snapshot', 'dbt run (models)', 'dbt test', 'Materialize marts', 'Exposure refresh'],
    glue:          ['S3 sensor', 'Glue Crawler', 'Glue Job: spark_transform', 'Deequ checks', 'Write Parquet / Iceberg', 'EventBridge: publish'],
    stepfunctions: ['Lambda: check source', 'Lambda: extract', 'EMR step: transform', 'Lambda: reconcile', 'Redshift COPY', 'SNS: publish'],
    informatica:   ['Connection test', 'Mapping task: extract', 'Mapping task: transform', 'Data Quality rule', 'Mass ingestion: load', 'Taskflow: notify'],
    snowflake:     ['Stream check', 'COPY INTO staging', 'Task: transform', 'Row-access validate', 'MERGE into mart', 'Dynamic table refresh']
  };
  const STEP_KINDS = [
    { kind: 'source', name: 'Source', share: 0.04 },
    { kind: 'extract', name: 'Extract', share: 0.24 },
    { kind: 'transform', name: 'Transform', share: 0.36 },
    { kind: 'validate', name: 'Validation', share: 0.11 },
    { kind: 'load', name: 'Load', share: 0.20 },
    { kind: 'publish', name: 'Publish', share: 0.05 }
  ];

  /* ---------- Pipeline catalog (20 pipelines, 8 domains, 9 platforms) ---------- */
  // every: run interval in minutes. avgMin: typical duration. sla: max duration (min).
  const CATALOG = [
    { id: 'raw_customer_ingest', name: 'Raw Customer Data Ingest', platform: 'adf', type: 'Batch ETL', domain: 'Customer', source: 'Salesforce API', target: 'ADLS Raw', owner: 'Customer Data Engineering', every: 1440, cron: '0 2 * * *', avgMin: 21, sla: 45, avgRecords: 1.25e6, avgGB: 4.2, files: 12, upstream: [] },
    { id: 'customer_transform', name: 'Customer Transformation', platform: 'databricks', type: 'ELT', domain: 'Customer', source: 'ADLS Raw', target: 'ADLS Curated (Delta)', owner: 'Customer Data Engineering', every: 1440, cron: '30 2 * * *', avgMin: 36, sla: 60, avgRecords: 1.24e6, avgGB: 3.9, files: 48, upstream: ['raw_customer_ingest'] },
    { id: 'customer_master', name: 'Customer Master Load', platform: 'adf', type: 'Batch ETL', domain: 'Customer', source: 'ADLS Curated (Delta)', target: 'Synapse DW', owner: 'Customer Data Engineering', every: 1440, cron: '15 3 * * *', avgMin: 29, sla: 50, avgRecords: 1.18e6, avgGB: 2.6, files: 6, upstream: ['customer_transform'] },
    { id: 'customer_360', name: 'Customer 360', platform: 'databricks', type: 'ELT', domain: 'Customer', source: 'Synapse DW + Product', target: 'Snowflake', owner: 'Analytics Engineering', every: 1440, cron: '0 6 * * *', avgMin: 62, sla: 90, avgRecords: 3.4e6, avgGB: 18.5, files: 120, upstream: ['customer_master', 'product_master'] },
    { id: 'sales_txn', name: 'Sales Transactions', platform: 'adf', type: 'CDC Incremental', domain: 'Sales', source: 'SAP ECC', target: 'ADLS Raw', owner: 'Sales Data Engineering', every: 60, cron: '5 * * * *', avgMin: 6, sla: 15, avgRecords: 410000, avgGB: 1.6, files: 3, upstream: [] },
    { id: 'order_processing', name: 'Order Processing', platform: 'databricks', type: 'Streaming', domain: 'Sales', source: 'Kafka (orders)', target: 'Delta Lake', owner: 'Sales Data Engineering', every: 60, cron: 'continuous', avgMin: 59.5, sla: 65, avgRecords: 520000, avgGB: 2.1, files: 0, upstream: [], streaming: true },
    { id: 'daily_revenue', name: 'Daily Revenue Aggregation', platform: 'dbt', type: 'ELT', domain: 'Finance', source: 'Snowflake (raw sales)', target: 'Snowflake (marts)', owner: 'Finance Analytics', every: 1440, cron: '0 7 * * *', avgMin: 17, sla: 30, avgRecords: 2.8e6, avgGB: 6.4, files: 0, upstream: ['sales_txn', 'order_processing'] },
    { id: 'finance_gl', name: 'Finance GL Load', platform: 'adf', type: 'Batch ETL', domain: 'Finance', source: 'Oracle EBS', target: 'Synapse DW', owner: 'Finance Data Engineering', every: 1440, cron: '30 5 * * *', avgMin: 41, sla: 60, avgRecords: 860000, avgGB: 3.1, files: 4, upstream: [], failRate: 0.05 },
    { id: 'product_master', name: 'Product Master', platform: 'logicapps', type: 'API Ingest', domain: 'Product', source: 'PIM REST API', target: 'Azure SQL DB', owner: 'Product Data Team', every: 1440, cron: '0 4 * * *', avgMin: 13, sla: 25, avgRecords: 186000, avgGB: 0.6, files: 0, upstream: [] },
    { id: 'inventory_incr', name: 'Inventory Incremental', platform: 'databricks', type: 'CDC Incremental', domain: 'Supply Chain', source: 'SQL Server (WMS)', target: 'Delta Lake', owner: 'Supply Chain Data Eng', every: 240, cron: '0 */4 * * *', avgMin: 24, sla: 40, avgRecords: 2.1e6, avgGB: 7.8, files: 32, upstream: [] },
    { id: 'marketing_analytics', name: 'Marketing Analytics', platform: 'airflow', type: 'ELT', domain: 'Marketing', source: 'Google Ads + Meta API', target: 'BigQuery', owner: 'Marketing Analytics', every: 1440, cron: '0 4 * * *', avgMin: 96, sla: 120, avgRecords: 5.6e6, avgGB: 22.4, files: 64, upstream: ['web_clickstream'] },
    { id: 'dq_validation', name: 'Data Quality Validation', platform: 'databricks', type: 'Validation', domain: 'Platform', source: 'Curated zone (all)', target: 'DQ Results Store', owner: 'Data Platform Team', every: 1440, cron: '30 7 * * *', avgMin: 11, sla: 20, avgRecords: 9.4e6, avgGB: 0.4, files: 0, upstream: ['product_master', 'inventory_incr'] },
    { id: 'supplier_sync', name: 'Supplier Data Sync', platform: 'glue', type: 'File Ingest', domain: 'Supply Chain', source: 'Partner SFTP', target: 'S3 Data Lake', owner: 'Supply Chain Data Eng', every: 1440, cron: '0 5 * * *', avgMin: 9, sla: 20, avgRecords: 54000, avgGB: 0.3, files: 18, upstream: [] },
    { id: 'hr_workforce', name: 'HR Workforce Snapshot', platform: 'informatica', type: 'Batch ETL', domain: 'HR', source: 'Workday (RaaS)', target: 'Snowflake', owner: 'People Analytics', every: 1440, cron: '0 6 * * *', avgMin: 15, sla: 30, avgRecords: 42000, avgGB: 0.2, files: 2, upstream: [] },
    { id: 'web_clickstream', name: 'Web Clickstream Events', platform: 'databricks', type: 'Streaming', domain: 'Marketing', source: 'Event Hubs', target: 'Delta Lake', owner: 'Digital Data Team', every: 60, cron: 'continuous', avgMin: 59.5, sla: 65, avgRecords: 3.1e6, avgGB: 9.6, files: 0, upstream: [], streaming: true },
    { id: 'finance_reporting', name: 'Finance Reporting Mart', platform: 'snowflake', type: 'ELT', domain: 'Finance', source: 'Synapse DW (GL)', target: 'Snowflake (finance mart)', owner: 'Finance Analytics', every: 1440, cron: '30 7 * * *', avgMin: 14, sla: 30, avgRecords: 640000, avgGB: 1.8, files: 0, upstream: ['finance_gl'] },
    { id: 'logistics_shipments', name: 'Logistics Shipments', platform: 'logicapps', type: 'API Ingest', domain: 'Supply Chain', source: 'Carrier REST APIs', target: 'Azure SQL DB', owner: 'Supply Chain Data Eng', every: 60, cron: '20 * * * *', avgMin: 4, sla: 10, avgRecords: 18000, avgGB: 0.05, files: 0, upstream: [] },
    { id: 'churn_features', name: 'Churn Feature Store', platform: 'databricks', type: 'ML Features', domain: 'Customer', source: 'Snowflake (Customer 360)', target: 'Feature Store', owner: 'Data Science Platform', every: 1440, cron: '0 8 * * *', avgMin: 34, sla: 60, avgRecords: 1.1e6, avgGB: 5.2, files: 0, upstream: ['customer_360'] },
    { id: 'ar_invoices', name: 'AR Invoice Reconciliation', platform: 'stepfunctions', type: 'Batch ETL', domain: 'Finance', source: 'S3 (invoice files)', target: 'Amazon Redshift', owner: 'Finance Data Engineering', every: 1440, cron: '0 3 * * *', avgMin: 26, sla: 45, avgRecords: 310000, avgGB: 1.2, files: 240, upstream: [] },
    { id: 'exec_dashboard_refresh', name: 'Executive Dashboard Refresh', platform: 'dbt', type: 'Semantic Refresh', domain: 'Analytics', source: 'Snowflake (marts)', target: 'Power BI dataset', owner: 'BI Platform Team', every: 1440, cron: '0 8 * * *', avgMin: 12, sla: 20, avgRecords: 90000, avgGB: 0.4, files: 0, upstream: ['daily_revenue', 'customer_360', 'finance_reporting'] }
  ];

  /* ---------- Current-state scenarios per environment ----------
     ago = minutes since the latest run started (or was scheduled).          */
  const SCENARIO_PROD = {
    raw_customer_ingest:   { ago: 460, status: 'success', dur: 22 },
    customer_transform:    { ago: 430, status: 'success', dur: 38 },
    customer_master:       { ago: 385, status: 'success', dur: 31 },
    customer_360:          { ago: 142, status: 'running', stuckAt: 2, planned: 100000 },
    sales_txn:             { ago: 12, status: 'success', dur: 6 },
    order_processing:      { ago: 25, status: 'running' },
    daily_revenue:         { ago: 95, status: 'success', dur: 18 },
    finance_gl:            { ago: 58, status: 'failed', dur: 44, retries: 3, failAt: 1, error: 'ORA-12170: TNS:Connect timeout occurred — database connection timeout after 3 retries (host ebs-prod-db01:1521)' },
    product_master:        { ago: 150, status: 'success', dur: 14 },
    inventory_incr:        { ago: 9, status: 'running', planned: 26 },
    marketing_analytics:   { ago: 200, status: 'success', dur: 132 },
    dq_validation:         { ago: 70, status: 'success', dur: 11 },
    supplier_sync:         { ago: 175, status: 'failed', dur: 3, failAt: 0, error: 'Expected file supplier_feed_{date}.csv not found in sftp://partner-gw/inbound/suppliers (0 of 18 files received)' },
    hr_workforce:          { ago: 50, status: 'delayed', notStarted: true, reason: 'Waiting on source: Workday RaaS extract not yet published' },
    web_clickstream:       { ago: 40, status: 'running' },
    finance_reporting:     { ago: 10, status: 'blocked', blockedBy: 'finance_gl' },
    logistics_shipments:   { ago: 33, status: 'success', dur: 4, retries: 1 },
    churn_features:        { ago: 20, status: 'queued', waitingOn: 'customer_360' },
    ar_invoices:           { ago: 300, status: 'success', dur: 27 },
    exec_dashboard_refresh:{ ago: 5, status: 'blocked', blockedBy: 'finance_reporting' }
  };
  const SCENARIO_OVERRIDES = {
    uat: {
      finance_gl: { ago: 140, status: 'success', dur: 39 },
      finance_reporting: { ago: 60, status: 'success', dur: 13 },
      exec_dashboard_refresh: { ago: 4, status: 'running', planned: 12 },
      customer_360: { ago: 150, status: 'success', dur: 71 },
      churn_features: { ago: 14, status: 'running', planned: 34 },
      inventory_incr: { ago: 30, status: 'failed', dur: 7, failAt: 3, error: 'Schema drift detected: column "bin_location" missing in target table inventory_fact' },
      marketing_analytics: { ago: 210, status: 'failed', dur: 18, failAt: 1, retries: 2, error: 'HTTP 401 Unauthorized from Google Ads API — OAuth refresh token expired' },
      hr_workforce: { ago: 120, status: 'success', dur: 16 },
      supplier_sync: { ago: 175, status: 'success', dur: 8 }
    },
    dev: {
      finance_gl: { ago: 140, status: 'success', dur: 35 },
      finance_reporting: { ago: 90, status: 'queued', waitingOn: 'manual trigger' },
      exec_dashboard_refresh: { ago: 30, status: 'queued', waitingOn: 'manual trigger' },
      customer_360: { ago: 40, status: 'running', planned: 70 },
      churn_features: { ago: 20, status: 'blocked', blockedBy: 'customer_360' },
      daily_revenue: { ago: 70, status: 'failed', dur: 4, failAt: 2, error: 'dbt compilation error: model fct_revenue references missing column discount_amt' },
      supplier_sync: { ago: 175, status: 'success', dur: 7 },
      hr_workforce: { ago: 60, status: 'queued', waitingOn: 'capacity (dev runtime paused)' },
      ar_invoices: { ago: 15, status: 'running', planned: 30 },
      dq_validation: { ago: 70, status: 'failed', dur: 3, failAt: 3, error: 'Expectation suite "curated_core" failed: 7 of 64 expectations' }
    }
  };
  const ENV_SCALE = { prod: 1, uat: 0.32, dev: 0.06 };

  /* ---------- Build a full dataset for one environment ---------- */
  function build(env, nowTs) {
    const now = nowTs || Date.now();
    const R = U.rng('ops-center-' + env);
    const scale = ENV_SCALE[env] || 1;
    const scenario = Object.assign({}, SCENARIO_PROD, SCENARIO_OVERRIDES[env] || {});
    const pipelines = CATALOG.map((c) => decoratePipeline(c, env));
    const executions = [];
    const byPipeline = {};

    pipelines.forEach((p) => {
      const sc = scenario[p.id];
      const list = [];
      const interval = p.schedule.everyMin * MIN;
      const latestStart = now - sc.ago * MIN;
      // ---- latest (current) execution driven by the scenario
      list.push(makeLatest(p, sc, latestStart, env, R, scale, now));
      // ---- history back 30 days
      let k = 1;
      while (true) {
        const sched = latestStart - k * interval;
        if (sched < now - 30 * DAY) break;
        list.push(makeHistorical(p, sched, env, R, scale));
        k++;
      }
      list.sort((a, b) => b.scheduledTime - a.scheduledTime);
      byPipeline[p.id] = list;
      executions.push.apply(executions, list);
    });

    const db = { env, builtAt: now, pipelines, executions, byPipeline, scale, platforms: PLATFORMS, alerts: [], dq: {}, stepCache: {}, logCache: {} };
    db.dq = buildDataQuality(db, now);
    db.alerts = env === 'prod' ? buildProdAlerts(db, now) : deriveAlerts(db, now);
    return db;
  }

  function decoratePipeline(c, env) {
    const acts = ACTIVITIES[c.platform];
    return {
      id: c.id,
      name: c.name,
      platform: c.platform,
      platformName: PLATFORMS[c.platform].name,
      platformShort: PLATFORMS[c.platform].short,
      cloud: PLATFORMS[c.platform].cloud,
      type: c.type,
      domain: c.domain,
      environment: env,
      source: c.source,
      target: c.target,
      owner: c.owner,
      schedule: { cron: c.cron, everyMin: c.every, label: scheduleLabel(c) },
      sla: { maxDurationMin: c.sla, label: 'Complete within ' + U.fmtMin(c.sla) },
      upstream: c.upstream.slice(),
      streaming: !!c.streaming,
      baseline: { avgMin: c.avgMin, avgRecords: c.avgRecords, avgGB: c.avgGB, files: c.files },
      failRate: c.failRate || 0.012,
      steps: STEP_KINDS.map((s, i) => ({ id: 's' + (i + 1), kind: s.kind, name: s.name, activity: acts[i], share: s.share })),
      externalUrl: '#' // deep link into the native tool (ADF monitor, Databricks run page, Airflow UI …)
    };
  }
  function scheduleLabel(c) {
    if (c.cron === 'continuous') return 'Continuous (hourly checkpoint)';
    if (c.every === 60) return 'Hourly at :' + c.cron.split(' ')[0].padStart(2, '0');
    if (c.every === 240) return 'Every 4 hours';
    const parts = c.cron.split(' ');
    return 'Daily at ' + parts[1].padStart(2, '0') + ':' + parts[0].padStart(2, '0');
  }

  function execId(p, R) {
    const pre = { adf: 'adf', databricks: 'run', logicapps: 'wf', airflow: 'dag', dbt: 'dbt', glue: 'jr', stepfunctions: 'sfn', informatica: 'inf', snowflake: 'tsk' }[p.platform];
    return pre + '-' + R.hex(8) + '-' + R.hex(4);
  }

  function volumeFactor(ts, p) {
    const d = new Date(ts).getDay();
    const weekend = d === 0 || d === 6;
    if (['Sales', 'Finance', 'Marketing'].indexOf(p.domain) >= 0) return weekend ? 0.62 : 1;
    return weekend ? 0.85 : 1;
  }

  function baseMetrics(p, ts, durMin, R, scale, fraction) {
    const f = (fraction == null ? 1 : fraction) * volumeFactor(ts, p) * scale * R.range(0.9, 1.1);
    const read = Math.round(p.baseline.avgRecords * f);
    const rejected = Math.round(read * R.range(0, 0.0015));
    const vIn = p.baseline.avgGB * f;
    const workers = p.platform === 'databricks' ? 8 : p.platform === 'glue' ? 10 : p.platform === 'airflow' ? 4 : 2;
    return {
      recordsRead: read,
      recordsWritten: read - rejected,
      recordsRejected: rejected,
      filesProcessed: p.baseline.files ? Math.max(1, Math.round(p.baseline.files * (fraction == null ? 1 : fraction))) : 0,
      volumeInGB: +vIn.toFixed(3),
      volumeOutGB: +(vIn * R.range(0.55, 0.85)).toFixed(3),
      computeHours: +((durMin / 60) * workers * R.range(0.8, 1.1)).toFixed(2),
      cpuUtil: Math.round(R.range(42, 88))
    };
  }

  function makeHistorical(p, sched, env, R, scale) {
    const failed = R.chance(p.failRate);
    const retried = !failed && R.chance(0.03);
    let durMin = p.baseline.avgMin * R.range(0.82, 1.18);
    if (R.chance(0.04) && !p.streaming) durMin *= R.range(1.3, 1.9); // long tail
    if (p.streaming) durMin = R.range(59, 60);
    if (failed) durMin *= R.range(0.15, 0.7);
    const queueSec = Math.round(R.range(5, p.platform === 'databricks' ? 240 : 90));
    const depWaitSec = p.upstream.length ? Math.round(R.range(0, 600)) : 0;
    const start = sched + queueSec * 1000 + depWaitSec * 1000;
    const durationSec = Math.round(durMin * 60);
    const m = baseMetrics(p, sched, durMin, R, scale, failed ? R.range(0.1, 0.6) : 1);
    if (failed) { m.recordsWritten = 0; }
    return Object.assign({
      id: execId(p, R), pipelineId: p.id, env, status: failed ? 'failed' : 'success',
      scheduledTime: sched, start, end: start + durationSec * 1000, durationSec,
      retries: failed ? R.int(1, 3) : retried ? 1 : 0,
      queueSec, depWaitSec, trigger: p.streaming ? 'Continuous' : R.chance(0.03) ? 'Manual' : 'Schedule',
      slaBreached: durMin > p.sla.maxDurationMin,
      error: failed ? R.pick(['Transient network error contacting source', 'Executor lost: spot instance reclaimed', 'Deadlock victim on target table', 'Source API rate limit exceeded (HTTP 429)', 'Out of memory on driver']) : null,
      failAt: failed ? R.int(1, 4) : null
    }, m);
  }

  function makeLatest(p, sc, latestStart, env, R, scale, now) {
    const e = {
      id: execId(p, R), pipelineId: p.id, env, status: sc.status,
      scheduledTime: latestStart, start: null, end: null, durationSec: null,
      retries: sc.retries || 0, queueSec: 0, depWaitSec: 0,
      trigger: p.streaming ? 'Continuous' : 'Schedule',
      slaBreached: false, error: sc.error ? sc.error.replace('{date}', ymd(now)) : null,
      failAt: sc.failAt == null ? null : sc.failAt, stuckAt: sc.stuckAt == null ? null : sc.stuckAt,
      plannedSec: null, reason: sc.reason || null, blockedBy: sc.blockedBy || null, waitingOn: sc.waitingOn || null,
      recordsRead: 0, recordsWritten: 0, recordsRejected: 0, filesProcessed: 0, volumeInGB: 0, volumeOutGB: 0, computeHours: 0, cpuUtil: 0
    };
    if (p.upstream.length && (sc.status === 'success' || sc.status === 'failed' || sc.status === 'running')) e.depWaitSec = p.id === 'customer_360' ? 1680 : Math.round(R.range(60, 900));
    if (sc.status === 'success' || sc.status === 'failed') {
      e.queueSec = Math.round(R.range(5, 90));
      e.start = latestStart + e.queueSec * 1000;
      e.durationSec = Math.round(sc.dur * 60);
      e.end = e.start + e.durationSec * 1000;
      e.slaBreached = sc.dur > p.sla.maxDurationMin;
      Object.assign(e, baseMetrics(p, latestStart, sc.dur, R, scale, sc.status === 'failed' ? 0.35 : 1));
      if (sc.status === 'failed') { e.recordsWritten = 0; if (sc.failAt === 0) { e.recordsRead = 0; e.volumeInGB = 0; e.volumeOutGB = 0; e.filesProcessed = 0; } }
      if (p.id === 'inventory_incr' || p.id === 'marketing_analytics') { e.recordsRead = Math.round(e.recordsRead * 1.08); e.recordsWritten = Math.round(e.recordsWritten * 1.08); }
    } else if (sc.status === 'running') {
      e.queueSec = Math.round(R.range(10, 120));
      e.start = latestStart + e.queueSec * 1000;
      e.plannedSec = p.streaming ? 3600 : Math.round((sc.planned || p.baseline.avgMin) * 60);
      e.rate = baseMetrics(p, latestStart, p.baseline.avgMin, R, scale, 1); // full-run totals, scaled by progress
      if (p.id === 'inventory_incr') { e.rate.recordsRead = Math.round(e.rate.recordsRead * 1.08); e.rate.volumeInGB *= 1.08; }
    }
    // queued / blocked / delayed(not started): no start yet.
    return e;
  }
  function ymd(ts) { const d = new Date(ts); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }

  /* ---------- Live simulation: progress running executions ---------- */
  function advance(db, now) {
    db.pipelines.forEach((p) => {
      const list = db.byPipeline[p.id];
      const e = list[0];
      if (e.status !== 'running') return;
      const elapsed = (now - e.start) / 1000;
      if (e.plannedSec && elapsed >= e.plannedSec && e.stuckAt == null) {
        // finish the run
        const frac = 1;
        e.status = 'success';
        e.durationSec = e.plannedSec;
        e.end = e.start + e.plannedSec * 1000;
        ['recordsRead', 'recordsWritten', 'recordsRejected', 'filesProcessed', 'volumeInGB', 'volumeOutGB', 'computeHours', 'cpuUtil'].forEach((k) => { e[k] = e.rate[k] * (k === 'cpuUtil' ? 1 : frac); });
        e.slaBreached = e.durationSec / 60 > p.sla.maxDurationMin;
        delete db.stepCache[e.id]; delete db.logCache[e.id];
        if (p.streaming) {
          const R = U.rng(e.id);
          const nx = makeLatest(p, { status: 'running', ago: 0 }, e.end, db.env, R, db.scale, now);
          nx.start = e.end; nx.queueSec = 0;
          list.unshift(nx); db.executions.push(nx);
        }
      }
    });
  }

  /* ---------- Live view of an execution (running values derived from "now") ---------- */
  function liveExecution(e, p, now) {
    if (e.status !== 'running') return e;
    const elapsed = Math.max(0, (now - e.start) / 1000);
    const frac = e.stuckAt != null ? Math.min(0.55, elapsed / (p.baseline.avgMin * 60) * 0.5) : Math.min(0.98, elapsed / (e.plannedSec || 1));
    const out = Object.assign({}, e);
    out.durationSec = elapsed;
    out.progress = frac;
    ['recordsRead', 'recordsWritten', 'recordsRejected', 'filesProcessed', 'volumeInGB', 'volumeOutGB', 'computeHours'].forEach((k) => { out[k] = e.rate ? e.rate[k] * frac : 0; });
    out.recordsRead = Math.round(out.recordsRead); out.recordsWritten = Math.round(out.recordsWritten * 0.92); out.filesProcessed = Math.round(out.filesProcessed);
    out.cpuUtil = e.rate ? e.rate.cpuUtil : 0;
    out.slaBreached = elapsed / 60 > p.sla.maxDurationMin;
    return out;
  }

  /* ---------- Steps (lazy, deterministic) ---------- */
  function getSteps(db, e, now) {
    const p = db.pipelines.find((x) => x.id === e.pipelineId);
    const live = liveExecution(e, p, now);
    const R = U.rng('steps-' + e.id);
    const total = e.status === 'running' ? p.baseline.avgMin * 60 : (e.durationSec || p.baseline.avgMin * 60);
    let shares = p.steps.map((s) => s.share * R.range(0.85, 1.15));
    const sum = U.sum(shares); shares = shares.map((x) => x / sum);
    let t = e.start;
    const steps = [];
    let currentIdx = -1;
    if (e.status === 'running') {
      if (e.stuckAt != null) currentIdx = e.stuckAt;
      else { let acc = 0; const el = live.durationSec; currentIdx = shares.length - 1; for (let i = 0; i < shares.length; i++) { acc += shares[i] * (e.plannedSec || total); if (el < acc) { currentIdx = i; break; } } }
    }
    const reads = live.recordsRead || (e.rate ? e.rate.recordsRead : p.baseline.avgRecords);
    p.steps.forEach((tpl, i) => {
      const s = { id: tpl.id, kind: tpl.kind, name: tpl.name, activity: tpl.activity, status: 'pending', start: null, end: null, durationSec: null, recordsIn: null, recordsOut: null, rejected: 0, attempts: 1, message: null };
      const basis = e.status === 'running' && e.stuckAt == null ? (e.plannedSec || total) : total;
      const dur = shares[i] * basis;
      if (!e.start) { s.status = e.status === 'blocked' ? 'blocked' : 'pending'; steps.push(s); return; }
      if (e.status === 'success') { s.status = 'success'; }
      else if (e.status === 'failed') { s.status = i < e.failAt ? 'success' : i === e.failAt ? 'failed' : 'skipped'; }
      else if (e.status === 'running') { s.status = i < currentIdx ? 'success' : i === currentIdx ? 'running' : 'pending'; }
      if (s.status === 'success' || s.status === 'failed' || s.status === 'running') {
        s.start = t;
        if (s.status === 'running') { s.durationSec = Math.max(1, (now - t) / 1000); }
        else if (s.status === 'failed') { s.durationSec = Math.max(30, (e.end - t) / 1000); }
        else { s.durationSec = dur; }
        s.end = s.status === 'running' ? null : t + s.durationSec * 1000;
        t = s.end || t;
        const shrink = tpl.kind === 'validate' ? 1 : tpl.kind === 'source' ? 0 : 1;
        s.recordsIn = tpl.kind === 'source' ? null : Math.round(reads * (tpl.kind === 'publish' ? 0.998 : 1));
        s.recordsOut = s.recordsIn == null ? null : Math.round(s.recordsIn * (tpl.kind === 'validate' ? 0.9985 : 1) * shrink);
        if (s.status === 'running') { s.recordsOut = Math.round((s.recordsIn || 0) * R.range(0.3, 0.6)); }
        if (s.status === 'failed') { s.recordsOut = 0; s.attempts = 1 + (e.retries || 0); s.message = e.error; }
        s.rejected = tpl.kind === 'validate' && s.recordsIn ? s.recordsIn - s.recordsOut : 0;
        s.throughput = s.recordsIn && s.durationSec ? Math.round(s.recordsIn / (s.durationSec / 60)) : null;
        s.cpuUtil = Math.round(R.range(35, 92));
        s.memoryGB = +(R.range(4, 48)).toFixed(1);
      }
      steps.push(s);
    });
    return steps;
  }

  /* ---------- Logs (lazy, deterministic) ---------- */
  function getLogs(db, e, now) {
    const p = db.pipelines.find((x) => x.id === e.pipelineId);
    const steps = getSteps(db, e, now);
    const R = U.rng('logs-' + e.id);
    const out = [];
    const add = (ts, level, stepId, msg) => out.push({ ts, level, stepId, message: msg });
    if (!e.start) {
      add(e.scheduledTime, 'INFO', null, 'Execution ' + e.id + ' scheduled by ' + e.trigger.toLowerCase() + ' trigger (' + p.schedule.label + ')');
      if (e.status === 'blocked') add(e.scheduledTime + 2000, 'WARN', null, 'Dependency check failed — upstream "' + nameOf(db, e.blockedBy) + '" is not in a successful state. Execution blocked.');
      if (e.status === 'queued') add(e.scheduledTime + 2000, 'INFO', null, 'Waiting on ' + (db.pipelines.find((x) => x.id === e.waitingOn) ? 'upstream "' + nameOf(db, e.waitingOn) + '"' : e.waitingOn) + ' — execution queued');
      if (e.status === 'delayed') { add(e.scheduledTime + 1000, 'WARN', null, e.reason); add(e.scheduledTime + 15 * MIN, 'WARN', null, 'Source readiness probe: not ready (attempt 2/6). Next probe in 15m'); add(e.scheduledTime + 30 * MIN, 'WARN', null, 'Source readiness probe: not ready (attempt 3/6). SLA start window exceeded'); }
      return out;
    }
    add(e.start - (e.queueSec || 0) * 1000, 'INFO', null, 'Execution ' + e.id + ' queued (' + e.trigger + ' trigger) on ' + p.platformName + ' [' + db.env.toUpperCase() + ']');
    add(e.start, 'INFO', null, 'Execution started — pipeline "' + p.name + '"');
    steps.forEach((s) => {
      if (!s.start) return;
      const d = s.durationSec * 1000;
      const at = (f) => Math.round(s.start + d * f);
      add(at(0), 'INFO', s.id, s.name + ' started: ' + s.activity);
      if (s.kind === 'source') { add(at(0.4), 'DEBUG', s.id, 'Resolving linked service / connection for ' + p.source); }
      if (s.kind === 'source' && s.status === 'failed') {
        add(at(0.5), 'ERROR', s.id, e.error);
        add(at(0.9), 'ERROR', s.id, 'Step failed — no source data available. Aborting execution.');
        return;
      }
      if (s.kind === 'source') add(at(0.9), 'INFO', s.id, 'Source reachable (' + R.int(18, 240) + ' ms). Watermark: ' + U.fmtDateTime(e.scheduledTime - p.schedule.everyMin * MIN));
      if (s.kind === 'extract') {
        add(at(0.05), 'INFO', s.id, 'Reading source data from ' + p.source);
        if (s.status === 'failed') {
          for (let r = 1; r <= (e.retries || 1); r++) add(at(0.2 * r), 'WARN', s.id, 'Attempt ' + r + ' failed: connection timed out after 300s. Retrying in ' + (30 * r) + 's (retry ' + r + '/' + (e.retries || 1) + ')');
          add(at(0.95), 'ERROR', s.id, e.error);
          return;
        }
        if (s.recordsIn) add(at(0.6), 'INFO', s.id, U.fmtInt(s.recordsIn) + ' records received' + (p.baseline.files ? ' from ' + U.fmtInt(e.filesProcessed || (e.rate && e.rate.filesProcessed) || p.baseline.files) + ' files' : ''));
        if (p.id === 'inventory_incr' || p.id === 'marketing_analytics') add(at(0.8), 'WARN', s.id, 'Data volume ' + (p.id === 'inventory_incr' ? '8.1%' : '7.6%') + ' above 30-day baseline');
        if (p.id === 'logistics_shipments' && e.retries) add(at(0.7), 'WARN', s.id, 'HTTP 429 Too Many Requests from carrier API (UPS). Retry 1/3 in 20s');
      }
      if (s.kind === 'transform') {
        add(at(0.02), 'INFO', s.id, 'Transformation started (' + s.activity + ')');
        add(at(0.3), 'DEBUG', s.id, 'Cluster / runtime: ' + (p.platform === 'databricks' ? 'job-cluster prod-etl-03 (DBR 15.4 LTS, 8 workers)' : p.platformName + ' managed runtime'));
        if (s.status === 'running' && e.stuckAt != null) {
          add(at(0.25), 'WARN', s.id, 'Stage 14 skew detected: 1 task processing 41% of shuffle data (key customer_id)');
          add(now - 22 * MIN, 'WARN', s.id, 'Step running 2.1× longer than 30-day p95 (' + U.fmtMin(p.baseline.avgMin * 0.4) + ')');
          add(now - 6 * MIN, 'INFO', s.id, 'Progress: stage 14/22, 61% tasks complete');
          return;
        }
        if (s.status === 'failed') { add(at(0.9), 'ERROR', s.id, e.error); return; }
        if (s.status === 'running') { add(Math.min(now - 30000, at(0.5)), 'INFO', s.id, 'Progress: ' + Math.round((live(e, p, now).progress || 0.5) * 100) + '% complete'); return; }
        add(at(0.98), 'INFO', s.id, 'Transformation completed: ' + U.fmtInt(s.recordsOut) + ' rows');
      }
      if (s.kind === 'validate') {
        if (s.status === 'failed') { add(at(0.6), 'ERROR', s.id, e.error); return; }
        if (s.status === 'running') return;
        const checks = (db.dq[p.id] || []);
        add(at(0.3), 'INFO', s.id, 'Running ' + checks.length + ' data-quality checks');
        checks.filter((c) => c.status !== 'pass').forEach((c) => add(at(0.6), c.status === 'fail' ? 'ERROR' : 'WARN', s.id, 'DQ ' + c.status.toUpperCase() + ' — ' + c.name + ': ' + c.observed + ' (expected ' + c.expected + ')'));
        add(at(0.95), 'INFO', s.id, 'Validation complete: ' + U.fmtInt(s.rejected) + ' rows quarantined');
      }
      if (s.kind === 'load') {
        if (s.status === 'running') { add(Math.min(now - 20000, at(0.4)), 'INFO', s.id, 'Writing to ' + p.target + '…'); return; }
        if (s.status === 'failed') { add(at(0.8), 'ERROR', s.id, e.error); return; }
        add(at(0.5), 'INFO', s.id, 'Writing ' + U.fmtInt(s.recordsOut) + ' rows to ' + p.target);
        add(at(0.98), 'INFO', s.id, 'Load completed');
      }
      if (s.kind === 'publish' && s.status === 'success') add(at(0.9), 'INFO', s.id, 'Published dataset; notified ' + R.int(1, 4) + ' downstream consumers');
      if (s.status === 'success') add(s.end, 'DEBUG', s.id, s.name + ' finished in ' + U.fmtDur(s.durationSec));
    });
    if (e.status === 'success') add(e.end, 'INFO', null, 'Pipeline completed successfully in ' + U.fmtDur(e.durationSec) + (e.slaBreached ? ' — SLA of ' + U.fmtMin(p.sla.maxDurationMin) + ' exceeded' : ''));
    if (e.status === 'success' && e.slaBreached) out[out.length - 1].level = 'WARN';
    if (e.status === 'failed') add(e.end, 'ERROR', null, 'Pipeline FAILED after ' + U.fmtDur(e.durationSec) + ' (' + (e.retries || 0) + ' retries). On-call notified: ' + p.owner);
    out.sort((a, b) => a.ts - b.ts);
    return out;
  }
  function live(e, p, now) { return liveExecution(e, p, now); }
  function nameOf(db, id) { const p = db.pipelines.find((x) => x.id === id); return p ? p.name : id; }

  /* ---------- Data quality ---------- */
  const DQ_TYPES = [
    { type: 'row_count', name: 'Row-count validation' },
    { type: 'schema', name: 'Schema validation' },
    { type: 'null', name: 'Null check' },
    { type: 'duplicate', name: 'Duplicate check' },
    { type: 'referential', name: 'Referential integrity' },
    { type: 'freshness', name: 'Data freshness' }
  ];
  const DQ_OVERRIDES = {
    prod: {
      customer_master: { duplicate: ['warn', '0.42% duplicate customer_id (4,960 rows)', '≤ 0.10%'] },
      product_master: { referential: ['fail', '1,284 orphan category_id values', '0 orphans vs dim_category'] },
      inventory_incr: { row_count: ['warn', '+8.1% vs 30-day baseline', '± 5% of baseline'] },
      marketing_analytics: { null: ['warn', 'campaign_id null in 2.3% of rows', '≤ 1.0%'], row_count: ['warn', '+7.6% vs 30-day baseline', '± 5% of baseline'] },
      supplier_sync: { freshness: ['fail', 'Latest data 27h old', '≤ 24h'], row_count: ['fail', '0 rows received today', '≥ 40,000 rows'] },
      finance_gl: { freshness: ['fail', 'GL balances 25h old', '≤ 24h'] },
      hr_workforce: { freshness: ['warn', 'Snapshot 24.8h old', '≤ 24h'] },
      finance_reporting: { freshness: ['warn', 'Mart 24.2h old (blocked)', '≤ 24h'] },
      customer_360: { schema: ['pass', 'Schema v14 matches contract', 'Contract v14'] }
    },
    uat: {
      inventory_incr: { schema: ['fail', 'Column bin_location missing', 'Contract v9'] },
      marketing_analytics: { freshness: ['fail', 'Latest data 27h old', '≤ 24h'] },
      customer_master: { duplicate: ['warn', '0.18% duplicate customer_id', '≤ 0.10%'] }
    },
    dev: {
      dq_validation: { null: ['fail', '7 of 64 expectations failed', 'All expectations pass'] },
      daily_revenue: { schema: ['fail', 'Missing column discount_amt', 'Contract v6'] },
      product_master: { referential: ['warn', '212 orphan category_id values', '0 orphans'] },
      churn_features: { freshness: ['warn', 'Features 30h old', '≤ 24h'] }
    }
  };
  const DQ_TARGET_COL = { null: 'primary business keys', duplicate: 'natural key', referential: 'dimension foreign keys', schema: 'data contract', row_count: 'row volume', freshness: 'max(load_ts)' };

  function buildDataQuality(db, now) {
    const out = {};
    const ov = DQ_OVERRIDES[db.env] || {};
    db.pipelines.forEach((p) => {
      const lastDone = db.byPipeline[p.id].find((e) => e.end);
      const R = U.rng('dq-' + db.env + p.id);
      const checks = DQ_TYPES.filter((t) => !(t.type === 'referential' && ['Streaming', 'File Ingest', 'API Ingest'].indexOf(p.type) >= 0 && p.id !== 'product_master')).map((t, i) => {
        const o = ov[p.id] && ov[p.id][t.type];
        const passObs = {
          row_count: U.fmtInt(lastDone ? lastDone.recordsRead : p.baseline.avgRecords) + ' rows (' + (R.range(-3, 3)).toFixed(1) + '% vs baseline)',
          schema: 'Matches contract v' + R.int(3, 14),
          null: (R.range(0, 0.08)).toFixed(2) + '% nulls',
          duplicate: '0 duplicates',
          referential: '0 orphan keys',
          freshness: lastDone ? 'Updated ' + U.fmtAgo(lastDone.end, now) : 'n/a'
        }[t.type];
        const passExp = { row_count: '± 5% of baseline', schema: 'Contract match', null: '≤ 1.0%', duplicate: '0', referential: '0 orphans', freshness: p.schedule.everyMin <= 60 ? '≤ 2h' : '≤ 24h' }[t.type];
        return {
          id: p.id + '-' + t.type, pipelineId: p.id, type: t.type, name: t.name, target: DQ_TARGET_COL[t.type],
          status: o ? o[0] : 'pass', observed: o ? o[1] : passObs, expected: o ? o[2] : passExp,
          lastRun: lastDone ? lastDone.end : null, rule: t.type + '_' + (i + 1)
        };
      });
      out[p.id] = checks;
    });
    return out;
  }

  /* ---------- Alerts ---------- */
  function A(db, now, minsAgo, severity, type, pipelineId, title, description, status) {
    const p = db.pipelines.find((x) => x.id === pipelineId);
    return { id: 'ALR-' + (1000 + db._alertSeq++), severity, type, ts: now - minsAgo * MIN, pipelineId, pipelineName: p ? p.name : '', domain: p ? p.domain : '', title, description, owner: p ? p.owner : 'Data Platform Team', status: status || 'open' };
  }
  function buildProdAlerts(db, now) {
    db._alertSeq = 1;
    return [
      A(db, now, 14, 'critical', 'failure', 'finance_gl', 'Finance GL Load failed', 'Database connection timeout (ORA-12170) on Oracle EBS after 3 retries. 0 rows written to Synapse.'),
      A(db, now, 10, 'critical', 'dependency', 'finance_reporting', 'Finance Reporting Mart blocked', 'Upstream dependency "Finance GL Load" failed. Execution cannot start.'),
      A(db, now, 52, 'high', 'sla_breach', 'customer_360', 'Customer 360 breached SLA', 'Running beyond 90m SLA. Transform step 2.1× slower than 30-day p95 (data skew on customer_id).'),
      A(db, now, 172, 'high', 'missing_data', 'supplier_sync', 'Supplier feed file missing', 'Expected supplier_feed_' + ymd(now) + '.csv not found on partner SFTP. 0 of 18 files received.', 'acknowledged'),
      A(db, now, 120, 'high', 'data_quality', 'product_master', 'Referential integrity check failed', '1,284 product rows reference a category_id that does not exist in dim_category.'),
      A(db, now, 5, 'high', 'dependency', 'exec_dashboard_refresh', 'Executive Dashboard refresh blocked', 'Waiting on Finance Reporting Mart (blocked) — CFO dashboard will show stale data.'),
      A(db, now, 30, 'medium', 'infrastructure', 'finance_gl', 'Integration runtime IR-ONPREM-02 degraded', 'Self-hosted integration runtime CPU at 91% and 2 of 4 nodes unreachable.'),
      A(db, now, 50, 'medium', 'delay', 'hr_workforce', 'HR Workforce Snapshot not started', 'Scheduled run has not started — Workday RaaS extract not yet published by source.'),
      A(db, now, 66, 'medium', 'sla_breach', 'marketing_analytics', 'Marketing Analytics finished late', 'Completed in 2h 12m against a 2h SLA (+12m).', 'acknowledged'),
      A(db, now, 350, 'medium', 'data_quality', 'customer_master', 'Duplicate customer_id detected', '0.42% duplicate customer_id rows (threshold 0.10%). Load completed with warnings.', 'acknowledged'),
      A(db, now, 8, 'medium', 'data_quality', 'inventory_incr', 'Data volume anomaly', 'Inventory delta volume 8.1% above 30-day baseline (threshold ±5%).'),
      A(db, now, 22, 'medium', 'long_running', 'customer_360', 'Long-running step: Transform', 'Notebook silver_transform running 1h 40m+ (p95: 38m).'),
      A(db, now, 41, 'low', 'retry', 'finance_gl', 'Retry 2/3 started', 'Copy Data activity retried after connection timeout.', 'resolved'),
      A(db, now, 31, 'low', 'retry', 'logistics_shipments', 'Succeeded after 1 retry', 'HTTP 429 from carrier API (UPS) — succeeded on retry 1.', 'resolved'),
      A(db, now, 95, 'medium', 'infrastructure', 'web_clickstream', 'Cluster at max autoscale', 'Job cluster prod-stream-01 at 16/16 workers for 35m. Consumer lag 2.4M events.', 'resolved')
    ];
  }
  function deriveAlerts(db, now) {
    db._alertSeq = 1;
    const out = [];
    db.pipelines.forEach((p) => {
      const e = db.byPipeline[p.id][0];
      if (e.status === 'failed') out.push(A(db, now, Math.round((now - e.end) / MIN), 'critical', 'failure', p.id, p.name + ' failed', e.error));
      if (e.status === 'blocked') out.push(A(db, now, Math.round((now - e.scheduledTime) / MIN), 'high', 'dependency', p.id, p.name + ' blocked', 'Upstream "' + nameOf(db, e.blockedBy) + '" not successful.'));
      if (e.status === 'queued') out.push(A(db, now, Math.round((now - e.scheduledTime) / MIN), 'low', 'delay', p.id, p.name + ' queued', 'Waiting on ' + e.waitingOn + '.'));
      (db.dq[p.id] || []).filter((c) => c.status !== 'pass').forEach((c) => out.push(A(db, now, 60 + (U.hash(c.id) % 200), c.status === 'fail' ? 'high' : 'medium', 'data_quality', p.id, c.name + ' ' + (c.status === 'fail' ? 'failed' : 'warning'), c.observed + ' (expected ' + c.expected + ')')));
    });
    return out;
  }

  OC.MockData = { build, advance, liveExecution, getSteps, getLogs, PLATFORMS, CATALOG, DQ_TYPES };
})(window.OpsCenter);
