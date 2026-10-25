/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 10 · PULL (INGEST)
 * ---------------------------------------------------------------------
 * Two input modes, ONE canonical destination (RAW_DATA):
 *   Portal mode — HubSpot API read-only pull (paged, 429-safe)
 *   CSV mode    — customer's own export (Pipedrive/Salesforce/Zoho/…)
 * RAW_DATA is immutable DURING a run; a new pull replaces it in full
 * and the previous contents live on in Drive revision history.
 * ===================================================================== */

/** ---- Portal mode ----------------------------------------------------- */
function pullFromHubspot() {
  return withLock_(function () {
    const cfg = getSettings_();
    logMsg_('PULL', 'INFO', 'Portal pull started', 'max=' + num_(cfg, 'MAX_PULL_RECORDS', 5000) + ' records');
    const ingested = nowIso_();
    const rows = [];

    const res = pullAllContacts_(function (contacts) {
      contacts.forEach(function (c) { rows.push(portalRow_(c, 'PORTAL', ingested)); });
    }, cfg);

    const n = writeRawAll_(rows);
    rememberPull_('PORTAL', n, ingested);
    logMsg_('PULL', 'INFO', 'Portal pull finished', res.pulled + ' contacts, ' + res.pages + ' pages, stopped: ' + res.stopped);

    try {
      ui_.alert('PB4 — Portal pull', n + ' contacts pulled from HubSpot (' + res.stopped + ').\n\nNow run ⑥ RUN FULL AUDIT.', ui_.ButtonSet.OK);
    } catch (e) { /* headless */ }
    return n;
  });
}

/** HubSpot contact object -> canonical RAW row. */
function portalRow_(c, mode, ingestedAt) {
  const p = (c && c.properties) ? c.properties : {};
  const C = PB4.COLS_RAW;
  return [
    'HS-' + toStr_(c && c.id ? c.id : ''), mode,
    toStr_(p.firstname), toStr_(p.lastname), toStr_(p.email),
    toStr_(p.phone), toStr_(p.mobilephone), toStr_(p.company),
    toStr_(p.jobtitle), toStr_(p.website),
    toStr_(p.lifecycle_stage).toLowerCase(), toStr_(p.hs_lead_status).toUpperCase(),
    toStr_(p.hubspot_owner_id),
    isoToDate_(p.createdate), isoToDate_(p.hs_lastmodifieddate), isoToDate_(p.notes_last_updated),
    toBool_(p.hs_email_optout) ? 'true' : '',
    toStr_(p.city), toStr_(p.state), toStr_(p.country), toStr_(p.industry),
    ingestedAt
  ];
}

function rememberPull_(mode, rows, at) {
  try {
    PropertiesService.getScriptProperties()
      .setProperty('PB4_LAST_PULL', JSON.stringify({ mode: mode, rows: rows, at: at }));
  } catch (e) { /* non-fatal */ }
}

function lastPullInfo_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('PB4_LAST_PULL');
    return raw ? JSON.parse(raw) : { mode: '—', rows: 0, at: '—' };
  } catch (e) { return { mode: '—', rows: 0, at: '—' }; }
}

/** ---- CSV mode --------------------------------------------------------- */
const CSV_ALIASES = {
  record_id:         ['recordid', 'id', 'contactid', 'hsobjectid', 'customerid', 'reference', 'ref', 'leadid'],
  firstname:         ['firstname', 'first', 'fname', 'givenname', 'prenom', 'nombre'],
  lastname:          ['lastname', 'last', 'lname', 'surname', 'familyname', 'nom', 'apellidos'],
  email:             ['email', 'emailaddress', 'email1', 'mail', 'workemail'],
  phone:             ['phone', 'phonenumber', 'phone1', 'workphone', 'tel', 'telephone', 'primaryphone'],
  mobilephone:       ['mobile', 'mobilephone', 'cell', 'cellphone', 'mobile1'],
  company:           ['company', 'companyname', 'organization', 'organisation', 'account', 'accountname', 'business'],
  jobtitle:          ['jobtitle', 'title', 'role', 'position', 'function'],
  website:           ['website', 'url', 'domain', 'websiteurl', 'site', 'web'],
  lifecycle_stage:   ['lifecyclestage', 'lifecycle', 'stage', 'contactstage'],
  lead_status:       ['leadstatus', 'status', 'hubspotleadstatus'],
  owner_id:          ['owner', 'ownerid', 'hubspotowner', 'salesrep', 'rep'],
  created_date:      ['created', 'createdate', 'createdat', 'dateadded', 'creationdate', 'signup', 'createdon'],
  lastmodified_date: ['lastmodified', 'lastmodifieddate', 'modified', 'updated', 'lastupdate', 'updatedat'],
  last_activity_date:['lastactivity', 'lastactivitydate', 'lastcontact', 'lastcontacted', 'lasttouched', 'noteslastupdated', 'lastengagement', 'recentactivity'],
  email_optout:      ['optout', 'optoutflag', 'unsubscribed', 'unsubscribe', 'emailoptout', 'donotcontact', 'dnc'],
  city:              ['city', 'town', 'locality'],
  state:             ['state', 'region', 'province', 'stateprovince'],
  country:           ['country', 'countryname'],
  industry:          ['industry', 'sector', 'vertical']
};

