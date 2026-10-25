/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 02 · PHONE NORMALIZATION
 * ---------------------------------------------------------------------
 * Compact country-code table (code -> [country, national-number-length])
 * plus normalizePhone_(): raw messy phone -> { status, e164, fingerprint }.
 *
 * Matching is deliberately LENIENT (±2 digits on national length) — this
 * is an audit tool: we flag structural junk (letters, 7–15 digit rule)
 * but avoid false positives on valid numbers.
 *
 * TIP: if you also own the PB3 project, you can paste its full
 * PHONE_NORM.COUNTRY_CODES table over PB4.PHONE_CC unchanged.
 * ===================================================================== */

PB4.PHONE_CC = {
  '1': ['US/CA', 10], '7': ['RU/KZ', 10], '20': ['EG', 10], '27': ['ZA', 9],
  '30': ['GR', 10], '31': ['NL', 9], '32': ['BE', 9], '33': ['FR', 9],
  '34': ['ES', 9], '36': ['HU', 9], '39': ['IT', 10], '40': ['RO', 9],
  '41': ['CH', 9], '43': ['AT', 10], '44': ['GB', 10], '45': ['DK', 8],
  '46': ['SE', 9], '47': ['NO', 8], '48': ['PL', 9], '49': ['DE', 10],
  '51': ['PE', 9], '52': ['MX', 10], '53': ['CU', 8], '54': ['AR', 10],
  '55': ['BR', 10], '56': ['CL', 9], '57': ['CO', 10], '58': ['VE', 10],
  '60': ['MY', 9], '61': ['AU', 9], '62': ['ID', 10], '63': ['PH', 10],
  '64': ['NZ', 9], '65': ['SG', 8], '66': ['TH', 9], '81': ['JP', 10],
  '82': ['KR', 9], '84': ['VN', 9], '86': ['CN', 11], '90': ['TR', 10],
  '91': ['IN', 10], '92': ['PK', 10], '93': ['AF', 9], '94': ['LK', 9],
  '95': ['MM', 9], '98': ['IR', 10],
  '212': ['MA', 9], '213': ['DZ', 8], '216': ['TN', 8], '218': ['LY', 9],
  '220': ['GM', 7], '221': ['SN', 9], '222': ['MR', 8], '223': ['ML', 8],
  '224': ['GN', 8], '225': ['CI', 8], '226': ['BF', 8], '227': ['NE', 8],
  '228': ['TG', 8], '229': ['BJ', 8], '230': ['MU', 7], '231': ['LR', 8],
  '232': ['SL', 8], '233': ['GH', 9], '234': ['NG', 10], '235': ['TD', 8],
  '236': ['CF', 8], '237': ['CM', 9], '238': ['CV', 7], '240': ['GQ', 9],
  '241': ['GA', 8], '242': ['CG', 9], '243': ['CD', 9], '244': ['AO', 9],
  '245': ['GW', 7], '248': ['SC', 7], '249': ['SD', 9], '250': ['RW', 9],
  '251': ['ET', 9], '252': ['SO', 8], '253': ['DJ', 8], '254': ['KE', 9],
  '255': ['TZ', 9], '256': ['UG', 9], '257': ['BI', 8], '258': ['MZ', 9],
  '260': ['ZM', 9], '261': ['MG', 9], '263': ['ZW', 9], '264': ['NA', 9],
  '265': ['MW', 9], '266': ['LS', 8], '267': ['BW', 8], '268': ['SZ', 8],
  '269': ['KM', 7],
  '350': ['GI', 8], '351': ['PT', 9], '352': ['LU', 9], '353': ['IE', 9],
  '354': ['IS', 7], '355': ['AL', 9], '356': ['MT', 8], '357': ['CY', 8],
  '358': ['FI', 9], '359': ['BG', 9], '370': ['LT', 8], '371': ['LV', 8],
  '372': ['EE', 8], '373': ['MD', 8], '374': ['AM', 8], '375': ['BY', 9],
  '376': ['AD', 6], '377': ['MC', 9], '378': ['SM', 8], '380': ['UA', 9],
  '381': ['RS', 9], '382': ['ME', 8], '385': ['HR', 9], '386': ['SI', 8],
  '387': ['BA', 8], '389': ['MK', 8], '420': ['CZ', 9], '421': ['SK', 9],
  '423': ['LI', 7],
  '502': ['GT', 8], '503': ['SV', 8], '504': ['HN', 8], '505': ['NI', 8],
  '506': ['CR', 8], '507': ['PA', 8], '509': ['HT', 8],
  '591': ['BO', 8], '593': ['EC', 9], '595': ['PY', 9], '597': ['SR', 7],
  '598': ['UY', 8], '599': ['CW', 8],
  '670': ['TL', 8], '673': ['BN', 7], '675': ['PG', 8], '676': ['TO', 7],
  '677': ['VU', 7], '679': ['FJ', 7], '680': ['PW', 7],
  '852': ['HK', 8], '853': ['MO', 8], '856': ['LA', 9], '880': ['BD', 10],
  '886': ['TW', 9],
  '960': ['MV', 7], '961': ['LB', 8], '962': ['JO', 9], '963': ['SY', 9],
  '964': ['IQ', 10], '965': ['KW', 8], '966': ['SA', 9], '967': ['YE', 9],
  '968': ['OM', 8], '970': ['PS', 9], '971': ['AE', 9], '972': ['IL', 9],
  '973': ['BH', 8], '974': ['QA', 8], '975': ['BT', 8], '976': ['MN', 8],
  '977': ['NP', 9],
  '992': ['TJ', 9], '993': ['TM', 8], '994': ['AZ', 9], '995': ['GE', 9],
  '996': ['KG', 9], '998': ['UZ', 9]
};

