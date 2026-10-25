/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 05 · MENU
 * ---------------------------------------------------------------------
 * Adds the "🩺 CRM Health Audit" menu. Numbered items follow the
 * operational order: install -> data in -> audit -> report.
 * ===================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🩺 CRM Health Audit')
    .addItem('① Install / repair workbook', 'installWorkbook')
    .addItem('② Seed demo data (~1,250 rows)', 'seedDemoData')
    .addSeparator()
    .addItem('③ PULL from HubSpot (Portal mode)', 'pullFromHubspot')
    .addItem('④ PULL from CSV file…', 'importCsvFile')
    .addSeparator()
    .addItem('⑤ RUN FULL AUDIT — HubSpot pull + audit', 'runFullAuditPortal')
    .addItem('⑥ RUN FULL AUDIT — current data (CSV / demo)', 'runFullAuditRaw')
    .addSeparator()
    .addItem('⑦ Export 1-page PDF report', 'exportOnePagePdf')
    .addItem('⑧ Help / method notes', 'showHelp')
    .addToUi();
}

function showHelp() {
  ui_.alert(
    'PB4 — CRM Health Audit ' + PB4.VERSION,
    [
      'READ-ONLY AUDIT: pulls contacts, finds defects, scores health,',
      'builds a 1-page report + 30-day plan. Never modifies or deletes',
      'a single record in your CRM — all findings land in this workbook.',
      '',
      'QUICK START (no HubSpot needed):',
      '  ① Install workbook → ② Seed demo data → ⑥ Run full audit → ⑦ PDF',
      '',
      'PORTAL MODE (HubSpot):',
      '  Apps Script > Project Settings > Script Properties >',
      '  add HUBSPOT_TOKEN = <Private App token, scope crm.objects.contacts.read>',
      '  then ③ Pull → ⑥ Run full audit (or ⑤ one click).',
      '',
      'CSV MODE (any CRM: Pipedrive / Salesforce / Zoho / HubSpot export):',
      '  ④ Import CSV → ⑥ Run full audit.',
      '',
      'SCORING: 100 − (3×HIGH + 1×MEDIUM) / records × 100',
      '  thresholds & cost assumptions are editable on the SETTINGS tab.',
      '',
      'Checks H-01…H-20: duplicates · stale · completeness · validity ·',
      'process. Deterministic keys only — no fuzzy guessing in v1.'
    ].join('\n'),
    ui_.ButtonSet.OK
  );
}
