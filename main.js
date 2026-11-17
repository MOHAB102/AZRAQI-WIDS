const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

let pty = null;
let ptyLoadError = null;
try { pty = require('node-pty'); } catch (err) { ptyLoadError = err.message; }

const IS_WIN = process.platform === 'win32';
const MAX_SESSIONS = 8;
const THEMES = ['cyber', 'military', 'midnight', 'violet'];
const DEFAULT_SETTINGS = {
  theme: 'cyber', motion: 'full', language: 'ar',
  sound: true, volume: 0.6, typingSound: false,
  kismetUrl: 'http://127.0.0.1:2501', kismetApiKey: '',
  scanInterval: 5, sensitivity: 5,
  shell: 'default', fullscreen: false
};

let settings = Object.assign({}, DEFAULT_SETTINGS);
let mainWindow = null;
let reportsDir = null;
let pythonCmd = null;
let pythonMissing = null;

function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }
function loadSettings() {
  try { settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); }
  catch (err) { settings = Object.assign({}, DEFAULT_SETTINGS); }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 }); if (!IS_WIN) fs.chmodSync(settingsFile(), 0o600); }
  catch (err) { console.error('settings save:', err.message); }
}
function clampNumber(v, min, max, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
function sanitizeSettings(patch) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  if (THEMES.indexOf(patch.theme) !== -1) out.theme = patch.theme;
  if (['full', 'reduced', 'off'].indexOf(patch.motion) !== -1) out.motion = patch.motion;
  if (['ar', 'en'].indexOf(patch.language) !== -1) out.language = patch.language;
  if (typeof patch.sound === 'boolean') out.sound = patch.sound;
  if (typeof patch.typingSound === 'boolean') out.typingSound = patch.typingSound;
  if (typeof patch.fullscreen === 'boolean') out.fullscreen = patch.fullscreen;
  if (patch.volume !== undefined) out.volume = clampNumber(patch.volume, 0, 1, 0.6);
  if (patch.scanInterval !== undefined) out.scanInterval = Math.round(clampNumber(patch.scanInterval, 2, 60, 5));
  if (patch.sensitivity !== undefined) out.sensitivity = Math.round(clampNumber(patch.sensitivity, 1, 10, 5));
  if (typeof patch.kismetUrl === 'string') out.kismetUrl = patch.kismetUrl.trim().slice(0, 200);
  if (typeof patch.kismetApiKey === 'string') out.kismetApiKey = patch.kismetApiKey.trim().slice(0, 4096);
  if (['default', 'powershell', 'cmd', 'bash', 'zsh'].indexOf(patch.shell) !== -1) out.shell = patch.shell;
  return out;
}

function isTrustedSender(event) {
  return !!(mainWindow && event && event.sender === mainWindow.webContents && event.senderFrame && String(event.senderFrame.url || '').startsWith('file://'));
}

function detectPython() {
  const candidates = IS_WIN ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ['--version'], { windowsHide: true, timeout: 5000 });
      if (r.status === 0) {
        pythonCmd = cmd;
        // تأكد من وجود الحزم المطلوبة لتظهر رسالة واضحة بدل توقف المحرك بصمت
        const m = spawnSync(cmd, ['-c', 'import psutil, requests'], { windowsHide: true, timeout: 8000, encoding: 'utf8' });
        pythonMissing = m.status === 0 ? null : (String(m.stderr || '').trim().split('\n').pop() || 'psutil/requests');
        return;
      }
    } catch (err) {}
  }
  pythonCmd = null;
}

let backendProc = null, backendReady = false, backendStopping = false;
let restartAttempts = 0, reqSeq = 0, stdoutBuffer = '';
const pendingRequests = new Map();

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}
function backendStatus(running, message) {
  sendToRenderer('monitor:status', { running, message });
}