/**
 * Normalize a raw phone string.
 * @returns one of:
 *   { status:'EMPTY' }
 *   { status:'INVALID', reason, raw }
 *   { status:'OK', e164, digits, fingerprint, cc, country }
 * fingerprint = last 8 digits of the full international number — two
 * records that share it are near-certainly the same line (H-03).
 */
function normalizePhone_(raw, defaultCc) {
  const s0 = toStr_(raw);
  if (!s0) return { status: 'EMPTY' };

  // Drop trailing extension ("ext 123", "x123", "#123")
  let s = s0.replace(/(ext\.?|x\.?|#)\s*\d{1,5}\s*$/i, '');
  const hasPlus = s.trim().charAt(0) === '+';
  const has00 = /^\s*00/.test(s);

  if (/[A-Za-z]/.test(s)) return { status: 'INVALID', reason: 'contains letters', raw: s0 };

  let digits = s.replace(/[^0-9]/g, '');
  if (!digits) return { status: 'INVALID', reason: 'no digits', raw: s0 };
  if (digits.length < 7 || digits.length > 15) {
    return { status: 'INVALID', reason: 'digit count ' + digits.length + ' outside 7-15', raw: s0 };
  }

  // International form: "+CC..." or "00CC..."
  let intl = hasPlus ? digits : (has00 ? digits.replace(/^00/, '') : '');
  if (intl.length >= 7 && intl.length <= 15) {
    const m = matchCc_(intl);
    return {
      status: 'OK',
      e164: '+' + intl,
      digits: intl,
      fingerprint: phoneFingerprint_(intl),
      cc: m ? m[0] : '',
      country: m ? m[1][0] : ''
    };
  }

  // National form: assume default country (SETTINGS.DEFAULT_COUNTRY_CODE)
  let nat = digits;
  if (nat.charAt(0) === '0') nat = nat.replace(/^0+/, '');
  const total = String(defaultCc) + nat;
  if (nat.length < 6 || total.length > 15) {
    return { status: 'INVALID', reason: 'not dialable as national or international', raw: s0 };
  }
  return {
    status: 'OK',
    e164: '+' + total,
    digits: total,
    fingerprint: phoneFingerprint_(total),
    cc: String(defaultCc),
    country: PB4.PHONE_CC[String(defaultCc)] ? PB4.PHONE_CC[String(defaultCc)][0] : ''
  };
}

/** Longest-prefix country code match with lenient length check (±2). */
function matchCc_(intlDigits) {
  for (let n = 3; n >= 1; n--) {
    const pref = intlDigits.slice(0, n);
    const entry = PB4.PHONE_CC[pref];
    if (entry) {
      const natLen = intlDigits.length - n;
      if (natLen >= entry[1] - 2 && natLen <= entry[1] + 2) return [pref, entry];
    }
  }
  for (let n = 3; n >= 1; n--) {
    const pref = intlDigits.slice(0, n);
    if (PB4.PHONE_CC[pref]) return [pref, PB4.PHONE_CC[pref]];
  }
  return null;
}

function phoneFingerprint_(digits) {
  return digits.length >= 8 ? digits.slice(-8) : digits;
}
