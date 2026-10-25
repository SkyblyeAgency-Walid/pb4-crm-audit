#!/usr/bin/env node
/** =====================================================================
 * PB4 — DEMO CSV GENERATOR
 * ---------------------------------------------------------------------
 * Produces two standalone CRM exports for proving the PB4 audit tool
 * on camera (no HubSpot portal needed — import via menu ④):
 *
 *   dirty_crm_export_1200.csv  → messy CRM,  target ≈ 54/100 AT RISK
 *   clean_crm_export_1200.csv  → healthy CRM, target ≈ 95/100 EXCELLENT
 *
 * Design rules (mirror the check engine in src/12+13):
 *   - every defect row triggers EXACTLY its intended check (disjoint
 *     role groups, no cascades), except abandoned-MQL rows which
 *     intentionally fire H-07 (+H-05 when idle > 90d);
 *   - all "healthy" phones are exact E.164 so H-14 stays silent;
 *   - emails/phones are globally unique except intentional dup pairs;
 *   - dates are relative to generation day, with wide buffers around
 *     the 30/60/90-day thresholds so the files stay valid for weeks;
 *   - deterministic RNG (mulberry32, same as Apps Script 19_DEMO.js).
 * ===================================================================== */

const fs = require('fs');
const path = require('path');
const OUT_DIR = '/home/z/my-project/download/pb4-crm-health-audit/demo_data';

