# Data Pipeline Operations Center — Prototype

A vendor-neutral ETL/ELT observability console for operations and data-engineering teams.
It runs entirely in the browser on realistic mock data (20 pipelines, 9 platforms, ~3,500 executions over 30 days, 3 environments). It has no backend, no build step and no external dependencies.

> **Design goal:** an operator should understand the health of the whole data platform within 10 seconds of opening the page.
> The Overview opens with a health banner (status, score, top issue). Under it are 8 KPI cards and a ranked **"Where to investigate first"** list. Detail is one click away.

---

## 1. Run it locally

**Option A: open the file.** Double-click `index.html`. It works from `file://` because it uses plain scripts, not ES modules, and needs no network or CDN.

**Option B: serve it** (closer to how it would be hosted):

```bash
cd PipelineOpsCenter
python -m http.server 8080        # or: npx serve .
# open http://localhost:8080
```

**Option C: single file.** `dist/ops-center-standalone.html` contains the whole app (CSS and JS inlined). Use it to email or share the prototype.

Tested in current Chrome and Edge. It also works in Firefox and Safari.

---

## 2. What's in the UI

| Area | What it answers | Highlights |
|---|---|---|
| **Header** | Where am I, how fresh is the data | Env switch (PROD/UAT/DEV), last-refresh time, 30s auto-refresh toggle, manual refresh, global search (Ctrl K) across pipelines, executions and alerts, alert bell, user menu |
| **Global filter bar** | Narrow the whole console | Date range (24h/7d/30d), Domain, Platform, Pipeline, Source, Target, Status, Severity, Owner. Every view and the side panel re-query when a filter changes |
| **Overview** | *Is the platform healthy? What do I look at first?* | Health banner, 8 KPI cards (trend vs prior period and a 14-day sparkline), priority list ranked by severity × downstream impact, active alerts, 24h Gantt timeline, pipeline health table (issues first), status donut, SLA gauge, DQ summary, records and run-outcome charts |
| **Pipelines** | Full inventory | Search, status chips with counts, domain and environment filters, sortable columns, duration-vs-SLA bars, last-14-run sparkline, CSV export, row → detail panel |
| **Timeline** | When did things run, overlap, run late, or not start | Gantt with a 6/12/24/48h window, a NOW marker, striped running bars, dashed not-started/blocked/planned bars, grouping by domain or issues first, and peak concurrency and longest-run stats |
| **Alerts** | Failure & Alert Center | Severity cards; tabs for failure, SLA breach, long-running, data quality, missing data, dependency, retry, infrastructure and delayed start. Each alert shows severity, time, pipeline, description, age, owner and status, with Acknowledge, Resolve and View-details actions |
| **Data Metrics** | How much data moved | Records read/written, input vs output GB, average duration (7/30 days), success/retry/failure trend, records/min, GB/hour, top pipelines by volume |
| **Operations** | How the engine is behaving | Execution count, average vs max duration, retries, failure rate (overall and per platform), queue time, compute utilisation, data freshness vs expectation, dependency wait |
| **SLA** | Within, approaching, breached | Compliance gauge against a 98% target, a donut, a 30-day trend, and a table (Pipeline, SLA, Actual, Variance, % consumed, Status) with breaches first |
| **Data Quality** | Can we trust the data | Totals, a pipeline × check-type scorecard (row count, schema, null, duplicate, referential integrity, freshness), results by type, a 14-day trend and an open-issues table |
| **Dependencies** | What does a failure break | Layered lineage graph from sources to consumers. Broken edges are animated in red, blocked or at-risk nodes are flagged, hovering traces a node's lineage, and an impact-analysis panel sits alongside |

### Drill-down path

```
Dashboard ─► Pipeline (side panel) ─► Execution ─► Step ─► Logs / Metrics / Data Quality
```

The side panel has a clickable breadcrumb and six tabs:

- **Overview**: a "why" callout, all pipeline attributes, execution info, a mini DAG, a duration-vs-SLA bar chart (click a bar to open that run) and upstream/downstream lineage.
- **Executions**: the last 40 runs. Click one to inspect it.
- **Flow & Steps**: the DAG Source → Extract → Transform → Validation → Load → Publish, with a status per node. Clicking a node shows step metrics, the error, a hint for slow steps, DQ checks (for the Validation step) and the step's logs.
- **Logs**: search, level filter (INFO/WARN/ERROR/DEBUG), step filter, highlighting and download as `.log`.
- **Data Quality** and **Alerts**.

