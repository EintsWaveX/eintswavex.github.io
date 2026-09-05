/* =========================================================================
   Immanuel Aletheia, Personal Site Scripts
   Theme handling, smooth scroll, spotlight tracking, domain filtering,
   quick copy email, reveal choreography, and accessible case study modal.
   No em dashes and no en dashes used anywhere.
   ========================================================================= */

(function () {
  'use strict';

  var root = document.documentElement;
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Both are loaded from a CDN, so nothing below may assume they exist. */
  var M = window.Motion;
  var hasMotion = !prefersReducedMotion && M && typeof M.animate === 'function';
  var lenis = null;

  /* ---- 1. Theme Management ---- */
  var themeBtn = document.getElementById('theme');

  function getActiveTheme() {
    var stored = root.getAttribute('data-theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = getActiveTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', next === 'dark' ? '#05060f' : '#f6f8ff');
      }
      try {
        localStorage.setItem('theme', next);
      } catch (e) {
        /* LocalStorage unavailable in private mode */
      }
    });
  }

  /* ---- 2. Smooth Scrolling ----
     Lenis owns the scroll position, so in-page anchors have to go through
     it rather than through the browser. It is not started under reduced
     motion, and the CSS falls back to native scrolling when it is absent. */
  if (!prefersReducedMotion && typeof window.Lenis === 'function') {
    lenis = new window.Lenis({ duration: 1.05, smoothWheel: true });
    (function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    })(performance.now());

    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var id = link.getAttribute('href');
        if (!id || id === '#') return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        /* Clears the 68px sticky header so the heading is not hidden. */
        lenis.scrollTo(target, { offset: -76 });
      });
    });
  }

  /* ---- 3. Navigation & Mobile Menu ---- */
  var nav = document.querySelector('.nav');
  var menuBtn = document.getElementById('menu-btn');
  var navMenu = document.getElementById('nav-menu');

  function handleScroll() {
    if (nav) {
      var y = window.scrollY || window.pageYOffset;
      nav.classList.toggle('stuck', y > 12);
    }
  }
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  if (menuBtn && navMenu) {
    menuBtn.addEventListener('click', function () {
      var isOpen = navMenu.classList.toggle('open');
      menuBtn.classList.toggle('open', isOpen);
      menuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    navMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navMenu.classList.remove('open');
        menuBtn.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target)) {
        navMenu.classList.remove('open');
        menuBtn.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- 4. Spotlight Cursor Tracking ---- */
  if (!prefersReducedMotion) {
    var cards = document.querySelectorAll('.bento-card, .stack-group, .contact-box');
    cards.forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', x + 'px');
        card.style.setProperty('--mouse-y', y + 'px');
      });
      card.addEventListener('mouseleave', function () {
        card.style.setProperty('--mouse-x', '-999px');
        card.style.setProperty('--mouse-y', '-999px');
      });
    });
  }

  /* ---- 5. Domain Filtering ---- */
  var filterButtons = document.querySelectorAll('.filter-btn');
  var projectCards = document.querySelectorAll('.bento-card[data-domain]');
  var filterStatus = document.getElementById('filter-status');

  function countFor(domain) {
    var total = 0;
    projectCards.forEach(function (card) {
      var domains = (card.getAttribute('data-domain') || '').split(' ');
      if (domain === 'all' || domains.indexOf(domain) !== -1) total += 1;
    });
    return total;
  }

  /* Counts are derived from the cards themselves, so adding a project
     never means editing a number by hand. */
  filterButtons.forEach(function (btn) {
    var slot = btn.querySelector('.filter-count');
    if (slot) slot.textContent = '(' + countFor(btn.getAttribute('data-filter')) + ')';
  });

  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var selected = btn.getAttribute('data-filter');

      filterButtons.forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      projectCards.forEach(function (card) {
        var domains = (card.getAttribute('data-domain') || '').split(' ');
        if (selected === 'all' || domains.indexOf(selected) !== -1) {
          card.classList.remove('filtered-out');
        } else {
          card.classList.add('filtered-out');
        }
      });

      if (filterStatus) {
        var shown = countFor(selected);
        filterStatus.textContent = 'Showing ' + shown +
          (shown === 1 ? ' project' : ' projects') + ', ' + btn.textContent.trim() + '.';
      }
    });
  });

  /* ---- 6. Quick Copy Email with Toast Feedback ---- */
  var copyEmailBtn = document.getElementById('copy-email-btn');
  var toast = document.getElementById('toast');
  var toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 2800);
  }

  function fallbackCopyText(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }

  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', function () {
      var email = 'nue.immanuel@gmail.com';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(function () {
          showToast('Copied ' + email + ' to clipboard');
        }).catch(function () {
          fallbackCopyText(email);
          showToast('Copied ' + email + ' to clipboard');
        });
      } else {
        fallbackCopyText(email);
        showToast('Copied ' + email + ' to clipboard');
      }
    });
  }

  /* ---- 7. Project Case Study & Gallery Modal ---- */
  var projectGalleries = {
    ramces: {
      title: 'RAMCES v1.0.1 (PT Kereta Api Indonesia)',
      subtitle: 'Fleet & warehouse management across 16 regions and 273 rail locations',
      notes: [
        '<strong>Backend.</strong> FastAPI over PostgreSQL: 122 REST and WebSocket endpoints across a 22-table schema.',
        '<strong>Access control.</strong> JWT across five region-scoped roles, so a regional admin sees only their own territory while head office sees the whole network.',
        '<strong>Live updates.</strong> A WebSocket layer pushes register changes straight to open dashboards, with no refresh.',
        '<strong>Abuse control.</strong> A durable Postgres rate limiter with progressive CAPTCHA, so the limits survive a restart.',
        '<strong>Performance.</strong> Response-compression middleware cuts a 470 KB JavaScript and 383 KB HTML payload by roughly 8:1.',
        '<strong>Structure.</strong> Refactored from a single 5,900-line file into eleven domain modules under a no-cyclic-imports rule, checked by a validation script.',
        '<strong>Testing.</strong> Parity tests keep the Python and JavaScript filter implementations in agreement.',
        '<strong>Handover.</strong> Architecture and data-model references, a production runbook, a security note, a backup and restore procedure, and a 49-screenshot operator manual in Indonesian for the division staff.'
      ],
      items: [
        { src: './assets/shots/ramces-1.webp', cap: 'Readiness matrix: nationwide status of equipment across every regional division' },
        { src: './assets/shots/ramces-2.webp', cap: 'Asset register: 1,121 equipment records with real-time filters, export, and status tracking' },
        { src: './assets/shots/ramces-3.webp', cap: 'Inventory summary: spare-part valuation, turnover velocity, and 12-month consumption trend' },
        { src: './assets/shots/ramces-4.webp', cap: 'ABC-XYZ stock classification with EOQ, safety stock, and reorder point calculations' },
        { src: './assets/shots/ramces-5.webp', cap: 'Public QR landing card: instant equipment inspection record with no session required' },
        { src: './assets/shots/ramces-6.webp', cap: 'Dark mode interface: comprehensive token support across all administrative views' },
        { src: './assets/shots/ramces-7.webp', cap: 'Mobile layout: responsive KPI cards and navigation on smartphone displays' }
      ]
    },
    skynes: {
      title: 'SkyNES: NES Emulator in C++',
      subtitle: 'A 6502 CPU core verified byte-for-byte against the nestest golden trace',
      notes: [
        '<strong>Scope.</strong> The 6502 CPU, the PPU, and cartridge and mapper handling, written from scratch in C++.',
        '<strong>Verification.</strong> All 8,990 nestest instructions compared against the golden reference trace, register by register, flag by flag, and cycle by cycle.',
        '<strong>Status.</strong> The core logic runs end to end on the desktop test harness today. Hardware bring-up on the custom ESP32-S3 handheld, specifically the display wiring, is still in progress.'
      ],
      items: [
        { src: './assets/shots/skynes-1.webp', cap: 'Verification harness: all 8,990 CPU instructions matching the nestest golden reference trace' }
      ]
    },
    aqms: {
      title: 'Air Quality Monitoring Dashboard',
      subtitle: 'A five-channel environmental dashboard for Sindangkerta village',
      notes: [
        '<strong>Sensing.</strong> Five channels: PM2.5, PM10, O3, CO, and NO2.',
        '<strong>Path.</strong> The field ESP32 publishes into Firebase Realtime Database; the dashboard subscribes and renders for the community.',
        '<strong>Status.</strong> Deployed on Vercel and still publicly reachable. The field station is not currently pushing new readings, so the figures shown are the last stored values.'
      ],
      items: [
        { src: './assets/shots/aqms-1.webp', cap: 'Five sensor channels: PM2.5, PM10, O3, CO, NO2 live readings and health advisory' },
        { src: './assets/shots/aqms-2.webp', cap: 'Mobile responsive dashboard layout for community access on phones' }
      ]
    },
    iwss: {
      title: 'Intelligent Waste Sorting (TinyML)',
      subtitle: 'On-device CNN inference on ESP32-CAM with servo mechanical actuation',
      notes: [
        '<strong>Model.</strong> A custom lightweight CNN, INT8-quantized to TFLite Micro, running on the ESP32-CAM itself rather than off-device.',
        '<strong>Results.</strong> 85 to 89 percent accuracy across four input resolutions, reaching 91 percent on plastic and 96 percent on paper, at 10 to 150 ms per inference.',
        '<strong>Actuation.</strong> A servo-driven rotating platform sorts the item into its bin, with device state synced to a companion Android app at 50 to 150 ms latency.'
      ],
      items: [
        { src: './assets/shots/iwss-1.webp', cap: 'Live inference: real-time classification of plastic punnet at 99.2% confidence (16 ms)' },
        { src: './assets/shots/iwss-2.webp', cap: 'Stability analysis: per-class confidence tracking across 100 consecutive frames' },
        { src: './assets/shots/iwss-3.webp', cap: 'Companion Android app: device telemetry and inference threshold configuration' }
      ]
    }
  };

  var modalBackdrop = document.getElementById('project-modal');
  var modalTitle = document.getElementById('modal-title-text');
  var modalSubtitle = document.getElementById('modal-subtitle-text');
  var carouselImg = document.getElementById('carousel-image');
  var carouselCaption = document.getElementById('carousel-caption-text');
  var carouselThumbs = document.getElementById('carousel-thumbs-container');
  var prevBtn = document.getElementById('carousel-prev-btn');
  var nextBtn = document.getElementById('carousel-next-btn');
  var closeBtn = document.getElementById('modal-close-btn');
  var caseNotes = document.getElementById('case-notes');
  var modalHint = document.getElementById('modal-hint');

  var currentGallery = null;
  var currentIndex = 0;
  var lastFocusedElement = null;

  function renderGallerySlide(index) {
    if (!currentGallery || !currentGallery.items.length) return;
    if (index < 0) index = currentGallery.items.length - 1;
    if (index >= currentGallery.items.length) index = 0;
    currentIndex = index;

    var item = currentGallery.items[currentIndex];
    carouselImg.src = item.src;
    carouselImg.alt = item.cap;
    carouselCaption.textContent = (currentIndex + 1) + ' of ' + currentGallery.items.length + ': ' + item.cap;

    var thumbs = carouselThumbs.querySelectorAll('.thumb-item');
    thumbs.forEach(function (th, i) {
      th.classList.toggle('active', i === currentIndex);
    });
  }

  function openGallery(key) {
    var data = projectGalleries[key];
    if (!data) return;

    lastFocusedElement = document.activeElement;
    currentGallery = data;
    currentIndex = 0;

    modalTitle.textContent = data.title;
    modalSubtitle.textContent = data.subtitle;

    carouselThumbs.innerHTML = '';
    data.items.forEach(function (it, idx) {
      var th = document.createElement('div');
      th.className = 'thumb-item' + (idx === 0 ? ' active' : '');
      th.setAttribute('tabindex', '0');
      th.setAttribute('role', 'button');
      th.setAttribute('aria-label', 'View screenshot ' + (idx + 1));
      th.innerHTML = '<img src="' + it.src + '" alt="" loading="lazy">';
      th.addEventListener('click', function () { renderGallerySlide(idx); });
      th.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          renderGallerySlide(idx);
        }
      });
      carouselThumbs.appendChild(th);
    });

    if (caseNotes) {
      caseNotes.innerHTML = '';
      (data.notes || []).forEach(function (note) {
        var li = document.createElement('li');
        li.innerHTML = note;
        caseNotes.appendChild(li);
      });
      caseNotes.style.display = (data.notes && data.notes.length) ? 'grid' : 'none';
    }

    renderGallerySlide(0);

    var hasMultiple = data.items.length > 1;
    if (prevBtn) prevBtn.style.display = hasMultiple ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = hasMultiple ? 'flex' : 'none';
    if (carouselThumbs) carouselThumbs.style.display = hasMultiple ? 'flex' : 'none';

    if (modalHint) {
      modalHint.textContent = hasMultiple
        ? 'Click the screenshot to open it full size. Use the arrow keys to move through the gallery.'
        : 'Click the screenshot to open it full size.';
    }

    modalBackdrop.classList.add('open');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    /* Lenis drives its own scroll position and ignores body overflow. */
    if (lenis) lenis.stop();

    if (closeBtn) closeBtn.focus();
  }

  function closeGallery() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove('open');
    modalBackdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lenis) lenis.start();
    carouselImg.src = '';
    currentGallery = null;
    if (lastFocusedElement) lastFocusedElement.focus();
  }

  if (carouselImg) {
    carouselImg.addEventListener('click', function () {
      if (carouselImg.src) window.open(carouselImg.src, '_blank', 'noopener');
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function () { renderGallerySlide(currentIndex - 1); });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () { renderGallerySlide(currentIndex + 1); });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closeGallery);
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', function (e) {
      if (e.target === modalBackdrop) closeGallery();
    });
  }

  var FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function trapFocus(e) {
    var nodes = Array.prototype.filter.call(
      modalBackdrop.querySelectorAll(FOCUSABLE),
      function (el) { return el.offsetParent !== null; }
    );
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  window.addEventListener('keydown', function (e) {
    if (!modalBackdrop || !modalBackdrop.classList.contains('open')) return;
    if (e.key === 'Tab') {
      trapFocus(e);
    } else if (e.key === 'Escape') {
      closeGallery();
    } else if (e.key === 'ArrowLeft') {
      renderGallerySlide(currentIndex - 1);
    } else if (e.key === 'ArrowRight') {
      renderGallerySlide(currentIndex + 1);
    }
  });

  /* Gallery trigger buttons and clickable previews */
  var triggers = document.querySelectorAll('[data-open-gallery]');
  triggers.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var key = btn.getAttribute('data-open-gallery');
      openGallery(key);
    });
  });

  /* ---- 8. Reveal Choreography ----
     Motion is spent twice: the hero assembling on load, and the project
     grid arriving in sequence. Sections below that simply appear, because
     an identical fade on every one of them reads as noise. */

  var EASE = [0.16, 1, 0.3, 1];
  var RISE = ['translateY(18px)', 'translateY(0px)'];

  function show(el) {
    el.classList.add('is-visible');
  }

  function showAll() {
    document.querySelectorAll('.reveal').forEach(show);
  }

  if (!hasMotion) {
    /* No animation runtime, or the visitor asked for no motion. Either way
       the content must be on screen, not stranded at opacity 0. */
    showAll();
  } else {
    /* The headline is the largest element on the page, so it is never
       faded in: an LCP element animating up from opacity 0 does not count
       as painted until the fade ends, which measured as a 200ms to 944ms
       LCP regression. It rises on transform alone, which paints at once. */
    var heroTitle = document.querySelector('.hero h1');
    if (heroTitle) {
      M.animate(heroTitle, { transform: RISE }, { duration: 0.7, easing: EASE });
    }

    var heroItems = document.querySelectorAll('.hero .reveal');
    heroItems.forEach(show);
    M.animate(
      heroItems,
      { opacity: [0, 1], transform: RISE },
      { duration: 0.7, delay: M.stagger(0.08, { start: 0.08 }), easing: EASE }
    );

    M.inView('.flagship', function (info) {
      show(info.target);
      M.animate(info.target, { opacity: [0, 1], transform: RISE }, { duration: 0.7, easing: EASE });
    }, { amount: 0.08 });

    M.inView('.project-grid', function () {
      var cards = document.querySelectorAll('.project-grid .reveal');
      cards.forEach(show);
      M.animate(
        cards,
        { opacity: [0, 1], transform: RISE },
        { duration: 0.6, delay: M.stagger(0.07), easing: EASE }
      );
    }, { amount: 0.02 });

    /* Insurance. If any observer never fires, nothing stays invisible. */
    setTimeout(showAll, 3000);
  }

  /* Scroll-driven motion lives entirely in CSS (see star-drift in style.css),
     so there is no scroll listener here and nothing runs per frame. The
     aurora itself is deliberately fixed: the horizon is the reference the
     stars drift against. */

}());