/* ---------- RNG (bit-identical to Apps Script) ---------------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const ri = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const dAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

/* ---------- value pools (same fictional universe as 19_DEMO.js) ----- */
const FIRST = ['Youssef','Amina','Karim','Salma','Omar','Nadia','Mehdi','Sara','Hamza','Leila','Adam','Rania','Lucas','Emma','Liam','Chloe','Diego','Sofia','Ethan','Maya','Hugo','Ines','Noah','Yasmine','Rachid','Khadija','Ilyas','Malak','Anas','Douae','Ayoub','Hiba','Othmane','Bilal','Imane','Zakaria','Nour','Reda','Sanaa','Yassine','Walid','Fatima','Zineb','Aya','Ismail','Badr','Meryem','Amine','Ghita','Said','Lamia','Tarik','Hanane','Soufiane','Kenza','Brahim','Ilham','Mounir','Rajae','Adil','Asmae','Fouad','Btissam','Nawal','Jalal','Salwa','Kamal','Rim','Nabil','Hind','Azzeddine','Chaimae','Driss','Sofia','Mounia','Hicham','Amal','Rhita','Karim','Wiam','Othman','Samira','Anouar','Fadwa','Mohamed','Farah','Khalid','Doha','Jamil','Louise','Marc','Nina','Omar','Pauline','Rachida','Simon','Theo','Victor','Zara'];
const LAST = ['Benali','El Amrani','Chen','Smith','Martin','Bernard','Garcia','Rossi','Silva','Kowalski','Traore','Diallo','Cohen','Levi','Nakamura','Okafor','Santos','Dubois','Ferreira','Haddad','Mansouri','Ibrahim','Petrov','Nguyen','Bennani','Alaoui','Chakir','Berrada','Lahlou','Tazi','Sabri','Fassi','Idrissi','Naciri','Sekkat','Benjelloun','Chraibi','Karimi','Moujahid','Belkacem','El Fassi','Bouzidi','Rami','Lahlou','Zeroual','Kadiri','Bennis','Cherkaoui','Alami','Sqalli','Hakimi','Berrada','Tahiri','Guerouani','Filali','Benkirane','Skalli','Harrak','Belghiti','Ouazzani','Benslimane','El Malki','Rifai','Sbihi','Lamrani','Benjelloun','Berrady','Canutti','Moreau','Lefevre','Fontaine','Chevalier','Roux','Vincent','Powell','Watson','Baker','Harris','Clark','Allen','Young','King','Wright','Lopez','Hill','Green','Adams','Nelson','Carter','Mitchell','Perez','Roberts','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins'];
const COMPANIES = ['Atlas Logistics','Sahara Textiles','Medina Foods','Casablanca Tech','Rif Mining','Kettani Group','Al Boraq Trading','Zellige Home','Atlas Software','Fes Crafts','Saham Retail','Tanja Marine','Oasis Energy','Doukkala Agro','Riad Hospitality','Anfa Pharma','Sous Digital','Moyen Atlas Bank','Chellah Motors','Merinide Construction','Ziz Consulting','Toubkal Tourism','Bab Automobile','Souss Export','Moulay Distribution','Argan Beauty','Chefchaouen Tours','Draa Imports','Guelmim Freight','Ifrane Dairy','Jem Displays','Kasbah Security','Larache Paper','Meknes Metals','Nador Plastics','Ouarzazate Films','Oued Packaging','Rabat Robotics','Sefrou Wood','Tafilalet Rugs'];
const TITLES = ['Manager','Director','CEO','Founder','Sales Lead','Operations','CFO','CTO','Marketing Manager','Procurement','Owner','Consultant'];
const CITIES = ['Casablanca','Rabat','Marrakech','Tangier','Fes','Agadir','Oujda','Kenitra','Tetouan','Temara'];
const COUNTRIES = ['Morocco','Morocco','Morocco','Morocco','Morocco','France','Spain','United States','Canada','Germany'];
const INDUSTRIES = ['Logistics','Textiles','Food','Technology','Retail','Energy','Finance','Healthcare'];
const PERSONAL_DOMAINS = ['gmail.com','gmail.com','gmail.com','hotmail.fr','outlook.com','yahoo.fr','icloud.com'];
const STATUSES = ['NEW','OPEN','IN_PROGRESS','ATTEMPTED_TO_CONTACT','CONNECTED'];
const OWNERS = ['s.chen','m.rossi','a.tazi','j.okafor','l.novak'];
const LIFECYCLE_PLAIN = ['lead','lead','lead','subscriber','customer'];
const LIFECYCLE_SALES = ['marketingqualifiedlead','salesqualifiedlead','opportunity'];
const JUNK_NAMES = ['Test','Asdf','John123','Aaaa','www.deals.com','X'];
const BROKEN_EMAILS = ['john@@example.com','not-an-email','jane(at)example.com','a@b','sam@@mail.com','test@','@nope.com','mike@@corp.com','anna at corp.com','jo@nope','lia@@web.fr','sara@.com'];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18) || 'corp';

