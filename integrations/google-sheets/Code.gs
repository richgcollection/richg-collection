/**
 * Rich G Collection — stock tracker ⇄ website sync.
 *
 * Paste this into the stock tracker sheet: Extensions → Apps Script → Code.gs.
 * Setup steps: integrations/google-sheets/README.md in the website repo.
 *
 * Each run (every 10 minutes, or "Rich G Sync → Sync now"):
 *   1. adds stock entries made on the website (online orders, admin stock
 *      in/out) to the bottom of Stock In / Stock Out;
 *   2. sends Stock In, Stock Out and PROFIT to the website, which updates
 *      stock, sales and customers to match;
 *   3. writes each row's SITE ID back, which links the row to its website
 *      entry so later edits to the row update that entry.
 *
 * Don't edit or copy SITE ID cells by hand. To re-enter a row, delete it and
 * add it again with an empty SITE ID.
 */

var SHEETS = ['Stock In', 'Stock Out', 'PROFIT'];
var LINKED_SHEETS = ['Stock In', 'Stock Out'];
var SITE_ID = 'SITE ID';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Rich G Sync')
    .addItem('Sync now', 'syncNowFromMenu')
    .addItem('Turn on automatic sync (every 10 min)', 'installAutoSync')
    .addItem('Turn off automatic sync', 'removeAutoSync')
    .addToUi();
}

function syncNowFromMenu() {
  var result = sync_();
  SpreadsheetApp.getUi().alert('Rich G Sync', result, SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Time-driven trigger entry point. */
function syncNow() {
  sync_();
}

function installAutoSync() {
  removeAutoSync();
  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(10).create();
  SpreadsheetApp.getActive().toast('Automatic sync is on (every 10 minutes).', 'Rich G Sync');
}

function removeAutoSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncNow') ScriptApp.deleteTrigger(t);
  });
}

// ------------------------------------------------------------------ sync

function sync_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return 'Another sync is already running. Try again in a minute.';
  try {
    var ss = SpreadsheetApp.getActive();
    var added = pullFromSite_(ss);
    var res = pushToSite_(ss);
    var msg = (added ? added + ' website entr' + (added === 1 ? 'y' : 'ies') + ' added to the sheet. ' : '') + res.status + ': ' + res.message;
    if (res.problems && res.problems.length) msg += '\n\nProblems:\n- ' + res.problems.slice(0, 15).join('\n- ');
    writeStatus_(ss, res.status + ': ' + res.message);
    return msg;
  } catch (e) {
    writeStatus_(SpreadsheetApp.getActive(), 'FAILED: ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/** Website → sheet: append entries the sheet doesn't have yet. */
function pullFromSite_(ss) {
  var data = call_('get', '/api/sheets/outbox');
  var rows = data.rows || [];
  if (!rows.length) return 0;
  var done = [];
  rows.forEach(function (r) {
    var sheet = ss.getSheetByName(r.sheet);
    if (!sheet) return;
    var layout = layout_(sheet);
    var target = lastDataRow_(sheet, layout) + 1;
    Object.keys(r.values).forEach(function (key) {
      var col = layout.cols[key];
      if (!col) return;
      var v = r.values[key];
      if (key === 'DATE' && v) {
        var p = String(v).split('-');
        v = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      }
      sheet.getRange(target, col).setValue(v === null ? '' : v);
    });
    done.push(r.id);
  });
  SpreadsheetApp.flush();
  call_('post', '/api/sheets/outbox', { ids: done });
  return done.length;
}

/** Sheet → website: send the rows, store the SITE IDs that come back. */
function pushToSite_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var payload = { sheets: {} };
  var layouts = {};
  SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var layout = layout_(sheet);
    layouts[name] = layout;
    var last = lastDataRow_(sheet, layout);
    if (last <= layout.headerRow) { payload.sheets[name] = []; return; }
    var width = Math.max(layout.width, sheet.getLastColumn());
    var values = sheet.getRange(layout.headerRow + 1, 1, last - layout.headerRow, width).getValues();
    payload.sheets[name] = values.map(function (row, i) {
      var obj = { _row: layout.headerRow + 1 + i };
      Object.keys(layout.cols).forEach(function (key) {
        var v = row[layout.cols[key] - 1];
        if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        else if (typeof v === 'string') v = v.trim();
        obj[key] = v === '' ? null : v;
      });
      return obj;
    });
  });

  var res = call_('post', '/api/sheets/sync', payload);
  (res.links || []).forEach(function (link) {
    var sheet = ss.getSheetByName(link.sheet);
    var layout = layouts[link.sheet];
    if (!sheet || !layout || !layout.cols[SITE_ID]) return;
    sheet.getRange(link.row, layout.cols[SITE_ID]).setValue(link.id);
  });
  return res;
}

