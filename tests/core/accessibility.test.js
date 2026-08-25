'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'app', 'renderer', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'app', 'renderer', 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'app', 'renderer', 'styles.css'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'app', 'preload.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'app', 'main.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'app', 'core', 'state.js'), 'utf8');

const tabs = ['dashboard', 'haircuts', 'gallery', 'tools', 'integrations', 'settings', 'docs', 'status'];

test('tab strip declares the complete tablist relationship', () => {
  assert.match(html, /<nav\b(?=[^>]*\sid="tab-strip")(?=[^>]*\srole="tablist")[^>]*>/);
});

test('every tab and panel has an exact reciprocal relationship', () => {
  for (const id of tabs) {
    assert.match(html, new RegExp(`<button\\b(?=[^>]*\\sid="tab-${id}")(?=[^>]*\\saria-controls="view-${id}")[^>]*>`));
    assert.match(html, new RegExp(`<section\\b(?=[^>]*\\sid="view-${id}")(?=[^>]*\\saria-labelledby="tab-${id}")(?=[^>]*\\stabindex="0")[^>]*>`));
  }
});

test('tab keyboard movement follows the current axis with roving focus', () => {
  assert.match(script, /^\s*function handleTabRovingKey\(event\)/m);
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.match(script, new RegExp(`'${key}'`));
  assert.match(script, /setAttribute\('tabindex', item === button \? '0' : '-1'\)/);
  assert.match(script, /groupHeader\.getAttribute\('aria-expanded'\) === 'true'/);
});

