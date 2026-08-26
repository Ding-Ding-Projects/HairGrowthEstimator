const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hairGrowth', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  state: {
    read: () => ipcRenderer.invoke('state:read'),
    write: (state) => ipcRenderer.invoke('state:write', state)
  },
  secrets: {
    setApiKey: (value) => ipcRenderer.invoke('secret:setApiKey', value),
    hasApiKey: () => ipcRenderer.invoke('secret:hasApiKey')
  },
  files: {
    chooseKey: () => ipcRenderer.invoke('file:chooseKey'),
    export: (options) => ipcRenderer.invoke('file:export', options)
  },
  server: {
    request: (request) => ipcRenderer.invoke('server:request', request)
  },
  ssh: {
    start: (config) => ipcRenderer.invoke('ssh:start', config),
    stop: () => ipcRenderer.invoke('ssh:stop'),
    state: () => ipcRenderer.invoke('ssh:state'),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('ssh:state', listener);
      return () => ipcRenderer.removeListener('ssh:state', listener);
    }
  }
});