function startBackend() {
  if (backendStopping) return;
  if (!pythonCmd) { backendStatus(false, 'لم يتم العثور على Python 3 — ثبّته ثم أعد التشغيل'); return; }
  if (pythonMissing) { backendStatus(false, 'حزم Python ناقصة (' + pythonMissing + ') — نفّذ: pip install -r requirements.txt'); return; }
  stdoutBuffer = '';
  const script = path.join(__dirname, 'backend', 'app.py');
  // المفتاح لا يُمرَّر في سطر الأوامر (يظهر لكل المستخدمين في قائمة العمليات) بل عبر متغير بيئة
  const args = ['-u', script,
    '--kismet-url=' + settings.kismetUrl,
    '--interval=' + String(settings.scanInterval),
    '--sensitivity=' + String(settings.sensitivity)
  ];
  try {
    backendProc = spawn(pythonCmd, args, {
      cwd: __dirname, windowsHide: true,
      env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', KISMET_API_KEY: settings.kismetApiKey || '', AZRAQI_KISMET_API_KEY: settings.kismetApiKey || '' })
    });
  } catch (err) { backendStatus(false, 'تعذر تشغيل محرك Python: ' + err.message); return; }

  backendProc.stdout.setEncoding('utf8');
  backendProc.stdout.on('data', chunk => {
    stdoutBuffer += chunk;
    let idx;
    while ((idx = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.slice(0, idx).trim();
      stdoutBuffer = stdoutBuffer.slice(idx + 1);
      if (line) handleBackendLine(line);
    }
  });
  let stderrTail = '';
  backendProc.stderr.setEncoding('utf8');
  backendProc.stderr.on('data', c => { stderrTail = (stderrTail + c).slice(-2000); });
  backendProc.on('error', err => { backendReady = false; backendStatus(false, 'خطأ في المحرك: ' + err.message); });
  backendProc.on('exit', () => {
    backendReady = false; backendProc = null;
    pendingRequests.forEach(p => { clearTimeout(p.timer); p.resolve({ ok: false, error: 'توقف محرك المراقبة' }); });
    pendingRequests.clear();
    if (backendStopping) return;
    if (restartAttempts < 3) {
      restartAttempts++;
      backendStatus(false, `توقف المحرك — إعادة تشغيل (${restartAttempts}/3)...`);
      setTimeout(startBackend, 1500 * restartAttempts);
    } else {
      const last = stderrTail ? stderrTail.split('\n').filter(Boolean).pop() : '';
      backendStatus(false, 'توقف المحرك نهائيًا' + (last ? ' — ' + last : ''));
    }
  });
}

function handleBackendLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (err) { return; }
  if (msg.id && pendingRequests.has(msg.id)) {
    const p = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id); clearTimeout(p.timer);
    p.resolve(msg.ok ? { ok: true, data: msg.data } : { ok: false, error: msg.error || 'خطأ غير معروف' });
    return;
  }
  if (msg.event) {
    if (msg.event === 'ready') { backendReady = true; restartAttempts = 0; backendStatus(true, 'محرك الرصد يعمل'); }
    sendToRenderer('monitor:event', msg);
  }
}

function backendRequest(cmd, payload, timeoutMs) {
  return new Promise(resolve => {
    if (!backendProc) { resolve({ ok: false, error: 'محرك المراقبة غير متاح' }); return; }
    const id = 'r' + (++reqSeq);
    const timer = setTimeout(() => { pendingRequests.delete(id); resolve({ ok: false, error: 'انتهت مهلة الاستجابة' }); }, timeoutMs || 30000);
    pendingRequests.set(id, { resolve, timer });
    try { backendProc.stdin.write(JSON.stringify({ id, cmd, payload: payload || {} }) + '\n'); }
    catch (err) { clearTimeout(timer); pendingRequests.delete(id); resolve({ ok: false, error: 'تعذر إرسال الطلب: ' + err.message }); }
  });
}
function stopBackend() {
  backendStopping = true;
  if (backendProc) {
    try { backendProc.stdin.end(); } catch (err) {}
    setTimeout(() => { if (backendProc) { try { backendProc.kill(); } catch (err) {} } }, 800);
  }
}