/* ---------- CSV ------------------------------------------------------ */
const HEADERS = ['Contact ID','First Name','Last Name','Email Address','Phone Number','Mobile','Company Name','Job Title','Lifecycle Stage','Lead Status','Owner','Created At','Last Modified','Last Activity','City','Country','Industry','Unsubscribed'];
function esc(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function toCsv(rows) {
  return [HEADERS.join(',')].concat(rows.map(r => r.map(esc).join(','))).join('\r\n') + '\r\n';
}

/* ---------- generator ------------------------------------------------ */
function makeDataset(cfg) {
  const rng = mulberry32(cfg.seed);
  const usedEmails = new Set();
  const usedPhones = new Set();     // full digit strings
  const usedFps = new Set();        // last-8 fingerprints
  let emailSeq = 1;
  let idSeq = cfg.idStart;

  function uniqueEmail(local, domain) {
    let e = local + '@' + domain, k = local, n = emailSeq;
    while (usedEmails.has(e)) { e = k + n + '@' + domain; n++; emailSeq = n + 1; }
    usedEmails.add(e);
    return e;
  }
  function freshPhoneDigits() {
    let d, fp, guard = 0;
    do {
      d = '6' + String(10000000 + Math.floor(rng() * 89999999));
      fp = d.slice(-8);
      guard++;
    } while ((usedPhones.has(d) || usedFps.has(fp)) && guard < 500);
    usedPhones.add(d); usedFps.add(fp);
    return d;                      // 9 national digits, E.164 = +212 + d
  }

  /* Disjoint defect groups over base indices */
  const roles = {};
  Object.keys(cfg.roles).forEach(r => { roles[r] = 0; });
  const idx = [];
  for (let i = 0; i < cfg.base; i++) idx.push(i);
  for (let i = idx.length - 1; i > 0; i--) {           // Fisher-Yates
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  const roleOf = new Array(cfg.base).fill('healthy');
  let cursor = 0;
  const groupIdx = {};
  Object.keys(cfg.roles).forEach(role => {
    groupIdx[role] = [];
    for (let k = 0; k < cfg.roles[role]; k++) {
      const i = idx[cursor++];
      roleOf[i] = role;
      groupIdx[role].push(i);
    }
  });
  const healthyPool = idx.slice(cursor);               // sources for dup pairs

  function baseRow(i) {
    const role = roleOf[i];
    let first = pick(rng, FIRST);
    let last = pick(rng, LAST);
    let company = pick(rng, COMPANIES);
    let owner = pick(rng, OWNERS);
    const city = pick(rng, CITIES), country = pick(rng, COUNTRIES), ind = pick(rng, INDUSTRIES);

    let lifecycle = pick(rng, LIFECYCLE_PLAIN);
    if (role === 'abandoned') lifecycle = pick(rng, LIFECYCLE_SALES);
    if (role === 'noowner' || role === 'optout') lifecycle = 'lead';
    if (role === 'custnostat') lifecycle = 'customer';
    if (role === 'nolifecycle') lifecycle = '';
    let status = lifecycle === 'customer' ? 'CONNECTED' : pick(rng, STATUSES);

    /* activity / creation windows (cascade-free by construction) */
    let created = ri(rng, 5, 540), act;
    if (role === 'stale') {
      act = ri(rng, 120, 380); created = act + ri(rng, 3, 200);
    } else if (role === 'abandoned') {
      act = (groupIdx.abandoned.indexOf(i) % 3 === 2) ? ri(rng, 100, 180) : ri(rng, 65, 88);
      created = act + ri(rng, 3, 60);
    } else if (role === 'neveract') {
      act = ''; created = ri(rng, 40, 300);
    } else {
      if (rng() < 0.92) { act = ri(rng, 1, Math.min(45, created - 1)); }
      else { created = ri(rng, 3, 25); act = ''; }
    }
    const lastmod = act === '' ? ri(rng, 0, Math.max(0, created - 1)) : ri(rng, 0, Math.max(0, act - 1));

    /* contact fields */
    let email = uniqueEmail(
      (first + '.' + last).replace(/\s+/g, '').toLowerCase() + ri(rng, 2, 99),
      rng() < 0.45 ? pick(rng, PERSONAL_DOMAINS) : slug(company) + '.com');
    let phone = freshPhoneDigits();
    let mobile = rng() < 0.4 ? freshPhoneDigits() : '';

    /* per-role defect overrides (contact fields + flags) */
    let optout = '';
    if (role === 'noemail') email = '';
    if (role === 'nophone') { phone = ''; mobile = ''; }
    if (role === 'nocomp') company = '';
    if (role === 'noname') { }
    if (role === 'bademail') email = BROKEN_EMAILS[groupIdx.bademail.indexOf(i) % BROKEN_EMAILS.length];
    if (role === 'disposable') email = email.split('@')[0] + '@mailinator.com';
    if (role === 'roleemail') email = uniqueEmail('info.' + slug(first + last), slug(company) + '.com');
    if (role === 'badphone') phone = pick(rng, ['12', 'abc-defg', '+2126123456789999', '00']);
    if (role === 'junk') { }
    if (role === 'custnostat') status = '';
    if (role === 'noowner') owner = '';       // owner = '' via builder below
    if (role === 'optout') optout = 'true';

    const junkFirst = role === 'junk' ? pick(rng, JUNK_NAMES) : first;
    const lastOut = role === 'noname' ? '' : last;

    /* phone output: E.164 default; unformat rows keep messy national forms
     * (valid digits -> the tool flags them as AUTO-FIXABLE H-14) */
    let phoneOut;
    if (!phone) phoneOut = '';
    else if (role === 'unformat') {
      const v = groupIdx.unformat.indexOf(i) % 3, b = phone;
      phoneOut = v === 0 ? ('0' + b)
               : v === 1 ? ('212' + b)
               : ('0' + b.slice(0, 3) + ' ' + b.slice(3, 6) + ' ' + b.slice(6));
    } else phoneOut = '+212' + phone;

    return [
      String(idSeq++), junkFirst, lastOut, email,
      phoneOut,
      mobile ? '+212' + mobile : '',
      company, pick(rng, TITLES), lifecycle, status,
      role === 'noowner' ? '' : owner,
      dAgo(created), dAgo(lastmod), act === '' ? '' : dAgo(act),
      city, country, ind, optout
    ];
  }

  const rows = [];
  for (let i = 0; i < cfg.base; i++) rows.push(baseRow(i));

  /* ---- duplicate injections (H-01..H-04), cascade-isolated ---------- */
  const grabHealthy = () => {
    const i = healthyPool.shift();
    return rows[i];
  };
  const cloneOf = (src) => src.slice();

  /* H-03 phone pairs: different person, same line, both E.164 */
  for (let k = 0; k < cfg.dup.phonePairs; k++) {
    const src = grabHealthy();
    const digits = String(src[4]).replace(/[^0-9]/g, '').replace(/^212/, '');
    const b = cloneOf(src);
    b[0] = String(idSeq++);
    b[1] = pick(rng, FIRST); b[2] = pick(rng, LAST);
    b[3] = uniqueEmail((b[1] + '.' + b[2]).replace(/\s+/g, '').toLowerCase() + ri(rng, 2, 99), pick(rng, PERSONAL_DOMAINS));
    b[4] = '+212' + digits; b[5] = '';
    b[8] = 'lead'; b[9] = 'NEW'; b[10] = pick(rng, OWNERS);
    b[11] = dAgo(ri(rng, 60, 300)); b[12] = dAgo(ri(rng, 0, 30)); b[13] = dAgo(ri(rng, 1, 45));
    rows.push(b);
  }

  /* H-02 gmail pairs: dots / +tag equivalents, fresh identities */
  for (let k = 0; k < cfg.dup.gmailPairs; k++) {
    const f = pick(rng, FIRST).toLowerCase().replace(/[^a-z]/g, '') || 'sam';
    const l = pick(rng, LAST).toLowerCase().replace(/[^a-z]/g, '') || 'green';
    const company = pick(rng, COMPANIES);
    const mk = (over) => {
      const r = new Array(18).fill('');
      r[0] = String(idSeq++);
      r[6] = over.company; r[7] = pick(rng, TITLES);
      r[10] = pick(rng, OWNERS); r[14] = pick(rng, CITIES);
      r[15] = pick(rng, COUNTRIES); r[16] = pick(rng, INDUSTRIES);
      return r;
    };
    const a = mk({ company: company });
    a[1] = f.charAt(0).toUpperCase() + f.slice(1); a[2] = l.charAt(0).toUpperCase() + l.slice(1);
    a[3] = uniqueEmail(f + '.' + l + (k + 101), 'gmail.com');
    a[4] = '+212' + freshPhoneDigits(); a[5] = '';
    a[8] = 'lead'; a[9] = 'OPEN';
    a[11] = dAgo(ri(rng, 60, 300)); a[12] = dAgo(ri(rng, 0, 30)); a[13] = dAgo(ri(rng, 1, 50));
    const b = mk({ company: company + ' SARL' });
    b[1] = a[1]; b[2] = a[2];
    b[3] = uniqueEmail(f + l + (k + 101) + '+crm', 'gmail.com');
    b[4] = '+212' + freshPhoneDigits(); b[5] = '';
    b[8] = 'lead'; b[9] = 'NEW';
    b[11] = dAgo(ri(rng, 5, 25)); b[12] = dAgo(ri(rng, 0, 5)); b[13] = '';
    rows.push(a, b);
  }

  /* H-04 name+company pairs: same person re-keyed */
  for (let k = 0; k < cfg.dup.namecoPairs; k++) {
    const src = grabHealthy();
    const b = cloneOf(src);
    b[0] = String(idSeq++);
    b[3] = uniqueEmail((b[1] + '.' + b[2]).replace(/\s+/g, '').toLowerCase() + ri(rng, 2, 99), slug(src[6]) + '.ma');
    b[4] = '+212' + freshPhoneDigits(); b[5] = '';
    b[8] = 'lead'; b[9] = 'NEW'; b[10] = pick(rng, OWNERS);
    b[11] = dAgo(ri(rng, 150, 500)); b[12] = dAgo(ri(rng, 0, 60)); b[13] = dAgo(ri(rng, 1, 50));
    rows.push(b);
  }

  /* H-01 verbatim clones (run last, from untouched healthy rows) */
  for (let k = 0; k < cfg.dup.clones; k++) {
    const src = grabHealthy();
    const c = cloneOf(src);
    c[0] = String(idSeq++);
    c[11] = dAgo(ri(rng, 1, 25)); c[12] = c[11]; c[13] = '';
    rows.push(c);
  }

  return { csv: toCsv(rows), rows: rows.length, roleOf, baseRows: rows.slice(0, cfg.base) };
}

/* ---------- the two storylines --------------------------------------- */
const DIRTY = {
  seed: 20261024, base: 1200, idStart: 41201,
  roles: {
    stale: 45, abandoned: 30, neveract: 20,
    noemail: 28, nophone: 30, nocomp: 24, noname: 12,
    bademail: 12, disposable: 8, roleemail: 8,
    badphone: 8, unformat: 30, junk: 8,
    custnostat: 14, noowner: 18, nolifecycle: 10, optout: 6
  },
  dup: { clones: 20, gmailPairs: 8, phonePairs: 8, namecoPairs: 6 }
};
const CLEAN = {
  seed: 777001, base: 1200, idStart: 41201,
  roles: {
    stale: 15, nophone: 10, unformat: 8, roleemail: 3,
    custnostat: 4, nocomp: 4, noowner: 2
  },
  dup: { clones: 5, gmailPairs: 0, phonePairs: 0, namecoPairs: 0 }
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const DEBUG = process.env.PB4_DEBUG === '1';
const d = makeDataset(DIRTY);
if (DEBUG) {
  const perRole = {};
  d.roleOf.forEach((role, i) => {
    perRole[role] = perRole[role] || { n: 0, noCo: 0, noPh: 0, noEm: 0 };
    perRole[role].n++;
    if (!d.baseRows[i][6]) perRole[role].noCo++;
    if (!d.baseRows[i][4]) perRole[role].noPh++;
    if (!d.baseRows[i][3]) perRole[role].noEm++;
  });
  console.log('DIRTY per-role:', JSON.stringify(perRole, null, 1));
}
fs.writeFileSync(path.join(OUT_DIR, 'dirty_crm_export_1200.csv'), d.csv);
console.log('dirty_crm_export_1200.csv written:', d.rows, 'data rows');

const c = makeDataset(CLEAN);
fs.writeFileSync(path.join(OUT_DIR, 'clean_crm_export_1200.csv'), c.csv);
console.log('clean_crm_export_1200.csv written:', c.rows, 'data rows');
