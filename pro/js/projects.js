/* ============================================================
   DataSciencePro.in — Projects Catalog JS
   Filter · Search · Sort · Render · URL sync
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* --- State --- */
  let filtered = [...PROJECTS];
  let searchTimer;

  const state = {
    search:      '',
    branches:    [],
    difficulties:[],
    types:       [],
    maxPrice:    30000,
    sort:        'popular',
  };

  /* --- DOM refs --- */
  const grid        = document.getElementById('projectsGrid');
  const counter     = document.getElementById('projectCount');
  const totalEl     = document.getElementById('projectTotal');
  const sortSel     = document.getElementById('sortSelect');
  const searchInput = document.getElementById('searchInput');
  const priceSlider = document.getElementById('priceSlider');
  const priceLabel  = document.getElementById('priceLabel');
  const clearBtn    = document.getElementById('clearFilters');
  const emptyState  = document.getElementById('emptyState');

  /* --- Read URL params on load --- */
  const readURL = () => {
    const p = new URLSearchParams(location.search);
    if (p.get('branch'))     { state.branches = [p.get('branch')]; setCheckboxes('branch', state.branches); }
    if (p.get('difficulty')) { state.difficulties = [p.get('difficulty')]; setCheckboxes('difficulty', state.difficulties); }
    if (p.get('type'))       { state.types = [p.get('type')]; setCheckboxes('type', state.types); }
    if (p.get('q'))          { state.search = p.get('q'); if (searchInput) searchInput.value = state.search; }
  };

  const setCheckboxes = (name, values) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach(cb => {
      cb.checked = values.includes(cb.value);
    });
  };

  /* --- Filter & sort engine --- */
  const applyFilters = () => {
    const q = state.search.toLowerCase();

    filtered = PROJECTS.filter(p => {
      const matchBranch  = !state.branches.length    || state.branches.includes(p.branch);
      const matchDiff    = !state.difficulties.length || state.difficulties.includes(p.difficulty);
      const matchType    = !state.types.length        || state.types.includes(p.type);
      const matchPrice   = p.price <= state.maxPrice;
      const matchSearch  = !q || p.title.toLowerCase().includes(q)
                              || p.domain.toLowerCase().includes(q)
                              || p.techStack.join(' ').toLowerCase().includes(q)
                              || p.desc.toLowerCase().includes(q);
      return matchBranch && matchDiff && matchType && matchPrice && matchSearch;
    });

    sortProjects();
    render();
  };

  const sortProjects = () => {
    switch (state.sort) {
      case 'price-asc':  filtered.sort((a,b) => a.price - b.price); break;
      case 'price-desc': filtered.sort((a,b) => b.price - a.price); break;
      case 'newest':     filtered.sort((a,b) => b.id - a.id);       break;
      case 'popular':    filtered.sort((a,b) => a.id - b.id);       break;
    }
  };

  /* --- Render cards --- */
  const branchLabel = { cse:'CSE / IT', ds:'Data Science', aiml:'AI / ML', eee:'EEE', ece:'ECE', mech:'Mechanical' };

  const diffLabel = { beginner:'Beginner', intermediate:'Intermediate', advanced:'Advanced' };
  const typeLabel = { mini:'Mini Project', major:'Major Project', research:'Research', industry:'Industry' };

  const render = () => {
    if (!grid) return;

    counter.textContent = filtered.length;
    if (totalEl) totalEl.textContent = PROJECTS.length;

    if (!filtered.length) {
      grid.innerHTML = '';
      if (emptyState) emptyState.hidden = false;
      return;
    }
    if (emptyState) emptyState.hidden = true;

    grid.innerHTML = filtered.map(p => `
      <div class="project-card fade-in">
        <div class="project-card-badges">
          <span class="badge badge-${p.branch}">${branchLabel[p.branch]}</span>
          <span class="badge badge-${p.difficulty}">${diffLabel[p.difficulty]}</span>
          <span class="badge badge-primary">${typeLabel[p.type]}</span>
        </div>
        <div class="project-card-title">${escHtml(p.title)}</div>
        <div class="project-card-desc">${escHtml(p.desc)}</div>
        <div class="tech-pills">
          ${p.techStack.slice(0,4).map(t => `<span class="tech-pill">${escHtml(t)}</span>`).join('')}
          ${p.techStack.length > 4 ? `<span class="tech-pill">+${p.techStack.length - 4}</span>` : ''}
        </div>
        <div class="project-card-meta">
          <span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${escHtml(p.duration)}
          </span>
          <span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${escHtml(p.teamSize)} members
          </span>
        </div>
        <div class="project-card-footer">
          <div class="project-price">₹${p.price.toLocaleString('en-IN')}</div>
          <a href="https://wa.me/919XXXXXXXXX?text=Hi%2C%20I%20am%20interested%20in%20the%20project%3A%20${encodeURIComponent(p.title)}"
             class="btn btn-secondary btn-sm" target="_blank" rel="noopener">Enquire Now →</a>
        </div>
      </div>
    `).join('');

    // Trigger fade-in for newly rendered cards
    requestAnimationFrame(() => {
      grid.querySelectorAll('.fade-in').forEach((el, i) => {
        el.style.transitionDelay = `${i * 0.04}s`;
        requestAnimationFrame(() => el.classList.add('visible'));
      });
    });
  };

  const escHtml = (str) => String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  /* --- Event listeners --- */

  // Search (debounced)
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      applyFilters();
    }, 300);
  });

  // Sort
  sortSel?.addEventListener('change', () => {
    state.sort = sortSel.value;
    applyFilters();
  });

  // Price slider
  priceSlider?.addEventListener('input', () => {
    state.maxPrice = parseInt(priceSlider.value, 10);
    if (priceLabel) priceLabel.textContent = '₹' + Number(state.maxPrice).toLocaleString('en-IN');
    applyFilters();
  });

  // Checkbox filters
  document.querySelectorAll('input[name="branch"]').forEach(cb => {
    cb.addEventListener('change', () => {
      state.branches = [...document.querySelectorAll('input[name="branch"]:checked')].map(c => c.value);
      applyFilters();
    });
  });
  document.querySelectorAll('input[name="difficulty"]').forEach(cb => {
    cb.addEventListener('change', () => {
      state.difficulties = [...document.querySelectorAll('input[name="difficulty"]:checked')].map(c => c.value);
      applyFilters();
    });
  });
  document.querySelectorAll('input[name="type"]').forEach(cb => {
    cb.addEventListener('change', () => {
      state.types = [...document.querySelectorAll('input[name="type"]:checked')].map(c => c.value);
      applyFilters();
    });
  });

  // Clear all filters
  clearBtn?.addEventListener('click', () => {
    state.search = ''; state.branches = []; state.difficulties = []; state.types = []; state.maxPrice = 30000;
    if (searchInput) searchInput.value = '';
    if (priceSlider) { priceSlider.value = 30000; }
    if (priceLabel)  priceLabel.textContent = '₹30,000';
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    applyFilters();
  });

  /* --- Init --- */
  if (totalEl) totalEl.textContent = PROJECTS.length;
  readURL();
  applyFilters();

});
