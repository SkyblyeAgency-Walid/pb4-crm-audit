/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 19 · DEMO DATA GENERATOR
 * ---------------------------------------------------------------------
 * Seeds ~1,250 realistic contacts into RAW_DATA (mode DEMO) with
 * controlled defect rates — a messy CRM you can demo the audit on
 * WITHOUT touching any real HubSpot portal.
 *
 * The seed is DETERMINISTIC (fixed RNG seed) → same data every run,
 * so demo numbers are reproducible. Tuned to score ≈ 57/100 ("AT RISK").
 * To change the story, adjust DEMO.RATE (each rate is independent).
 * ===================================================================== */

const DEMO = {
  BASE_RECORDS: 1200,
  DEFAULT_CC: 212,
  DUP_EXACT_ROWS: 24,    // H-01 clones
  DUP_GMAIL_PAIRS: 8,    // H-02 pairs
  DUP_PHONE_PAIRS: 8,    // H-03 pairs
  DUP_NAMECO_PAIRS: 8,   // H-04 pairs
  RATE: {
    missingEmail: 0.03,    missingPhone: 0.032,  missingCompany: 0.024,
    missingLastName: 0.01, invalidEmail: 0.01,   disposable: 0.005,
    roleEmail: 0.005,      invalidPhone: 0.01,   junkName: 0.004,
    optoutActive: 0.005,   customerNoStatus: 0.035, openLeadNoOwner: 0.02,
    noLifecycle: 0.005,    abandonedMQL: 0.04,   stale: 0.022,
    neverActivated: 0.017, unformattedPhone: 0.015
  }
};

function seedDemoData() {
  return withLock_(function () {
    const rng = mulberry32_(20241024);
    const ingested = nowIso_();
    const rows = [];
    let idc = 901000;

    for (let i = 0; i < DEMO.BASE_RECORDS; i++) {
      rows.push(demoRow_(rng, 'HS-' + (idc++), ingested));
    }
    idc = injectDups_(rows, rng, idc, ingested);

    const n = writeRawAll_(rows);
    rememberPull_('DEMO', n, ingested);
    logMsg_('DEMO', 'INFO', 'Demo CRM seeded', 'rows=' + n + ' (deterministic seed 20241024, target score ~57/100)');

    try {
      ui_.alert('PB4 — Demo data ready',
        n + ' demo contacts written to RAW_DATA (deterministic — same every run).\n\n' +
        'Now run ⑥ RUN FULL AUDIT — current data.', ui_.ButtonSet.OK);
    } catch (e) { /* headless */ }
    return n;
  });
}