const ptySessions = new Map();
let ptySeq = 0;
function resolveShell(kind) {
  if (IS_WIN) {
    if (kind === 'cmd') return { file: 'cmd.exe', args: ['/K', 'chcp 65001>nul'], label: 'CMD' };
    return { file: 'powershell.exe', args: ['-NoLogo', '-NoExit', '-Command', '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8'], label: 'PowerShell' };
  }
  if (kind === 'bash') return { file: '/bin/bash', args: [], label: 'Bash' };
  if (kind === 'zsh') return { file: 'zsh', args: [], label: 'Zsh' };
  const userShell = process.env.SHELL || '/bin/bash';
  return { file: userShell, args: [], label: path.basename(userShell) };
}
function killAllTerminals() { ptySessions.forEach(p => { try { p.kill(); } catch (err) {} }); ptySessions.clear(); }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1180, minHeight: 720,
    show: false, frame: false, backgroundColor: '#02060f',
    title: 'AZRAQI WIDS — Wireless Defense SOC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => { mainWindow.show(); if (settings.fullscreen) mainWindow.setFullScreen(true); });
  mainWindow.on('enter-full-screen', () => sendToRenderer('window:fullscreen', true));
  mainWindow.on('leave-full-screen', () => sendToRenderer('window:fullscreen', false));
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') { mainWindow.webContents.toggleDevTools(); event.preventDefault(); }
  });
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    platform: process.platform, hostname: os.hostname(), osRelease: os.release(),
    arch: os.arch(), version: app.getVersion(), python: pythonCmd,
    ptyAvailable: !!pty, ptyError: ptyLoadError
  }));
  ipcMain.handle('settings:get', e => isTrustedSender(e) ? settings : {});
  ipcMain.handle('settings:set', (e, patch) => {
    if (!isTrustedSender(e)) return {};
    const clean = sanitizeSettings(patch);
    settings = Object.assign({}, settings, clean);
    saveSettings();
    if (clean.kismetUrl !== undefined || clean.kismetApiKey !== undefined || clean.scanInterval !== undefined || clean.sensitivity !== undefined) {
      backendRequest('set_config', clean, 5000);
    }
    if (clean.fullscreen !== undefined && mainWindow) mainWindow.setFullScreen(clean.fullscreen);
    return settings;
  });
  ipcMain.handle('monitor:request', (e, cmd, payload) => isTrustedSender(e) ? backendRequest(String(cmd), payload, 45000) : { ok: false, error: 'مصدر الطلب غير موثوق' });
  ipcMain.handle('monitor:status-get', () => ({ running: backendReady, message: backendReady ? 'محرك الرصد يعمل' : 'محرك الرصد غير متاح' }));
  ipcMain.handle('monitor:restart', e => {
    if (!isTrustedSender(e)) return { ok: false, error: 'مصدر الطلب غير موثوق' };
    restartAttempts = 0; backendStopping = false;
    detectPython();
    if (backendProc) { try { backendProc.kill(); } catch (err) { startBackend(); } } else startBackend();
    return { ok: true };
  });

  ipcMain.handle('terminal:create', (e, opts) => {
    if (!isTrustedSender(e)) return { ok: false, error: 'مصدر الطلب غير موثوق' };
    opts = opts || {};
    if (!pty) return { ok: false, error: 'مكوّن node-pty غير جاهز — نفّذ: npm run rebuild' };
    if (ptySessions.size >= MAX_SESSIONS) return { ok: false, error: 'الحد الأقصى للجلسات (' + MAX_SESSIONS + ')' };
    const shell = resolveShell(opts.shell);
    const cols = Math.round(clampNumber(opts.cols, 2, 500, 80));
    const rows = Math.round(clampNumber(opts.rows, 2, 200, 24));
    try {
      const proc = pty.spawn(shell.file, shell.args, {
        name: 'xterm-256color', cols, rows, cwd: os.homedir(),
        env: Object.assign({}, process.env, { TERM: 'xterm-256color' })
      });
      const id = 't' + (++ptySeq);
      ptySessions.set(id, proc);
      proc.onData(data => sendToRenderer('terminal:data', { id, data }));
      proc.onExit(ev => { ptySessions.delete(id); sendToRenderer('terminal:exit', { id, code: ev.exitCode }); });
      return { ok: true, id, shell: shell.label };
    } catch (err) { return { ok: false, error: 'تعذر تشغيل الطرفية: ' + err.message }; }
  });
  ipcMain.on('terminal:input', (e, msg) => { if (!isTrustedSender(e)) return; const p = ptySessions.get(msg && msg.id); if (p && typeof msg.data === 'string' && msg.data.length <= 65536) p.write(msg.data); });
  ipcMain.on('terminal:resize', (e, msg) => {
    if (!isTrustedSender(e)) return;
    const p = ptySessions.get(msg && msg.id); if (!p) return;
    try { p.resize(Math.round(clampNumber(msg.cols, 2, 500, 80)), Math.round(clampNumber(msg.rows, 2, 200, 24))); } catch (err) {}
  });
  ipcMain.handle('terminal:close', (e, id) => { if (!isTrustedSender(e)) return { ok: false }; const p = ptySessions.get(id); if (p) { try { p.kill(); } catch (err) {} ptySessions.delete(id); } return { ok: true }; });

  ipcMain.on('window:minimize', e => { if (isTrustedSender(e) && mainWindow) mainWindow.minimize(); });
  ipcMain.on('window:toggle-maximize', e => { if (!isTrustedSender(e) || !mainWindow) return; if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); });
  ipcMain.on('window:close', e => { if (isTrustedSender(e) && mainWindow) mainWindow.close(); });
  ipcMain.handle('window:toggle-fullscreen', e => { if (!isTrustedSender(e) || !mainWindow) return false; mainWindow.setFullScreen(!mainWindow.isFullScreen()); return mainWindow.isFullScreen(); });
  ipcMain.handle('clipboard:read', e => isTrustedSender(e) ? clipboard.readText() : '');
  ipcMain.handle('clipboard:write', (e, text) => { if (!isTrustedSender(e)) return false; clipboard.writeText(String(text || '').slice(0, 1000000)); return true; });

  ipcMain.handle('report:save', async (e, opts) => {
    if (!isTrustedSender(e)) return { ok: false, error: 'مصدر الطلب غير موثوق' };
    opts = opts || {};
    const format = ['json', 'csv', 'txt'].indexOf(opts.format) !== -1 ? opts.format : 'json';
    const content = typeof opts.content === 'string' ? opts.content : '';
    if (!content || content.length > 20 * 1024 * 1024) return { ok: false, error: 'محتوى التقرير غير صالح' };
    const name = (String(opts.suggestedName || 'report').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120)) + '.' + format;
    const filters = { json: [{ name: 'JSON', extensions: ['json'] }], csv: [{ name: 'CSV', extensions: ['csv'] }], txt: [{ name: 'TXT', extensions: ['txt'] }] }[format];
    try {
      const result = await dialog.showSaveDialog(mainWindow, { title: 'حفظ التقرير', defaultPath: path.join(reportsDir, name), filters });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(result.filePath, content, 'utf8');
      return { ok: true, path: result.filePath };
    } catch (err) { return { ok: false, error: 'تعذر حفظ التقرير: ' + err.message }; }
  });
}

function main() {
  loadSettings(); detectPython();
  reportsDir = app.isPackaged ? path.join(app.getPath('documents'), 'AZRAQI-WIDS-reports') : path.join(__dirname, 'reports');
  try { fs.mkdirSync(reportsDir, { recursive: true }); } catch (err) {}
  Menu.setApplicationMenu(null);
  registerIpc(); createWindow(); startBackend();
  app.on('web-contents-created', (e, wc) => {
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', ev => ev.preventDefault());
  });
}

if (!IS_WIN && typeof process.getuid === 'function' && process.getuid() === 0) app.commandLine.appendSwitch('no-sandbox');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(main);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { stopBackend(); killAllTerminals(); });
}