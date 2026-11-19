/* ==========================================================================
   UI primitives — icons, status metadata, badges, tooltip, toasts.
   ========================================================================== */
(function (OC) {
  'use strict';
  const U = OC.utils;

  /* ---------- Icon set (Lucide-style strokes, inlined) ---------- */
  const P = {
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
    gantt: '<path d="M8 6h10"/><path d="M6 12h9"/><path d="M11 18h7"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    bars: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    network: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    arrowR: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
    retry: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    fileX: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m14.5 12.5-5 5"/><path d="m9.5 12.5 5 5"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    hdd: '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    queued: '<circle cx="12" cy="12" r="10" stroke-dasharray="3.5 3"/><path d="M12 7v5l3 2"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
  };
  const icon = (name, cls) => '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[name] || '') + '</svg>';

  /* ---------- Status metadata (reserved colours + icon + label) ---------- */
  const STATUS = {
    success: { label: 'Success', color: 'var(--ok)', icon: 'checkCircle' },
    failed: { label: 'Failed', color: 'var(--fail)', icon: 'xCircle' },
    running: { label: 'Running', color: 'var(--run)', icon: 'loader' },
    delayed: { label: 'Delayed', color: 'var(--warn)', icon: 'clock' },
    warning: { label: 'Warning', color: 'var(--warn)', icon: 'alert' },
    queued: { label: 'Queued', color: 'var(--queue)', icon: 'queued' },
    blocked: { label: 'Blocked', color: 'var(--blocked)', icon: 'ban' },
    pending: { label: 'Pending', color: 'var(--queue)', icon: 'queued' },
    skipped: { label: 'Skipped', color: 'var(--queue)', icon: 'ban' },
    planned: { label: 'Planned', color: 'var(--queue)', icon: 'clock' }
  };
  const SLA = {
    met: { label: 'Within SLA', icon: 'checkCircle' },
    at_risk: { label: 'At risk', icon: 'alert' },
    breached: { label: 'Breached', icon: 'xCircle' },
    pending: { label: 'Pending', icon: 'queued' }
  };
  const SEV = { critical: { label: 'Critical', color: 'var(--fail)', icon: 'xCircle' }, high: { label: 'High', color: '#ec835a', icon: 'alert' }, medium: { label: 'Medium', color: 'var(--warn)', icon: 'alert' }, low: { label: 'Low', color: 'var(--queue)', icon: 'bell' } };
  const ALERT_TYPES = { failure: 'Pipeline failure', sla_breach: 'SLA breach', long_running: 'Long-running', data_quality: 'Data quality', missing_data: 'Missing data', dependency: 'Dependency', retry: 'Retry', infrastructure: 'Infrastructure', delay: 'Delayed start' };

  const badge = (status, text) => {
    const m = STATUS[status] || STATUS.pending;
    return '<span class="badge b-' + status + '">' + icon(m.icon, status === 'running' ? 'spin' : '') + (text || m.label) + '</span>';
  };
  const slaTag = (s) => { const m = SLA[s] || SLA.pending; return '<span class="sla-' + s + '" style="display:inline-flex;align-items:center;gap:5px;font-weight:600;font-size:12px">' + icon(m.icon, 'sm') + m.label + '</span>'; };
  const sevTag = (s) => '<span class="sev sev-' + s + '">' + icon(SEV[s].icon, 'sm') + SEV[s].label + '</span>';
  const dot = (status) => '<span class="sd" style="background:' + (STATUS[status] || STATUS.pending).color + '"></span>';

  /* ---------- Tooltip (single shared element) ---------- */
  let tipEl = null;
  const tip = {
    show(html, x, y, owner) {
      if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tooltip'; document.body.appendChild(tipEl); }
      tipEl.innerHTML = html; tipEl.classList.add('show'); tipEl.dataset.owner = owner || '';
      const r = tipEl.getBoundingClientRect();
      let left = x + 14, top = y + 14;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
      tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
    },
    hide() { if (tipEl) { tipEl.classList.remove('show'); tipEl.dataset.owner = ''; } }
  };
  // declarative tooltips: data-tip="html"
  document.addEventListener('mousemove', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-tip]');
    if (t) tip.show(t.getAttribute('data-tip'), ev.clientX, ev.clientY);
    else if (tipEl && tipEl.dataset.owner !== 'chart') tip.hide();
  });

  /* ---------- Toasts ---------- */
  function toast(msg, ic) {
    let wrap = U.$('.toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toasts'; document.body.appendChild(wrap); }
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = icon(ic || 'checkCircle') + '<div>' + msg + '</div>';
    wrap.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
  }

  const ttRow = (color, label, value) => '<div class="tt-r">' + (color ? '<i style="background:' + color + '"></i>' : '') + U.esc(label) + '<b>' + value + '</b></div>';

  OC.ui = { icon, STATUS, SLA, SEV, ALERT_TYPES, badge, slaTag, sevTag, dot, tip, toast, ttRow };
})(window.OpsCenter);
