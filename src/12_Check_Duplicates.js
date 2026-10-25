/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 12 · CHECK CLASS A — DUPLICATES
 * ---------------------------------------------------------------------
 * H-01 Exact duplicate email (normalized)
 * H-02 Gmail-equivalent email (dots / +tag ignored)
 * H-03 Phone fingerprint (last 8 digits of E.164)
 * H-04 Same first name + last name + company
 *
 * v1 policy: DETERMINISTIC KEYS ONLY — no fuzzy matching.
 * Anti double-count rule: H-02/03/04 skip clusters where every member
 * shares one identical email (already covered by H-01).
 * Merging is human work: we only SUGGEST the primary record (oldest
 * created + most complete); nothing is merged, moved or deleted.
 * ===================================================================== */

function checkDuplicates_(ctx) {
  const C = PB4.COLS_RAW;
  const rows = ctx.rows;
  const exact = {}, gmail = {}, phone = {}, nameco = {};

  rows.forEach(function (row, i) {
    const email = normEmail_(toStr_(row[C.EMAIL]));
    if (email) (exact[email] = exact[email] || []).push(i);

    const gk = gmailKey_(email);
    if (gk) (gmail[gk] = gmail[gk] || []).push(i);

    const rawPh = toStr_(row[C.PHONE]) || toStr_(row[C.MOBILE]);
    if (rawPh) {
      const p = normalizePhone_(rawPh, ctx.defaultCc);
      if (p.status === 'OK') (phone[p.fingerprint] = phone[p.fingerprint] || []).push(i);
    }

    const f = toStr_(row[C.FIRST]).toLowerCase();
    const l = toStr_(row[C.LAST]).toLowerCase();
    const co = toStr_(row[C.COMPANY]).toLowerCase();
    if (f && l && co) (nameco[f + '|' + l + '|' + co] = nameco[f + '|' + l + '|' + co] || []).push(i);
  });

  emitClusters_(ctx, exact,  'H-01', 'EMAIL_EXACT',
    function (i) { return normEmail_(toStr_(rows[i][C.EMAIL])); }, null);

  emitClusters_(ctx, gmail,  'H-02', 'EMAIL_GMAIL',
    function (i) { return normEmail_(toStr_(rows[i][C.EMAIL])); }, distinctEmailRepsFilter_(rows));

  emitClusters_(ctx, phone,  'H-03', 'PHONE_FINGERPRINT',
    function (i) { return toStr_(rows[i][C.PHONE]) || toStr_(rows[i][C.MOBILE]); },
    distinctEmailCountFilter_(rows));

  emitClusters_(ctx, nameco, 'H-04', 'NAME_COMPANY',
    function (i) {
      return toStr_(rows[i][C.FIRST]) + ' ' + toStr_(rows[i][C.LAST]) + ' @ ' + toStr_(rows[i][C.COMPANY]);
    }, distinctEmailCountFilter_(rows));

  logMsg_('CHECK', 'INFO', 'Duplicate checks done (H-01..H-04)',
    ctx.clusters.length + ' clusters, ' + ctx.dupExtra + ' redundant records');
}

/**
 * Turn a key->rowIndexes map into DUPLICATE_CLUSTERS rows + findings.
 * @param valueOf  fn(rowIdx) -> the matched value (shown in FINDINGS)
 * @param filterFn optional fn(idxs) -> filtered idxs (or null to skip)
 */
function emitClusters_(ctx, map, checkId, typeName, valueOf, filterFn) {
  const rows = ctx.rows;
  const REASONS = {
    'H-01': 'Identical email (normalized) already belongs to another record',
    'H-02': 'Gmail-equivalent address of another record (dots / +tag ignored)',
    'H-03': 'Phone fingerprint (last 8 digits of E.164) matches another record',
    'H-04': 'Same first name + last name + company as another record'
  };

  Object.keys(map).forEach(function (key) {
    let idxs = map[key];
    if (!idxs || idxs.length < 2) return;
    if (filterFn) {
      idxs = filterFn(idxs);
      if (!idxs || idxs.length < 2) return;
    }

    const keep = pickKeep_(rows, idxs);
    const cid = 'DUP-' + ('0000' + (ctx.clusters.length + 1)).slice(-4);

    const ids = idxs.map(function (i) { return toStr_(rows[i][PB4.COLS_RAW.RECORD_ID]); });
    const emails = uniq_(idxs.map(function (i) { return normEmail_(toStr_(rows[i][PB4.COLS_RAW.EMAIL])); })).join(' | ');
    const phones = uniq_(idxs.map(function (i) { return toStr_(rows[i][PB4.COLS_RAW.PHONE]) || toStr_(rows[i][PB4.COLS_RAW.MOBILE]); })).join(' | ');

    ctx.clusters.push([
      cid, typeName, idxs.length, ids.join(' | '), emails, phones,
      ids[keep.pos],
      'Merge into ' + ids[keep.pos] + ' (oldest + most complete); archive the merged copies — never delete'
    ]);

    idxs.forEach(function (i) {
      if (i === keep.idx) return;
      addFinding_(ctx, {
        check: checkId,
        record: ids[i],
        name: recName_(rows[i]),
        field: typeName.indexOf('EMAIL') === 0 ? 'email'
             : (typeName.indexOf('PHONE') === 0 ? 'phone' : 'name+company'),
        value: trunc_(valueOf(i), 100),
        reason: REASONS[checkId],
        fix: 'Merge into ' + ids[keep.pos],
        cluster: cid
      });
    });

    ctx.dupExtra += idxs.length - 1;
  });
}

/** One representative per distinct exact email; needs >=2 to cluster. */
function distinctEmailRepsFilter_(rows) {
  return function (idxs) {
    const seen = {}, out = [];
    idxs.forEach(function (i) {
      const e = normEmail_(toStr_(rows[i][PB4.COLS_RAW.EMAIL]));
      if (e && !seen[e]) { seen[e] = 1; out.push(i); }
    });
    return out.length >= 2 ? out : null;
  };
}

/** Keep all members but require >=2 distinct emails (else H-01 covers it). */
function distinctEmailCountFilter_(rows) {
  return function (idxs) {
    const seen = {};
    idxs.forEach(function (i) {
      const e = normEmail_(toStr_(rows[i][PB4.COLS_RAW.EMAIL]));
      if (e) seen[e] = 1;
    });
    return Object.keys(seen).length >= 2 ? idxs : null;
  };
}

/** Primary candidate: oldest created, then most complete, then first. */
function pickKeep_(rows, idxs) {
  let best = null;
  idxs.forEach(function (i, pos) {
    const created = toStr_(rows[i][PB4.COLS_RAW.CREATED]) || '9999-12-31';
    const filled = countFilled_(rows[i]);
    if (!best || created < best.created || (created === best.created && filled > best.filled)) {
      best = { idx: i, pos: pos, created: created, filled: filled };
    }
  });
  return best;
}
