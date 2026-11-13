window.AudioEngine = (function () {
  'use strict';
  let ctx = null, master = null, noiseBuf = null, enabled = true, volume = 0.6, typing = false, lastKey = 0, hintEl = null, pendingBoot = false;
  function ensure() {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination); }
    if (ctx.state === 'suspended') ctx.resume().then(() => { if (hintEl) hintEl.classList.add('hidden'); if (pendingBoot) { pendingBoot = false; play('boot'); } }).catch(() => {});
    return ctx;
  }
  function configure(o) { enabled = !!o.enabled; volume = Math.max(0, Math.min(1, Number(o.volume) || 0)); typing = !!o.typing; if (master) master.gain.value = volume; }
  function tone(o) {
    const now = ctx.currentTime + (o.delay || 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(Math.max(1, o.f), now);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), now + o.t);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g), now + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, now + o.t + (o.r || 0.08));
    osc.connect(g); g.connect(master); osc.start(now); osc.stop(now + o.t + (o.r || 0.08) + 0.05);
  }
  function noise(o) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const now = ctx.currentTime + (o.delay || 0), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; f.type = o.type || 'bandpass'; f.frequency.value = o.f || 800;
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g), now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + o.t);
    src.connect(f); f.connect(g); g.connect(master); src.start(now); src.stop(now + o.t + 0.05);
  }
  function play(name) {
    if (!enabled) return; const c = ensure(); if (!c) return;
    if (c.state !== 'running') { if (name === 'boot') pendingBoot = true; if (hintEl) hintEl.classList.remove('hidden'); return; }
    if (hintEl) hintEl.classList.add('hidden'); if (master) master.gain.value = volume;
    if (name === 'boot') { tone({ f: 36, f2: 90, t: 2, g: 0.45, r: 0.6 }); tone({ f: 55, f2: 110, type: 'triangle', t: 1.6, g: 0.16, delay: 0.15 }); noise({ f: 240, type: 'lowpass', t: 1.8, g: 0.1 }); }
    else if (name === 'startup') { [220, 277, 330, 440, 554].forEach((f, i) => tone({ f, type: 'triangle', t: 1.1, g: 0.1, delay: i * 0.09 })); noise({ f: 3200, type: 'highpass', t: 1.2, g: 0.035 }); }
    else if (name === 'confirm') { tone({ f: 660, f2: 990, t: 0.12, g: 0.13 }); tone({ f: 1320, t: 0.14, g: 0.09, delay: 0.09 }); }
    else if (name === 'alert') { tone({ f: 880, f2: 440, type: 'sawtooth', t: 0.3, g: 0.16 }); tone({ f: 660, f2: 330, type: 'sawtooth', t: 0.3, g: 0.12, delay: 0.12 }); }
    else if (name === 'warning') { tone({ f: 600, t: 0.09, g: 0.12 }); tone({ f: 600, t: 0.09, g: 0.12, delay: 0.14 }); }
    else if (name === 'scan') { noise({ f: 1800, t: 0.12, g: 0.06 }); tone({ f: 440, f2: 880, t: 0.1, g: 0.06 }); }
    else if (name === 'key') { if (!typing) return; const n = performance.now(); if (n - lastKey < 45) return; lastKey = n; tone({ f: 1700 + Math.random() * 500, type: 'square', t: 0.02, g: 0.02, r: 0.02 }); }
  }
  function init(el) { hintEl = el || null; document.addEventListener('pointerdown', () => ensure()); document.addEventListener('keydown', () => ensure()); }
  return { init, configure, play, ensure };
})();