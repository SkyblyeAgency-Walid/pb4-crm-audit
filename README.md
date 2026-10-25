# PB4 - CRM Health Audit Tool

**Read-only CRM audit that runs inside Google Sheets.** Give it a read-only
HubSpot token or a CSV export from any CRM, and in about a minute it hands
you a 1-page health report: how bad the data is, what it costs, and a
30-day cleanup plan.

> Golden rule: **it never modifies or deletes a single record in your CRM.**
> All findings, clusters and reports land in the audit workbook only.

Part of the Lead-to-CRM suite (PB3 = pipeline builder, PB4 = audit).

---

## Why

CRM databases rot silently: duplicates pile up, dead records inflate seat
counts, invalid emails kill deliverability, opted-out contacts stay in
sequences. Before anyone sells you a "CRM cleanup project", you deserve a
clear, deterministic answer to three questions:

1. How bad is it really? (profile + 20 checks)
2. What is it costing? (transparent assumptions, editable)
3. What gets fixed first? (30-day plan with projected score)

## Quick start (2 minutes, no HubSpot needed)

1. Open a Google Sheet -> Extensions -> Apps Script.
2. Paste the files from `src/` in numeric order (00, 01, 02, ... 20).
   Also add `CsvImportDialog.html` as an HTML file (File -> New -> HTML,
   name it exactly `CsvImportDialog`).
3. Save, reload the spreadsheet -> a **"CRM Health Audit"** menu appears.
4. Run: **(1) Install workbook** -> **(2) Seed demo data** ->
   **(6) RUN FULL AUDIT - current data** -> **(7) Export 1-page PDF**.

Demo output: ~1,256 contacts, deterministic (same numbers every run),
health score ~53/100 - "AT RISK", with 59 duplicate clusters and all
check classes represented.

## Menu reference

| Item | Function | What it does |
|------|----------|--------------|
| 1 Install / repair workbook | `installWorkbook` | Creates all 8 tabs, headers, settings. Idempotent. |
| 2 Seed demo data | `seedDemoData` | ~1,256 demo contacts with controlled defects. |
| 3 PULL from HubSpot | `pullFromHubspot` | Read-only paged pull (100/page, 429-safe). |
| 4 PULL from CSV | `importCsvFile` | Import any CRM export (fuzzy column mapping). |
| 5 RUN FULL AUDIT (Portal) | `runFullAuditPortal` | Pull + profile + checks + score + report. |
| 6 RUN FULL AUDIT (current) | `runFullAuditRaw` | Audit whatever RAW_DATA holds (CSV / demo). |
| 7 Export 1-page PDF | `exportOnePagePdf` | Prints SUMMARY tab to a Drive PDF. |
| 8 Help | `showHelp` | Method notes and quick start. |

## HubSpot setup (Portal mode)

1. HubSpot -> Settings -> Integrations -> Private Apps -> Create.
2. Scopes: `crm.objects.contacts.read` (read-only - that is all it needs).
3. Copy the token. In Apps Script: Project Settings -> Script Properties
   -> add `HUBSPOT_TOKEN` = `<your token>`.
4. Menu 3 (or 5 for one click). Caps: `MAX_PULL_RECORDS` (default 5,000)
   and a 4.5-minute time budget - run the pull again to fetch more.

## CSV mode (any CRM)

Export contacts from Pipedrive / Salesforce / Zoho / HubSpot / Sheets as
CSV, then menu 4. Header mapping is fuzzy: `E-mail`, `email_address`,
`Email 1` all map to `email`; dates in ISO, US, or `15-Mar-2024` form are
parsed automatically (ambiguities are counted in METHOD_LOG).

## Prove-it-works demo files (`demo_data/`)

Two ready-made CRM exports let you demo the full pipeline with zero
setup and no HubSpot portal. These exact numbers were verified by
running the files through this repo's E2E harness (import -> profile ->
all 20 checks -> score -> report), so what you see on screen matches
what is written here:

| File | Records | Score | Grade | Findings | Dup. clusters |
|------|---------|-------|-------|----------|---------------|
| `dirty_crm_export_1200.csv` | 1,250 | **54/100** | AT RISK | 364 (104 HIGH / 260 MEDIUM) | 43 |
| `clean_crm_export_1200.csv` | 1,205 | **95/100** | EXCELLENT | 51 (5 HIGH / 46 MEDIUM) | 5 |