/** ---- name / value pools (wide pools keep accidental collisions low) -- */
const D_FIRST = ['Youssef','Amina','Karim','Salma','Omar','Nadia','Mehdi','Sara','Hamza','Leila','Adam','Rania','Lucas','Emma','Liam','Chloe','Diego','Sofia','Ethan','Maya','Hugo','Ines','Noah','Yasmine','Rachid','Khadija','Ilyas','Malak','Anas','Douae','Ayoub','Hiba','Othmane','Salma','Bilal','Imane','Zakaria','Nour','Reda','Sanaa'];
const D_LAST = ['Benali','El Amrani','Chen','Smith','Martin','Bernard','Garcia','Rossi','Silva','Kowalski','Traore','Diallo','Cohen','Levi','Nakamura','Okafor','Santos','Dubois','Ferreira','Haddad','Mansouri','Ibrahim','Petrov','Nguyen','Bennani','Alaoui','Chakir','Berrada','Lahlou','Tazi','Sabri','Fassi','Idrissi','Naciri','Sekkat','Benjelloun','Chraibi','Karimi','Moujahid','Belkacem'];
const D_COMPANIES = ['Atlas Logistics','Sahara Textiles','Medina Foods','Casablanca Tech','Rif Mining','Kettani Group','Al Boraq Trading','Zellige Home','Atlas Software','Fes Crafts','Saham Retail','Tanja Marine','Oasis Energy','Doukkala Agro','Riad Hospitality','Anfa Pharma','Sous Digital','Moyen Atlas Bank','Chellah Motors','Merinide Construction','Ziz Consulting','Toubkal Tourism','Bab Automobile','Souss Export','Moulay Distribution','Argan Beauty','Chefchaouen Tours','Draa Imports','Guelmim Freight','Ifrane Dairy','Jem Displays','Kasbah Security','Larache Paper','Meknes Metals','Nador Plastics','Ouarzazate Films','Oued Packaging','Rabat Robotics','Sefrou Wood','Tafilalet Rugs'];
const D_TITLES = ['Manager','Director','CEO','Founder','Sales Lead','Operations','CFO','CTO','Marketing Manager','Procurement','Owner','Consultant'];
const D_CITIES = ['Casablanca','Rabat','Marrakech','Tangier','Fes','Agadir','Oujda','Kenitra','Tetouan','Temara'];
const D_COUNTRIES = ['Morocco','Morocco','Morocco','Morocco','Morocco','France','Spain','United States','Canada','Germany'];
const D_INDUSTRIES = ['Logistics','Textiles','Food','Technology','Retail','Energy','Finance','Healthcare'];
const D_DOMAINS = ['gmail.com','gmail.com','hotmail.fr','outlook.com','yahoo.fr','icloud.com'];
const D_LIFECYCLES = ['lead','lead','lead','marketingqualifiedlead','marketingqualifiedlead','salesqualifiedlead','opportunity','customer','customer','subscriber'];
const D_STATUSES = ['NEW','OPEN','IN_PROGRESS','ATTEMPTED_TO_CONTACT','CONNECTED'];
const D_JUNK_NAMES = ['Test','Asdf','John123','Aaaa','www.deals.com','X'];
const D_BROKEN_EMAILS = ['john@@example.com','not-an-email','jane(at)example.com','a@b'];
const D_BROKEN_PHONES = ['12','abc-defg','+2126123456789999','00'];
const D_ROLE_LOCALS = ['info','contact','sales','admin','hello'];

