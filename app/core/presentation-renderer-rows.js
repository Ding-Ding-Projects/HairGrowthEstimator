'use strict';

const PRESERVE = Object.freeze({
  NONE: 'none',
  FACTS: 'facts',
  TECHNICAL: 'technical',
  PROVIDER: 'provider-authored',
  MIXED: 'mixed',
  CURATED_HTML: 'curated-html'
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function row(id, sourceLine, kind, category, en, yue, placeholders = [], preserve = PRESERVE.NONE, exact = []) {
  return {
    id,
    sourceLine: exactRendererLine(id, sourceLine),
    kind,
    category,
    en,
    yue,
    placeholders,
    preserve,
    exact,
    sourceNeedles: sourceNeedles(id, en)
  };
}

function article(id, title, titleYue, body, bodyYue, titleEn5 = title, titleYue5 = titleYue, bodyEn5 = body, bodyYue5 = bodyYue) {
  return [id, title, titleYue, titleEn5, titleYue5, body, bodyYue, bodyEn5, bodyYue5];
}

function currentRendererLine(line) {
  if (line <= 72) return line;
  if (line <= 284) return line + 3;
  if (line <= 295) return line + 7;
  if (line <= 303) return line + 11;
  if (line <= 318) return line + 33;
  if (line <= 341) return line + 72;
  if (line <= 348) return line + 75;
  if (line <= 362) return line + 84;
  if (line <= 1232) return line + 85;
  if (line <= 1239) return line + 89;
  if (line <= 1263) return line + 95;
  return line + 96;
}

const SOURCE_NEEDLE_OVERRIDES = Object.freeze({
  'palette.article': ['docs.map((article)', 'articleTitle(article)'],
  'provenance.version-chip': ['provenance.version'],
  'growth.gallery-title': ['index + 1', 'stage.label'],
  'appearance.target-fallback': ['target.tagName', '${id}'],
  'regex.capture': ['capture.label', 'capture.value'],
  'history.detail': ['item.date', 'item.action', 'item.commit'],
  'schedule.source-error': ['rule.label', 'error?.message'],
  'notification.error-passthrough': ["notify(context, message, 'error')"],
  'update.provider-message': ["$('#update-message').textContent = value.message"],
  'provider.error-message': ["$('#fatal-message').textContent"]
});

const SOURCE_LINE_OVERRIDES = Object.freeze({
  'regex.explain.named-capture': 1246,
  'regex.explain.lookaround': 1247,
  'regex.explain.lazy': 1248,
  'regex.explain.class': 1249,
  'regex.explain.backreference': 1250,
  'regex.explain.risk': 1251,
  'regex.explain.completed': 1252,
  'regex.explain.capped': 1253,
  'regex.explain.preview-capped': 1254
});

function exactRendererLine(id, line) {
  return SOURCE_LINE_OVERRIDES[id] ?? currentRendererLine(line);
}

function sourceNeedles(id, en) {
  if (SOURCE_NEEDLE_OVERRIDES[id]) return [...SOURCE_NEEDLE_OVERRIDES[id]];
  const fragments = en.split(/\{[a-z][a-zA-Z0-9]*\}/g).map((value) => value.trim()).filter(Boolean);
  const needle = fragments.sort((left, right) => right.length - left.length)[0];
  return [needle || en];
}

const COMMAND_SETTINGS_PALETTE_SOURCE_ROWS = [
  row('command.open-palette', 77, 'command', 'accessibility', 'Open command palette', '開啟指令面板', [], PRESERVE.MIXED, ['Ctrl+Shift+F']),
  row('command.open-notifications', 78, 'command', 'accessibility', 'Open notification history', '開啟通知歷史', [], PRESERVE.MIXED, ['Ctrl+Shift+N']),
  row('command.edit-appearance', 79, 'command', 'accessibility', 'Edit appearance…', '編輯外觀…', [], PRESERVE.MIXED, ['Shift+F10']),
  row('command.lock-element', 80, 'command', 'accessibility', 'Lock this element…', '鎖定呢個元素…', [], PRESERVE.MIXED, ['Ctrl+L']),
  row('palette.tab-destination', 955, 'palette', 'informational', 'Open {tabLabel}', '開啟{tabLabel}', ['tabLabel'], PRESERVE.PROVIDER, ['tabLabel']),
  row('palette.theme', 957, 'palette', 'informational', 'Theme', '主題'),
  row('palette.language', 958, 'palette', 'informational', 'Language mode', '語言模式'),
  row('palette.funny-english', 959, 'palette', 'informational', 'English funny level', '英文搞笑程度'),
  row('palette.funny-cantonese', 960, 'palette', 'informational', 'Cantonese funny level', '粵語搞笑程度'),
  row('palette.tab-dock', 961, 'palette', 'informational', 'Tab dock', '分頁停靠位置'),
  row('palette.vocabulary-choose', 962, 'palette', 'informational', 'Choose or replace personal vocabulary JSON', '選擇或者更換個人詞彙 JSON', [], PRESERVE.MIXED, ['JSON']),
  row('palette.vocabulary-status', 963, 'palette', 'informational', 'Personal vocabulary status', '個人詞彙狀態'),
  row('palette.vocabulary-clear', 964, 'palette', 'destructive', 'Clear personal vocabulary cache', '清除個人詞彙快取'),
  row('palette.support-tickets', 965, 'palette', 'informational', 'Open local Support Tickets', '開啟本機 Support Tickets', [], PRESERVE.MIXED, ['Support Tickets']),
  row('palette.notification-history', 966, 'palette', 'informational', 'Open notification history', '開啟通知歷史'),
  row('palette.history-manager', 967, 'palette', 'security', 'Protected local version history', '受保護嘅本機版本歷史'),
  row('palette.one-thing', 968, 'palette', 'accessibility', 'One thing at a time current action', '一次一件事目前動作'),
  row('palette.momentum', 969, 'palette', 'accessibility', 'Momentum accommodation', '動力提示輔助'),
  row('palette.article', 974, 'palette', 'informational', '{articleTitle}', '{articleTitle}', ['articleTitle'], PRESERVE.PROVIDER, ['articleId'])
];

const RENDERER_SOURCE_ROWS = [
  row('translation.subtitle', 85, 'visible', 'informational', 'A private, local-first growth journal', '私人本機生髮日記'),
  row('translation.saved', 86, 'visible', 'success', 'Saved', '已儲存'),
  row('translation.haircut-saved', 87, 'visible', 'success', 'Haircut saved and baseline reset.', '剪髮紀錄已儲存，基準亦已重設。'),
  row('translation.estimate', 88, 'visible', 'informational', 'Estimate', '估算'),
  row('translation.no-haircuts', 89, 'visible', 'informational', 'No haircuts match this view yet.', '暫時冇剪髮紀錄符合目前檢視。'),
  row('translation.vocabulary-no-file', 90, 'visible', 'informational', 'No private file is loaded. Original shipped wording is active.', '未有載入私人檔案，而家會用返程式原本附送嘅文字。'),
  row('translation.vocabulary-loading', 91, 'visible', 'progress', 'Validating the selected private file locally.', '正在本機驗證已選擇嘅私人檔案。'),
  row('translation.vocabulary-loaded', 92, 'visible', 'success', 'Loaded locally. Approved wording is active.', '已經喺本機載入，核准文字目前生效。'),
  row('translation.vocabulary-invalid', 93, 'visible', 'error', 'The selected or cached file is invalid. Original shipped wording is active.', '已選擇或者已快取嘅檔案無效，目前使用內置原文。'),
  row('translation.vocabulary-choose', 94, 'visible', 'informational', 'Choose private JSON', '選擇私人 JSON', [], PRESERVE.MIXED, ['JSON']),
  row('translation.vocabulary-replace', 95, 'visible', 'informational', 'Replace private JSON', '更換私人 JSON', [], PRESERVE.MIXED, ['JSON']),
  row('translation.vocabulary-clear', 96, 'visible', 'destructive', 'Clear local cache', '清除本機快取'),
  row('notification.dismiss', 419, 'visible', 'accessibility', 'Dismiss notification', '關閉通知'),
  row('notification.dismiss-name', 420, 'accessible-name', 'accessibility', 'Dismiss notification {title}', '關閉通知「{title}」', ['title'], PRESERVE.PROVIDER, ['title']),
  row('error.default-context', 443, 'notification-title', 'error', 'Operation could not finish', '操作未能完成'),
  row('growth.play', 563, 'visible', 'informational', 'Play growth', '播放生長進度'),
  row('growth.next-stage', 563, 'visible', 'accessibility', 'Show next stage', '顯示下一個階段'),
  row('growth.pause', 742, 'visible', 'informational', 'Pause growth', '暫停生長進度'),
  row('provenance.detail', 658, 'visible-template', 'informational', 'Version {version}, updated {updatedAt}, from {timestampSource}. Commit {commitShort}. Unsigned build.', '版本 {version}，更新時間係 {updatedAt}，時間來源係 {timestampSource}。Commit {commitShort}。呢個係未簽署建置。', ['version', 'updatedAt', 'timestampSource', 'commitShort'], PRESERVE.FACTS, ['version', 'updatedAt', 'timestampSource', 'commitShort', 'Unsigned']),
  row('provenance.bound-chip', 659, 'visible', 'informational', 'Artifact-bound', '已綁定建置產物'),
  row('provenance.version-chip', 661, 'visible-template', 'informational', 'v{version}', 'v{version}', ['version'], PRESERVE.FACTS, ['version']),
  row('provenance.version-term', 662, 'visible', 'informational', 'Version', '版本'),
  row('provenance.updated-term', 662, 'visible', 'informational', 'Updated at', '更新時間'),
  row('provenance.commit-term', 662, 'visible', 'informational', 'Commit', 'Commit', [], PRESERVE.TECHNICAL, ['Commit']),
  row('provenance.timestamp-source-term', 662, 'visible', 'informational', 'Timestamp source', '時間戳來源'),
  row('provenance.signing-term', 662, 'visible', 'security', 'Signing', '簽署狀態'),
  row('provenance.release-code-term', 662, 'visible', 'informational', 'Release code name', '發佈代號'),
  row('provenance.unavailable-value', 662, 'visible', 'warning', 'Unavailable', '無法使用'),
  row('provenance.unavailable-detail', 669, 'visible-template', 'warning', '{reason} Running version {versionOrUnavailable}, updated-at unavailable.', '{reason} 目前版本 {versionOrUnavailable}，更新時間無法使用。', ['reason', 'versionOrUnavailable'], PRESERVE.PROVIDER, ['reason', 'versionOrUnavailable']),
  row('provenance.version-unavailable', 672, 'visible', 'warning', 'Version unavailable', '版本資料無法使用'),
  row('provenance.term', 673, 'visible', 'informational', 'Provenance', '來源證明'),
  row('growth.reference-alt', 691, 'accessible-description', 'accessibility', 'Fictional adult man at the {stageLabelLower} reference stage, approximately {targetCm} centimetres', '虛構成年男士，處於{stageLabelLower}參考階段，約 {targetCm} 厘米', ['stageLabelLower', 'targetCm'], PRESERVE.FACTS, ['targetCm']),
  row('growth.reference-date', 694, 'visible-template', 'informational', 'Reference image near {formattedLength}', '接近 {formattedLength} 嘅參考圖片', ['formattedLength'], PRESERVE.FACTS, ['formattedLength']),
  row('growth.stage-name', 715, 'accessible-name', 'accessibility', '{stageLabel} stage, about {targetCm} centimetres', '{stageLabel}階段，約 {targetCm} 厘米', ['stageLabel', 'targetCm'], PRESERVE.FACTS, ['stageLabel', 'targetCm']),
  row('growth.stage-title', 717, 'tooltip', 'accessibility', '{stageLabel}, about {targetCm} cm', '{stageLabel}，約 {targetCm} cm', ['stageLabel', 'targetCm'], PRESERVE.FACTS, ['stageLabel', 'targetCm', 'cm']),
  row('growth.gallery-alt', 755, 'accessible-description', 'accessibility', 'Stage {stageNumber}, same fictional adult man with {stageLabelLower} hair near {targetCm} centimetres', '第 {stageNumber} 階段，同一位虛構成年男士，頭髮處於{stageLabelLower}階段，接近 {targetCm} 厘米', ['stageNumber', 'stageLabelLower', 'targetCm'], PRESERVE.FACTS, ['stageNumber', 'targetCm']),
  row('growth.gallery-title', 758, 'visible-template', 'informational', '{stageNumber}. {stageLabel}', '{stageNumber}. {stageLabel}', ['stageNumber', 'stageLabel'], PRESERVE.FACTS, ['stageNumber', 'stageLabel']),
  row('growth.gallery-disclaimer', 759, 'visible-template', 'informational', 'Deterministic reference: {formattedLength}. Generated image, not a predicted personal appearance.', '固定參考：{formattedLength}。呢張係生成圖片，唔係對個人外觀嘅預測。', ['formattedLength'], PRESERVE.FACTS, ['formattedLength']),
  row('dashboard.target-date', 773, 'visible-template', 'informational', 'Estimated {date}', '估算日期 {date}', ['date'], PRESERVE.FACTS, ['date']),
  row('dashboard.monthly-rate', 774, 'visible-template', 'informational', '{formattedLength} / month', '每月 {formattedLength}', ['formattedLength'], PRESERVE.FACTS, ['formattedLength']),
  row('dashboard.since-haircut', 776, 'visible-template', 'informational', 'Since {haircutDate}', '由 {haircutDate} 剪髮起計', ['haircutDate'], PRESERVE.FACTS, ['haircutDate']),
  row('dashboard.since-baseline', 776, 'visible-template', 'informational', 'Since baseline {baselineDate}', '由基準日期 {baselineDate} 起計', ['baselineDate'], PRESERVE.FACTS, ['baselineDate']),
  row('haircut.form-record', 837, 'visible', 'informational', 'Record a haircut', '記錄剪髮'),
  row('haircut.select', 850, 'accessible-name', 'accessibility', 'Select haircut {date}', '選擇 {date} 嘅剪髮紀錄', ['date'], PRESERVE.FACTS, ['date']),
  row('haircut.cut-amount', 853, 'visible-template', 'informational', '{formattedLength} cut', '剪去 {formattedLength}', ['formattedLength'], PRESERVE.FACTS, ['formattedLength']),
  row('haircut.no-note', 854, 'visible', 'informational', 'No note', '冇備註'),
  row('haircut.edit', 856, 'visible', 'informational', 'Edit', '編輯'),
  row('haircut.delete', 857, 'visible', 'destructive', 'Delete', '刪除'),
  row('haircut.none', 863, 'visible', 'informational', 'None', '冇紀錄'),
  row('haircut.form-edit', 875, 'visible-template', 'informational', 'Edit haircut from {date}', '編輯 {date} 嘅剪髮紀錄', ['date'], PRESERVE.FACTS, ['date']),
  row('palette.empty', 1000, 'visible', 'informational', 'No commands match this search.', '冇指令符合目前搜尋。'),
  row('regex.candidate-bound', 1019, 'error-template', 'error', 'Search candidate {candidateNumber} exceeds the {candidateBytes}-byte bound.', '第 {candidateNumber} 個搜尋候選內容超過 {candidateBytes} byte 上限。', ['candidateNumber', 'candidateBytes'], PRESERVE.FACTS, ['candidateNumber', 'candidateBytes', 'byte']),
  row('regex.worker-invalid-filter', 1062, 'error', 'error', 'Regex worker returned an invalid filter result.', 'Regex worker 傳回無效篩選結果。', [], PRESERVE.MIXED, ['Regex', 'worker']),
  row('regex.evaluation-failed', 1073, 'error', 'error', 'Regex evaluation could not finish.', 'Regex 評估未能完成。', [], PRESERVE.MIXED, ['Regex']),
  row('regex.plain-active', 1113, 'status', 'informational', 'Plain-text search is active.', '目前使用純文字搜尋。'),
  row('regex.pattern-bound', 1115, 'status-template', 'error', 'Pattern exceeds the {patternBytes}-byte UTF-8 bound.', 'Pattern 超過 {patternBytes} byte UTF-8 上限。', ['patternBytes'], PRESERVE.FACTS, ['patternBytes', 'UTF-8']),
  row('regex.validating', 1116, 'status', 'progress', 'Validating in an isolated worker.', '正在隔離 worker 入面驗證。', [], PRESERVE.MIXED, ['worker']),
  row('regex.valid', 1121, 'status', 'success', 'Pattern is valid for the JavaScript RegExp engine.', 'Pattern 符合目前 JavaScript RegExp engine。', [], PRESERVE.MIXED, ['JavaScript RegExp']),
  row('regex.validation-failed', 1126, 'status', 'error', 'Pattern validation could not finish.', 'Pattern 驗證未能完成。'),
  row('regex.explain.named-capture', 1157, 'visible', 'informational', 'Named capture group detected.', '偵測到具名 capture group。', [], PRESERVE.MIXED, ['capture group']),
  row('regex.explain.lookaround', 1158, 'visible', 'informational', 'Lookaround detected.', '偵測到 lookaround。', [], PRESERVE.MIXED, ['lookaround']),
  row('regex.explain.lazy', 1159, 'visible', 'informational', 'Lazy quantifier detected.', '偵測到 lazy quantifier。', [], PRESERVE.MIXED, ['lazy quantifier']),
  row('regex.explain.class', 1160, 'visible', 'informational', 'Character class detected.', '偵測到 character class。', [], PRESERVE.MIXED, ['character class']),
  row('regex.explain.backreference', 1161, 'visible', 'informational', 'Backreference detected.', '偵測到 backreference。', [], PRESERVE.MIXED, ['backreference']),
  row('regex.explain.risk', 1162, 'visible', 'warning', 'Potential nested-quantifier backtracking risk. Keep adversarial input bounded.', '可能有巢狀 quantifier 回溯風險。記住限制對抗性輸入嘅大小。', [], PRESERVE.MIXED, ['quantifier']),
  row('regex.explain.completed', 1164, 'visible-template', 'informational', 'Completed in {elapsedMs} ms with {matchCount} match(es).', '用 {elapsedMs} ms 完成，共有 {matchCount} 個 match。', ['elapsedMs', 'matchCount'], PRESERVE.FACTS, ['elapsedMs', 'matchCount', 'ms']),
  row('regex.explain.capped', 1165, 'visible-template', 'warning', 'Results were capped at {resultLimit} matches.', '結果已限制為最多 {resultLimit} 個 match。', ['resultLimit'], PRESERVE.FACTS, ['resultLimit']),
  row('regex.explain.preview-capped', 1166, 'visible', 'warning', 'The replacement preview reached its bounded output limit.', '替換預覽已達輸出上限。'),
  row('regex.match-head', 1174, 'visible-template', 'informational', '#{matchNumber} at {matchIndex}: {valueOrZeroWidth}', '第 {matchNumber} 個，位置 {matchIndex}：{valueOrZeroWidth}', ['matchNumber', 'matchIndex', 'valueOrZeroWidth'], PRESERVE.PROVIDER, ['matchNumber', 'matchIndex', 'valueOrZeroWidth']),
  row('regex.zero-width', 1174, 'visible', 'informational', '(zero-width)', '（零寬度）'),
  row('regex.capture', 1175, 'visible-template', 'informational', '{captureLabel}: {captureValue}', '擷取 {captureLabel}：{captureValue}', ['captureLabel', 'captureValue'], PRESERVE.PROVIDER, ['captureLabel', 'captureValue']),
  row('regex.unmatched', 1175, 'visible', 'informational', 'unmatched', '未配對'),
  row('regex.no-matches', 1179, 'visible', 'informational', 'No matches.', '冇配對結果。'),
  row('converter.search-label', 1197, 'accessible-name', 'accessibility', 'Search adapters', '搜尋 adapter', [], PRESERVE.MIXED, ['adapter']),
  row('converter.search-placeholder', 1197, 'placeholder', 'accessibility', 'Search formats', '搜尋格式'),
  row('converter.regex-trigger', 1197, 'accessible-name', 'accessibility', 'Open regex builder for adapter search', '開啟 adapter 搜尋嘅 regex 建構器', [], PRESERVE.MIXED, ['adapter', 'regex']),
  row('converter.empty', 1209, 'visible', 'informational', 'No matching adapters in this category.', '呢個類別冇符合條件嘅 adapter。', [], PRESERVE.MIXED, ['adapter']),
  row('authenticator.entry-label', 1222, 'visible-template', 'informational', '{issuer} · {account}', '{issuer} · {account}', ['issuer', 'account'], PRESERVE.PROVIDER, ['issuer', 'account']),
  row('authenticator.code-detail', 1224, 'visible-template', 'security', '{remainingSeconds}s remaining, next {nextCode}, {algorithm} / {digits} digits / {period}s', '剩餘 {remainingSeconds}s，下一個係 {nextCode}，{algorithm} / {digits} 位數字 / {period}s', ['remainingSeconds', 'nextCode', 'algorithm', 'digits', 'period'], PRESERVE.FACTS, ['remainingSeconds', 'nextCode', 'algorithm', 'digits', 'period']),
  row('authenticator.delete-entry', 1225, 'visible', 'destructive', 'Delete entry', '刪除項目'),
  row('authenticator.empty', 1228, 'visible', 'informational', 'No authenticator entries yet.', '暫時冇驗證器項目。'),
  row('authenticator.vault-unavailable', 1229, 'visible', 'error', 'Credential vault unavailable.', '憑證保管庫無法使用。'),
  row('docs.empty', 1256, 'visible', 'informational', 'No guide article matches.', '冇指南文章符合條件。'),
  row('changelog.heading', 1278, 'visible-template', 'informational', 'Version {version} · {date}', '版本 {version} · {date}', ['version', 'date'], PRESERVE.FACTS, ['version', 'date']),
  row('changelog.commit', 1280, 'visible-template', 'informational', 'Commit: {commit}', '提交：{commit}', ['commit'], PRESERVE.FACTS, ['commit']),
  row('changelog.empty', 1282, 'visible', 'informational', 'No released changes match the active filters.', '冇已發佈變更符合目前篩選。'),
  row('history.locked', 1291, 'status', 'security', 'History is locked. Enter its separate password to continue.', '歷史紀錄鎖住咗。輸入佢嘅獨立密碼先可以繼續。'),
  row('history.unlock-empty', 1292, 'visible', 'security', 'Unlock local history to browse revisions.', '解鎖本機歷史先可以瀏覽修訂。'),
  row('history.every-action', 1309, 'option-template', 'informational', 'Every action ({count})', '所有動作（{count}）', ['count'], PRESERVE.FACTS, ['count']),
  row('history.action-count', 1309, 'option-template', 'informational', '{action} ({count})', '動作 {action}（{count}）', ['action', 'count'], PRESERVE.PROVIDER, ['action', 'count']),
  row('history.select-revision', 1314, 'accessible-name', 'accessibility', 'Select history revision {subject}', '選擇歷史修訂「{subject}」', ['subject'], PRESERVE.PROVIDER, ['subject']),
  row('history.detail', 1317, 'visible-template', 'informational', '{dateTime} · {actionOrUpdated} · {commitShort}', '{dateTime} · {actionOrUpdated} · {commitShort}', ['dateTime', 'actionOrUpdated', 'commitShort'], PRESERVE.FACTS, ['dateTime', 'actionOrUpdated', 'commitShort']),
  row('history.labelled', 1318, 'visible', 'informational', 'Labelled', '已加標籤'),
  row('history.revision', 1318, 'visible', 'informational', 'Revision', '修訂'),
  row('history.visible-status', 1321, 'status-template', 'informational', '{count} redacted revision{plural} visible. Restores append a new revision.', '目前顯示 {count} 個已遮蔽資料嘅修訂。還原會新增修訂。', ['count', 'plural'], PRESERVE.FACTS, ['count']),
  row('history.empty', 1322, 'visible', 'informational', 'No revisions match the active filters.', '冇修訂符合目前篩選。'),
  row('history.read-failed', 1326, 'visible', 'error', 'Local history could not be read with that credential.', '無法用呢組憑證讀取本機歷史。'),
  row('history.remains-locked', 1327, 'status', 'security', 'History remains locked.', '歷史仍然鎖定。'),
  row('notice.select', 1348, 'accessible-name', 'accessibility', 'Select notification {title}', '選擇通知「{title}」', ['title'], PRESERVE.PROVIDER, ['title']),
  row('notice.detail', 1352, 'visible-template', 'informational', '{dateTime} · {kind} · {dismissedOrActive}', '{dateTime} · {kind} · {dismissedOrActive}', ['dateTime', 'kind', 'dismissedOrActive'], PRESERVE.PROVIDER, ['dateTime', 'kind', 'dismissedOrActive']),
  row('notice.dismissed', 1353, 'visible', 'informational', 'Dismissed', '已關閉'),
  row('notice.dismiss', 1353, 'visible', 'informational', 'Dismiss', '關閉'),
  row('notice.empty', 1356, 'visible', 'informational', 'No notifications match the active search.', '冇通知符合目前搜尋。'),
  row('selection.status', 1358, 'status-template', 'informational', '{selectedCount} selected in this view. {visibleCount} visible.', '呢個檢視揀咗 {selectedCount} 項，而家睇到 {visibleCount} 項。', ['selectedCount', 'visibleCount'], PRESERVE.FACTS, ['selectedCount', 'visibleCount']),
  row('support.select-ticket', 1382, 'accessible-name', 'accessibility', 'Select local ticket {ticketId}', '選擇本機支援票 {ticketId}', ['ticketId'], PRESERVE.FACTS, ['ticketId']),
  row('support.heading', 1384, 'visible-template', 'informational', '{ticketId} · {category}', '{ticketId} · {category}', ['ticketId', 'category'], PRESERVE.PROVIDER, ['ticketId', 'category']),
  row('support.no-description', 1385, 'visible', 'informational', 'No description supplied.', '冇提供描述。'),
  row('support.detail', 1386, 'visible-template', 'informational', '{status} · {severity} · {createdAt}', '{status} · {severity} · {createdAt}', ['status', 'severity', 'createdAt'], PRESERVE.PROVIDER, ['status', 'severity', 'createdAt']),
  row('support.empty', 1390, 'visible', 'informational', 'No local tickets match the active filters.', '冇本機支援票符合目前篩選。'),
  row('attention.session', 1426, 'status-template', 'accessibility', 'Session open for {minutes} minutes.', '呢次使用已開啟 {minutes} 分鐘。', ['minutes'], PRESERVE.FACTS, ['minutes']),
  row('attention.last-change', 1427, 'status-template', 'accessibility', 'Last meaningful change was {minutes} minutes ago.', '上一次實質變更係 {minutes} 分鐘前。', ['minutes'], PRESERVE.FACTS, ['minutes']),
  row('attention.no-action', 1429, 'status', 'accessibility', 'No current action is set.', '未設定目前動作。'),
  row('attention.momentum', 1431, 'status-template', 'accessibility', 'Nothing has changed here for {minutes} minutes.', '呢度已經有 {minutes} 分鐘冇變更。', ['minutes'], PRESERVE.FACTS, ['minutes']),
  row('surprise.copy', 1468, 'visible', 'informational', 'A small startup surprise from the public dim-sum catalog.', '一份來自公開點心目錄嘅開機小驚喜。'),
  row('schedule.boolean-error', 1483, 'error', 'error', 'Boolean scheduled values must be true or false.', '布林排程值必須係 true 或者 false。', [], PRESERVE.TECHNICAL, ['true', 'false']),
  row('schedule.row', 1596, 'visible-template', 'informational', '{label}: {startTime} to {endTime} in {timezone}, {enabledOrDisabled}, {sourceLabel}', '{label}：{timezone} 時區 {startTime} 至 {endTime}，{enabledOrDisabled}，{sourceLabel}', ['label', 'startTime', 'endTime', 'timezone', 'enabledOrDisabled', 'sourceLabel'], PRESERVE.PROVIDER, ['label', 'startTime', 'endTime', 'timezone', 'sourceLabel']),
  row('schedule.empty', 1600, 'visible-template', 'informational', 'No scheduled rules. Times use {timezone} and follow daylight-saving changes.', '冇排程規則。時間使用 {timezone}，並跟隨夏令時間變更。', ['timezone'], PRESERVE.FACTS, ['timezone']),
  row('schedule.update', 1602, 'visible', 'informational', 'Update selected rule', '更新已選規則'),
  row('schedule.add', 1602, 'visible', 'informational', 'Add scheduled rule', '新增排程規則'),
  row('schedule.source-changed-error', 1617, 'error', 'error', 'The scheduled source changed before its response arrived.', '排程來源喺回應到達之前已經改變。'),
  row('schedule.source-error', 1620, 'status-template', 'error', '{ruleLabel}: {providerMessage}', '規則 {ruleLabel}：{providerMessage}', ['ruleLabel', 'providerMessage'], PRESERVE.PROVIDER, ['ruleLabel', 'providerMessage']),
  row('schedule.failure-status', 1629, 'status-template', 'warning', '{appliedCount} rule{appliedPlural} applied. {errorCount} source{errorPlural} could not refresh, so the last valid or base values remain. {providerErrors}', '已套用 {appliedCount} 條規則。{errorCount} 個來源未能重新整理，所以保留上一個有效值或者基準值。{providerErrors}', ['appliedCount', 'appliedPlural', 'errorCount', 'errorPlural', 'providerErrors'], PRESERVE.PROVIDER, ['appliedCount', 'errorCount', 'providerErrors']),
  row('schedule.success-status', 1630, 'status-template', 'success', '{appliedCount} of {matchedCount} matching rule{plural} applied at {localTime} in their configured timezones.', '符合條件嘅 {matchedCount} 條規則入面，已套用 {appliedCount} 條，時間係各自設定時區嘅 {localTime}。', ['appliedCount', 'matchedCount', 'plural', 'localTime'], PRESERVE.FACTS, ['appliedCount', 'matchedCount', 'localTime']),
  row('logo.custom-active', 1671, 'status', 'success', 'A validated local custom image is active.', '已啟用通過驗證嘅本機自訂圖片。'),
  row('logo.no-custom', 1671, 'status', 'informational', 'No custom logo selected.', '未選擇自訂標誌。'),
  row('appearance.target-fallback', 1732, 'visible-template', 'informational', '{tagName} {elementId}', '{tagName} {elementId}', ['tagName', 'elementId'], PRESERVE.TECHNICAL, ['tagName', 'elementId']),
  row('lock.unlock-target', 1759, 'visible-template', 'security', '{label} requires {policy}.', '{label} 需要 {policy}。', ['label', 'policy'], PRESERVE.PROVIDER, ['label', 'policy']),
  row('lock.unlock-session', 1760, 'status', 'security', 'Successful verification unlocks this surface for this application session only.', '驗證成功只會喺今次應用程式執行期間解鎖呢個畫面。'),
  row('confirm.arm-keys', 1775, 'status', 'destructive', 'Arm both keys to enable the slider.', '啟用兩個確認鍵先可以使用滑桿。'),
  row('confirm.progress', 1786, 'status-template', 'destructive', 'Confirmation is {progress} percent complete.', '確認已完成 {progress}%。', ['progress'], PRESERVE.FACTS, ['progress']),
  row('confirm.ready', 1786, 'status', 'destructive', 'Confirmation is fully armed. The destructive action is ready.', '確認已經完全啟動，破壞性動作而家準備好。'),
  row('ollama.healthy', 1819, 'status-template', 'success', 'Healthy {version}', '正常 {version}', ['version'], PRESERVE.PROVIDER, ['version']),
  row('ollama.missing', 1820, 'status', 'error', 'Missing or stopped', '未安裝或者已停止'),
  row('ollama.recovery', 1820, 'visible', 'error', 'Local Ollama is missing, stopped, or unhealthy. Start it locally, then use Check local service to return here.', '本機 Ollama 未安裝、已停止或者狀態異常。請喺本機啟動，之後使用「檢查本機服務」返回呢度。', [], PRESERVE.MIXED, ['Ollama']),
  row('ollama.choose-model', 1824, 'option', 'informational', 'Choose an installed model', '選擇已安裝模型'),
  row('ollama.model-row', 1825, 'visible-template', 'informational', '{modelName} · {sizeGbOrUnknown} · fit Unknown until RAM, VRAM, driver, disk, parameter, quantization, and context evidence are available', '{modelName} · {sizeGbOrUnknown} · 配合程度暫時係 Unknown，直到有 RAM、VRAM、driver、磁碟、parameter、quantization 同 context 證據', ['modelName', 'sizeGbOrUnknown'], PRESERVE.PROVIDER, ['modelName', 'sizeGbOrUnknown', 'Unknown', 'RAM', 'VRAM']),
  row('ollama.size-unknown', 1825, 'visible', 'informational', 'size unknown', '大小未知'),
  row('ollama.no-models', 1826, 'visible', 'informational', 'The local service is healthy but no models are installed.', '本機服務運作正常，不過仲未安裝任何模型。'),
  row('voice.loading', 1831, 'status-template', 'accessibility', '{language} installed voices are still loading.', '{language}已安裝聲線仍然載入緊。', ['language'], PRESERVE.FACTS, ['language']),
  row('voice.none-for-language', 1832, 'status-template', 'accessibility', 'No installed voice on this computer can read {language}.', '呢部電腦冇已安裝聲線可以朗讀{language}。', ['language'], PRESERVE.FACTS, ['language']),
  row('voice.uninstalled', 1833, 'status-template', 'warning', 'The chosen {language} voice is not installed on this computer. The saved choice is kept, and {fallbackVoice} is the current fallback.', '已選擇嘅{language}聲線未安裝喺呢部電腦。已保存選擇會保留，目前後備聲線係 {fallbackVoice}。', ['language', 'fallbackVoice'], PRESERVE.PROVIDER, ['language', 'fallbackVoice']),
  row('voice.automatic', 1833, 'visible', 'accessibility', 'an automatic voice', '自動選擇嘅聲線'),
  row('voice.network-backed', 1834, 'status-template', 'warning', '{effectiveVoice} is effective for {language}. It is network-backed and may be silent offline.', '{effectiveVoice} 目前用於{language}。佢需要網絡，離線時可能冇聲。', ['effectiveVoice', 'language'], PRESERVE.PROVIDER, ['effectiveVoice', 'language']),
  row('voice.effective', 1835, 'status-template', 'accessibility', '{effectiveVoiceOrAutomatic} is effective for {language}.', '{effectiveVoiceOrAutomatic} 目前用於{language}。', ['effectiveVoiceOrAutomatic', 'language'], PRESERVE.PROVIDER, ['effectiveVoiceOrAutomatic', 'language']),
  row('voice.choose-automatically', 1842, 'option', 'accessibility', 'Choose automatically', '自動選擇'),
  row('voice.synthesis-unavailable', 1844, 'status', 'accessibility', 'Speech synthesis is unavailable on this computer.', '呢部電腦無法使用語音合成。'),
  row('voice.network-backed-suffix', 1863, 'option', 'informational', 'network-backed', '需要網絡'),
  row('voice.not-installed', 1867, 'option', 'warning', 'Not installed', '未安裝'),
  row('accessibility.active', 1916, 'status', 'accessibility', 'Operating-system accessibility support is active. Narration is paused.', '作業系統嘅無障礙支援而家生效，旁白已暫停。'),
  row('accessibility.inactive', 1917, 'status', 'accessibility', 'Operating-system accessibility support is not currently active.', '作業系統嘅無障礙支援而家未有啟用。'),
  row('school.enable-guidance', 1983, 'status-template', 'security', 'Enter the shared unlock value, then use Disable {displayName}.', '輸入共用解鎖值，之後使用「停用 {displayName}」。', ['displayName'], PRESERVE.PROVIDER, ['displayName']),
  row('school.configure-guidance', 1984, 'status-template', 'security', 'Enter and confirm an unlock value, then use Save and enable {displayName}.', '輸入並確認解鎖值，之後使用「儲存並啟用 {displayName}」。', ['displayName'], PRESERVE.PROVIDER, ['displayName']),
  row('school.unlock-mismatch', 2003, 'status-template', 'warning', 'The shared unlock value did not match.{delay}', '共用解鎖值唔相符。{delay}', ['delay'], PRESERVE.FACTS, ['delay']),
  row('school.retry-delay', 2002, 'status-template', 'warning', 'Try again in {seconds} seconds.', '請喺 {seconds} 秒後再試。', ['seconds'], PRESERVE.FACTS, ['seconds']),
  row('school.attempts-delay', 2002, 'status-template', 'warning', '{remaining} attempts remain before a short delay.', '短暫等候之前仲有 {remaining} 次嘗試。', ['remaining'], PRESERVE.FACTS, ['remaining']),
  row('schedule.ha-token-stored', 2072, 'status', 'security', 'The access token is stored for this exact Home Assistant rule source.', '存取憑證已儲存，並只綁定到呢個指定 Home Assistant 規則來源。', [], PRESERVE.MIXED, ['Home Assistant']),
  row('schedule.ha-token-cleared', 2072, 'status', 'security', 'The access token was cleared for this exact Home Assistant rule source.', '呢個指定 Home Assistant 規則來源嘅存取憑證已清除。', [], PRESERVE.MIXED, ['Home Assistant']),
  row('narrator.test-en', 2075, 'spoken', 'test', 'Estimated hair length updated. This is an estimate, not a promise.', '頭髮長度估算已更新。呢個係估算，唔係保證。'),
  row('unlock.retry-seconds', 2140, 'status-template', 'warning', 'Values did not match. Try again in {seconds} seconds, or delete the local application-data folder to reset.', '輸入值唔相符。請喺 {seconds} 秒後再試，或者刪除本機應用資料資料夾重設。', ['seconds'], PRESERVE.FACTS, ['seconds']),
  row('unlock.attempts-remain', 2140, 'status-template', 'warning', 'Values did not match. {remaining} attempts remain before a 30-second delay.', '輸入值唔相符。進入 30 秒等候之前仲有 {remaining} 次嘗試。', ['remaining'], PRESERVE.FACTS, ['remaining', '30']),
  row('support.first-response', 2153, 'visible', 'informational', 'First response: the local data folder contains the lock record. Open it, close the application, and delete the folder yourself to reset every local lock.', '初步回覆：本機資料資料夾入面有鎖定紀錄。請開啟個資料夾、關閉程式，再由你自己刪除個資料夾，咁就會重設晒所有本機鎖。'),
  row('confirm.cancelled', 2165, 'status', 'destructive', 'Destructive action cancelled.', '破壞性動作已取消。'),
  row('confirm.running', 2172, 'status', 'progress', 'Destructive action is running.', '破壞性動作正在執行。'),
  row('confirm.completed', 2177, 'status', 'success', 'Destructive action completed.', '破壞性動作已完成。'),
  row('confirm.failed-status', 2181, 'status', 'error', 'Destructive action failed. No success was reported.', '破壞性動作失敗，冇報告成功。'),
  row('school.shared-mode-fallback', 2217, 'visible', 'informational', 'Shared mode', '共用模式'),
  row('school.toggle-status', 2221, 'visible-template', 'informational', '{displayName} is {enabledOrDisabled}', '{displayName}目前{enabledOrDisabled}', ['displayName', 'enabledOrDisabled'], PRESERVE.PROVIDER, ['displayName']),
  row('school.save-settings', 2224, 'visible-template', 'informational', 'Save {displayName} settings', '儲存 {displayName} 設定', ['displayName'], PRESERVE.PROVIDER, ['displayName']),
  row('school.save-enable', 2224, 'visible-template', 'security', 'Save and enable {displayName}', '儲存並啟用 {displayName}', ['displayName'], PRESERVE.PROVIDER, ['displayName']),
  row('school.disable', 2225, 'visible-template', 'security', 'Disable {displayName}', '停用 {displayName}', ['displayName'], PRESERVE.PROVIDER, ['displayName']),
  row('school.available-status', 2228, 'status-template', 'informational', 'Shared record available. {displayName} is {enabledOrDisabled}. Last change: {lastChange}.', '共用紀錄可以使用。{displayName}目前{enabledOrDisabled}。上次變更：{lastChange}。', ['displayName', 'enabledOrDisabled', 'lastChange'], PRESERVE.PROVIDER, ['displayName', 'lastChange']),
  row('school.not-yet-changed', 2228, 'visible', 'informational', 'not yet changed', '尚未變更'),
  row('school.unavailable-status', 2229, 'status-template', 'warning', 'The shared record is {status}. The control cannot honestly report a shared change.', '共用紀錄目前係 {status}。呢個控制無法如實報告共用變更。', ['status'], PRESERVE.PROVIDER, ['status']),
  row('update.provider-message', 2233, 'status-template', 'provider', '{message}', '{message}', ['message'], PRESERVE.PROVIDER, ['message']),
  row('startup.ready-title', 2259, 'notification-title', 'success', 'Ready', '準備好'),
  row('startup.ready-body', 2259, 'notification-body', 'success', 'Hair growth estimates and local haircut history are ready.', '頭髮生長估算同本機剪髮歷史都準備好喇。'),
  row('startup.fatal-title', 2261, 'visible', 'error', 'Hair Growth Estimator could not start', 'Hair Growth Estimator 未能啟動', [], PRESERVE.MIXED, ['Hair Growth Estimator']),
  row('provider.error-message', 2262, 'visible-template', 'provider', '{errorMessage}', '{errorMessage}', ['errorMessage'], PRESERVE.PROVIDER, ['errorMessage'])
];

const NOTIFICATION_ERROR_SOURCE_ROWS = [
  row('notification.error-passthrough', 445, 'notification-template', 'error', '{context}\n{providerMessage}', '{context}\n{providerMessage}', ['context', 'providerMessage'], PRESERVE.PROVIDER, ['context', 'providerMessage']),
  row('notification.nothing-selected', 884, 'notification-title', 'warning', 'Nothing selected', '未有選擇任何項目'),
  row('notification.select-haircut', 884, 'notification-body', 'warning', 'Select at least one haircut first.', '請先選擇至少一項剪髮紀錄。'),
  row('notification.haircuts-deleted', 890, 'notification-title', 'success', 'Haircuts deleted', '剪髮紀錄已刪除'),
  row('notification.haircuts-removed', 890, 'notification-template', 'success', '{count} record{plural} removed.', '已移除 {count} 項紀錄。', ['count', 'plural'], PRESERVE.FACTS, ['count']),
  row('notification.regex-bounds-title', 1153, 'notification-title', 'error', 'Regex bounds exceeded', 'Regex 超出界限', [], PRESERVE.MIXED, ['Regex']),
  row('notification.regex-bounds-body', 1153, 'notification-template', 'error', 'Pattern is limited to {patternBytes} UTF-8 bytes, sample text to {sampleBytes} UTF-8 bytes, and replacement text to {replacementBytes} UTF-8 bytes.', 'Pattern 上限係 {patternBytes} UTF-8 byte，範例文字上限係 {sampleBytes} UTF-8 byte，替換文字上限係 {replacementBytes} UTF-8 byte。', ['patternBytes', 'sampleBytes', 'replacementBytes'], PRESERVE.FACTS, ['patternBytes', 'sampleBytes', 'replacementBytes', 'UTF-8']),
  row('notification.authenticator-deleted', 1225, 'notification-title', 'success', 'Authenticator entry deleted', '驗證器項目已刪除'),
  row('notification.authenticator-removed', 1225, 'notification-template', 'success', '{issuer} {account} was removed.', '已移除 {issuer} {account}。', ['issuer', 'account'], PRESERVE.PROVIDER, ['issuer', 'account']),
  row('notification.appearance-applied', 1743, 'notification-title', 'success', 'Appearance applied', '外觀已套用'),
  row('notification.appearance-body', 1743, 'notification-template', 'success', 'The {elementId} element changed live.', '{elementId} 元素已即時變更。', ['elementId'], PRESERVE.TECHNICAL, ['elementId']),
  row('notification.profile-saved-body', 1951, 'notification-body', 'success', 'The manual fallback, growth rate, and target estimate were updated. The newest haircut remains the active baseline while one exists.', '手動後備基準、生長速度同目標估算已更新。只要仍有剪髮紀錄，日期最新嗰項會保持為目前基準。'),
  row('notification.haircut-saved-title', 1954, 'notification-title', 'success', 'Haircut saved', '剪髮紀錄已儲存'),
  row('notification.export-ready', 1957, 'notification-title', 'success', 'Export ready', '匯出已準備好'),
  row('notification.export-completed', 1957, 'notification-template', 'success', '{format} export completed. Credentials and personal vocabulary were omitted.', '已完成 {format} 匯出。當中冇包括憑證同個人詞彙。', ['format'], PRESERVE.FACTS, ['format']),
  row('notification.conversion-completed', 1960, 'notification-title', 'success', 'Conversion completed', '轉換已完成'),
  row('notification.conversion-result', 1960, 'notification-template', 'success', '{name}, {bytes} bytes, passed post-write validation.', '{name}，{bytes} byte，寫入之後嘅驗證已通過。', ['name', 'bytes'], PRESERVE.PROVIDER, ['name', 'bytes']),
  row('notification.authenticator-added', 1962, 'notification-title', 'success', 'Authenticator entry added', '驗證器項目已新增'),
  row('notification.authenticator-added-body', 1962, 'notification-body', 'success', 'Pairing data was stored through operating-system protection.', '配對資料已經透過作業系統保護儲存。'),
  row('notification.service-connected', 1963, 'notification-title', 'success', 'Service connected', '服務已連線'),
  row('notification.service-connected-body', 1963, 'notification-body', 'success', 'The configured hair length service answered its health endpoint. Credentials remain bound to this exact service destination and were not sent to the public health probe.', '已設定嘅頭髮長度服務回應咗健康端點。憑證仍然綁定到呢個指定服務目的地，亦冇傳送到公開健康探測。'),
  row('notification.service-sync-sent', 1964, 'notification-title', 'success', 'Service sync sent', '服務同步已傳送'),
  row('notification.service-sync-body', 1964, 'notification-body', 'success', 'Local profile and haircut records were sent to the configured service.', '本機設定檔同剪髮紀錄已經傳送咗去你設定嘅服務。'),
  row('notification.service-fetched', 1965, 'notification-title', 'success', 'Service data fetched', '服務資料已取得'),
  row('notification.service-fetched-body', 1965, 'notification-body', 'success', 'The validated local profile now matches the configured service record.', '通過驗證嘅本機設定檔而家同已設定服務紀錄一致。'),
  row('notification.history-degraded', 1968, 'notification-title', 'warning', 'Local history degraded', '本機歷史功能已降級'),
  row('notification.history-degraded-body', 1968, 'notification-template', 'warning', '{providerMessage} The primary state save remains valid.', '{providerMessage} 主要狀態儲存仍然有效。', ['providerMessage'], PRESERVE.PROVIDER, ['providerMessage']),
  row('notification.logo-applied', 2012, 'notification-title', 'success', 'Custom logo applied', '自訂標誌已套用'),
  row('notification.logo-result', 2012, 'notification-template', 'success', '{name}, {bytes} bytes, passed byte-signature validation.', '{name}，{bytes} byte，已通過位元組簽章驗證。', ['name', 'bytes'], PRESERVE.PROVIDER, ['name', 'bytes']),
  row('notification.select-notification', 2083, 'notification-body', 'warning', 'Select at least one notification first.', '請先選擇至少一項通知。'),
  row('notification.history-password-configured', 2094, 'notification-title', 'success', 'History password configured', '歷史密碼已設定'),
  row('notification.history-password-body', 2094, 'notification-body', 'success', 'Protected history operations now require this separate password.', '受保護歷史操作而家需要呢個獨立密碼。'),
  row('notification.two-revisions', 2109, 'notification-title', 'warning', 'Two revisions are needed', '需要兩個修訂'),
  row('notification.two-revisions-body', 2109, 'notification-body', 'warning', 'Select a revision that has an older visible neighbor.', '請選擇一個旁邊有較舊可見修訂嘅修訂。'),
  row('notification.no-revision', 2113, 'notification-title', 'warning', 'No revision selected', '未選擇修訂'),
  row('notification.select-label-revision', 2113, 'notification-body', 'warning', 'Select one revision to label.', '請選擇一個修訂加入標籤。'),
  row('notification.select-restore-revision', 2117, 'notification-body', 'warning', 'Select one revision to restore.', '請選擇一個修訂還原。'),
  row('notification.element-locked', 2139, 'notification-title', 'success', 'Element locked', '元素已鎖定'),
  row('notification.element-locked-body', 2139, 'notification-body', 'success', 'The element is disabled until its own factors verify. This is for fun, not security.', '元素會保持停用，直到佢自己嘅驗證因素通過。呢個只係趣味功能，唔係保安。'),
  row('notification.lock-removed', 2139, 'notification-title', 'success', 'Lock removed', '鎖已移除'),
  row('notification.lock-removed-body', 2139, 'notification-body', 'success', 'The element is available again.', '元素而家可以再次使用。'),
  row('notification.element-unlocked', 2140, 'notification-title', 'success', 'Element unlocked', '元素已解鎖'),
  row('notification.element-unlocked-body', 2140, 'notification-body', 'success', 'This element is unlocked until the application closes.', '呢個元素會保持解鎖，直到應用程式關閉。'),
  row('notification.select-ticket', 2159, 'notification-body', 'warning', 'Select at least one local ticket first.', '請先選擇至少一張本機支援票。'),
  row('notification.no-status-url', 2186, 'notification-title', 'warning', 'No status URL configured', '仲未設定狀態 URL', [], PRESERVE.MIXED, ['URL']),
  row('notification.enter-https', 2186, 'notification-body', 'warning', 'Enter an HTTPS address first.', '請先輸入 HTTPS 位址。', [], PRESERVE.MIXED, ['HTTPS']),
  row('error.local-save', 471, 'error', 'error', 'Local save failed', '本機儲存失敗'),
  row('error.regex-invalid', 1186, 'error', 'error', 'Regex is invalid', 'Regex 無效', [], PRESERVE.MIXED, ['Regex']),
  row('error.authenticator-unavailable', 1229, 'error', 'error', 'Authenticator unavailable', '驗證器無法使用'),
  row('error.link-open', 1265, 'error', 'error', 'Link could not open', '連結未能開啟'),
  row('error.history-unavailable', 1328, 'error', 'error', 'History unavailable', '歷史無法使用'),
  row('error.schedule-refresh', 1644, 'error', 'error', 'Scheduled settings refresh failed', '排程設定重新整理失敗'),
  row('error.locks-unavailable', 1701, 'error', 'error', 'Toy locks unavailable', '玩具鎖無法使用'),
  row('error.local-model-unavailable', 1820, 'error', 'error', 'Local model service unavailable', '本機模型服務無法使用'),
  row('error.profile-invalid', 1951, 'error', 'error', 'Profile is invalid', '設定檔無效'),
  row('error.haircut-invalid', 1954, 'error', 'error', 'Haircut is invalid', '剪髮紀錄無效'),
  row('error.export-failed', 1957, 'error', 'error', 'Export failed', '匯出失敗'),
  row('error.regex-export', 1958, 'error', 'error', 'Regex export failed', 'Regex 匯出失敗', [], PRESERVE.MIXED, ['Regex']),
  row('error.source-selection', 1959, 'error', 'error', 'Source selection failed', '來源選擇失敗'),
  row('error.conversion', 1960, 'error', 'error', 'Conversion failed', '轉換失敗'),
  row('error.secret-generation', 1961, 'error', 'error', 'Secret generation unavailable', '無法產生秘密'),
  row('error.authenticator-entry-invalid', 1962, 'error', 'error', 'Authenticator entry is invalid', '驗證器項目無效'),
  row('error.service-connection', 1963, 'error', 'error', 'Service connection failed', '服務連線失敗'),
  row('error.service-sync', 1964, 'error', 'error', 'Service sync failed', '服務同步失敗'),
  row('error.service-fetch', 1965, 'error', 'error', 'Service fetch failed', '服務資料取得失敗'),
  row('error.ssh-start', 1966, 'error', 'error', 'SSH tunnel failed', 'SSH 通道失敗', [], PRESERVE.MIXED, ['SSH']),
  row('error.ssh-stop', 1966, 'error', 'error', 'SSH tunnel stop failed', '停止 SSH 通道失敗', [], PRESERVE.MIXED, ['SSH']),
  row('error.model-refresh', 1969, 'error', 'error', 'Model refresh failed', '模型重新整理失敗'),
  row('error.local-chat', 1969, 'error', 'error', 'Local chat failed', '本機對話失敗'),
  row('error.shared-configure', 1995, 'error', 'error', 'Shared mode could not be configured', '共用模式設定唔到'),
  row('error.shared-disable', 2007, 'error', 'error', 'Shared mode could not be disabled', '共用模式停用唔到'),
  row('error.shared-change', 2009, 'error', 'error', 'Shared mode change could not be applied', '共用模式嘅變更套用唔到'),
  row('error.logo-rejected', 2012, 'error', 'error', 'Custom logo rejected', '自訂標誌被拒絕'),
  row('error.vocabulary-rejected', 2026, 'error', 'error', 'Vocabulary file rejected', '詞彙檔案未能通過驗證'),
  row('error.vocabulary-clear', 2035, 'error', 'error', 'Vocabulary cache could not be cleared', '詞彙快取清除唔到'),
  row('error.schedule-invalid', 2052, 'error', 'error', 'Scheduled rule is invalid', '排程規則無效'),
  row('error.ha-token', 2073, 'error', 'error', 'Home Assistant access token was not stored', 'Home Assistant 存取憑證未有儲存', [], PRESERVE.MIXED, ['Home Assistant']),
  row('error.folder-open', 2077, 'error', 'error', 'Folder could not open', '資料夾未能開啟'),
  row('error.notification-export', 2084, 'error', 'error', 'Notification export failed', '通知匯出失敗'),
  row('error.history-password-change', 2095, 'error', 'error', 'History password was not changed', '歷史密碼未有變更'),
  row('error.history-locked', 2104, 'error', 'error', 'History remains locked', '歷史仍然鎖定'),
  row('error.history-diff', 2110, 'error', 'error', 'History diff failed', '歷史差異比較失敗'),
  row('error.history-label', 2114, 'error', 'error', 'History label failed', '歷史標籤操作失敗'),
  row('error.history-export', 2134, 'error', 'error', 'History export failed', '歷史匯出失敗'),
  row('error.lock-create', 2139, 'error', 'error', 'Lock could not be created', '鎖未能建立'),
  row('error.unlock', 2140, 'error', 'error', 'Unlock failed', '解鎖失敗'),
  row('error.support-export', 2160, 'error', 'error', 'Support ticket export failed', '支援票匯出失敗'),
  row('error.destructive-action', 2182, 'error', 'error', 'Destructive action failed', '破壞性動作失敗'),
  row('error.update-check', 2185, 'error', 'error', 'Update check failed', '更新檢查失敗'),
  row('error.status-url-open', 2186, 'error', 'error', 'Status URL could not open', '狀態 URL 未能開啟', [], PRESERVE.MIXED, ['URL']),
  row('error.schedule-evaluation', 2254, 'error', 'error', 'Scheduled settings evaluation failed', '排程設定評估失敗')
];

const ARTICLE_ROWS = [
  [
    'about',
    'About this build',
    '關於呢個版本',
    'About this build',
    '關於呢個版本',
    `<h3>About Hair Growth Estimator 1.0.0</h3><p>Release code name: <strong>Classic Har Gow · 蝦餃</strong>, public catalog record <code>hk-dish-0001</code>. The photo remains in the public dim-sum catalog and is not copied into this application.</p><p><a href="#" data-external-url="https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png">Open the public catalog photo</a>.</p><h4>Stable identity</h4><p>Changing the display name or logo changes presentation only. It never changes package identity, data location, executable name, installer identity, or update feed. The installed application owns one exact HTTPS update source. Page content cannot select a different feed, and restart is authorized only for the exact downloaded event that produced the current ready state.</p><h4>Suggested articles</h4><p>Hair growth estimation, Privacy and local credentials, Status and recovery.</p>`,
    `<h3>關於 Hair Growth Estimator 1.0.0</h3><p>發佈代號：<strong>Classic Har Gow · 蝦餃</strong>，公開目錄紀錄 <code>hk-dish-0001</code>。相片保留喺公開點心目錄，唔會複製入應用程式。</p><p><a href="#" data-external-url="https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png">開啟公開目錄相片</a>。</p><h4>穩定識別</h4><p>更改顯示名稱或者標誌只會改變外觀，唔會改變套件識別、資料位置、執行檔名稱、安裝程式識別或者更新來源。已安裝嘅應用程式只會使用一個指定 HTTPS 更新來源。頁面內容唔可以選擇其他來源，而重新啟動只會授權畀產生目前準備狀態嘅指定下載事件。</p><h4>建議文章</h4><p>頭髮生長估算、私隱同本機憑證、狀態同復原。</p>`,
    `<h3>About Hair Growth Estimator 1.0.0</h3><p>Release code name: <strong>Classic Har Gow · 蝦餃</strong>, public catalog record <code>hk-dish-0001</code>. The photo remains in the public dim-sum catalog and is not copied into this application.</p><p><a href="#" data-external-url="https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png">Open the public catalog photo</a>.</p><h4>Stable identity</h4><p>Changing the display name or logo changes presentation only. It never changes package identity, data location, executable name, installer identity, or update feed. The installed application owns one exact HTTPS update source. Page content cannot select a different feed, and restart is authorized only for the exact downloaded event that produced the current ready state.</p><h4>Suggested articles</h4><p>Hair growth estimation, Privacy and local credentials, Status and recovery.</p>`,
    `<h3>關於 Hair Growth Estimator 1.0.0</h3><p>發佈代號：<strong>Classic Har Gow · 蝦餃</strong>，公開目錄紀錄 <code>hk-dish-0001</code>。相片留喺公開點心目錄，應用程式唔會偷偷搬埋一份入嚟。</p><p><a href="#" data-external-url="https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png">開啟公開目錄相片</a>。</p><h4>穩定識別</h4><p>改顯示名稱或者標誌只係換外觀，套件識別、資料位置、執行檔名稱、安裝程式識別同更新來源全部唔會跟住搬屋。已安裝應用程式只認一個指定 HTTPS 更新來源，頁面內容唔可以另揀來源，重新啟動亦只會授權畀產生目前準備狀態嗰個指定下載事件。</p><h4>建議文章</h4><p>頭髮生長估算、私隱同本機憑證、狀態同復原。</p>`
  ],
  [
    'estimation',
    'Hair growth estimation',
    '頭髮生長估算',
    'Hair growth estimation',
    '頭髮生長估算',
    `<h3>Hair growth estimation</h3><p>The estimator stores all lengths canonically in centimetres and converts inches using exactly <strong>1 inch = 2.54 cm</strong>. The shipped starting rate is <strong>1.0 cm per month</strong>, which remains fully adjustable because real growth varies by person, location, health, and time.</p><p>This is a planning estimate, not diagnosis, medical advice, or a promise about actual growth. The general starting point is consistent with <a href="#" data-external-url="https://www.ncbi.nlm.nih.gov/books/NBK499948/">NCBI Bookshelf, Anatomy, Hair</a>.</p><h4>Failure modes</h4><p>Invalid dates, non-finite values, lengths outside 0 to 300 cm, and monthly rates outside 0.05 to 5 cm are refused with a factual message.</p><h4>Suggested articles</h4><p>Haircut resets, Private synchronization, Measurement units.</p>`,
    `<h3>頭髮生長估算</h3><p>估算器以厘米作為所有長度嘅標準儲存單位，英吋會嚴格使用 <strong>1 inch = 2.54 cm</strong> 換算。內置起始速度係 <strong>每月 1.0 cm</strong>，而且可以完整調整，因為實際生長會因人、位置、健康同時間而有差異。</p><p>呢個係規劃估算，唔係診斷、醫療建議，亦唔係對實際生長嘅保證。一般起點同 <a href="#" data-external-url="https://www.ncbi.nlm.nih.gov/books/NBK499948/">NCBI Bookshelf, Anatomy, Hair</a> 一致。</p><h4>失敗情況</h4><p>無效日期、非有限數值、0 至 300 cm 範圍以外嘅長度，同 0.05 至 5 cm 範圍以外嘅每月速度，都會用清楚訊息拒絕。</p><h4>建議文章</h4><p>剪髮重設、私人同步、量度單位。</p>`,
    `<h3>Hair growth estimation</h3><p>The estimator stores all lengths canonically in centimetres and converts inches using exactly <strong>1 inch = 2.54 cm</strong>. The shipped starting rate is <strong>1.0 cm per month</strong>, which remains fully adjustable because real growth varies by person, location, health, and time.</p><p>This is a planning estimate, not diagnosis, medical advice, or a promise about actual growth. The general starting point is consistent with <a href="#" data-external-url="https://www.ncbi.nlm.nih.gov/books/NBK499948/">NCBI Bookshelf, Anatomy, Hair</a>.</p><h4>Failure modes</h4><p>Invalid dates, non-finite values, lengths outside 0 to 300 cm, and monthly rates outside 0.05 to 5 cm are refused with a factual message.</p><h4>Suggested articles</h4><p>Haircut resets, Private synchronization, Measurement units.</p>`,
    `<h3>頭髮生長估算</h3><p>估算器用厘米做標準儲存單位，英吋嚴格照 <strong>1 inch = 2.54 cm</strong> 換算，唔會叫瀏海幫手四捨五入。內置起始速度係 <strong>每月 1.0 cm</strong>，而且可以完整調整，因為實際生長會因人、位置、健康同時間而有差異。</p><p>呢個只係規劃估算，唔係診斷、醫療建議，亦唔係對實際生長嘅保證。一般起點同 <a href="#" data-external-url="https://www.ncbi.nlm.nih.gov/books/NBK499948/">NCBI Bookshelf, Anatomy, Hair</a> 一致。</p><h4>失敗情況</h4><p>無效日期、非有限數值、0 至 300 cm 範圍以外嘅長度，同 0.05 至 5 cm 範圍以外嘅每月速度，都會用清楚訊息拒絕。</p><h4>建議文章</h4><p>剪髮重設、私人同步、量度單位。</p>`
  ],
  [
    'haircuts',
    'Haircut resets and history',
    '剪髮重設同歷史',
    'Haircut resets and history',
    '剪髮重設同歷史',
    `<h3>Haircut resets and history</h3><p>A haircut requires its date, estimated pre-cut length, measured post-cut length, and an optional note. Post-cut length cannot exceed pre-cut length. After every create, edit, delete, or service pull, the chronologically newest haircut becomes the active baseline. If no haircut remains, the last manually entered baseline returns instead of being lost.</p><p>Editing preserves the record identity. Deletion uses a two-key and full-slider confirmation.</p><h4>Export</h4><p>JSON retains the active profile, retained manual fallback, and complete haircut records. CSV and Markdown preserve the visible haircut fields. Stored credentials and private vocabulary are never included.</p><h4>Suggested articles</h4><p>Hair growth estimation, Local version history, Private synchronization.</p>`,
    `<h3>剪髮重設同歷史</h3><p>剪髮紀錄需要日期、剪髮前估算長度、剪髮後量度長度，同埋可選備註。剪髮後長度唔可以超過剪髮前長度。每次新增、編輯、刪除或者由服務拉取資料之後，日期最新嘅剪髮紀錄會成為目前基準。如果所有剪髮紀錄都刪除，系統會還原最後一次手動輸入嘅基準，而唔會令佢遺失。</p><p>編輯會保留紀錄識別。刪除需要兩個按鍵同完整滑桿確認。</p><h4>匯出</h4><p>JSON 會保留目前設定檔、保留嘅手動後備基準，同完整剪髮紀錄。CSV 同 Markdown 會保留畫面顯示嘅剪髮欄位。已儲存憑證同私人詞彙永遠唔會包括在內。</p><h4>建議文章</h4><p>頭髮生長估算、本機版本歷史、私人同步。</p>`,
    `<h3>Haircut resets and history</h3><p>A haircut requires its date, estimated pre-cut length, measured post-cut length, and an optional note. Post-cut length cannot exceed pre-cut length. After every create, edit, delete, or service pull, the chronologically newest haircut becomes the active baseline. If no haircut remains, the last manually entered baseline returns instead of being lost.</p><p>Editing preserves the record identity. Deletion uses a two-key and full-slider confirmation.</p><h4>Export</h4><p>JSON retains the active profile, retained manual fallback, and complete haircut records. CSV and Markdown preserve the visible haircut fields. Stored credentials and private vocabulary are never included.</p><h4>Suggested articles</h4><p>Hair growth estimation, Local version history, Private synchronization.</p>`,
    `<h3>剪髮重設同歷史</h3><p>剪髮紀錄要有日期、剪髮前估算長度、剪髮後量度長度，同可選備註。剪髮後長度唔可以高過剪髮前長度，剪刀唔負責催生。每次新增、編輯、刪除或者由服務拉取資料之後，日期最新嘅剪髮紀錄會成為目前基準。如果一項剪髮紀錄都冇，最後一次手動基準會返嚟，唔會無聲失蹤。</p><p>編輯會保留紀錄識別。刪除需要兩個按鍵同完整滑桿確認。</p><h4>匯出</h4><p>JSON 會保留目前設定檔、手動後備基準同完整剪髮紀錄。CSV 同 Markdown 會保留可見剪髮欄位。已儲存憑證同私人詞彙永遠唔會包括在內。</p><h4>建議文章</h4><p>頭髮生長估算、本機版本歷史、私人同步。</p>`
  ],
  [
    'sync',
    'Private synchronization',
    '私人同步',
    'Private synchronization',
    '私人同步',
    `<h3>Private synchronization</h3><p>Local mode requires no service. Direct HTTP is accepted only for loopback addresses on this computer. A direct non-loopback service must use HTTPS. Its API key is stored through operating-system protection and bound to that exact canonical origin. Public health and version probes never include the key.</p><p>SSH mode invokes <code>ssh.exe</code> directly without a shell, enables BatchMode, requires an existing trusted host key, uses the persistent user known_hosts file, disables host-key updates, and tears down the child process when stopped or when the application exits. Service traffic ignores the direct URL and uses only the validated loopback forward whose host, SSH port, remote API port, and local forward port match the active tunnel. A disconnected or mismatched tunnel is refused, and its credential is bound to the SSH destination rather than a reusable local port.</p><h4>Pull validation</h4><p>A downloaded profile and every downloaded haircut are validated together before any live state changes. An invalid growth rate, missing pre-cut length, post-cut length above pre-cut length, invalid identifier, or oversized record set leaves the existing local state unchanged.</p><h4>Security boundary</h4><p>The service accepts monthly growth rates from 0.05 through 5 cm, requires both haircut lengths, and refuses apparent growth during a cut. It refuses every non-loopback bind without a strong API key. It validates CORS origins, request sizes, timeouts, dates, lengths, counts, and methods. It never logs request bodies or secrets.</p><h4>Deterministic container build</h4><p>The Dockerfile pins the exact multi-platform Node base-image digest. Its build context is the bounded <code>server/</code> directory, with the root <code>Dockerfile</code> selected explicitly. Release builds target <code>linux/amd64</code>, pass the release version, commit SHA, and commit timestamp as <code>BUILD_VERSION</code>, <code>BUILD_REVISION</code>, and <code>SOURCE_DATE_EPOCH</code>, and export <code>hair-growth-api-1.0.0-linux-amd64.oci.tar</code> as an OCI archive. Registry publication is a separate optional action; local hosting never requires it.</p><h4>Suggested articles</h4><p>Haircut resets, Local persistence and version history, Privacy and local credentials.</p>`,
    `<h3>私人同步</h3><p>本機模式唔需要服務。直接 HTTP 只接受呢部電腦嘅 loopback 位址。直接連接非 loopback 服務必須使用 HTTPS。API key 會用作業系統保護儲存，並綁定到指定標準來源。公開健康同版本探測永遠唔會包含個 key。</p><p>SSH 模式會直接執行 <code>ssh.exe</code>，唔經 shell，啟用 BatchMode，要求已存在嘅受信任主機金鑰，使用持久嘅使用者 known_hosts 檔案，停用主機金鑰更新，並喺停止或者應用程式結束時終止子程序。服務流量會忽略直接網址，只使用已驗證嘅 loopback 轉送，而且主機、SSH 連接埠、遠端 API 連接埠同本機轉送連接埠必須同目前通道一致。未連線或者唔一致嘅通道會被拒絕，而憑證會綁定到 SSH 目的地，唔會綁定到可以重用嘅本機連接埠。</p><h4>拉取驗證</h4><p>下載嘅設定檔同所有剪髮紀錄會一齊完成驗證，之後先可以改變目前狀態。無效生長速度、缺少剪髮前長度、剪髮後長度高過剪髮前長度、無效識別或者紀錄數量過大，都會令目前本機狀態保持不變。</p><h4>安全邊界</h4><p>服務接受每月 0.05 至 5 cm 生長速度，要求兩個剪髮長度，並拒絕剪髮期間出現表面增長。冇強 API key 嘅非 loopback 綁定全部會被拒絕。服務會驗證 CORS 來源、要求大小、逾時、日期、長度、數量同方法，亦永遠唔會記錄要求內容或者秘密。</p><h4>可重現容器建置</h4><p>Dockerfile 會固定指定多平台 Node 基礎映像摘要。建置內容限制喺 <code>server/</code> 目錄，並明確選擇根目錄嘅 <code>Dockerfile</code>。發佈建置以 <code>linux/amd64</code> 為目標，將發佈版本、commit SHA 同 commit 時間戳分別以 <code>BUILD_VERSION</code>、<code>BUILD_REVISION</code> 同 <code>SOURCE_DATE_EPOCH</code> 傳入，並將 <code>hair-growth-api-1.0.0-linux-amd64.oci.tar</code> 匯出為 OCI 封存檔。登錄檔發布係獨立可選動作，本機託管永遠唔需要佢。</p><h4>建議文章</h4><p>剪髮重設、本機持久儲存同版本歷史、私隱同本機憑證。</p>`,
    `<h3>Private synchronization</h3><p>Local mode requires no service. Direct HTTP is accepted only for loopback addresses on this computer. A direct non-loopback service must use HTTPS. Its API key is stored through operating-system protection and bound to that exact canonical origin. Public health and version probes never include the key.</p><p>SSH mode invokes <code>ssh.exe</code> directly without a shell, enables BatchMode, requires an existing trusted host key, uses the persistent user known_hosts file, disables host-key updates, and tears down the child process when stopped or when the application exits. Service traffic ignores the direct URL and uses only the validated loopback forward whose host, SSH port, remote API port, and local forward port match the active tunnel. A disconnected or mismatched tunnel is refused, and its credential is bound to the SSH destination rather than a reusable local port.</p><h4>Pull validation</h4><p>A downloaded profile and every downloaded haircut are validated together before any live state changes. An invalid growth rate, missing pre-cut length, post-cut length above pre-cut length, invalid identifier, or oversized record set leaves the existing local state unchanged.</p><h4>Security boundary</h4><p>The service accepts monthly growth rates from 0.05 through 5 cm, requires both haircut lengths, and refuses apparent growth during a cut. It refuses every non-loopback bind without a strong API key. It validates CORS origins, request sizes, timeouts, dates, lengths, counts, and methods. It never logs request bodies or secrets.</p><h4>Deterministic container build</h4><p>The Dockerfile pins the exact multi-platform Node base-image digest. Its build context is the bounded <code>server/</code> directory, with the root <code>Dockerfile</code> selected explicitly. Release builds target <code>linux/amd64</code>, pass the release version, commit SHA, and commit timestamp as <code>BUILD_VERSION</code>, <code>BUILD_REVISION</code>, and <code>SOURCE_DATE_EPOCH</code>, and export <code>hair-growth-api-1.0.0-linux-amd64.oci.tar</code> as an OCI archive. Registry publication is a separate optional action; local hosting never requires it.</p><h4>Suggested articles</h4><p>Haircut resets, Local persistence and version history, Privacy and local credentials.</p>`,
    `<h3>私人同步</h3><p>本機模式唔需要服務。直接 HTTP 只接受呢部電腦嘅 loopback 位址，非 loopback 服務一定要用 HTTPS。API key 用作業系統保護儲存，並綁定到指定標準來源，公開健康同版本探測唔會順手帶埋佢出門口。</p><p>SSH 模式直接執行 <code>ssh.exe</code>，唔經 shell，啟用 BatchMode，要求已有受信任主機金鑰，使用持久使用者 known_hosts 檔案，停用主機金鑰更新，停止或者應用程式結束時會終止子程序。服務流量只用已驗證 loopback 轉送，主機、SSH 連接埠、遠端 API 連接埠同本機轉送連接埠全部要同目前通道一致，唔一致就唔會扮熟。</p><h4>拉取驗證</h4><p>下載嘅設定檔同全部剪髮紀錄會一齊驗證，之後先可以改目前狀態。任何無效資料都會令本機狀態保持原樣。</p><h4>安全邊界</h4><p>服務接受每月 0.05 至 5 cm 生長速度，要求兩個剪髮長度，並拒絕剪髮期間表面增長。冇強 API key 嘅非 loopback 綁定全部會被拒絕。CORS 來源、要求大小、逾時、日期、長度、數量同方法都會驗證，要求內容同秘密永遠唔會記錄。</p><h4>可重現容器建置</h4><p>Dockerfile 固定指定多平台 Node 基礎映像摘要，建置內容限制喺 <code>server/</code>，並明確選擇根目錄 <code>Dockerfile</code>。發佈建置以 <code>linux/amd64</code> 為目標，傳入 <code>BUILD_VERSION</code>、<code>BUILD_REVISION</code> 同 <code>SOURCE_DATE_EPOCH</code>，再匯出 <code>hair-growth-api-1.0.0-linux-amd64.oci.tar</code>。登錄檔發布係獨立可選動作，本機託管唔需要佢。</p><h4>建議文章</h4><p>剪髮重設、本機持久儲存同版本歷史、私隱同本機憑證。</p>`
  ],
  [
    'persistence',
    'Local persistence and version history',
    '本機持久儲存同版本歷史',
    'Local persistence and version history',
    '本機持久儲存同版本歷史',
    `<h3>Local persistence and version history</h3><p>Main-process saves run through one serialized queue. Each accepted write must carry the current authoritative revision; a stale candidate is refused rather than overwriting newer data. The primary state file is written atomically before a redacted local-history revision is attempted.</p><p>If local Git history cannot record a revision, the primary save remains valid and the application reports the history degradation. Orderly shutdown waits for both the state queue and history queue before closing, then stops any active SSH tunnel.</p><h4>Protected history manager</h4><p>The history manager requires its own credential stored through operating-system protection. It can search redacted revisions, filter by typed date range and actions discovered from the history itself, show action counts, compare two revisions, add labels, restore, prune by an explicit retention value, and export the filtered redacted view. A restore is appended as a new revision, so it never rewrites the revision selected for recovery.</p><h4>Recovery boundary</h4><p>History snapshots omit SSH key paths, custom logo bytes, private vocabulary content, and credentials. A history write failure never reverses a successful primary save. Shutdown draining does not rewrite or prune history.</p><h4>Suggested articles</h4><p>Haircut resets and history, Private synchronization, Privacy and local credentials.</p>`,
    `<h3>本機持久儲存同版本歷史</h3><p>主程序儲存會經過一條序列化佇列。每次接受嘅寫入都必須帶有目前權威修訂編號，過期候選資料會被拒絕，唔會覆寫較新資料。主要狀態檔會先以不可分割方式寫入，之後先嘗試建立已遮蔽資料嘅本機歷史修訂。</p><p>如果本機 Git 歷史無法記錄修訂，主要儲存仍然有效，而應用程式會報告歷史記錄降級。正常結束會等待狀態佇列同歷史佇列完成，之後停止任何目前 SSH 通道。</p><h4>受保護歷史管理員</h4><p>歷史管理員要求一組獨立憑證，並以作業系統保護儲存。佢可以搜尋已遮蔽資料嘅修訂、用輸入日期範圍同由歷史本身發現嘅動作篩選、顯示動作數量、比較兩個修訂、加入標籤、還原、按明確保留數量移除較舊修訂，同匯出目前篩選後嘅遮蔽資料檢視。還原會新增一個修訂，所以永遠唔會改寫用作復原嘅原有修訂。</p><h4>復原邊界</h4><p>歷史快照會省略 SSH key 路徑、自訂標誌位元組、私人詞彙內容同憑證。歷史寫入失敗永遠唔會撤銷已成功嘅主要儲存。結束時排清佇列唔會改寫或者修剪歷史。</p><h4>建議文章</h4><p>剪髮重設同歷史、私人同步、私隱同本機憑證。</p>`,
    `<h3>Local persistence and version history</h3><p>Main-process saves run through one serialized queue. Each accepted write must carry the current authoritative revision; a stale candidate is refused rather than overwriting newer data. The primary state file is written atomically before a redacted local-history revision is attempted.</p><p>If local Git history cannot record a revision, the primary save remains valid and the application reports the history degradation. Orderly shutdown waits for both the state queue and history queue before closing, then stops any active SSH tunnel.</p><h4>Protected history manager</h4><p>The history manager requires its own credential stored through operating-system protection. It can search redacted revisions, filter by typed date range and actions discovered from the history itself, show action counts, compare two revisions, add labels, restore, prune by an explicit retention value, and export the filtered redacted view. A restore is appended as a new revision, so it never rewrites the revision selected for recovery.</p><h4>Recovery boundary</h4><p>History snapshots omit SSH key paths, custom logo bytes, private vocabulary content, and credentials. A history write failure never reverses a successful primary save. Shutdown draining does not rewrite or prune history.</p><h4>Suggested articles</h4><p>Haircut resets and history, Private synchronization, Privacy and local credentials.</p>`,
    `<h3>本機持久儲存同版本歷史</h3><p>主程序儲存排好一條序列化佇列，每次寫入都要帶目前權威修訂編號。過期候選資料會被拒絕，唔會趁人唔覺意覆寫新資料。主要狀態檔先以不可分割方式寫入，之後先嘗試建立已遮蔽資料嘅本機歷史修訂。</p><p>本機 Git 歷史記錄唔到修訂時，主要儲存仍然有效，應用程式會如實報告降級。正常結束會等狀態同歷史佇列完成，再停止目前 SSH 通道。</p><h4>受保護歷史管理員</h4><p>歷史管理員要用獨立憑證。搜尋、日期同動作篩選、比較、標籤、還原、保留數量修剪同匯出全部有明確路徑。還原會新增修訂，唔會改寫原有修訂。</p><h4>復原邊界</h4><p>歷史快照省略 SSH key 路徑、自訂標誌位元組、私人詞彙內容同憑證。歷史寫入失敗唔會撤銷主要儲存，結束時排清佇列亦唔會改寫或者修剪歷史。</p><h4>建議文章</h4><p>剪髮重設同歷史、私人同步、私隱同本機憑證。</p>`
  ],
  [
    'privacy',
    'Privacy and local credentials',
    '私隱同本機憑證',
    'Privacy and local credentials',
    '私隱同本機憑證',
    `<h3>Privacy and local credentials</h3><p>Hair records remain on this computer unless you explicitly use service sync. API keys, toy-lock credentials, and authenticator secrets use operating-system protection. Secrets are omitted from ordinary exports, local history, notifications, and logs.</p><h4>Personal vocabulary file</h4><p>The optional local JSON file uses one root object with <code>schemaVersion: 1</code> and an <code>entries</code> object. The complete UTF-8 payload is limited to 256 KiB, 4,096 entries, depth 2, keys from 1 through 160 Unicode code points, and string values through 1,000 Unicode code points. Malformed UTF-8, duplicate keys, unknown fields or versions, unsafe keys, and out-of-bound values are rejected before anything is applied.</p><p>Validation, replacement, and the private application-data cache remain local and make no network request. Every cache load is revalidated. A rejected replacement keeps the last valid cache, while an explicitly cleared cache is purged and immediately restores the original shipped wording. School mode suppresses the vocabulary controls and replacements without deleting the last valid private cache.</p><p>No private mapping, source filename, source path, entry count, or mapping value appears in source, status copy, logs, exports, notifications, or local history.</p><h4>Suggested articles</h4><p>Private synchronization, Toy locks, Local version history.</p>`,
    `<h3>私隱同本機憑證</h3><p>除非你明確使用服務同步，否則頭髮紀錄只會留喺呢部電腦。API key、玩具鎖憑證同驗證器秘密會用作業系統保護。普通匯出、本機歷史、通知同記錄永遠唔會包含秘密。</p><h4>個人詞彙檔案</h4><p>可選本機 JSON 檔案只可以有一個根物件，內含 <code>schemaVersion: 1</code> 同一個 <code>entries</code> 物件。完整 UTF-8 資料上限係 256 KiB、4,096 個項目、深度 2；key 長度係 1 至 160 個 Unicode code point，字串值上限係 1,000 個 Unicode code point。格式錯誤嘅 UTF-8、重複 key、未知欄位或者版本、不安全 key，同超出界限嘅值，都會喺套用之前被拒絕。</p><p>驗證、更換同私人應用資料快取全部留喺本機，唔會發出網絡要求。每次載入快取都會重新驗證。更換失敗會保留上一個有效快取；明確清除快取就會刪除快取，並即時還原內置原文。School mode 會抑制詞彙控制同替換，但唔會刪除上一個有效私人快取。</p><p>私人對照、來源檔案名稱、來源路徑、項目數量或者對照值，都唔會出現喺原始碼、狀態文字、記錄、匯出、通知或者本機歷史。</p><h4>建議文章</h4><p>私人同步、玩具鎖、本機版本歷史。</p>`,
    `<h3>Privacy and local credentials</h3><p>Hair records remain on this computer unless you explicitly use service sync. API keys, toy-lock credentials, and authenticator secrets use operating-system protection. Secrets are omitted from ordinary exports, local history, notifications, and logs.</p><h4>Personal vocabulary file</h4><p>The optional local JSON file uses one root object with <code>schemaVersion: 1</code> and an <code>entries</code> object. The complete UTF-8 payload is limited to 256 KiB, 4,096 entries, depth 2, keys from 1 through 160 Unicode code points, and string values through 1,000 Unicode code points. Malformed UTF-8, duplicate keys, unknown fields or versions, unsafe keys, and out-of-bound values are rejected before anything is applied.</p><p>Validation, replacement, and the private application-data cache remain local and make no network request. Every cache load is revalidated. A rejected replacement keeps the last valid cache, while an explicitly cleared cache is purged and immediately restores the original shipped wording. School mode suppresses the vocabulary controls and replacements without deleting the last valid private cache.</p><p>No private mapping, source filename, source path, entry count, or mapping value appears in source, status copy, logs, exports, notifications, or local history.</p><h4>Suggested articles</h4><p>Private synchronization, Toy locks, Local version history.</p>`,
    `<h3>私隱同本機憑證</h3><p>除非你明確用服務同步，否則頭髮紀錄只留喺呢部電腦。API key、玩具鎖憑證同驗證器秘密有作業系統保護，普通匯出、本機歷史、通知同記錄唔會帶佢哋周圍去。</p><h4>個人詞彙檔案</h4><p>本機 JSON 檔案格式、UTF-8、256 KiB、4,096 項、深度 2、key 同值長度全部有明確上限。格式錯誤、重複 key、未知欄位或者版本、不安全 key 同超界值，一律喺套用之前拒絕。</p><p>驗證、更換同快取全部留喺本機，唔發網絡要求。每次載入都重新驗證；更換失敗保留上一個有效快取，明確清除就即時還原內置原文。School mode 只會抑制控制同替換，唔會刪除有效私人快取。</p><p>私人對照、來源名稱、路徑、數量同值唔會出現喺原始碼、狀態文字、記錄、匯出、通知或者本機歷史。</p><h4>建議文章</h4><p>私人同步、玩具鎖、本機版本歷史。</p>`
  ],
  [
    'tools',
    'Regex, converter, and local model tools',
    'Regex、轉換器同本機模型工具',
    'Regex, converter, and local model tools',
    'Regex、轉換器同本機模型工具',
    `<h3>Local tools</h3><p>Plain-text search remains the default. When regex is enabled, every search field, anchored builder validation, and full workbench evaluation crosses the privileged boundary into a dedicated worker. Pattern, candidate, sample, replacement, capture, and result sizes are bounded. Each worker has a 250 ms hard deadline and is terminated when that deadline expires, so an adversarial pattern cannot keep the interface thread running it.</p><p>The full workbench uses the running JavaScript RegExp engine with live capture tables, a bounded replacement preview, capability notes, truncation notices, and adversarial-risk warnings. Results are capped at 128 matches.</p><p>The local file converter enables only bundled text, JSON, hexadecimal, and base64 adapters. Other format families remain visible and disabled with an exact reason. The local model manager talks only to Ollama on loopback and never embeds a cloud model service.</p><h4>Suggested articles</h4><p>Privacy, Export formats, Status and recovery.</p>`,
    `<h3>本機工具</h3><p>預設使用純文字搜尋。啟用 regex 之後，每個搜尋欄、錨定建構器驗證同完整工作台評估，都會經過特權邊界交畀專用 worker。Pattern、候選內容、範例、替換、capture 同結果大小全部有界限。每個 worker 都有 250 ms 硬性期限，期限到達就會終止，所以對抗性 pattern 唔可以令介面執行緒一直處理佢。</p><p>完整工作台使用目前 JavaScript RegExp engine，提供即時 capture 表、有限替換預覽、能力說明、截斷通知同回溯風險警告。結果上限係 128 個 match。</p><p>本機檔案轉換器只啟用已內置嘅文字、JSON、hexadecimal 同 base64 adapter。其他格式類別仍然可見，但會停用並顯示準確原因。本機模型管理員只會同 loopback 上嘅 Ollama 通訊，永遠唔會嵌入雲端模型服務。</p><h4>建議文章</h4><p>私隱、匯出格式、狀態同復原。</p>`,
    `<h3>Local tools</h3><p>Plain-text search remains the default. When regex is enabled, every search field, anchored builder validation, and full workbench evaluation crosses the privileged boundary into a dedicated worker. Pattern, candidate, sample, replacement, capture, and result sizes are bounded. Each worker has a 250 ms hard deadline and is terminated when that deadline expires, so an adversarial pattern cannot keep the interface thread running it.</p><p>The full workbench uses the running JavaScript RegExp engine with live capture tables, a bounded replacement preview, capability notes, truncation notices, and adversarial-risk warnings. Results are capped at 128 matches.</p><p>The local file converter enables only bundled text, JSON, hexadecimal, and base64 adapters. Other format families remain visible and disabled with an exact reason. The local model manager talks only to Ollama on loopback and never embeds a cloud model service.</p><h4>Suggested articles</h4><p>Privacy, Export formats, Status and recovery.</p>`,
    `<h3>本機工具</h3><p>純文字搜尋繼續做預設。Regex 一開，每個搜尋欄、錨定建構器同完整工作台都交畀專用 worker，pattern、候選內容、範例、替換、capture 同結果全部有界限。250 ms 期限一到就終止，唔會畀一條對抗性 pattern 坐喺介面執行緒嘆茶。</p><p>工作台使用目前 JavaScript RegExp engine，提供即時 capture 表、有限預覽、能力說明、截斷通知同風險警告，結果上限 128 個 match。</p><p>檔案轉換器只啟用已內置文字、JSON、hexadecimal 同 base64 adapter。其他類別會誠實停用。本機模型管理員只同 loopback 上嘅 Ollama 通訊，唔會嵌入雲端模型服務。</p><h4>建議文章</h4><p>私隱、匯出格式、狀態同復原。</p>`
  ],
  [
    'locks',
    'Toy locks and local support tickets',
    '玩具鎖同本機支援票',
    'Toy locks and local support tickets',
    '玩具鎖同本機支援票',
    `<h3>Toy locks</h3><p>Every element can receive its own PIN, password, TOTP, or ordered combination. The lock is an interface speed bump, not security or encryption. A locked wrapper refuses pointer and keyboard activation until its own credential set verifies.</p><p>The fictional Support Tickets desk sends nothing. Its resolution opens the application-data folder so you can delete the local record yourself.</p><h4>Suggested articles</h4><p>Privacy, Local history, Settings.</p>`,
    `<h3>玩具鎖</h3><p>每個元素都可以有自己嘅 PIN、密碼、TOTP 或者指定次序組合。呢個鎖只係介面阻力，唔係保安或者加密。已鎖定包裝層會拒絕指標同鍵盤啟用，直到佢自己嘅憑證組合通過驗證。</p><p>虛構嘅 Support Tickets 服務台唔會傳送任何資料。佢嘅處理方式只係開啟應用資料資料夾，等你自己刪除本機紀錄。</p><h4>建議文章</h4><p>私隱、本機歷史、設定。</p>`,
    `<h3>Toy locks</h3><p>Every element can receive its own PIN, password, TOTP, or ordered combination. The lock is an interface speed bump, not security or encryption. A locked wrapper refuses pointer and keyboard activation until its own credential set verifies.</p><p>The fictional Support Tickets desk sends nothing. Its resolution opens the application-data folder so you can delete the local record yourself.</p><h4>Suggested articles</h4><p>Privacy, Local history, Settings.</p>`,
    `<h3>玩具鎖</h3><p>每個元素都有自己嘅 PIN、密碼、TOTP 或者指定組合。呢個鎖只係介面減速帶，唔係保安或者加密，唔好叫佢看守珠寶。憑證未通過之前，已鎖定元素會拒絕指標同鍵盤啟用。</p><p>虛構 Support Tickets 服務台唔會傳送資料，處理方法係開啟應用資料資料夾，等你自己刪除本機紀錄。</p><h4>建議文章</h4><p>私隱、本機歷史、設定。</p>`
  ],
  [
    'language-presentation',
    'Language and funny levels',
    '語言同搞笑程度',
    'Language and funny levels',
    '語言同搞笑程度',
    `<h3>Language and funny levels</h3><p>Choose English, playful Hong Kong-style Cantonese, or bilingual presentation. English and Cantonese each have an independent funny level from 1 through 5, defaulting to 5. The selected voice styles informational, success, progress, warning, error, destructive, security, accessibility, and notification messages without changing facts.</p><h4>Persistence and fallback</h4><p>Choices persist locally. Unknown provider-authored or technical text remains exact rather than being guessed. Bilingual presentation gives each language its own segment.</p><h4>Suggested articles</h4><p>Shared presentation mode, Narrator, Attention accommodations.</p>`,
    `<h3>語言同搞笑程度</h3><p>你可以揀英文、香港粵語，或者雙語顯示。英文同粵語各自有 1 至 5 級搞笑程度，預設都係 5。資料、成功、進度、警告、錯誤、刪除、安全、無障礙同通知訊息都會跟住語氣設定，但事實唔會變形。</p><h4>保存同後備處理</h4><p>選擇會保存在本機。外來內容或者技術文字唔會亂估翻譯。雙語模式會分開顯示兩種語言。</p><h4>建議文章</h4><p>共用顯示模式、旁白、專注輔助。</p>`,
    `<h3>Language and funny levels</h3><p>Choose English, playful Hong Kong-style Cantonese, or bilingual presentation. English and Cantonese each have an independent funny level from 1 through 5, defaulting to 5. The selected voice styles informational, success, progress, warning, error, destructive, security, accessibility, and notification messages without changing facts.</p><h4>Persistence and fallback</h4><p>Choices persist locally. Unknown provider-authored or technical text remains exact rather than being guessed. Bilingual presentation gives each language its own segment.</p><h4>Suggested articles</h4><p>Shared presentation mode, Narrator, Attention accommodations.</p>`,
    `<h3>語言同搞笑程度</h3><p>你可以揀英文、香港粵語或者雙語。英文同粵語各自有 1 至 5 級，預設都係 5，兩邊可以各有性格，唔使綁埋一齊排隊。所有訊息會跟語氣設定，但事實照原樣企好。</p><h4>保存同後備處理</h4><p>選擇留喺本機。外來內容同技術文字唔會靠估，雙語模式亦會分開兩段，唔會擠成一碗字。</p><h4>建議文章</h4><p>共用顯示模式、旁白、專注輔助。</p>`
  ],
  [
    'shared-presentation',
    'Shared presentation mode',
    '共用顯示模式',
    'Shared presentation mode',
    '共用顯示模式',
    `<h3>Shared presentation mode</h3><p>This user-renamable record is shared live by local applications. Enabling it retains the prior language and funny-level choices, forces serious English presentation, and removes restricted controls and destinations from settings, searches, documentation, notifications, previews, and the command palette. Verified disable restores the retained choices.</p><h4>Unlock and recovery</h4><p>PIN and password unlocks use operating-system protection and one shared record. Passkey policy is represented by the core schema but is unavailable in this build, so the picker says so rather than pretending. This is an interface lock, not a security boundary.</p><h4>Suggested articles</h4><p>Language and funny levels, Privacy, Support Tickets.</p>`,
    `<h3>共用顯示模式</h3><p>呢個可以改名嘅本機紀錄會即時同步畀其他本機應用。開啟時會保留之前嘅語言同搞笑程度，改用認真英文，並由設定、搜尋、文件、通知、預覽同指令面板移除受限制項目。驗證後關閉，就會還原之前選擇。</p><h4>解鎖同復原</h4><p>PIN 同密碼用作業系統保護，全部應用共用同一紀錄。核心資料格式已經識別 passkey，但呢個版本未提供，所以介面會誠實講明。呢個係介面鎖，唔係保安邊界。</p><h4>建議文章</h4><p>語言同搞笑程度、私隱、Support Tickets。</p>`,
    `<h3>Shared presentation mode</h3><p>This user-renamable record is shared live by local applications. Enabling it retains the prior language and funny-level choices, forces serious English presentation, and removes restricted controls and destinations from settings, searches, documentation, notifications, previews, and the command palette. Verified disable restores the retained choices.</p><h4>Unlock and recovery</h4><p>PIN and password unlocks use operating-system protection and one shared record. Passkey policy is represented by the core schema but is unavailable in this build, so the picker says so rather than pretending. This is an interface lock, not a security boundary.</p><h4>Suggested articles</h4><p>Language and funny levels, Privacy, Support Tickets.</p>`,
    `<h3>共用顯示模式</h3><p>呢個可以改名嘅本機紀錄會即時同步畀其他本機應用。開啟時會收好原有語言同搞笑程度，再改用認真英文，受限制項目亦會由各個畫面離場。驗證後關閉，就會原封還返之前選擇。</p><h4>解鎖同復原</h4><p>PIN 同密碼用作業系統保護，共用同一紀錄。核心格式識別 passkey，但呢個版本未提供，介面會直接講明，唔會畫個掣扮有。呢個係介面鎖，唔係保安邊界。</p><h4>建議文章</h4><p>語言同搞笑程度、私隱、Support Tickets。</p>`
  ],
  article(
    'narrator',
    'Narrator voices and pacing',
    '旁白聲線同節奏',
    `<h3>Narrator voices and pacing</h3><p>The narrator is off by default. English and Cantonese have separate installed-voice pickers keyed by stable voice identity, plus Choose automatically. Delayed voice discovery refreshes the list. A missing saved voice remains selected and reports the actual fallback.</p><p>Both mode speaks English then Cantonese through one serialized queue. Rate and pitch persist within platform bounds. Narration pauses while assistive technology is active and stays quiet in low-stimulation mode.</p><h4>Suggested articles</h4><p>Language and funny levels, Attention accommodations, Accessibility.</p>`,
    `<h3>旁白聲線同節奏</h3><p>旁白預設關閉。英文同粵語各自有已安裝聲線選擇，使用穩定聲線識別，亦可以自動選擇。聲線遲啲先載入時，清單會再更新。已保存但未安裝嘅聲線會保留，並講清楚實際後備聲線。</p><p>雙語旁白會排隊先講英文，再講粵語。速度同音高會按平台範圍保存。輔助技術使用中或者低刺激模式開啟時，旁白會安靜落嚟。</p><h4>建議文章</h4><p>語言同搞笑程度、專注輔助、無障礙。</p>`
  ),
  article(
    'scheduled-presentation',
    'Scheduled presentation settings',
    '排程顯示設定',
    `<h3>Scheduled presentation settings</h3><p>Rules use an explicit IANA timezone, optional inclusive date bounds, start and end times, every day or selected weekdays, and deterministic priority. Equal times cover the full local day. Cross-midnight windows belong to the day on which they start, and end times are exclusive.</p><p>Values may be local, supplied by a versioned bounded HTTPS API, or activated by a Home Assistant boolean entity. Exact loopback HTTP is the only HTTP exception. Redirects, embedded URL credentials, stale responses, oversized payloads, and unknown fields are refused. Home Assistant access values remain in operating-system protection.</p><h4>Suggested articles</h4><p>Appearance settings, Privacy, Status and recovery.</p>`,
    `<h3>排程顯示設定</h3><p>規則會保存 IANA 時區、可選日期範圍、開始同結束時間、每日或者指定星期日子，同埋明確優先次序。相同開始結束時間代表全日。跨午夜時段屬於開始嗰日，而結束時間唔包括在內。</p><p>設定值可以來自本機、有限制同版本驗證嘅 HTTPS API，或者由 Home Assistant 布林實體開關。HTTP 只容許精確 loopback。重新導向、網址內憑證、過期回應、過大資料同未知欄位全部會拒絕。Home Assistant 存取值留喺作業系統保護入面。</p><h4>建議文章</h4><p>外觀設定、私隱、狀態同復原。</p>`
  ),
  article(
    'attention-accommodations',
    'Attention accommodations',
    '專注輔助',
    `<h3>Attention accommodations</h3><p>Focus, Low stimulation, Time awareness, One thing at a time, and Momentum are independent and off by default. Focus dims rather than hides. Low stimulation quiets motion and nonessential transient notices. Time awareness reports exact elapsed minutes. One thing at a time keeps a user-chosen next action. Momentum offers a neutral reminder after 40 minutes and respects Not now for one hour.</p><p>These are interface accommodations, not diagnosis, assessment, advice, or a productivity score.</p><h4>Suggested articles</h4><p>Narrator, Language and funny levels, Accessibility.</p>`,
    `<h3>專注輔助</h3><p>聚焦、低刺激、時間提示、一次一件事同動力提示可以分開開關，預設全部關閉。聚焦只會淡化，唔會收藏內容。低刺激會減少動態同非必要即時提示。時間提示會報告準確分鐘。一次一件事保存由你揀嘅下一步。動力提示會喺 40 分鐘冇變更後中性提示，而「遲啲先」會安靜一小時。</p><p>呢啲係介面輔助，唔係診斷、評估、建議或者生產力分數。</p><h4>建議文章</h4><p>旁白、語言同搞笑程度、無障礙。</p>`
  ),
  article(
    'startup-surprise',
    'Startup surprise',
    '開機小驚喜',
    `<h3>Startup surprise</h3><p>After first run, one fresh random draw per launch selects the nonblocking public-catalog card exactly 10 percent of the time. It never appears during an error, update, active task, shared restricted mode, or low-stimulation presentation. It does not take focus, has no sound, and dismisses itself after eight seconds.</p><p>The picture is fetched only from the published public catalog asset and cached in private application data after PNG signature and size validation. A missing offline cache produces no substitute image and no false success.</p><h4>Suggested articles</h4><p>About this build, Attention accommodations, Privacy.</p>`,
    `<h3>開機小驚喜</h3><p>首次啟動之後，每次開啟只抽一次新亂數，精確有一成機會顯示唔阻住你嘅公開目錄卡片。錯誤、更新、工作進行中、共用限制模式或者低刺激顯示期間都唔會出現。佢唔搶焦點、冇聲，八秒後自己收工。</p><p>圖片只會由已發布嘅公開目錄資產取得，通過 PNG 簽章同大小驗證後先快取喺私人應用資料。離線又冇快取時，唔會整假圖，亦唔會扮成功。</p><h4>建議文章</h4><p>關於呢個版本、專注輔助、私隱。</p>`
  ),
  article(
    'evidence-isolation',
    'Evidence-only data isolation',
    '證據專用資料隔離',
    `<h3>Evidence-only data isolation</h3><p>The capture harness starts the application with exactly three switches: <code>--evidence-mode</code>, <code>--evidence-app-data=&lt;absolute-empty-task-root&gt;</code>, and <code>--evidence-user-data=&lt;absolute-empty-task-root&gt;</code>. Each switch must appear exactly once. Both roots must be absolute, empty or missing, strict non-overlapping children beneath an exact <code>.hair-growth-evidence-task</code> path segment that is itself beneath the operating-system temporary directory, and free of symbolic-link or reparse components.</p><p>The main process validates and activates both roots before application readiness or any ordinary data read. It writes <code>evidence-isolation.json</code> in the isolated user-data root and <code>evidence-app-data-active.json</code> in the isolated application-data root. Receipts contain schema version 1 and canonical path SHA-256 values only, never raw paths. Normal launches do not change either path and do not create a receipt.</p><h4>Failure modes</h4><p>A relative path, filesystem root, overlap, duplicate switch, unowned location, nonempty destination, or link component stops startup before user data can be read.</p><h4>Suggested articles</h4><p>Privacy and local credentials, Shared presentation mode, Status and recovery.</p>`,
    `<h3>證據專用資料隔離</h3><p>擷取工具會用三個指定開關啟動應用：<code>--evidence-mode</code>、<code>--evidence-app-data=&lt;absolute-empty-task-root&gt;</code> 同 <code>--evidence-user-data=&lt;absolute-empty-task-root&gt;</code>。每個開關只可以出現一次。兩個根目錄一定要係絕對路徑、空白或者未建立、互不重疊，放喺精確 <code>.hair-growth-evidence-task</code> 路徑段之下，而嗰個路徑段本身亦一定要位於作業系統臨時目錄之下，亦唔可以經過符號連結或者重解析點。</p><p>主程序會喺應用準備好或者讀取任何普通資料之前，驗證同啟用兩個根目錄。隔離嘅 user-data 根目錄會收到 <code>evidence-isolation.json</code>，隔離嘅 application-data 根目錄就會收到 <code>evidence-app-data-active.json</code>。收據只會包含格式版本 1 同標準化路徑 SHA-256，永遠唔會包含原始路徑。正常啟動唔會改動兩個位置，亦唔會產生收據。</p><h4>失敗處理</h4><p>相對路徑、檔案系統根目錄、重疊、重複開關、唔屬於今次工作嘅位置、非空白目的地或者連結元件，都會喺讀取用戶資料之前停止啟動。</p><h4>建議文章</h4><p>私隱同本機憑證、共用顯示模式、狀態同復原。</p>`
  )
];

const ARTICLE_SCHOOL_SAFE_ROWS = [
  [
    'about',
    `<h3>About Hair Growth Estimator 1.0.0</h3><h4>Stable identity</h4><p>Changing the display name or logo changes presentation only. It never changes package identity, data location, executable name, installer identity, or update feed. The installed application owns one exact HTTPS update source. Page content cannot select a different feed, and restart is authorized only for the exact downloaded event that produced the current ready state.</p><h4>Suggested articles</h4><p>Hair growth estimation, Privacy and local credentials, Status and recovery.</p>`,
    `<h3>About Hair Growth Estimator 1.0.0</h3><h4>Stable identity</h4><p>Changing the display name or logo changes presentation only. It never changes package identity, data location, executable name, installer identity, or update feed. The installed application owns one exact HTTPS update source. Page content cannot select a different feed, and restart is authorized only for the exact downloaded event that produced the current ready state.</p><h4>Suggested articles</h4><p>Hair growth estimation, Privacy and local credentials, Status and recovery.</p>`,
    `<h3>關於 Hair Growth Estimator 1.0.0</h3><h4>穩定識別</h4><p>更改顯示名稱或者標誌只會改變外觀，唔會改變套件識別、資料位置、執行檔名稱、安裝程式識別或者更新來源。已安裝嘅應用程式只會使用一個指定 HTTPS 更新來源。頁面內容唔可以選擇其他來源，而重新啟動只會授權畀產生目前準備狀態嘅指定下載事件。</p><h4>建議文章</h4><p>頭髮生長估算、私隱同本機憑證、狀態同復原。</p>`,
    `<h3>關於 Hair Growth Estimator 1.0.0</h3><h4>穩定識別</h4><p>更改顯示名稱或者標誌只會改變外觀，唔會改變套件識別、資料位置、執行檔名稱、安裝程式識別或者更新來源。已安裝嘅應用程式只會使用一個指定 HTTPS 更新來源。頁面內容唔可以選擇其他來源，而重新啟動只會授權畀產生目前準備狀態嘅指定下載事件。</p><h4>建議文章</h4><p>頭髮生長估算、私隱同本機憑證、狀態同復原。</p>`
  ],
  [
    'privacy',
    `<h3>Privacy and local credentials</h3><p>Hair records remain on this computer unless you explicitly use service sync. API keys, toy-lock credentials, and authenticator secrets use operating-system protection. Secrets are omitted from ordinary exports, local history, notifications, and logs.</p><h4>Suggested articles</h4><p>Private synchronization, Toy locks, Local version history.</p>`,
    `<h3>Privacy and local credentials</h3><p>Hair records remain on this computer unless you explicitly use service sync. API keys, toy-lock credentials, and authenticator secrets use operating-system protection. Secrets are omitted from ordinary exports, local history, notifications, and logs.</p><h4>Suggested articles</h4><p>Private synchronization, Toy locks, Local version history.</p>`,
    `<h3>私隱同本機憑證</h3><p>除非你明確使用服務同步，否則頭髮紀錄只會留喺呢部電腦。API key、玩具鎖憑證同驗證器秘密會用作業系統保護。普通匯出、本機歷史、通知同記錄永遠唔會包含秘密。</p><h4>建議文章</h4><p>私人同步、玩具鎖、本機版本歷史。</p>`,
    `<h3>私隱同本機憑證</h3><p>除非你明確使用服務同步，否則頭髮紀錄只會留喺呢部電腦。API key、玩具鎖憑證同驗證器秘密會用作業系統保護。普通匯出、本機歷史、通知同記錄永遠唔會包含秘密。</p><h4>建議文章</h4><p>私人同步、玩具鎖、本機版本歷史。</p>`
  ]
];

const RENDERER_ROWS = deepFreeze([
  ...COMMAND_SETTINGS_PALETTE_SOURCE_ROWS,
  ...RENDERER_SOURCE_ROWS,
  ...NOTIFICATION_ERROR_SOURCE_ROWS
]);

deepFreeze(ARTICLE_ROWS);
deepFreeze(ARTICLE_SCHOOL_SAFE_ROWS);

module.exports = {
  COMMAND_SETTINGS_PALETTE_SOURCE_ROWS,
  NOTIFICATION_ERROR_SOURCE_ROWS,
  RENDERER_SOURCE_ROWS,
  RENDERER_ROWS,
  ARTICLE_ROWS,
  ARTICLE_SCHOOL_SAFE_ROWS
};
