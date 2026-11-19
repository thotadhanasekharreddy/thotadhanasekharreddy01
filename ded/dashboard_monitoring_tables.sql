/* =============================================================================
   Azure Data Platform Monitoring — Table DDL
   Backing schema for the executive Power BI dashboard
   Target: Azure SQL Database / Synapse Dedicated SQL Pool (T-SQL)
   Sources: ADF pipeline logs, Databricks job APIs, Synapse DMVs,
            DQ engine output, ServiceNow, Azure Monitor, Cost Management
   =============================================================================
   For Synapse Dedicated Pool: replace IDENTITY PKs as needed and add
   WITH (DISTRIBUTION = HASH(<key>), CLUSTERED COLUMNSTORE INDEX) on facts.
   ============================================================================= */

CREATE SCHEMA monitoring;
GO

/* ---------------------------------------------------------------------------
   1. DIMENSIONS
   --------------------------------------------------------------------------- */

-- Calendar dimension (date slicers, trend axes)
CREATE TABLE monitoring.dim_date (
    date_key            INT             NOT NULL PRIMARY KEY,      -- yyyymmdd
    full_date           DATE            NOT NULL,
    day_name            VARCHAR(10)     NOT NULL,
    day_of_week         TINYINT         NOT NULL,                  -- 1=Mon
    week_of_year        TINYINT         NOT NULL,
    month_num           TINYINT         NOT NULL,
    month_name          VARCHAR(10)     NOT NULL,
    quarter_num         TINYINT         NOT NULL,
    year_num            SMALLINT        NOT NULL,
    is_weekend          BIT             NOT NULL,
    is_business_day     BIT             NOT NULL
);

-- Pipeline / job inventory (Pipeline Health table, drill-through header)
CREATE TABLE monitoring.dim_pipeline (
    pipeline_key        INT IDENTITY(1,1) PRIMARY KEY,
    pipeline_name       VARCHAR(200)    NOT NULL,
    source_system       VARCHAR(20)     NOT NULL,                  -- ADF | Databricks | Synapse
    workspace_name      VARCHAR(100)    NULL,                      -- ADF factory / DBX workspace / Synapse ws
    environment         VARCHAR(10)     NOT NULL DEFAULT 'PROD',   -- PROD | UAT | DEV
    business_domain     VARCHAR(50)     NULL,                      -- Sales, Finance, Customer 360 ...
    criticality         VARCHAR(10)     NOT NULL DEFAULT 'Medium', -- Critical | High | Medium | Low
    owner_name          VARCHAR(100)    NULL,
    owner_email         VARCHAR(200)    NULL,
    schedule_cron       VARCHAR(50)     NULL,
    sla_duration_min    INT             NULL,                      -- max allowed runtime
    sla_deadline_utc    TIME            NULL,                      -- must complete by
    freshness_sla_min   INT             NULL,                      -- max allowed data lag
    is_active           BIT             NOT NULL DEFAULT 1,
    created_utc         DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_pipeline UNIQUE (pipeline_name, environment)
);

-- Dataset / table inventory (freshness + DQ pages)
CREATE TABLE monitoring.dim_dataset (
    dataset_key         INT IDENTITY(1,1) PRIMARY KEY,
    dataset_name        VARCHAR(200)    NOT NULL,                  -- e.g. fact_sales_orders
    layer               VARCHAR(20)     NULL,                      -- Bronze | Silver | Gold
    storage_path        VARCHAR(500)    NULL,
    business_domain     VARCHAR(50)     NULL,
    steward_name        VARCHAR(100)    NULL,
    freshness_sla_min   INT             NULL,
    is_certified        BIT             NOT NULL DEFAULT 0,
    producing_pipeline_key INT          NULL REFERENCES monitoring.dim_pipeline(pipeline_key),
    is_active           BIT             NOT NULL DEFAULT 1
);

-- DQ rule catalog (Data Quality page)
CREATE TABLE monitoring.dim_dq_rule (
    rule_key            INT IDENTITY(1,1) PRIMARY KEY,
    rule_name           VARCHAR(200)    NOT NULL UNIQUE,
    dataset_key         INT             NOT NULL REFERENCES monitoring.dim_dataset(dataset_key),
    dq_dimension        VARCHAR(20)     NOT NULL,                  -- Completeness | Accuracy | Timeliness | Uniqueness | Validity | Consistency
    severity            VARCHAR(10)     NOT NULL,                  -- Critical | High | Medium | Low
    rule_expression     VARCHAR(2000)   NULL,
    pass_threshold_pct  DECIMAL(5,2)    NOT NULL DEFAULT 99.00,
    weight              DECIMAL(4,2)    NOT NULL DEFAULT 1.00,     -- for composite score
    is_active           BIT             NOT NULL DEFAULT 1
);

