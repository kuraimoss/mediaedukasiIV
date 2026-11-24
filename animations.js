/*!
 * Kesdig Anemia — animations.js
 * Interaksi animasi: kontrol animasi dekoratif, indikator navigasi, tilt 3D,
 * ripple, parallax hero, ekspansi pertanyaan kondisional, dan stagger hasil.
 * Tidak menyimpan apa pun; semua listener dipasang sekali saja.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  var doc = document;
  var root = doc.documentElement;
  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fineQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  var TILT_SELECTOR = '.stat-card, .info-card, .prevent-card, .type-card, .highlight-card, .member-card, .food-card, .when-card, .symptom-card';

  function motionAllowed() {
    return !reduceQuery.matches && root.getAttribute('data-motion') !== 'off';
  }

  function $(selector, context) {
    return (context || doc).querySelector(selector);
  }

  function $$(selector, context) {
    return Array.prototype.slice.call((context || doc).querySelectorAll(selector));
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  function emitMotionChange() {
    doc.dispatchEvent(new CustomEvent('kesdig:motion'));
  }

  /* ----- Kontrol animasi dekoratif (hanya untuk sesi ini) -------------- */
  function initMotionToggle() {
    var button = $('#motion-toggle');
    if (!button) {
      return;
    }
    function sync() {
      button.setAttribute('aria-pressed', String(root.getAttribute('data-motion') === 'off'));
    }
    button.addEventListener('click', function () {
      if (root.getAttribute('data-motion') === 'off') {
        root.removeAttribute('data-motion');
      } else {
        root.setAttribute('data-motion', 'off');
      }
      sync();
      emitMotionChange();
    });
    if (reduceQuery.addEventListener) {
      reduceQuery.addEventListener('change', emitMotionChange);
    }
    sync();
  }

  /* ----- Indikator navigasi yang bergeser ------------------------------- */
  function initNavIndicator() {
    var nav = $('#site-nav');
    var bar = $('.nav-indicator');
    if (!nav || !bar) {
      return;
    }
    var desktop = window.matchMedia('(min-width: 960px)');
    function update() {
      var link = nav.querySelector('.nav-link[aria-current="page"]');
      if (!desktop.matches || !link) {
        bar.classList.remove('is-ready');
        return;
      }
      var navBox = nav.getBoundingClientRect();
      var box = link.getBoundingClientRect();
      var pad = parseFloat(window.getComputedStyle(link).paddingLeft) || 14;
      bar.style.setProperty('--ni-x', Math.round(box.left - navBox.left + pad) + 'px');
      bar.style.setProperty('--ni-w', Math.max(0, Math.round(box.width - pad * 2)) + 'px');
      bar.classList.add('is-ready');
      root.classList.add('has-nav-indicator');
    }
    new MutationObserver(update).observe(nav, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
    window.addEventListener('resize', debounce(update, 120));
    if (doc.fonts && doc.fonts.ready) {
      doc.fonts.ready.then(update);
    }
    update();
  }

  /* ----- Tilt 3D halus (desktop dengan pointer presisi) ----------------- */
  function initTilt() {
    if (!fineQuery.matches) {
      return;
    }
    root.classList.add('tilt-enabled');
    var active = null;
    var pending = 0;
    var lastEvent = null;
    function reset(card) {
      card.classList.remove('is-tilting');
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    }
    function apply() {
      pending = 0;
      var target = lastEvent && lastEvent.target;
      var card = motionAllowed() && target && target.closest ? target.closest(TILT_SELECTOR) : null;
      if (card !== active) {
        if (active) {
          reset(active);
        }
        active = card;
        if (card) {
          card.classList.add('is-tilting');
        }
      }
      if (!card) {
        return;
      }
      var rect = card.getBoundingClientRect();
      var px = (lastEvent.clientX - rect.left) / rect.width - 0.5;
      var py = (lastEvent.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty('--ry', (px * 7).toFixed(2) + 'deg');
      card.style.setProperty('--rx', (-py * 7).toFixed(2) + 'deg');
    }
    doc.addEventListener('pointermove', function (event) {
      lastEvent = event;
      if (!pending) {
        pending = window.requestAnimationFrame(apply);
      }
    }, { passive: true });
    doc.addEventListener('mouseout', function (event) {
      if (!event.relatedTarget && active) {
        reset(active);
        active = null;
      }
    });
  }

  /* Hilangkan jeda stagger setelah kartu muncul agar hover tetap responsif */
  function initStaggerDone() {
    if (!('IntersectionObserver' in window)) {
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        io.unobserve(entry.target);
        var group = entry.target;
        setTimeout(function () {
          group.classList.add('stagger-done');
        }, group.children.length * 80 + 800);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('[data-stagger]').forEach(function (group) {
      io.observe(group);
    });
  }

  /* ----- Ripple pada tombol dan kartu pilihan --------------------------- */
  function initRipple() {
    doc.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || !motionAllowed() || !event.target.closest) {
        return;
      }
      var host = event.target.closest('.btn, .icon-btn, .choice, .chip');
      if (!host) {
        return;
      }
      var surface = host;
      if (host.classList.contains('choice')) {
        surface = host.querySelector('.choice-body');
      } else if (host.classList.contains('chip')) {
        surface = host.querySelector(':scope > span');
      }
      if (!surface) {
        return;
      }
      var rect = surface.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 2.2;
      var dot = doc.createElement('i');
      dot.className = 'ripple';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.setProperty('width', size + 'px');
      dot.style.setProperty('height', size + 'px');
      dot.style.setProperty('left', (event.clientX - rect.left - size / 2) + 'px');
      dot.style.setProperty('top', (event.clientY - rect.top - size / 2) + 'px');
      surface.appendChild(dot);
      var remove = function () {
        if (dot.parentNode) {
          dot.parentNode.removeChild(dot);
        }
      };
      dot.addEventListener('animationend', remove);
      setTimeout(remove, 1000);
    }, { passive: true });
  }

  /* ----- Parallax hero mengikuti mouse (loop berhenti saat diam) -------- */
  function initHeroParallax() {
    var hero = $('.hero');
    if (!hero || !fineQuery.matches) {
      return;
    }
    var target = { x: 0, y: 0 };
    var current = { x: 0, y: 0 };
    var frame = 0;
    function step() {
      current.x += (target.x - current.x) * 0.12;
      current.y += (target.y - current.y) * 0.12;
      hero.style.setProperty('--hx', current.x.toFixed(3));
      hero.style.setProperty('--hy', current.y.toFixed(3));
      if (Math.abs(target.x - current.x) > 0.002 || Math.abs(target.y - current.y) > 0.002) {
        frame = window.requestAnimationFrame(step);
      } else {
        frame = 0;
      }
    }
    function kick() {
      if (!frame) {
        frame = window.requestAnimationFrame(step);
      }
    }
    hero.addEventListener('pointermove', function (event) {
      if (!motionAllowed()) {
        return;
      }
      var rect = hero.getBoundingClientRect();
      target.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      target.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      kick();
    }, { passive: true });
    hero.addEventListener('pointerleave', function () {
      target.x = 0;
      target.y = 0;
      kick();
    });
    doc.addEventListener('kesdig:motion', function () {
      if (!motionAllowed()) {
        target.x = 0;
        target.y = 0;
        kick();
      }
    });
  }

  /* ----- Animasi SVG oksigen: jeda bila gerak dikurangi/dimatikan ------- */
  function initSvgAnimations() {
    var svgs = $$('.o2-anim-art').filter(function (svg) {
      return typeof svg.pauseAnimations === 'function';
    });
    if (!svgs.length) {
      return;
    }
    var visible = false;
    function sync() {
      svgs.forEach(function (svg) {
        if (motionAllowed() && visible) {
          svg.unpauseAnimations();
        } else {
          svg.pauseAnimations();
        }
      });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries.some(function (entry) {
          return entry.isIntersecting;
        });
        sync();
      }).observe(svgs[0]);
    } else {
      visible = true;
    }
    doc.addEventListener('kesdig:motion', sync);
    sync();
  }

  /* ----- API kecil yang dipakai script.js ------------------------------- */
  function expand(node) {
    if (!node || typeof node.animate !== 'function' || reduceQuery.matches) {
      return;
    }
    var height = node.scrollHeight;
    if (!height) {
      return;
    }
    node.style.setProperty('overflow', 'hidden');
    var animation = node.animate([
      { height: '0px', opacity: 0, transform: 'translateY(-6px)' },
      { height: height + 'px', opacity: 1, transform: 'none' }
    ], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    animation.onfinish = function () {
      node.style.removeProperty('overflow');
    };
  }

  function replay(node, className) {
    if (!node) {
      return;
    }
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
  }

  function stagger(container) {
    if (!container) {
      return;
    }
    Array.prototype.forEach.call(container.children, function (child, index) {
      child.style.setProperty('--i', String(index));
    });
    replay(container, 'motion-stagger');
  }

  function pop(node) {
    replay(node, 'is-pop');
  }

  window.KesdigMotion = {
    allowed: motionAllowed,
    expand: expand,
    stagger: stagger,
    pop: pop
  };

  function start() {
    initMotionToggle();
    initNavIndicator();
    initTilt();
    initStaggerDone();
    initRipple();
    initHeroParallax();
    initSvgAnimations();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