/** ---- one base contact with defect draws ------------------------------ */
function demoRow_(rng, recordId, ingested) {
  const C = PB4.COLS_RAW;
  let first = pick_(rng, D_FIRST), last = pick_(rng, D_LAST);
  let company = pick_(rng, D_COMPANIES);
  let lifecycle = pick_(rng, D_LIFECYCLES);
  let status = lifecycle === 'customer'
    ? (rng() < 0.9 ? 'CONNECTED' : pick_(rng, D_STATUSES))
    : pick_(rng, D_STATUSES);
  let owner = 'O-' + (1 + Math.floor(rng() * 12));
  // Email local part must be space-free (spaces are a separate defect class).
  let email = (first + '.' + last).toLowerCase().replace(/\s+/g, '') + rngInt_(rng, 2, 99) + '@' +
    (rng() < 0.55 ? pick_(rng, D_DOMAINS) : slug_(company) + '.com');
  let phone = '+2126' + String(10000000 + Math.floor(rng() * 89999999));
  let mobile = rng() < 0.4 ? '+2127' + String(10000000 + Math.floor(rng() * 89999999)) : '';

  let createdDays = rngInt_(rng, 5, 540);
  let actDays = null;

  // INDEPENDENT defect rolls (placed-flag prevents double placement):
  //   abandoned MQL/SQL/OPP -> stale -> never activated -> healthy majority.
  // The healthy majority's idle window (1..60d) sits UNDER both the
  // MQL_STUCK_DAYS (60) and STALE_DAYS (90) thresholds so baseline rows
  // never fire staleness checks — only injected defects do.
  const inSales = PB4.LIFECYCLE_SALES.indexOf(lifecycle) >= 0;
  let placed = false;
  if (!placed && inSales && rng() < DEMO.RATE.abandonedMQL) {
    actDays = rngInt_(rng, 70, 220);
    createdDays = Math.max(createdDays, actDays + rngInt_(rng, 3, 60));
    placed = true;
  }
  if (!placed && rng() < DEMO.RATE.stale) {
    actDays = rngInt_(rng, 100, 320);
    createdDays = Math.max(createdDays, actDays + rngInt_(rng, 5, 200));
    placed = true;
  }
  if (!placed && rng() < DEMO.RATE.neverActivated) {
    actDays = null;
    createdDays = rngInt_(rng, 40, 400);
    placed = true;
  }
  if (!placed) {
    if (createdDays > 2 && rng() < 0.93) {
      actDays = rngInt_(rng, 1, Math.min(60, Math.max(1, createdDays - 1)));
    } else {
      actDays = null;
      createdDays = rngInt_(rng, 1, 30);   // too new to count as "never activated"
    }
  }

  // Independent contact-defect draws
  if (rng() < DEMO.RATE.missingEmail) email = '';
  if (rng() < DEMO.RATE.missingPhone) { phone = ''; mobile = ''; }
  if (rng() < DEMO.RATE.missingCompany) company = '';
  if (rng() < DEMO.RATE.missingLastName) last = '';

  const rE = rng();
  if (rE < DEMO.RATE.invalidEmail && email) email = pick_(rng, D_BROKEN_EMAILS);
  else if (rE < DEMO.RATE.invalidEmail + DEMO.RATE.disposable && email) email = email.split('@')[0] + '@mailinator.com';
  else if (rE < DEMO.RATE.invalidEmail + DEMO.RATE.disposable + DEMO.RATE.roleEmail && email) {
    email = pick_(rng, D_ROLE_LOCALS) + '@' + slug_(company || 'corp') + '.com';
  }

  if (rng() < DEMO.RATE.invalidPhone && phone) phone = pick_(rng, D_BROKEN_PHONES);
  else if (rng() < DEMO.RATE.unformattedPhone && phone) {
    phone = '0' + phone.slice(4);          // national format, valid digits -> AUTO-FIXABLE
  }
  if (rng() < DEMO.RATE.junkName) first = pick_(rng, D_JUNK_NAMES);
  if (rng() < DEMO.RATE.noLifecycle) lifecycle = '';
  if (lifecycle === 'customer' && rng() < DEMO.RATE.customerNoStatus) status = '';
  if (PB4.LIFECYCLE_ACTIVE.indexOf(lifecycle) >= 0 && rng() < DEMO.RATE.openLeadNoOwner) owner = '';
  let optout = '';
  if (rng() < DEMO.RATE.optoutActive) { optout = 'true'; lifecycle = 'lead'; }

  return [
    recordId, 'DEMO', first, last, email, phone, mobile, company,
    pick_(rng, D_TITLES), slug_(company || 'corp') + '.com',
    lifecycle, status, owner,
    dAgoStr_(createdDays), dAgoStr_(Math.max(0, createdDays - rngInt_(rng, 0, 60))),
    actDays === null ? '' : dAgoStr_(actDays),
    optout, pick_(rng, D_CITIES), '', pick_(rng, D_COUNTRIES),
    pick_(rng, D_INDUSTRIES), ingested
  ];
}

/** ---- duplicate injections (H-01..H-04) --------------------------------
 * Isolation rules keep each injected cluster independent (no cascade):
 *  - pair members get fresh phones / identities so they do not collide
 *    with the source row under a second match type;
 *  - H-01 clones never copy a row already used as a pair source;
 *  - pair members keep recent activity so only the intended check fires.
 */
