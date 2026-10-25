/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 00 · SETTINGS & CONSTANTS
 * ---------------------------------------------------------------------
 * Central configuration: sheet names, column maps, defaults and the
 * check catalog (H-01 ... H-20). No other file hard-codes these —
 * every stage reads them from here.
 *
 * GOLDEN RULE: this is a READ-ONLY audit. It never modifies or deletes
 * a single record in the source CRM. It only writes to this workbook.
 * ===================================================================== */

const PB4 = {};

PB4.VERSION = 'v1.0.0';

/** ---- Sheet (tab) names --------------------------------------------- */
PB4.SHEETS = {
  SUMMARY:  'SUMMARY',
  FINDINGS: 'FINDINGS',
  DUPES:    'DUPLICATE_CLUSTERS',
  STALE:    'STALE_LIST',
  RAW:      'RAW_DATA',
  PROFILE:  'PROFILE',
  METHOD:   'METHOD_LOG',
  SETTINGS: 'SETTINGS'
};

/** ---- RAW_DATA canonical columns (0-based) --------------------------
 * One canonical contact schema for every input mode (PORTAL / CSV /
 * DEMO). Checks are source-agnostic and only ever read this shape.
 */
PB4.COLS_RAW = {
  RECORD_ID: 0,  MODE: 1,
  FIRST: 2,      LAST: 3,     EMAIL: 4,    PHONE: 5,     MOBILE: 6,
  COMPANY: 7,    TITLE: 8,    WEBSITE: 9,
  LIFECYCLE: 10, LEAD_STATUS: 11, OWNER: 12,
  CREATED: 13,   LASTMOD: 14, LAST_ACT: 15, OPTOUT: 16,
  CITY: 17,      STATE: 18,   COUNTRY: 19, INDUSTRY: 20,
  INGESTED: 21
};

PB4.RAW_HEADERS = [
  'record_id', 'source_mode', 'firstname', 'lastname', 'email', 'phone',
  'mobilephone', 'company', 'jobtitle', 'website', 'lifecycle_stage',
  'lead_status', 'owner_id', 'created_date', 'lastmodified_date',
  'last_activity_date', 'email_optout', 'city', 'state', 'country',
  'industry', 'ingested_at'
];

/** HubSpot properties whitelist (~20) pulled in Portal mode. */
PB4.HUBSPOT_PROPS = [
  'firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company',
  'jobtitle', 'website', 'lifecycle_stage', 'hs_lead_status',
  'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate',
  'notes_last_updated', 'hs_email_optout', 'city', 'state', 'country',
  'industry'
];

/** ---- FINDINGS columns ---------------------------------------------- */
PB4.COLS_FIND = {
  ID: 0, CHECK: 1, CATEGORY: 2, SEVERITY: 3, DISPOSITION: 4, RECORD: 5,
  NAME: 6, FIELD: 7, VALUE: 8, REASON: 9, FIX: 10, CLUSTER: 11
};
PB4.FINDINGS_HEADERS = [
  'finding_id', 'check_id', 'category', 'severity', 'disposition',
  'record_id', 'record_name', 'field', 'value_found', 'reason',
  'suggested_fix', 'cluster_id'
];

/** ---- DUPLICATE_CLUSTERS columns ------------------------------------ */
PB4.COLS_DUP = {
  ID: 0, TYPE: 1, COUNT: 2, RECORDS: 3, EMAILS: 4, PHONES: 5,
  KEEP: 6, ACTION: 7
};
PB4.DUPES_HEADERS = [
  'cluster_id', 'match_type', 'members', 'record_ids', 'emails', 'phones',
  'suggested_primary', 'suggested_action'
];

/** ---- STALE_LIST columns -------------------------------------------- */
PB4.COLS_STALE = {
  RECORD: 0, NAME: 1, EMAIL: 2, COMPANY: 3, STAGE: 4, CREATED: 5,
  LAST_ACT: 6, DAYS_IDLE: 7, STALE_TYPE: 8, ACTION: 9
};
PB4.STALE_HEADERS = [
  'record_id', 'name', 'email', 'company', 'lifecycle_stage',
  'created_date', 'last_activity_date', 'days_idle', 'stale_type',
  'suggested_action'
];

/** ---- PROFILE columns ------------------------------------------------ */
PB4.COLS_PROF = { FIELD: 0, FILLED: 1, EMPTY: 2, FILL_RATE: 3, DISTINCT: 4, NOTES: 5 };
PB4.PROFILE_HEADERS = ['field', 'filled', 'empty', 'fill_rate', 'distinct', 'notes'];

/** ---- METHOD_LOG columns -------------------------------------------- */
PB4.COLS_LOG = { TS: 0, STAGE: 1, LEVEL: 2, MESSAGE: 3, DETAIL: 4 };
PB4.METHOD_HEADERS = ['timestamp', 'stage', 'level', 'message', 'detail'];