### Scenario baked into PROD (for demos)

- **Finance GL Load** failed: Oracle connection timeout after 3 retries. It blocks Finance Reporting Mart and the Executive Dashboard, so Power BI is at risk.
- **Supplier Data Sync** failed because a partner SFTP file is missing.
- **Customer 360** is running more than 50 minutes past its 90-minute SLA because of data skew in the Transform step. Churn Feature Store is queued behind it.
- **HR Workforce Snapshot** has not started; the Workday extract is not ready.
- **Product Master** has a referential-integrity failure. Customer Master has duplicate warnings. Inventory shows a +8% volume anomaly.
- Streaming pipelines (Order Processing, Web Clickstream) run continuously, with occasional failed micro-batches.

UAT and DEV have different scenarios (schema drift, an expired OAuth token, dbt compile errors). Running executions progress live on each refresh, and some complete while you watch.

---

## 3. Application architecture

```
index.html
css/styles.css                 Theme (CSS variables) + layout + components
js/core/utils.js               Formatting, seeded RNG, DOM helpers
js/core/state.js               Global filters + per-view UI state (pub/sub)
js/data/mockData.js            MOCK DATA LAYER – generic model + generators
js/services/apiService.js      SERVICE LAYER – OpsCenter.api (Mock | REST adapter)
js/components/ui.js            Icons, status/severity metadata, badges, tooltip, toasts
js/components/charts.js        Dependency-free SVG charts (line, bars, donut, gauge, sparkline)
js/components/widgets.js       Pipeline table, Gantt timeline, alert list, bar lists
js/views/monitor.js            Overview, Pipelines, Timeline, Alerts
js/views/analytics.js          Data Metrics, Operations, SLA, Data Quality, Dependencies
js/views/drawer.js             Pipeline → Execution → Step drill-down panel
js/app.js                      Shell, router (#/view), filter bar, search, auto-refresh
```

**Layering rule:** views call only `OpsCenter.api.*`, which returns Promises of plain JSON. Views never import mock data. The service layer does all aggregation (KPIs, SLA, buckets, lineage impact), the same work a real backend would do. Swapping the data source therefore touches one file.

```
 UI views ──► OpsCenter.api ──► MockAdapter  (today: in-browser aggregation over mockData.js)
                          └──► RestAdapter  (tomorrow: fetch → your monitoring backend)
```

---

## 4. Generic data model

The model is vendor-neutral. Platform-specific detail lives in `platform`, `externalUrl` and step `activity` names.

```
Pipeline
├── id, name, platform, platformName, type, domain, environment
├── source, target, owner
├── schedule { cron, everyMin, label }
├── sla { maxDurationMin, label }
├── upstream[]                    → dependency graph
├── steps[] { id, kind(source|extract|transform|validate|load|publish), name, activity }
└── baseline { avgMin, avgRecords, avgGB, files }

Execution
├── id, pipelineId, env, status(success|failed|running|queued|blocked|delayed)
├── scheduledTime, start, end, durationSec, queueSec, depWaitSec
├── recordsRead, recordsWritten, recordsRejected, filesProcessed
├── volumeInGB, volumeOutGB, computeHours, cpuUtil, retries, trigger
├── slaBreached, error
└── steps[] { id, kind, name, activity, status, start, end, durationSec,
              recordsIn, recordsOut, rejected, throughput, attempts, cpuUtil, memoryGB, message }

LogLine   { ts, level(INFO|WARN|ERROR|DEBUG), stepId, message }
DQCheck   { id, pipelineId, type(row_count|schema|null|duplicate|referential|freshness),
            name, target, status(pass|warn|fail), observed, expected, lastRun }
Alert     { id, severity(critical|high|medium|low), type, ts, pipelineId, title,
            description, owner, status(open|acknowledged|resolved) }
```

**Derived pipeline health** (computed by the service): `success | running | failed | delayed | warning | queued | blocked`.
Running past SLA, or not started by the scheduled time, counts as **delayed**. A run that succeeded but breached SLA or failed DQ counts as **warning**.

---