/* ---------------------------------------------------------------------------
   2. FACTS — pipeline execution
   --------------------------------------------------------------------------- */

-- One row per pipeline/job run (success trend, status donut, outcomes, drill-through)
CREATE TABLE monitoring.fact_pipeline_run (
    run_key             BIGINT IDENTITY(1,1) PRIMARY KEY,
    run_id              VARCHAR(100)    NOT NULL,                  -- ADF runId / DBX run_id
    pipeline_key        INT             NOT NULL REFERENCES monitoring.dim_pipeline(pipeline_key),
    date_key            INT             NOT NULL REFERENCES monitoring.dim_date(date_key),
    trigger_type        VARCHAR(30)     NULL,                      -- Schedule | TumblingWindow | Event | Manual
    start_utc           DATETIME2(0)    NOT NULL,
    end_utc             DATETIME2(0)    NULL,
    duration_sec        AS DATEDIFF(SECOND, start_utc, end_utc) PERSISTED,
    status              VARCHAR(20)     NOT NULL,                  -- Succeeded | Failed | Cancelled | InProgress | Warning
    rows_read           BIGINT          NULL,
    rows_written        BIGINT          NULL,
    data_volume_mb      DECIMAL(18,2)   NULL,
    error_code          VARCHAR(50)     NULL,
    error_message       VARCHAR(4000)   NULL,
    retry_count         TINYINT         NOT NULL DEFAULT 0,
    sla_met             BIT             NULL,                      -- computed vs dim_pipeline SLA
    is_sla_breach       AS CASE WHEN sla_met = 0 THEN 1 ELSE 0 END,
    loaded_utc          DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_run UNIQUE (run_id, pipeline_key)
);
CREATE INDEX ix_run_pipe_date ON monitoring.fact_pipeline_run (pipeline_key, date_key) INCLUDE (status, duration_sec, sla_met);
CREATE INDEX ix_run_status    ON monitoring.fact_pipeline_run (status, start_utc);

-- One row per activity/task within a run (drill-through activity breakdown)
CREATE TABLE monitoring.fact_activity_run (
    activity_key        BIGINT IDENTITY(1,1) PRIMARY KEY,
    run_key             BIGINT          NOT NULL REFERENCES monitoring.fact_pipeline_run(run_key),
    activity_name       VARCHAR(200)    NOT NULL,
    activity_type       VARCHAR(50)     NULL,                      -- Copy | DataFlow | Notebook | StoredProc ...
    start_utc           DATETIME2(0)    NOT NULL,
    end_utc             DATETIME2(0)    NULL,
    duration_sec        AS DATEDIFF(SECOND, start_utc, end_utc) PERSISTED,
    status              VARCHAR(20)     NOT NULL,
    rows_processed      BIGINT          NULL,
    error_message       VARCHAR(4000)   NULL
);
CREATE INDEX ix_act_run ON monitoring.fact_activity_run (run_key);

/* ---------------------------------------------------------------------------
   3. FACTS — freshness, quality
   --------------------------------------------------------------------------- */

-- Snapshot per dataset per check (freshness KPI, freshness-by-domain bar)
CREATE TABLE monitoring.fact_data_freshness (
    freshness_key       BIGINT IDENTITY(1,1) PRIMARY KEY,
    dataset_key         INT             NOT NULL REFERENCES monitoring.dim_dataset(dataset_key),
    date_key            INT             NOT NULL REFERENCES monitoring.dim_date(date_key),
    check_utc           DATETIME2(0)    NOT NULL,
    last_refresh_utc    DATETIME2(0)    NULL,
    lag_minutes         INT             NULL,
    is_within_sla       BIT             NULL,
    row_count           BIGINT          NULL
);
CREATE INDEX ix_fresh_ds_date ON monitoring.fact_data_freshness (dataset_key, date_key) INCLUDE (lag_minutes, is_within_sla);

