/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 13 · CHECK CLASSES B / C / D / E
 * ---------------------------------------------------------------------
 * One deterministic pass over every RAW row:
 *   B · Stale        H-05 no activity > STALE_DAYS
 *                    H-06 never activated (created > NEVER_ACTIVATED_DAYS)
 *                    H-07 abandoned MQL/SQL/Opportunity (> MQL_STUCK_DAYS)
 *   C · Completeness H-08 email  H-09 phone  H-10 company  H-11 name
 *   D · Validity     H-12 email regex   H-13 disposable domain
 *                    H-14 phone invalid / non-E.164 (AUTO-FIXABLE when
 *                        the number is sound — fix = reformat)
 *                    H-15 junk name     H-19 role-based email
 *   E · Process      H-16 customer w/o qualified status
 *                    H-17 active lead w/o owner
 *                    H-18 missing lifecycle stage
 *                    H-20 opted-out still in active pipeline
 * H-05/06/07 findings also feed the STALE_LIST working sheet.
 * ===================================================================== */

function checkRowlevel_(ctx) {
  const C = PB4.COLS_RAW;
  const cfg = ctx.cfg;
  const staleDays   = num_(cfg, 'STALE_DAYS', 90);
  const neverDays   = num_(cfg, 'NEVER_ACTIVATED_DAYS', 30);
  const mqlDays     = num_(cfg, 'MQL_STUCK_DAYS', 60);
  const defaultCc   = ctx.defaultCc;
  const disposable  = setFromCsv_(cfg, 'DISPOSABLE_DOMAINS');
  const roleSet     = setFromCsv_(cfg, 'ROLE_EMAIL_PREFIXES');

  ctx.rows.forEach(function (row) {
    const id      = toStr_(row[C.RECORD_ID]);
    const first   = toStr_(row[C.FIRST]);
    const last    = toStr_(row[C.LAST]);
    const email   = toStr_(row[C.EMAIL]);
    const phone   = toStr_(row[C.PHONE]);
    const mobile  = toStr_(row[C.MOBILE]);
    const company = toStr_(row[C.COMPANY]);
    const owner   = toStr_(row[C.OWNER]);
    const status  = toStr_(row[C.LEAD_STATUS]).toUpperCase();
    const optout  = toStr_(row[C.OPTOUT]).toLowerCase();
    const lc      = normalizeLifecycle_(row[C.LIFECYCLE]);
    const name    = recName_(row);

    const actDays      = daysSince_(row[C.LAST_ACT]);
    const createdDays  = daysSince_(row[C.CREATED]);

    /* ---- C · Completeness ---------------------------------------- */
    if (!email) {
      addFinding_(ctx, { check: 'H-08', record: id, name: name, field: 'email',
        reason: 'No email address on record', fix: 'Enrich from source form / enrichment provider' });
    }
    if (!phone && !mobile) {
      addFinding_(ctx, { check: 'H-09', record: id, name: name, field: 'phone',
        reason: 'No phone and no mobile number on record', fix: 'Enrich from source form / enrichment provider' });
    }
    if (!company) {
      addFinding_(ctx, { check: 'H-10', record: id, name: name, field: 'company',
        reason: 'No company name (weakens B2B segmentation)', fix: 'Enrich from email domain / LinkedIn' });
    }
    if (!first || !last) {
      addFinding_(ctx, { check: 'H-11', record: id, name: name, field: 'name',
        value: (first + ' ' + last).trim(),
        reason: 'Missing ' + (!first && !last ? 'first and last name' : (!first ? 'first name' : 'last name')),
        fix: 'Split or complete the name field' });
    }

    /* ---- D · Validity ---------------------------------------------- */
    if (email) {
      const e = normEmail_(email);
      if (!PB4.EMAIL_RE.test(e)) {
        addFinding_(ctx, { check: 'H-12', record: id, name: name, field: 'email', value: trunc_(email, 100),
          reason: 'Fails email format validation (RFC-style regex)', fix: 'Verify or correct the address; otherwise mark unreachable' });
      } else {
        const domain = e.slice(e.lastIndexOf('@') + 1);
        const local = e.slice(0, e.lastIndexOf('@'));
        if (disposable[domain]) {
          addFinding_(ctx, { check: 'H-13', record: id, name: name, field: 'email', value: trunc_(email, 100),
            reason: 'Disposable/temporary email domain: ' + domain,
            fix: 'Request a business email; treat as low-deliverability' });
        } else if (roleSet[local.split(/[._\-]/)[0]]) {
          addFinding_(ctx, { check: 'H-19', record: id, name: name, field: 'email', value: trunc_(email, 100),
            reason: 'Role-based inbox (info@/sales@/…) — not a person',
            fix: 'Find a direct contact; role inboxes hurt deliverability' });
        }
      }
    }

    [ ['phone', phone], ['mobilephone', mobile] ].forEach(function (pair) {
      const field = pair[0], raw = pair[1];
      if (!raw) return;
      const p = normalizePhone_(raw, defaultCc);
      if (p.status === 'INVALID') {
        addFinding_(ctx, { check: 'H-14', record: id, name: name, field: field, value: trunc_(raw, 60),
          reason: 'Not a dialable number: ' + p.reason,
          fix: 'Correct or remove the number' });
      } else if (raw.trim() !== p.e164) {
        addFinding_(ctx, { check: 'H-14', record: id, name: name, field: field, value: trunc_(raw, 60),
          disp: 'AUTO-FIXABLE',
          reason: 'Valid number, non-E.164 formatting',
          fix: 'Reformat to ' + p.e164 });
      }
    });

    if (isJunkName_(first) || isJunkName_(last)) {
      addFinding_(ctx, { check: 'H-15', record: id, name: name, field: 'name',
        value: trunc_((first + ' ' + last).trim(), 60),
        reason: 'Placeholder / junk text in a name field',
        fix: 'Fix the real name or archive the record' });
    }

    /* ---- B · Staleness ---------------------------------------------- */
    if (actDays >= 0 && actDays > staleDays) {
      addFinding_(ctx, { check: 'H-05', record: id, name: name, field: 'last_activity_date',
        value: toStr_(row[C.LAST_ACT]),
        reason: 'No engagement for ' + actDays + ' days (threshold ' + staleDays + ')',
        fix: 'Archive candidate — no engagement in ' + actDays + ' days' });
      ctx.stale.push([id, name, email, company, lc, toStr_(row[C.CREATED]),
        toStr_(row[C.LAST_ACT]), actDays, 'STALE >' + staleDays + 'd',
        'Re-engage once, then archive']);
    } else if (actDays === -1 && createdDays > neverDays) {
      addFinding_(ctx, { check: 'H-06', record: id, name: name, field: 'last_activity_date',
        value: '',
        reason: 'Never activated: created ' + createdDays + ' days ago, zero activity ever',
        fix: 'Archive or hand to a re-engagement campaign' });
      ctx.stale.push([id, name, email, company, lc, toStr_(row[C.CREATED]),
        '', createdDays, 'NEVER ACTIVATED', 'One re-engagement touch, then archive']);
    }

    if (PB4.LIFECYCLE_SALES.indexOf(lc) >= 0 && actDays > mqlDays) {
      addFinding_(ctx, { check: 'H-07', record: id, name: name, field: 'last_activity_date',
        value: toStr_(row[C.LAST_ACT]),
        reason: lc.toUpperCase() + ' idle for ' + actDays + ' days — pipeline decay (threshold ' + mqlDays + ')',
        fix: 'Sales review: revive with a dated next step or recycle to nurture' });
      ctx.stale.push([id, name, email, company, lc, toStr_(row[C.CREATED]),
        toStr_(row[C.LAST_ACT]), actDays, 'ABANDONED ' + lc.toUpperCase(),
        'Sales review — revive or recycle']);
    }

    /* ---- E · Process -------------------------------------------------- */
    if (lc === 'customer' && (status === '' || PB4.LEAD_STATUS_OPEN.indexOf(status) >= 0)) {
      addFinding_(ctx, { check: 'H-16', record: id, name: name, field: 'lead_status',
        value: status || '(empty)',
        reason: 'Lifecycle says customer but lead status says ' + (status || 'nothing') + ' — process gap',
        fix: 'Set a qualified status; customers are past qualification' });
    }
    if (PB4.LIFECYCLE_ACTIVE.indexOf(lc) >= 0 && !owner) {
      addFinding_(ctx, { check: 'H-17', record: id, name: name, field: 'owner_id',
        reason: 'Active pipeline contact (' + lc + ') with no owner — nobody is accountable',
        fix: 'Assign an owner' });
    }
    if (!lc) {
      addFinding_(ctx, { check: 'H-18', record: id, name: name, field: 'lifecycle_stage',
        reason: 'Lifecycle stage never set — contact floats outside the funnel',
        fix: 'Set lifecycle stage (import default: lead)' });
    }
    if (optout === 'true' && PB4.LIFECYCLE_ACTIVE.indexOf(lc) >= 0) {
      addFinding_(ctx, { check: 'H-20', record: id, name: name, field: 'email_optout',
        value: 'opted out',
        reason: 'Opted out of email but still staged in the active pipeline (' + lc + ')',
        fix: 'Remove from all sequences now; archive after grace period' });
      ctx.stale.push([id, name, email, company, lc, toStr_(row[C.CREATED]),
        toStr_(row[C.LAST_ACT]), actDays >= 0 ? actDays : '', 'OPTED-OUT & ACTIVE',
        'Suppress immediately — compliance risk']);
    }
  });

  logMsg_('CHECK', 'INFO', 'Row-level checks done (B/C/D/E)',
    ctx.stale.length + ' stale-list rows');
}

/** Junk / placeholder detector for name fields. */
function isJunkName_(v) {
  const s = toStr_(v).toLowerCase();
  if (!s) return false;
  if (s.replace(/[^a-z]/g, '').length < 2) return true;      // 'x', '123', 'j'
  if (/\d/.test(s)) return true;                              // 'john123'
  if (/http|www\.|\.com|@/.test(s)) return true;              // urls in names
  if (/(.)\1{3,}/.test(s)) return true;                       // 'aaaa'
  if (/^(test|toto|asdf|asdfg|qwerty|demo|sample|xxx|zzz|n\/a|na|none|null|unknown|lastname|firstname|fname|lname)$/.test(s)) return true;
  return false;
}
