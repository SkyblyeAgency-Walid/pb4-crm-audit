/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 15 · REPORT (SUMMARY + 1-PAGE PDF)
 * ---------------------------------------------------------------------
 * Renders the SUMMARY tab: score, what we scanned, what we found,
 * what it costs, 30-day cleanup plan, method & guarantees.
 * exportOnePagePdf() prints exactly that tab to a Drive PDF.
 * ===================================================================== */

const DARK = '#0F172A', GRAY = '#64748B', LIGHT = '#F1F5F9', WHITE = '#FFFFFF';

function reportStep_(ctx) {
  const sh = sheet_(PB4.SHEETS.SUMMARY);
  withLock_(function () {
    renderSummary_(sh, ctx);
  });
  logMsg_('REPORT', 'INFO', 'SUMMARY rendered', 'score=' + ctx.score.score + ' grade=' + ctx.score.grade);
  return ctx;
}

function renderSummary_(sh, ctx) {
  sh.clear();
  try { sh.setHiddenGridlines(true); } catch (e) { /* older runtime */ }
  [260, 340, 210, 150, 330, 60].forEach(function (px, i) { sh.setColumnWidth(i + 1, px); });

  const cfg = ctx.cfg;
  const pull = lastPullInfo_();
  const money = function (v) { return str_(cfg, 'CURRENCY', 'USD') + ' ' + fmtNum_(v); };
  let r = 1;

  /* ---- Title -------------------------------------------------------- */
  sh.getRange(r, 1).setValue('CRM HEALTH AUDIT').setFontSize(20).setFontWeight('bold').setFontColor(DARK); r++;
  sh.getRange(r, 1).setValue('Generated ' + nowIso_() + '  ·  PB4 ' + PB4.VERSION +
    '  ·  READ-ONLY AUDIT — no CRM record was modified or deleted.')
    .setFontSize(9).setFontColor(GRAY); r += 2;

  /* ---- Score -------------------------------------------------------- */
  const score = ctx.score.score, color = bandColor_(score);
  sh.getRange(r, 1).setValue('HEALTH SCORE').setFontSize(10).setFontColor(GRAY); r++;
  sh.getRange(r, 1).setValue(score).setFontSize(40).setFontWeight('bold').setFontColor(color);
  sh.getRange(r, 2).setValue('/ 100').setFontSize(16).setFontColor(GRAY);
  sh.getRange(r, 3).setValue(ctx.score.grade).setFontSize(14).setFontWeight('bold').setFontColor(color);
  sh.getRange(r, 5).setValue(ctx.totals.high + ' HIGH  ·  ' + ctx.totals.medium + ' MEDIUM  ·  ' +
    ctx.records + ' records scanned').setFontSize(10).setFontColor(GRAY);
  r += 2;

  /* ---- 1 · What we scanned ------------------------------------------ */
  sec_(sh, r++, '1 · WHAT WE SCANNED');
  const thresholds = 'stale > ' + num_(cfg, 'STALE_DAYS', 90) + 'd · never-activated > ' +
    num_(cfg, 'NEVER_ACTIVATED_DAYS', 30) + 'd · MQL-stuck > ' + num_(cfg, 'MQL_STUCK_DAYS', 60) + 'd';
  kv_(sh, r++, 'Source mode', pull.mode + '  (' + pull.rows + ' records pulled ' + pull.at + ')');
  kv_(sh, r++, 'Properties per record', PB4.HUBSPOT_PROPS.length + ' canonical fields');
  kv_(sh, r++, 'Checks executed', PB4.CHECK_CATALOG.length + ' (H-01 … H-20, deterministic keys)');
  kv_(sh, r++, 'Thresholds (SETTINGS)', thresholds);
  if (ctx.profile) {
    kv_(sh, r++, 'Email fill rate', ctx.profile.emailFill + '    ·    Phone fill rate: ' + ctx.profile.phoneFill);
  }
  r++;

  /* ---- 2 · What we found -------------------------------------------- */
  sec_(sh, r++, '2 · WHAT WE FOUND');
  sh.getRange(r, 1, 1, 5).setValues([['Category', 'Findings', 'HIGH', 'MEDIUM', 'Top check']])
    .setFontWeight('bold').setBackground(LIGHT);
  r++;
  PB4.CATEGORIES.forEach(function (cat) {
    const c = ctx.catCounts[cat.key] || { total: 0, high: 0, medium: 0, checks: {} };
    sh.getRange(r, 1, 1, 5).setValues([[cat.label, c.total, c.high, c.medium, topCheckLabel_(c)]]);
    r++;
  });
  sh.getRange(r, 1, 1, 5).setValues([['TOTAL', ctx.totals.all, ctx.totals.high, ctx.totals.medium, '']])
    .setFontWeight('bold').setBackground(LIGHT);
  r += 2;

  /* ---- 3 · What it costs --------------------------------------------- */
  sec_(sh, r++, '3 · WHAT IT COSTS (ESTIMATED, ANNUALIZED)');
  sh.getRange(r, 1, 1, 4).setValues([['Cost item', 'Basis', 'Assumption', 'Est. impact']])
    .setFontWeight('bold').setBackground(LIGHT);
  r++;

  const cc = checkCount_(ctx);
  const wasted = cc['H-05'] + cc['H-06'] + cc['H-20'];
  const costTouch = wasted * num_(cfg, 'COST_PER_TOUCH', 3);
  const costDup = (ctx.dupExtra) * num_(cfg, 'COST_PER_RECORD_MONTH', 0.2) * 12;
  const costRisk = cc['H-07'] * num_(cfg, 'AVG_DEAL_SIZE', 5000) * num_(cfg, 'CLOSE_RATE', 0.1);
  const total = costTouch + costDup + costRisk;

  sh.getRange(r, 1, 1, 4).setValues([['Wasted outreach touches',
    '(' + cc['H-05'] + ' stale + ' + cc['H-06'] + ' never-activated + ' + cc['H-20'] + ' opted-out) × cost per touch',
    str_(cfg, 'CURRENCY', 'USD') + ' ' + num_(cfg, 'COST_PER_TOUCH', 3) + ' / touch', money(costTouch)]]);
  r++;
  sh.getRange(r, 1, 1, 4).setValues([['Duplicate record bloat',
    ctx.dupExtra + ' redundant records × seat / storage cost',
    str_(cfg, 'CURRENCY', 'USD') + ' ' + num_(cfg, 'COST_PER_RECORD_MONTH', 0.2) + ' / mo each', money(costDup)]]);
  r++;
  sh.getRange(r, 1, 1, 4).setValues([['Pipeline at risk',
    cc['H-07'] + ' abandoned MQL/SQL/OPP × avg deal × close rate',
    (num_(cfg, 'CLOSE_RATE', 0.1) * 100).toFixed(0) + '% close × ' + money(num_(cfg, 'AVG_DEAL_SIZE', 5000)), money(costRisk)]]);
  r++;
  sh.getRange(r, 1, 1, 4).setValues([['TOTAL', '', '', money(total)]]).setFontWeight('bold').setBackground(LIGHT);
  r += 2;

  /* ---- 4 · 30-day cleanup plan --------------------------------------- */
  sec_(sh, r++, '4 · 30-DAY CLEANUP PLAN');
  const autoN = ctx.dispositions.autoFixable;
  const plan = [
    ['Week 1 — Merge duplicates', ctx.clusters.length + ' clusters / ' + ctx.dupExtra + ' redundant records (H-01…H-04). Merge into the suggested primary; archive copies.'],
    ['Week 2 — Fix contact points', autoN + ' AUTO-FIXABLE reformats + ' + (cc['H-12'] + cc['H-13'] + cc['H-14'] - autoN >= 0 ? cc['H-12'] + cc['H-13'] + cc['H-14'] - autoN : 0) + ' REVIEW items (H-12…H-14). Validity first: emails, phones.'],
    ['Week 3 — Enrich missing data', (cc['H-08'] + cc['H-09'] + cc['H-10'] + cc['H-11']) + ' records missing key fields (H-08…H-11). Start with HIGH-severity missing emails.'],
    ['Week 4 — Archive & prevent', (cc['H-05'] + cc['H-06'] + cc['H-20']) + ' archive candidates + ' + (cc['H-16'] + cc['H-17'] + cc['H-18']) + ' process fixes (owners, stages, statuses).']
  ];
  plan.forEach(function (p) {
    sh.getRange(r, 1).setValue(p[0]).setFontWeight('bold');
    sh.getRange(r, 2).setValue(p[1]);
    r++;
  });
  const wC = num_(cfg, 'SCORE_WEIGHT_CRITICAL', 3), wM = num_(cfg, 'SCORE_WEIGHT_MEDIUM', 1);
  const projected = Math.max(0, Math.min(100, Math.round(100 -
    ((wC * ctx.totals.high * 0.3 + wM * ctx.totals.medium * 0.5) / Math.max(1, ctx.records)) * 100)));
  sh.getRange(r, 1).setValue('Projected score').setFontWeight('bold').setFontColor('#15803D');
  sh.getRange(r, 2).setValue('~' + projected + '/100 after the 30-day plan (70% of HIGH + 50% of MEDIUM resolved)').setFontColor('#15803D');
  r += 2;

  /* ---- 5 · Method & guarantees --------------------------------------- */
  sec_(sh, r++, '5 · METHOD & GUARANTEES');
  [
    'Read-only: this audit issued zero write calls to the CRM — verification in METHOD_LOG.',
    'Deterministic checks only (exact / normalized keys) — no fuzzy guessing in v1.',
    'Scoring: ' + ctx.score.formula + '  (weights editable in SETTINGS).',
    'Costs are directional estimates from SETTINGS assumptions — not accounting figures.',
    'Every number is reproducible: stage-by-stage run log in METHOD_LOG.'
  ].forEach(function (line) {
    sh.getRange(r, 1).setValue('•  ' + line);
    r++;
  });

  return ctx;
}