-- One row per rule evaluation (DQ score, rule donut, failing-rules table)
CREATE TABLE monitoring.fact_dq_result (
    dq_result_key       BIGINT IDENTITY(1,1) PRIMARY KEY,
    rule_key            INT             NOT NULL REFERENCES monitoring.dim_dq_rule(rule_key),
    date_key            INT             NOT NULL REFERENCES monitoring.dim_date(date_key),
    evaluated_utc       DATETIME2(0)    NOT NULL,
    rows_evaluated      BIGINT          NOT NULL,
    rows_failed         BIGINT          NOT NULL DEFAULT 0,
    pass_rate_pct       AS CASE WHEN rows_evaluated > 0
                            THEN CAST(100.0 * (rows_evaluated - rows_failed) / rows_evaluated AS DECIMAL(5,2)) END PERSISTED,
    result_status       VARCHAR(10)     NOT NULL,                  -- Passed | Warning | Failed
    rows_quarantined    BIGINT          NULL
);
CREATE INDEX ix_dq_rule_date ON monitoring.fact_dq_result (rule_key, date_key) INCLUDE (result_status, rows_failed);

/* ---------------------------------------------------------------------------
   4. FACTS — performance & cost
   --------------------------------------------------------------------------- */

-- Hourly compute utilization snapshots (gauges, Synapse pool bars)
CREATE TABLE monitoring.fact_compute_utilization (
    util_key            BIGINT IDENTITY(1,1) PRIMARY KEY,
    date_key            INT             NOT NULL REFERENCES monitoring.dim_date(date_key),
    snapshot_utc        DATETIME2(0)    NOT NULL,
    resource_type       VARCHAR(30)     NOT NULL,                  -- DatabricksCluster | SynapsePool | ADF_IR
    resource_name       VARCHAR(200)    NOT NULL,
    cpu_pct             DECIMAL(5,2)    NULL,
    memory_pct          DECIMAL(5,2)    NULL,
    active_sessions     INT             NULL,
    queued_requests     INT             NULL
);
CREATE INDEX ix_util_res_date ON monitoring.fact_compute_utilization (resource_type, date_key);

-- Daily cost per resource (compute-spend chart, MTD KPI)
CREATE TABLE monitoring.fact_daily_cost (
    cost_key            BIGINT IDENTITY(1,1) PRIMARY KEY,
    date_key            INT             NOT NULL REFERENCES monitoring.dim_date(date_key),
    resource_type       VARCHAR(30)     NOT NULL,
    resource_name       VARCHAR(200)    NOT NULL,
    meter_category      VARCHAR(100)    NULL,                      -- DBU, DWU, vCore, IR hours
    usage_quantity      DECIMAL(18,4)   NULL,
    cost_usd            DECIMAL(18,2)   NOT NULL,
    CONSTRAINT uq_cost UNIQUE (date_key, resource_type, resource_name, meter_category)
);

/* ---------------------------------------------------------------------------
   5. FACTS — operations
   --------------------------------------------------------------------------- */

-- Alerts from Azure Monitor / custom alerting (alerts stacked bar, 24h KPI)
CREATE TABLE monitoring.fact_alert (
    alert_key           BIGINT IDENTITY(1,1) PRIMARY KEY,
    date_key            INT             NOT NULL REFERENCES monitoring.dim_date(date_key),
    fired_utc           DATETIME2(0)    NOT NULL,
    severity            VARCHAR(10)     NOT NULL,                  -- Critical | Warning | Info
    alert_rule          VARCHAR(200)    NOT NULL,
    pipeline_key        INT             NULL REFERENCES monitoring.dim_pipeline(pipeline_key),
    resource_name       VARCHAR(200)    NULL,
    is_actionable       BIT             NOT NULL DEFAULT 0,
    resolved_utc        DATETIME2(0)    NULL
);
CREATE INDEX ix_alert_date ON monitoring.fact_alert (date_key, severity);

-- Incidents synced from ServiceNow (incident table, MTTR/MTTD, category donut)
CREATE TABLE monitoring.fact_incident (
    incident_key        BIGINT IDENTITY(1,1) PRIMARY KEY,
    incident_id         VARCHAR(20)     NOT NULL UNIQUE,           -- INC-48213
    date_key            INT             NOT NULL REFERENCES monitoring.dim_date(date_key),
    priority            VARCHAR(5)      NOT NULL,                  -- P1..P4
    title               VARCHAR(500)    NOT NULL,
    category            VARCHAR(50)     NULL,                      -- SchemaDrift | Capacity | Connectivity | DataQuality | CodeDefect | Other
    affected_asset      VARCHAR(200)    NULL,
    source_system       VARCHAR(20)     NULL,
    pipeline_key        INT             NULL REFERENCES monitoring.dim_pipeline(pipeline_key),
    status              VARCHAR(20)     NOT NULL,                  -- Triage | InProgress | Monitoring | Resolved | Closed
    assignee            VARCHAR(100)    NULL,
    detected_utc        DATETIME2(0)    NOT NULL,
    occurred_utc        DATETIME2(0)    NULL,                      -- for MTTD
    resolved_utc        DATETIME2(0)    NULL,                      -- for MTTR
    mttd_min            AS DATEDIFF(MINUTE, occurred_utc, detected_utc),
    mttr_min            AS DATEDIFF(MINUTE, detected_utc, resolved_utc)
);
CREATE INDEX ix_inc_status ON monitoring.fact_incident (status, priority);
GO

