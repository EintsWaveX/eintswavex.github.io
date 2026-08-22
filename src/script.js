/* Personal site behaviour: theme toggle, scroll reveal, nav border. */
(function () {
  'use strict';

  /* ---- theme ------------------------------------------------------------
     The inline script in <head> has already applied any stored preference,
     which avoids a flash of the wrong theme. This only handles the toggle.
     With no stored value the page follows the system setting, so the first
     click has to resolve what is actually on screen before flipping it.     */
  var root = document.documentElement;
  var btn = document.getElementById('theme');

  function current() {
    var set = root.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'dark' ? '#0b0b0d' : '#fbfbf9');
      try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
    });
  }

  /* ---- scroll reveal ----------------------------------------------------
     Everything carrying .r starts faded; IntersectionObserver adds .in once.
     If the API is missing, or the visitor prefers reduced motion, show all
     of it immediately rather than leaving the page blank.                   */
  var items = document.querySelectorAll('.r');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!('IntersectionObserver' in window) || still) {
    for (var i = 0; i < items.length; i++) items[i].classList.add('in');
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---- nav hairline -----------------------------------------------------
     The sticky bar is borderless over the hero and gains a hairline once the
     page scrolls, so it separates from content without boxing in the top.   */
  var nav = document.querySelector('.nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('stuck', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
}());
