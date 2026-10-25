/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 14 · DISPOSITION & SCORE
 * ---------------------------------------------------------------------
 * Dispositions are stamped at finding time (check catalog default,
 * optionally upgraded to AUTO-FIXABLE by the check itself). This file:
 *   1. finalizeCtx_()   — totals per category / severity / check id
 *   2. scoreStep_()     — the health score:
 *        score = 100 − (Wc × HIGH + Wm × MEDIUM) / records × 100
 *        Wc / Wm from SETTINGS (default 3 / 1), clamped to 0..100.
 * ===================================================================== */

/** Aggregate ctx.findings into counts; called once before writing. */
function finalizeCtx_(ctx) {
  const catCounts = {}, checkCounts = {};
  let high = 0, medium = 0, autoFixable = 0, review = 0, archive = 0;

  ctx.findings.forEach(function (f) {
    const F = PB4.COLS_FIND;
    const checkId = f[F.CHECK];
    const meta = PB4.CHECK_BY_ID[checkId] || { category: 'OTHER', severity: 'MEDIUM' };

    checkCounts[checkId] = (checkCounts[checkId] || 0) + 1;

    const cat = catCounts[meta.category] || (catCounts[meta.category] = { total: 0, high: 0, medium: 0, checks: {} });
    cat.total++;
    cat.checks[checkId] = (cat.checks[checkId] || 0) + 1;

    if (meta.severity === 'HIGH') { cat.high++; high++; } else { cat.medium++; medium++; }

    const disp = f[F.DISPOSITION];
    if (disp === 'AUTO-FIXABLE') autoFixable++;
    else if (disp === 'ARCHIVE-CANDIDATE') archive++;
    else review++;
  });

  ctx.catCounts = catCounts;
  ctx.checkCounts = checkCounts;
  ctx.totals = { high: high, medium: medium, all: ctx.findings.length };
  ctx.dispositions = { autoFixable: autoFixable, review: review, archive: archive };
  return ctx;
}

/** Compute + store the health score. */
function scoreStep_(ctx) {
  const wC = num_(ctx.cfg, 'SCORE_WEIGHT_CRITICAL', 3);
  const wM = num_(ctx.cfg, 'SCORE_WEIGHT_MEDIUM', 1);
  const records = Math.max(1, ctx.records);

  const raw = 100 - ((wC * ctx.totals.high + wM * ctx.totals.medium) / records) * 100;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const grade = gradeFor_(score);

  ctx.score = {
    score: score,
    grade: grade,
    high: ctx.totals.high,
    medium: ctx.totals.medium,
    records: ctx.records,
    formula: '100 − (' + wC + '×' + ctx.totals.high + ' + ' + wM + '×' + ctx.totals.medium + ') / ' + ctx.records + ' × 100'
  };

  try {
    PropertiesService.getScriptProperties().setProperty('PB4_LAST_SCORE', JSON.stringify(ctx.score));
  } catch (e) { /* non-fatal */ }

  logMsg_('SCORE', 'INFO', 'Health score: ' + score + '/100 (' + grade + ')', ctx.score.formula);
  return ctx.score;
}

function gradeFor_(s) {
  if (s >= 90) return 'EXCELLENT';
  if (s >= 75) return 'HEALTHY';
  if (s >= 50) return 'AT RISK';
  return 'CRITICAL';
}

function bandColor_(score) {
  if (score >= 75) return '#15803D';   // green
  if (score >= 50) return '#D97706';   // amber
  return '#DC2626';                    // red
}