/** ---- render helpers -------------------------------------------------- */
function sec_(sh, r, text) {
  sh.getRange(r, 1, 1, 5).setBackground(DARK);
  sh.getRange(r, 1).setValue(text).setFontWeight('bold').setFontColor(WHITE).setFontSize(11);
}

function kv_(sh, r, label, value) {
  sh.getRange(r, 1).setValue(label).setFontWeight('bold');
  sh.getRange(r, 2).setValue(value);
}

function checkCount_(ctx) {
  const cc = {};
  PB4.CHECK_CATALOG.forEach(function (c) { cc[c.id] = ctx.checkCounts[c.id] || 0; });
  return cc;
}

function topCheckLabel_(catCounts) {
  let bestId = '', bestN = 0;
  const checks = catCounts.checks || {};
  Object.keys(checks).forEach(function (id) {
    if (checks[id] > bestN) { bestN = checks[id]; bestId = id; }
  });
  if (!bestId) return '—';
  const meta = PB4.CHECK_BY_ID[bestId];
  return bestId + ' · ' + (meta ? meta.title : '') + ' (' + bestN + ')';
}

/** ---- 1-page PDF ------------------------------------------------------- */
function exportOnePagePdf() {
  const ss = ss_();
  const gid = sheet_(PB4.SHEETS.SUMMARY).getSheetId();
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() +
    '/export?format=pdf&gid=' + gid +
    '&size=A4&portrait=true&fitw=true&gridlines=false&sheetnames=false';

  const blob = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  }).getBlob().setName('CRM-Health-Report-' + todayStr_() + '.pdf');

  const cfg = getSettings_();
  const folderName = str_(cfg, 'REPORT_FOLDER', 'PB4 Audit Reports');
  const it = DriveApp.getFoldersByName(folderName);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
  const file = folder.createFile(blob);

  logMsg_('REPORT', 'INFO', '1-page PDF exported', file.getUrl());
  ui_.alert('PB4 — 1-page report ready',
    'Saved to Drive folder "' + folderName + '":\n\n' + file.getUrl(), ui_.ButtonSet.OK);
  return file.getUrl();
}
