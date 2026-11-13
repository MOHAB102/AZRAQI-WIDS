const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel) {
  return callback => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}
contextBridge.exposeInMainWorld('commandCenter', {
  platform: process.platform,
  app: { info: () => ipcRenderer.invoke('app:info') },
  settings: { get: () => ipcRenderer.invoke('settings:get'), set: patch => ipcRenderer.invoke('settings:set', patch) },
  monitor: {
    request: (cmd, payload) => ipcRenderer.invoke('monitor:request', cmd, payload),
    restart: () => ipcRenderer.invoke('monitor:restart'),
    status: () => ipcRenderer.invoke('monitor:status-get'),
    onEvent: subscribe('monitor:event'),
    onStatus: subscribe('monitor:status')
  },
  terminal: {
    create: opts => ipcRenderer.invoke('terminal:create', opts),
    input: (id, data) => ipcRenderer.send('terminal:input', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
    close: id => ipcRenderer.invoke('terminal:close', id),
    onData: subscribe('terminal:data'),
    onExit: subscribe('terminal:exit')
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
    onFullscreen: subscribe('window:fullscreen')
  },
  clipboard: { read: () => ipcRenderer.invoke('clipboard:read'), write: text => ipcRenderer.invoke('clipboard:write', text) },
  report: { save: opts => ipcRenderer.invoke('report:save', opts) }
});