## 5. Replacing mock data with a real backend

1. Build a small **monitoring backend** (FastAPI, .NET, Node or Azure Functions) that exposes the endpoints below.
2. In the backend, write one **collector/adapter per platform** that maps native run data onto the generic model:

| Platform | Source of truth |
|---|---|
| Azure Data Factory / Synapse | `pipelineRuns/queryByFactory`, `activityruns`, or Log Analytics `ADFPipelineRun` / `ADFActivityRun` |
| Databricks | Jobs API `2.1/jobs/runs/list` and `runs/get`, system tables `system.lakeflow.*` |
| Logic Apps | Workflow run history API, Log Analytics |
| Airflow / Composer | REST `/dags/{id}/dagRuns`, `/taskInstances` |
| dbt Cloud | Admin API `runs` plus `run_results.json` (tests → DQ checks) |
| Snowflake | `TASK_HISTORY`, `QUERY_HISTORY`, `ACCESS_HISTORY` |
| AWS Glue / Step Functions | `GetJobRuns`, `ListExecutions` / `GetExecutionHistory` |
| Informatica IDMC | Monitoring REST API (activity log) |
| Data quality | Great Expectations, Deequ, dbt tests, DLT expectations, Soda — normalised into `DQCheck` |

3. Store the normalised data in a time-series or relational store (Azure Data Explorer, Postgres or a Delta table). Pre-aggregate the KPIs there.
4. In the browser, set:

```html
<script>window.OpsCenter = { config: { dataSource: 'rest', apiBaseUrl: 'https://ops-api.example.com/api/v1' } };</script>
```

Put that line before the other scripts in `index.html`. No UI code changes are needed.

5. For real-time updates, replace the 30s poll with SSE or WebSocket pushes (for example an `executions.updated` event) that call `OpsCenter.app.refresh(true)`.

### Recommended API endpoints

All endpoints accept the global filter query parameters: `env, range, domain, platform, source, target, status, severity, owner, pipeline`.

| Method | Endpoint | Returns |
|---|---|---|
| GET | `/api/v1/filters` | Filter option lists |
| GET | `/api/v1/overview` | Counts, health score, success rate, data volume, deltas, sparklines, priorities |
| GET | `/api/v1/pipelines` | Pipelines with latest execution and derived health |
| GET | `/api/v1/pipelines/{id}` | Pipeline detail, lineage, alerts, DQ |
| GET | `/api/v1/pipelines/{id}/executions?limit=40` | Execution history |
| POST | `/api/v1/pipelines/{id}/runs` | Trigger a re-run (proxied to the platform adapter) |
| GET | `/api/v1/executions/{executionId}` | Execution with steps |
| GET | `/api/v1/executions/{executionId}/logs?level=&step=&q=` | Log lines (paged/streamed) |
| GET | `/api/v1/timeline?hours=24` | Gantt rows and bars |
| GET | `/api/v1/alerts` | Alerts |
| PATCH | `/api/v1/alerts/{id}` | `{status: acknowledged \| resolved, assignee, note}` |
| GET | `/api/v1/metrics/data` | Records, volume, duration and throughput series |
| GET | `/api/v1/metrics/operations` | Ops tiles and series, freshness, dependency wait |
| GET | `/api/v1/sla` | Compliance, counts, trend, per-pipeline table |
| GET | `/api/v1/data-quality` | Totals, by-type results, scorecard matrix, issues, trend |
| GET | `/api/v1/dependencies` | Nodes, edges, impact map |
| GET | `/api/v1/search?q=` | Pipelines, executions, alerts |

Response shapes match what `MockAdapter` returns in `js/services/apiService.js`. Treat that file as the API contract.

---

## 6. Extending

- **New platform:** add an entry to `PLATFORMS`/`ACTIVITIES` in `mockData.js` (mock) or a collector in the backend. The UI needs no change.
- **New view:** add `OpsCenter.views.myView = { title, subtitle, render(el, filters) }` and an entry in `NAV` in `app.js`.
- **Theming:** all colours are CSS variables in `:root`. Status colours (green, red, amber, blue, grey, violet) are reserved for state and never reused for chart series.
- **Charts:** `OpsCenter.charts` is about 250 lines of SVG. You can swap in ECharts, Chart.js or Plotly per view if needed.