// ------------------------------------------------------------------ helpers

/**
 * Finds the header row (first row with 3+ filled cells) and column numbers by
 * header name. Adds a SITE ID column after the last used column if the sheet
 * links rows and doesn't have one yet.
 */
function layout_(sheet) {
  var scan = sheet.getRange(1, 1, Math.min(10, sheet.getMaxRows()), sheet.getLastColumn()).getValues();
  var headerRow = 1;
  for (var r = 0; r < scan.length; r++) {
    if (scan[r].filter(function (c) { return String(c).trim() !== ''; }).length >= 3) { headerRow = r + 1; break; }
  }
  var header = scan[headerRow - 1];
  var cols = {};
  header.forEach(function (h, i) {
    var key = String(h).trim();
    if (key && !cols[key]) cols[key] = i + 1;
  });
  if (LINKED_SHEETS.indexOf(sheet.getName()) >= 0 && !cols[SITE_ID]) {
    var col = sheet.getLastColumn() + 1;
    sheet.getRange(headerRow, col).setValue(SITE_ID).setFontWeight('bold');
    sheet.setColumnWidth(col, 120);
    cols[SITE_ID] = col;
  }
  var width = 0;
  Object.keys(cols).forEach(function (k) { width = Math.max(width, cols[k]); });
  return { headerRow: headerRow, cols: cols, width: width };
}

/** Last row with a DATE or CATEGORY (other columns may hold copied-down formulas). */
function lastDataRow_(sheet, layout) {
  var keys = ['DATE', 'CATEGORY', 'ITEM'].filter(function (k) { return layout.cols[k]; });
  var last = sheet.getLastRow();
  if (last <= layout.headerRow || !keys.length) return layout.headerRow;
  var found = layout.headerRow;
  keys.forEach(function (k) {
    var vals = sheet.getRange(layout.headerRow + 1, layout.cols[k], last - layout.headerRow, 1).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]).trim() !== '') { found = Math.max(found, layout.headerRow + 1 + i); break; }
    }
  });
  return found;
}

function call_(method, path, body) {
  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty('SITE_URL') || '').replace(/\/+$/, '');
  var secret = props.getProperty('SYNC_SECRET');
  if (!base || !secret) throw new Error('Set SITE_URL and SYNC_SECRET under Project Settings → Script properties.');
  var options = {
    method: method,
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true,
    contentType: 'application/json',
  };
  if (body) options.payload = JSON.stringify(body);
  var resp = UrlFetchApp.fetch(base + path, options);
  var text = resp.getContentText();
  var json;
  try { json = JSON.parse(text); } catch (e) { throw new Error('Website returned ' + resp.getResponseCode() + ': ' + text.slice(0, 200)); }
  if (resp.getResponseCode() >= 400 && json.status !== 'HELD') throw new Error(json.message || json.error || 'HTTP ' + resp.getResponseCode());
  return json;
}

/** Shows the last result in a note on the Stock Out header's first cell. */
function writeStatus_(ss, text) {
  var sheet = ss.getSheetByName('Stock Out');
  if (!sheet) return;
  var stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'd MMM yyyy HH:mm');
  sheet.getRange(1, 1).setNote('Last website sync (' + stamp + '):\n' + text);
}
