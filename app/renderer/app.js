(() => {
  'use strict';

  const bridge = window.hairGrowth;
  const Hair = window.HairMath;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const regexState = new WeakMap();
  const searchGenerations = new WeakMap();
  const utf8Encoder = new TextEncoder();
  const REGEX_LIMITS = Object.freeze({
    patternBytes: 512,
    candidateBytes: 8192,
    candidateTotalBytes: 262144,
    candidates: 256,
    sampleBytes: 65536,
    replacementBytes: 8192,
    results: 128,
    deadlineMs: 250
  });
  const dialogOpeners = new WeakMap();
  let contextMenuOpener = null;
  let regexPopoverOpener = null;
  const unlockedForSession = new Set();
  const lockedElements = new Map();
  const selectedNotifications = new Set();
  const selectedSupportTickets = new Set();
  let state;
  let provenance;
  let schoolRecord;
  let activeTab = 'dashboard';
  let activeContextTarget = null;
  let appearanceTarget = null;
  let lockTarget = null;
  let unlockTarget = null;
  let converterSource = null;
  let selectedConverter = 'json-pretty';
  let growthAnimation = null;
  let confirmAction = null;
  let saveTimer = null;
  let saveQueue = Promise.resolve();
  let stateMutationSequence = 0;
  let narratorQueue = [];
  let narratorSpeaking = false;
  let sessionOpenedAt = Date.now();
  let vocabularyCache = { status: 'missing', schemaVersion: null, entries: Object.freeze({}) };
  let historyCredential = '';
  let historyItems = [];
  let visibleNotificationItems = [];
  let visibleSupportTicketItems = [];
  let selectedHistoryCommit = '';
  let activeGrowthStageIndex = 0;
  let regexValidationGeneration = 0;
  let regexWorkbenchGeneration = 0;
  let historyRenderGeneration = 0;

  const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');

  const COMMAND_REGISTRY = Object.freeze({
    'open-palette': Object.freeze({ label: 'Open command palette', shortcut: 'Ctrl+Shift+F', run: () => openPalette() }),
    'open-notifications': Object.freeze({ label: 'Open notification history', shortcut: 'Ctrl+Shift+N', run: () => openManagedDialog($('#notification-dialog')) }),
    'edit-appearance': Object.freeze({ label: 'Edit appearance…', shortcut: 'Shift+F10', run: (target) => openAppearance(target) }),
    'lock-element': Object.freeze({ label: 'Lock this element…', shortcut: 'Ctrl+L', run: (target) => openLockWizard(target) })
  });

  const translations = {
    en: {
      subtitle: 'A private, local-first growth journal',
      saved: 'Saved',
      haircutSaved: 'Haircut saved and baseline reset.',
      estimate: 'Estimate',
      noHaircuts: 'No haircuts match this view yet.',
      vocabularyNoFile: 'No private file is loaded. Original shipped wording is active.',
      vocabularyLoading: 'Validating the selected private file locally.',
      vocabularyLoaded: 'Loaded locally. Approved wording is active.',
      vocabularyInvalid: 'The selected or cached file is invalid. Original shipped wording is active.',
      vocabularyChoose: 'Choose private JSON',
      vocabularyReplace: 'Replace private JSON',
      vocabularyClear: 'Clear local cache'
    },
    yue: {
      subtitle: '私人本機生髮日記，啲頭髮慢慢行，資料唔使周圍飛',
      saved: '已經收好，穩陣過夾萬入面再放夾萬',
      haircutSaved: '剪髮紀錄收好，條生長線由新長度再出發。',
      estimate: '估算',
      noHaircuts: '暫時搵唔到剪髮紀錄，個清單光滑過新剃頭。',
      vocabularyNoFile: '未載入私人檔案，而家用返原裝字句。',
      vocabularyLoading: '正喺本機驗證揀選嘅私人檔案。',
      vocabularyLoaded: '已經喺本機載入，核准字句而家生效。',
      vocabularyInvalid: '揀選或快取嘅檔案無效，而家用返原裝字句。',
      vocabularyChoose: '揀選私人 JSON',
      vocabularyReplace: '更換私人 JSON',
      vocabularyClear: '清除本機快取'
    }
  };

  const docs = [
    {
      id: 'about',
      title: 'About this build',
      body: `<h3>About Hair Growth Estimator 1.0.0</h3><p>Release code name: <strong>Classic Har Gow · 蝦餃</strong>, public catalog record <code>hk-dish-0001</code>. The photo remains in the public dim-sum catalog and is not copied into this application.</p><p><a href="#" data-external-url="https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png">Open the public catalog photo</a>.</p><h4>Stable identity</h4><p>Changing the display name or logo changes presentation only. It never changes package identity, data location, executable name, installer identity, or update feed. The installed application owns one exact HTTPS update source. Page content cannot select a different feed, and restart is authorized only for the exact downloaded event that produced the current ready state.</p><h4>Suggested articles</h4><p>Hair growth estimation, Privacy and local credentials, Status and recovery.</p>`
    },
    {
      id: 'estimation',
      title: 'Hair growth estimation',
      body: `<h3>Hair growth estimation</h3><p>The estimator stores all lengths canonically in centimetres and converts inches using exactly <strong>1 inch = 2.54 cm</strong>. The shipped starting rate is <strong>1.0 cm per month</strong>, which remains fully adjustable because real growth varies by person, location, health, and time.</p><p>This is a planning estimate, not diagnosis, medical advice, or a promise about actual growth. The general starting point is consistent with <a href="#" data-external-url="https://www.ncbi.nlm.nih.gov/books/NBK499948/">NCBI Bookshelf, Anatomy, Hair</a>.</p><h4>Failure modes</h4><p>Invalid dates, non-finite values, lengths outside 0 to 300 cm, and monthly rates outside 0.05 to 5 cm are refused with a factual message.</p><h4>Suggested articles</h4><p>Haircut resets, Private synchronization, Measurement units.</p>`
    },
    {
      id: 'haircuts',
      title: 'Haircut resets and history',
      body: `<h3>Haircut resets and history</h3><p>A haircut requires its date, estimated pre-cut length, measured post-cut length, and an optional note. Post-cut length cannot exceed pre-cut length. After every create, edit, delete, or service pull, the chronologically newest haircut becomes the active baseline. If no haircut remains, the last manually entered baseline returns instead of being lost.</p><p>Editing preserves the record identity. Deletion uses a two-key and full-slider confirmation.</p><h4>Export</h4><p>JSON retains the active profile, retained manual fallback, and complete haircut records. CSV and Markdown preserve the visible haircut fields. Stored credentials and private vocabulary are never included.</p><h4>Suggested articles</h4><p>Hair growth estimation, Local version history, Private synchronization.</p>`
    },
    {
      id: 'sync',
      title: 'Private synchronization',
      body: `<h3>Private synchronization</h3><p>Local mode requires no service. Direct HTTP is accepted only for loopback addresses on this computer. A direct non-loopback service must use HTTPS. Its API key is stored through operating-system protection and bound to that exact canonical origin. Public health and version probes never include the key.</p><p>SSH mode invokes <code>ssh.exe</code> directly without a shell, enables BatchMode, requires an existing trusted host key, uses the persistent user known_hosts file, disables host-key updates, and tears down the child process when stopped or when the application exits. Service traffic ignores the direct URL and uses only the validated loopback forward whose host, SSH port, remote API port, and local forward port match the active tunnel. A disconnected or mismatched tunnel is refused, and its credential is bound to the SSH destination rather than a reusable local port.</p><h4>Pull validation</h4><p>A downloaded profile and every downloaded haircut are validated together before any live state changes. An invalid growth rate, missing pre-cut length, post-cut length above pre-cut length, invalid identifier, or oversized record set leaves the existing local state unchanged.</p><h4>Security boundary</h4><p>The service accepts monthly growth rates from 0.05 through 5 cm, requires both haircut lengths, and refuses apparent growth during a cut. It refuses every non-loopback bind without a strong API key. It validates CORS origins, request sizes, timeouts, dates, lengths, counts, and methods. It never logs request bodies or secrets.</p><h4>Deterministic container build</h4><p>The Dockerfile pins the exact multi-platform Node base-image digest. Its build context is the bounded <code>server/</code> directory, with the root <code>Dockerfile</code> selected explicitly. Release builds target <code>linux/amd64</code>, pass the release version, commit SHA, and commit timestamp as <code>BUILD_VERSION</code>, <code>BUILD_REVISION</code>, and <code>SOURCE_DATE_EPOCH</code>, and export <code>hair-growth-api-1.0.0-linux-amd64.oci.tar</code> as an OCI archive. Registry publication is a separate optional action; local hosting never requires it.</p><h4>Suggested articles</h4><p>Haircut resets, Local persistence and version history, Privacy and local credentials.</p>`
    },
    {
      id: 'persistence',
      title: 'Local persistence and version history',
      body: `<h3>Local persistence and version history</h3><p>Main-process saves run through one serialized queue. Each accepted write must carry the current authoritative revision; a stale candidate is refused rather than overwriting newer data. The primary state file is written atomically before a redacted local-history revision is attempted.</p><p>If local Git history cannot record a revision, the primary save remains valid and the application reports the history degradation. Orderly shutdown waits for both the state queue and history queue before closing, then stops any active SSH tunnel.</p><h4>Protected history manager</h4><p>The history manager requires its own credential stored through operating-system protection. It can search redacted revisions, filter by typed date range and actions discovered from the history itself, show action counts, compare two revisions, add labels, restore, prune by an explicit retention value, and export the filtered redacted view. A restore is appended as a new revision, so it never rewrites the revision selected for recovery.</p><h4>Recovery boundary</h4><p>History snapshots omit SSH key paths, custom logo bytes, private vocabulary content, and credentials. A history write failure never reverses a successful primary save. Shutdown draining does not rewrite or prune history.</p><h4>Suggested articles</h4><p>Haircut resets and history, Private synchronization, Privacy and local credentials.</p>`
    },
    {
      id: 'privacy',
      title: 'Privacy and local credentials',
      body: `<h3>Privacy and local credentials</h3><p>Hair records remain on this computer unless you explicitly use service sync. API keys, toy-lock credentials, and authenticator secrets use operating-system protection. Secrets are omitted from ordinary exports, local history, notifications, and logs.</p><h4>Personal vocabulary file</h4><p>The optional local JSON file uses one root object with <code>schemaVersion: 1</code> and an <code>entries</code> object. The complete UTF-8 payload is limited to 256 KiB, 4,096 entries, depth 2, keys from 1 through 160 Unicode code points, and string values through 1,000 Unicode code points. Malformed UTF-8, duplicate keys, unknown fields or versions, unsafe keys, and out-of-bound values are rejected before anything is applied.</p><p>Validation, replacement, and the private application-data cache remain local and make no network request. Every cache load is revalidated. A rejected replacement keeps the last valid cache, while an explicitly cleared cache is purged and immediately restores the original shipped wording. School mode suppresses the vocabulary controls and replacements without deleting the last valid private cache.</p><p>No private mapping, source filename, source path, entry count, or mapping value appears in source, status copy, logs, exports, notifications, or local history.</p><h4>Suggested articles</h4><p>Private synchronization, Toy locks, Local version history.</p>`
    },
    {
      id: 'tools',
      title: 'Regex, converter, and local model tools',
      body: `<h3>Local tools</h3><p>Plain-text search remains the default. When regex is enabled, every search field, anchored builder validation, and full workbench evaluation crosses the privileged boundary into a dedicated worker. Pattern, candidate, sample, replacement, capture, and result sizes are bounded. Each worker has a 250 ms hard deadline and is terminated when that deadline expires, so an adversarial pattern cannot keep the interface thread running it.</p><p>The full workbench uses the running JavaScript RegExp engine with live capture tables, a bounded replacement preview, capability notes, truncation notices, and adversarial-risk warnings. Results are capped at 128 matches.</p><p>The local file converter enables only bundled text, JSON, hexadecimal, and base64 adapters. Other format families remain visible and disabled with an exact reason. The local model manager talks only to Ollama on loopback and never embeds a cloud model service.</p><h4>Suggested articles</h4><p>Privacy, Export formats, Status and recovery.</p>`
    },
    {
      id: 'locks',
      title: 'Toy locks and local support tickets',
      body: `<h3>Toy locks</h3><p>Every element can receive its own PIN, password, TOTP, or ordered combination. The lock is an interface speed bump, not security or encryption. A locked wrapper refuses pointer and keyboard activation until its own credential set verifies.</p><p>The fictional Support Tickets desk sends nothing. Its resolution opens the application-data folder so you can delete the local record yourself.</p><h4>Suggested articles</h4><p>Privacy, Local history, Settings.</p>`
    }
  ];

  const changelog = [
    {
      version: '1.0.0',
      date: '2026-08-24',
      commit: 'pending-release-commit',
      changes: ['Initial hair growth estimator', 'Haircut reset journal', 'Centimetre and inch display', 'Local and private service modes', 'Eight-stage animated image reference', 'SSH service routing bound to the connected local forward', 'Service credentials bound to the exact direct or SSH destination and omitted from public probes', 'Direct HTTP limited to loopback while non-loopback direct service connections require HTTPS', 'Canonical main-process update feed with trusted-frame and exact ready-event restart authorization', 'Killable worker-based regex evaluation with hard deadlines for every search and workbench path', 'Validated service pulls that leave local state unchanged when rejected', 'Newest-haircut baseline reconciliation with a retained manual fallback', 'Serialized revisioned saves with explicit history degradation and orderly queue drain', 'Strict local personal-vocabulary validation, cache recovery, clear, and School-mode suppression', 'Complete tab relationships, axis-aware roving focus, named dialogs, opener focus restoration, reduced-motion progression, and 44-pixel interaction targets', 'Protected searchable history, dismissible notification history, local Support Tickets management, and persisted attention accommodations', 'Release code name Classic Har Gow · 蝦餃, catalog record hk-dish-0001']
    }
  ];

  const converterCatalog = [
    { category: 'Documents and PDF', adapters: [{ id: 'pdf-tools', label: 'PDF inspect, split, merge, extract, reorder, rotate, metadata', enabled: false, reason: 'No bounded bundled PDF adapter is present in this release.' }] },
    { category: 'Images', adapters: [{ id: 'image-convert', label: 'PNG, JPEG, WebP conversion', enabled: false, reason: 'Logo validation is available, but general image conversion is not bundled.' }] },
    { category: 'Audio', adapters: [{ id: 'audio-convert', label: 'Audio conversion', enabled: false, reason: 'No offline audio adapter is bundled.' }] },
    { category: 'Video', adapters: [{ id: 'video-convert', label: 'Video conversion', enabled: false, reason: 'No offline video adapter is bundled.' }] },
    { category: 'Archives', adapters: [{ id: 'archive-convert', label: 'ZIP and 7z', enabled: false, reason: 'No bounded archive adapter is bundled.' }] },
    { category: 'Structured Data and Spreadsheets', adapters: [{ id: 'json-pretty', label: 'JSON to formatted JSON', enabled: true, reason: 'Bundled JavaScript JSON parser with post-write validation.' }] },
    { category: 'Code and Text', adapters: [{ id: 'normalize-text', label: 'Normalize text to UTF-8 CRLF', enabled: true, reason: 'Bundled text adapter with a 10 MiB bound.' }] },
    { category: 'Binary Encodings', adapters: [{ id: 'base64', label: 'Binary to base64', enabled: true, reason: 'Bundled byte encoder.' }, { id: 'hex', label: 'Binary to hexadecimal', enabled: true, reason: 'Bundled byte encoder.' }] }
  ];

  function localIsoDate(date = new Date()) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function copy(value) {
    return structuredClone(value);
  }

  function text(key) {
    const language = schoolRecord?.enabled ? 'en' : state.settings.language;
    if (language === 'yue') return translations.yue[key] || translations.en[key] || key;
    if (language === 'bilingual') return `${translations.en[key] || key} · ${translations.yue[key] || key}`;
    return translations.en[key] || key;
  }

  function vocabularyEnabledForSurface() {
    return !schoolRecord?.enabled && vocabularyCache.status === 'loaded';
  }

  function escapeVocabularyPattern(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function applyVocabularyCopy(value, boundary) {
    const source = String(value ?? '');
    if (!vocabularyEnabledForSurface() || !['owned-visible', 'owned-accessible'].includes(boundary)) return source;
    const keys = Object.keys(vocabularyCache.entries || {}).sort((left, right) => right.length - left.length || left.localeCompare(right));
    if (!keys.length) return source;
    const pattern = new RegExp(keys.map(escapeVocabularyPattern).join('|'), 'g');
    return source.replace(pattern, (match) => vocabularyCache.entries[match]);
  }

  function setOwnedText(element, value) {
    if (!element || element.hasAttribute('data-vocabulary-preserve')) return;
    element.dataset.vocabularyBaseText = String(value ?? '');
    element.textContent = applyVocabularyCopy(element.dataset.vocabularyBaseText, 'owned-visible');
  }

  function setOwnedAttribute(element, name, value) {
    if (!element || element.hasAttribute('data-vocabulary-preserve')) return;
    const dataName = `vocabularyBase${name.replace(/(^|-)([a-z])/g, (_match, _separator, letter) => letter.toUpperCase())}`;
    element.dataset[dataName] = String(value ?? '');
    element.setAttribute(name, applyVocabularyCopy(element.dataset[dataName], 'owned-accessible'));
  }

  function applyOwnedVocabularyBoundaries() {
    $$('[data-vocabulary-owned]').forEach((element) => {
      if (element.closest('[data-vocabulary-preserve]')) return;
      if (!element.dataset.vocabularyBaseText && element.childElementCount === 0) element.dataset.vocabularyBaseText = element.textContent;
      if (element.dataset.vocabularyBaseText !== undefined && element.childElementCount === 0) {
        element.textContent = applyVocabularyCopy(element.dataset.vocabularyBaseText, 'owned-visible');
      }
      for (const name of ['aria-label', 'placeholder', 'title']) {
        if (!element.hasAttribute(name)) continue;
        const dataName = `vocabularyBase${name.replace(/(^|-)([a-z])/g, (_match, _separator, letter) => letter.toUpperCase())}`;
        if (!element.dataset[dataName]) element.dataset[dataName] = element.getAttribute(name);
        element.setAttribute(name, applyVocabularyCopy(element.dataset[dataName], 'owned-accessible'));
      }
    });
  }

  function renderVocabularyStatus(status = vocabularyCache.status) {
    if (schoolRecord?.enabled) return;
    const key = status === 'loaded' ? 'vocabularyLoaded' : status === 'loading' ? 'vocabularyLoading' : status === 'invalid' ? 'vocabularyInvalid' : 'vocabularyNoFile';
    setOwnedText($('#vocabulary-state'), text(key));
    setOwnedText($('#choose-vocabulary'), text(status === 'loaded' ? 'vocabularyReplace' : 'vocabularyChoose'));
    setOwnedText($('#clear-vocabulary'), text('vocabularyClear'));
  }

  async function loadVocabularyCache() {
    const result = await bridge.vocabulary.read();
    vocabularyCache = {
      status: result.status === 'loaded' ? 'loaded' : result.status === 'invalid' ? 'invalid' : 'missing',
      schemaVersion: result.schemaVersion || null,
      entries: Object.freeze({ ...(result.entries || {}) })
    };
    state.vocabulary = { loaded: vocabularyCache.status === 'loaded', cacheVersion: vocabularyCache.schemaVersion };
    applyOwnedVocabularyBoundaries();
    renderVocabularyStatus();
    return vocabularyCache;
  }

  function formatLength(cm, unit = state.profile.displayUnit, digits = 2) {
    const value = Hair.fromCm(cm, unit);
    return `${value.toFixed(digits)} ${unit}`;
  }

  function notify(title, body, kind = 'info', persist = true) {
    const item = { id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, body, kind, timestamp: new Date().toISOString(), dismissed: false };
    if (persist && state) {
      state.notifications.unshift(item);
      state.notifications = state.notifications.slice(0, 500);
      scheduleSave('Notification recorded');
    }
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.dataset.noticeId = item.id;
    if (['error', 'warning'].includes(kind)) toast.setAttribute('role', 'alert');
    toast.innerHTML = `<strong></strong><span></span>`;
    setOwnedText($('strong', toast), title);
    setOwnedText($('span', toast), body);
    if (['error', 'warning'].includes(kind)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-dismiss';
      button.dataset.dismissNotice = item.id;
      setOwnedText(button, 'Dismiss notification');
      setOwnedAttribute(button, 'aria-label', `Dismiss ${title}`);
      button.addEventListener('click', () => dismissNotification(item.id));
      toast.append(button);
    }
    $('#toast-region').append(toast);
    if (!['error', 'warning'].includes(kind)) setTimeout(() => toast.remove(), 5200);
    narrate(`${title}. ${body}`, kind);
    renderNotifications();
  }

  function dismissNotification(id) {
    const notice = state?.notifications.find((item) => item.id === id);
    if (notice) {
      notice.dismissed = true;
      scheduleSave('Notification dismissed');
    }
    $(`.toast[data-notice-id="${CSS.escape(id)}"]`)?.remove();
    renderNotifications();
  }

  function handleError(error, context = 'Operation could not finish') {
    const message = error?.message || String(error);
    notify(context, message, 'error');
  }

  function queueStateWrite(event) {
    const mutationAtRequest = stateMutationSequence;
    const candidate = copy(state);
    const operation = saveQueue.then(async () => {
      candidate.revision = state.revision;
      const saved = await bridge.state.write(candidate, event);
      if (stateMutationSequence === mutationAtRequest) {
        state = saved;
      } else {
        state.revision = saved.revision;
        state.updatedAt = saved.updatedAt;
      }
      return state;
    });
    saveQueue = operation.catch(() => {});
    return operation;
  }

  function scheduleSave(event = 'Settings changed') {
    stateMutationSequence += 1;
    if (!/^(Notification|Momentum prompt|History view)/.test(event) && state?.settings?.adhd) state.settings.adhd.lastMeaningfulChangeAt = new Date().toISOString();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await queueStateWrite(event); } catch (error) { handleError(error, 'Local save failed'); }
    }, 180);
  }

  async function saveNow(event) {
    stateMutationSequence += 1;
    if (state?.settings?.adhd) state.settings.adhd.lastMeaningfulChangeAt = new Date().toISOString();
    clearTimeout(saveTimer);
    return queueStateWrite(event);
  }

  function applyTranslations() {
    $$('[data-i18n]').forEach((element) => { setOwnedText(element, text(element.dataset.i18n)); });
    document.documentElement.lang = schoolRecord?.enabled || state.settings.language === 'en' ? 'en' : state.settings.language === 'yue' ? 'yue-Hant-HK' : 'en';
  }

  function prefersReducedMotion() {
    return Boolean(state?.settings.reducedMotion || reducedMotionQuery.matches);
  }

  function applySettings() {
    document.body.dataset.theme = state.settings.theme;
    document.body.dataset.density = state.settings.density;
    document.body.dataset.tabDock = state.settings.tabDock;
    document.documentElement.style.setProperty('--accent', state.settings.accent);
    const rainbowDurations = [20, 13, 8, 5, 3];
    document.documentElement.style.setProperty('--rainbow-duration', `${rainbowDurations[state.settings.rainbowSpeedLevel - 1]}s`);
    document.body.classList.toggle('low-stimulation', state.settings.adhd.lowStimulation || prefersReducedMotion());
    document.body.classList.toggle('focus-mode', state.settings.adhd.focus);
    document.body.classList.toggle('school-active', Boolean(schoolRecord?.enabled));
    if (!growthAnimation) setOwnedText($('#play-growth'), prefersReducedMotion() ? 'Show next stage' : 'Play growth');
    $('#app-name').textContent = state.settings.displayName;
    bridge.window.setTitle(state.settings.displayName);
    $('#app-logo').src = state.settings.logo.customDataUrl || '../../assets/app-icon-48.png';
    $('#app-logo').style.objectFit = state.settings.logo.fit;
    $('#app-logo').style.background = state.settings.logo.background;
    const tabStrip = $('#tab-strip');
    tabStrip.setAttribute('aria-orientation', ['left', 'right'].includes(state.settings.tabDock) ? 'vertical' : 'horizontal');
    applyTranslations();
    applySavedAppearances();
    if (schoolRecord?.enabled) {
      $$('[data-settings-keywords]').forEach((card) => {
        const words = card.dataset.settingsKeywords.toLowerCase();
        card.hidden = /language|funny|cantonese|vocabulary|dim.sum/.test(words);
      });
    } else {
      $$('[data-settings-keywords]').forEach((card) => { card.hidden = false; });
    }
    $$('[data-school-feature="vocabulary"]').forEach((element) => { element.hidden = Boolean(schoolRecord?.enabled); });
    applyOwnedVocabularyBoundaries();
    renderVocabularyStatus();
    renderAttentionAccommodations();
  }

  function syncDialogEmoji(dialog) {
    if (!dialog) return;
    const heading = $('.dialog-header h3', dialog);
    if (!heading) return;
    let emoji = $('.dialog-emoji', dialog);
    if (!emoji) {
      emoji = document.createElement('span');
      emoji.className = 'dialog-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      heading.prepend(emoji);
    }
    const symbols = { 'command-palette': '⌕', 'notification-dialog': '◉', 'appearance-dialog': '🎨', 'lock-dialog': '🔒', 'unlock-dialog': '🔓', 'support-dialog': '🎫', 'super-confirm-dialog': '⚠' };
    emoji.textContent = symbols[dialog.id] || '•';
    dialog.classList.toggle('show-dialog-emoji', Boolean(state?.settings.showDialogEmoji));
  }

  function openManagedDialog(dialog, options = {}) {
    if (!dialog) return;
    if (!dialog.open) dialogOpeners.set(dialog, options.opener || document.activeElement);
    syncDialogEmoji(dialog);
    if (!dialog.open) {
      if (options.modal) dialog.showModal();
      else dialog.show();
    }
    const focusTarget = options.focus || $('input:not([type="hidden"]), button, select, textarea, [tabindex="0"]', dialog);
    focusTarget?.focus({ preventScroll: true });
  }

  function restoreDialogFocus(dialog) {
    const opener = dialogOpeners.get(dialog);
    dialogOpeners.delete(dialog);
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
  }

  function closeManagedDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  function applyCommandRegistry() {
    $$('[data-command-id]').forEach((control) => {
      const command = COMMAND_REGISTRY[control.dataset.commandId];
      if (!command) return;
      const label = $('.command-label', control);
      if (label) setOwnedText(label, command.label);
      setOwnedAttribute(control, 'aria-label', command.label);
      control.title = command.shortcut ? `${command.label}, ${command.shortcut}` : command.label;
      const shortcut = $('kbd', control);
      if (shortcut) shortcut.textContent = command.shortcut;
    });
  }

  function shortcutMatches(event, shortcut) {
    const pieces = shortcut.toLocaleLowerCase().split('+');
    const key = pieces.at(-1);
    return event.key.toLocaleLowerCase() === key
      && event.ctrlKey === pieces.includes('ctrl')
      && event.shiftKey === pieces.includes('shift')
      && event.altKey === pieces.includes('alt');
  }

  function clonePaletteControl(source, entry) {
    const clone = source.cloneNode(true);
    clone.removeAttribute('id');
    clone.id = `palette-control-${entry.id}`;
    clone.setAttribute('aria-label', entry.label);
    clone.dataset.vocabularyOwned = '';
    return clone;
  }

  function displayProvenance() {
    const detail = $('#provenance-detail');
    const chip = $('#provenance-state');
    const facts = $('#status-provenance');
    facts.replaceChildren();
    if (provenance.available) {
      const formatted = new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
      }).format(new Date(provenance.updatedAt));
      detail.textContent = `Version ${provenance.version}, updated ${formatted}, from ${provenance.timestampSource}. Commit ${provenance.commit.slice(0, 12)}. Unsigned build.`;
      chip.textContent = 'Artifact-bound';
      chip.className = 'state-chip success';
      $('#title-version').textContent = `v${provenance.version}`;
      const rows = [['Version', provenance.version], ['Updated at', formatted], ['Commit', provenance.commit], ['Timestamp source', provenance.timestampSource], ['Signing', provenance.signing], ['Release code name', provenance.release?.codeName || 'Unavailable']];
      for (const [term, value] of rows) {
        const dt = document.createElement('dt'); dt.textContent = term;
        const dd = document.createElement('dd'); dd.textContent = value;
        facts.append(dt, dd);
      }
    } else {
      detail.textContent = `${provenance.reason} Running version ${provenance.version || 'unavailable'}, updated-at unavailable.`;
      chip.textContent = 'Unavailable';
      chip.className = 'state-chip error';
      $('#title-version').textContent = provenance.version ? `v${provenance.version}` : 'Version unavailable';
      const dt = document.createElement('dt'); dt.textContent = 'Provenance';
      const dd = document.createElement('dd'); dd.textContent = provenance.reason;
      facts.append(dt, dd);
    }
  }

  function stageImagePath(stage) {
    return `../../assets/hair-growth/${stage.file}`;
  }

  function updateVisual(lengthCm) {
    const stage = Hair.stageForLength(lengthCm);
    activeGrowthStageIndex = Math.max(0, Hair.HAIR_STAGES.findIndex((item) => item.id === stage.id));
    const frame = $('.portrait-frame');
    frame.classList.add('changing');
    setTimeout(() => {
      const image = $('#growth-portrait');
      image.src = stageImagePath(stage);
      image.alt = `Fictional adult man at the ${stage.label.toLowerCase()} reference stage, approximately ${stage.targetCm} centimetres`;
      $('#visual-stage-label').textContent = stage.label;
      $('#visual-length').textContent = formatLength(lengthCm);
      $('#visual-date').textContent = `Reference image near ${formatLength(stage.targetCm)}`;
      $$('.stage-dot').forEach((dot) => {
        const selected = dot.dataset.stageId === stage.id;
        dot.classList.toggle('active', selected);
        dot.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      frame.classList.remove('changing');
    }, prefersReducedMotion() ? 0 : 180);
  }

  function renderStageDots() {
    const container = $('#stage-dots');
    container.replaceChildren();
    Hair.HAIR_STAGES.forEach((stage, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stage-dot';
      button.dataset.stageId = stage.id;
      button.dataset.elementId = `stage-dot-${stage.id}`;
      button.dataset.vocabularyPreserve = '';
      button.textContent = stage.label;
      button.setAttribute('aria-label', `${stage.label} stage, about ${stage.targetCm} centimetres`);
      button.setAttribute('aria-pressed', 'false');
      button.title = `${stage.label}, about ${stage.targetCm} cm`;
      button.addEventListener('click', () => {
        $('#growth-scrubber').value = stage.targetCm;
        updateVisual(stage.targetCm);
      });
      container.append(button);
    });
  }

  function advanceGrowthStage() {
    activeGrowthStageIndex = (activeGrowthStageIndex + 1) % Hair.HAIR_STAGES.length;
    const stage = Hair.HAIR_STAGES[activeGrowthStageIndex];
    $('#growth-scrubber').value = stage.targetCm;
    updateVisual(stage.targetCm);
    return stage;
  }

  function toggleGrowthPlayback() {
    if (growthAnimation) {
      clearInterval(growthAnimation);
      growthAnimation = null;
      setOwnedText($('#play-growth'), 'Play growth');
      return;
    }
    if (prefersReducedMotion()) return advanceGrowthStage();
    setOwnedText($('#play-growth'), 'Pause growth');
    growthAnimation = setInterval(advanceGrowthStage, 650);
  }

  function renderGallery() {
    const grid = $('#gallery-grid');
    grid.replaceChildren();
    Hair.HAIR_STAGES.forEach((stage, index) => {
      const card = document.createElement('article');
      card.className = 'gallery-card';
      card.dataset.elementId = `gallery-stage-${stage.id}`;
      const image = document.createElement('img');
      image.src = stageImagePath(stage);
      image.alt = `Stage ${index + 1}, same fictional adult man with ${stage.label.toLowerCase()} hair near ${stage.targetCm} centimetres`;
      image.loading = index < 2 ? 'eager' : 'lazy';
      const copyBlock = document.createElement('div');
      const title = document.createElement('h3'); title.textContent = `${index + 1}. ${stage.label}`;
      const description = document.createElement('p'); description.textContent = `Deterministic reference: ${formatLength(stage.targetCm)}. Generated image, not a predicted personal appearance.`;
      copyBlock.append(title, description);
      card.append(image, copyBlock);
      grid.append(card);
    });
  }

  function renderDashboard() {
    const currentDate = localIsoDate();
    const currentCm = Hair.estimatedLengthCm(state.profile, currentDate);
    const targetDate = Hair.targetDate(state.profile);
    $('#metric-current-length').textContent = formatLength(currentCm);
    $('#metric-current-date').textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(`${currentDate}T12:00:00`));
    $('#metric-target-length').textContent = formatLength(state.profile.targetLengthCm);
    $('#metric-target-date').textContent = `Estimated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${targetDate}T12:00:00`))}`;
    $('#metric-growth-rate').textContent = `${formatLength(state.profile.growthRateCmPerMonth)} / month`;
    $('#metric-days-value').textContent = Math.max(0, Math.floor(Hair.dayDifference(state.profile.baselineDate, currentDate)));
    $('#metric-since-cut').textContent = state.haircuts.length ? `Since ${state.haircuts[0].date}` : `Since baseline ${state.profile.baselineDate}`;
    $('#growth-scrubber').value = Math.min(30, currentCm);
    updateVisual(currentCm);
    fillProfileForm();
    renderProjection();
  }

  function renderProjection() {
    const projections = Hair.futureProjections(state.profile, localIsoDate(), 12);
    const canvas = $('#projection-canvas');
    const context = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(600, Math.round(rect.width * ratio));
    canvas.height = Math.round(250 * ratio);
    context.scale(ratio, ratio);
    const width = canvas.width / ratio;
    const height = canvas.height / ratio;
    context.clearRect(0, 0, width, height);
    const max = Math.max(...projections.map((item) => item.lengthCm), state.profile.targetLengthCm, 1);
    const left = 42; const top = 20; const bottom = height - 36; const right = width - 16;
    context.strokeStyle = 'rgba(170,187,180,.22)'; context.lineWidth = 1;
    for (let row = 0; row <= 4; row += 1) {
      const y = top + ((bottom - top) * row) / 4;
      context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke();
      context.fillStyle = '#aabbb4'; context.font = '11px system-ui';
      context.fillText(formatLength(max * (1 - row / 4), state.profile.displayUnit, 1), 2, y + 4);
    }
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#73e0c1';
    context.lineWidth = 4; context.lineCap = 'round'; context.lineJoin = 'round';
    context.beginPath();
    projections.forEach((item, index) => {
      const x = left + ((right - left) * index) / (projections.length - 1);
      const y = bottom - ((bottom - top) * item.lengthCm) / max;
      index ? context.lineTo(x, y) : context.moveTo(x, y);
    });
    context.stroke();
    const table = $('#projection-table'); table.replaceChildren();
    projections.forEach((item) => {
      const cell = document.createElement('div');
      const strong = document.createElement('strong'); strong.textContent = formatLength(item.lengthCm, state.profile.displayUnit, 1);
      const small = document.createElement('span'); small.textContent = item.date.slice(0, 7);
      cell.append(strong, small); table.append(cell);
    });
  }

  function fillProfileForm() {
    const unit = state.profile.displayUnit;
    $('#display-unit').value = unit;
    $('#baseline-date').value = state.profile.baselineDate;
    $('#baseline-length').value = Hair.fromCm(state.profile.baselineLengthCm, unit);
    $('#growth-rate').value = Hair.fromCm(state.profile.growthRateCmPerMonth, unit);
    $('#target-length').value = Hair.fromCm(state.profile.targetLengthCm, unit);
  }

  function clearHaircutForm() {
    $('#haircut-form').reset();
    $('#haircut-id').value = '';
    $('#haircut-date').value = localIsoDate();
    $('#haircut-pre').value = Hair.fromCm(Hair.estimatedLengthCm(state.profile, localIsoDate()), state.profile.displayUnit);
    $('#haircut-post').value = 0.5;
    $('#haircut-form-title').textContent = 'Record a haircut';
  }

  async function renderHaircuts() {
    const list = $('#haircut-list'); list.replaceChildren();
    const visible = await filterBySearch($('#haircut-search'), state.haircuts, (haircut) => `${haircut.date} ${haircut.note}`);
    if (visible === null) return;
    if (!visible.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = text('noHaircuts'); list.append(empty);
    }
    visible.forEach((haircut) => {
      const row = document.createElement('article');
      row.className = 'haircut-row'; row.dataset.elementId = `haircut-${haircut.id}`; row.dataset.haircutId = haircut.id;
      const select = document.createElement('input'); select.type = 'checkbox'; select.className = 'haircut-select'; select.setAttribute('aria-label', `Select haircut ${haircut.date}`);
      const date = document.createElement('div'); date.innerHTML = `<strong></strong><small></small>`; $('strong', date).textContent = haircut.date; $('small', date).textContent = haircut.id.slice(0, 12);
      const detail = document.createElement('div');
      const amount = document.createElement('div'); amount.className = 'cut-amount'; amount.textContent = `${formatLength(haircut.preCutLengthCm - haircut.postCutLengthCm)} cut`;
      const note = document.createElement('p'); note.textContent = haircut.note || 'No note'; detail.append(amount, note);
      const actions = document.createElement('div'); actions.className = 'toolbar-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'tonal-button'; edit.textContent = 'Edit'; edit.addEventListener('click', () => editHaircut(haircut.id));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-button'; remove.textContent = 'Delete'; remove.addEventListener('click', () => requestDeleteHaircuts([haircut.id]));
      actions.append(edit, remove); row.append(select, date, detail, actions); list.append(row);
    });
    const total = state.haircuts.reduce((sum, item) => sum + item.preCutLengthCm - item.postCutLengthCm, 0);
    $('#haircut-count').textContent = state.haircuts.length;
    $('#total-cut').textContent = formatLength(total);
    $('#last-haircut').textContent = state.haircuts[0]?.date || 'None';
  }

  function editHaircut(id) {
    const haircut = state.haircuts.find((item) => item.id === id);
    if (!haircut) return;
    switchTab('haircuts');
    $('#haircut-id').value = haircut.id;
    $('#haircut-date').value = haircut.date;
    $('#haircut-pre').value = Hair.fromCm(haircut.preCutLengthCm, state.profile.displayUnit);
    $('#haircut-post').value = Hair.fromCm(haircut.postCutLengthCm, state.profile.displayUnit);
    $('#haircut-note').value = haircut.note;
    $('#haircut-form-title').textContent = `Edit haircut from ${haircut.date}`;
    $('#haircut-date').focus();
  }

  function selectedHaircutIds() {
    return $$('.haircut-row').filter((row) => $('.haircut-select', row)?.checked).map((row) => row.dataset.haircutId);
  }

  function requestDeleteHaircuts(ids) {
    if (!ids.length) return notify('Nothing selected', 'Select at least one haircut first.', 'warning');
    openSuperConfirm(`Delete ${ids.length} haircut record${ids.length === 1 ? '' : 's'}`, `This permanently removes ${ids.length} selected local record${ids.length === 1 ? '' : 's'} from the active journal. A redacted version remains in local append-only history.`, async () => {
      state.haircuts = Hair.sortHaircutsNewest(state.haircuts.filter((item) => !ids.includes(item.id)));
      state.profile = Hair.reconcileBaseline(state.profile, state.haircuts, state.manualBaseline);
      await saveNow(`Deleted ${ids.length} haircut record${ids.length === 1 ? '' : 's'}`);
      renderHaircuts(); renderDashboard();
      notify('Haircuts deleted', `${ids.length} record${ids.length === 1 ? '' : 's'} removed.`, 'success');
    });
  }

  function switchTab(tab) {
    const button = $(`.tab[data-tab="${CSS.escape(tab)}"]`);
    if (!button) return;
    activeTab = tab;
    $$('.tab').forEach((item) => { item.classList.toggle('active', item === button); item.setAttribute('aria-selected', item === button ? 'true' : 'false'); item.setAttribute('tabindex', item === button ? '0' : '-1'); });
    $$('.view').forEach((view) => { const active = view.dataset.view === tab; view.hidden = !active; view.classList.toggle('active', active); });
    button.focus({ preventScroll: true });
    if (tab === 'status') displayProvenance();
  }

  function handleTabRovingKey(event) {
    const orientation = $('#tab-strip').getAttribute('aria-orientation');
    const forwardKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    const backwardKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    if (![forwardKey, backwardKey, 'Home', 'End'].includes(event.key)) return;
    const visible = $$('.tab').filter((tab) => {
      const group = tab.closest('.tab-group');
      const groupHeader = group && $('.group-header', group);
      return !tab.hidden && (!groupHeader || groupHeader.getAttribute('aria-expanded') === 'true');
    });
    if (!visible.length) return;
    event.preventDefault();
    const current = visible.indexOf(event.currentTarget);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? visible.length - 1
        : event.key === forwardKey
          ? (current + 1 + visible.length) % visible.length
          : (current - 1 + visible.length) % visible.length;
    switchTab(visible[nextIndex].dataset.tab);
  }

  function openPalette(query = '') {
    const dialog = $('#command-palette');
    $('#palette-search').value = query;
    renderPalette();
    openManagedDialog(dialog, { focus: $('#palette-search') });
  }

  function activatePaletteEntry(entry) {
    const dialog = $('#command-palette');
    if (!entry.action) return;
    if (!dialog.open) return entry.action();
    dialog.addEventListener('close', () => entry.action(), { once: true });
    closeManagedDialog(dialog);
  }

  function teleportToElement(tab, selector) {
    switchTab(tab);
    const target = $(selector);
    if (!target) return;
    target.hidden = false;
    target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    if (!target.matches('button, input, select, textarea, a, [tabindex]')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.classList.remove('teleport-highlight');
    requestAnimationFrame(() => target.classList.add('teleport-highlight'));
  }

  function paletteEntries() {
    const destinations = $$('.tab').map((tab) => ({ id: `go-${tab.dataset.tab}`, label: `Open ${$('span', tab).textContent}`, kind: 'Destination', action: () => switchTab(tab.dataset.tab) }));
    const settings = [
      { id: 'theme', label: 'Theme', kind: 'Setting', control: 'theme' },
      { id: 'language', label: 'Language mode', kind: 'Setting', control: 'language' },
      { id: 'funny-en', label: 'English funny level', kind: 'Setting', control: 'funny-en' },
      { id: 'funny-yue', label: 'Cantonese funny level', kind: 'Setting', control: 'funny-yue' },
      { id: 'tab-dock', label: 'Tab dock', kind: 'Setting', control: 'tab-dock' },
      { id: 'vocabulary-choose', label: 'Choose or replace personal vocabulary JSON', kind: 'Setting', feature: 'vocabulary', action: () => teleportToElement('settings', '#choose-vocabulary') },
      { id: 'vocabulary-status', label: 'Personal vocabulary status', kind: 'Setting', feature: 'vocabulary', action: () => teleportToElement('settings', '#vocabulary-state') },
      { id: 'vocabulary-clear', label: 'Clear personal vocabulary cache', kind: 'Setting', feature: 'vocabulary', action: () => teleportToElement('settings', '#clear-vocabulary') },
      { id: 'support-tickets', label: 'Open local Support Tickets', kind: 'Destination', action: () => openManagedDialog($('#support-dialog')) },
      { id: 'notification-history', label: 'Open notification history', kind: 'Destination', action: () => openManagedDialog($('#notification-dialog')) },
      { id: 'history-manager', label: 'Protected local version history', kind: 'Destination', action: () => teleportToElement('docs', '#history-manager-title') },
      { id: 'one-thing', label: 'One thing at a time current action', kind: 'Setting', action: () => teleportToElement('settings', '#adhd-next-action') },
      { id: 'momentum', label: 'Momentum accommodation', kind: 'Setting', action: () => teleportToElement('settings', '[data-adhd="momentum"]') }
    ];
    return [...destinations, ...settings, ...docs.map((article) => ({ id: `docs-${article.id}`, label: article.title, kind: 'Offline article', action: () => openDoc(article.id) }))]
      .filter((entry) => !schoolRecord?.enabled || entry.feature !== 'vocabulary');
  }

  async function renderPalette() {
    const container = $('#palette-results'); container.replaceChildren();
    const input = $('#palette-search');
    const entries = paletteEntries();
    const visible = await filterBySearch(input, entries, (entry) => `${entry.label} ${entry.kind}`);
    if (visible === null) return;
    visible.forEach((entry) => {
      const row = document.createElement('div'); row.className = 'palette-row';
      const button = document.createElement('button'); button.type = 'button'; button.innerHTML = `<strong></strong><small></small>`; setOwnedText($('strong', button), entry.label); setOwnedText($('small', button), entry.kind); setOwnedAttribute(button, 'aria-label', `${entry.label}, ${entry.kind}`);
      button.addEventListener('click', () => activatePaletteEntry(entry));
      row.append(button);
      if (entry.control === 'theme') {
        const select = clonePaletteControl($('#setting-theme'), entry); select.value = state.settings.theme; select.addEventListener('change', () => { state.settings.theme = select.value; applySettings(); scheduleSave('Theme changed from command palette'); }); row.append(select);
      } else if (entry.control === 'language') {
        const select = clonePaletteControl($('#setting-language'), entry); select.value = state.settings.language; select.addEventListener('change', () => { state.settings.language = select.value; applySettings(); scheduleSave('Language changed from command palette'); }); row.append(select);
      } else if (entry.control === 'funny-en' || entry.control === 'funny-yue') {
        const range = document.createElement('input'); range.type = 'range'; range.min = 1; range.max = 5; range.value = entry.control === 'funny-en' ? state.settings.funnyEnglish : state.settings.funnyCantonese; range.setAttribute('aria-label', entry.label); range.addEventListener('input', () => { state.settings[entry.control === 'funny-en' ? 'funnyEnglish' : 'funnyCantonese'] = Number(range.value); scheduleSave(`${entry.label} changed from command palette`); }); row.append(range);
      } else if (entry.control === 'tab-dock') {
        const select = clonePaletteControl($('#setting-tab-dock'), entry); select.value = state.settings.tabDock; select.addEventListener('change', () => { state.settings.tabDock = select.value; applySettings(); scheduleSave('Tab dock changed from command palette'); }); row.append(select);
      }
      container.append(row);
    });
    if (!container.childElementCount) container.innerHTML = '<div class="empty-state">No commands match this search.</div>';
  }

  function utf8ByteLength(value) {
    return utf8Encoder.encode(String(value)).byteLength;
  }

  function invalidateSearch(input) {
    searchGenerations.set(input, (searchGenerations.get(input) || 0) + 1);
    input.removeAttribute('aria-busy');
  }

  function regexFilterBatches(searchable) {
    const batches = [];
    let current = { indexes: [], candidates: [], bytes: 0 };

    searchable.forEach((candidate, index) => {
      const bytes = utf8ByteLength(candidate);
      if (bytes > REGEX_LIMITS.candidateBytes) {
        throw new Error(`Search candidate ${index + 1} exceeds the ${REGEX_LIMITS.candidateBytes}-byte bound.`);
      }
      if (
        current.indexes.length >= REGEX_LIMITS.candidates ||
        current.bytes + bytes > REGEX_LIMITS.candidateTotalBytes
      ) {
        batches.push(current);
        current = { indexes: [], candidates: [], bytes: 0 };
      }
      current.indexes.push(index);
      current.candidates.push(candidate);
      current.bytes += bytes;
    });
    if (current.indexes.length) batches.push(current);
    return batches;
  }

  async function filterBySearch(input, candidates, toSearchText = (candidate) => String(candidate)) {
    const generation = (searchGenerations.get(input) || 0) + 1;
    searchGenerations.set(input, generation);
    const query = input.value || '';
    const configured = regexState.get(input);
    const config = configured
      ? { enabled: Boolean(configured.enabled), pattern: configured.pattern || query, flags: configured.flags || 'iu' }
      : { enabled: false, pattern: query, flags: 'iu' };
    const searchable = candidates.map((candidate) => String(toSearchText(candidate)));
    input.setAttribute('aria-busy', 'true');

    try {
      let visible;
      if (!config.enabled) {
        const plainQuery = query.toLocaleLowerCase();
        visible = candidates.filter((_candidate, index) => !plainQuery || searchable[index].toLocaleLowerCase().includes(plainQuery));
      } else {
        visible = [];
        for (const batch of regexFilterBatches(searchable)) {
          const result = await bridge.regex.evaluate({
            operation: 'filter',
            pattern: config.pattern,
            flags: config.flags,
            candidates: batch.candidates
          });
          if (searchGenerations.get(input) !== generation) return null;
          if (!Array.isArray(result?.matches) || result.matches.length !== batch.indexes.length) throw new Error('Regex worker returned an invalid filter result.');
          result.matches.forEach((matched, index) => { if (matched) visible.push(candidates[batch.indexes[index]]); });
        }
      }
      if (searchGenerations.get(input) !== generation) return null;
      input.removeAttribute('aria-invalid');
      input.setCustomValidity?.('');
      input.removeAttribute('title');
      return visible;
    } catch (error) {
      if (searchGenerations.get(input) !== generation) return null;
      const message = error?.message || 'Regex evaluation could not finish.';
      input.setAttribute('aria-invalid', 'true');
      input.setCustomValidity?.(message);
      input.title = message;
      return [];
    } finally {
      if (searchGenerations.get(input) === generation) input.removeAttribute('aria-busy');
    }
  }

  function openRegexBuilder(trigger) {
    const field = trigger.closest('.search-field');
    const input = $('input', field);
    const popover = $('#regex-popover');
    regexPopoverOpener = trigger;
    const current = regexState.get(input) || { enabled: false, pattern: input.value || '', flags: 'iu' };
    popover._targetInput = input;
    $('#popover-pattern').value = current.pattern;
    $('#popover-flags').value = current.flags;
    $('#popover-enabled').checked = current.enabled;
    void validatePopoverRegex();
    const rect = trigger.getBoundingClientRect();
    popover.hidden = false;
    const width = Math.min(420, window.innerWidth - 24);
    popover.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width))}px`;
    popover.style.top = `${Math.max(76, Math.min(window.innerHeight - popover.offsetHeight - 12, rect.bottom + 8))}px`;
    $('#popover-pattern').focus();
  }

  function closeRegexPopover({ restoreFocus = true } = {}) {
    regexValidationGeneration += 1;
    $('#regex-popover').hidden = true;
    const opener = regexPopoverOpener;
    regexPopoverOpener = null;
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
  }

  async function validatePopoverRegex() {
    const generation = ++regexValidationGeneration;
    const status = $('#popover-validation');
    if (!$('#popover-enabled').checked) { status.textContent = 'Plain-text search is active.'; status.className = ''; return true; }
    const pattern = $('#popover-pattern').value;
    if (utf8ByteLength(pattern) > REGEX_LIMITS.patternBytes) { status.textContent = `Pattern exceeds the ${REGEX_LIMITS.patternBytes}-byte UTF-8 bound.`; status.className = 'error'; return false; }
    status.textContent = 'Validating in an isolated worker.';
    status.className = '';
    try {
      await bridge.regex.evaluate({ operation: 'validate', pattern, flags: $('#popover-flags').value });
      if (generation !== regexValidationGeneration) return false;
      status.textContent = 'Pattern is valid for the JavaScript RegExp engine.';
      status.className = 'success';
      return true;
    } catch (error) {
      if (generation !== regexValidationGeneration) return false;
      status.textContent = error?.message || 'Pattern validation could not finish.';
      status.className = 'error';
      return false;
    }
  }

  async function applyRegexPopover() {
    if (!await validatePopoverRegex()) return;
    const input = $('#regex-popover')._targetInput;
    if (!input) return;
    regexState.set(input, { enabled: $('#popover-enabled').checked, pattern: $('#popover-pattern').value, flags: $('#popover-flags').value });
    input.dispatchEvent(new Event('input', { bubbles: true }));
    closeRegexPopover();
  }

  async function runRegexWorkbench() {
    const generation = ++regexWorkbenchGeneration;
    const pattern = $('#regex-pattern').value;
    const flags = $('#regex-flags').value;
    const sample = $('#regex-sample').value;
    const replacement = $('#regex-replacement').value;
    if (
      utf8ByteLength(pattern) > REGEX_LIMITS.patternBytes ||
      utf8ByteLength(sample) > REGEX_LIMITS.sampleBytes ||
      utf8ByteLength(replacement) > REGEX_LIMITS.replacementBytes
    ) {
      $('#run-regex').removeAttribute('aria-busy');
      return notify('Regex bounds exceeded', `Pattern is limited to ${REGEX_LIMITS.patternBytes} UTF-8 bytes, sample text to ${REGEX_LIMITS.sampleBytes} UTF-8 bytes, and replacement text to ${REGEX_LIMITS.replacementBytes} UTF-8 bytes.`, 'error');
    }
    $('#run-regex').setAttribute('aria-busy', 'true');
    try {
      const result = await bridge.regex.evaluate({ operation: 'workbench', pattern, flags, sample, replacement });
      if (generation !== regexWorkbenchGeneration) return;
      const matches = result.matches || [];
      const explanation = [];
      if (pattern.includes('(?<')) explanation.push('Named capture group detected.');
      if (/\(\?<?[=!]/.test(pattern)) explanation.push('Lookaround detected.');
      if (/[*+{].*\?/.test(pattern)) explanation.push('Lazy quantifier detected.');
      if (/\[[^\]]+\]/.test(pattern)) explanation.push('Character class detected.');
      if (/\\[1-9]|\\k</.test(pattern)) explanation.push('Backreference detected.');
      if (/\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) explanation.push('Potential nested-quantifier backtracking risk. Keep adversarial input bounded.');
      explanation.push(`Completed in ${Number(result.elapsedMs || 0).toFixed(3)} ms with ${matches.length} match${matches.length === 1 ? '' : 'es'}.`);
      if (result.truncated) explanation.push(`Results were capped at ${REGEX_LIMITS.results} matches.`);
      if (result.replacementPreview?.truncated) explanation.push('The replacement preview reached its bounded output limit.');
      $('#regex-explanation').replaceChildren(...explanation.map((line) => { const p = document.createElement('p'); p.textContent = line; return p; }));
      const matchContainer = $('#regex-matches'); matchContainer.replaceChildren();
      matches.forEach((match, index) => {
        const block = document.createElement('div');
        const head = document.createElement('strong'); head.textContent = `#${index + 1} at ${match.index}: ${match.value || '(zero-width)'}`; block.append(head);
        [{ label: '$0', value: match.value }, ...(match.captures || []).map((value, captureIndex) => ({ label: `$${captureIndex + 1}`, value }))].forEach((capture) => { const span = document.createElement('span'); span.className = 'capture-pill'; span.textContent = `${capture.label}: ${capture.value ?? 'unmatched'}`; block.append(span); });
        Object.entries(match.groups || {}).forEach(([name, value]) => { const span = document.createElement('span'); span.className = 'capture-pill'; span.textContent = `${name}: ${value ?? 'unmatched'}`; block.append(span); });
        matchContainer.append(block);
      });
      if (!matches.length) matchContainer.textContent = 'No matches.';
      $('#regex-preview').textContent = result.replacementPreview?.text ?? sample;
      const capabilities = [
        ['Named and numbered captures', 'Supported'], ['Lookahead and lookbehind', 'Supported by the running engine'], ['Unicode sets and properties', 'Supported where the engine accepts the v or u flags'], ['Atomic groups', 'Unsupported in this engine'], ['Conditionals and subroutines', 'Unsupported in this engine'], ['Possessive quantifiers', 'Unsupported in this engine'], ['Bounded execution', `Pattern ${REGEX_LIMITS.patternBytes} UTF-8 bytes, sample ${REGEX_LIMITS.sampleBytes} UTF-8 bytes, results ${REGEX_LIMITS.results}, hard deadline ${REGEX_LIMITS.deadlineMs} ms`]
      ];
      const cap = $('#regex-capabilities'); cap.replaceChildren(); capabilities.forEach(([name, status]) => { const row = document.createElement('div'); row.className = 'capability-row'; const a = document.createElement('span'); a.textContent = name; const b = document.createElement('strong'); b.textContent = status; row.append(a, b); cap.append(row); });
    } catch (error) {
      if (generation === regexWorkbenchGeneration) handleError(error, 'Regex is invalid');
    } finally {
      if (generation === regexWorkbenchGeneration) $('#run-regex').removeAttribute('aria-busy');
    }
  }

  function renderConverter() {
    const container = $('#converter-categories'); container.replaceChildren();
    converterCatalog.forEach((category) => {
      const card = document.createElement('section'); card.className = 'converter-category'; card.dataset.elementId = `converter-${category.category.toLowerCase().replace(/[^a-z]+/g, '-')}`;
      const heading = document.createElement('h4'); heading.textContent = category.category; card.append(heading);
      const search = document.createElement('label'); search.className = 'search-field compact'; search.innerHTML = '<span class="visually-hidden">Search adapters</span><input type="search" placeholder="Search formats"><button type="button" class="regex-trigger" aria-label="Open regex builder for adapter search">.*</button>'; card.append(search);
      const list = document.createElement('div');
      const render = async () => {
        const visible = await filterBySearch($('input', search), category.adapters, (adapter) => `${adapter.label} ${adapter.reason}`);
        if (visible === null) return;
        list.replaceChildren();
        visible.forEach((adapter) => {
          const label = document.createElement('label'); label.className = `adapter ${adapter.enabled ? '' : 'unavailable'}`;
          const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'converter-adapter'; radio.value = adapter.id; radio.disabled = !adapter.enabled; radio.checked = adapter.id === selectedConverter;
          radio.addEventListener('change', () => { selectedConverter = adapter.id; $('#run-conversion').disabled = !converterSource; });
          const copyBlock = document.createElement('span'); copyBlock.textContent = `${adapter.label}. ${adapter.reason}`; label.append(radio, copyBlock); list.append(label);
        });
        if (!list.childElementCount) list.textContent = 'No matching adapters in this category.';
      };
      $('input', search).addEventListener('input', () => { void render(); }); void render(); card.append(list); container.append(card);
    });
    bindNewRegexTriggers(container);
  }

  async function renderAuthenticators() {
    const list = $('#auth-list'); list.replaceChildren();
    try {
      const entries = await bridge.authenticator.list();
      entries.forEach((entry) => {
        const card = document.createElement('div'); card.className = 'auth-entry'; card.dataset.elementId = `auth-${entry.id}`;
        const label = document.createElement('strong'); label.textContent = `${entry.issuer} · ${entry.account}`;
        const code = document.createElement('div'); code.className = 'auth-code'; code.textContent = entry.currentCode.replace(/(.{3})/g, '$1 ').trim();
        const detail = document.createElement('p'); detail.textContent = `${entry.remainingSeconds}s remaining, next ${entry.nextCode}, ${entry.algorithm.toUpperCase()} / ${entry.digits} digits / ${entry.period}s`;
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-button'; remove.textContent = 'Delete entry'; remove.addEventListener('click', () => openSuperConfirm('Delete authenticator entry', `This removes ${entry.issuer} ${entry.account} from the local vault. Ordinary exports never contained its secret.`, async () => { await bridge.authenticator.remove(entry.id); await renderAuthenticators(); notify('Authenticator entry deleted', `${entry.issuer} ${entry.account} was removed.`, 'success'); }));
        card.append(label, code, detail, remove); list.append(card);
      });
      if (!entries.length) list.innerHTML = '<div class="empty-state">No authenticator entries yet.</div>';
    } catch (error) { list.innerHTML = '<div class="empty-state">Credential vault unavailable.</div>'; handleError(error, 'Authenticator unavailable'); }
  }

  async function renderDocs() {
    const list = $('#docs-list');
    const visible = await filterBySearch($('#docs-search'), docs, (article) => `${article.title} ${article.body.replace(/<[^>]+>/g, ' ')}`);
    if (visible === null) return;
    list.replaceChildren();
    visible.forEach((article) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = article.title; button.addEventListener('click', () => openDoc(article.id)); list.append(button);
    });
    if (!list.childElementCount) list.innerHTML = '<div class="empty-state">No guide article matches.</div>';
    void renderChangelog();
  }

  function openDoc(id) {
    switchTab('docs');
    const article = docs.find((item) => item.id === id);
    if (!article) return;
    $('#docs-content').innerHTML = article.body;
    $$('[data-external-url]', $('#docs-content')).forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); bridge.external.openUrl(link.dataset.externalUrl).catch((error) => handleError(error, 'Link could not open')); }));
  }

  async function renderChangelog() {
    const list = $('#changelog-list');
    const from = $('#changelog-date').value;
    const dated = changelog.filter((entry) => !from || entry.date >= from);
    const visible = await filterBySearch($('#changelog-search'), dated, (entry) => `${entry.version} ${entry.date} ${entry.changes.join(' ')}`);
    if (visible === null) return;
    list.replaceChildren();
    visible.forEach((entry) => {
      const row = document.createElement('article'); row.className = 'changelog-row';
      const heading = document.createElement('strong'); heading.textContent = `Version ${entry.version} · ${entry.date}`;
      const listElement = document.createElement('ul'); entry.changes.forEach((change) => { const item = document.createElement('li'); item.textContent = change; listElement.append(item); });
      const commit = document.createElement('small'); commit.textContent = `Commit: ${entry.commit}`; row.append(heading, listElement, commit); list.append(row);
    });
    if (!list.childElementCount) list.innerHTML = '<div class="empty-state">No released changes match the active filters.</div>';
  }

  async function renderHistory() {
    const renderGeneration = ++historyRenderGeneration;
    const list = $('#history-list');
    const search = $('#history-search');
    if (!historyCredential) {
      invalidateSearch(search);
      $('#history-status').textContent = 'History is locked. Enter its separate password to continue.';
      list.innerHTML = '<div class="empty-state">Unlock local history to browse revisions.</div>';
      return;
    }
    try {
      const action = $('#history-action').value;
      const filters = { credential: historyCredential, limit: 500, from: $('#history-date-from').value || null, to: $('#history-date-to').value || null, actions: action ? [action] : [] };
      const allHistoryItems = await bridge.history.list({ credential: historyCredential, limit: 500 });
      if (renderGeneration !== historyRenderGeneration) return;
      const filteredHistoryItems = !filters.from && !filters.to && !filters.actions.length ? allHistoryItems : await bridge.history.list(filters);
      if (renderGeneration !== historyRenderGeneration) return;
      const visible = await filterBySearch(search, filteredHistoryItems, (item) => `${item.label || ''} ${item.subject || ''} ${item.action || ''} ${item.date || ''} ${item.commit || ''}`);
      if (visible === null || renderGeneration !== historyRenderGeneration) return;
      historyItems = visible;
      const actionSelect = $('#history-action');
      const selectedAction = actionSelect.value;
      const actionCounts = allHistoryItems.reduce((counts, item) => counts.set(item.action, (counts.get(item.action) || 0) + 1), new Map());
      const actions = [...actionCounts.keys()].filter(Boolean).sort();
      actionSelect.replaceChildren(new Option(`Every action (${allHistoryItems.length})`, ''), ...actions.map((value) => new Option(`${value} (${actionCounts.get(value)})`, value)));
      actionSelect.value = actions.includes(selectedAction) ? selectedAction : '';
      list.replaceChildren();
      historyItems.forEach((item) => {
        const row = document.createElement('article'); row.className = `history-row${selectedHistoryCommit === item.commit ? ' selected' : ''}`;
        const select = document.createElement('input'); select.type = 'radio'; select.name = 'history-revision'; select.value = item.commit; select.checked = selectedHistoryCommit === item.commit; select.setAttribute('aria-label', `Select history revision ${item.subject}`); select.addEventListener('change', () => { selectedHistoryCommit = item.commit; renderHistory(); });
        const copyBlock = document.createElement('div');
        const heading = document.createElement('strong'); heading.textContent = item.label || item.subject;
        const detail = document.createElement('p'); detail.textContent = `${new Date(item.date).toLocaleString()} · ${item.action || 'updated'} · ${item.commit.slice(0, 12)}`; copyBlock.append(heading, detail);
        const marker = document.createElement('span'); marker.className = 'state-chip'; marker.textContent = item.label ? 'Labelled' : 'Revision';
        row.append(select, copyBlock, marker); list.append(row);
      });
      $('#history-status').textContent = `${historyItems.length} redacted revision${historyItems.length === 1 ? '' : 's'} visible. Restores append a new revision.`;
      if (!historyItems.length) list.innerHTML = '<div class="empty-state">No revisions match the active filters.</div>';
    } catch (error) {
      if (renderGeneration !== historyRenderGeneration) return;
      historyCredential = '';
      list.innerHTML = '<div class="empty-state">Local history could not be read with that credential.</div>';
      $('#history-status').textContent = 'History remains locked.';
      handleError(error, 'History unavailable');
    }
  }

  function visibleNotifications() {
    return visibleNotificationItems;
  }

  function selectedNotificationIds() {
    return [...selectedNotifications];
  }

  async function renderNotifications() {
    const list = $('#notification-list'); if (!list || !state) return null;
    const visible = await filterBySearch($('#notification-search'), state.notifications, (notice) => `${notice.title} ${notice.body} ${notice.kind} ${notice.timestamp}`);
    if (visible === null) return null;
    visibleNotificationItems = visible;
    list.replaceChildren();
    for (const notice of visible) {
      const row = document.createElement('article'); row.className = `notice-row${selectedNotifications.has(notice.id) ? ' selected' : ''}`;
      const select = document.createElement('input'); select.type = 'checkbox'; select.checked = selectedNotifications.has(notice.id); select.setAttribute('aria-label', `Select notification ${notice.title}`); select.addEventListener('change', () => { if (select.checked) selectedNotifications.add(notice.id); else selectedNotifications.delete(notice.id); renderNotifications(); });
      const copyBlock = document.createElement('div');
      const heading = document.createElement('strong'); setOwnedText(heading, notice.title);
      const detail = document.createElement('p'); detail.textContent = notice.body;
      const time = document.createElement('small'); time.textContent = `${new Date(notice.timestamp).toLocaleString()} · ${notice.kind} · ${notice.dismissed ? 'dismissed' : 'active'}`; copyBlock.append(heading, detail, time);
      const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'tonal-button'; dismiss.disabled = notice.dismissed; setOwnedText(dismiss, notice.dismissed ? 'Dismissed' : 'Dismiss'); dismiss.addEventListener('click', () => dismissNotification(notice.id));
      row.append(select, copyBlock, dismiss); list.append(row);
    }
    if (!visible.length) list.innerHTML = '<div class="empty-state">No notifications match the active search.</div>';
    const selectedVisible = visible.filter((notice) => selectedNotifications.has(notice.id)).length;
    $('#notification-selection-status').textContent = `${selectedVisible} selected in this view. ${visible.length} visible.`;
    return visible;
  }

  function visibleSupportTickets() {
    return visibleSupportTicketItems;
  }

  function selectedSupportTicketIds() {
    return [...selectedSupportTickets];
  }

  async function renderSupportTickets() {
    const list = $('#support-list');
    if (!list || !state) return null;
    const statusFilter = $('#support-status-filter')?.value || '';
    const statusCandidates = state.supportTickets.filter((ticket) => !statusFilter || ticket.status === statusFilter);
    const visible = await filterBySearch($('#support-search'), statusCandidates, (ticket) => `${ticket.id} ${ticket.category} ${ticket.severity} ${ticket.description} ${ticket.status}`);
    if (visible === null) return null;
    visibleSupportTicketItems = visible;
    list.replaceChildren();
    for (const ticket of visible) {
      const row = document.createElement('article');
      row.className = `support-row${selectedSupportTickets.has(ticket.id) ? ' selected' : ''}`;
      const select = document.createElement('input'); select.type = 'checkbox'; select.checked = selectedSupportTickets.has(ticket.id); select.setAttribute('aria-label', `Select local ticket ${ticket.id}`); select.addEventListener('change', () => { if (select.checked) selectedSupportTickets.add(ticket.id); else selectedSupportTickets.delete(ticket.id); renderSupportTickets(); });
      const copyBlock = document.createElement('div');
      const heading = document.createElement('strong'); heading.textContent = `${ticket.id} · ${ticket.category}`;
      const description = document.createElement('p'); description.textContent = ticket.description || 'No description supplied.';
      const detail = document.createElement('small'); detail.textContent = `${ticket.status} · ${ticket.severity} · ${new Date(ticket.createdAt).toLocaleString()}`; copyBlock.append(heading, description, detail);
      const status = document.createElement('span'); status.className = `state-chip ${ticket.status === 'Resolved' ? 'success' : ticket.status === 'Open' ? 'pending' : ''}`; status.textContent = ticket.status;
      row.append(select, copyBlock, status); list.append(row);
    }
    if (!visible.length) list.innerHTML = '<div class="empty-state">No local tickets match the active filters.</div>';
    $('#support-selection-status').textContent = `${visible.filter((ticket) => selectedSupportTickets.has(ticket.id)).length} selected in this view. ${visible.length} visible.`;
    return visible;
  }

  function advanceSupportStatus(ids) {
    const next = { Open: 'In review', 'In review': 'Resolved', Resolved: 'Resolved' };
    const now = new Date().toISOString();
    state.supportTickets = state.supportTickets.map((ticket) => ids.includes(ticket.id) ? { ...ticket, status: next[ticket.status] || 'Open', updatedAt: now } : ticket);
    scheduleSave('Local support ticket status advanced');
    renderSupportTickets();
  }

  function evaluateMomentumPrompt(now = Date.now()) {
    const settings = state.settings.adhd;
    if (!settings.momentum) return { visible: false, reason: 'disabled' };
    const lastChange = Date.parse(settings.lastMeaningfulChangeAt);
    const dismissedUntil = settings.momentumDismissedUntil ? Date.parse(settings.momentumDismissedUntil) : 0;
    if (!Number.isFinite(lastChange)) return { visible: false, reason: 'unknown' };
    if (dismissedUntil > now) return { visible: false, reason: 'dismissed', dismissedUntil };
    const minutes = Math.max(0, Math.floor((now - lastChange) / 60000));
    return minutes >= 40 ? { visible: true, minutes } : { visible: false, reason: 'recent', minutes };
  }

  function renderAttentionAccommodations() {
    if (!state?.settings?.adhd) return;
    const settings = state.settings.adhd;
    const currentAction = settings.nextAction.trim();
    $('#one-thing-banner').hidden = !(settings.oneThing && currentAction);
    $('#one-thing-current').textContent = currentAction || 'No current action is set.';
    const momentum = evaluateMomentumPrompt();
    $('#momentum-banner').hidden = !momentum.visible;
    $('#momentum-message').textContent = momentum.visible ? `Nothing has changed here for ${momentum.minutes} minutes.` : '';
  }

  function renderSchedules() {
    $('#schedule-list').textContent = state.schedules.length
      ? state.schedules.map((rule) => `${rule.label}: ${rule.startTime} to ${rule.endTime}, ${rule.enabled ? 'enabled' : 'disabled'}`).join(' · ')
      : `No scheduled rules. Times use ${Intl.DateTimeFormat().resolvedOptions().timeZone} and follow daylight-saving changes.`;
  }

  function renderSettingsForm() {
    $('#setting-language').value = state.settings.language;
    $('#funny-en').value = state.settings.funnyEnglish; $('#funny-en-value').value = state.settings.funnyEnglish;
    $('#funny-yue').value = state.settings.funnyCantonese; $('#funny-yue-value').value = state.settings.funnyCantonese;
    $('#setting-emoji').checked = state.settings.showDialogEmoji;
    $('#setting-theme').value = state.settings.theme;
    $('#setting-density').value = state.settings.density;
    $('#setting-accent').value = state.settings.accent;
    $('#setting-tab-dock').value = state.settings.tabDock;
    $('#rainbow-speed').value = state.settings.rainbowSpeedLevel;
    $('#setting-display-name').value = state.settings.displayName;
    $('#logo-preset').value = state.settings.logo.preset;
    $('#logo-fit').value = state.settings.logo.fit;
    $('#logo-background').value = state.settings.logo.background;
    $('#logo-state').textContent = state.settings.logo.customDataUrl ? 'A validated local custom image is active.' : 'No custom logo selected.';
    $('#narrator-enabled').checked = state.settings.narrator.enabled;
    $('#narrator-language').value = state.settings.narrator.language;
    $('#narrator-rate').value = state.settings.narrator.rate; $('#narrator-rate-value').value = state.settings.narrator.rate;
    $('#narrator-pitch').value = state.settings.narrator.pitch; $('#narrator-pitch-value').value = state.settings.narrator.pitch;
    $$('[data-adhd]').forEach((input) => { input.checked = state.settings.adhd[input.dataset.adhd]; });
    $('#adhd-next-action').value = state.settings.adhd.nextAction;
    $('#status-hub-url').value = state.settings.statusHubUrl;
    renderSchedules();
  }

  function renderSyncForm() {
    const sync = state.settings.sync;
    $('#sync-mode').value = sync.mode; $('#server-profile-id').value = sync.profileId; $('#server-url').value = sync.serverUrl;
    $('#ssh-host').value = sync.ssh.host; $('#ssh-port').value = sync.ssh.port; $('#ssh-username').value = sync.ssh.username; $('#ssh-remote-port').value = sync.ssh.remoteApiPort; $('#ssh-local-port').value = sync.ssh.localForwardPort; $('#ssh-key-file').value = sync.ssh.keyFile;
  }

  async function renderLocks() {
    try {
      const locks = await bridge.locks.list(); lockedElements.clear(); locks.forEach((lock) => lockedElements.set(lock.elementId, lock));
      $$('[data-element-id]').forEach((element) => {
        const locked = lockedElements.has(element.dataset.elementId) && !unlockedForSession.has(element.dataset.elementId);
        element.classList.toggle('locked-element', locked);
        element.setAttribute('aria-disabled', locked ? 'true' : 'false');
        if (locked && !element.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(element.tagName)) element.tabIndex = 0;
      });
    } catch (error) { handleError(error, 'Toy locks unavailable'); }
  }

  function ensureElementIds() {
    let index = 0;
    $$('body *').forEach((element) => {
      if (['SCRIPT', 'STYLE'].includes(element.tagName)) return;
      if (!element.dataset.elementId) element.dataset.elementId = `auto-${element.tagName.toLowerCase()}-${index++}`;
    });
  }

  function applySavedAppearances() {
    Object.entries(state.appearance || {}).forEach(([elementId, appearance]) => {
      const element = $(`[data-element-id="${CSS.escape(elementId)}"]`); if (!element) return;
      element.style.color = appearance.color || '';
      element.style.backgroundColor = appearance.background || '';
      element.style.fontFamily = appearance.font || '';
      element.style.fontSize = appearance.size ? `${appearance.size}px` : '';
      element.style.fontWeight = appearance.weight || '';
      element.style.borderRadius = appearance.radius !== undefined ? `${appearance.radius}px` : '';
      element.style.opacity = appearance.opacity || '';
      element.style.boxShadow = appearance.shadow ? `0 ${appearance.shadow * 3}px ${appearance.shadow * 10}px rgb(0 0 0 / 30%)` : '';
      element.style.textDecoration = appearance.underline ? 'underline' : '';
      element.style.fontStyle = appearance.italic ? 'italic' : '';
      element.dataset.customRainbow = appearance.rainbow ? 'true' : 'false';
    });
  }

  function openAppearance(target) {
    appearanceTarget = target;
    const id = target.dataset.elementId;
    const label = target.getAttribute('aria-label') || target.textContent.trim().slice(0, 80) || `${target.tagName.toLowerCase()} ${id}`;
    $('#appearance-target-label').textContent = label;
    const saved = state.appearance[id] || {};
    $('#appearance-color').value = saved.color || '#e7f2ed'; $('#appearance-background').value = saved.background || '#172622'; $('#appearance-font').value = saved.font || 'inherit'; $('#appearance-size').value = saved.size || 15; $('#appearance-weight').value = saved.weight || 400; $('#appearance-radius').value = saved.radius ?? 16; $('#appearance-opacity').value = saved.opacity || 1; $('#appearance-shadow').value = saved.shadow || 0; $('#appearance-rainbow').checked = Boolean(saved.rainbow); $('#appearance-underline').checked = Boolean(saved.underline); $('#appearance-italic').checked = Boolean(saved.italic);
    const dialog = $('#appearance-dialog'); openManagedDialog(dialog, { opener: target, focus: $('#appearance-search') });
  }

  function applyAppearance() {
    if (!appearanceTarget) return;
    const id = appearanceTarget.dataset.elementId;
    state.appearance[id] = { color: $('#appearance-color').value, background: $('#appearance-background').value, font: $('#appearance-font').value, size: Number($('#appearance-size').value), weight: Number($('#appearance-weight').value), radius: Number($('#appearance-radius').value), opacity: Number($('#appearance-opacity').value), shadow: Number($('#appearance-shadow').value), rainbow: $('#appearance-rainbow').checked, underline: $('#appearance-underline').checked, italic: $('#appearance-italic').checked };
    applySavedAppearances(); scheduleSave(`Appearance changed for ${id}`); notify('Appearance applied', `The ${id} element changed live.`, 'success');
  }

  function openLockWizard(target) {
    lockTarget = target; const label = target.getAttribute('aria-label') || target.textContent.trim().slice(0, 80) || target.tagName;
    $('#lock-target-label').textContent = label; updateLockRows();
    const dialog = $('#lock-dialog'); openManagedDialog(dialog, { opener: target, focus: $('#lock-policy') });
  }

  function updateLockRows() {
    const policy = $('#lock-policy').value;
    $('#lock-pin-row').hidden = !policy.includes('pin'); $('#lock-keypad').hidden = !policy.includes('pin'); $('#lock-password-row').hidden = !policy.includes('password'); $('#lock-totp-row').hidden = !policy.includes('totp');
  }

  function openUnlock(target) {
    unlockTarget = target; const lock = lockedElements.get(target.dataset.elementId); if (!lock) return;
    $('#unlock-target-label').textContent = `${lock.label} requires ${lock.policy.replaceAll('+', ' plus ')}.`;
    $('#unlock-pin').value = ''; $('#unlock-password').value = ''; $('#unlock-totp').value = ''; $('#unlock-state').textContent = 'Successful verification unlocks this surface for this application session only.';
    const dialog = $('#unlock-dialog'); openManagedDialog(dialog, { opener: target, focus: $('#unlock-pin') });
  }

  function openSuperConfirm(title, description, action) {
    confirmAction = action;
    setOwnedText($('#confirm-title'), title);
    $('#confirm-description').textContent = description;
    for (const key of [$('#confirm-key-one'), $('#confirm-key-two')]) { key.classList.remove('armed'); key.setAttribute('aria-pressed', 'false'); }
    $('#confirm-slider').value = 0;
    $('#confirm-slider').disabled = true;
    $('#confirm-run').disabled = true;
    $('#confirm-progress-fill').style.width = '0%';
    $('#confirm-progress').classList.remove('complete');
    $('#confirm-progress').setAttribute('aria-valuenow', '0');
    $('#confirm-status').textContent = 'Arm both keys to enable the slider.';
    openManagedDialog($('#super-confirm-dialog'), { modal: true, focus: $('#confirm-key-one') });
  }

  function updateConfirmState() {
    const armed = $('#confirm-key-one').classList.contains('armed') && $('#confirm-key-two').classList.contains('armed');
    $('#confirm-slider').disabled = !armed;
    const progress = Number($('#confirm-slider').value);
    $('#confirm-progress-fill').style.width = `${progress}%`;
    $('#confirm-progress').setAttribute('aria-valuenow', String(progress));
    $('#confirm-run').disabled = !(armed && progress === 100);
    $('#confirm-status').textContent = !armed ? 'Arm both keys to enable the slider.' : progress < 100 ? `Confirmation is ${progress} percent complete.` : 'Confirmation is fully armed. The destructive action is ready.';
  }

  function syncFromForm() {
    const sync = state.settings.sync; sync.mode = $('#sync-mode').value; sync.profileId = $('#server-profile-id').value; sync.serverUrl = $('#server-url').value; sync.ssh.host = $('#ssh-host').value; sync.ssh.port = Number($('#ssh-port').value); sync.ssh.username = $('#ssh-username').value; sync.ssh.remoteApiPort = Number($('#ssh-remote-port').value); sync.ssh.localForwardPort = Number($('#ssh-local-port').value); sync.ssh.keyFile = $('#ssh-key-file').value;
  }

  function serviceSyncSettings() {
    syncFromForm();
    return {
      mode: state.settings.sync.mode,
      serverUrl: state.settings.sync.serverUrl,
      ssh: {
        host: state.settings.sync.ssh.host,
        port: state.settings.sync.ssh.port,
        remoteApiPort: state.settings.sync.ssh.remoteApiPort,
        localForwardPort: state.settings.sync.ssh.localForwardPort
      }
    };
  }

  async function serviceRequest(endpoint, method = 'GET', body) {
    return bridge.server.request({
      sync: serviceSyncSettings(),
      endpoint,
      method,
      body,
      timeoutMs: state.settings.sync.timeoutMs
    });
  }

  async function checkOllama() {
    try {
      const result = await bridge.ollama.request({ endpoint: '/api/version' }); $('#ollama-state').textContent = `Healthy ${result.version || ''}`; $('#ollama-state').className = 'state-chip success'; await refreshOllama();
    } catch (error) { $('#ollama-state').textContent = 'Missing or stopped'; $('#ollama-state').className = 'state-chip error'; $('#ollama-models').innerHTML = '<div class="empty-state">Local Ollama is missing, stopped, or unhealthy. Start it locally, then use Check local service to return here.</div>'; handleError(error, 'Local model service unavailable'); }
  }

  async function refreshOllama() {
    const result = await bridge.ollama.request({ endpoint: '/api/tags' }); const models = result.models || []; const container = $('#ollama-models'); container.replaceChildren(); const select = $('#ollama-chat-model'); select.innerHTML = '<option value="">Choose an installed model</option>';
    models.forEach((model) => { const row = document.createElement('div'); row.className = 'model-entry'; row.textContent = `${model.name} · ${model.size ? (model.size / 1e9).toFixed(2) + ' GB' : 'size unknown'} · fit Unknown until RAM, VRAM, driver, disk, parameter, quantization, and context evidence are available`; container.append(row); const option = document.createElement('option'); option.value = model.name; option.textContent = model.name; select.append(option); });
    if (!models.length) container.innerHTML = '<div class="empty-state">The local service is healthy but no models are installed.</div>'; $('#ollama-chat').disabled = !select.value;
  }

  function populateVoices() {
    const voices = speechSynthesis.getVoices();
    const en = $('#narrator-en-voice'); const yue = $('#narrator-yue-voice'); const enCurrent = state.settings.narrator.englishVoiceId; const yueCurrent = state.settings.narrator.cantoneseVoiceId; en.innerHTML = '<option value="auto">Choose automatically</option>'; yue.innerHTML = '<option value="auto">Choose automatically</option>';
    voices.forEach((voice) => { const stableId = voice.voiceURI; if (/^en[-_]/i.test(voice.lang)) { const option = document.createElement('option'); option.value = stableId; option.textContent = `${voice.name} · ${voice.lang}${voice.localService ? '' : ' · network'}`; en.append(option); } if (/^(yue|zh[-_](HK|Hant))/i.test(voice.lang)) { const option = document.createElement('option'); option.value = stableId; option.textContent = `${voice.name} · ${voice.lang}${voice.localService ? '' : ' · network'}`; yue.append(option); } });
    en.value = [...en.options].some((option) => option.value === enCurrent) ? enCurrent : 'auto'; yue.value = [...yue.options].some((option) => option.value === yueCurrent) ? yueCurrent : 'auto';
  }

  function narrate(content, category = 'info') {
    if (!state?.settings.narrator.enabled || !('speechSynthesis' in window)) return;
    narratorQueue = narratorQueue.filter((item) => item.category !== category); narratorQueue.push({ content, category }); drainNarrator();
  }

  function drainNarrator() {
    if (narratorSpeaking || !narratorQueue.length) return; const item = narratorQueue.shift(); narratorSpeaking = true; const settings = state.settings.narrator; const languages = settings.language === 'both' ? ['en', 'yue'] : [settings.language]; let index = 0;
    const speakNext = () => { if (index >= languages.length) { narratorSpeaking = false; drainNarrator(); return; } const language = languages[index++]; const utterance = new SpeechSynthesisUtterance(item.content); utterance.lang = language === 'yue' ? 'yue-HK' : 'en-CA'; utterance.rate = settings.rate; utterance.pitch = settings.pitch; const id = language === 'yue' ? settings.cantoneseVoiceId : settings.englishVoiceId; if (id !== 'auto') utterance.voice = speechSynthesis.getVoices().find((voice) => voice.voiceURI === id) || null; utterance.onend = speakNext; utterance.onerror = speakNext; speechSynthesis.speak(utterance); }; speakNext();
  }

  function renderEverything() {
    applySettings(); displayProvenance(); renderStageDots(); renderGallery(); renderDashboard(); void renderHaircuts(); renderConverter(); renderSettingsForm(); renderSyncForm(); void renderDocs(); void renderNotifications(); void renderSupportTickets(); renderAttentionAccommodations(); clearHaircutForm(); populateVoices(); renderLocks(); applyCommandRegistry();
  }

  function bindNewRegexTriggers(root = document) {
    $$('.regex-trigger', root).forEach((button) => { if (button.dataset.bound) return; button.dataset.bound = 'true'; button.addEventListener('click', () => openRegexBuilder(button)); });
  }

  function bindEvents() {
    $('#window-minimize').addEventListener('click', bridge.window.minimize); $('#window-maximize').addEventListener('click', bridge.window.maximize); $('#window-close').addEventListener('click', bridge.window.close);
    $('#open-palette').addEventListener('click', () => COMMAND_REGISTRY['open-palette'].run()); $('#open-notifications').addEventListener('click', () => COMMAND_REGISTRY['open-notifications'].run());
    $$('.tab').forEach((tab) => { tab.addEventListener('click', () => switchTab(tab.dataset.tab)); tab.addEventListener('keydown', handleTabRovingKey); });
    $$('.group-header').forEach((button) => button.addEventListener('click', () => button.setAttribute('aria-expanded', button.getAttribute('aria-expanded') === 'true' ? 'false' : 'true')));
    $('#tab-search').addEventListener('input', async () => {
      const input = $('#tab-search');
      const tabs = $$('.tab');
      const visible = await filterBySearch(input, tabs, (tab) => tab.textContent);
      if (visible === null) return;
      const visibleTabs = new Set(visible);
      tabs.forEach((tab) => { tab.hidden = !visibleTabs.has(tab); });
    });
    $('#tab-master-search').addEventListener('click', () => openPalette('Open'));
    $('#tab-group-search').addEventListener('click', () => openPalette('Group'));
    $('#quick-haircut').addEventListener('click', () => { switchTab('haircuts'); clearHaircutForm(); $('#haircut-date').focus(); });
    $('#growth-scrubber').addEventListener('input', () => updateVisual(Number($('#growth-scrubber').value)));
    $('#play-growth').addEventListener('click', toggleGrowthPlayback);
    $('#profile-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const unit = $('#display-unit').value; const requestedProfile = Hair.validateProfile({ baselineDate: $('#baseline-date').value, baselineLengthCm: Hair.toCm($('#baseline-length').value, unit), growthRateCmPerMonth: Hair.toCm($('#growth-rate').value, unit), targetLengthCm: Hair.toCm($('#target-length').value, unit), displayUnit: unit }); state.manualBaseline = Hair.manualBaselineFromProfile(requestedProfile); state.profile = Hair.reconcileBaseline(requestedProfile, state.haircuts, state.manualBaseline); await saveNow('Hair growth baseline changed'); renderDashboard(); notify(text('saved'), 'The manual fallback, growth rate, and target estimate were updated. The newest haircut remains the active baseline while one exists.', 'success'); } catch (error) { handleError(error, 'Profile is invalid'); } });
    $('#display-unit').addEventListener('change', () => { const old = state.profile.displayUnit; const next = $('#display-unit').value; ['baseline-length', 'growth-rate', 'target-length'].forEach((id) => { const input = $(`#${id}`); input.value = Hair.fromCm(Hair.toCm(input.value, old), next); }); state.profile.displayUnit = next; renderDashboard(); scheduleSave('Measurement unit changed'); });
    $('#reset-profile').addEventListener('click', fillProfileForm);
    $('#haircut-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const id = $('#haircut-id').value; const haircut = Hair.normalizeHaircut({ id: id || undefined, date: $('#haircut-date').value, preCutLengthCm: Hair.toCm($('#haircut-pre').value, state.profile.displayUnit), postCutLengthCm: Hair.toCm($('#haircut-post').value, state.profile.displayUnit), note: $('#haircut-note').value }); const existing = state.haircuts.findIndex((item) => item.id === haircut.id); const nextHaircuts = existing >= 0 ? state.haircuts.map((item, index) => index === existing ? haircut : item) : [...state.haircuts, haircut]; state.haircuts = Hair.sortHaircutsNewest(nextHaircuts); state.profile = Hair.reconcileBaseline(state.profile, state.haircuts, state.manualBaseline); await saveNow(existing >= 0 ? `Updated haircut ${haircut.date}` : `Recorded haircut ${haircut.date}`); clearHaircutForm(); renderHaircuts(); renderDashboard(); notify('Haircut saved', text('haircutSaved'), 'success'); } catch (error) { handleError(error, 'Haircut is invalid'); } });
    $('#cancel-haircut-edit').addEventListener('click', clearHaircutForm); $('#haircut-search').addEventListener('input', renderHaircuts);
    $('#select-all-haircuts').addEventListener('click', () => $$('.haircut-select').forEach((input) => { input.checked = true; })); $('#delete-selected-haircuts').addEventListener('click', () => requestDeleteHaircuts(selectedHaircutIds()));
    $$('[data-export]').forEach((button) => button.addEventListener('click', async () => { const format = button.dataset.export; try { const data = format === 'json' ? `${JSON.stringify({ schemaVersion: 2, unit: 'cm', profile: state.profile, manualBaseline: state.manualBaseline, haircuts: state.haircuts, omitted: ['credentials', 'personal vocabulary', 'custom logo source'] }, null, 2)}\n` : format === 'csv' ? Hair.haircutToCsv(state.haircuts) : Hair.haircutToMarkdown(state.haircuts); await bridge.files.export({ suggestedName: `haircuts.${format === 'markdown' ? 'md' : format}`, content: data }); notify('Export ready', `${format.toUpperCase()} export completed. Credentials and personal vocabulary were omitted.`, 'success'); } catch (error) { handleError(error, 'Export failed'); } }));
    $('#run-regex').addEventListener('click', () => { void runRegexWorkbench(); }); $('#export-regex').addEventListener('click', () => bridge.files.export({ suggestedName: 'regex-snippet.json', content: `${JSON.stringify({ engine: 'ECMAScript RegExp', pattern: $('#regex-pattern').value, flags: $('#regex-flags').value, replacement: $('#regex-replacement').value, sample: $('#regex-sample').value }, null, 2)}\n` }).catch((error) => handleError(error, 'Regex export failed')));
    $('#choose-converter-source').addEventListener('click', async () => { try { converterSource = await bridge.files.chooseConverterSource(); if (converterSource.canceled) { converterSource = null; return; } $('#converter-source-state').textContent = `${converterSource.name} · ${converterSource.bytes} bytes`; $('#run-conversion').disabled = false; } catch (error) { handleError(error, 'Source selection failed'); } });
    $('#run-conversion').addEventListener('click', async () => { try { const result = await bridge.files.convert({ handle: converterSource.handle, adapter: selectedConverter }); if (!result.canceled) notify('Conversion completed', `${result.name}, ${result.bytes} bytes, passed post-write validation.`, 'success'); } catch (error) { handleError(error, 'Conversion failed'); } });
    $('#generate-auth-secret').addEventListener('click', async () => { try { $('#auth-secret').value = await bridge.authenticator.createSecret(); } catch (error) { handleError(error, 'Secret generation unavailable'); } });
    $('#auth-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await bridge.authenticator.add({ issuer: $('#auth-issuer').value, account: $('#auth-account').value, secret: $('#auth-secret').value, algorithm: $('#auth-algorithm').value, digits: Number($('#auth-digits').value), period: 30 }); event.currentTarget.reset(); await renderAuthenticators(); notify('Authenticator entry added', 'Pairing data was stored through operating-system protection.', 'success'); } catch (error) { handleError(error, 'Authenticator entry is invalid'); } });
    $('#server-test').addEventListener('click', async () => { try { const key = $('#server-api-key').value; if (key) { await bridge.secrets.setApiKey(serviceSyncSettings(), key); $('#server-api-key').value = ''; } const result = await serviceRequest('/health'); $('#server-state').textContent = `Healthy ${result.version || ''}`; $('#server-state').className = 'state-chip success'; notify('Service connected', 'The configured hair length service answered its health endpoint. Credentials remain bound to this exact service destination and were not sent to the public health probe.', 'success'); } catch (error) { $('#server-state').textContent = 'Connection failed'; $('#server-state').className = 'state-chip error'; handleError(error, 'Service connection failed'); } });
    $('#server-push').addEventListener('click', async () => { try { const id = $('#server-profile-id').value; await serviceRequest(`/api/profiles/${id}`, 'PUT', { profile: state.profile }); const remote = await serviceRequest(`/api/profiles/${id}`); for (const operation of Hair.planHaircutSync(state.haircuts, remote.haircuts || [])) { const endpoint = operation.method === 'PUT' ? `/api/profiles/${id}/haircuts/${operation.haircut.id}` : `/api/profiles/${id}/haircuts`; await serviceRequest(endpoint, operation.method, operation.haircut); } syncFromForm(); await saveNow('Service connection settings changed'); notify('Service sync sent', 'Local profile and haircut records were sent to the configured service.', 'success'); } catch (error) { handleError(error, 'Service sync failed'); } });
    $('#server-pull').addEventListener('click', async () => { try { const result = await serviceRequest(`/api/profiles/${$('#server-profile-id').value}`); if (!result) throw new Error('No profile exists under that ID.'); const candidate = Hair.preparePulledSnapshot(result); state = { ...state, ...candidate }; await saveNow('Fetched profile from service'); renderDashboard(); renderHaircuts(); notify('Service data fetched', 'The validated local profile now matches the configured service record.', 'success'); } catch (error) { handleError(error, 'Service fetch failed'); } });
    $('#choose-ssh-key').addEventListener('click', async () => { const file = await bridge.files.chooseKey(); if (file) $('#ssh-key-file').value = file; }); $('#ssh-start').addEventListener('click', async () => { try { syncFromForm(); const result = await bridge.ssh.start(state.settings.sync.ssh); $('#ssh-state').textContent = result.status; scheduleSave('SSH connection settings changed'); } catch (error) { handleError(error, 'SSH tunnel failed'); } }); $('#ssh-stop').addEventListener('click', () => bridge.ssh.stop().catch((error) => handleError(error, 'SSH tunnel stop failed')));
    bridge.ssh.onState((value) => { $('#ssh-state').textContent = value.status; $('#ssh-state').className = `state-chip ${value.status === 'connected' ? 'success' : value.status === 'error' ? 'error' : ''}`; });
    bridge.history.onError((value) => notify('Local history degraded', `${value.message} The primary state save remains valid.`, 'warning', false));
    $('#ollama-check').addEventListener('click', checkOllama); $('#ollama-refresh').addEventListener('click', () => refreshOllama().catch((error) => handleError(error, 'Model refresh failed'))); $('#ollama-chat-model').addEventListener('change', () => { $('#ollama-chat').disabled = !$('#ollama-chat-model').value; }); $('#ollama-chat').addEventListener('click', async () => { try { const result = await bridge.ollama.request({ endpoint: '/api/chat', method: 'POST', body: { model: $('#ollama-chat-model').value, stream: false, messages: [{ role: 'user', content: $('#ollama-prompt').value }], options: { temperature: 0.7 } }, timeoutMs: 120000 }); $('#ollama-response').textContent = result.message?.content || 'No response content.'; } catch (error) { handleError(error, 'Local chat failed'); } });
    $('#settings-search').addEventListener('input', async () => {
      const input = $('#settings-search');
      const cards = $$('.settings-card');
      const visible = await filterBySearch(input, cards, (card) => `${card.textContent} ${card.dataset.settingsKeywords}`);
      if (visible === null) return;
      const visibleCards = new Set(visible);
      cards.forEach((card) => card.classList.toggle('filtered-out', !visibleCards.has(card)));
    });
    $('#setting-language').addEventListener('change', () => { state.settings.language = $('#setting-language').value; applySettings(); scheduleSave('Language mode changed'); }); $('#funny-en').addEventListener('input', () => { state.settings.funnyEnglish = Number($('#funny-en').value); $('#funny-en-value').value = state.settings.funnyEnglish; scheduleSave('English funny level changed'); }); $('#funny-yue').addEventListener('input', () => { state.settings.funnyCantonese = Number($('#funny-yue').value); $('#funny-yue-value').value = state.settings.funnyCantonese; scheduleSave('Cantonese funny level changed'); }); $('#setting-emoji').addEventListener('change', () => { state.settings.showDialogEmoji = $('#setting-emoji').checked; $$('dialog').forEach(syncDialogEmoji); scheduleSave('Dialog emoji setting changed'); });
    $('#school-enabled').addEventListener('change', async () => { try { schoolRecord = await bridge.school.write({ enabled: $('#school-enabled').checked, displayName: $('#school-name').value }); applySettings(); updateSchoolUi(); } catch (error) { handleError(error, 'Shared mode could not change'); } }); $('#school-name').addEventListener('change', async () => { try { schoolRecord = await bridge.school.write({ enabled: $('#school-enabled').checked, displayName: $('#school-name').value }); updateSchoolUi(); } catch (error) { handleError(error, 'Shared mode name could not change'); } }); bridge.school.onChanged((record) => { schoolRecord = record; updateSchoolUi(); applySettings(); });
    ['setting-theme', 'setting-density', 'setting-accent', 'setting-tab-dock', 'rainbow-speed'].forEach((id) => $(`#${id}`).addEventListener('input', () => { const map = { 'setting-theme': 'theme', 'setting-density': 'density', 'setting-accent': 'accent', 'setting-tab-dock': 'tabDock', 'rainbow-speed': 'rainbowSpeedLevel' }; state.settings[map[id]] = id === 'rainbow-speed' ? Number($(`#${id}`).value) : $(`#${id}`).value; applySettings(); scheduleSave(`${map[id]} setting changed`); }));
    $('#setting-display-name').addEventListener('change', () => { state.settings.displayName = $('#setting-display-name').value.trim() || 'Hair Growth Estimator'; applySettings(); scheduleSave('Display name changed'); }); $('#logo-preset').addEventListener('change', () => { state.settings.logo.preset = $('#logo-preset').value; scheduleSave('Logo preset changed'); }); $('#logo-fit').addEventListener('change', () => { state.settings.logo.fit = $('#logo-fit').value; applySettings(); scheduleSave('Logo fit changed'); }); $('#logo-background').addEventListener('input', () => { state.settings.logo.background = $('#logo-background').value; applySettings(); scheduleSave('Logo background changed'); });
    $('#choose-custom-logo').addEventListener('click', async () => { try { const result = await bridge.files.chooseLogo(); if (result.canceled) return; state.settings.logo.customDataUrl = result.dataUrl; applySettings(); renderSettingsForm(); scheduleSave('Custom logo changed'); notify('Custom logo applied', `${result.name}, ${result.bytes} bytes, passed byte-signature validation.`, 'success'); } catch (error) { handleError(error, 'Custom logo rejected'); } }); $('#clear-custom-logo').addEventListener('click', () => { state.settings.logo.customDataUrl = ''; applySettings(); renderSettingsForm(); scheduleSave('Custom logo reset'); });
    $('#choose-vocabulary').addEventListener('click', async () => {
      const previous = vocabularyCache;
      try {
        renderVocabularyStatus('loading');
        const result = await bridge.vocabulary.replace();
        if (result.canceled) { renderVocabularyStatus(previous.status); return; }
        vocabularyCache = { status: 'loaded', schemaVersion: result.schemaVersion, entries: Object.freeze({ ...(result.entries || {}) }) };
        state.vocabulary = { loaded: true, cacheVersion: result.schemaVersion };
        applyOwnedVocabularyBoundaries(); renderVocabularyStatus(); renderPalette(); scheduleSave('Personal vocabulary cache changed');
      } catch (error) {
        vocabularyCache = previous;
        renderVocabularyStatus(previous.status);
        setOwnedText($('#vocabulary-state'), `${text('vocabularyInvalid')} ${previous.status === 'loaded' ? text('vocabularyLoaded') : ''}`.trim());
        handleError(error, 'Vocabulary file rejected');
      }
    });
    $('#clear-vocabulary').addEventListener('click', async () => {
      try {
        await bridge.vocabulary.clear();
        vocabularyCache = { status: 'missing', schemaVersion: null, entries: Object.freeze({}) };
        state.vocabulary = { loaded: false, cacheVersion: null };
        applyOwnedVocabularyBoundaries(); renderVocabularyStatus(); renderPalette(); scheduleSave('Personal vocabulary cache cleared');
      } catch (error) { handleError(error, 'Vocabulary cache could not be cleared'); }
    });
    $$('[data-adhd]').forEach((input) => input.addEventListener('change', () => { state.settings.adhd[input.dataset.adhd] = input.checked; applySettings(); renderAttentionAccommodations(); scheduleSave(`${input.dataset.adhd} accommodation changed`); })); $('#adhd-next-action').addEventListener('change', () => { state.settings.adhd.nextAction = $('#adhd-next-action').value; state.settings.adhd.momentumDismissedUntil = null; renderAttentionAccommodations(); scheduleSave('Current next action changed'); });
    $('#complete-next-action').addEventListener('click', () => { state.settings.adhd.nextAction = ''; $('#adhd-next-action').value = ''; renderAttentionAccommodations(); scheduleSave('Current next action completed'); });
    $('#momentum-not-now').addEventListener('click', () => { state.settings.adhd.momentumDismissedUntil = new Date(Date.now() + 60 * 60000).toISOString(); renderAttentionAccommodations(); scheduleSave('Momentum prompt dismissed for 60 minutes'); });
    $('#add-schedule').addEventListener('click', () => { state.schedules.push({ id: `schedule-${Date.now()}`, label: $('#schedule-label').value.trim() || 'Every-day theme rule', enabled: true, weekdays: [0,1,2,3,4,5,6], startTime: $('#schedule-start').value, endTime: $('#schedule-end').value, theme: state.settings.theme, language: state.settings.language }); renderSchedules(); scheduleSave('Scheduled settings rule added'); });
    $('#narrator-enabled').addEventListener('change', () => { state.settings.narrator.enabled = $('#narrator-enabled').checked; scheduleSave('Narrator enabled setting changed'); }); $('#narrator-language').addEventListener('change', () => { state.settings.narrator.language = $('#narrator-language').value; scheduleSave('Narrator language changed'); }); $('#narrator-en-voice').addEventListener('change', () => { state.settings.narrator.englishVoiceId = $('#narrator-en-voice').value; scheduleSave('English narrator voice changed'); }); $('#narrator-yue-voice').addEventListener('change', () => { state.settings.narrator.cantoneseVoiceId = $('#narrator-yue-voice').value; scheduleSave('Cantonese narrator voice changed'); }); $('#narrator-rate').addEventListener('input', () => { state.settings.narrator.rate = Number($('#narrator-rate').value); $('#narrator-rate-value').value = state.settings.narrator.rate; scheduleSave('Narrator rate changed'); }); $('#narrator-pitch').addEventListener('input', () => { state.settings.narrator.pitch = Number($('#narrator-pitch').value); $('#narrator-pitch-value').value = state.settings.narrator.pitch; scheduleSave('Narrator pitch changed'); }); $('#narrator-test').addEventListener('click', () => narrate('Estimated hair length updated. This is an estimate, not a promise.', 'test'));
    speechSynthesis.addEventListener?.('voiceschanged', populateVoices);
    $('#docs-search').addEventListener('input', () => { void renderDocs(); }); $('#changelog-search').addEventListener('input', () => { void renderChangelog(); }); $('#changelog-date').addEventListener('change', () => { void renderChangelog(); }); $('#refresh-history').addEventListener('click', () => { void renderHistory(); }); $('#open-app-data').addEventListener('click', () => bridge.files.showAppData().catch((error) => handleError(error, 'Folder could not open')));
    $('#palette-search').addEventListener('input', () => { void renderPalette(); });
    $('#notification-search').addEventListener('input', () => { void renderNotifications(); });
    $('#select-all-notices').addEventListener('click', async () => { if (!await renderNotifications()) return; visibleNotifications().forEach((notice) => selectedNotifications.add(notice.id)); void renderNotifications(); });
    $('#invert-notices').addEventListener('click', async () => { if (!await renderNotifications()) return; visibleNotifications().forEach((notice) => { if (selectedNotifications.has(notice.id)) selectedNotifications.delete(notice.id); else selectedNotifications.add(notice.id); }); void renderNotifications(); });
    $('#dismiss-selected-notices').addEventListener('click', () => { const ids = selectedNotificationIds(); state.notifications.forEach((notice) => { if (ids.includes(notice.id)) notice.dismissed = true; }); selectedNotifications.clear(); renderNotifications(); scheduleSave('Notification history bulk dismissed'); });
    $('#delete-selected-notices').addEventListener('click', () => { const ids = selectedNotificationIds(); if (!ids.length) return notify('Nothing selected', 'Select at least one notification first.', 'warning'); openSuperConfirm(`Delete ${ids.length} notification record${ids.length === 1 ? '' : 's'}`, 'This removes the selected records from local notification history.', async () => { state.notifications = state.notifications.filter((notice) => !ids.includes(notice.id)); selectedNotifications.clear(); await saveNow('Notification history records deleted'); renderNotifications(); }); });
    $('#export-notices').addEventListener('click', async () => { if (!await renderNotifications()) return; bridge.files.export({ suggestedName: 'notification-history.json', content: `${JSON.stringify({ schemaVersion: 1, notifications: visibleNotifications(), omitted: ['credentials', 'personal vocabulary'] }, null, 2)}\n` }).catch((error) => handleError(error, 'Notification export failed')); });
    $$('dialog').forEach((dialog) => { dialog.addEventListener('close', () => restoreDialogFocus(dialog)); dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeManagedDialog(dialog); }); syncDialogEmoji(dialog); });
    $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeManagedDialog($(`#${button.dataset.closeDialog}`))));
    $('#history-set-credential').addEventListener('click', async () => {
      const credential = $('#history-password').value;
      try {
        await bridge.history.setCredential(credential);
        historyCredential = credential;
        $('#history-password').value = '';
        await renderHistory();
        notify('History password configured', 'Protected history operations now require this separate password.', 'success');
      } catch (error) { handleError(error, 'History password was not changed'); }
    });
    $('#history-unlock').addEventListener('click', async () => {
      const credential = $('#history-password').value;
      try {
        await bridge.history.list({ credential, limit: 1 });
        historyCredential = credential;
        $('#history-password').value = '';
        await renderHistory();
      } catch (error) { historyCredential = ''; handleError(error, 'History remains locked'); }
    });
    ['history-search', 'history-date-from', 'history-date-to', 'history-action'].forEach((id) => $(`#${id}`).addEventListener(id === 'history-search' ? 'input' : 'change', () => { void renderHistory(); }));
    $('#history-diff').addEventListener('click', async () => {
      const index = historyItems.findIndex((item) => item.commit === selectedHistoryCommit);
      if (index < 0 || index + 1 >= historyItems.length) return notify('Two revisions are needed', 'Select a revision that has an older visible neighbor.', 'warning');
      try { $('#history-diff-output').textContent = await bridge.history.diff(selectedHistoryCommit, historyItems[index + 1].commit, historyCredential); } catch (error) { handleError(error, 'History diff failed'); }
    });
    $('#history-label').addEventListener('click', async () => {
      if (!selectedHistoryCommit) return notify('No revision selected', 'Select one revision to label.', 'warning');
      try { await bridge.history.label(selectedHistoryCommit, $('#history-label-text').value, historyCredential); $('#history-label-text').value = ''; await renderHistory(); } catch (error) { handleError(error, 'History label failed'); }
    });
    $('#history-restore').addEventListener('click', () => {
      if (!selectedHistoryCommit) return notify('No revision selected', 'Select one revision to restore.', 'warning');
      openSuperConfirm('Restore selected local revision', 'The selected redacted snapshot becomes the live state, and the restore is appended as a new revision.', async () => {
        const result = await bridge.history.restore(selectedHistoryCommit, historyCredential);
        state = result.state;
        selectedHistoryCommit = result.commit || '';
        renderEverything();
        await renderHistory();
      });
    });
    $('#history-prune').addEventListener('click', () => {
      const maxEntries = Number($('#history-retention').value);
      openSuperConfirm('Prune older local history revisions', `The newest ${maxEntries} revisions remain. Older revisions are removed according to this explicit retention value.`, async () => { await bridge.history.prune(maxEntries, historyCredential); selectedHistoryCommit = ''; await renderHistory(); });
    });
    $('#history-export').addEventListener('click', async () => {
      try {
        const content = await bridge.history.export({ credential: historyCredential, from: $('#history-date-from').value || null, to: $('#history-date-to').value || null, actions: $('#history-action').value ? [$('#history-action').value] : [], query: $('#history-search').value });
        await bridge.files.export({ suggestedName: 'local-history-redacted.json', content });
      } catch (error) { handleError(error, 'History export failed'); }
    });
    $('#close-regex-popover').addEventListener('click', () => closeRegexPopover()); $('#popover-pattern').addEventListener('input', validatePopoverRegex); $('#popover-flags').addEventListener('input', validatePopoverRegex); $('#popover-enabled').addEventListener('change', validatePopoverRegex); $('#apply-regex-popover').addEventListener('click', applyRegexPopover); $('#open-full-regex').addEventListener('click', () => { closeRegexPopover({ restoreFocus: false }); switchTab('tools'); $('#regex-pattern').focus(); });
    $('#appearance-search').addEventListener('input', async () => { const input = $('#appearance-search'); const rows = $$('.property-grid label'); const visible = await filterBySearch(input, rows, (row) => row.textContent); if (visible === null) return; const visibleRows = new Set(visible); rows.forEach((row) => { row.hidden = !visibleRows.has(row); }); }); $('#apply-appearance').addEventListener('click', applyAppearance); $('#reset-appearance').addEventListener('click', () => { if (!appearanceTarget) return; delete state.appearance[appearanceTarget.dataset.elementId]; appearanceTarget.removeAttribute('style'); appearanceTarget.dataset.customRainbow = 'false'; scheduleSave(`Appearance reset for ${appearanceTarget.dataset.elementId}`); });
    $('#lock-policy').addEventListener('change', updateLockRows); $('#generate-lock-totp').addEventListener('click', async () => { $('#lock-totp').value = await bridge.authenticator.createSecret(); }); $$('#lock-keypad button').forEach((button) => button.addEventListener('click', () => { const input = $('#lock-pin'); if (button.dataset.key === 'clear') input.value = ''; else if (button.dataset.key === 'backspace') input.value = input.value.slice(0, -1); else if (input.value.length < 12) input.value += button.textContent; }));
    $('#lock-form').addEventListener('submit', async (event) => { event.preventDefault(); if (!lockTarget) return; try { await bridge.locks.set({ elementId: lockTarget.dataset.elementId, label: lockTarget.getAttribute('aria-label') || lockTarget.textContent.trim().slice(0, 120) || lockTarget.tagName, policy: $('#lock-policy').value, pin: $('#lock-pin').value, password: $('#lock-password').value, totpSecret: $('#lock-totp').value }); closeManagedDialog($('#lock-dialog')); event.currentTarget.reset(); await renderLocks(); notify('Element locked', 'The element is disabled until its own factors verify. This is for fun, not security.', 'success'); } catch (error) { handleError(error, 'Lock could not be created'); } }); $('#remove-current-lock').addEventListener('click', async () => { if (!lockTarget) return; await bridge.locks.remove(lockTarget.dataset.elementId); unlockedForSession.delete(lockTarget.dataset.elementId); closeManagedDialog($('#lock-dialog')); await renderLocks(); notify('Lock removed', 'The element is available again.', 'success'); });
    $('#unlock-form').addEventListener('submit', async (event) => { event.preventDefault(); if (!unlockTarget) return; try { const result = await bridge.locks.verify({ elementId: unlockTarget.dataset.elementId, pin: $('#unlock-pin').value, password: $('#unlock-password').value, totpCode: $('#unlock-totp').value }); if (!result.ok) { $('#unlock-state').textContent = result.retryAfterMs ? `Values did not match. Try again in ${Math.ceil(result.retryAfterMs / 1000)} seconds, or delete the local application-data folder to reset.` : `Values did not match. ${result.remainingBeforeDelay} attempts remain before a 30-second delay.`; return; } unlockedForSession.add(unlockTarget.dataset.elementId); closeManagedDialog($('#unlock-dialog')); await renderLocks(); notify('Element unlocked', 'This element is unlocked until the application closes.', 'success'); } catch (error) { handleError(error, 'Unlock failed'); } });
    const openSupportTickets = (opener) => { void renderSupportTickets(); openManagedDialog($('#support-dialog'), { opener, focus: $('#support-category') }); };
    $('#open-support').addEventListener('click', () => { const opener = dialogOpeners.get($('#unlock-dialog')); closeManagedDialog($('#unlock-dialog')); openSupportTickets(opener); });
    $('#open-support-from-settings').addEventListener('click', (event) => openSupportTickets(event.currentTarget));
    $('#open-support-from-help').addEventListener('click', (event) => openSupportTickets(event.currentTarget));
    $('#support-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const now = new Date().toISOString();
      const ticket = { id: `LOCAL-${Date.now().toString(36).toUpperCase()}`, category: $('#support-category').value, severity: $('#support-severity').value, description: $('#support-description').value.slice(0, 1000), status: 'Open', createdAt: now, updatedAt: now };
      state.supportTickets.unshift(ticket);
      scheduleSave('Local support ticket created');
      $('#support-result').innerHTML = `<article class="notice-row"><strong></strong><p></p></article>`;
      $('strong', $('#support-result')).textContent = ticket.id;
      $('p', $('#support-result')).textContent = 'First response: the local data folder contains the lock record. Open it, close the application, and delete the folder yourself to reset every local lock.';
      event.currentTarget.reset(); renderSupportTickets();
    });
    $('#support-search').addEventListener('input', () => { void renderSupportTickets(); }); $('#support-status-filter').addEventListener('change', () => { void renderSupportTickets(); });
    $('#select-all-support').addEventListener('click', async () => { if (!await renderSupportTickets()) return; visibleSupportTickets().forEach((ticket) => selectedSupportTickets.add(ticket.id)); void renderSupportTickets(); });
    $('#invert-support').addEventListener('click', async () => { if (!await renderSupportTickets()) return; visibleSupportTickets().forEach((ticket) => { if (selectedSupportTickets.has(ticket.id)) selectedSupportTickets.delete(ticket.id); else selectedSupportTickets.add(ticket.id); }); void renderSupportTickets(); });
    $('#advance-support').addEventListener('click', () => { const ids = selectedSupportTicketIds(); if (!ids.length) return notify('Nothing selected', 'Select at least one local ticket first.', 'warning'); advanceSupportStatus(ids); selectedSupportTickets.clear(); });
    $('#export-support').addEventListener('click', async () => { if (!await renderSupportTickets()) return; bridge.files.export({ suggestedName: 'local-support-tickets.json', content: `${JSON.stringify({ schemaVersion: 1, tickets: visibleSupportTickets(), networkSent: false, omitted: ['credentials', 'personal vocabulary'] }, null, 2)}\n` }).catch((error) => handleError(error, 'Support ticket export failed')); });
    $('#delete-support').addEventListener('click', () => { const ids = selectedSupportTicketIds(); if (!ids.length) return notify('Nothing selected', 'Select at least one local ticket first.', 'warning'); openSuperConfirm(`Delete ${ids.length} local support ticket${ids.length === 1 ? '' : 's'}`, 'This removes the selected fictional local desk records.', async () => { state.supportTickets = state.supportTickets.filter((ticket) => !ids.includes(ticket.id)); selectedSupportTickets.clear(); await saveNow('Local support tickets deleted'); renderSupportTickets(); }); });
    $('#support-open-folder').addEventListener('click', () => bridge.files.showAppData().catch((error) => handleError(error, 'Folder could not open')));
    [$('#confirm-key-one'), $('#confirm-key-two')].forEach((key) => key.addEventListener('click', () => { const armed = !key.classList.contains('armed'); key.classList.toggle('armed', armed); key.setAttribute('aria-pressed', armed ? 'true' : 'false'); updateConfirmState(); }));
    $('#confirm-slider').addEventListener('input', updateConfirmState);
    $('#confirm-emergency').addEventListener('click', () => { confirmAction = null; $('#confirm-status').textContent = 'Destructive action cancelled.'; closeManagedDialog($('#super-confirm-dialog')); });
    $('#confirm-run').addEventListener('click', async () => {
      if (!confirmAction || $('#confirm-run').disabled) return;
      const action = confirmAction;
      confirmAction = null;
      $('#confirm-run').disabled = true;
      $('#confirm-slider').disabled = true;
      $('#confirm-status').textContent = 'Destructive action is running.';
      try {
        await action();
        $('#confirm-progress').classList.add('complete');
        $('#confirm-progress').setAttribute('aria-valuenow', '100');
        $('#confirm-status').textContent = 'Destructive action completed.';
        if (!prefersReducedMotion()) await new Promise((resolve) => setTimeout(resolve, 300));
        closeManagedDialog($('#super-confirm-dialog'));
      } catch (error) {
        $('#confirm-status').textContent = 'Destructive action failed. No success was reported.';
        handleError(error, 'Destructive action failed');
      }
    });
    $('#check-updates').addEventListener('click', () => bridge.updates.check().catch((error) => handleError(error, 'Update check failed'))); $('#restart-update').addEventListener('click', bridge.updates.restart); bridge.updates.onState(updateUpdateUi);
    $('#open-status-hub').addEventListener('click', async () => { const url = $('#status-hub-url').value; if (!url) return notify('No status URL configured', 'Enter an HTTPS address first.', 'warning'); state.settings.statusHubUrl = url; scheduleSave('Status Hub URL changed'); try { await bridge.external.openUrl(url); } catch (error) { handleError(error, 'Status URL could not open'); } });
    $('#context-search').addEventListener('input', async () => { const input = $('#context-search'); const items = $$('[data-context-action]'); const visible = await filterBySearch(input, items, (item) => item.textContent); if (visible === null) return; const visibleItems = new Set(visible); items.forEach((item) => { item.hidden = !visibleItems.has(item); }); }); $$('[data-context-action]').forEach((item) => item.addEventListener('click', async () => { const target = activeContextTarget; closeContextMenu({ restoreFocus: false }); if (!target) return; const command = COMMAND_REGISTRY[item.dataset.commandId]; if (command) command.run(target); if (item.dataset.contextAction === 'copy-label') { await navigator.clipboard.writeText(target.textContent.trim()); target.focus?.({ preventScroll: true }); } }));
    document.addEventListener('contextmenu', (event) => { const target = event.target.closest('[data-element-id]'); if (!target || target.closest('.context-menu')) return; event.preventDefault(); showContextMenu(target, event.clientX, event.clientY); });
    document.addEventListener('keydown', (event) => {
      const target = document.activeElement.closest?.('[data-element-id]') || document.activeElement;
      if (shortcutMatches(event, COMMAND_REGISTRY['open-palette'].shortcut)) { event.preventDefault(); COMMAND_REGISTRY['open-palette'].run(); }
      else if (shortcutMatches(event, COMMAND_REGISTRY['open-notifications'].shortcut)) { event.preventDefault(); COMMAND_REGISTRY['open-notifications'].run(); }
      else if (shortcutMatches(event, COMMAND_REGISTRY['edit-appearance'].shortcut)) { event.preventDefault(); COMMAND_REGISTRY['edit-appearance'].run(target); }
      else if (shortcutMatches(event, COMMAND_REGISTRY['lock-element'].shortcut)) { event.preventDefault(); COMMAND_REGISTRY['lock-element'].run(target); }
      else if (event.key === 'ContextMenu') { event.preventDefault(); showContextMenu(target, 120, 120); }
      else if (event.key === 'Escape') { if (!$('#regex-popover').hidden) closeRegexPopover(); else closeContextMenu(); }
      const locked = event.target.closest?.('.locked-element'); if (locked && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); openUnlock(locked); }
    }, true);
    document.addEventListener('click', (event) => { const locked = event.target.closest?.('.locked-element'); if (locked && !event.target.closest('dialog')) { event.preventDefault(); event.stopImmediatePropagation(); openUnlock(locked); return; } if (!event.target.closest('#context-menu')) closeContextMenu({ restoreFocus: false }); }, true);
    bindNewRegexTriggers();
  }

  function showContextMenu(target, x, y) {
    activeContextTarget = target; contextMenuOpener = target; const menu = $('#context-menu'); const search = $('#context-search'); search.value = ''; $$('[data-context-action]').forEach((item) => { item.hidden = false; }); menu.hidden = false; const width = menu.offsetWidth; const height = menu.offsetHeight; menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x))}px`; menu.style.top = `${Math.max(72, Math.min(window.innerHeight - height - 8, y))}px`; search.focus(); search.dispatchEvent(new Event('input'));
  }

  function closeContextMenu({ restoreFocus = true } = {}) {
    invalidateSearch($('#context-search'));
    $('#context-menu').hidden = true;
    activeContextTarget = null;
    const opener = contextMenuOpener;
    contextMenuOpener = null;
    if (restoreFocus && opener?.isConnected) opener.focus?.({ preventScroll: true });
  }

  function updateSchoolUi() {
    $('#school-enabled').checked = Boolean(schoolRecord?.enabled); $('#school-name').value = schoolRecord?.displayName || 'School mode'; $('#school-heading').textContent = schoolRecord?.displayName || 'School mode'; $('#school-toggle-label').textContent = `Enable ${schoolRecord?.displayName || 'School mode'}`; $('#school-status').textContent = schoolRecord?.status === 'available' ? `Shared record available. Last change: ${schoolRecord.updatedAt ? new Date(schoolRecord.updatedAt).toLocaleString() : 'not yet changed'}.` : 'The shared record is unavailable. The control cannot honestly report a shared change.';
  }

  function updateUpdateUi(value) {
    $('#update-message').textContent = value.message; $('#restart-update').disabled = value.status !== 'ready';
  }

  async function initialize() {
    try {
      [state, provenance, schoolRecord] = await Promise.all([bridge.state.read(), bridge.provenance.read(), bridge.school.read()]);
      await loadVocabularyCache();
      ensureElementIds(); bindEvents(); renderEverything(); updateSchoolUi(); renderHistory(); renderAuthenticators();
      const update = await bridge.updates.state(); updateUpdateUi(update);
      setInterval(() => { if (state.settings.adhd.timeAwareness) $('#metric-current-date').textContent = `${new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date())} · session open ${Math.floor((Date.now() - sessionOpenedAt) / 60000)} minutes`; }, 30000);
      setInterval(renderAuthenticators, 10000);
      setInterval(renderAttentionAccommodations, 30000);
      reducedMotionQuery.addEventListener?.('change', () => { if (prefersReducedMotion() && growthAnimation) { clearInterval(growthAnimation); growthAnimation = null; setOwnedText($('#play-growth'), 'Show next stage'); } applySettings(); });
      notify('Ready', 'Hair growth estimates and local haircut history are ready.', 'success', false);
    } catch (error) {
      document.body.innerHTML = `<main class="view"><section class="surface"><h1>Hair Growth Estimator could not start</h1><p id="fatal-message"></p></section></main>`;
      $('#fatal-message').textContent = error?.message || String(error);
    }
  }

  initialize();
})();
