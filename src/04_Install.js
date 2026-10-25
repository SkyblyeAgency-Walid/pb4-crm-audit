/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 04 · INSTALL / REPAIR WORKBOOK
 * ---------------------------------------------------------------------
 * One-click installer: creates all 8 tabs, headers, formatting and
 * SETTINGS defaults. Idempotent — safe to run any time; never touches
 * existing data, only fills in what is missing.
 * ===================================================================== */

function installWorkbook() {
  return withLock_(function () {
    const ss = ss_();

    ensureTab_(ss, PB4.SHEETS.RAW,      PB4.RAW_HEADERS,      { textData: true });
    ensureTab_(ss, PB4.SHEETS.FINDINGS, PB4.FINDINGS_HEADERS, { textData: true });
    ensureTab_(ss, PB4.SHEETS.DUPES,    PB4.DUPES_HEADERS,    { textData: true });
    ensureTab_(ss, PB4.SHEETS.STALE,    PB4.STALE_HEADERS,    { textData: true });
    ensureTab_(ss, PB4.SHEETS.PROFILE,  PB4.PROFILE_HEADERS,  {});
    ensureTab_(ss, PB4.SHEETS.METHOD,   PB4.METHOD_HEADERS,   {});
    ensureTab_(ss, PB4.SHEETS.SETTINGS, ['key', 'value'],     {});
    ensureSummaryTab_(ss);

    seedSettingsDefaults_();
    setWidths_();

    logMsg_('INSTALL', 'INFO', 'Workbook installed / repaired', 'PB4 ' + PB4.VERSION);
    try {
      ui_.alert('PB4 — CRM Health Audit', 'Workbook ready (' + PB4.VERSION + ').\n\n' +
        'Next steps:\n' +
        '② Seed demo data — or ③/④ pull your real CRM.\n' +
        'Then ⑥ RUN FULL AUDIT.', ui_.ButtonSet.OK);
    } catch (e) { /* running headless */ }
    return true;
  });
}

/** ---- tab helpers ----------------------------------------------------- */
function ensureTab_(ss, name, headers, opts) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  const width = headers.length;
  const current = sh.getLastRow() >= 1
    ? sh.getRange(1, 1, 1, Math.max(1, Math.min(width, sh.getMaxColumns()))).getValues()[0]
    : [];

  // Write headers only if missing (never overwrite user edits).
  let needsHeaders = false;
  for (let i = 0; i < width; i++) { if (toStr_(current[i]) !== headers[i]) { needsHeaders = true; break; } }
  if (needsHeaders) {
    sh.getRange(1, 1, 1, width).setValues([headers]);
  }
  styleHeaderRow_(sh, width);
  sh.setFrozenRows(1);

  // Force plain-text on data area so '+212...', '2024-01-02', '00123'
  // are never mangled by Sheets auto-formatting.
  if (opts && opts.textData) {
    sh.getRange(2, 1, Math.max(1, sh.getMaxRows() - 1), width).setNumberFormat('@');
  }
  return sh;
}

function ensureSummaryTab_(ss) {
  let sh = ss.getSheetByName(PB4.SHEETS.SUMMARY);
  if (!sh) sh = ss.insertSheet(PB4.SHEETS.SUMMARY);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1).setValue('CRM HEALTH AUDIT — run an audit to populate this page.');
    sh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
    try { sh.setHiddenGridlines(true); } catch (e) { /* older runtime */ }
  }
  return sh;
}

function styleHeaderRow_(sh, width) {
  sh.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF')
    .setVerticalAlignment('middle');
  sh.setRowHeight(1, 28);
}

function seedSettingsDefaults_() {
  const sh = sheet_(PB4.SHEETS.SETTINGS);
  const last = sh.getLastRow();
  const present = {};
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { present[toStr_(r[0])] = 1; });
  }
  const missing = PB4.SETTINGS_DEFAULTS.filter(function (r) { return !present[r[0]]; });
  if (missing.length) {
    const start = Math.max(2, last + 1);
    writeRows_(sh, start, missing, 2, false);
  }
}

function setWidths_() {
  const w = function (name, widths) {
    const sh = sheet_(name);
    if (!sh) return;
    widths.forEach(function (px, i) { sh.setColumnWidth(i + 1, px); });
  };
  w(PB4.SHEETS.RAW,      [90, 70, 100, 100, 200, 130, 130, 160, 120, 120, 120, 110, 90, 100, 100, 120, 80, 100, 90, 110, 110, 150]);
  w(PB4.SHEETS.FINDINGS, [78, 62, 108, 76, 132, 96, 170, 100, 170, 320, 320, 90]);
  w(PB4.SHEETS.DUPES,    [90, 150, 70, 260, 260, 200, 110, 340]);
  w(PB4.SHEETS.STALE,    [96, 160, 190, 150, 120, 100, 120, 80, 150, 340]);
  w(PB4.SHEETS.PROFILE,  [150, 80, 80, 90, 90, 260]);
  w(PB4.SHEETS.METHOD,   [150, 80, 70, 320, 420]);
  w(PB4.SHEETS.SETTINGS, [220, 640]);
}
