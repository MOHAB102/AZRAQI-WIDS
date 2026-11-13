window.TerminalManager = (function () {
  'use strict';
  const api = window.commandCenter.terminal;
  const clipboard = window.commandCenter.clipboard;
  const MAX = 8;
  let host = null, tabs = null, hooks = {}, sessions = new Map(), early = new Map(), activeId = null, initialized = false, resizeTimer = 0;
  let TerminalCtor = null, FitCtor = null, UnicodeCtor = null;
  function resolve() {
    TerminalCtor = (window.Terminal && window.Terminal.Terminal) || window.Terminal;
    FitCtor = (window.FitAddon && window.FitAddon.FitAddon) || window.FitAddon;
    UnicodeCtor = (window.Unicode11Addon && window.Unicode11Addon.Unicode11Addon) || window.Unicode11Addon;
  }
  function cssVar(n, d) { const v = getComputedStyle(document.body).getPropertyValue(n).trim(); return v || d; }
  function theme() {
    return {
      background: cssVar('--term', '#030913'), foreground: cssVar('--text', '#dcebff'), cursor: cssVar('--cyan', '#00e5ff'), cursorAccent: cssVar('--term', '#030913'), selectionBackground: 'rgba(0,229,255,.25)',
      black: '#0a0f1a', red: '#ff3864', green: '#3dff8b', yellow: '#ff9d42', blue: '#4d9fff', magenta: '#8b5cff', cyan: '#00e5ff', white: '#dcebff',
      brightBlack: '#5a6b85', brightRed: '#ff6b8d', brightGreen: '#7dffb0', brightYellow: '#ffc078', brightBlue: '#82bfff', brightMagenta: '#b394ff', brightCyan: '#66f0ff', brightWhite: '#ffffff'
    };
  }
  function active() { return activeId ? sessions.get(activeId) : null; }
  function status() { const s = active(); if (hooks.onStatusChange) hooks.onStatusChange({ count: sessions.size, activeAlive: !!(s && s.alive), shell: s ? s.shell : null }); }
  function fitNow(s) { if (!s || s.el.clientWidth < 10) return; try { s.fit.fit(); api.resize(s.id, s.term.cols, s.term.rows); } catch (e) {} }
  function activate(id) {
    activeId = id;
    sessions.forEach(s => { s.el.classList.toggle('active', s.id === id); s.tab.classList.toggle('active', s.id === id); });
    const s = sessions.get(id); if (s) { fitNow(s); s.term.focus(); }
    status();
  }
  function buildTab(s) {
    const b = document.createElement('button'); b.className = 'term-tab'; b.type = 'button';
    const label = document.createElement('span'); label.className = 'term-tab-label'; label.textContent = s.shell + ' · ' + s.id.toUpperCase();
    const close = document.createElement('span'); close.className = 'term-tab-close'; close.textContent = '×';
    b.appendChild(label); b.appendChild(close);
    b.addEventListener('click', e => { if (e.target === close) { closeSession(s.id); return; } activate(s.id); });
    tabs.appendChild(b); s.tab = b;
  }
  function copySel(s) { const sel = s.term.getSelection(); if (sel) { clipboard.write(sel); s.term.clearSelection(); if (hooks.onCopied) hooks.onCopied(); } }
  function pasteInto(s) { clipboard.read().then(txt => { if (txt) s.term.paste(txt); }); }
  function keyHandler(s) {
    return function (ev) {
      if (ev.type !== 'keydown') return true;
      const k = ev.key.toLowerCase();
      if (ev.ctrlKey && ev.shiftKey && k === 'c') { copySel(s); return false; }
      if (ev.ctrlKey && ev.shiftKey && k === 'v') { pasteInto(s); return false; }
      if (ev.ctrlKey && !ev.shiftKey && k === 'c' && s.term.hasSelection()) { copySel(s); return false; }
      return true;
    };
  }
  async function createSession(shellKind) {
    if (!initialized) return;
    if (!TerminalCtor) { if (hooks.onError) hooks.onError('مكتبة xterm.js غير محملة'); return; }
    if (sessions.size >= MAX) { if (hooks.onError) hooks.onError('وصلت إلى الحد الأقصى للجلسات'); return; }
    const res = await api.create({ cols: 80, rows: 24, shell: shellKind || 'default' });
    if (!res || !res.ok) { if (hooks.onError) hooks.onError((res && res.error) || 'تعذر إنشاء الجلسة'); return; }
    const el = document.createElement('div'); el.className = 'term-instance'; host.appendChild(el);
    const term = new TerminalCtor({ fontFamily: cssVar('--mono', 'monospace'), fontSize: 13, lineHeight: 1.15, cursorBlink: true, cursorStyle: 'bar', scrollback: 5000, theme: theme(), allowProposedApi: true });
    const fit = new FitCtor(); term.loadAddon(fit);
    if (UnicodeCtor) { try { term.loadAddon(new UnicodeCtor()); term.unicode.activeVersion = '11'; } catch (e) {} }
    term.open(el);
    const s = { id: res.id, shell: res.shell, term, fit, el, tab: null, alive: true };
    sessions.set(res.id, s);
    const e = early.get(res.id); if (e) { e.forEach(ch => term.write(ch)); early.delete(res.id); }
    buildTab(s); activate(res.id); requestAnimationFrame(() => fitNow(s));
    term.onData(d => { api.input(s.id, d); if (hooks.onTyping) hooks.onTyping(d); });
    term.attachCustomKeyEventHandler(keyHandler(s));
    if (hooks.onSessionsChange) hooks.onSessionsChange(sessions.size);
    if (hooks.onOpened) hooks.onOpened();
  }
  async function closeSession(id) {
    const s = sessions.get(id); if (!s) return;
    if (s.alive && hooks.confirmClose) { const ok = await hooks.confirmClose(s); if (!ok) return; }
    try { await api.close(id); } catch (e) {}
    try { s.term.dispose(); } catch (e) {}
    s.el.remove(); if (s.tab) s.tab.remove(); sessions.delete(id);
    const rest = Array.from(sessions.keys()); if (rest.length) activate(rest[rest.length - 1]); else { activeId = null; status(); }
    if (hooks.onSessionsChange) hooks.onSessionsChange(sessions.size);
  }
  function init(opts) {
    if (initialized) return;
    host = opts.host; tabs = opts.tabs; hooks = opts.hooks || {}; resolve(); initialized = true;
    api.onData(msg => { const s = sessions.get(msg.id); if (s) s.term.write(msg.data); else { if (!early.has(msg.id)) early.set(msg.id, []); early.get(msg.id).push(msg.data); } });
    api.onExit(msg => { const s = sessions.get(msg.id); if (!s) { early.delete(msg.id); return; } s.alive = false; s.term.write('\r\n\x1b[90m[process exited — code ' + msg.code + ']\x1b[0m\r\n'); if (s.tab) s.tab.classList.add('dead'); status(); });
    new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => fitNow(active()), 80); }).observe(host);
    createSession(opts.shell || 'default');
  }
  return {
    init, createSession,
    closeActive: () => { if (activeId) closeSession(activeId); },
    clearActive: () => { const s = active(); if (s) s.term.clear(); },
    copyActive: () => { const s = active(); if (s) copySel(s); },
    pasteActive: () => { const s = active(); if (s) pasteInto(s); },
    fitActive: () => fitNow(active()),
    focusActive: () => { const s = active(); if (s) s.term.focus(); },
    refreshTheme: () => sessions.forEach(s => { s.term.options.theme = theme(); }),
    count: () => sessions.size
  };
})();