/** ---- SETTINGS tab defaults (key/value, user-editable) -------------- */
PB4.SETTINGS_DEFAULTS = [
  ['STALE_DAYS',             '90'],
  ['NEVER_ACTIVATED_DAYS',   '30'],
  ['MQL_STUCK_DAYS',         '60'],
  ['SCORE_WEIGHT_CRITICAL',  '3'],
  ['SCORE_WEIGHT_MEDIUM',    '1'],
  ['AVG_DEAL_SIZE',          '5000'],
  ['CLOSE_RATE',             '0.10'],
  ['COST_PER_TOUCH',         '3'],
  ['COST_PER_RECORD_MONTH',  '0.20'],
  ['CURRENCY',               'USD'],
  ['DEFAULT_COUNTRY_CODE',   '212'],
  ['MAX_PULL_RECORDS',       '5000'],
  ['PULL_TIME_BUDGET_MIN',   '4.5'],
  ['REPORT_FOLDER',          'PB4 Audit Reports'],
  ['DISPOSABLE_DOMAINS',     'mailinator.com,temp-mail.org,10minutemail.com,guerrillamail.com,yopmail.com,trashmail.com,sharklasers.com,getnada.com,maildrop.cc,dispostable.com,fakeinbox.com,throwawaymail.com,tempmail.net'],
  ['ROLE_EMAIL_PREFIXES',    'info,sales,support,contact,admin,hello,office,billing,careers,jobs,marketing,noreply,no-reply,enquiries,business']
];

/** ---- Check catalog H-01 ... H-20 -----------------------------------
 * severity:     HIGH (3 pts) | MEDIUM (1 pt)
 * disposition:  AUTO-FIXABLE (deterministic fix exists) | REVIEW (human
 *               decides) | ARCHIVE-CANDIDATE (dead data, propose archive)
 * The catalog holds the DEFAULTS; a check may upgrade a finding to
 * AUTO-FIXABLE when it can compute the exact fix.
 */
PB4.CHECK_CATALOG = [
  // A · Duplicates
  { id: 'H-01', category: 'DUPLICATE',    severity: 'HIGH',   disposition: 'REVIEW',            title: 'Exact duplicate email' },
  { id: 'H-02', category: 'DUPLICATE',    severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Gmail-equivalent duplicate email' },
  { id: 'H-03', category: 'DUPLICATE',    severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Duplicate phone fingerprint' },
  { id: 'H-04', category: 'DUPLICATE',    severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Same name + company' },
  // B · Stale
  { id: 'H-05', category: 'STALE',        severity: 'MEDIUM', disposition: 'ARCHIVE-CANDIDATE', title: 'No activity for more than STALE_DAYS' },
  { id: 'H-06', category: 'STALE',        severity: 'MEDIUM', disposition: 'ARCHIVE-CANDIDATE', title: 'Never activated since creation' },
  { id: 'H-07', category: 'STALE',        severity: 'HIGH',   disposition: 'REVIEW',            title: 'Abandoned MQL/SQL/Opportunity' },
  // C · Completeness
  { id: 'H-08', category: 'COMPLETENESS', severity: 'HIGH',   disposition: 'REVIEW',            title: 'Missing email' },
  { id: 'H-09', category: 'COMPLETENESS', severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Missing phone (and mobile)' },
  { id: 'H-10', category: 'COMPLETENESS', severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Missing company' },
  { id: 'H-11', category: 'COMPLETENESS', severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Incomplete name' },
  // D · Validity
  { id: 'H-12', category: 'VALIDITY',     severity: 'HIGH',   disposition: 'REVIEW',            title: 'Invalid email format' },
  { id: 'H-13', category: 'VALIDITY',     severity: 'HIGH',   disposition: 'REVIEW',            title: 'Disposable email domain' },
  { id: 'H-14', category: 'VALIDITY',     severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Phone invalid or non-E.164 format' },
  { id: 'H-15', category: 'VALIDITY',     severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Junk name / placeholder text' },
  { id: 'H-19', category: 'VALIDITY',     severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Role-based email address' },
  // E · Process
  { id: 'H-16', category: 'PROCESS',      severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Customer without qualified lead status' },
  { id: 'H-17', category: 'PROCESS',      severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Active lead without owner' },
  { id: 'H-18', category: 'PROCESS',      severity: 'MEDIUM', disposition: 'REVIEW',            title: 'Missing lifecycle stage' },
  { id: 'H-20', category: 'PROCESS',      severity: 'HIGH',   disposition: 'ARCHIVE-CANDIDATE', title: 'Opted-out contact still in active pipeline' }
];

PB4.CHECK_BY_ID = {};
PB4.CHECK_CATALOG.forEach(function (c) { PB4.CHECK_BY_ID[c.id] = c; });

PB4.CATEGORIES = [
  { key: 'DUPLICATE',    label: 'A · Duplicates' },
  { key: 'STALE',        label: 'B · Stale & dead records' },
  { key: 'COMPLETENESS', label: 'C · Missing data' },
  { key: 'VALIDITY',     label: 'D · Invalid data' },
  { key: 'PROCESS',      label: 'E · Process gaps' }
];

/** ---- Domain enums -------------------------------------------------- */
PB4.LIFECYCLE_ACTIVE = ['lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity'];
PB4.LIFECYCLE_SALES  = ['marketingqualifiedlead', 'salesqualifiedlead', 'opportunity'];
PB4.LEAD_STATUS_OPEN = ['NEW', 'OPEN', 'IN_PROGRESS'];

PB4.LIFECYCLE_ALIASES = {
  lead: 'lead', l: 'lead',
  mql: 'marketingqualifiedlead', marketingqualified: 'marketingqualifiedlead', marketingqualifiedlead: 'marketingqualifiedlead',
  sql: 'salesqualifiedlead', salesqualified: 'salesqualifiedlead', salesqualifiedlead: 'salesqualifiedlead',
  opp: 'opportunity', opportunity: 'opportunity',
  customer: 'customer', client: 'customer',
  subscriber: 'subscriber', evangelist: 'evangelist', other: 'other'
};

PB4.EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
