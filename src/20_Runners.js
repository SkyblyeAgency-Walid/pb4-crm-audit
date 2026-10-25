/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 20 · PIPELINE RUNNERS
 * ---------------------------------------------------------------------
 * Orchestrates: PROFILE -> CHECK -> DISPOSE -> SCORE -> REPORT.
 * Every public runner is try/catch-wrapped so the user always gets a
 * readable message, and every failure is logged to METHOD_LOG.
 * ===================================================================== */

/** Menu ⑤ — pull from HubSpot, then audit the fresh pull. */
function runFullAuditPortal() {
  try {
    const cfg = getSettings_();
    pullFromHubspot();                    // locks + writes RAW + logs
    finishAudit_(cfg, 'PORTAL');
  } catch (e) {
    fail_('RUN FULL AUDIT (Portal)', e);
  }
}

/** Menu ⑥ — audit whatever RAW_DATA currently holds (CSV / demo). */
function runFullAuditRaw() {
  try {
    finishAudit_(getSettings_(), 'current RAW data');
  } catch (e) {
    fail_('RUN FULL AUDIT (current data)', e);
  }
}

/** Core pipeline on existing RAW rows. Each stage locks itself. */
function finishAudit_(cfg, sourceLabel) {
  const t0 = Date.now();
  logMsg_('AUDIT', 'INFO', 'Full audit started', 'source: ' + sourceLabel);

  const rows = requireRawData_();
  const ctx = {
    cfg: cfg,
    rows: rows,
    records: rows.length,
    defaultCc: num_(cfg, 'DEFAULT_COUNTRY_CODE', 212),
    findings: [], clusters: [], stale: [], dupExtra: 0
  };

  profileStep_(ctx);                      // writes PROFILE (own lock)
  runChecksAll_(ctx);                     // writes FINDINGS / DUPES / STALE (own lock)
  scoreStep_(ctx);                        // computes + stores score
  reportStep_(ctx);                       // renders SUMMARY (own lock)

  logMsg_('AUDIT', 'INFO', 'Full audit finished',
    'score ' + ctx.score.score + '/100 (' + ctx.score.grade + '), ' +
    ctx.totals.all + ' findings, ' + Math.round((Date.now() - t0) / 1000) + 's');
  try {
    ui_.alert('PB4 — Audit complete',
      'Health score: ' + ctx.score.score + '/100 (' + ctx.score.grade + ')\n' +
      ctx.totals.all + ' findings (' + ctx.totals.high + ' HIGH / ' + ctx.totals.medium + ' MEDIUM)\n' +
      ctx.clusters.length + ' duplicate clusters\n\n' +
      'See SUMMARY for the full report and 30-day plan.\n' +
      'Use ⑦ to export the 1-page PDF.', ui_.ButtonSet.OK);
  } catch (e) { /* headless */ }
  return ctx;
}

/**
 * CHECK stage shared by every runner (also callable on its own).
 * Clears + repopulates FINDINGS, DUPLICATE_CLUSTERS and STALE_LIST.
 */
function runChecksAll_(ctx) {
  return withLock_(function () {
    clearBelow_(sheet_(PB4.SHEETS.FINDINGS), 1);
    clearBelow_(sheet_(PB4.SHEETS.DUPES), 1);
    clearBelow_(sheet_(PB4.SHEETS.STALE), 1);

    checkDuplicates_(ctx);   // class A
    checkRowlevel_(ctx);     // classes B / C / D / E
    finalizeCtx_(ctx);       // totals for score + report

    // Assign stable finding ids, then write the three output sheets.
    ctx.findings.forEach(function (f, i) {
      f[PB4.COLS_FIND.ID] = 'F-' + ('000000' + (i + 1)).slice(-6);
    });
    writeRows_(sheet_(PB4.SHEETS.FINDINGS), 2, ctx.findings, PB4.FINDINGS_HEADERS.length, true);
    writeRows_(sheet_(PB4.SHEETS.DUPES),    2, ctx.clusters, PB4.DUPES_HEADERS.length, true);
    writeRows_(sheet_(PB4.SHEETS.STALE),    2, ctx.stale,    PB4.STALE_HEADERS.length, true);

    logMsg_('CHECK', 'INFO', 'All checks complete',
      ctx.totals.all + ' findings (' + ctx.totals.high + ' HIGH / ' + ctx.totals.medium +
      ' MEDIUM) across ' + ctx.records + ' records');
    return ctx;
  });
}

/** Uniform error surface: alert + METHOD_LOG, rethrow for the log. */
function fail_(stage, e) {
  const msg = (e && e.message) ? e.message : String(e);
  logMsg_(stage, 'ERROR', 'Run failed', msg.slice(0, 400));
  try {
    ui_.alert('PB4 — ' + stage + ' failed', msg, ui_.ButtonSet.OK);
  } catch (e2) { /* headless */ }
  throw e;
}
