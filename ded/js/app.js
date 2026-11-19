/* ==========================================================================
   App shell — sidebar, header, global filters, router, auto-refresh, search.
   ========================================================================== */
(function (OC) {
  'use strict';
  const U = OC.utils, ui = OC.ui, api = OC.api, store = OC.store;

  const NAV = [
    { group: 'Monitor' },
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'pipelines', label: 'Pipelines', icon: 'table' },
    { id: 'timeline', label: 'Timeline', icon: 'gantt' },
    { id: 'alerts', label: 'Alerts', icon: 'bell', count: 'alerts' },
    { group: 'Analyze' },
    { id: 'metrics', label: 'Data Metrics', icon: 'bars' },
    { id: 'operations', label: 'Operations', icon: 'activity' },
    { id: 'sla', label: 'SLA', icon: 'gauge', count: 'sla' },
    { id: 'quality', label: 'Data Quality', icon: 'shield', count: 'dq' },
    { id: 'dependencies', label: 'Dependencies', icon: 'network', count: 'deps' }
  ];
  const ENV_COLORS = { prod: '#ef4c4c', uat: '#f5a524', dev: '#22b357' };
  let renderSeq = 0, timer = null, badges = {};

  function shell() {
    document.body.innerHTML =
      '<div class="app">' +
        '<nav class="sidebar" id="sidebar">' +
          '<div class="brand"><div class="brand-logo">' + ui.icon('activity') + '</div><div><div class="brand-name">Pipeline Ops Center</div><div class="brand-sub">Data Platform Observability</div></div></div>' +
          '<div id="nav"></div>' +
          '<div class="sidebar-foot"><div>Data source</div><div class="src"><span class="live-dot" style="width:6px;height:6px"></span><b style="color:var(--text-2)">' + (OC.config.dataSource === 'mock' ? 'Mock adapter' : 'REST · ' + OC.config.apiBaseUrl) + '</b></div><div style="margin-top:8px;line-height:1.6">Connectors: ADF · Databricks · Logic Apps · Airflow · dbt · Glue · Step Functions · Informatica · Snowflake</div><div style="margin-top:8px">v0.9 prototype</div></div>' +
        '</nav>' +
        '<div class="main">' +
          '<header class="header">' +
            '<button class="icon-btn menu-btn" id="menu-btn">' + ui.icon('menu') + '</button>' +
            '<h1>Data Pipeline Operations Center</h1><span class="crumb" id="crumb"></span>' +
            '<div class="env-switch" id="env-switch"></div>' +
            '<div class="header-spacer"></div>' +
            '<div class="search-box rel">' + ui.icon('search') + '<input id="g-search" placeholder="Search pipelines, executions, alerts…" autocomplete="off"><kbd>Ctrl K</kbd><div class="search-results hidden" id="g-results"></div></div>' +
            '<div class="refresh-group"><span class="lbl">Updated <b class="num" id="last-refresh" style="color:var(--text)"></b></span>' +
              '<label class="toggle" id="auto-toggle" title="Auto-refresh every ' + OC.config.autoRefreshSec + 's"><span class="live-dot" id="live-dot"></span><span class="sw"></span><span class="lbl">Auto ' + OC.config.autoRefreshSec + 's</span></label>' +
              '<button class="icon-btn" id="refresh-btn" title="Refresh now">' + ui.icon('refresh') + '</button></div>' +
            '<button class="icon-btn" id="bell-btn" title="Alerts">' + ui.icon('bell') + '<span class="badge-dot hidden" id="bell-count"></span></button>' +
            '<div class="rel"><div class="avatar" id="avatar">TD</div><div class="dropdown hidden" id="user-menu"><div class="dd-head"><div style="font-weight:650">Thota Dhana Sekhar</div><div class="muted" style="font-size:11.5px">Data Platform Ops · On-call</div></div>' +
              '<div class="dd-item">' + ui.icon('user', 'sm') + 'My profile</div><div class="dd-item">' + ui.icon('bell', 'sm') + 'Notification rules</div><div class="dd-item">' + ui.icon('settings', 'sm') + 'Settings</div><div class="dd-item">' + ui.icon('logout', 'sm') + 'Sign out</div></div></div>' +
          '</header>' +
          '<div class="filterbar" id="filterbar"></div>' +
          '<main class="content" id="content"></main>' +
        '</div>' +
      '</div>';
  }

  function renderNav() {
    const v = store.get().view;
    U.$('#nav').innerHTML = NAV.map((n) => n.group ? '<div class="nav-label">' + n.group + '</div>' :
      '<button class="nav-item ' + (v === n.id ? 'active' : '') + '" data-nav="' + n.id + '">' + ui.icon(n.icon) + n.label + (n.count && badges[n.count] ? '<span class="count ' + (badges[n.count + 'Crit'] ? 'crit' : '') + '">' + badges[n.count] + '</span>' : '') + '</button>').join('');
    U.$$('[data-nav]').forEach((b) => b.addEventListener('click', () => { nav(b.dataset.nav); U.$('#sidebar').classList.remove('open'); }));
    const view = OC.views[v];
    U.$('#crumb').textContent = '/ ' + (view ? view.title : '');
  }
  function renderEnv() {
    const f = store.filters();
    U.$('#env-switch').innerHTML = [['prod', 'PROD'], ['uat', 'UAT'], ['dev', 'DEV']].map((e) => '<button class="' + (f.env === e[0] ? 'active' : '') + '" data-env="' + e[0] + '" title="' + { prod: 'Production', uat: 'UAT', dev: 'Development' }[e[0]] + '"><span class="dot" style="background:' + ENV_COLORS[e[0]] + '"></span>' + e[1] + '</button>').join('');
    U.$$('[data-env]').forEach((b) => b.addEventListener('click', () => store.setFilters({ env: b.dataset.env })));
  }
  async function renderFilters() {
    const f = store.filters();
    const o = await api.getFilterOptions(f);
    const sel = (key, label, items) => '<select class="sel ' + (f[key] ? 'set' : '') + '" data-f="' + key + '" title="' + label + '"><option value="">' + label + ': All</option>' + items.map((it) => { const id = typeof it === 'string' ? it : it.id, lb = typeof it === 'string' ? it : it.label; return '<option value="' + U.esc(id) + '" ' + (f[key] === id ? 'selected' : '') + '>' + U.esc(lb) + '</option>'; }).join('') + '</select>';
    const n = store.activeFilterCount();
    U.$('#filterbar').innerHTML = '<span class="fl">' + ui.icon('filter', 'sm') + 'Filters</span>' +
      '<div class="seg" id="range-seg">' + [['24h', 'Last 24h'], ['7d', '7 days'], ['30d', '30 days']].map((r) => '<button data-range="' + r[0] + '" class="' + (f.range === r[0] ? 'active' : '') + '">' + r[1] + '</button>').join('') + '</div>' +
      sel('domain', 'Domain', o.domains) + sel('platform', 'Platform', o.platforms) + sel('pipeline', 'Pipeline', o.pipelines) + sel('source', 'Source', o.sources) + sel('target', 'Target', o.targets) +
      sel('status', 'Status', o.statuses.map((s) => ({ id: s, label: ui.STATUS[s].label }))) + sel('severity', 'Severity', o.severities.map((s) => ({ id: s, label: ui.SEV[s].label }))) + sel('owner', 'Owner', o.owners) +
      (n ? '<button class="btn ghost sm" id="clear-f">' + ui.icon('x', 'sm') + 'Clear ' + n + '</button>' : '');
    U.$$('#range-seg button').forEach((b) => b.addEventListener('click', () => store.setFilters({ range: b.dataset.range })));
    U.$$('[data-f]').forEach((s) => s.addEventListener('change', () => { const p = {}; p[s.dataset.f] = s.value; store.setFilters(p); }));
    if (n) U.$('#clear-f').addEventListener('click', () => store.clearFilters());
  }

  async function updateBadges() {
    const f = store.filters();
    const [al, sla, dq, dep] = await Promise.all([api.getAlerts(f), api.getSla(f), api.getDataQuality(f), api.getDependencies(f)]);
    const open = al.filter((a) => a.status === 'open');
    badges = { alerts: al.filter((a) => a.status !== 'resolved').length, alertsCrit: open.some((a) => a.severity === 'critical'), sla: sla.counts.breached, slaCrit: sla.counts.breached > 0, dq: dq.totals.fail + dq.totals.warn, dqCrit: dq.totals.fail > 0, deps: dep.blockedCount, depsCrit: dep.blockedCount > 0 };
    renderNav();
    const bc = U.$('#bell-count');
    bc.textContent = open.length; bc.classList.toggle('hidden', !open.length);
  }

  /* ---------- Router ---------- */
  function nav(view) {
    if (!OC.views[view]) view = 'overview';
    if (location.hash !== '#/' + view) history.replaceState(null, '', '#/' + view);
    store.setView(view);
  }
  async function render() {
    const seq = ++renderSeq;
    const v = store.get().view;
    const view = OC.views[v];
    const content = U.$('#content');
    const f = store.filters();
    const head = '<div class="view-head"><div><h2>' + view.title + '</h2><p>' + view.subtitle + '</p></div><div class="muted" style="font-size:11.5px">' + f.env.toUpperCase() + ' · ' + { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' }[f.range] + (store.activeFilterCount() ? ' · ' + store.activeFilterCount() + ' filter(s) applied' : '') + '</div></div>';
    if (content.dataset.view !== v) content.innerHTML = head + '<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:320px"></div>';
    content.dataset.view = v;
    // Render the new body off-screen (but laid out, so charts can measure), then swap — no flicker on refresh.
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:16px;position:absolute;visibility:hidden;left:20px;right:20px;top:0;pointer-events:none';
    content.style.position = 'relative';
    content.appendChild(body);
    try {
      await view.render(body, f);
      if (seq !== renderSeq) { body.remove(); return; }
      content.innerHTML = head;
      body.style.cssText = 'display:flex;flex-direction:column;gap:16px';
      content.appendChild(body);
    } catch (err) {
      console.error(err);
      if (seq === renderSeq) content.innerHTML = head + '<div class="callout fail">' + ui.icon('xCircle') + '<div><b>Failed to load view.</b> ' + U.esc(err.message) + '</div></div>';
    }
  }

  async function refresh(silent) {
    const btn = U.$('#refresh-btn');
    btn.classList.add('spinning');
    store.get().lastRefresh = Date.now();
    const y = window.scrollY;
    const focusedInDrawer = document.activeElement && document.activeElement.closest && document.activeElement.closest('.drawer') && document.activeElement.tagName === 'INPUT';
    await Promise.all([render(), updateBadges(), focusedInDrawer ? null : OC.drawer.refresh()]);
    window.scrollTo(0, y);
    U.$('#last-refresh').textContent = U.fmtTime(Date.now());
    setTimeout(() => btn.classList.remove('spinning'), 300);
    if (!silent) ui.toast('Dashboard refreshed', 'refresh');
  }
  function setAuto(on) {
    store.get().autoRefresh = on;
    U.$('#auto-toggle').classList.toggle('on', on);
    U.$('#live-dot').classList.toggle('off', !on);
    clearInterval(timer);
    if (on) timer = setInterval(() => refresh(true), OC.config.autoRefreshSec * 1000);
  }

  /* ---------- Global search ---------- */
  function initSearch() {
    const input = U.$('#g-search'), box = U.$('#g-results');
    let results = [], sel = 0;
    const draw = () => {
      if (!input.value.trim()) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      box.innerHTML = results.length ? results.map((r, i) => '<div class="sr ' + (i === sel ? 'sel' : '') + '" data-i="' + i + '"><span class="k">' + r.kind + '</span><div><div class="l">' + U.esc(r.label) + '</div><div class="s">' + U.esc(r.sub) + '</div></div></div>').join('') : '<div class="sr"><span class="muted">No matches</span></div>';
      U.$$('.sr[data-i]', box).forEach((d) => d.addEventListener('mousedown', (ev) => { ev.preventDefault(); go(results[+d.dataset.i]); }));
    };
    const go = (r) => {
      if (!r) return;
      input.value = ''; box.classList.add('hidden'); input.blur();
      if (r.kind === 'pipeline') OC.drawer.open({ pipelineId: r.id });
      if (r.kind === 'execution') OC.drawer.open({ pipelineId: r.pipelineId, execId: r.id, tab: 'flow' });
      if (r.kind === 'alert') OC.drawer.open({ pipelineId: r.pipelineId, tab: 'alerts' });
    };
    input.addEventListener('input', U.debounce(async () => { results = input.value.trim() ? await api.search(store.filters().env, input.value.trim()) : []; sel = 0; draw(); }, 120));
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') { sel = Math.min(results.length - 1, sel + 1); draw(); ev.preventDefault(); }
      if (ev.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); ev.preventDefault(); }
      if (ev.key === 'Enter') go(results[sel]);
      if (ev.key === 'Escape') { input.value = ''; box.classList.add('hidden'); input.blur(); }
    });
    input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 150));
    document.addEventListener('keydown', (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); input.focus(); }
      if (ev.key === 'Escape' && OC.drawer.isOpen() && document.activeElement !== input) OC.drawer.close();
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    shell();
    renderEnv();
    renderFilters();
    initSearch();
    U.$('#refresh-btn').addEventListener('click', () => refresh(false));
    U.$('#auto-toggle').addEventListener('click', (ev) => { ev.preventDefault(); setAuto(!store.get().autoRefresh); });
    U.$('#bell-btn').addEventListener('click', () => nav('alerts'));
    U.$('#menu-btn').addEventListener('click', () => U.$('#sidebar').classList.toggle('open'));
    U.$('#avatar').addEventListener('click', (ev) => { ev.stopPropagation(); U.$('#user-menu').classList.toggle('hidden'); });
    document.addEventListener('click', () => U.$('#user-menu').classList.add('hidden'));
    store.on((kind) => {
      if (kind === 'filters') { renderEnv(); renderFilters(); render(); updateBadges(); OC.drawer.refresh(); }
      if (kind === 'view') { renderNav(); render(); window.scrollTo(0, 0); }
    });
    window.addEventListener('hashchange', () => { const v = location.hash.replace('#/', ''); if (v !== store.get().view && OC.views[v]) store.setView(v); });
    window.addEventListener('resize', U.debounce(() => render(), 250));
    const initial = location.hash.replace('#/', '');
    store.get().view = OC.views[initial] ? initial : 'overview';
    renderNav();
    render();
    updateBadges();
    U.$('#last-refresh').textContent = U.fmtTime(Date.now());
    setAuto(true);
  }

  OC.app = { nav, render, refresh, boot };
  document.addEventListener('DOMContentLoaded', boot);
})(window.OpsCenter);