Usage: menu **4** -> pick the file -> menu **6**. The dirty file fires
every check class (H-01..H-20), includes 30 AUTO-FIXABLE and 81
ARCHIVE-CANDIDATE findings; the clean file proves the score moves with
the data (a 41-point swing, not a fixed number).

The files are deterministic (seeded RNG) and their dates are relative
to generation day, with wide buffers around the 30/60/90-day staleness
thresholds. Demoing months later? Regenerate fresh copies with
`node tools/gen_pb4_csv.js`, or use menu 2 (the in-sheet demo generator,
which always computes dates at run time).

## Workbook map

| Tab | Purpose |
|-----|---------|
| SUMMARY | The 1-page report: score, findings, costs, 30-day plan. |
| FINDINGS | One row per finding: check, severity, disposition, record, suggested fix. |
| DUPLICATE_CLUSTERS | Merge suggestions with a recommended primary record. |
| STALE_LIST | Dead/decaying records with days-idle and next action. |
| RAW_DATA | Canonical snapshot of what was scanned (text-format, immutable per run). |
| PROFILE | Field fill rates and distinct counts. |
| METHOD_LOG | Stage-by-stage run log - every number is reproducible. |
| SETTINGS | Thresholds, scoring weights, cost assumptions, domain lists. |

## The 20 checks (H-01 ... H-20)

| Class | Checks |
|-------|--------|
| A - Duplicates | H-01 exact email - H-02 Gmail-equivalent (dots/+tag) - H-03 phone fingerprint (last 8 of E.164) - H-04 same name + company |
| B - Stale | H-05 no activity > STALE_DAYS - H-06 never activated - H-07 abandoned MQL/SQL/Opportunity |
| C - Completeness | H-08 email - H-09 phone - H-10 company - H-11 name |
| D - Validity | H-12 email format - H-13 disposable domain - H-14 phone invalid / non-E.164 - H-15 junk name - H-19 role-based inbox |
| E - Process | H-16 customer w/o qualified status - H-17 active lead w/o owner - H-18 missing lifecycle - H-20 opted-out still in pipeline |

v1 policy: **deterministic keys only** - no fuzzy/probabilistic matching,
so every finding is explainable line-by-line.

## Dispositions

- **AUTO-FIXABLE** - the exact fix is computable (e.g. reformat a valid
  phone to E.164).
- **REVIEW** - a human should decide (merges, enrichments).
- **ARCHIVE-CANDIDATE** - dead data; propose archiving, never deletion.

## Health score

```
score = 100 - (Wc x HIGH + Wm x MEDIUM) / records x 100
```

`Wc` = 3, `Wm` = 1 by default (SETTINGS: `SCORE_WEIGHT_CRITICAL` /
`SCORE_WEIGHT_MEDIUM`). Bands: 90+ Excellent, 75-89 Healthy, 50-74
At Risk, <50 Critical. SUMMARY also shows the projected score after the
30-day plan (70% of HIGH + 50% of MEDIUM resolved).

## Cost model (all assumptions editable in SETTINGS)

- Wasted outreach touches = (H-05 + H-06 + H-20) x `COST_PER_TOUCH`
- Duplicate bloat = redundant records x `COST_PER_RECORD_MONTH` x 12
- Pipeline at risk = H-07 x `AVG_DEAL_SIZE` x `CLOSE_RATE`

## Engineering notes

- Batch/chunked reads+writes (5,000-row chunks), text-format columns so
  `+212...`, `00123`, `2024-01-02` are never mangled by Sheets.
- `hsFetch_`: exponential backoff on 429/5xx honoring `Retry-After`;
  hard-stops at record cap or time budget; partial pulls are logged.
- Document lock per stage; each stage is independently re-runnable.
- Token in Script Properties only - no secrets in code.
- Deterministic demo: seeded mulberry32 RNG (seed 20241024).

## Roadmap

- v1.1: fuzzy name matching (Levenshtein), deals API checks (closed-won),
  Salesforce/Pipedrive native connectors.
- v1.2: one-click AUTO-FIX export back to HubSpot (opt-in, diff preview).
- v1.3: scheduled weekly re-audit with score trend chart.

## License

MIT - see `LICENSE`.
