/** =====================================================================
 * PB4 — CRM HEALTH AUDIT · File 03 · HUBSPOT CLIENT (READ-ONLY)
 * ---------------------------------------------------------------------
 * Token lives in Script Properties as HUBSPOT_TOKEN (never in code).
 * Private App scope needed: crm.objects.contacts.read  (READ ONLY —
 * this project issues zero write calls to the CRM).
 * hsFetch_ handles 429 with exponential backoff + Retry-After.
 * ===================================================================== */

function getHubspotToken_() {
  const t = PropertiesService.getScriptProperties().getProperty('HUBSPOT_TOKEN');
  if (!t) {
    throw new Error('HUBSPOT_TOKEN is not set. Open Extensions > Apps Script > Project Settings > Script Properties and add HUBSPOT_TOKEN = your HubSpot Private App token (scope: crm.objects.contacts.read).');
  }
  return t;
}

/** GET with 429/5xx retry (backoff 1s->16s, honors Retry-After). */
function hsFetch_(url) {
  const maxTries = 5;
  let lastErr = '';
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const resp = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + getHubspotToken_() }
    });
    const code = resp.getResponseCode();

    if (code === 200) return JSON.parse(resp.getContentText());

    if (code === 429 || code >= 500) {
      const ra = Number(resp.getHeaders()['Retry-After'] || 0);
      const wait = ra > 0 ? ra * 1000 : Math.min(30000, 1000 * Math.pow(2, attempt - 1));
      lastErr = 'HTTP ' + code;
      if (attempt === maxTries) {
        throw new Error('HubSpot kept returning ' + code + ' after ' + maxTries + ' tries. Aborting pull (nothing was modified — read-only).');
      }
      Utilities.sleep(wait);
      continue;
    }

    if (code === 401 || code === 403) {
      throw new Error('HubSpot auth failed (' + code + '). Check HUBSPOT_TOKEN in Script Properties and that the Private App has scope crm.objects.contacts.read.');
    }
    if (code === 404) throw new Error('HubSpot endpoint not found (404).');
    throw new Error('HubSpot HTTP ' + code + ': ' + resp.getContentText().slice(0, 300));
  }
  throw new Error('HubSpot request failed: ' + lastErr);
}

/**
 * Pull ALL contacts page by page (100/page), feeding each page to
 * onPage(resultsArray). Stops on: complete | record cap | time budget.
 * @returns {pulled, pages, stopped}
 */
function pullAllContacts_(onPage, cfg) {
  const base = 'https://api.hubapi.com/crm/v3/objects/contacts' +
    '?archived=false&limit=100&properties=' + PB4.HUBSPOT_PROPS.join(',');

  const maxRec = Math.max(1, Math.floor(num_(cfg, 'MAX_PULL_RECORDS', 5000)));
  const budgetMs = num_(cfg, 'PULL_TIME_BUDGET_MIN', 4.5) * 60000;
  const t0 = Date.now();

  let after = null, pages = 0, pulled = 0;

  while (true) {
    const url = base + (after ? '&after=' + after : '');
    const data = hsFetch_(url);
    const results = (data && data.results) ? data.results : [];
    pages++;
    pulled += results.length;
    onPage(results, pulled);

    const next = data && data.paging && data.paging.next && data.paging.next.after;
    if (!next) return { pulled: pulled, pages: pages, stopped: 'complete' };
    if (pulled >= maxRec) return { pulled: pulled, pages: pages, stopped: 'record cap (MAX_PULL_RECORDS=' + maxRec + ')' };
    if (Date.now() - t0 > budgetMs) return { pulled: pulled, pages: pages, stopped: 'time budget (' + num_(cfg, 'PULL_TIME_BUDGET_MIN', 4.5) + ' min) — run pull again to fetch more' };

    after = next;
    Utilities.sleep(120); // gentle pacing, far below HubSpot limits
  }
}
