(function () {
  'use strict';
  const api = window.commandCenter;
  const $ = id => document.getElementById(id);
  const $$ = s => Array.from(document.querySelectorAll(s));
  if (!api) { document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#dcebff;font-family:sans-serif">افتح التطبيق عبر الأمر npm start داخل Electron</div>'; return; }

  const DEFAULT_SETTINGS = { theme: 'cyber', motion: 'full', language: 'ar', sound: true, volume: 0.6, typingSound: false, kismetUrl: 'http://localhost:2501', kismetApiKey: '', scanInterval: 5, sensitivity: 5, shell: 'default', fullscreen: false };
  const VISUAL_DEFAULTS = { glow: 70, globeSpeed: 1, radarSpeed: 1, particles: 40 };
  const state = { settings: Object.assign({}, DEFAULT_SETTINGS), visual: Object.assign({}, VISUAL_DEFAULTS), lang: 'ar', snapshot: null, networks: [], deviceMap: new Map(), devices: [], deviceBaselineDone: false, trusted: new Set(), events: [], feed: [], activePage: 'dashboard', netFilter: 'all', netSort: { key: 'rssi', dir: -1 }, secFilter: 'all', unseen: 0, selectedBssid: null, adapters: [], wifiInfo: null, booted: false, backendRunning: false, sourceOk: false, activity: [], lastTs: 0, raf: 0, bootTimer: 0, deviceScanBusy: false, lastDeviceScan: 0, alertCooldown: new Map(), lastSavedToast: 0, termStatus: { count: 0, activeAlive: false, shell: null }, appInfo: null };

  const I18N = {
    appSubtitle: ['مركز عمليات الأمن اللاسلكي', 'Wireless Security Operations Center'],
    labMode: ['بيئة دفاعية مصرّح بها', 'Authorized defensive environment'],
    kismet: ['Kismet', 'Kismet'],
    networks: ['الشبكات', 'Networks'],
    navDashboard: ['لوحة القيادة', 'Dashboard'],
    navNetworks: ['الشبكات المحيطة', 'Nearby Networks'],
    navDevices: ['أجهزة الشبكة', 'Network Devices'],
    navSecurity: ['مركز الأمان', 'Security Center'],
    navLinks: ['فاحص الروابط', 'Link Inspector'],
    navReports: ['التقارير', 'Reports'],
    navSettings: ['الإعدادات', 'Settings'],
    globeTitle: ['🌍 الاتصال العالمي', '🌍 Global Connectivity'],
    connected: ['متصل', 'Connected'],
    globeTag: ['كرة أرضية ثلاثية الأبعاد · أقواس زخرفية مرتبطة بنشاط الرصد', '3D globe · decorative arcs driven by monitoring activity'],
    summaryTitle: ['📊 ملخص الرصد', '📊 Monitoring Summary'],
    statGreen: ['شبكات طبيعية', 'Normal networks'],
    statYellow: ['نشاط مشبوه', 'Suspicious activity'],
    statRed: ['تهديد محتمل', 'Potential threats'],
    statUnknown: ['بيانات غير كافية', 'Insufficient data'],
    legendGreen: ['أخضر: لا مؤشرات مشبوهة ضمن الملتقط', 'Green: no suspicious indicators in captured data'],
    legendYellow: ['أصفر: نشاط مشبوه يستحق التحقيق', 'Yellow: suspicious activity worth investigating'],
    legendRed: ['أحمر: تهديد محتمل بأدلة', 'Red: evidence-based potential threat'],
    legendUnknown: ['رمادي: بيانات غير كافية', 'Gray: insufficient data'],
    defenseTitle: ['🛡️ الدفاع والتخفيف', '🛡️ Defense & Mitigation'],
    radarTitle: ['📡 رادار الشبكات المحيطة', '📡 Nearby Network Radar'],
    radarHint: ['القرب من المركز = قوة RSSI وليس مسافة حقيقية · اضغط على نقطة لعرض التفاصيل', 'Distance from center reflects RSSI, not real distance · click a point for details'],
    controlTitle: ['🎛️ لوحة التحكم المباشرة', '🎛️ Live Control Panel'],
    live: ['حي', 'Live'],
    ctlInterval: ['فترة تحديث الرصد', 'Monitoring refresh interval'],
    ctlSens: ['حساسية الكشف', 'Detection sensitivity'],
    ctlGlow: ['شدة التوهج', 'Glow intensity'],
    ctlGlobe: ['سرعة دوران الكرة', 'Globe rotation speed'],
    ctlRadarSpeed: ['سرعة مسح الرادار', 'Radar sweep speed'],
    ctlParticles: ['كثافة الجزيئات', 'Particle density'],
    ctlTheme: ['المظهر', 'Theme'],
    ctlMotion: ['مستوى الحركة', 'Motion level'],
    motionFull: ['كامل', 'Full'],
    motionReduced: ['مخفف', 'Reduced'],
    motionOff: ['إيقاف', 'Off'],
    btnScanDevices: ['فحص الأجهزة', 'Scan Devices'],
    btnAnalyzeFrames: ['تحليل الإطارات', 'Analyze Frames'],
    btnWifiSource: ['معلومات المحول', 'Adapter Info'],
    btnResetView: ['إعادة ضبط العرض', 'Reset View'],
    btnExportSnapshot: ['تصدير لقطة', 'Export Snapshot'],
    feedTitle: ['🔔 آخر الأحداث', '🔔 Recent Events'],
    clearFeed: ['مسح', 'Clear'],
    networksTitle: ['الشبكات المحيطة', 'Nearby Networks'],
    netCountUnit: ['شبكة', 'networks'],
    netSearchPh: ['ابحث بـ SSID أو BSSID...', 'Search by SSID or BSSID...'],
    filterAll: ['الكل', 'All'],
    filterGreen: ['أخضر', 'Green'],
    filterYellow: ['أصفر', 'Yellow'],
    filterRed: ['أحمر', 'Red'],
    filterUnknown: ['رمادي', 'Gray'],
    thSecurity: ['الحماية', 'Security'],
    thEncryption: ['التشفير', 'Encryption'],
    thVendor: ['المصنّع', 'Vendor'],
    thFirst: ['أول رصد', 'First seen'],
    thLast: ['آخر رصد', 'Last seen'],
    thStatus: ['الحالة', 'Status'],
    thConfidence: ['الثقة', 'Confidence'],
    thEvidence: ['الأدلة', 'Evidence'],
    devicesTitle: ['أجهزة الشبكة — فحص مستمر', 'Network Devices — Continuous Scan'],
    devCountUnit: ['جهاز', 'devices'],
    devSearchPh: ['ابحث بالاسم أو IP أو MAC...', 'Search by name, IP or MAC...'],
    devAuto: ['فحص مستمر', 'Continuous scan'],
    devRefresh: ['فحص الآن', 'Scan Now'],
    thDevStatus: ['الحالة', 'Status'],
    thDevName: ['اسم الجهاز', 'Device name'],
    thDevVendor: ['المصنّع', 'Vendor'],
    thDevFirst: ['أول رصد', 'First seen'],
    thDevLast: ['آخر رصد', 'Last seen'],
    thDevTrusted: ['موثوق', 'Trusted'],
    thDevAction: ['تفاصيل', 'Details'],
    securityTitle: ['مركز الأمان', 'Security Center'],
    secCountUnit: ['حدث', 'events'],
    secDisclaimer: ['تُبنى التصنيفات على أدلة حقيقية من Kismet وTShark. لا يُصنّف أي شبكة كمخترقة بدون دليل، ولا ينفذ التطبيق أي هجوم.', 'Classifications are based on real evidence from Kismet and TShark. No network is labeled compromised without evidence, and the app performs no attacks.'],
    levelInfo: ['معلومات', 'Info'],
    levelWarning: ['تحذير', 'Warning'],
    levelCritical: ['حرج', 'Critical'],
    levelSuccess: ['نجاح', 'Success'],
    secClear: ['مسح الأحداث', 'Clear Events'],
    linksTitle: ['فاحص الروابط', 'Link Inspector'],
    linkCheck: ['🔍 فحص الرابط', '🔍 Inspect Link'],
    linkDisclaimer: ['تحليل إرشادي يعتمد على بنية الرابط فقط، ولا يفتح الرابط أو يتصل بالإنترنت. ليس حكمًا نهائيًا.', 'Heuristic analysis based only on URL structure. It does not open the link or connect to the internet. Not a final verdict.'],
    sampleSafe: ['رابط جامعة آمن', 'Safe university link'],
    sampleIp: ['رابط IP مشبوه', 'Suspicious IP link'],
    samplePhish: ['رابط تصيد تجريبي', 'Test phishing link'],
    reportsTitle: ['التقارير', 'Reports'],
    repSections: ['أقسام التقرير', 'Report sections'],
    repNetworks: ['الشبكات المحيطة', 'Nearby networks'],
    repDevices: ['أجهزة الشبكة', 'Network devices'],
    repEvents: ['الأحداث والأدلة', 'Events & evidence'],
    repSummary: ['الملخص', 'Summary'],
    repFormat: ['صيغة التصدير', 'Export format'],
    repExport: ['تصدير التقرير', 'Export Report'],
    repLast: ['آخر تصدير', 'Last export'],
    repNotYet: ['لم يتم بعد', 'Not yet'],
    repWarn: ['⚠ قد يحتوي التقرير على معلومات حساسة مثل IP وMAC واسم الجهاز. شاركه بحذر.', '⚠ Reports may contain sensitive data such as IP, MAC and device names. Share carefully.'],
    settingsTitle: ['الإعدادات', 'Settings'],
    setAppearance: ['المظهر والحركة', 'Appearance & Motion'],
    setTheme: ['المظهر', 'Theme'],
    setMotion: ['مستوى الحركة', 'Motion level'],
    setLanguage: ['اللغة', 'Language'],
    setSound: ['الصوت', 'Sound'],
    setSoundOn: ['تشغيل المؤثرات', 'Enable effects'],
    setVolume: ['مستوى الصوت', 'Volume'],
    setTyping: ['صوت الكتابة', 'Typing sound'],
    setTestSound: ['تجربة الصوت', 'Test sound'],
    setEngine: ['محرك الرصد', 'Monitoring Engine'],
    setScanInterval: ['فترة تحديث الرصد', 'Monitoring refresh interval'],
    setSensitivity: ['حساسية الكشف', 'Detection sensitivity'],
    setShell: ['Shell الافتراضية', 'Default shell'],
    setFullscreen: ['ملء الشاشة', 'Fullscreen'],
    setMaintenance: ['الصيانة', 'Maintenance'],
    engineStatus: ['حالة المحرك', 'Engine status'],
    setRestart: ['إعادة تشغيل', 'Restart'],
    setReset: ['إعادة ضبط', 'Reset'],
    termNew: ['جلسة جديدة', 'New Session'],
    termClear: ['مسح', 'Clear'],
    activity: ['النشاط', 'Activity'],
    latest: ['آخر حدث', 'Latest event'],
    noEvents: ['لا توجد أحداث', 'No events'],
    alerts: ['التنبيهات', 'Alerts'],
    running: ['يعمل', 'Running'],
    boot1: ['تهيئة نواة الرصد اللاسلكي...', 'Initializing wireless monitoring core...'],
    boot2: ['تحميل محرك Python والتصنيف...', 'Loading Python engine and classifier...'],
    boot3: ['فحص مصدر Kismet والمحول...', 'Checking Kismet source and adapter...'],
    boot4: ['تجهيز الرادار والكرة الأرضية...', 'Preparing radar and globe...'],
    boot5: ['تشغيل الطرفية الحقيقية...', 'Starting real terminal...'],
    boot6: ['اكتمل التشغيل — مرحبًا بك', 'Startup complete — welcome'],
    engineRunning: ['محرك الرصد يعمل', 'Monitoring engine running'],
    engineDown: ['محرك الرصد غير متاح', 'Monitoring engine unavailable'],
    sourceOk: ['متصل', 'Connected'],
    sourceDown: ['غير متصل', 'Disconnected'],
    waitingSource: ['بانتظار المصدر', 'Waiting for source'],
    scanning: ['مسح مستمر', 'Continuous scanning'],
    status_green: ['طبيعي', 'Normal'],
    status_yellow: ['مشبوه', 'Suspicious'],
    status_red: ['تهديد', 'Threat'],
    status_unknown: ['غير كافٍ', 'Insufficient'],
    dev_known: ['معروف', 'Known'],
    dev_new: ['جديد', 'New'],
    dev_gone: ['غائب', 'Gone'],
    confirm: ['متابعة', 'Continue'],
    cancel: ['إلغاء', 'Cancel'],
    close: ['إغلاق', 'Close'],
    saved: ['تم حفظ الإعدادات', 'Settings saved'],
    resetTitle: ['إعادة ضبط الإعدادات', 'Reset Settings'],
    resetMsg: ['سيتم إرجاع جميع الإعدادات إلى قيمها الافتراضية. هل تريد المتابعة؟', 'All settings will be restored to defaults. Continue?'],
    resetDone: ['تمت إعادة ضبط الإعدادات', 'Settings reset'],
    viewReset: ['تمت إعادة ضبط العرض', 'View reset'],
    restartDone: ['تمت إعادة تشغيل المحرك', 'Engine restarted'],
    scanFailed: ['فشل فحص الأجهزة', 'Device scan failed'],
    scanDone: ['تم فحص الأجهزة', 'Devices scanned'],
    deviceJoined: ['دخل جهاز جديد: {name} · {ip} · {mac}', 'New device joined: {name} · {ip} · {mac}'],
    deviceLeft: ['غادر جهاز الشبكة: {name}', 'Device left the network: {name}'],
    deviceReturned: ['عاد جهاز إلى الشبكة: {name}', 'Device returned: {name}'],
    trustedOn: ['تم تعليم الجهاز موثوقًا', 'Device marked as trusted'],
    trustedOff: ['تم إلغاء توثيق الجهاز', 'Device untrusted'],
    deviceDetails: ['تفاصيل الجهاز', 'Device Details'],
    networkDetails: ['تفاصيل الشبكة', 'Network Details'],
    evidenceTitle: ['أدلة التصنيف', 'Classification Evidence'],
    noNetworks: ['لا توجد شبكات مطابقة', 'No matching networks'],
    noDevices: ['لا توجد أجهزة — اضغط فحص الآن', 'No devices — press Scan Now'],
    autoInterface: ['تلقائي', 'Auto'],
    adapterInfo: ['معلومات المحول', 'Adapter Information'],
    monitorSupported: ['يدعم Monitor Mode', 'Supports Monitor Mode'],
    monitorNotSupported: ['لا يدعم Monitor Mode', 'Does not support Monitor Mode'],
    frameAnalysis: ['تحليل الإطارات', 'Frame Analysis'],
    frameDone: ['اكتمل تحليل الإطارات', 'Frame analysis complete'],
    frameFailed: ['فشل تحليل الإطارات', 'Frame analysis failed'],
    reportSaved: ['تم حفظ التقرير', 'Report saved'],
    reportCanceled: ['تم إلغاء الحفظ', 'Save canceled'],
    selectSection: ['اختر قسمًا واحدًا على الأقل', 'Select at least one section'],
    copied: ['تم النسخ', 'Copied'],
    ptyMissing: ['مكوّن node-pty غير جاهز — نفّذ npm run rebuild', 'node-pty is not ready — run npm run rebuild'],
    appError: ['خطأ في التطبيق', 'Application error'],
    na: ['غير متوفر', 'N/A'],
    loading: ['جارٍ التحميل...', 'Loading...'],
    closeSessionTitle: ['إغلاق الجلسة', 'Close Session'],
    closeSessionMsg: ['سيتم إنهاء الجلسة وإيقاف العمليات داخلها. متابعة؟', 'The session and its running processes will be terminated. Continue?'],
    termConnected: ['الطرفية متصلة', 'Terminal connected'],
    termDead: ['الجلسة منتهية', 'Session ended'],
    termNone: ['لا توجد جلسات', 'No sessions'],
    defPmf: ['فعّل PMF / 802.11w', 'Enable PMF / 802.11w'],
    defPmfDesc: ['يحمي من هجمات Deauth/Disassoc غير المشفّرة', 'Protects against unencrypted Deauth/Disassoc attacks'],
    defWpa3: ['استخدم WPA3-SAE', 'Use WPA3-SAE'],
    defWpa3Desc: ['تقليل مخاطر التصيد وكسر كلمات المرور', 'Reduces phishing and password-cracking risk'],
    defMonitor: ['راقب معدلات Deauth', 'Monitor Deauth rates'],
    defMonitorDesc: ['إنذار مبكر عند الارتفاع غير الطبيعي', 'Early warning on abnormal spikes'],
    defIsolate: ['اعزل شبكة المختبر', 'Isolate the lab network'],
    defIsolateDesc: ['منع تأثير الاختبارات على الشبكة الجامعية', 'Prevents tests from affecting the campus network'],
    defTwin: ['قارن SSID/BSSID/الأمان', 'Compare SSID/BSSID/security'],
    defTwinDesc: ['كشف Evil Twin و Rogue AP', 'Detect Evil Twin and Rogue AP'],
    defActive: ['⚠ تهديد نشط', '⚠ Active threat'],
    defActiveDesc: ['تم رصد {n} شبكة بحالة تهديد — راجع الأدلة فورًا', '{n} network(s) in threat state — review evidence now'],
    kismetConfigSaved: ['تم تحديث إعدادات Kismet', 'Kismet settings updated'],
    soundOn: ['تم تشغيل الصوت', 'Sound enabled'],
    soundOff: ['تم كتم الصوت', 'Sound muted'],
    fullScreenNA: ['ملء الشاشة غير متاح', 'Fullscreen unavailable'],
    snapshotExported: ['تم تصدير اللقطة', 'Snapshot exported'],
    engineError: ['خطأ في المحرك', 'Engine error']
  };

  function t(k, v) { let s = (I18N[k] || [k, k])[state.lang === 'en' ? 1 : 0]; if (v) Object.keys(v).forEach(x => { s = s.split('{' + x + '}').join(String(v[x])); }); return s; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function cssVar(n, d) { const v = getComputedStyle(document.body).getPropertyValue(n).trim(); return v || d; }
  function rgba(hex, a) { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return 'rgba(0,229,255,' + a + ')'; const x = parseInt(m[1], 16); return 'rgba(' + ((x >> 16) & 255) + ',' + ((x >> 8) & 255) + ',' + (x & 255) + ',' + a + ')'; }
  function timeStr(sec) { if (!sec) return t('na'); const d = new Date(Number(sec) * 1000); return d.toLocaleTimeString(state.lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { hour12: false }); }
  function nowSec() { return Date.now() / 1000; }

  function applyI18n() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    renderStats(); renderNetMini(); renderNetworks(); renderDevices(); renderEvents(); renderFeed(); renderDefense(); updateBackendLabels(); updateSourceLabels(); updateTermStatus(); syncControls(); tickClock();
  }

  function toast(level, msg) {
    const box = $('toasts'); while (box.children.length >= 5) box.firstChild.remove();
    const el = document.createElement('div'); el.className = 'toast ' + level;
    const icon = document.createElement('span'); icon.textContent = { success: '✔', warning: '⚠', error: '✖', info: 'ℹ' }[level] || 'ℹ';
    const text = document.createElement('span'); text.textContent = msg;
    el.appendChild(icon); el.appendChild(text); box.appendChild(el);
    if (level === 'success') window.AudioEngine.play('confirm'); else if (level === 'warning') window.AudioEngine.play('warning'); else if (level === 'error') window.AudioEngine.play('alert');
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; setTimeout(() => el.remove(), 300); }, 4200);
  }

  let modalResolve = null;
  function openModal(title, msg, opts) {
    opts = opts || {};
    $('modalTitle').textContent = title; $('modalMsg').textContent = msg;
    $('modalOk').textContent = opts.okText || t('confirm');
    $('modalCancel').textContent = opts.cancelText || t('cancel');
    $('modalCancel').classList.toggle('hidden', !!opts.hideCancel);
    $('modalOk').className = 'btn ' + (opts.danger ? 'danger' : 'primary');
    $('modal').classList.remove('hidden'); $('modalOk').focus();
    return new Promise(r => { modalResolve = r; });
  }
  function closeModal(v) { $('modal').classList.add('hidden'); if (modalResolve) { modalResolve(v); modalResolve = null; } }

  function addEvent(level, msg, time) {
    const ev = { level, msg, time: time || nowSec() };
    state.events.unshift(ev); if (state.events.length > 200) state.events.pop();
    state.feed.unshift(ev); if (state.feed.length > 14) state.feed.pop();
    $('tickerText').textContent = msg;
    if (level !== 'info' && level !== 'success' && state.activePage !== 'security') { state.unseen++; updateBadges(); }
    if (level === 'critical') toast('error', msg); else if (level === 'warning') toast('warning', msg);
    renderFeed(); if (state.activePage === 'security') renderEvents();
  }
  function updateBadges() { $('alertsBadge').textContent = state.unseen; const n = $('navAlertBadge'); n.textContent = state.unseen; n.classList.toggle('hidden', state.unseen === 0); }
  function renderFeed() {
    const box = $('liveFeed');
    if (!state.feed.length) { box.innerHTML = '<div class="empty">' + esc(t('noEvents')) + '</div>'; return; }
    box.innerHTML = state.feed.map(e => '<div class="feed-item ' + esc(e.level) + '"><time class="tech">' + esc(timeStr(e.time)) + '</time><span>' + esc(e.msg) + '</span></div>').join('');
  }
  function renderEvents() {
    const list = $('secList'); $('secCount').textContent = state.events.length;
    const rows = state.events.filter(e => state.secFilter === 'all' || e.level === state.secFilter);
    if (!rows.length) { list.innerHTML = '<div class="empty">' + esc(t('noEvents')) + '</div>'; return; }
    list.innerHTML = rows.map(e => '<div class="event ' + esc(e.level) + '"><span class="lvl">' + esc(t('level' + e.level.charAt(0).toUpperCase() + e.level.slice(1))) + '</span><span class="msg">' + esc(e.msg) + '</span><time class="tech">' + esc(timeStr(e.time)) + '</time></div>').join('');
  }

  const statusCls = { green: 'g', yellow: 'y', red: 'r', unknown: 'u' };
  function renderStats() {
    const s = state.snapshot && state.snapshot.summary ? state.snapshot.summary : { green: 0, yellow: 0, red: 0, unknown: 0, total: 0 };
    $('statGreen').textContent = s.green; $('statYellow').textContent = s.yellow; $('statRed').textContent = s.red; $('statUnknown').textContent = s.unknown;
    $('netCountChip').textContent = s.total; $('netCount').textContent = state.networks.length;
  }
  function netRow(n, mini) {
    const pill = '<span class="pill ' + statusCls[n.status] + '">' + esc(t('status_' + n.status)) + '</span>';
    if (mini) return '<tr data-bssid="' + esc(n.bssid) + '" class="' + (n.bssid === state.selectedBssid ? 'sel' : '') + '"><td><bdi>' + esc(n.ssid) + '</bdi></td><td><bdi>' + esc(n.bssid) + '</bdi></td><td><bdi>' + esc(n.channel == null ? t('na') : n.channel) + '</bdi></td><td><bdi>' + esc(n.rssi == null ? t('na') : n.rssi + ' dBm') + '</bdi></td><td><bdi>' + esc(n.security) + '</bdi></td><td>' + pill + '</td><td><bdi>' + esc(n.confidence) + '%</bdi></td></tr>';
    return '<tr data-bssid="' + esc(n.bssid) + '" class="' + (n.bssid === state.selectedBssid ? 'sel' : '') + '"><td><bdi>' + esc(n.ssid) + '</bdi></td><td><bdi>' + esc(n.bssid) + '</bdi></td><td><bdi>' + esc(n.channel == null ? t('na') : n.channel) + '</bdi></td><td><bdi>' + esc(n.frequency == null ? t('na') : n.frequency + ' MHz') + '</bdi></td><td><bdi>' + esc(n.rssi == null ? t('na') : n.rssi + ' dBm') + '</bdi></td><td><bdi>' + esc(n.security) + '</bdi></td><td><bdi>' + esc(n.encryption) + '</bdi></td><td><bdi>' + esc(n.vendor) + '</bdi></td><td><bdi>' + esc(timeStr(n.first_seen)) + '</bdi></td><td><bdi>' + esc(timeStr(n.last_seen)) + '</bdi></td><td>' + pill + '</td><td><bdi>' + esc(n.confidence) + '%</bdi></td><td><button class="btn sm ghost" data-evidence="' + esc(n.bssid) + '" type="button">' + esc(t('thEvidence')) + '</button></td></tr>';
  }
  function renderNetMini() {
    const rows = state.networks.slice().sort((a, b) => (b.rssi || -999) - (a.rssi || -999)).slice(0, 8);
    $('netMiniBody').innerHTML = rows.length ? rows.map(n => netRow(n, true)).join('') : '<tr><td colspan="7" class="empty">' + esc(t('noNetworks')) + '</td></tr>';
    $$('#netMiniBody tr[data-bssid]').forEach(tr => tr.addEventListener('click', () => selectNetwork(tr.dataset.bssid, false)));
  }
  function renderNetworks() {
    const q = ($('netSearch').value || '').trim().toLowerCase();
    let rows = state.networks.filter(n => (state.netFilter === 'all' || n.status === state.netFilter) && (!q || String(n.ssid).toLowerCase().includes(q) || String(n.bssid).toLowerCase().includes(q)));
    const key = state.netSort.key, dir = state.netSort.dir;
    rows.sort((a, b) => { const A = a[key], B = b[key]; if (A == null) return 1; if (B == null) return -1; return (typeof A === 'string' ? A.localeCompare(B) : A - B) * dir; });
    $('netBody').innerHTML = rows.length ? rows.map(n => netRow(n, false)).join('') : '<tr><td colspan="13" class="empty">' + esc(t('noNetworks')) + '</td></tr>';
    $$('#netBody tr[data-bssid]').forEach(tr => tr.addEventListener('click', () => selectNetwork(tr.dataset.bssid, false)));
    $$('#netBody [data-evidence]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const n = state.networks.find(x => x.bssid === b.dataset.evidence); if (n) showNetworkDetails(n); }));
  }
  function selectNetwork(bssid, details) {
    state.selectedBssid = bssid; window.Radar.setSelected(bssid); renderNetMini(); renderNetworks();
    const n = state.networks.find(x => x.bssid === bssid);
    if (n && details) showNetworkDetails(n);
    if (n) window.AudioEngine.play('scan');
  }
  function showNetworkDetails(n) {
    const lines = ['SSID: ' + n.ssid, 'BSSID: ' + n.bssid, 'Channel: ' + (n.channel == null ? t('na') : n.channel), 'Frequency: ' + (n.frequency == null ? t('na') : n.frequency + ' MHz'), 'RSSI: ' + (n.rssi == null ? t('na') : n.rssi + ' dBm'), 'Security: ' + n.security, 'Encryption: ' + n.encryption, 'Vendor: ' + n.vendor, t('thFirst') + ': ' + timeStr(n.first_seen), t('thLast') + ': ' + timeStr(n.last_seen), t('thStatus') + ': ' + t('status_' + n.status), t('thConfidence') + ': ' + n.confidence + '%', '', t('evidenceTitle') + ':', (n.reasons || []).join('\n')];
    openModal(t('networkDetails') + ' — ' + n.ssid, lines.join('\n'), { hideCancel: true, okText: t('close') });
  }
  function renderDefense() {
    const red = state.networks.filter(n => n.status === 'red').length;
    const items = [['defPmf', 'defPmfDesc'], ['defWpa3', 'defWpa3Desc'], ['defMonitor', 'defMonitorDesc'], ['defIsolate', 'defIsolateDesc'], ['defTwin', 'defTwinDesc']];
    let html = '';
    if (red > 0) html += '<div class="def-item"><b>⚠</b><span><b>' + esc(t('defActive')) + '</b><br>' + esc(t('defActiveDesc', { n: red })) + '</span></div>';
    html += items.map(i => '<div class="def-item"><b>✓</b><span><b>' + esc(t(i[0])) + '</b><br>' + esc(t(i[1])) + '</span></div>').join('');
    $('defenseList').innerHTML = html;
  }

  function applySnapshot(s) {
    state.snapshot = s; state.networks = s.networks || [];
    state.sourceOk = !!(s.source && s.source.ok);
    window.Radar.setNetworks(state.networks);
    if (state.selectedBssid && !state.networks.some(n => n.bssid === state.selectedBssid)) { state.selectedBssid = null; window.Radar.setSelected(null); }
    renderStats(); renderNetMini(); renderNetworks(); renderDefense(); updateSourceLabels();
    const sum = s.summary || { total: 0, red: 0, yellow: 0 };
    window.Globe.setActivity(clamp((sum.red * 3 + sum.yellow + sum.total * 0.05) / 10, 0, 1));
    state.activity.push(sum.total + sum.red * 8 + sum.yellow * 3); if (state.activity.length > 60) state.activity.shift(); drawActivity();
    const src = s.source && s.source.sources ? s.source.sources : [];
    const mon = src.find(x => String(x['kismet.datasource.interface'] || '').includes('mon')) || src[0];
    if (mon && mon['kismet.datasource.interface']) $('adapterChip').textContent = mon['kismet.datasource.interface'];
  }
  function updateSourceLabels() {
    const ok = state.sourceOk;
    $('sourceDot').className = 'dot ' + (ok ? 'on' : 'off');
    $('sourceLabel').textContent = t(ok ? 'sourceOk' : 'sourceDown');
    $('radarStatusDot').className = 'dot ' + (ok ? 'on' : 'off');
    $('radarStatus').textContent = t(ok ? 'scanning' : 'waitingSource');
    $('globeStatusDot').className = 'dot ' + (ok ? 'on' : 'off');
  }
  function updateBackendLabels() {
    const on = state.backendRunning;
    $('backendDot').className = 'dot ' + (on ? 'on' : 'off');
    $('backendDot2').className = 'dot ' + (on ? 'on' : 'off');
    $('backendLabel').textContent = t(on ? 'engineRunning' : 'engineDown');
    $('backendLabel2').textContent = t(on ? 'engineRunning' : 'engineDown');
  }
  function updateBackendStatus(st) { const was = state.backendRunning; state.backendRunning = !!st.running; updateBackendLabels(); if (was && !st.running) toast('warning', st.message || t('engineDown')); }

  function drawActivity() {
    const c = $('activityCanvas'); const r = c.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
    const d = Math.min(2, window.devicePixelRatio || 1), w = Math.round(r.width), h = Math.round(r.height);
    if (c.width !== w * d || c.height !== h * d) { c.width = w * d; c.height = h * d; }
    const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h);
    if (state.activity.length < 2) return;
    const max = Math.max(1, ...state.activity), step = w / 59, off = 60 - state.activity.length, ac = cssVar('--cyan', '#00e5ff');
    const pts = state.activity.map((v, i) => [(i + off) * step, h - 2 - (v / max) * (h - 4)]);
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgba(ac, 0.3)); g.addColorStop(1, rgba(ac, 0));
    x.beginPath(); x.moveTo(pts[0][0], h); pts.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(pts[pts.length - 1][0], h); x.closePath(); x.fillStyle = g; x.fill();
    x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.strokeStyle = ac; x.lineWidth = 1.5; x.stroke();
  }

  function loadVisual() { try { Object.assign(state.visual, JSON.parse(localStorage.getItem('azraqi-wids-visual') || '{}')); } catch (e) {} }
  function saveVisual() { localStorage.setItem('azraqi-wids-visual', JSON.stringify(state.visual)); }
  function loadTrusted() { try { state.trusted = new Set(JSON.parse(localStorage.getItem('azraqi-wids-trusted') || '[]')); } catch (e) { state.trusted = new Set(); } }
  function saveTrusted() { localStorage.setItem('azraqi-wids-trusted', JSON.stringify(Array.from(state.trusted))); }

  function loadAdapters() {
    api.monitor.request('wifi_source').then(res => {
      if (!res.ok) return;
      const d = res.data; state.adapters = d.adapters || []; state.wifiInfo = d;
      const sel = $('devInterface'); const cur = sel.value;
      sel.innerHTML = '<option value="">' + esc(t('autoInterface')) + '</option>' + state.adapters.map(a => '<option value="' + esc(a.interface) + '">' + esc(a.interface) + ' · ' + esc(a.type) + '</option>').join('');
      if (cur) sel.value = cur;
      const mon = state.adapters.find(a => a.monitor_supported) || state.adapters[0];
      if (mon) $('adapterChip').textContent = mon.interface;
    });
  }
  function showAdapterInfo() {
    const d = state.wifiInfo;
    if (!d) { loadAdapters(); toast('info', t('loading')); return; }
    const lines = [d.message || '', d.monitor_supported ? t('monitorSupported') : t('monitorNotSupported'), ''];
    (d.adapters || []).forEach(a => lines.push(a.interface + ' · ' + a.type + ' · CH ' + (a.channel == null ? t('na') : a.channel)));
    if (d.nmcli) lines.push('', 'nmcli:', d.nmcli);
    openModal(t('adapterInfo'), lines.join('\n'), { hideCancel: true, okText: t('close') });
  }
  function mergeDevices(list) {
    const now = nowSec(), seen = new Set(), baseline = state.deviceBaselineDone;
    list.forEach(d => {
      const key = (d.mac && d.mac !== 'غير متوفر' && d.mac !== 'N/A') ? d.mac : d.ip; if (!key) return; seen.add(key);
      const trusted = state.trusted.has(key);
      const ex = state.deviceMap.get(key);
      if (ex) {
        const wasGone = ex.status === 'gone';
        ex.ip = d.ip || ex.ip; ex.mac = d.mac || ex.mac;
        if (d.name && d.name !== 'غير متوفر' && d.name !== 'N/A') ex.name = d.name;
        if (d.vendor && d.vendor !== 'غير متوفر' && d.vendor !== 'N/A') ex.vendor = d.vendor;
        ex.last_seen = now; ex.trusted = trusted; ex.status = trusted ? 'known' : (wasGone ? 'new' : 'known');
        if (wasGone && !trusted) addEvent('warning', t('deviceReturned', { name: ex.name }));
      } else {
        const nd = { key, name: d.name || t('na'), ip: d.ip || t('na'), mac: d.mac || t('na'), vendor: d.vendor || t('na'), first_seen: now, last_seen: now, status: baseline ? (trusted ? 'known' : 'new') : 'known', trusted };
        state.deviceMap.set(key, nd);
        if (baseline && !trusted) addEvent('warning', t('deviceJoined', { name: nd.name, ip: nd.ip, mac: nd.mac }));
      }
    });
    state.deviceMap.forEach(d => { if (!seen.has(d.key) && d.status !== 'gone') { d.status = 'gone'; addEvent('info', t('deviceLeft', { name: d.name })); } });
    state.deviceBaselineDone = true;
    state.devices = Array.from(state.deviceMap.values());
  }
  function scanDevices() {
    if (state.deviceScanBusy) return;
    state.deviceScanBusy = true;
    const iface = $('devInterface').value || null, subnet = $('devSubnet').value.trim() || null;
    api.monitor.request('scan_devices', { interface: iface, subnet: subnet }).then(res => {
      state.deviceScanBusy = false; state.lastDeviceScan = Date.now();
      if (!res.ok) { toast('error', res.error); return; }
      const d = res.data;
      if (!d.ok) { $('devNote').textContent = d.error || t('scanFailed'); toast('error', d.error || t('scanFailed')); return; }
      mergeDevices(d.devices || []);
      $('devNote').textContent = (d.note || '') + ' · ' + (d.methods || []).join(' + ') + ' · ' + (d.subnet || '');
      if (d.subnet) $('devSubnet').placeholder = d.subnet;
      renderDevices();
    }).catch(() => { state.deviceScanBusy = false; });
  }
  function renderDevices() {
    const q = ($('devSearch').value || '').trim().toLowerCase();
    const rows = state.devices.filter(d => !q || d.name.toLowerCase().includes(q) || d.ip.toLowerCase().includes(q) || d.mac.toLowerCase().includes(q));
    $('devCount').textContent = rows.length;
    const cls = { known: 'g', new: 'y', gone: 'u' };
    if (!rows.length) { $('devBody').innerHTML = '<tr><td colspan="9" class="empty">' + esc(t('noDevices')) + '</td></tr>'; return; }
    $('devBody').innerHTML = rows.map(d => '<tr><td><span class="pill ' + cls[d.status] + '">' + esc(t('dev_' + d.status)) + '</span></td><td><bdi>' + esc(d.name) + '</bdi></td><td><bdi>' + esc(d.ip) + '</bdi></td><td><bdi>' + esc(d.mac) + '</bdi></td><td><bdi>' + esc(d.vendor) + '</bdi></td><td><bdi>' + esc(timeStr(d.first_seen)) + '</bdi></td><td><bdi>' + esc(timeStr(d.last_seen)) + '</bdi></td><td><label class="switch" style="transform:scale(.8)"><input type="checkbox" data-trust="' + esc(d.key) + '" ' + (d.trusted ? 'checked' : '') + '><span class="slider"></span></label></td><td><button class="btn sm ghost" data-devdetail="' + esc(d.key) + '" type="button">' + esc(t('thDevAction')) + '</button></td></tr>').join('');
    $$('[data-trust]').forEach(cb => cb.addEventListener('change', () => { const d = state.deviceMap.get(cb.dataset.trust); if (!d) return; d.trusted = cb.checked; if (cb.checked) { state.trusted.add(d.key); d.status = 'known'; } else { state.trusted.delete(d.key); } saveTrusted(); renderDevices(); toast('info', t(cb.checked ? 'trustedOn' : 'trustedOff')); }));
    $$('[data-devdetail]').forEach(b => b.addEventListener('click', () => { const d = state.deviceMap.get(b.dataset.devdetail); if (!d) return; openModal(t('deviceDetails') + ' — ' + d.name, [t('thDevName') + ': ' + d.name, 'IP: ' + d.ip, 'MAC: ' + d.mac, t('thDevVendor') + ': ' + d.vendor, t('thDevFirst') + ': ' + timeStr(d.first_seen), t('thDevLast') + ': ' + timeStr(d.last_seen), t('thDevStatus') + ': ' + t('dev_' + d.status), t('thDevTrusted') + ': ' + (d.trusted ? '✔' : '✖')].join('\n'), { hideCancel: true, okText: t('close') }); }));
  }

  function analyzeFrames() {
    const iface = $('devInterface').value || $('adapterChip').textContent || null;
    if (!iface || iface === '—') { toast('warning', t('adapterInfo')); return; }
    toast('info', t('loading'));
    api.monitor.request('analyze_frames', { interface: iface, duration: 5 }).then(res => {
      if (!res.ok) { toast('error', res.error); return; }
      const d = res.data;
      if (!d.ok) { toast('error', d.error || t('frameFailed')); addEvent('warning', t('frameFailed')); return; }
      const lines = (d.results || []).map(r => r.bssid + ' · Deauth ' + r.deauth_rate + '/s · Disassoc ' + r.disassoc_rate + '/s · Beacon ' + r.beacon_rate + '/s');
      addEvent('info', t('frameDone'));
      openModal(t('frameAnalysis'), lines.length ? lines.join('\n') : t('na'), { hideCancel: true, okText: t('close') });
    });
  }

  function checkLink() {
    const url = $('linkInput').value.trim();
    if (!url) { toast('warning', t('na')); return; }
    api.monitor.request('check_link', { url }).then(res => {
      if (!res.ok) { toast('error', res.error); return; }
      const d = res.data;
      if (!d.ok) { toast('error', d.error); return; }
      const color = d.level === 'critical' ? 'var(--red)' : d.level === 'warning' ? 'var(--amber)' : 'var(--green)';
      $('linkVerdict').innerHTML = '<div class="ring" style="border:3px solid ' + color + ';color:' + color + '">' + esc(d.score) + '%</div><div><h3 style="color:' + color + '">' + esc(d.verdict) + '</h3><p>' + esc(d.note) + '</p></div>';
      $('linkCriteria').innerHTML = (d.criteria || []).map(c => { const col = c.points >= 20 ? 'var(--red)' : c.points >= 10 ? 'var(--amber)' : 'var(--green)'; return '<div class="crit"><span>' + esc(c.name) + '</span><span><bdi>' + esc(c.value) + '</bdi> <span class="v" style="color:' + col + '">' + esc(c.label) + '</span></span></div>'; }).join('');
      window.AudioEngine.play('scan');
    });
  }

  function csvEscape(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function buildReport() {
    const secs = $$('input[name="repSec"]:checked').map(i => i.value);
    const data = { app: 'AZRAQI WIDS', generated_at: new Date().toISOString(), sections: {} };
    if (secs.includes('summary')) data.sections.summary = state.snapshot ? state.snapshot.summary : {};
    if (secs.includes('networks')) data.sections.networks = state.networks.map(n => ({ ssid: n.ssid, bssid: n.bssid, channel: n.channel, frequency: n.frequency, rssi: n.rssi, security: n.security, encryption: n.encryption, vendor: n.vendor, status: n.status, confidence: n.confidence, reasons: n.reasons }));
    if (secs.includes('devices')) data.sections.devices = state.devices.map(d => ({ name: d.name, ip: d.ip, mac: d.mac, vendor: d.vendor, status: d.status, trusted: d.trusted, first_seen: d.first_seen, last_seen: d.last_seen }));
    if (secs.includes('events')) data.sections.events = state.events.map(e => ({ level: e.level, message: e.msg, time: e.time }));
    return { secs, data };
  }
  function toCSV(data) {
    const lines = ['# AZRAQI WIDS'];
    Object.keys(data.sections).forEach(k => {
      const v = data.sections[k]; lines.push('', '# ' + k);
      if (Array.isArray(v) && v.length) { lines.push(Object.keys(v[0]).join(',')); v.forEach(o => lines.push(Object.values(o).map(x => csvEscape(Array.isArray(x) ? x.join(' | ') : x)).join(','))); }
      else if (v && typeof v === 'object') Object.keys(v).forEach(a => lines.push(csvEscape(a) + ',' + csvEscape(v[a])));
    });
    return lines.join('\n');
  }
  function toTXT(data) {
    let out = 'AZRAQI WIDS\n' + data.generated_at + '\n\n';
    Object.keys(data.sections).forEach(k => { const v = data.sections[k]; out += '=== ' + k + ' ===\n'; if (Array.isArray(v)) v.forEach(o => { out += JSON.stringify(o) + '\n'; }); else if (v && typeof v === 'object') Object.keys(v).forEach(a => { out += a + ': ' + v[a] + '\n'; }); out += '\n'; });
    return out;
  }
  function exportReport(forceSnapshot) {
    const built = forceSnapshot ? { secs: ['summary', 'networks', 'devices', 'events'], data: { app: 'AZRAQI WIDS', generated_at: new Date().toISOString(), sections: { summary: state.snapshot ? state.snapshot.summary : {}, networks: state.networks, devices: state.devices, events: state.events } } } : buildReport();
    if (!built.secs.length) { toast('warning', t('selectSection')); return; }
    const format = forceSnapshot ? 'json' : $('repFormat').value;
    const content = format === 'json' ? JSON.stringify(built.data, null, 2) : format === 'csv' ? '\uFEFF' + toCSV(built.data) : toTXT(built.data);
    const name = 'AZRAQI-WIDS-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    api.report.save({ format, content, suggestedName: name }).then(res => {
      if (res.ok) { $('repStatus').textContent = res.path; toast('success', forceSnapshot ? t('snapshotExported') : t('reportSaved')); }
      else if (res.canceled) { $('repStatus').textContent = t('reportCanceled'); }
      else toast('error', res.error || t('appError'));
    });
  }

  function syncControls() {
    const s = state.settings, v = state.visual;
    $('ctlInterval').value = s.scanInterval; $('ctlIntervalVal').textContent = s.scanInterval + 's';
    $('ctlSens').value = s.sensitivity; $('ctlSensVal').textContent = s.sensitivity;
    $('ctlGlow').value = v.glow; $('ctlGlowVal').textContent = v.glow + '%';
    $('ctlGlobe').value = v.globeSpeed; $('ctlGlobeVal').textContent = Number(v.globeSpeed).toFixed(1) + '×';
    $('ctlRadarSpeed').value = v.radarSpeed; $('ctlRadarSpeedVal').textContent = Number(v.radarSpeed).toFixed(1) + '×';
    $('ctlParticles').value = v.particles; $('ctlParticlesVal').textContent = v.particles;
    $('ctlTheme').value = s.theme; $('ctlMotion').value = s.motion;
    $('setTheme').value = s.theme; $('setMotion').value = s.motion; $('setLanguage').value = s.language;
    $('setSound').checked = s.sound; $('setVolume').value = Math.round(s.volume * 100); $('setVolumeVal').textContent = Math.round(s.volume * 100) + '%'; $('setTyping').checked = s.typingSound;
    $('setKismetUrl').value = s.kismetUrl; $('setKismetApiKey').value = s.kismetApiKey;
    $('setScanInterval').value = String(s.scanInterval); $('setSensitivity').value = s.sensitivity;
    $('setShell').value = s.shell; $('termShell').value = s.shell; $('setFullscreen').checked = s.fullscreen;
    $('soundBtn').textContent = s.sound ? '🔊' : '🔇';
  }
  function applyAll() {
    const s = state.settings, v = state.visual;
    document.body.dataset.theme = s.theme; document.body.dataset.motion = s.motion;
    document.documentElement.style.setProperty('--glow', v.glow / 100);
    window.AudioEngine.configure({ enabled: s.sound, volume: s.volume, typing: s.typingSound });
    window.Globe.setSpeed(v.globeSpeed); window.Globe.setParticles(v.particles); window.Globe.setMotion(s.motion);
    window.Radar.setSpeed(v.radarSpeed); window.Radar.setParticles(v.particles); window.Radar.setMotion(s.motion);
    window.TerminalManager.refreshTheme();
    const langChanged = state.lang !== s.language; state.lang = s.language;
    syncControls();
    if (langChanged || !state.booted) applyI18n();
  }
  function updateSettings(patch) {
    api.settings.set(patch).then(s => { state.settings = s; applyAll(); const n = Date.now(); if (n - state.lastSavedToast > 1500) { state.lastSavedToast = n; toast('info', t('saved')); } });
  }
  function updateVisual(patch) { Object.assign(state.visual, patch); saveVisual(); applyAll(); }

  function bindControls() {
    $('ctlInterval').addEventListener('input', e => { $('ctlIntervalVal').textContent = e.target.value + 's'; });
    $('ctlInterval').addEventListener('change', e => updateSettings({ scanInterval: Number(e.target.value) }));
    $('ctlSens').addEventListener('input', e => { $('ctlSensVal').textContent = e.target.value; });
    $('ctlSens').addEventListener('change', e => updateSettings({ sensitivity: Number(e.target.value) }));
    $('ctlGlow').addEventListener('input', e => updateVisual({ glow: Number(e.target.value) }));
    $('ctlGlobe').addEventListener('input', e => updateVisual({ globeSpeed: Number(e.target.value) }));
    $('ctlRadarSpeed').addEventListener('input', e => updateVisual({ radarSpeed: Number(e.target.value) }));
    $('ctlParticles').addEventListener('input', e => updateVisual({ particles: Number(e.target.value) }));
    $('ctlTheme').addEventListener('change', e => updateSettings({ theme: e.target.value }));
    $('ctlMotion').addEventListener('change', e => updateSettings({ motion: e.target.value }));
    $('btnScanDevices').addEventListener('click', () => { switchPage('devices'); scanDevices(); });
    $('btnAnalyzeFrames').addEventListener('click', analyzeFrames);
    $('btnWifiSource').addEventListener('click', () => { loadAdapters(); showAdapterInfo(); });
    $('btnResetView').addEventListener('click', () => { state.visual = Object.assign({}, VISUAL_DEFAULTS); saveVisual(); applyAll(); toast('info', t('viewReset')); });
    $('btnExportSnapshot').addEventListener('click', () => exportReport(true));
    $('clearFeed').addEventListener('click', () => { state.feed = []; renderFeed(); });
  }
  function bindSettings() {
    $('setTheme').addEventListener('change', e => updateSettings({ theme: e.target.value }));
    $('setMotion').addEventListener('change', e => updateSettings({ motion: e.target.value }));
    $('setLanguage').addEventListener('change', e => updateSettings({ language: e.target.value }));
    $('setSound').addEventListener('change', e => updateSettings({ sound: e.target.checked }));
    $('setVolume').addEventListener('input', e => { const v = Number(e.target.value) / 100; $('setVolumeVal').textContent = e.target.value + '%'; window.AudioEngine.configure({ enabled: state.settings.sound, volume: v, typing: state.settings.typingSound }); });
    $('setVolume').addEventListener('change', e => updateSettings({ volume: Number(e.target.value) / 100 }));
    $('setTyping').addEventListener('change', e => updateSettings({ typingSound: e.target.checked }));
    $('setTestSound').addEventListener('click', () => window.AudioEngine.play('confirm'));
    $('setKismetUrl').addEventListener('change', e => updateSettings({ kismetUrl: e.target.value.trim() }));
    $('setKismetApiKey').addEventListener('change', e => updateSettings({ kismetApiKey: e.target.value }));
    $('setScanInterval').addEventListener('change', e => updateSettings({ scanInterval: Number(e.target.value) }));
    $('setSensitivity').addEventListener('input', e => updateSettings({ sensitivity: Number(e.target.value) }));
    $('setShell').addEventListener('change', e => updateSettings({ shell: e.target.value }));
    $('setFullscreen').addEventListener('change', e => updateSettings({ fullscreen: e.target.checked }));
    $('btnRestartBackend').addEventListener('click', () => api.monitor.restart().then(() => toast('info', t('restartDone'))));
    $('btnResetSettings').addEventListener('click', () => openModal(t('resetTitle'), t('resetMsg'), { danger: true }).then(ok => { if (!ok) return; state.visual = Object.assign({}, VISUAL_DEFAULTS); saveVisual(); api.settings.set(Object.assign({}, DEFAULT_SETTINGS)).then(s => { state.settings = s; state.lang = s.language; applyAll(); applyI18n(); toast('success', t('resetDone')); }); }));
    $('soundBtn').addEventListener('click', () => { updateSettings({ sound: !state.settings.sound }); toast('info', state.settings.sound ? t('soundOff') : t('soundOn')); });
  }
  function bindDevices() {
    $('devRefresh').addEventListener('click', () => { scanDevices(); toast('info', t('scanDone')); });
    $('devSearch').addEventListener('input', renderDevices);
    $('devInterface').addEventListener('change', () => { state.deviceMap.clear(); state.deviceBaselineDone = false; state.devices = []; renderDevices(); scanDevices(); });
    $('devSubnet').addEventListener('change', () => { state.deviceMap.clear(); state.deviceBaselineDone = false; state.devices = []; renderDevices(); scanDevices(); });
  }
  function bindNetworks() {
    $('netSearch').addEventListener('input', renderNetworks);
    $$('#netFilters .chip-btn').forEach(b => b.addEventListener('click', () => { state.netFilter = b.dataset.f; $$('#netFilters .chip-btn').forEach(x => x.classList.toggle('active', x === b)); renderNetworks(); }));
    $$('#page-networks th[data-sort]').forEach(th => th.addEventListener('click', () => { const k = th.dataset.sort; if (state.netSort.key === k) state.netSort.dir *= -1; else { state.netSort.key = k; state.netSort.dir = 1; } renderNetworks(); }));
  }
  function bindSecurity() {
    $$('#secFilters .chip-btn').forEach(b => b.addEventListener('click', () => { state.secFilter = b.dataset.level; $$('#secFilters .chip-btn').forEach(x => x.classList.toggle('active', x === b)); renderEvents(); }));
    $('secClear').addEventListener('click', () => { state.events = []; state.unseen = 0; updateBadges(); renderEvents(); $('tickerText').textContent = t('noEvents'); });
  }
  function bindLinks() {
    $('linkCheck').addEventListener('click', checkLink);
    $('linkInput').addEventListener('keydown', e => { if (e.key === 'Enter') checkLink(); });
    $$('[data-link]').forEach(b => b.addEventListener('click', () => { $('linkInput').value = b.dataset.link; checkLink(); }));
  }
  function bindReports() { $('repExport').addEventListener('click', () => exportReport(false)); }
  function bindModal() {
    $('modalOk').addEventListener('click', () => closeModal(true));
    $('modalCancel').addEventListener('click', () => closeModal(false));
    $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(false); });
  }
  function bindWindow() {
    $('winMin').addEventListener('click', () => api.window.minimize());
    $('winMax').addEventListener('click', () => api.window.toggleMaximize());
    $('winClose').addEventListener('click', () => api.window.close());
    $('fullscreenBtn').addEventListener('click', () => api.window.toggleFullscreen());
    $('settingsBtn').addEventListener('click', () => switchPage('settings'));
    api.window.onFullscreen(fs => { $('setFullscreen').checked = fs; state.settings.fullscreen = fs; });
    document.addEventListener('keydown', e => { if (e.key === 'F11') { e.preventDefault(); api.window.toggleFullscreen(); } if (e.key === 'Escape' && !$('modal').classList.contains('hidden')) closeModal(false); });
  }
  function bindTerminal() {
    $('termNew').addEventListener('click', () => window.TerminalManager.createSession($('termShell').value));
    $('termClear').addEventListener('click', () => window.TerminalManager.clearActive());
    $('termCopy').addEventListener('click', () => window.TerminalManager.copyActive());
    $('termPaste').addEventListener('click', () => window.TerminalManager.pasteActive());
    $('termClose').addEventListener('click', () => window.TerminalManager.closeActive());
  }
  function updateTermStatus() {
    const st = state.termStatus;
    if (st.count === 0) { $('termStatusDot').className = 'dot off'; $('termStatusLabel').textContent = t('termNone'); }
    else if (st.activeAlive) { $('termStatusDot').className = 'dot on'; $('termStatusLabel').textContent = t('termConnected'); }
    else { $('termStatusDot').className = 'dot off'; $('termStatusLabel').textContent = t('termDead'); }
  }
  function initTerminal() {
    window.TerminalManager.init({
      host: $('termHost'), tabs: $('termTabs'), shell: state.settings.shell,
      hooks: {
        onStatusChange: st => { state.termStatus = st; updateTermStatus(); },
        onSessionsChange: () => updateTermStatus(),
        onError: msg => toast('error', msg),
        onOpened: () => window.AudioEngine.play('scan'),
        onCopied: () => toast('info', t('copied')),
        onTyping: d => { if (d.length === 1 && d.charCodeAt(0) >= 32) window.AudioEngine.play('key'); },
        confirmClose: () => openModal(t('closeSessionTitle'), t('closeSessionMsg'), { danger: true })
      }
    });
  }
  function switchPage(p) {
    state.activePage = p;
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === p));
    $$('.page').forEach(x => x.classList.toggle('active', x.id === 'page-' + p));
    if (p === 'networks') renderNetworks();
    if (p === 'devices') { renderDevices(); if (!state.devices.length) scanDevices(); }
    if (p === 'security') { state.unseen = 0; updateBadges(); renderEvents(); }
    if (p === 'settings') syncControls();
    if (p === 'dashboard') { window.TerminalManager.fitActive(); drawActivity(); }
    window.TerminalManager.fitActive();
  }
  function bindNav() { $$('.nav-btn').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page))); }

  function wireMonitor() {
    api.monitor.onEvent(msg => {
      if (msg.event === 'snapshot') applySnapshot(msg.data);
      else if (msg.event === 'alert') {
        const key = (msg.data.bssid || '') + '|' + msg.data.message;
        const last = state.alertCooldown.get(key) || 0;
        if (nowSec() - last > 60) { state.alertCooldown.set(key, nowSec()); addEvent(msg.data.level || 'critical', msg.data.message, msg.data.time); }
      } else if (msg.event === 'source_status') {
        state.sourceOk = !!msg.data.ok; updateSourceLabels();
      } else if (msg.event === 'backend_error') addEvent('critical', msg.data.message);
      else if (msg.event === 'ready') addEvent('info', t('engineRunning'));
    });
    api.monitor.onStatus(updateBackendStatus);
  }

  function tickClock() {
    const loc = state.lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', now = new Date();
    $('clockTime').textContent = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
    $('clockDate').textContent = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  }
  function tick(ts) { const dt = state.lastTs ? Math.min(0.1, (ts - state.lastTs) / 1000) : 0.016; state.lastTs = ts; window.Globe.draw(dt); window.Radar.draw(dt); state.raf = requestAnimationFrame(tick); }
  function deviceAutoChecker() { if (state.booted && state.activePage === 'devices' && $('devAuto').checked && !state.deviceScanBusy && Date.now() - state.lastDeviceScan > Math.max(5000, state.settings.scanInterval * 1000)) scanDevices(); }

  const BOOT = [['boot1', 12], ['boot2', 30], ['boot3', 48], ['boot4', 66], ['boot5', 84], ['boot6', 100]];
  function runBoot() {
    window.AudioEngine.play('boot');
    let i = 0;
    const next = () => {
      if (state.booted) return;
      if (i >= BOOT.length) { finishBoot(); return; }
      const step = BOOT[i], line = document.createElement('div');
      line.className = 'boot-line'; line.textContent = t(step[0]); $('bootLog').appendChild(line); $('bootBar').style.width = step[1] + '%';
      if (i === 2) window.AudioEngine.play('startup');
      i++; state.bootTimer = setTimeout(next, state.settings.motion === 'off' ? 100 : state.settings.motion === 'reduced' ? 280 : 620);
    };
    next();
  }
  function finishBoot() {
    if (state.booted) return;
    state.booted = true; clearTimeout(state.bootTimer);
    $('boot').classList.add('done'); $('app').classList.remove('hidden');
    requestAnimationFrame(() => $('app').classList.add('shown'));
    initTerminal(); loadAdapters();
    api.monitor.request('snapshot').then(res => { if (res.ok) applySnapshot(res.data); });
    window.AudioEngine.play('confirm');
  }

  function init() {
    window.AudioEngine.init($('audioHint'));
    window.Globe.init($('globeCanvas'));
    window.Radar.init($('radarCanvas'), { onSelect: b => selectNetwork(b, true) });
    loadVisual(); loadTrusted();
    bindNav(); bindWindow(); bindTerminal(); bindControls(); bindSettings(); bindDevices(); bindNetworks(); bindSecurity(); bindLinks(); bindReports(); bindModal();
    $('bootSkip').addEventListener('click', finishBoot);
    wireMonitor();
    api.settings.get().then(s => { state.settings = Object.assign({}, DEFAULT_SETTINGS, s); state.lang = s.language; applyAll(); runBoot(); }).catch(() => { applyAll(); runBoot(); });
    api.app.info().then(info => { state.appInfo = info; if (!info.ptyAvailable) toast('error', t('ptyMissing')); });
    api.monitor.status().then(updateBackendStatus);
    tickClock(); setInterval(tickClock, 1000); setInterval(deviceAutoChecker, 3000);
    state.raf = requestAnimationFrame(tick);
    window.addEventListener('error', e => addEvent('critical', t('appError') + ': ' + (e.message || 'unknown')));
    window.addEventListener('unhandledrejection', e => { const r = e.reason; addEvent('critical', t('appError') + ': ' + ((r && r.message) || r || 'unknown')); });
  }
  init();
})();