/* ---------------------------------------------------------------------------
   6. REPORTING VIEWS (bind Power BI visuals to these)
   --------------------------------------------------------------------------- */

-- Daily pipeline KPIs: success %, run volume, avg/P90 duration, SLA compliance
CREATE VIEW monitoring.vw_daily_pipeline_kpis AS
SELECT
    r.date_key,
    p.source_system,
    p.environment,
    COUNT(*)                                                       AS total_runs,
    SUM(CASE WHEN r.status = 'Succeeded' THEN 1 ELSE 0 END)        AS succeeded_runs,
    SUM(CASE WHEN r.status = 'Failed'    THEN 1 ELSE 0 END)        AS failed_runs,
    SUM(CASE WHEN r.status = 'Cancelled' THEN 1 ELSE 0 END)        AS cancelled_runs,
    CAST(100.0 * SUM(CASE WHEN r.status = 'Succeeded' THEN 1 ELSE 0 END)
         / NULLIF(SUM(CASE WHEN r.status <> 'InProgress' THEN 1 ELSE 0 END),0) AS DECIMAL(5,2)) AS success_rate_pct,
    AVG(r.duration_sec) / 60.0                                     AS avg_duration_min,
    CAST(100.0 * SUM(CASE WHEN r.sla_met = 1 THEN 1 ELSE 0 END)
         / NULLIF(COUNT(r.sla_met),0) AS DECIMAL(5,2))             AS sla_compliance_pct
FROM monitoring.fact_pipeline_run r
JOIN monitoring.dim_pipeline p ON p.pipeline_key = r.pipeline_key
GROUP BY r.date_key, p.source_system, p.environment;
GO

-- Failure heat map: failures by day-of-week × hour
CREATE VIEW monitoring.vw_failure_heatmap AS
SELECT
    d.day_of_week, d.day_name,
    DATEPART(HOUR, r.start_utc) AS hour_of_day,
    COUNT(*)                    AS failed_runs
FROM monitoring.fact_pipeline_run r
JOIN monitoring.dim_date d ON d.date_key = r.date_key
WHERE r.status = 'Failed'
GROUP BY d.day_of_week, d.day_name, DATEPART(HOUR, r.start_utc);
GO

-- Composite DQ score (weighted) per day and dimension
CREATE VIEW monitoring.vw_dq_score AS
SELECT
    f.date_key,
    ru.dq_dimension,
    CAST(SUM(f.pass_rate_pct * ru.weight) / NULLIF(SUM(ru.weight),0) AS DECIMAL(5,2)) AS weighted_score,
    SUM(CASE WHEN f.result_status = 'Failed' THEN 1 ELSE 0 END)                       AS failed_rules,
    SUM(f.rows_quarantined)                                                           AS rows_quarantined
FROM monitoring.fact_dq_result f
JOIN monitoring.dim_dq_rule ru ON ru.rule_key = f.rule_key
WHERE ru.is_active = 1
GROUP BY f.date_key, ru.dq_dimension;
GO

-- Latest freshness status per dataset
CREATE VIEW monitoring.vw_current_freshness AS
SELECT ds.dataset_name, ds.business_domain, ds.layer,
       f.lag_minutes, f.is_within_sla, f.check_utc
FROM monitoring.fact_data_freshness f
JOIN monitoring.dim_dataset ds ON ds.dataset_key = f.dataset_key
WHERE f.check_utc = (SELECT MAX(f2.check_utc)
                     FROM monitoring.fact_data_freshness f2
                     WHERE f2.dataset_key = f.dataset_key);
GO

-- Open incident summary with age
CREATE VIEW monitoring.vw_open_incidents AS
SELECT incident_id, priority, title, category, affected_asset, source_system,
       status, assignee, detected_utc,
       DATEDIFF(HOUR, detected_utc, SYSUTCDATETIME()) AS age_hours
FROM monitoring.fact_incident
WHERE status NOT IN ('Resolved','Closed');
GO
