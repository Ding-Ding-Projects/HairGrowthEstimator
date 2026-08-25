'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('hairGrowth', Object.freeze({
  window: Object.freeze({
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    setTitle: (value) => ipcRenderer.invoke('window:setTitle', value)
  }),
  provenance: Object.freeze({
    read: () => ipcRenderer.invoke('provenance:read')
  }),
  state: Object.freeze({
    read: () => ipcRenderer.invoke('state:read'),
    write: (state, event) => ipcRenderer.invoke('state:write', { state, event })
  }),
  school: Object.freeze({
    read: () => ipcRenderer.invoke('school:read'),
    write: (value) => ipcRenderer.invoke('school:write', value),
    onChanged: (callback) => subscribe('school:changed', callback)
  }),
  secrets: Object.freeze({
    setApiKey: (value) => ipcRenderer.invoke('secret:setApiKey', value),
    hasApiKey: () => ipcRenderer.invoke('secret:hasApiKey')
  }),
  locks: Object.freeze({
    set: (value) => ipcRenderer.invoke('lock:set', value),
    list: () => ipcRenderer.invoke('lock:list'),
    verify: (value) => ipcRenderer.invoke('lock:verify', value),
    remove: (elementId) => ipcRenderer.invoke('lock:remove', elementId)
  }),
  authenticator: Object.freeze({
    createSecret: () => ipcRenderer.invoke('auth:createSecret'),
    add: (value) => ipcRenderer.invoke('auth:add', value),
    list: () => ipcRenderer.invoke('auth:list'),
    remove: (id) => ipcRenderer.invoke('auth:remove', id)
  }),
  files: Object.freeze({
    chooseKey: () => ipcRenderer.invoke('file:chooseKey'),
    chooseVocabulary: () => ipcRenderer.invoke('file:chooseVocabulary'),
    chooseLogo: () => ipcRenderer.invoke('file:chooseLogo'),
    chooseConverterSource: () => ipcRenderer.invoke('file:chooseConverterSource'),
    convert: (value) => ipcRenderer.invoke('file:convert', value),
    export: (value) => ipcRenderer.invoke('file:export', value),
    showAppData: () => ipcRenderer.invoke('file:showAppData')
  }),
  external: Object.freeze({
    openVsCode: (target) => ipcRenderer.invoke('external:openVsCode', target),
    openUrl: (url) => ipcRenderer.invoke('external:openUrl', url)
  }),
  history: Object.freeze({
    list: (limit) => ipcRenderer.invoke('history:list', limit),
    read: (commit) => ipcRenderer.invoke('history:read', commit),
    onError: (callback) => subscribe('history:error', callback)
  }),
  server: Object.freeze({
    request: (request) => ipcRenderer.invoke('server:request', request)
  }),
  ssh: Object.freeze({
    start: (config) => ipcRenderer.invoke('ssh:start', config),
    stop: () => ipcRenderer.invoke('ssh:stop'),
    state: () => ipcRenderer.invoke('ssh:state'),
    onState: (callback) => subscribe('ssh:state', callback)
  }),
  ollama: Object.freeze({
    request: (request) => ipcRenderer.invoke('ollama:request', request)
  }),
  updates: Object.freeze({
    state: () => ipcRenderer.invoke('update:state'),
    check: (feedUrl) => ipcRenderer.invoke('update:check', feedUrl),
    restart: () => ipcRenderer.invoke('update:restart'),
    onState: (callback) => subscribe('update:state', callback)
  })
}));
