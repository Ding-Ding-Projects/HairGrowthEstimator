'use strict';

const HairMath = require('../shared/hair');

const LANGUAGE_MODES = new Set(['en', 'yue', 'bilingual']);
const THEMES = new Set(['dark', 'light', 'contrast']);
const TAB_DOCKS = new Set(['left', 'right', 'top', 'bottom']);

function createDefaultState(todayIso) {
  const today = HairMath.formatIsoDate(HairMath.parseIsoDate(todayIso, 'Today'));
  return {
    schemaVersion: 2,
    revision: 0,
    profile: {
      baselineLengthCm: 1.2,
      baselineDate: today,
      growthRateCmPerMonth: 1,
      targetLengthCm: 12,
      displayUnit: 'cm'
    },
    haircuts: [],
    settings: {
      displayName: 'Hair Growth Estimator',
      language: 'en',
      theme: 'dark',
      density: 'comfortable',
      accent: '#73e0c1',
      tabDock: 'left',
      funnyEnglish: 5,
      funnyCantonese: 5,
      showDialogEmoji: true,
      reducedMotion: false,
      narrator: {
        enabled: false,
        language: 'en',
        englishVoiceId: 'auto',
        cantoneseVoiceId: 'auto',
        rate: 1,
        pitch: 1
      },
      adhd: {
        focus: false,
        lowStimulation: false,
        timeAwareness: false,
        oneThing: false,
        momentum: false,
        nextAction: ''
      },
      sync: {
        mode: 'local',
        serverUrl: 'http://127.0.0.1:4782',
        profileId: 'default',
        timeoutMs: 8000,
        ssh: {
          host: '',
          port: 22,
          username: '',
          remoteApiPort: 4782,
          localForwardPort: 14782,
          keyFile: ''
        }
      },
      updateFeedUrl: 'https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/latest/download/',
      statusHubUrl: '',
      logo: {
        preset: 'growth-arc',
        customDataUrl: '',
        fit: 'contain',
        background: '#063f36'
      },
      rainbowSpeedLevel: 3
    },
    schedules: [],
    tabs: {
      order: ['dashboard', 'haircuts', 'gallery', 'tools', 'integrations', 'settings', 'docs', 'status'],
      pinned: ['dashboard'],
      groups: [{ id: 'daily', name: 'Daily care', tabs: ['dashboard', 'haircuts', 'gallery'], collapsed: false }]
    },
    appearance: {},
    notifications: [],
    supportTickets: [],
    converterHistory: [],
    vocabulary: { loaded: false, cacheVersion: null },
    updatedAt: new Date().toISOString()
  };
}

function boundedString(value, max, fallback = '') {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function boundedLevel(value, fallback = 5) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : fallback;
}

