/* Personal site behaviour: theme, scroll reveal, parallax, nav hairline.
   Every effect is skipped when the visitor prefers reduced motion, and the
   page is fully readable with JavaScript disabled. */
(function () {
  'use strict';

  var root = document.documentElement;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- theme -----------------------------------------------------------
     The inline script in <head> applies any stored choice before paint, so
     there is no flash. With nothing stored the page follows the system, so
     the first click has to resolve what is actually on screen before it
     flips, otherwise the button appears to do nothing.                     */
  var btn = document.getElementById('theme');

  function current() {
    var set = root.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'dark' ? '#07080b' : '#fbfbf9');
      try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
    });
  }

  /* ---- scroll reveal --------------------------------------------------- */
  var items = document.querySelectorAll('.r');
  if (!('IntersectionObserver' in window) || still) {
    for (var i = 0; i < items.length; i++) items[i].classList.add('in');
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.05 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---- parallax --------------------------------------------------------
     One rAF-throttled scroll handler drives every parallax layer. Reading
     scrollY once per frame and writing transforms afterwards keeps this off
     the layout path; per-element scroll listeners would thrash it.         */
  var layers = [].slice.call(document.querySelectorAll('[data-par]'));
  var nav = document.querySelector('.nav');
  var ticking = false;

  function frame() {
    var y = window.scrollY || window.pageYOffset;
    if (nav) nav.classList.toggle('stuck', y > 8);
    if (!still) {
      for (var i = 0; i < layers.length; i++) {
        var el = layers[i];
        var k = parseFloat(el.getAttribute('data-par')) || 0;
        el.style.transform = 'translate3d(0,' + (y * k).toFixed(2) + 'px,0)';
      }
    }
    ticking = false;
  }

  function onScroll() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(frame); }
  }

  frame();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
}());
