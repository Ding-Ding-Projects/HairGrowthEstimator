'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const presentationCore = require('./core/presentation');
const presentationCorpusCore = require('./core/presentation-corpus');
const schoolModeCore = require('./core/school-mode');
const narratorCore = require('./core/narrator');
const scheduledSettingsCore = require('./core/scheduled-settings');
const delightAttentionCore = require('./core/delight-attention');

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
    configure: (value) => ipcRenderer.invoke('school:configure', value),
    disable: (value) => ipcRenderer.invoke('school:disable', value),
    onChanged: (callback) => subscribe('school:changed', callback),
    suppressedFeatureIds: () => schoolModeCore.suppressedFeatureIds(),
    isFeatureSuppressed: (featureId, enabled) => schoolModeCore.isSchoolFeatureSuppressed(featureId, enabled),
    capturePreferences: (settings) => schoolModeCore.captureSchoolPreferences(settings),
    applyPreferences: (settings) => schoolModeCore.applySchoolPreferences(settings),
    restorePreferences: (settings, snapshot) => schoolModeCore.restoreSchoolPreferences(settings, snapshot)
  }),
  presentation: Object.freeze({
    renderMessage: (key, options) => presentationCore.renderMessage(key, options),
    renderLiteral: (value, options) => presentationCore.renderLiteral(value, options),
    renderCategoryMessage: (category, message, options) => presentationCore.renderCategoryMessage(category, message, options),
    resolveByEnglishSource: (source, options, values) => presentationCorpusCore.resolvePresentationByEnglishSource(source, options, values),
    resolveById: (id, options, values) => presentationCorpusCore.resolvePresentationById(id, options, values),
    resolveArticle: (id, options, context) => presentationCorpusCore.resolvePresentationArticle(id, options, context),
    corpusSummary: () => presentationCorpusCore.PRESENTATION_INVENTORY_SUMMARY
  }),
  narrator: Object.freeze({
    normalizeSettings: (value) => narratorCore.normalizeNarratorSettings(value),
    reconcileVoices: (previous, voices, options) => narratorCore.reconcileVoices(previous, voices, options),
    voiceOptions: (catalog, language) => narratorCore.voiceOptionsForLanguage(catalog, language),
    resolveVoice: (catalog, language, selectedVoiceId) => narratorCore.resolveVoiceSelection(catalog, language, selectedVoiceId),
    planUtterances: (request, settings, catalog, runtime) => narratorCore.planUtterances(request, settings, catalog, runtime),
    shouldYield: (runtime) => narratorCore.shouldYieldNarration(runtime)
  }),
  schedules: Object.freeze({
    normalizeRule: (value) => scheduledSettingsCore.normalizeScheduleRule(value),
    isRuleActive: (rule, instant) => scheduledSettingsCore.isRuleActive(rule, instant),
    chooseWinningRules: (rules, instant) => scheduledSettingsCore.chooseWinningRules(rules, instant),
    validateSourceResult: (rule, value, context) => scheduledSettingsCore.validateSourceResult(rule, value, context),
    resolveDocument: (document, instant, base, results) => scheduledSettingsCore.resolveScheduledSettings(document, instant, base, results),
    canonicalSourceScope: (value) => scheduledSettingsCore.canonicalSourceScope(value),
    resolve: (value) => ipcRenderer.invoke('schedule:resolve', value),
    setHomeAssistantToken: (value) => ipcRenderer.invoke('schedule:setHomeAssistantToken', value),
    hasHomeAssistantToken: (value) => ipcRenderer.invoke('schedule:hasHomeAssistantToken', value)
  }),
  delight: Object.freeze({
    shouldShow: (value) => delightAttentionCore.shouldShowStartupSurprise(value),
    record: () => delightAttentionCore.DIM_SUM_RECORD,
    photo: () => ipcRenderer.invoke('delight:photo')
  }),
  attention: Object.freeze({
    normalize: (value) => delightAttentionCore.normalizeAttentionSettings(value),
    deriveAttentionView: (settings, runtime) => delightAttentionCore.deriveAttentionView(settings, runtime)
  }),
  accessibility: Object.freeze({
    status: () => ipcRenderer.invoke('accessibility:status'),
    onChanged: (callback) => subscribe('accessibility:changed', callback)
  }),
  secrets: Object.freeze({
    setApiKey: (sync, value) => ipcRenderer.invoke('secret:setApiKey', { sync, value }),
    hasApiKey: (sync) => ipcRenderer.invoke('secret:hasApiKey', sync)
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
    chooseLogo: () => ipcRenderer.invoke('file:chooseLogo'),
    chooseConverterSource: () => ipcRenderer.invoke('file:chooseConverterSource'),
    convert: (value) => ipcRenderer.invoke('file:convert', value),
    export: (value) => ipcRenderer.invoke('file:export', value),
    showAppData: () => ipcRenderer.invoke('file:showAppData')
  }),
  vocabulary: Object.freeze({
    read: () => ipcRenderer.invoke('vocabulary:read'),
    replace: () => ipcRenderer.invoke('vocabulary:replace'),
    clear: () => ipcRenderer.invoke('vocabulary:clear')
  }),
  external: Object.freeze({
    openVsCode: (target) => ipcRenderer.invoke('external:openVsCode', target),
    openUrl: (url) => ipcRenderer.invoke('external:openUrl', url)
  }),
  history: Object.freeze({
    setCredential: (credential) => ipcRenderer.invoke('history:setCredential', credential),
    list: (options) => ipcRenderer.invoke('history:list', options),
    read: (commit, credential) => ipcRenderer.invoke('history:read', commit, credential),
    diff: (fromCommit, toCommit, credential) => ipcRenderer.invoke('history:diff', fromCommit, toCommit, credential),
    restore: (commit, credential) => ipcRenderer.invoke('history:restore', commit, credential),
    label: (commit, label, credential) => ipcRenderer.invoke('history:label', commit, label, credential),
    prune: (maxEntries, credential) => ipcRenderer.invoke('history:prune', maxEntries, credential),
    export: (options) => ipcRenderer.invoke('history:export', options),
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
  regex: Object.freeze({
    evaluate: (request) => ipcRenderer.invoke('regex:evaluate', request)
  }),
  updates: Object.freeze({
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    restart: () => ipcRenderer.invoke('update:restart'),
    onState: (callback) => subscribe('update:state', callback)
  })
}));
