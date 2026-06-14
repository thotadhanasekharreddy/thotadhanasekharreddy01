/* ============================================================
   DataSciencePro.in — Main JS
   Nav toggle · Sticky header · Scroll animations · Carousel
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* --- Sticky navbar shadow --- */
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  /* --- Hamburger menu --- */
  const hamburger = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const open = hamburger.classList.toggle('open');
      mobileMenu.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', open);
    });
    // close on outside click
    document.addEventListener('click', (e) => {
      if (!navbar.contains(e.target)) {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', false);
      }
    });
  }

  /* --- Active nav link highlight --- */
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar-links a, .mobile-menu a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  /* --- Scroll-triggered fade-in --- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.fade-in').forEach(el => io.observe(el));

  /* --- Staggered children fade-in --- */
  document.querySelectorAll('[data-stagger]').forEach(parent => {
    const delay = parseFloat(parent.dataset.stagger) || 0.1;
    parent.querySelectorAll(':scope > *').forEach((child, i) => {
      child.classList.add('fade-in');
      child.style.transitionDelay = `${i * delay}s`;
    });
  });

  /* --- Animated counters --- */
  const animateCounters = () => {
    document.querySelectorAll('.stat-number[data-target]').forEach(el => {
      const target = parseInt(el.dataset.target, 10);
      const suffix = el.dataset.suffix || '';
      const duration = 1600;
      const step = target / (duration / 16);
      let current = 0;

      const tick = () => {
        current = Math.min(current + step, target);
        el.textContent = Math.floor(current) + suffix;
        if (current < target) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  const statsBar = document.querySelector('.stats-bar');
  if (statsBar) {
    const statsIO = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        animateCounters();
        statsIO.disconnect();
      }
    }, { threshold: 0.4 });
    statsIO.observe(statsBar);
  }

  /* --- Testimonials Carousel --- */
  const track = document.querySelector('.testimonials-track');
  if (track) {
    const cards = track.querySelectorAll('.testimonial-card');
    const dots  = document.querySelectorAll('.carousel-dot');
    const prevBtn = document.querySelector('.carousel-btn.prev');
    const nextBtn = document.querySelector('.carousel-btn.next');
    let current = 0;
    let autoTimer;

    const slidesVisible = () => window.innerWidth < 768 ? 1 : 2;
    const maxIndex = () => Math.max(0, cards.length - slidesVisible());

    const goTo = (idx) => {
      current = Math.max(0, Math.min(idx, maxIndex()));
      const gap = 24;
      const cardW = cards[0].offsetWidth + gap;
      track.style.transform = `translateX(-${current * cardW}px)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
    };

    dots.forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); resetAuto(); }));
    prevBtn?.addEventListener('click', () => { goTo(current - 1); resetAuto(); });
    nextBtn?.addEventListener('click', () => { goTo(current + 1); resetAuto(); });

    const resetAuto = () => { clearInterval(autoTimer); autoTimer = setInterval(() => goTo(current < maxIndex() ? current + 1 : 0), 4500); };
    resetAuto();
    window.addEventListener('resize', () => goTo(Math.min(current, maxIndex())), { passive: true });
  }

  /* --- FAQ accordion --- */
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      // close others
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });

  /* --- Domain tabs (domains.html) --- */
  document.querySelectorAll('.domain-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.domain-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.domain-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.target);
      if (target) target.classList.add('active');
    });
  });

  /* --- Mobile filter drawer (projects.html) --- */
  const filterToggle = document.querySelector('.mobile-filter-toggle');
  const filterSidebar = document.querySelector('.filter-sidebar');
  const filterClose   = document.querySelector('.filter-close');
  if (filterToggle && filterSidebar) {
    filterToggle.addEventListener('click', () => filterSidebar.classList.add('open'));
    filterClose?.addEventListener('click',  () => filterSidebar.classList.remove('open'));
  }

  /* --- Smooth scroll for anchor links --- */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

});
