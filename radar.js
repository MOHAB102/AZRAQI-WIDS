window.Radar = (function () {
  'use strict';
  let canvas = null, networks = [], selected = null, speed = 1, motion = 'full', sweep = 0, particles = [], particleCount = 40, onSelect = null;
  function cssVar(n, d) { const v = getComputedStyle(document.body).getPropertyValue(n).trim(); return v || d; }
  function rgba(c, a) {
    c = String(c || '').trim(); let m = /^#?([0-9a-f]{6})$/i.exec(c);
    if (!m) { const s3 = /^#([0-9a-f]{3})$/i.exec(c); if (s3) m = [null, s3[1].split('').map(ch => ch + ch).join('')]; }
    if (m) { const x = parseInt(m[1], 16); return 'rgba(' + ((x >> 16) & 255) + ',' + ((x >> 8) & 255) + ',' + (x & 255) + ',' + a + ')'; }
    const r = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
    if (r) return 'rgba(' + r[1] + ',' + r[2] + ',' + r[3] + ',' + a + ')';
    return 'rgba(0,229,255,' + a + ')';
  }
  function fit() {
    const r = canvas.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return null;
    const d = Math.min(2, window.devicePixelRatio || 1), w = Math.round(r.width), h = Math.round(r.height);
    if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) { canvas.width = Math.round(w * d); canvas.height = Math.round(h * d); }
    const x = canvas.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return { x, w, h };
  }
  // توزيع منتظم: خلط جيد للبتات (MACs المتتالية كانت تعطي زوايا متقاربة فتتكدس النقاط)
  function hash32(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0; h ^= h >>> 16; return h >>> 0; }
  function hashAngle(bssid) { return (hash32(String(bssid || '')) % 3600) / 3600 * Math.PI * 2; }
  function hashJitter(bssid) { return (hash32('r' + String(bssid || '')) % 1000) / 1000; }
  function init(c, opts) {
    canvas = c; onSelect = opts && opts.onSelect;
    canvas.addEventListener('click', function (e) {
      const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = 18;
      networks.forEach(n => { if (n._x === undefined) return; const d = Math.hypot(n._x - mx, n._y - my); if (d < bd) { bd = d; best = n; } });
      if (best && onSelect) onSelect(best.bssid);
    });
  }
  function setNetworks(list) { networks = Array.isArray(list) ? list : []; }
  function setSelected(b) { selected = b; }
  function setSpeed(v) { speed = Number(v) || 0; }
  function setParticles(n) { particleCount = Math.max(0, Number(n) || 0); }
  function setMotion(m) { motion = m; }
  function draw(dt) {
    if (!canvas) return;
    const f = fit(); if (!f) return;
    const x = f.x, w = f.w, h = f.h, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 16, ac = cssVar('--cyan', '#00e5ff');
    if (motion !== 'off') sweep += dt * 1.4 * speed * (motion === 'reduced' ? 0.5 : 1);
    x.clearRect(0, 0, w, h);
    if (motion !== 'off') {
      if (particles.length < particleCount && Math.random() < 0.3) particles.push({ x: Math.random() * w, y: Math.random() * h, life: 1 });
      particles.forEach(p => p.life -= dt * 0.2); particles = particles.filter(p => p.life > 0);
    } else particles = [];
    particles.forEach(p => { x.fillStyle = rgba(ac, p.life * 0.25); x.beginPath(); x.arc(p.x, p.y, 1, 0, Math.PI * 2); x.fill(); });
    x.strokeStyle = rgba(ac, 0.2); x.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(k => { x.beginPath(); x.arc(cx, cy, R * k, 0, Math.PI * 2); x.stroke(); });
    x.strokeStyle = rgba(ac, 0.1); x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
    if (x.createConicGradient) { const g = x.createConicGradient(sweep, cx, cy); g.addColorStop(0, rgba(ac, 0.35)); g.addColorStop(0.12, rgba(ac, 0)); g.addColorStop(1, rgba(ac, 0)); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill(); }
    x.strokeStyle = rgba(ac, 0.8); x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); x.stroke();
    const colors = { green: cssVar('--green', '#3dff8b'), yellow: cssVar('--amber', '#ff9d42'), red: cssVar('--red', '#ff3864'), unknown: cssVar('--muted', '#7e93b8') };
    const glow = parseFloat(getComputedStyle(document.body).getPropertyValue('--glow')) || 0.7;
    const now = performance.now();
    // مقياس تكيّفي: إذا كانت قيم RSSI خارج النطاق المعتاد أو متقاربة جدًا (فتتكدس النقاط في المنتصف)
    // نوزّعها نسبيًا بين أضعف وأقوى إشارة موجودة
    const vals = networks.map(n => (n.rssi === null || n.rssi === undefined || n.rssi === '') ? NaN : Number(n.rssi)).filter(v => !isNaN(v));
    const vMin = vals.length ? Math.min.apply(null, vals) : 0, vMax = vals.length ? Math.max.apply(null, vals) : 0;
    const absOk = vals.length > 0 && vMin >= -100 && vMax <= -20 && (vMax - vMin) >= 15;
    const lo = vMin - 2, span = Math.max(8, vMax - vMin + 4);
    networks.forEach(n => { try {
      const rssi = (n.rssi === null || n.rssi === undefined || n.rssi === '') ? NaN : Number(n.rssi);
      // بدون RSSI: نضع النقطة في حلقة وسطى بنصف قطر موزّع حتى لا تتراكم فوق بعضها
      let dist = isNaN(rssi) ? 0.2 + 0.3 * hashJitter(n.bssid) : (absOk ? Math.max(0, Math.min(1, (rssi + 90) / 60)) : Math.max(0, Math.min(1, (rssi - lo) / span)));
      dist = Math.max(0, Math.min(1, dist + (hashJitter(n.bssid) - 0.5) * 0.08));   // فصل بسيط للنقاط المتساوية
      const r = (1 - dist) * R * 0.8 + R * 0.12, angle = hashAngle(n.bssid);
      const px = cx + Math.cos(angle) * r, py = cy + Math.sin(angle) * r; n._x = px; n._y = py;
      const col = colors[n.status] || colors.unknown, pulse = n.status === 'red' ? (0.6 + 0.4 * Math.sin(now / 200)) : 1;
      x.fillStyle = rgba(col, 0.9 * pulse); x.shadowColor = col; x.shadowBlur = 10 * glow;
      x.beginPath(); x.arc(px, py, n.bssid === selected ? 5 : 3.5, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0;
      if (n.status !== 'green') { x.strokeStyle = rgba(col, 0.4 * pulse); x.beginPath(); x.arc(px, py, 6 + (1 - pulse) * 8, 0, Math.PI * 2); x.stroke(); }
      if (n.bssid === selected) { x.strokeStyle = rgba(ac, 0.8); x.lineWidth = 1; x.beginPath(); x.arc(px, py, 9, 0, Math.PI * 2); x.stroke(); x.fillStyle = rgba('#dcebff', 0.9); x.font = '10px ' + cssVar('--font', 'sans-serif'); x.fillText(String(n.ssid || n.bssid), px + 11, py - 6); }
    } catch (err) { /* نقطة واحدة معطوبة لا توقف الرادار */ } });
    x.fillStyle = ac; x.beginPath(); x.arc(cx, cy, 3, 0, Math.PI * 2); x.fill();
  }
  return { init, setNetworks, setSelected, setSpeed, setParticles, setMotion, draw };
})();