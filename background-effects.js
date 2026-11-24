/*!
 * Kesdig Anemia — background-effects.js
 * Latar global berbasis Canvas: partikel halus dan sel darah merah yang melayang,
 * ditambah parallax lembut mengikuti mouse (pointer presisi saja).
 * Berhenti saat tab tidak aktif, saat prefers-reduced-motion, dan saat animasi dekoratif dimatikan.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  var doc = document;
  var root = doc.documentElement;
  var canvas = doc.getElementById('ambient-canvas');
  var layer = doc.querySelector('.ambient');
  if (!canvas || !canvas.getContext || !layer) {
    return;
  }
  var ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var coarseQuery = window.matchMedia('(pointer: coarse)');
  var fineQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  var state = {
    width: 0,
    height: 0,
    dpr: 1,
    particles: [],
    cells: [],
    frame: 0,
    last: 0,
    sprite: null,
    dark: null,
    pointer: { x: 0, y: 0 },
    offset: { x: 0, y: 0 }
  };

  function isDark() {
    var forced = root.getAttribute('data-theme');
    return forced ? forced === 'dark' : darkQuery.matches;
  }

  function motionAllowed() {
    return !reduceQuery.matches && root.getAttribute('data-motion') !== 'off' && !doc.hidden;
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  /* Sprite sel darah merah digambar sekali lalu dipakai ulang (hemat CPU) */
  function buildSprite() {
    var size = 96;
    var sprite = doc.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    var g = sprite.getContext('2d');
    var c = size / 2;
    var body = g.createRadialGradient(c * 0.8, c * 0.7, 4, c, c, c * 0.95);
    body.addColorStop(0, '#ff8f8f');
    body.addColorStop(0.5, '#e8384f');
    body.addColorStop(0.9, '#b3123a');
    body.addColorStop(1, 'rgba(138, 15, 46, 0)');
    g.fillStyle = body;
    g.beginPath();
    g.arc(c, c, c * 0.95, 0, Math.PI * 2);
    g.fill();
    var dimple = g.createRadialGradient(c, c, 0, c, c, c * 0.5);
    dimple.addColorStop(0, 'rgba(159, 18, 57, 0.85)');
    dimple.addColorStop(1, 'rgba(232, 56, 79, 0)');
    g.fillStyle = dimple;
    g.beginPath();
    g.arc(c, c, c * 0.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(c, c, c * 0.72, Math.PI * 1.1, Math.PI * 1.45);
    g.stroke();
    return sprite;
  }

  function seed() {
    var small = state.width < 700 || coarseQuery.matches;
    var particleCount = small ? 14 : 36;
    var cellCount = small ? 3 : 7;
    state.particles = [];
    state.cells = [];
    for (var i = 0; i < particleCount; i += 1) {
      state.particles.push({
        x: random(0, state.width),
        y: random(0, state.height),
        r: random(0.8, 2.4),
        vx: random(-0.08, 0.08),
        vy: random(-0.22, -0.06),
        alpha: random(0.15, 0.45),
        depth: random(0.3, 1)
      });
    }
    for (var j = 0; j < cellCount; j += 1) {
      state.cells.push({
        x: random(0, state.width),
        y: random(0, state.height),
        size: random(26, small ? 46 : 64),
        vx: random(-0.12, 0.12),
        vy: random(-0.16, -0.05),
        angle: random(0, Math.PI * 2),
        spin: random(-0.004, 0.004),
        alpha: random(0.1, 0.22),
        depth: random(0.4, 1)
      });
    }
  }

  function resize() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var widthChanged = width !== state.width;
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    state.width = width;
    state.height = height;
    canvas.width = Math.round(width * state.dpr);
    canvas.height = Math.round(height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (widthChanged || !state.particles.length) {
      seed();
    }
    draw();
  }

  function wrap(item, margin) {
    if (item.y < -margin) {
      item.y = state.height + margin;
      item.x = random(0, state.width);
    }
    if (item.x < -margin) {
      item.x = state.width + margin;
    } else if (item.x > state.width + margin) {
      item.x = -margin;
    }
  }

  function update(delta) {
    state.offset.x += (state.pointer.x - state.offset.x) * 0.05;
    state.offset.y += (state.pointer.y - state.offset.y) * 0.05;
    state.particles.forEach(function (p) {
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      wrap(p, 10);
    });
    state.cells.forEach(function (cell) {
      cell.x += cell.vx * delta;
      cell.y += cell.vy * delta;
      cell.angle += cell.spin * delta;
      wrap(cell, cell.size);
    });
    var ax = state.offset.x.toFixed(3);
    var ay = state.offset.y.toFixed(3);
    if (ax !== state.cssX || ay !== state.cssY) {
      state.cssX = ax;
      state.cssY = ay;
      layer.style.setProperty('--ax', ax);
      layer.style.setProperty('--ay', ay);
    }
  }

  function draw() {
    var dark = isDark();
    if (dark !== state.dark || !state.sprite) {
      state.dark = dark;
      state.sprite = buildSprite();
    }
    ctx.clearRect(0, 0, state.width, state.height);
    var particleColor = dark ? '94, 234, 212' : '13, 148, 136';
    state.particles.forEach(function (p) {
      var x = p.x + state.offset.x * 14 * p.depth;
      var y = p.y + state.offset.y * 10 * p.depth;
      ctx.fillStyle = 'rgba(' + particleColor + ', ' + (p.alpha * (dark ? 0.9 : 0.7)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    state.cells.forEach(function (cell) {
      var x = cell.x + state.offset.x * 26 * cell.depth;
      var y = cell.y + state.offset.y * 18 * cell.depth;
      ctx.save();
      ctx.globalAlpha = cell.alpha * (dark ? 0.8 : 1);
      ctx.translate(x, y);
      ctx.rotate(cell.angle);
      ctx.scale(1, 0.92);
      ctx.drawImage(state.sprite, -cell.size / 2, -cell.size / 2, cell.size, cell.size);
      ctx.restore();
    });
  }

  function loop(time) {
    var delta = state.last ? Math.min(time - state.last, 64) / 16.67 : 1;
    state.last = time;
    update(delta);
    draw();
    state.frame = window.requestAnimationFrame(loop);
  }

  function start() {
    if (state.frame || !motionAllowed()) {
      return;
    }
    state.last = 0;
    state.frame = window.requestAnimationFrame(loop);
  }

  function stop() {
    if (state.frame) {
      window.cancelAnimationFrame(state.frame);
      state.frame = 0;
    }
  }

  function sync() {
    if (motionAllowed()) {
      start();
    } else {
      stop();
      draw();
    }
  }

  window.addEventListener('resize', (function () {
    var timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(resize, 150);
    };
  }()));

  doc.addEventListener('visibilitychange', sync);
  doc.addEventListener('kesdig:motion', sync);
  if (reduceQuery.addEventListener) {
    reduceQuery.addEventListener('change', sync);
    darkQuery.addEventListener('change', draw);
  }
  new MutationObserver(function () {
    draw();
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  if (fineQuery.matches) {
    window.addEventListener('pointermove', function (event) {
      if (!motionAllowed()) {
        return;
      }
      state.pointer.x = (event.clientX / state.width - 0.5) * 2;
      state.pointer.y = (event.clientY / state.height - 0.5) * 2;
    }, { passive: true });
  }

  resize();
  sync();
}());
