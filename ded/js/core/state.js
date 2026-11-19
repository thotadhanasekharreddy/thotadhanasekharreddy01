/* ==========================================================================
   App state — global filters + UI state with a tiny pub/sub.
   ========================================================================== */
(function (OC) {
  'use strict';
  const listeners = [];
  const DEFAULT_FILTERS = { env: 'prod', range: '24h', domain: '', platform: '', source: '', target: '', status: '', severity: '', owner: '', pipeline: '' };

  const state = {
    filters: Object.assign({}, DEFAULT_FILTERS),
    view: 'overview',
    autoRefresh: true,
    lastRefresh: Date.now(),
    local: {}            // per-view UI state (sort, tabs, search text …)
  };

  OC.store = {
    get: () => state,
    filters: () => Object.assign({}, state.filters),
    setFilters(patch) {
      Object.assign(state.filters, patch);
      emit('filters');
    },
    clearFilters() {
      const env = state.filters.env, range = state.filters.range;
      state.filters = Object.assign({}, DEFAULT_FILTERS, { env, range });
      emit('filters');
    },
    activeFilterCount() {
      return ['domain', 'platform', 'source', 'target', 'status', 'severity', 'owner', 'pipeline'].filter((k) => state.filters[k]).length;
    },
    setView(v) { state.view = v; emit('view'); },
    local(view) { return (state.local[view] = state.local[view] || {}); },
    on(fn) { listeners.push(fn); }
  };
  function emit(kind) { listeners.forEach((fn) => fn(kind, state)); }
})(window.OpsCenter);