/** Menu: open the CSV import dialog (client reads file, sends text). */
function importCsvFile() {
  const html = HtmlService.createHtmlOutputFromFile('CsvImportDialog')
    .setWidth(500).setHeight(360);
  ui_.showModalDialog(html, 'PB4 — Import CRM CSV export');
}

/** Server side of the dialog. Returns a human summary. */
function importAuditCsvFromText(csvText) {
  return withLock_(function () {
    if (!csvText || String(csvText).length < 10) throw new Error('The file looks empty.');
    const text = String(csvText).replace(/^\uFEFF/, '');

    const table = parseCsvSmart_(text);
    if (!table || table.length < 2) throw new Error('Could not parse any data rows from this CSV.');

    const header = table[0].map(toStr_);
    const colMap = mapCsvHeaders_(header);
    if (colMap.email === -1 && colMap.firstname === -1 && colMap.lastname === -1 && colMap.phone === -1) {
      throw new Error('Could not recognize any contact columns (need at least one of: email / first name / last name / phone). Found headers: ' + header.join(', ').slice(0, 200));
    }

    const ingested = nowIso_();
    const rows = [];
    let dateWarn = 0;
    for (let r = 1; r < table.length; r++) {
      const line = table[r];
      if (line.every(function (c) { return toStr_(c) === ''; })) continue; // skip blank lines
      const row = csvRow_(line, colMap, rows.length + 1, ingested);
      if (row.__dateWarn) dateWarn += row.__dateWarn;
      rows.push(row.values);
    }

    const n = writeRawAll_(rows);
    rememberPull_('CSV', n, ingested);
    logMsg_('PULL', 'INFO', 'CSV import finished', n + ' rows, ' + header.length + ' columns, ambiguous dates: ' + dateWarn);

    return 'Imported ' + n + ' rows into RAW_DATA.\nAmbiguous date formats: ' + dateWarn +
           '\n\nNext: close this window and run ⑥ RUN FULL AUDIT — current data.';
  });
}

/** Detect delimiter, parse safely. */
function parseCsvSmart_(text) {
  const firstLine = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : 2000);
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  let delim = ',';
  if (semi > comma && semi >= tabs) delim = ';';
  else if (tabs > comma && tabs > semi) delim = '\t';
  return Utilities.parseCsv(text, delim);
}

/** Fuzzy header mapping: normalized alias -> canonical RAW field. */
function mapCsvHeaders_(header) {
  const aliasIndex = {};
  Object.keys(CSV_ALIASES).forEach(function (canonical) {
    CSV_ALIASES[canonical].forEach(function (a) { aliasIndex[a] = canonical; });
  });

  const colMap = {};
  Object.keys(CSV_ALIASES).forEach(function (k) { colMap[k] = -1; });

  header.forEach(function (h, i) {
    const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!norm) return;
    const canonical = aliasIndex[norm];
    if (canonical && colMap[canonical] === -1) colMap[canonical] = i;
  });
  return colMap;
}

/** One CSV line -> canonical RAW row (with bookkeeping fields). */
function csvRow_(line, colMap, index, ingestedAt) {
  const C = PB4.COLS_RAW;
  const g = function (key) { const i = colMap[key]; return i === -1 ? '' : toStr_(line[i]); };

  let dateWarn = 0;
  const dates = {};
  ['created_date', 'lastmodified_date', 'last_activity_date'].forEach(function (k) {
    const raw = g(k);
    if (raw) {
      const parsed = parseDateAny_(raw);
      if (!parsed) dateWarn++;
      dates[k] = parsed;
    } else {
      dates[k] = '';
    }
  });

  const recordId = g('record_id') || ('CSV-' + ('000000' + index).slice(-6));

  return {
    __dateWarn: dateWarn,
    values: [
      recordId, 'CSV',
      g('firstname'), g('lastname'), g('email'), g('phone'), g('mobilephone'),
      g('company'), g('jobtitle'), g('website'),
      normalizeLifecycle_(g('lifecycle_stage')), g('lead_status').toUpperCase(), g('owner_id'),
      dates.created_date, dates.lastmodified_date, dates.last_activity_date,
      toBool_(g('email_optout')) ? 'true' : '',
      g('city'), g('state'), g('country'), g('industry'),
      ingestedAt
    ]
  };
}
