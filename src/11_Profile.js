/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 11 · PROFILE
 * ---------------------------------------------------------------------
 * Stage 2 of the pipeline: field-level statistics over RAW_DATA.
 * Answers "how bad is it, structurally?" — fill rates and distinct
 * values per field, written to the PROFILE tab and reused by SUMMARY.
 * ===================================================================== */

const PROFILE_FIELDS = [
  ['email',              'email',            'primary identity field'],
  ['phone',              'phone',            ''],
  ['mobilephone',        'mobilephone',      ''],
  ['company',            'company',          'B2B segmentation key'],
  ['jobtitle',           'jobtitle',         ''],
  ['website',            'website',          ''],
  ['lifecycle_stage',    'lifecycle',        'funnel position'],
  ['lead_status',        'lead_status',      'sales qualification'],
  ['owner_id',           'owner',            'accountability'],
  ['created_date',       'created',          ''],
  ['last_activity_date', 'last_activity',    'proxy = notes_last_updated'],
  ['city',               'city',             ''],
  ['country',            'country',          ''],
  ['industry',           'industry',         '']
];

/**
 * @param ctx {cfg, rows, records, ...} — mutated: ctx.profile set.
 */
function profileStep_(ctx) {
  const C = PB4.COLS_RAW;
  const out = [];

  PROFILE_FIELDS.forEach(function (f) {
    const label = f[0], colIdx = C[f[1]], note = f[2];
    let filled = 0;
    const distinct = {};
    ctx.rows.forEach(function (row) {
      let v = toStr_(row[colIdx]);
      if (label === 'email' && v) v = normEmail_(v);
      if (v) {
        filled++;
        distinct[v.toLowerCase()] = 1;
      }
    });
    out.push([
      label, filled, ctx.records - filled,
      fmtPct_(filled, ctx.records),
      Object.keys(distinct).length,
      note
    ]);
  });

  withLock_(function () {
    const sh = sheet_(PB4.SHEETS.PROFILE);
    clearBelow_(sh, 1);
    writeRows_(sh, 2, out, PB4.PROFILE_HEADERS.length, true);
  });

  // Expose the two fill rates that matter most to SUMMARY.
  const find = function (label) {
    for (let i = 0; i < out.length; i++) { if (out[i][0] === label) return out[i]; }
    return null;
  };
  const emailRow = find('email'), phoneRow = find('phone');
  ctx.profile = {
    emailFill: emailRow ? emailRow[3] : '—',
    phoneFill: phoneRow ? phoneRow[3] : '—',
    fields: out.length
  };

  logMsg_('PROFILE', 'INFO', 'Profiling complete', ctx.records + ' records, ' + out.length + ' fields profiled');
  return ctx.profile;
}
