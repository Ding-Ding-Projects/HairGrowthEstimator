(() => {
  'use strict';

  const bridge = window.hairGrowth;
  const Hair = window.HairMath;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const regexState = new WeakMap();
  const unlockedForSession = new Set();
  const lockedElements = new Map();
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

  const translations = {
    en: {
      subtitle: 'A private, local-first growth journal',
      saved: 'Saved',
      haircutSaved: 'Haircut saved and baseline reset.',
      estimate: 'Estimate',
      noHaircuts: 'No haircuts match this view yet.'
    },
    yue: {
      subtitle: '私人本機生髮日記，啲頭髮慢慢行，資料唔使周圍飛',
      saved: '已經收好，穩陣過夾萬入面再放夾萬',
      haircutSaved: '剪髮紀錄收好，條生長線由新長度再出發。',
      estimate: '估算',
      noHaircuts: '暫時搵唔到剪髮紀錄，個清單光滑過新剃頭。'
    }
  };

  const docs = [
    {
      id: 'about',
      title: 'About this build',
      body: `<h3>About Hair Growth Estimator 1.0.0</h3><p>Release code name: <strong>Classic Har Gow · 蝦餃</strong>, public catalog record <code>hk-dish-0001</code>. The photo remains in the public dim-sum catalog and is not copied into this application.</p><p><a href="#" data-external-url="https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png">Open the public catalog photo</a>.</p><h4>Stable identity</h4><p>Changing the display name or logo changes presentation only. It never changes package identity, data location, executable name, installer identity, or update feed.</p><h4>Suggested articles</h4><p>Hair growth estimation, Privacy and local credentials, Status and recovery.</p>`
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
      body: `<h3>Private synchronization</h3><p>Local mode requires no service. Direct private-LAN mode contacts only the validated HTTP or HTTPS URL you enter and stores an API key through operating-system protection. SSH mode invokes <code>ssh.exe</code> directly without a shell, enables BatchMode, requires an existing trusted host key, uses the persistent user known_hosts file, disables host-key updates, and tears down the child process when stopped or when the application exits.</p><p>While SSH mode is selected, service traffic ignores the direct URL and uses only the validated loopback forward that matches the currently connected tunnel. A disconnected tunnel or changed local port is refused.</p><h4>Pull validation</h4><p>A downloaded profile and every downloaded haircut are validated together before any live state changes. An invalid growth rate, missing pre-cut length, post-cut length above pre-cut length, invalid identifier, or oversized record set leaves the existing local state unchanged.</p><h4>Security boundary</h4><p>The service accepts monthly growth rates from 0.05 through 5 cm, requires both haircut lengths, and refuses apparent growth during a cut. It refuses every non-loopback bind without a strong API key. It validates CORS origins, request sizes, timeouts, dates, lengths, counts, and methods. It never logs request bodies or secrets.</p><h4>Deterministic container build</h4><p>The Dockerfile pins the exact multi-platform Node base-image digest. Its build context is the bounded <code>server/</code> directory, with the root <code>Dockerfile</code> selected explicitly. Release builds target <code>linux/amd64</code>, pass the release version, commit SHA, and commit timestamp as <code>BUILD_VERSION</code>, <code>BUILD_REVISION</code>, and <code>SOURCE_DATE_EPOCH</code>, and export <code>hair-growth-api-1.0.0-linux-amd64.oci.tar</code> as an OCI archive. Registry publication is a separate optional action; local hosting never requires it.</p><h4>Suggested articles</h4><p>Haircut resets, Local persistence and version history, Privacy and local credentials.</p>`
    },
    {
      id: 'persistence',
      title: 'Local persistence and version history',
      body: `<h3>Local persistence and version history</h3><p>Main-process saves run through one serialized queue. Each accepted write must carry the current authoritative revision; a stale candidate is refused rather than overwriting newer data. The primary state file is written atomically before a redacted local-history revision is attempted.</p><p>If local Git history cannot record a revision, the primary save remains valid and the application reports the history degradation. Orderly shutdown waits for both the state queue and history queue before closing, then stops any active SSH tunnel.</p><h4>Recovery boundary</h4><p>History snapshots omit SSH key paths, custom logo bytes, private vocabulary content, and credentials. Restoring revisions remains a separate user action; shutdown draining does not rewrite or prune history.</p><h4>Suggested articles</h4><p>Haircut resets and history, Private synchronization, Privacy and local credentials.</p>`
    },
    {
      id: 'privacy',
      title: 'Privacy and local credentials',
      body: `<h3>Privacy and local credentials</h3><p>Hair records remain on this computer unless you explicitly use service sync. API keys, toy-lock credentials, and authenticator secrets use operating-system protection. Secrets are omitted from ordinary exports, local history, notifications, and logs.</p><p>Personal vocabulary validation is local. No private mapping ships in the application, and clearing the cache restores the original wording.</p><h4>Suggested articles</h4><p>Private synchronization, Toy locks, Local version history.</p>`
    },
    {
      id: 'tools',
      title: 'Regex, converter, and local model tools',
      body: `<h3>Local tools</h3><p>The regex workbench uses the running JavaScript RegExp engine with bounded sample and pattern sizes, live capture tables, replacement preview, capability notes, and adversarial-risk warnings.</p><p>The local file converter enables only bundled text, JSON, hexadecimal, and base64 adapters. Other format families remain visible and disabled with an exact reason. The local model manager talks only to Ollama on loopback and never embeds a cloud model service.</p><h4>Suggested articles</h4><p>Privacy, Export formats, Status and recovery.</p>`
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
      changes: ['Initial hair growth estimator', 'Haircut reset journal', 'Centimetre and inch display', 'Local and private service modes', 'Eight-stage animated image reference', 'SSH service routing bound to the connected local forward', 'Validated service pulls that leave local state unchanged when rejected', 'Newest-haircut baseline reconciliation with a retained manual fallback', 'Serialized revisioned saves with explicit history degradation and orderly queue drain', 'Release code name Classic Har Gow · 蝦餃, catalog record hk-dish-0001']
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
    toast.innerHTML = `<strong></strong><span></span>`;
    $('strong', toast).textContent = state?.settings.showDialogEmoji ? `${kind === 'error' ? '⚠ ' : kind === 'success' ? '✓ ' : '• '}${title}` : title;
    $('span', toast).textContent = body;
    $('#toast-region').append(toast);
    if (!['error', 'warning'].includes(kind)) setTimeout(() => toast.remove(), 5200);
    narrate(`${title}. ${body}`, kind);
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
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await queueStateWrite(event); } catch (error) { handleError(error, 'Local save failed'); }
    }, 180);
  }

  async function saveNow(event) {
    stateMutationSequence += 1;
    clearTimeout(saveTimer);
    return queueStateWrite(event);
  }

  function applyTranslations() {
    $$('[data-i18n]').forEach((element) => { element.textContent = text(element.dataset.i18n); });
    document.documentElement.lang = schoolRecord?.enabled || state.settings.language === 'en' ? 'en' : state.settings.language === 'yue' ? 'yue-Hant-HK' : 'en';
  }

  function applySettings() {
    document.body.dataset.theme = state.settings.theme;
    document.body.dataset.density = state.settings.density;
    document.body.dataset.tabDock = state.settings.tabDock;
    document.documentElement.style.setProperty('--accent', state.settings.accent);
    const rainbowDurations = [20, 13, 8, 5, 3];
    document.documentElement.style.setProperty('--rainbow-duration', `${rainbowDurations[state.settings.rainbowSpeedLevel - 1]}s`);
    document.body.classList.toggle('low-stimulation', state.settings.adhd.lowStimulation || state.settings.reducedMotion);
    document.body.classList.toggle('focus-mode', state.settings.adhd.focus);
    document.body.classList.toggle('school-active', Boolean(schoolRecord?.enabled));
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
      state.settings.language = 'en';
      $$('[data-settings-keywords]').forEach((card) => {
        const words = card.dataset.settingsKeywords.toLowerCase();
        card.hidden = /language|funny|cantonese|vocabulary|dim.sum/.test(words);
      });
    } else {
      $$('[data-settings-keywords]').forEach((card) => { card.hidden = false; });
    }
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
    const frame = $('.portrait-frame');
    frame.classList.add('changing');
    setTimeout(() => {
      const image = $('#growth-portrait');
      image.src = stageImagePath(stage);
      image.alt = `Fictional adult man at the ${stage.label.toLowerCase()} reference stage, approximately ${stage.targetCm} centimetres`;
      $('#visual-stage-label').textContent = stage.label;
      $('#visual-length').textContent = formatLength(lengthCm);
      $('#visual-date').textContent = `Reference image near ${formatLength(stage.targetCm)}`;
      $$('.stage-dot').forEach((dot) => dot.classList.toggle('active', dot.dataset.stageId === stage.id));
      frame.classList.remove('changing');
    }, state.settings.reducedMotion ? 0 : 180);
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
      button.textContent = index + 1;
      button.title = `${stage.label}, about ${stage.targetCm} cm`;
      button.addEventListener('click', () => {
        $('#growth-scrubber').value = stage.targetCm;
        updateVisual(stage.targetCm);
      });
      container.append(button);
    });
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

  function haircutMatcher(haircut) {
    const input = $('#haircut-search');
    const haystack = `${haircut.date} ${haircut.note}`;
    return matchesSearch(input, haystack);
  }

  function renderHaircuts() {
    const list = $('#haircut-list'); list.replaceChildren();
    const visible = state.haircuts.filter(haircutMatcher);
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
    $$('.tab').forEach((item) => { item.classList.toggle('active', item === button); item.setAttribute('aria-selected', item === button ? 'true' : 'false'); });
    $$('.view').forEach((view) => { const active = view.dataset.view === tab; view.hidden = !active; view.classList.toggle('active', active); });
    button.focus({ preventScroll: true });
    if (tab === 'status') displayProvenance();
  }

  function openPalette(query = '') {
    const dialog = $('#command-palette');
    if (!dialog.open) dialog.show();
    $('#palette-search').value = query;
    renderPalette();
    $('#palette-search').focus();
  }

  function paletteEntries() {
    const destinations = $$('.tab').map((tab) => ({ id: `go-${tab.dataset.tab}`, label: `Open ${$('span', tab).textContent}`, kind: 'Destination', action: () => switchTab(tab.dataset.tab) }));
    const settings = [
      { id: 'theme', label: 'Theme', kind: 'Setting', control: 'theme' },
      { id: 'language', label: 'Language mode', kind: 'Setting', control: 'language' },
      { id: 'funny-en', label: 'English funny level', kind: 'Setting', control: 'funny-en' },
      { id: 'funny-yue', label: 'Cantonese funny level', kind: 'Setting', control: 'funny-yue' },
      { id: 'tab-dock', label: 'Tab dock', kind: 'Setting', control: 'tab-dock' }
    ];
    return [...destinations, ...settings, ...docs.map((article) => ({ id: `docs-${article.id}`, label: article.title, kind: 'Offline article', action: () => openDoc(article.id) }))];
  }

  function renderPalette() {
    const container = $('#palette-results'); container.replaceChildren();
    const input = $('#palette-search');
    paletteEntries().filter((entry) => matchesSearch(input, `${entry.label} ${entry.kind}`)).forEach((entry) => {
      const row = document.createElement('div'); row.className = 'palette-row';
      const button = document.createElement('button'); button.type = 'button'; button.innerHTML = `<strong></strong><small></small>`; $('strong', button).textContent = entry.label; $('small', button).textContent = entry.kind;
      button.addEventListener('click', () => { entry.action?.(); if (entry.id.startsWith('go-') || entry.id.startsWith('docs-')) $('#command-palette').close(); });
      row.append(button);
      if (entry.control === 'theme') {
        const select = $('#setting-theme').cloneNode(true); select.value = state.settings.theme; select.removeAttribute('id'); select.addEventListener('change', () => { state.settings.theme = select.value; applySettings(); scheduleSave('Theme changed from command palette'); }); row.append(select);
      } else if (entry.control === 'language') {
        const select = $('#setting-language').cloneNode(true); select.value = state.settings.language; select.removeAttribute('id'); select.addEventListener('change', () => { state.settings.language = select.value; applySettings(); scheduleSave('Language changed from command palette'); }); row.append(select);
      } else if (entry.control === 'funny-en' || entry.control === 'funny-yue') {
        const range = document.createElement('input'); range.type = 'range'; range.min = 1; range.max = 5; range.value = entry.control === 'funny-en' ? state.settings.funnyEnglish : state.settings.funnyCantonese; range.setAttribute('aria-label', entry.label); range.addEventListener('input', () => { state.settings[entry.control === 'funny-en' ? 'funnyEnglish' : 'funnyCantonese'] = Number(range.value); scheduleSave(`${entry.label} changed from command palette`); }); row.append(range);
      } else if (entry.control === 'tab-dock') {
        const select = $('#setting-tab-dock').cloneNode(true); select.value = state.settings.tabDock; select.removeAttribute('id'); select.addEventListener('change', () => { state.settings.tabDock = select.value; applySettings(); scheduleSave('Tab dock changed from command palette'); }); row.append(select);
      }
      container.append(row);
    });
    if (!container.childElementCount) container.innerHTML = '<div class="empty-state">No commands match this search.</div>';
  }

  function matcherFor(input) {
    const value = input.value || '';
    const config = regexState.get(input);
    if (config?.enabled) {
      try {
        const expression = new RegExp(config.pattern || value, config.flags || 'iu');
        return (candidate) => { expression.lastIndex = 0; return expression.test(candidate); };
      } catch { return () => false; }
    }
    const query = value.toLocaleLowerCase();
    return (candidate) => !query || String(candidate).toLocaleLowerCase().includes(query);
  }

  function matchesSearch(input, candidate) {
    return matcherFor(input)(candidate);
  }

  function openRegexBuilder(trigger) {
    const field = trigger.closest('.search-field');
    const input = $('input', field);
    const popover = $('#regex-popover');
    const current = regexState.get(input) || { enabled: false, pattern: input.value || '', flags: 'iu' };
    popover._targetInput = input;
    $('#popover-pattern').value = current.pattern;
    $('#popover-flags').value = current.flags;
    $('#popover-enabled').checked = current.enabled;
    validatePopoverRegex();
    const rect = trigger.getBoundingClientRect();
    popover.hidden = false;
    const width = Math.min(420, window.innerWidth - 24);
    popover.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width))}px`;
    popover.style.top = `${Math.max(76, Math.min(window.innerHeight - popover.offsetHeight - 12, rect.bottom + 8))}px`;
    $('#popover-pattern').focus();
  }

  function validatePopoverRegex() {
    const status = $('#popover-validation');
    if (!$('#popover-enabled').checked) { status.textContent = 'Plain-text search is active.'; status.className = ''; return true; }
    const pattern = $('#popover-pattern').value;
    if (pattern.length > 500) { status.textContent = 'Pattern exceeds the 500-character bound.'; status.className = 'error'; return false; }
    try { new RegExp(pattern, $('#popover-flags').value); status.textContent = 'Pattern is valid for the JavaScript RegExp engine.'; status.className = 'success'; return true; } catch (error) { status.textContent = error.message; status.className = 'error'; return false; }
  }

  function applyRegexPopover() {
    if (!validatePopoverRegex()) return;
    const input = $('#regex-popover')._targetInput;
    if (!input) return;
    regexState.set(input, { enabled: $('#popover-enabled').checked, pattern: $('#popover-pattern').value, flags: $('#popover-flags').value });
    input.dispatchEvent(new Event('input', { bubbles: true }));
    $('#regex-popover').hidden = true;
  }

  function runRegexWorkbench() {
    const pattern = $('#regex-pattern').value;
    const flags = $('#regex-flags').value;
    const sample = $('#regex-sample').value;
    if (pattern.length > 500 || sample.length > 50000) return notify('Regex bounds exceeded', 'Pattern is limited to 500 characters and sample text to 50,000 characters.', 'error');
    const started = performance.now();
    try {
      const expression = new RegExp(pattern, flags);
      const matches = [];
      if (expression.global) {
        for (const match of sample.matchAll(expression)) { matches.push(match); if (matches.length >= 500) break; }
      } else {
        const match = expression.exec(sample); if (match) matches.push(match);
      }
      const elapsed = performance.now() - started;
      const explanation = [];
      if (pattern.includes('(?<')) explanation.push('Named capture group detected.');
      if (/\(\?<?[=!]/.test(pattern)) explanation.push('Lookaround detected.');
      if (/[*+{].*\?/.test(pattern)) explanation.push('Lazy quantifier detected.');
      if (/\[[^\]]+\]/.test(pattern)) explanation.push('Character class detected.');
      if (/\\[1-9]|\\k</.test(pattern)) explanation.push('Backreference detected.');
      if (/\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) explanation.push('Potential nested-quantifier backtracking risk. Keep adversarial input bounded.');
      explanation.push(`Completed in ${elapsed.toFixed(3)} ms with ${matches.length} match${matches.length === 1 ? '' : 'es'}.`);
      $('#regex-explanation').replaceChildren(...explanation.map((line) => { const p = document.createElement('p'); p.textContent = line; return p; }));
      const matchContainer = $('#regex-matches'); matchContainer.replaceChildren();
      matches.forEach((match, index) => {
        const block = document.createElement('div');
        const head = document.createElement('strong'); head.textContent = `#${index + 1} at ${match.index}: ${match[0] || '(zero-width)'}`; block.append(head);
        match.forEach((capture, captureIndex) => { const span = document.createElement('span'); span.className = 'capture-pill'; span.textContent = `$${captureIndex}: ${capture ?? 'unmatched'}`; block.append(span); });
        Object.entries(match.groups || {}).forEach(([name, value]) => { const span = document.createElement('span'); span.className = 'capture-pill'; span.textContent = `${name}: ${value ?? 'unmatched'}`; block.append(span); });
        matchContainer.append(block);
      });
      if (!matches.length) matchContainer.textContent = 'No matches.';
      $('#regex-preview').textContent = sample.replace(expression, $('#regex-replacement').value);
      const capabilities = [
        ['Named and numbered captures', 'Supported'], ['Lookahead and lookbehind', 'Supported by the running engine'], ['Unicode sets and properties', 'Supported where the engine accepts the v or u flags'], ['Atomic groups', 'Unsupported in this engine'], ['Conditionals and subroutines', 'Unsupported in this engine'], ['Possessive quantifiers', 'Unsupported in this engine'], ['Bounded execution', `Pattern 500 chars, sample 50,000 chars, results 500`]
      ];
      const cap = $('#regex-capabilities'); cap.replaceChildren(); capabilities.forEach(([name, status]) => { const row = document.createElement('div'); row.className = 'capability-row'; const a = document.createElement('span'); a.textContent = name; const b = document.createElement('strong'); b.textContent = status; row.append(a, b); cap.append(row); });
    } catch (error) { handleError(error, 'Regex is invalid'); }
  }

  function renderConverter() {
    const container = $('#converter-categories'); container.replaceChildren();
    converterCatalog.forEach((category) => {
      const card = document.createElement('section'); card.className = 'converter-category'; card.dataset.elementId = `converter-${category.category.toLowerCase().replace(/[^a-z]+/g, '-')}`;
      const heading = document.createElement('h4'); heading.textContent = category.category; card.append(heading);
      const search = document.createElement('label'); search.className = 'search-field compact'; search.innerHTML = '<span class="visually-hidden">Search adapters</span><input type="search" placeholder="Search formats"><button type="button" class="regex-trigger" aria-label="Open regex builder for adapter search">.*</button>'; card.append(search);
      const list = document.createElement('div');
      const render = () => {
        list.replaceChildren();
        category.adapters.filter((adapter) => matchesSearch($('input', search), `${adapter.label} ${adapter.reason}`)).forEach((adapter) => {
          const label = document.createElement('label'); label.className = `adapter ${adapter.enabled ? '' : 'unavailable'}`;
          const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'converter-adapter'; radio.value = adapter.id; radio.disabled = !adapter.enabled; radio.checked = adapter.id === selectedConverter;
          radio.addEventListener('change', () => { selectedConverter = adapter.id; $('#run-conversion').disabled = !converterSource; });
          const copyBlock = document.createElement('span'); copyBlock.textContent = `${adapter.label}. ${adapter.reason}`; label.append(radio, copyBlock); list.append(label);
        });
        if (!list.childElementCount) list.textContent = 'No matching adapters in this category.';
      };
      $('input', search).addEventListener('input', render); render(); card.append(list); container.append(card);
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

  function renderDocs() {
    const list = $('#docs-list'); list.replaceChildren();
    docs.filter((article) => matchesSearch($('#docs-search'), `${article.title} ${article.body.replace(/<[^>]+>/g, ' ')}`)).forEach((article) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = article.title; button.addEventListener('click', () => openDoc(article.id)); list.append(button);
    });
    if (!list.childElementCount) list.innerHTML = '<div class="empty-state">No guide article matches.</div>';
    renderChangelog();
  }

  function openDoc(id) {
    switchTab('docs');
    const article = docs.find((item) => item.id === id);
    if (!article) return;
    $('#docs-content').innerHTML = article.body;
    $$('[data-external-url]', $('#docs-content')).forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); bridge.external.openUrl(link.dataset.externalUrl).catch((error) => handleError(error, 'Link could not open')); }));
  }

  function renderChangelog() {
    const list = $('#changelog-list'); list.replaceChildren();
    const from = $('#changelog-date').value;
    changelog.filter((entry) => (!from || entry.date >= from) && matchesSearch($('#changelog-search'), `${entry.version} ${entry.date} ${entry.changes.join(' ')}`)).forEach((entry) => {
      const row = document.createElement('article'); row.className = 'changelog-row';
      const heading = document.createElement('strong'); heading.textContent = `Version ${entry.version} · ${entry.date}`;
      const listElement = document.createElement('ul'); entry.changes.forEach((change) => { const item = document.createElement('li'); item.textContent = change; listElement.append(item); });
      const commit = document.createElement('small'); commit.textContent = `Commit: ${entry.commit}`; row.append(heading, listElement, commit); list.append(row);
    });
    if (!list.childElementCount) list.innerHTML = '<div class="empty-state">No released changes match the active filters.</div>';
  }

  async function renderHistory() {
    const list = $('#history-list'); list.replaceChildren();
    try {
      const items = await bridge.history.list(200);
      items.forEach((item) => {
        const row = document.createElement('article'); row.className = 'history-row';
        const heading = document.createElement('strong'); heading.textContent = item.subject;
        const detail = document.createElement('p'); detail.textContent = `${new Date(item.date).toLocaleString()} · ${item.commit.slice(0, 12)}`; row.append(heading, detail); list.append(row);
      });
    } catch (error) { list.innerHTML = '<div class="empty-state">Local history could not be read.</div>'; handleError(error, 'History unavailable'); }
  }

  function renderNotifications() {
    const list = $('#notification-list'); if (!list || !state) return; list.replaceChildren();
    state.notifications.forEach((notice) => {
      const row = document.createElement('article'); row.className = 'notice-row';
      const heading = document.createElement('strong'); heading.textContent = notice.title;
      const detail = document.createElement('p'); detail.textContent = notice.body;
      const time = document.createElement('small'); time.textContent = new Date(notice.timestamp).toLocaleString(); row.append(heading, detail, time); list.append(row);
    });
    if (!state.notifications.length) list.innerHTML = '<div class="empty-state">No notifications recorded.</div>';
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
    const dialog = $('#appearance-dialog'); if (!dialog.open) dialog.show();
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
    const dialog = $('#lock-dialog'); if (!dialog.open) dialog.show();
  }

  function updateLockRows() {
    const policy = $('#lock-policy').value;
    $('#lock-pin-row').hidden = !policy.includes('pin'); $('#lock-keypad').hidden = !policy.includes('pin'); $('#lock-password-row').hidden = !policy.includes('password'); $('#lock-totp-row').hidden = !policy.includes('totp');
  }

  function openUnlock(target) {
    unlockTarget = target; const lock = lockedElements.get(target.dataset.elementId); if (!lock) return;
    $('#unlock-target-label').textContent = `${lock.label} requires ${lock.policy.replaceAll('+', ' plus ')}.`;
    $('#unlock-pin').value = ''; $('#unlock-password').value = ''; $('#unlock-totp').value = ''; $('#unlock-state').textContent = 'Successful verification unlocks this surface for this application session only.';
    const dialog = $('#unlock-dialog'); if (!dialog.open) dialog.show();
  }

  function openSuperConfirm(title, description, action) {
    confirmAction = action; $('#confirm-title').textContent = title; $('#confirm-description').textContent = description; $('#confirm-key-one').classList.remove('armed'); $('#confirm-key-two').classList.remove('armed'); $('#confirm-slider').value = 0; $('#confirm-slider').disabled = true; $('#confirm-run').disabled = true; $('#confirm-progress-fill').style.width = '0%'; $('#super-confirm-dialog').showModal();
  }

  function updateConfirmState() {
    const armed = $('#confirm-key-one').classList.contains('armed') && $('#confirm-key-two').classList.contains('armed'); $('#confirm-slider').disabled = !armed; const progress = Number($('#confirm-slider').value); $('#confirm-progress-fill').style.width = `${progress}%`; $('#confirm-run').disabled = !(armed && progress === 100);
  }

  function syncFromForm() {
    const sync = state.settings.sync; sync.mode = $('#sync-mode').value; sync.profileId = $('#server-profile-id').value; sync.serverUrl = $('#server-url').value; sync.ssh.host = $('#ssh-host').value; sync.ssh.port = Number($('#ssh-port').value); sync.ssh.username = $('#ssh-username').value; sync.ssh.remoteApiPort = Number($('#ssh-remote-port').value); sync.ssh.localForwardPort = Number($('#ssh-local-port').value); sync.ssh.keyFile = $('#ssh-key-file').value;
  }

  async function serviceRequest(endpoint, method = 'GET', body) {
    syncFromForm();
    return bridge.server.request({
      sync: {
        mode: state.settings.sync.mode,
        serverUrl: state.settings.sync.serverUrl,
        ssh: { localForwardPort: state.settings.sync.ssh.localForwardPort }
      },
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
    applySettings(); displayProvenance(); renderStageDots(); renderGallery(); renderDashboard(); renderHaircuts(); renderConverter(); renderSettingsForm(); renderSyncForm(); renderDocs(); renderNotifications(); clearHaircutForm(); populateVoices(); renderLocks();
  }

  function bindNewRegexTriggers(root = document) {
    $$('.regex-trigger', root).forEach((button) => { if (button.dataset.bound) return; button.dataset.bound = 'true'; button.addEventListener('click', () => openRegexBuilder(button)); });
  }

  function bindEvents() {
    $('#window-minimize').addEventListener('click', bridge.window.minimize); $('#window-maximize').addEventListener('click', bridge.window.maximize); $('#window-close').addEventListener('click', bridge.window.close);
    $('#open-palette').addEventListener('click', () => openPalette()); $('#open-notifications').addEventListener('click', () => $('#notification-dialog').show());
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
    $$('.group-header').forEach((button) => button.addEventListener('click', () => button.setAttribute('aria-expanded', button.getAttribute('aria-expanded') === 'true' ? 'false' : 'true')));
    $('#tab-search').addEventListener('input', () => $$('.tab').forEach((tab) => { tab.hidden = !matchesSearch($('#tab-search'), tab.textContent); }));
    $('#tab-master-search').addEventListener('click', () => openPalette('Open'));
    $('#tab-group-search').addEventListener('click', () => { const query = prompt('Group name search'); if (query) $$('.group-header').find((item) => item.textContent.toLowerCase().includes(query.toLowerCase()))?.focus(); });
    $('#quick-haircut').addEventListener('click', () => { switchTab('haircuts'); clearHaircutForm(); $('#haircut-date').focus(); });
    $('#growth-scrubber').addEventListener('input', () => updateVisual(Number($('#growth-scrubber').value)));
    $('#play-growth').addEventListener('click', () => { if (growthAnimation) { clearInterval(growthAnimation); growthAnimation = null; $('#play-growth').textContent = 'Play growth'; return; } let value = 0; $('#play-growth').textContent = 'Pause'; growthAnimation = setInterval(() => { value = value >= 30 ? 0 : value + .3; $('#growth-scrubber').value = value; updateVisual(value); }, state.settings.reducedMotion ? 1200 : 650); });
    $('#profile-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const unit = $('#display-unit').value; const requestedProfile = Hair.validateProfile({ baselineDate: $('#baseline-date').value, baselineLengthCm: Hair.toCm($('#baseline-length').value, unit), growthRateCmPerMonth: Hair.toCm($('#growth-rate').value, unit), targetLengthCm: Hair.toCm($('#target-length').value, unit), displayUnit: unit }); state.manualBaseline = Hair.manualBaselineFromProfile(requestedProfile); state.profile = Hair.reconcileBaseline(requestedProfile, state.haircuts, state.manualBaseline); await saveNow('Hair growth baseline changed'); renderDashboard(); notify(text('saved'), 'The manual fallback, growth rate, and target estimate were updated. The newest haircut remains the active baseline while one exists.', 'success'); } catch (error) { handleError(error, 'Profile is invalid'); } });
    $('#display-unit').addEventListener('change', () => { const old = state.profile.displayUnit; const next = $('#display-unit').value; ['baseline-length', 'growth-rate', 'target-length'].forEach((id) => { const input = $(`#${id}`); input.value = Hair.fromCm(Hair.toCm(input.value, old), next); }); state.profile.displayUnit = next; renderDashboard(); scheduleSave('Measurement unit changed'); });
    $('#reset-profile').addEventListener('click', fillProfileForm);
    $('#haircut-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const id = $('#haircut-id').value; const haircut = Hair.normalizeHaircut({ id: id || undefined, date: $('#haircut-date').value, preCutLengthCm: Hair.toCm($('#haircut-pre').value, state.profile.displayUnit), postCutLengthCm: Hair.toCm($('#haircut-post').value, state.profile.displayUnit), note: $('#haircut-note').value }); const existing = state.haircuts.findIndex((item) => item.id === haircut.id); const nextHaircuts = existing >= 0 ? state.haircuts.map((item, index) => index === existing ? haircut : item) : [...state.haircuts, haircut]; state.haircuts = Hair.sortHaircutsNewest(nextHaircuts); state.profile = Hair.reconcileBaseline(state.profile, state.haircuts, state.manualBaseline); await saveNow(existing >= 0 ? `Updated haircut ${haircut.date}` : `Recorded haircut ${haircut.date}`); clearHaircutForm(); renderHaircuts(); renderDashboard(); notify('Haircut saved', text('haircutSaved'), 'success'); } catch (error) { handleError(error, 'Haircut is invalid'); } });
    $('#cancel-haircut-edit').addEventListener('click', clearHaircutForm); $('#haircut-search').addEventListener('input', renderHaircuts);
    $('#select-all-haircuts').addEventListener('click', () => $$('.haircut-select').forEach((input) => { input.checked = true; })); $('#delete-selected-haircuts').addEventListener('click', () => requestDeleteHaircuts(selectedHaircutIds()));
    $$('[data-export]').forEach((button) => button.addEventListener('click', async () => { const format = button.dataset.export; try { const data = format === 'json' ? `${JSON.stringify({ schemaVersion: 2, unit: 'cm', profile: state.profile, manualBaseline: state.manualBaseline, haircuts: state.haircuts, omitted: ['credentials', 'personal vocabulary', 'custom logo source'] }, null, 2)}\n` : format === 'csv' ? Hair.haircutToCsv(state.haircuts) : Hair.haircutToMarkdown(state.haircuts); await bridge.files.export({ suggestedName: `haircuts.${format === 'markdown' ? 'md' : format}`, content: data }); notify('Export ready', `${format.toUpperCase()} export completed. Credentials and personal vocabulary were omitted.`, 'success'); } catch (error) { handleError(error, 'Export failed'); } }));
    $('#run-regex').addEventListener('click', runRegexWorkbench); $('#export-regex').addEventListener('click', () => bridge.files.export({ suggestedName: 'regex-snippet.json', content: `${JSON.stringify({ engine: 'ECMAScript RegExp', pattern: $('#regex-pattern').value, flags: $('#regex-flags').value, replacement: $('#regex-replacement').value, sample: $('#regex-sample').value }, null, 2)}\n` }).catch((error) => handleError(error, 'Regex export failed')));
    $('#choose-converter-source').addEventListener('click', async () => { try { converterSource = await bridge.files.chooseConverterSource(); if (converterSource.canceled) { converterSource = null; return; } $('#converter-source-state').textContent = `${converterSource.name} · ${converterSource.bytes} bytes`; $('#run-conversion').disabled = false; } catch (error) { handleError(error, 'Source selection failed'); } });
    $('#run-conversion').addEventListener('click', async () => { try { const result = await bridge.files.convert({ handle: converterSource.handle, adapter: selectedConverter }); if (!result.canceled) notify('Conversion completed', `${result.name}, ${result.bytes} bytes, passed post-write validation.`, 'success'); } catch (error) { handleError(error, 'Conversion failed'); } });
    $('#generate-auth-secret').addEventListener('click', async () => { try { $('#auth-secret').value = await bridge.authenticator.createSecret(); } catch (error) { handleError(error, 'Secret generation unavailable'); } });
    $('#auth-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await bridge.authenticator.add({ issuer: $('#auth-issuer').value, account: $('#auth-account').value, secret: $('#auth-secret').value, algorithm: $('#auth-algorithm').value, digits: Number($('#auth-digits').value), period: 30 }); event.currentTarget.reset(); await renderAuthenticators(); notify('Authenticator entry added', 'Pairing data was stored through operating-system protection.', 'success'); } catch (error) { handleError(error, 'Authenticator entry is invalid'); } });
    $('#server-test').addEventListener('click', async () => { try { const key = $('#server-api-key').value; if (key) { await bridge.secrets.setApiKey(key); $('#server-api-key').value = ''; } const result = await serviceRequest('/health'); $('#server-state').textContent = `Healthy ${result.version || ''}`; $('#server-state').className = 'state-chip success'; notify('Service connected', 'The configured hair length service answered its health endpoint.', 'success'); } catch (error) { $('#server-state').textContent = 'Connection failed'; $('#server-state').className = 'state-chip error'; handleError(error, 'Service connection failed'); } });
    $('#server-push').addEventListener('click', async () => { try { const id = $('#server-profile-id').value; await serviceRequest(`/api/profiles/${id}`, 'PUT', { profile: state.profile }); const remote = await serviceRequest(`/api/profiles/${id}`); for (const operation of Hair.planHaircutSync(state.haircuts, remote.haircuts || [])) { const endpoint = operation.method === 'PUT' ? `/api/profiles/${id}/haircuts/${operation.haircut.id}` : `/api/profiles/${id}/haircuts`; await serviceRequest(endpoint, operation.method, operation.haircut); } syncFromForm(); await saveNow('Service connection settings changed'); notify('Service sync sent', 'Local profile and haircut records were sent to the configured service.', 'success'); } catch (error) { handleError(error, 'Service sync failed'); } });
    $('#server-pull').addEventListener('click', async () => { try { const result = await serviceRequest(`/api/profiles/${$('#server-profile-id').value}`); if (!result) throw new Error('No profile exists under that ID.'); const candidate = Hair.preparePulledSnapshot(result); state = { ...state, ...candidate }; await saveNow('Fetched profile from service'); renderDashboard(); renderHaircuts(); notify('Service data fetched', 'The validated local profile now matches the configured service record.', 'success'); } catch (error) { handleError(error, 'Service fetch failed'); } });
    $('#choose-ssh-key').addEventListener('click', async () => { const file = await bridge.files.chooseKey(); if (file) $('#ssh-key-file').value = file; }); $('#ssh-start').addEventListener('click', async () => { try { syncFromForm(); const result = await bridge.ssh.start(state.settings.sync.ssh); $('#ssh-state').textContent = result.status; scheduleSave('SSH connection settings changed'); } catch (error) { handleError(error, 'SSH tunnel failed'); } }); $('#ssh-stop').addEventListener('click', () => bridge.ssh.stop().catch((error) => handleError(error, 'SSH tunnel stop failed')));
    bridge.ssh.onState((value) => { $('#ssh-state').textContent = value.status; $('#ssh-state').className = `state-chip ${value.status === 'connected' ? 'success' : value.status === 'error' ? 'error' : ''}`; });
    bridge.history.onError((value) => notify('Local history degraded', `${value.message} The primary state save remains valid.`, 'warning', false));
    $('#ollama-check').addEventListener('click', checkOllama); $('#ollama-refresh').addEventListener('click', () => refreshOllama().catch((error) => handleError(error, 'Model refresh failed'))); $('#ollama-chat-model').addEventListener('change', () => { $('#ollama-chat').disabled = !$('#ollama-chat-model').value; }); $('#ollama-chat').addEventListener('click', async () => { try { const result = await bridge.ollama.request({ endpoint: '/api/chat', method: 'POST', body: { model: $('#ollama-chat-model').value, stream: false, messages: [{ role: 'user', content: $('#ollama-prompt').value }], options: { temperature: 0.7 } }, timeoutMs: 120000 }); $('#ollama-response').textContent = result.message?.content || 'No response content.'; } catch (error) { handleError(error, 'Local chat failed'); } });
    $('#settings-search').addEventListener('input', () => $$('.settings-card').forEach((card) => card.classList.toggle('filtered-out', !matchesSearch($('#settings-search'), `${card.textContent} ${card.dataset.settingsKeywords}`))));
    $('#setting-language').addEventListener('change', () => { state.settings.language = $('#setting-language').value; applySettings(); scheduleSave('Language mode changed'); }); $('#funny-en').addEventListener('input', () => { state.settings.funnyEnglish = Number($('#funny-en').value); $('#funny-en-value').value = state.settings.funnyEnglish; scheduleSave('English funny level changed'); }); $('#funny-yue').addEventListener('input', () => { state.settings.funnyCantonese = Number($('#funny-yue').value); $('#funny-yue-value').value = state.settings.funnyCantonese; scheduleSave('Cantonese funny level changed'); }); $('#setting-emoji').addEventListener('change', () => { state.settings.showDialogEmoji = $('#setting-emoji').checked; scheduleSave('Dialog emoji setting changed'); });
    $('#school-enabled').addEventListener('change', async () => { try { schoolRecord = await bridge.school.write({ enabled: $('#school-enabled').checked, displayName: $('#school-name').value }); applySettings(); updateSchoolUi(); } catch (error) { handleError(error, 'Shared mode could not change'); } }); $('#school-name').addEventListener('change', async () => { try { schoolRecord = await bridge.school.write({ enabled: $('#school-enabled').checked, displayName: $('#school-name').value }); updateSchoolUi(); } catch (error) { handleError(error, 'Shared mode name could not change'); } }); bridge.school.onChanged((record) => { schoolRecord = record; updateSchoolUi(); applySettings(); });
    ['setting-theme', 'setting-density', 'setting-accent', 'setting-tab-dock', 'rainbow-speed'].forEach((id) => $(`#${id}`).addEventListener('input', () => { const map = { 'setting-theme': 'theme', 'setting-density': 'density', 'setting-accent': 'accent', 'setting-tab-dock': 'tabDock', 'rainbow-speed': 'rainbowSpeedLevel' }; state.settings[map[id]] = id === 'rainbow-speed' ? Number($(`#${id}`).value) : $(`#${id}`).value; applySettings(); scheduleSave(`${map[id]} setting changed`); }));
    $('#setting-display-name').addEventListener('change', () => { state.settings.displayName = $('#setting-display-name').value.trim() || 'Hair Growth Estimator'; applySettings(); scheduleSave('Display name changed'); }); $('#logo-preset').addEventListener('change', () => { state.settings.logo.preset = $('#logo-preset').value; scheduleSave('Logo preset changed'); }); $('#logo-fit').addEventListener('change', () => { state.settings.logo.fit = $('#logo-fit').value; applySettings(); scheduleSave('Logo fit changed'); }); $('#logo-background').addEventListener('input', () => { state.settings.logo.background = $('#logo-background').value; applySettings(); scheduleSave('Logo background changed'); });
    $('#choose-custom-logo').addEventListener('click', async () => { try { const result = await bridge.files.chooseLogo(); if (result.canceled) return; state.settings.logo.customDataUrl = result.dataUrl; applySettings(); renderSettingsForm(); scheduleSave('Custom logo changed'); notify('Custom logo applied', `${result.name}, ${result.bytes} bytes, passed byte-signature validation.`, 'success'); } catch (error) { handleError(error, 'Custom logo rejected'); } }); $('#clear-custom-logo').addEventListener('click', () => { state.settings.logo.customDataUrl = ''; applySettings(); renderSettingsForm(); scheduleSave('Custom logo reset'); });
    $('#choose-vocabulary').addEventListener('click', async () => { try { const result = await bridge.files.chooseVocabulary(); if (result.canceled) return; const parsed = parseVocabulary(result.text); localStorage.setItem('hair-growth-personal-vocabulary', JSON.stringify(parsed)); state.vocabulary = { loaded: true, cacheVersion: parsed.schemaVersion }; $('#vocabulary-state').textContent = `${result.name} loaded locally with ${Object.keys(parsed.replacements).length} replacements.`; scheduleSave('Personal vocabulary cache changed'); } catch (error) { handleError(error, 'Vocabulary file rejected'); } }); $('#clear-vocabulary').addEventListener('click', () => { localStorage.removeItem('hair-growth-personal-vocabulary'); state.vocabulary = { loaded: false, cacheVersion: null }; $('#vocabulary-state').textContent = 'No file loaded. Original shipped wording is active.'; scheduleSave('Personal vocabulary cache cleared'); });
    $$('[data-adhd]').forEach((input) => input.addEventListener('change', () => { state.settings.adhd[input.dataset.adhd] = input.checked; applySettings(); scheduleSave(`${input.dataset.adhd} accommodation changed`); })); $('#adhd-next-action').addEventListener('change', () => { state.settings.adhd.nextAction = $('#adhd-next-action').value; scheduleSave('Current next action changed'); });
    $('#add-schedule').addEventListener('click', () => { state.schedules.push({ id: `schedule-${Date.now()}`, label: $('#schedule-label').value.trim() || 'Every-day theme rule', enabled: true, weekdays: [0,1,2,3,4,5,6], startTime: $('#schedule-start').value, endTime: $('#schedule-end').value, theme: state.settings.theme, language: state.settings.language }); renderSchedules(); scheduleSave('Scheduled settings rule added'); });
    $('#narrator-enabled').addEventListener('change', () => { state.settings.narrator.enabled = $('#narrator-enabled').checked; scheduleSave('Narrator enabled setting changed'); }); $('#narrator-language').addEventListener('change', () => { state.settings.narrator.language = $('#narrator-language').value; scheduleSave('Narrator language changed'); }); $('#narrator-en-voice').addEventListener('change', () => { state.settings.narrator.englishVoiceId = $('#narrator-en-voice').value; scheduleSave('English narrator voice changed'); }); $('#narrator-yue-voice').addEventListener('change', () => { state.settings.narrator.cantoneseVoiceId = $('#narrator-yue-voice').value; scheduleSave('Cantonese narrator voice changed'); }); $('#narrator-rate').addEventListener('input', () => { state.settings.narrator.rate = Number($('#narrator-rate').value); $('#narrator-rate-value').value = state.settings.narrator.rate; scheduleSave('Narrator rate changed'); }); $('#narrator-pitch').addEventListener('input', () => { state.settings.narrator.pitch = Number($('#narrator-pitch').value); $('#narrator-pitch-value').value = state.settings.narrator.pitch; scheduleSave('Narrator pitch changed'); }); $('#narrator-test').addEventListener('click', () => narrate('Estimated hair length updated. This is an estimate, not a promise.', 'test'));
    speechSynthesis.addEventListener?.('voiceschanged', populateVoices);
    $('#docs-search').addEventListener('input', renderDocs); $('#changelog-search').addEventListener('input', renderChangelog); $('#changelog-date').addEventListener('change', renderChangelog); $('#refresh-history').addEventListener('click', renderHistory); $('#open-app-data').addEventListener('click', () => bridge.files.showAppData().catch((error) => handleError(error, 'Folder could not open')));
    $('#palette-search').addEventListener('input', renderPalette); $('#dismiss-all-notices').addEventListener('click', () => { state.notifications = []; renderNotifications(); scheduleSave('Notification history dismissed'); }); $('#export-notices').addEventListener('click', () => bridge.files.export({ suggestedName: 'notification-history.json', content: `${JSON.stringify(state.notifications, null, 2)}\n` }));
    $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.closeDialog}`).close()));
    $('#close-regex-popover').addEventListener('click', () => { $('#regex-popover').hidden = true; }); $('#popover-pattern').addEventListener('input', validatePopoverRegex); $('#popover-flags').addEventListener('input', validatePopoverRegex); $('#popover-enabled').addEventListener('change', validatePopoverRegex); $('#apply-regex-popover').addEventListener('click', applyRegexPopover); $('#open-full-regex').addEventListener('click', () => { $('#regex-popover').hidden = true; switchTab('tools'); $('#regex-pattern').focus(); });
    $('#appearance-search').addEventListener('input', () => $$('.property-grid label').forEach((row) => { row.hidden = !matchesSearch($('#appearance-search'), row.textContent); })); $('#apply-appearance').addEventListener('click', applyAppearance); $('#reset-appearance').addEventListener('click', () => { if (!appearanceTarget) return; delete state.appearance[appearanceTarget.dataset.elementId]; appearanceTarget.removeAttribute('style'); appearanceTarget.dataset.customRainbow = 'false'; scheduleSave(`Appearance reset for ${appearanceTarget.dataset.elementId}`); });
    $('#lock-policy').addEventListener('change', updateLockRows); $('#generate-lock-totp').addEventListener('click', async () => { $('#lock-totp').value = await bridge.authenticator.createSecret(); }); $$('#lock-keypad button').forEach((button) => button.addEventListener('click', () => { const input = $('#lock-pin'); if (button.dataset.key === 'clear') input.value = ''; else if (button.dataset.key === 'backspace') input.value = input.value.slice(0, -1); else if (input.value.length < 12) input.value += button.textContent; }));
    $('#lock-form').addEventListener('submit', async (event) => { event.preventDefault(); if (!lockTarget) return; try { await bridge.locks.set({ elementId: lockTarget.dataset.elementId, label: lockTarget.getAttribute('aria-label') || lockTarget.textContent.trim().slice(0, 120) || lockTarget.tagName, policy: $('#lock-policy').value, pin: $('#lock-pin').value, password: $('#lock-password').value, totpSecret: $('#lock-totp').value }); $('#lock-dialog').close(); event.currentTarget.reset(); await renderLocks(); notify('Element locked', 'The element is disabled until its own factors verify. This is for fun, not security.', 'success'); } catch (error) { handleError(error, 'Lock could not be created'); } }); $('#remove-current-lock').addEventListener('click', async () => { if (!lockTarget) return; await bridge.locks.remove(lockTarget.dataset.elementId); unlockedForSession.delete(lockTarget.dataset.elementId); $('#lock-dialog').close(); await renderLocks(); notify('Lock removed', 'The element is available again.', 'success'); });
    $('#unlock-form').addEventListener('submit', async (event) => { event.preventDefault(); if (!unlockTarget) return; try { const result = await bridge.locks.verify({ elementId: unlockTarget.dataset.elementId, pin: $('#unlock-pin').value, password: $('#unlock-password').value, totpCode: $('#unlock-totp').value }); if (!result.ok) { $('#unlock-state').textContent = result.retryAfterMs ? `Values did not match. Try again in ${Math.ceil(result.retryAfterMs / 1000)} seconds, or delete the local application-data folder to reset.` : `Values did not match. ${result.remainingBeforeDelay} attempts remain before a 30-second delay.`; return; } unlockedForSession.add(unlockTarget.dataset.elementId); $('#unlock-dialog').close(); await renderLocks(); notify('Element unlocked', 'This element is unlocked until the application closes.', 'success'); } catch (error) { handleError(error, 'Unlock failed'); } }); $('#open-support').addEventListener('click', () => { $('#unlock-dialog').close(); $('#support-dialog').show(); });
    $('#support-form').addEventListener('submit', (event) => { event.preventDefault(); const ticket = { id: `LOCAL-${Date.now().toString(36).toUpperCase()}`, category: $('#support-category').value, severity: $('#support-severity').value, description: $('#support-description').value.slice(0, 1000), status: 'Resolved with the same manual that opened the desk', createdAt: new Date().toISOString() }; state.supportTickets.unshift(ticket); scheduleSave('Local support ticket created'); $('#support-result').innerHTML = `<article class="notice-row"><strong></strong><p></p></article>`; $('strong', $('#support-result')).textContent = ticket.id; $('p', $('#support-result')).textContent = 'First response: the local data folder contains the lock record. Open it, close the application, and delete the folder yourself to reset every local lock.'; }); $('#support-open-folder').addEventListener('click', () => bridge.files.showAppData().catch((error) => handleError(error, 'Folder could not open')));
    $('#confirm-key-one').addEventListener('click', () => { $('#confirm-key-one').classList.toggle('armed'); updateConfirmState(); }); $('#confirm-key-two').addEventListener('click', () => { $('#confirm-key-two').classList.toggle('armed'); updateConfirmState(); }); $('#confirm-slider').addEventListener('input', updateConfirmState); $('#confirm-emergency').addEventListener('click', () => { confirmAction = null; $('#super-confirm-dialog').close(); }); $('#confirm-run').addEventListener('click', async () => { if (!confirmAction) return; const action = confirmAction; confirmAction = null; $('#super-confirm-dialog').close(); try { await action(); } catch (error) { handleError(error, 'Destructive action failed'); } });
    $('#check-updates').addEventListener('click', () => bridge.updates.check(state.settings.updateFeedUrl).catch((error) => handleError(error, 'Update check failed'))); $('#restart-update').addEventListener('click', bridge.updates.restart); bridge.updates.onState(updateUpdateUi);
    $('#open-status-hub').addEventListener('click', async () => { const url = $('#status-hub-url').value; if (!url) return notify('No status URL configured', 'Enter an HTTPS address first.', 'warning'); state.settings.statusHubUrl = url; scheduleSave('Status Hub URL changed'); try { await bridge.external.openUrl(url); } catch (error) { handleError(error, 'Status URL could not open'); } });
    $('#context-search').addEventListener('input', () => $$('[data-context-action]').forEach((item) => { item.hidden = !matchesSearch($('#context-search'), item.textContent); })); $$('[data-context-action]').forEach((item) => item.addEventListener('click', async () => { $('#context-menu').hidden = true; if (!activeContextTarget) return; if (item.dataset.contextAction === 'appearance') openAppearance(activeContextTarget); if (item.dataset.contextAction === 'lock') openLockWizard(activeContextTarget); if (item.dataset.contextAction === 'copy-label') await navigator.clipboard.writeText(activeContextTarget.textContent.trim()); }));
    document.addEventListener('contextmenu', (event) => { const target = event.target.closest('[data-element-id]'); if (!target || target.closest('.context-menu')) return; event.preventDefault(); showContextMenu(target, event.clientX, event.clientY); });
    document.addEventListener('keydown', (event) => { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); openPalette(); } else if (event.shiftKey && event.key === 'F10') { event.preventDefault(); const target = document.activeElement.closest?.('[data-element-id]') || document.activeElement; showContextMenu(target, 120, 120); } else if (event.key === 'Escape') { $('#context-menu').hidden = true; $('#regex-popover').hidden = true; } const locked = event.target.closest?.('.locked-element'); if (locked && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); openUnlock(locked); } }, true);
    document.addEventListener('click', (event) => { const locked = event.target.closest?.('.locked-element'); if (locked && !event.target.closest('dialog')) { event.preventDefault(); event.stopImmediatePropagation(); openUnlock(locked); return; } if (!event.target.closest('#context-menu')) $('#context-menu').hidden = true; }, true);
    bindNewRegexTriggers();
  }

  function showContextMenu(target, x, y) {
    activeContextTarget = target; const menu = $('#context-menu'); $('#context-search').value = ''; $$('[data-context-action]').forEach((item) => { item.hidden = false; }); menu.hidden = false; const width = menu.offsetWidth; const height = menu.offsetHeight; menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x))}px`; menu.style.top = `${Math.max(72, Math.min(window.innerHeight - height - 8, y))}px`; $('#context-search').focus();
  }

  function updateSchoolUi() {
    $('#school-enabled').checked = Boolean(schoolRecord?.enabled); $('#school-name').value = schoolRecord?.displayName || 'School mode'; $('#school-heading').textContent = schoolRecord?.displayName || 'School mode'; $('#school-toggle-label').textContent = `Enable ${schoolRecord?.displayName || 'School mode'}`; $('#school-status').textContent = schoolRecord?.status === 'available' ? `Shared record available. Last change: ${schoolRecord.updatedAt ? new Date(schoolRecord.updatedAt).toLocaleString() : 'not yet changed'}.` : 'The shared record is unavailable. The control cannot honestly report a shared change.';
  }

  function parseVocabulary(raw) {
    if (new TextEncoder().encode(raw).length > 64 * 1024) throw new RangeError('Vocabulary file exceeds 64 KiB.'); const value = JSON.parse(raw); if (!value || value.schemaVersion !== 1 || Object.keys(value).some((key) => !['schemaVersion', 'replacements'].includes(key)) || !value.replacements || typeof value.replacements !== 'object' || Array.isArray(value.replacements)) throw new TypeError('Vocabulary must contain schemaVersion 1 and one replacements object.'); const entries = Object.entries(value.replacements); if (entries.length > 500) throw new RangeError('Vocabulary exceeds 500 entries.'); for (const [key, replacement] of entries) { if (!/^[^\0]{1,120}$/.test(key) || typeof replacement !== 'string' || replacement.length > 240 || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new TypeError('Vocabulary contains an unsafe or out-of-bounds entry.'); } return value;
  }

  function updateUpdateUi(value) {
    $('#update-message').textContent = value.message; $('#restart-update').disabled = value.status !== 'ready';
  }

  async function initialize() {
    try {
      [state, provenance, schoolRecord] = await Promise.all([bridge.state.read(), bridge.provenance.read(), bridge.school.read()]);
      ensureElementIds(); bindEvents(); renderEverything(); updateSchoolUi(); renderHistory(); renderAuthenticators();
      const update = await bridge.updates.state(); updateUpdateUi(update);
      setInterval(() => { if (state.settings.adhd.timeAwareness) $('#metric-current-date').textContent = `${new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date())} · session open ${Math.floor((Date.now() - sessionOpenedAt) / 60000)} minutes`; }, 30000);
      setInterval(renderAuthenticators, 10000);
      notify('Ready', 'Hair growth estimates and local haircut history are ready.', 'success', false);
    } catch (error) {
      document.body.innerHTML = `<main class="view"><section class="surface"><h1>Hair Growth Estimator could not start</h1><p id="fatal-message"></p></section></main>`;
      $('#fatal-message').textContent = error?.message || String(error);
    }
  }

  initialize();
})();
