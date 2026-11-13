window.Globe = (function () {
  'use strict';
  let canvas = null, speed = 1, particleCount = 40, motion = 'full', rot = 0, activity = 0, particles = [];
  const CONTINENTS = [
    [[-168,66],[-140,70],[-120,72],[-95,72],[-80,62],[-65,48],[-70,42],[-80,32],[-97,26],[-105,20],[-110,24],[-120,34],[-125,42],[-130,55],[-150,60]],
    [[-80,8],[-70,10],[-60,5],[-50,0],[-40,-5],[-38,-15],[-48,-25],[-58,-35],[-65,-45],[-70,-52],[-72,-45],[-70,-30],[-70,-18],[-78,-5]],
    [[-10,36],[0,44],[10,45],[20,40],[30,45],[40,50],[45,60],[30,70],[15,68],[5,60],[-5,50],[-10,44]],
    [[-17,15],[-5,35],[10,37],[30,31],[43,12],[51,11],[40,-5],[35,-20],[25,-34],[18,-35],[12,-18],[8,4],[-8,5]],
    [[40,50],[60,55],[80,70],[100,75],[120,70],[140,60],[150,55],[140,45],[130,35],[120,25],[105,15],[95,10],[80,8],[70,20],[60,25],[50,30],[40,40]],
    [[115,-20],[125,-15],[135,-12],[145,-15],[150,-25],[145,-38],[135,-35],[125,-32],[115,-25]]
  ];
  const CITIES = [[44.2,15.4,'صنعاء'],[46.7,24.7,'الرياض'],[31.2,30,'القاهرة'],[2.35,48.85,'باريس'],[-74,40.7,'نيويورك'],[139.7,35.7,'طوكيو'],[103.8,1.35,'سنغافورة'],[55.3,25.2,'دبي']];
  function cssVar(n, d) { const v = getComputedStyle(document.body).getPropertyValue(n).trim(); return v || d; }
  function rgba(hex, a) { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return 'rgba(0,229,255,' + a + ')'; const x = parseInt(m[1], 16); return 'rgba(' + ((x >> 16) & 255) + ',' + ((x >> 8) & 255) + ',' + (x & 255) + ',' + a + ')'; }
  function fit() {
    const r = canvas.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return null;
    const d = Math.min(2, window.devicePixelRatio || 1), w = Math.round(r.width), h = Math.round(r.height);
    if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) { canvas.width = Math.round(w * d); canvas.height = Math.round(h * d); }
    const x = canvas.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return { x, w, h };
  }
  function init(c) { canvas = c; }
  function setSpeed(v) { speed = Number(v) || 0; }
  function setParticles(n) { particleCount = Math.max(0, Number(n) || 0); }
  function setMotion(m) { motion = m; }
  function setActivity(v) { activity = Math.max(0, Math.min(1, Number(v) || 0)); }
  function draw(dt) {
    if (!canvas) return;
    const f = fit(); if (!f) return;
    const x = f.x, w = f.w, h = f.h, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 14;
    const ac = cssVar('--cyan', '#00e5ff'), vi = cssVar('--violet', '#8b5cff');
    if (motion !== 'off') rot += dt * 0.25 * speed * (motion === 'reduced' ? 0.5 : 1);
    x.clearRect(0, 0, w, h);
    if (motion !== 'off') {
      if (particles.length < particleCount && Math.random() < 0.4) particles.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 1 });
      particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.15; });
      particles = particles.filter(p => p.life > 0 && p.x > -10 && p.x < w + 10 && p.y > -10 && p.y < h + 10);
    } else particles = [];
    particles.forEach(p => { x.fillStyle = rgba(ac, p.life * 0.25); x.beginPath(); x.arc(p.x, p.y, 1, 0, Math.PI * 2); x.fill(); });
    const atm = x.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.25);
    atm.addColorStop(0, rgba(ac, 0.12 + activity * 0.1)); atm.addColorStop(0.7, rgba(vi, 0.06)); atm.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = atm; x.beginPath(); x.arc(cx, cy, R * 1.25, 0, Math.PI * 2); x.fill();
    const ocean = x.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    ocean.addColorStop(0, rgba(ac, 0.22)); ocean.addColorStop(0.5, 'rgba(6,20,40,.95)'); ocean.addColorStop(1, 'rgba(2,6,15,1)');
    x.fillStyle = ocean; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    function proj(lon, lat) { const la = lat * Math.PI / 180, lo = lon * Math.PI / 180 + rot; const X = Math.cos(la) * Math.sin(lo), Y = Math.sin(la), Z = Math.cos(la) * Math.cos(lo); return { sx: cx + X * R, sy: cy - Y * R, z: Z }; }
    x.save(); x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.clip();
    x.strokeStyle = rgba(ac, 0.10); x.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) { x.beginPath(); let started = false; for (let lon = -180; lon <= 180; lon += 4) { const p = proj(lon, lat); if (p.z > 0) { if (!started) { x.moveTo(p.sx, p.sy); started = true; } else x.lineTo(p.sx, p.sy); } else started = false; } x.stroke(); }
    for (let lon = -180; lon < 180; lon += 30) { x.beginPath(); let started = false; for (let lat = -80; lat <= 80; lat += 4) { const p = proj(lon, lat); if (p.z > 0) { if (!started) { x.moveTo(p.sx, p.sy); started = true; } else x.lineTo(p.sx, p.sy); } else started = false; } x.stroke(); }
    CONTINENTS.forEach(cont => { x.beginPath(); let started = false; cont.forEach(pt => { const p = proj(pt[0], pt[1]); if (p.z > 0) { if (!started) { x.moveTo(p.sx, p.sy); started = true; } else x.lineTo(p.sx, p.sy); } else started = false; }); if (started) { x.closePath(); const g = x.createLinearGradient(cx - R, cy - R, cx + R, cy + R); g.addColorStop(0, rgba(ac, 0.5)); g.addColorStop(1, rgba(vi, 0.4)); x.fillStyle = g; x.fill(); x.strokeStyle = rgba(ac, 0.6); x.lineWidth = 1; x.stroke(); } });
    const now = performance.now();
    CITIES.forEach((c, i) => { const p = proj(c[0], c[1]); if (p.z > 0) { const pulse = 0.5 + 0.5 * Math.sin(now / 500 + i); x.fillStyle = rgba(ac, 0.8 * pulse + 0.2); x.beginPath(); x.arc(p.sx, p.sy, 2.2, 0, Math.PI * 2); x.fill(); x.strokeStyle = rgba(ac, 0.3 * pulse); x.beginPath(); x.arc(p.sx, p.sy, 4 + 3 * pulse, 0, Math.PI * 2); x.stroke(); if (p.z > 0.5) { x.fillStyle = rgba('#dcebff', 0.7); x.font = '9px ' + cssVar('--font', 'sans-serif'); x.fillText(c[2], p.sx + 5, p.sy - 5); } } });
    for (let i = 0; i < 4; i++) { const a = CITIES[i], b = CITIES[(i + 3) % CITIES.length]; const pa = proj(a[0], a[1]), pb = proj(b[0], b[1]); if (pa.z > 0 && pb.z > 0) { const mx = (pa.sx + pb.sx) / 2, my = (pa.sy + pb.sy) / 2 - R * 0.3; x.strokeStyle = rgba(vi, 0.35 + activity * 0.3); x.lineWidth = 1; x.beginPath(); x.moveTo(pa.sx, pa.sy); x.quadraticCurveTo(mx, my, pb.sx, pb.sy); x.stroke(); const tt = (now / (1800 - activity * 800) + i * 0.25) % 1; const qx = (1 - tt) * (1 - tt) * pa.sx + 2 * (1 - tt) * tt * mx + tt * tt * pb.sx, qy = (1 - tt) * (1 - tt) * pa.sy + 2 * (1 - tt) * tt * my + tt * tt * pb.sy; x.fillStyle = rgba(ac, 0.9); x.beginPath(); x.arc(qx, qy, 1.8, 0, Math.PI * 2); x.fill(); } }
    x.restore();
    const rim = x.createRadialGradient(cx, cy, R * 0.85, cx, cy, R); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, rgba(ac, 0.35)); x.fillStyle = rim; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    const hl = x.createRadialGradient(cx - R * 0.4, cy - R * 0.4, 0, cx - R * 0.4, cy - R * 0.4, R * 0.7); hl.addColorStop(0, 'rgba(255,255,255,.10)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = hl; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
  }
  return { init, setSpeed, setParticles, setMotion, setActivity, draw };
})();