function injectDups_(rows, rng, idc, ingested) {
  const C = PB4.COLS_RAW;
  const usedAsPairSrc = {};
  const freshPhone = function () {
    return '+2126' + String(10000000 + Math.floor(rng() * 89999999));
  };
  const emailFor = function (first, last, domain) {
    return (first + '.' + last).toLowerCase().replace(/\s+/g, '') +
      rngInt_(rng, 2, 99) + '@' + domain;
  };

  // H-03: two different people, same line, different formatting
  for (let k = 0; k < DEMO.DUP_PHONE_PAIRS; k++) {
    const pool = [];
    rows.forEach(function (r, i) {
      if (!usedAsPairSrc[i] &&
          normalizePhone_(r[C.PHONE] || r[C.MOBILE], DEMO.DEFAULT_CC).status === 'OK') pool.push(i);
    });
    if (!pool.length) break;
    const i = pick_(rng, pool);
    usedAsPairSrc[i] = 1;
    const digits = toStr_(rows[i][C.PHONE]).replace(/[^0-9]/g, '');
    const b = rows[i].slice();
    b[C.RECORD_ID] = 'HS-' + (idc++);
    b[C.FIRST] = pick_(rng, D_FIRST);
    b[C.LAST] = pick_(rng, D_LAST);
    b[C.EMAIL] = emailFor(b[C.FIRST], b[C.LAST], pick_(rng, D_DOMAINS));
    b[C.PHONE] = '+' + digits.slice(0, 3) + ' ' + digits.slice(3, 6) + '-' +
                 digits.slice(6, 9) + '-' + digits.slice(9);
    b[C.MOBILE] = '';
    b[C.CREATED] = dAgoStr_(rngInt_(rng, 60, 300));
    b[C.LAST_ACT] = dAgoStr_(rngInt_(rng, 1, 45));
    rows.push(b);
  }

  // H-02: gmail equivalent pair (dots / +tag) — fresh identities
  for (let k = 0; k < DEMO.DUP_GMAIL_PAIRS; k++) {
    const f = (pick_(rng, D_FIRST) + '').toLowerCase().replace(/[^a-z]/g, '') || 'sam';
    const l = (pick_(rng, D_LAST) + '').toLowerCase().replace(/[^a-z]/g, '') || 'green';
    const a = demoRow_(rng, 'HS-' + (idc++), ingested);
    const b = demoRow_(rng, 'HS-' + (idc++), ingested);
    a[C.EMAIL] = f + '.' + l + '@gmail.com';
    b[C.EMAIL] = f + l + '+crm@gmail.com';
    a[C.PHONE] = freshPhone(); a[C.MOBILE] = '';
    b[C.PHONE] = '';           b[C.MOBILE] = '';
    a[C.CREATED] = dAgoStr_(rngInt_(rng, 60, 400));
    a[C.LAST_ACT] = dAgoStr_(rngInt_(rng, 1, 50));
    b[C.CREATED] = dAgoStr_(rngInt_(rng, 5, 25));
    b[C.LAST_ACT] = '';
    b[C.COMPANY] = toStr_(a[C.COMPANY]) + ' SARL';
    rows.push(a, b);
  }

  // H-04: same person re-keyed (same name+company, different email/phone)
  for (let k = 0; k < DEMO.DUP_NAMECO_PAIRS; k++) {
    const pool = [];
    rows.forEach(function (r, i) {
      if (!usedAsPairSrc[i] && toStr_(r[C.EMAIL]) && toStr_(r[C.COMPANY]) &&
          toStr_(r[C.FIRST]) && toStr_(r[C.LAST])) pool.push(i);
    });
    if (!pool.length) break;
    const i = pick_(rng, pool);
    usedAsPairSrc[i] = 1;
    const b = rows[i].slice();
    b[C.RECORD_ID] = 'HS-' + (idc++);
    b[C.EMAIL] = emailFor(b[C.FIRST], b[C.LAST], slug_(toStr_(b[C.COMPANY])) + '.ma');
    b[C.PHONE] = freshPhone();
    b[C.MOBILE] = '';
    b[C.CREATED] = dAgoStr_(rngInt_(rng, 150, 500));
    b[C.LAST_ACT] = dAgoStr_(rngInt_(rng, 1, 50));
    rows.push(b);
  }

  // H-01: verbatim clones — run last, never from a pair source
  for (let k = 0; k < DEMO.DUP_EXACT_ROWS; k++) {
    const pool = [];
    rows.forEach(function (r, i) {
      if (!usedAsPairSrc[i] && toStr_(r[C.EMAIL])) pool.push(i);
    });
    if (!pool.length) break;
    const c = rows[pick_(rng, pool)].slice();
    c[C.RECORD_ID] = 'HS-' + (idc++);
    c[C.CREATED] = dAgoStr_(rngInt_(rng, 0, 30));
    c[C.LAST_ACT] = '';
    rows.push(c);
  }
  return idc;
}

/** ---- rng + small utils ------------------------------------------------- */
function mulberry32_(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pick_(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function rngInt_(rng, min, max) { return min + Math.floor(rng() * (max - min + 1)); }
function dAgoStr_(days) {
  return Utilities.formatDate(new Date(Date.now() - days * 86400000), tz_(), 'yyyy-MM-dd');
}
function slug_(s) {
  const t = toStr_(s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18);
  return t || 'company';
}
