/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 01 · CORE HELPERS
 * ---------------------------------------------------------------------
 * Shared utilities: safe strings, dates, sheet IO (batch + chunked),
 * settings reader, run log, document lock. Every other file builds on
 * these. All private helpers use the trailing-underscore convention.
 * ===================================================================== */

/** ---- Context shortcuts --------------------------------------------- */
function ss_()  { return SpreadsheetApp.getActive(); }
function sheet_(name) { return ss_().getSheetByName(name); }
function ui_()  { return SpreadsheetApp.getUi(); }
function tz_()  { return Session.getScriptTimeZone(); }

/** ---- Safe conversion ------------------------------------------------ */
function toStr_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v).replace(/\u00A0/g, ' ').trim();
}

function toBool_(v) {
  const s = toStr_(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function trunc_(s, n) {
  s = toStr_(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function uniq_(arr) {
  const seen = {}, out = [];
  arr.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
  return out;
}

/** ---- Dates ---------------------------------------------------------- */
function nowIso_()   { return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd'T'HH:mm:ss"); }
function todayStr_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

/** Full ISO timestamp (HubSpot style) -> 'yyyy-MM-dd', '' if empty/bad. */
function isoToDate_(iso) {
  const s = toStr_(iso);
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

/** Days since a 'yyyy-MM-dd' string; -1 when empty/unparseable. */
function daysSince_(dateStr) {
  const s = toStr_(dateStr);
  if (!s) return -1;
  const d = new Date(s.slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return -1;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** Parse messy CSV dates -> 'yyyy-MM-dd' ('' if unparseable). */
function parseDateAny_(v) {
  const s = toStr_(v);
  if (!s) return '';
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    let a = +m[1], b = +m[2], y = m[3];
    if (a > 12 && b <= 12) return y + '-' + pad2_(b) + '-' + pad2_(a);   // dd/mm/yyyy
    if (b > 12 && a <= 12) return y + '-' + pad2_(a) + '-' + pad2_(b);   // mm/dd/yyyy
    return y + '-' + pad2_(a) + '-' + pad2_(b);                          // assume US mm/dd
  }

  m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3,})[- ](\d{4})$/);
  if (m) {
    const mo = monthFromName_(m[2]);
    if (mo) return m[3] + '-' + pad2_(mo) + '-' + pad2_(m[1]);
  }

  if (/^\d{5}$/.test(s)) { // Excel serial date
    const d = new Date((+s - 25569) * 86400000);
    return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  }
  return '';
}

function monthFromName_(s) {
  const t = s.slice(0, 3).toLowerCase();
  const names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const i = names.indexOf(t);
  return i < 0 ? 0 : i + 1;
}

function pad2_(n) { return ('0' + String(+n)).slice(-2); }

/** ---- Email normalization -------------------------------------------- */
function normEmail_(v) {
  let s = toStr_(v).toLowerCase().replace(/^mailto:/, '').replace(/[<>"']/g, '').trim();
  return s.replace(/[.,;:]+$/, '');
}

/** Gmail-equivalence key: dots and +tags ignored for gmail.com only. */
function gmailKey_(email) {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  const dom = email.slice(at + 1), loc = email.slice(0, at);
  if (dom !== 'gmail.com' && dom !== 'googlemail.com') return '';
  return loc.split('+')[0].replace(/\./g, '') + '@gmail.com';
}

/** Lifecycle stage normalization (CSV exports use many spellings). */
function normalizeLifecycle_(v) {
  const s = toStr_(v).toLowerCase().replace(/\s+/g, '');
  return PB4.LIFECYCLE_ALIASES[s] || s;
}

/** ---- Number / money formatting -------------------------------------- */
function fmtNum_(x) {
  return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtPct_(part, whole) {
  if (!whole) return '0.0%';
  return (part / whole * 100).toFixed(1) + '%';
}

/** ---- Sheet IO (batch, chunked) --------------------------------------- */
function clearBelow_(sh, headerRows) {
  const last = sh.getLastRow();
  if (last > headerRows) {
    sh.getRange(headerRows + 1, 1, last - headerRows, sh.getMaxColumns()).clearContent();
  }
}

/** Write rows in chunks of 5000; pad/trim every row to exact width. */
function writeRows_(sh, startRow, rows, width, asText) {
  if (!rows || !rows.length) return;
  if (asText) sh.getRange(startRow, 1, rows.length, width).setNumberFormat('@');
  const CH = 5000;
  for (let s = 0; s < rows.length; s += CH) {
    const part = rows.slice(s, s + CH).map(function (row) {
      const out = new Array(width);
      for (let i = 0; i < width; i++) {
        out[i] = (row[i] === undefined || row[i] === null) ? '' : row[i];
      }
      return out;
    });
    sh.getRange(startRow + s, 1, part.length, width).setValues(part);
  }
}

/** Read all RAW_DATA data rows (below header) as 2D array. */
function readRawRows_() {
  const sh = sheet_(PB4.SHEETS.RAW);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, PB4.RAW_HEADERS.length).getValues();
}

function writeRawAll_(rows) {
  const sh = sheet_(PB4.SHEETS.RAW);
  clearBelow_(sh, 1);
  writeRows_(sh, 2, rows, PB4.RAW_HEADERS.length, true);
  return rows.length;
}

function requireRawData_() {
  const rows = readRawRows_();
  if (!rows.length) {
    throw new Error('RAW_DATA is empty. Use menu ② Seed demo data, ③ PULL from HubSpot, or ④ PULL from CSV first.');
  }
  return rows;
}

/** ---- Settings -------------------------------------------------------- */
function getSettings_() {
  const map = {};
  PB4.SETTINGS_DEFAULTS.forEach(function (r) { map[r[0]] = r[1]; });
  const sh = sheet_(PB4.SHEETS.SETTINGS);
  if (sh && sh.getLastRow() > 1) {
    const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    vals.forEach(function (r) {
      const k = toStr_(r[0]), v = toStr_(r[1]);
      if (k) map[k] = v === '' ? map[k] : v;   // blank cell -> keep default
    });
  }
  return map;
}

function num_(map, key, def) {
  const v = parseFloat(map && map[key]);
  return isNaN(v) ? def : v;
}

function str_(map, key, def) {
  const v = map && map[key];
  return (v === undefined || v === '') ? def : v;
}

/** ---- METHOD_LOG ------------------------------------------------------ */
function logMsg_(stage, level, message, detail) {
  try {
    const sh = sheet_(PB4.SHEETS.METHOD);
    if (!sh) return;
    sh.appendRow([nowIso_(), stage, level, message, detail || '']);
  } catch (e) { /* never let logging break a run */ }
}

/** ---- Locking --------------------------------------------------------- */
function withLock_(fn) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try { return fn(); }
  finally { try { lock.releaseLock(); } catch (e) { /* already released */ } }
}

/** ---- Misc ------------------------------------------------------------ */
/** Append one finding to the run context (catalog supplies defaults). */
function addFinding_(ctx, o) {
  const meta = PB4.CHECK_BY_ID[o.check];
  ctx.findings.push([
    '', o.check,
    meta ? meta.category : 'OTHER',
    o.sev || (meta ? meta.severity : 'MEDIUM'),
    o.disp || (meta ? meta.disposition : 'REVIEW'),
    o.record || '', o.name || '', o.field || '',
    trunc_(o.value || '', 120),
    o.reason || '', o.fix || '', o.cluster || ''
  ]);
}

function recName_(row) {
  const C = PB4.COLS_RAW;
  const n = (toStr_(row[C.FIRST]) + ' ' + toStr_(row[C.LAST])).trim();
  return n || toStr_(row[C.EMAIL]) || toStr_(row[C.RECORD_ID]);
}

function countFilled_(row) {
  const C = PB4.COLS_RAW;
  let n = 0;
  [C.EMAIL, C.PHONE, C.MOBILE, C.COMPANY, C.TITLE, C.WEBSITE, C.CITY, C.COUNTRY]
    .forEach(function (c) { if (toStr_(row[c])) n++; });
  return n;
}

/** Build a lowercase Set-like object from a comma list in SETTINGS. */
function setFromCsv_(map, key) {
  const out = {};
  toStr_(map[key]).split(',').forEach(function (x) {
    const t = x.trim().toLowerCase();
    if (t) out[t] = 1;
  });
  return out;
}