test('every native dialog has an accessible labelled-by relationship', () => {
  const dialogs = [...html.matchAll(/<dialog\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(dialogs.length >= 7);
  for (const dialog of dialogs) assert.match(dialog, /\saria-labelledby="[^"]+"/, `unnamed dialog: ${dialog}`);
});

test('managed dialogs restore focus to their reliable opener', () => {
  assert.match(script, /const dialogOpeners = new WeakMap\(\)/);
  assert.match(script, /^\s*function openManagedDialog\(dialog, options = \{\}\)/m);
  assert.match(script, /^\s*function restoreDialogFocus\(dialog\)/m);
  assert.match(script, /dialog\.addEventListener\('close', \(\) => restoreDialogFocus\(dialog\)\)/);
  assert.match(script, /^\s*function closeRegexPopover\(\{ restoreFocus = true \} = \{\}\)/m);
  assert.match(script, /^\s*function closeContextMenu\(\{ restoreFocus = true \} = \{\}\)/m);
  assert.match(script, /^\s*function activatePaletteEntry\(entry\)/m);
  assert.match(script, /dialog\.addEventListener\('close', \(\) => entry\.action\(\), \{ once: true \}\)/);
});

test('one command registry owns shortcuts and rendered menu labels', () => {
  assert.match(script, /const COMMAND_REGISTRY = Object\.freeze\(/);
  assert.match(html, /data-command-id="open-palette"/);
  assert.match(html, /data-command-id="edit-appearance"/);
  assert.match(script, /^\s*function applyCommandRegistry\(\)/m);
  assert.match(script, /COMMAND_REGISTRY\['open-palette'\]\.shortcut/);
});

test('every cloned command-palette control receives its own accessible name', () => {
  assert.match(script, /^\s*function clonePaletteControl\(source, entry\)/m);
  assert.match(script, /clone\.setAttribute\('aria-label', entry\.label\)/);
  assert.doesNotMatch(script, /\.cloneNode\(true\); select\.value/);
});

test('destructive confirmation exposes semantic arming, progress, and completion', () => {
  assert.match(html, /id="confirm-key-one"[^>]*aria-pressed="false"/);
  assert.match(html, /id="confirm-key-two"[^>]*aria-pressed="false"/);
  assert.match(html, /id="confirm-progress"[^>]*role="progressbar"[^>]*aria-valuenow="0"/);
  assert.match(html, /id="confirm-status"[^>]*aria-live="polite"/);
  assert.match(script, /setAttribute\('aria-pressed'/);
  assert.match(script, /setAttribute\('aria-valuenow'/);
});

test('persistent warning and error notifications have individual dismiss actions', () => {
  assert.match(script, /^\s*function dismissNotification\(id\)/m);
  assert.match(script, /button\.dataset\.dismissNotice/);
  assert.match(script, /\['error', 'warning'\]\.includes\(kind\)/);
  assert.match(script, /toast\.setAttribute\('role', 'alert'\)/);
});

test('notification history is searchable and fully bulk manageable', () => {
  for (const id of ['notification-search', 'select-all-notices', 'invert-notices', 'dismiss-selected-notices', 'delete-selected-notices', 'export-notices']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(script, /^\s*function selectedNotificationIds\(\)/m);
  assert.match(script, /^\s*async function renderNotifications\(\)/m);
  assert.match(script, /filterBySearch\(\$\('#notification-search'\), state\.notifications, \(notice\) =>/);
  assert.match(script, /^\s*visibleNotificationItems = visible;$/m);
});

test('hair stages expose meaningful names and selected state', () => {
  assert.match(script, /button\.textContent = stage\.label/);
  assert.match(script, /button\.setAttribute\('aria-pressed', 'false'\)/);
  assert.match(script, /dot\.setAttribute\('aria-pressed', selected \? 'true' : 'false'\)/);
});

test('scripted growth progression honors operating-system reduced motion', () => {
  assert.match(script, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(script, /^\s*function prefersReducedMotion\(\)/m);
  assert.match(script, /^\s*function toggleGrowthPlayback\(\)/m);
  assert.match(script, /if \(prefersReducedMotion\(\)\) return advanceGrowthStage\(\)/);
  assert.match(script, /setOwnedText\(\$\('#play-growth'\), prefersReducedMotion\(\) \? 'Show next stage' : 'Play growth'\)/);
});

test('interactive targets meet the 44 pixel minimum', () => {
  assert.match(styles, /button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.stage-dot\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.tab\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.search-field\.compact input\s*\{[^}]*min-height:\s*44px/s);
});

test('protected local history manager exposes every required operation', () => {
  for (const id of ['history-password', 'history-unlock', 'history-search', 'history-date-from', 'history-date-to', 'history-action', 'history-diff', 'history-restore', 'history-label', 'history-prune', 'history-export']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const channel of ['history:setCredential', 'history:diff', 'history:restore', 'history:label', 'history:prune', 'history:export']) {
    assert.match(preload, new RegExp(channel.replace(/[.]/g, '\\.')));
    assert.match(main, new RegExp(channel.replace(/[.]/g, '\\.')));
  }
  assert.match(html, /id="history-label-text"[^>]*maxlength="80"/);
  assert.match(html, /id="history-retention"[^>]*max="1000"/);
  assert.match(script, /const actionCounts = allHistoryItems\.reduce\(/);
});

test('local support tickets provide routes, search, export, bulk status, and help', () => {
  for (const id of ['open-support-from-settings', 'open-support-from-help', 'support-search', 'support-status-filter', 'support-list', 'select-all-support', 'invert-support', 'advance-support', 'export-support', 'delete-support']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(script, /^\s*async function renderSupportTickets\(\)/m);
  assert.match(script, /filterBySearch\(\$\('#support-search'\), statusCandidates, \(ticket\) =>/);
  assert.match(script, /^\s*visibleSupportTicketItems = visible;$/m);
  assert.match(script, /^\s*function selectedSupportTicketIds\(\)/m);
  assert.match(html, /id="support-result"[^>]*aria-live="polite"/);
});

test('one-thing and momentum accommodations render and persist dismissal', () => {
  for (const id of ['one-thing-banner', 'one-thing-current', 'complete-next-action', 'momentum-banner', 'momentum-message', 'momentum-not-now']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(script, /^\s*function renderAttentionAccommodations\(\)/m);
  assert.match(script, /^\s*function evaluateMomentumPrompt\(now = Date\.now\(\)\)/m);
  assert.match(state, /momentumDismissedUntil:/);
  assert.match(state, /lastMeaningfulChangeAt:/);
});

test('dialog emoji preference decorates only an aria-hidden visual span', () => {
  assert.match(script, /^\s*function syncDialogEmoji\(dialog\)/m);
  assert.match(script, /emoji\.className = 'dialog-emoji'/);
  assert.match(script, /emoji\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(script, /dialog\.classList\.toggle\('show-dialog-emoji'/);
  assert.doesNotMatch(script, /button\.(?:textContent|setAttribute\('aria-label')\)[^\n]*showDialogEmoji/);
});