function boundedArray(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function validateState(input, todayIso) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('State must be an object.');
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized) > 1024 * 1024) throw new RangeError('State exceeds 1 MiB.');
  const defaults = createDefaultState(todayIso);
  const settings = input.settings && typeof input.settings === 'object' ? input.settings : {};
  const narrator = settings.narrator && typeof settings.narrator === 'object' ? settings.narrator : {};
  const adhd = settings.adhd && typeof settings.adhd === 'object' ? settings.adhd : {};
  const sync = settings.sync && typeof settings.sync === 'object' ? settings.sync : {};
  const ssh = sync.ssh && typeof sync.ssh === 'object' ? sync.ssh : {};
  const logo = settings.logo && typeof settings.logo === 'object' ? settings.logo : {};
  const haircuts = boundedArray(input.haircuts, 5000).map(HairMath.normalizeHaircut).sort((a, b) => b.date.localeCompare(a.date));
  const safe = {
    ...defaults,
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision + 1 : 1,
    profile: HairMath.validateProfile(input.profile),
    haircuts,
    settings: {
      ...defaults.settings,
      displayName: boundedString(settings.displayName, 80, defaults.settings.displayName).trim() || defaults.settings.displayName,
      language: LANGUAGE_MODES.has(settings.language) ? settings.language : defaults.settings.language,
      theme: THEMES.has(settings.theme) ? settings.theme : defaults.settings.theme,
      density: ['compact', 'comfortable', 'spacious'].includes(settings.density) ? settings.density : defaults.settings.density,
      accent: /^#[0-9a-fA-F]{6}$/.test(settings.accent) ? settings.accent : defaults.settings.accent,
      tabDock: TAB_DOCKS.has(settings.tabDock) ? settings.tabDock : defaults.settings.tabDock,
      funnyEnglish: boundedLevel(settings.funnyEnglish),
      funnyCantonese: boundedLevel(settings.funnyCantonese),
      showDialogEmoji: settings.showDialogEmoji !== false,
      reducedMotion: Boolean(settings.reducedMotion),
      narrator: {
        enabled: Boolean(narrator.enabled),
        language: ['en', 'yue', 'both'].includes(narrator.language) ? narrator.language : 'en',
        englishVoiceId: boundedString(narrator.englishVoiceId, 256, 'auto'),
        cantoneseVoiceId: boundedString(narrator.cantoneseVoiceId, 256, 'auto'),
        rate: Math.max(0.5, Math.min(2, Number(narrator.rate) || 1)),
        pitch: Math.max(0, Math.min(2, Number(narrator.pitch) || 1))
      },
      adhd: {
        focus: Boolean(adhd.focus),
        lowStimulation: Boolean(adhd.lowStimulation),
        timeAwareness: Boolean(adhd.timeAwareness),
        oneThing: Boolean(adhd.oneThing),
        momentum: Boolean(adhd.momentum),
        nextAction: boundedString(adhd.nextAction, 240)
      },
      sync: {
        mode: ['local', 'server', 'ssh'].includes(sync.mode) ? sync.mode : 'local',
        serverUrl: boundedString(sync.serverUrl, 2048, defaults.settings.sync.serverUrl),
        profileId: /^[a-zA-Z0-9_-]{1,64}$/.test(sync.profileId) ? sync.profileId : 'default',
        timeoutMs: Math.max(1000, Math.min(30000, Number(sync.timeoutMs) || 8000)),
        ssh: {
          host: boundedString(ssh.host, 253),
          port: Number(ssh.port) || 22,
          username: boundedString(ssh.username, 64),
          remoteApiPort: Number(ssh.remoteApiPort) || 4782,
          localForwardPort: Number(ssh.localForwardPort) || 14782,
          keyFile: boundedString(ssh.keyFile, 2048)
        }
      },
      updateFeedUrl: boundedString(settings.updateFeedUrl, 2048, defaults.settings.updateFeedUrl),
      statusHubUrl: boundedString(settings.statusHubUrl, 2048),
      logo: {
        preset: ['growth-arc', 'strand', 'minimal'].includes(logo.preset) ? logo.preset : 'growth-arc',
        customDataUrl: boundedString(logo.customDataUrl, 3 * 1024 * 1024),
        fit: ['contain', 'cover', 'fill'].includes(logo.fit) ? logo.fit : 'contain',
        background: /^#[0-9a-fA-F]{6}$/.test(logo.background) ? logo.background : '#063f36'
      },
      rainbowSpeedLevel: boundedLevel(settings.rainbowSpeedLevel, 3)
    },
    schedules: boundedArray(input.schedules, 128).map((item) => ({
      id: boundedString(item?.id, 64, `schedule-${Date.now()}`),
      label: boundedString(item?.label, 120, 'Scheduled settings'),
      enabled: item?.enabled !== false,
      weekdays: boundedArray(item?.weekdays, 7).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
      startTime: /^\d{2}:\d{2}$/.test(item?.startTime) ? item.startTime : '09:00',
      endTime: /^\d{2}:\d{2}$/.test(item?.endTime) ? item.endTime : '17:00',
      theme: THEMES.has(item?.theme) ? item.theme : null,
      language: LANGUAGE_MODES.has(item?.language) ? item.language : null
    })),
    tabs: {
      order: boundedArray(input.tabs?.order, 64).map((value) => boundedString(value, 64)).filter(Boolean),
      pinned: boundedArray(input.tabs?.pinned, 64).map((value) => boundedString(value, 64)).filter(Boolean),
      groups: boundedArray(input.tabs?.groups, 32).map((group) => ({
        id: boundedString(group?.id, 64, `group-${Date.now()}`),
        name: boundedString(group?.name, 80, 'Group'),
        tabs: boundedArray(group?.tabs, 64).map((value) => boundedString(value, 64)).filter(Boolean),
        collapsed: Boolean(group?.collapsed)
      }))
    },
    appearance: input.appearance && typeof input.appearance === 'object' && !Array.isArray(input.appearance) ? input.appearance : {},
    notifications: boundedArray(input.notifications, 500).map((item) => ({
      id: boundedString(item?.id, 64, `notice-${Date.now()}`),
      title: boundedString(item?.title, 120, 'Notification'),
      body: boundedString(item?.body, 1000),
      kind: ['info', 'success', 'warning', 'error'].includes(item?.kind) ? item.kind : 'info',
      timestamp: typeof item?.timestamp === 'string' && !Number.isNaN(Date.parse(item.timestamp)) ? item.timestamp : new Date().toISOString(),
      dismissed: Boolean(item?.dismissed)
    })),
    supportTickets: boundedArray(input.supportTickets, 500),
    converterHistory: boundedArray(input.converterHistory, 500),
    vocabulary: { loaded: Boolean(input.vocabulary?.loaded), cacheVersion: Number(input.vocabulary?.cacheVersion) || null },
    updatedAt: new Date().toISOString()
  };
  if (!safe.tabs.order.length) safe.tabs.order = [...defaults.tabs.order];
  return safe;
}

module.exports = { LANGUAGE_MODES, THEMES, TAB_DOCKS, createDefaultState, validateState };
