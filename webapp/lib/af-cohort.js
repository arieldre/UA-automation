'use strict';

const COHORT_URL = 'https://hq1.appsflyer.com/api/cohorts/v1/data/app';

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const fields = [];
  let i = 0, field = '';
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { field += line[i++]; }
      }
    } else if (line[i] === ',') {
      fields.push(field.trim());
      field = '';
      i++;
    } else {
      field += line[i++];
    }
  }
  fields.push(field.trim());
  return fields;
}

function parseCohortCsv(rawText) {
  if (!rawText) return [];
  const lines = rawText.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function colVal(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== '') return row[name];
    const lower = name.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === lower && row[k] !== '') return row[k];
    }
  }
  return '';
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function cohortRequest(appId, body) {
  const token = process.env.APPSFLYER_TOKEN?.trim();
  if (!token) {
    console.warn('[af-cohort] APPSFLYER_TOKEN not set');
    return null;
  }

  const url = `${COHORT_URL}/${appId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (text.trimStart().startsWith('{')) {
    console.warn('[af-cohort] API returned JSON error:', text.slice(0, 300));
    return null;
  }

  if (!res.ok) {
    console.warn(`[af-cohort] HTTP ${res.status}:`, text.slice(0, 300));
    return null;
  }

  return text;
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Fetch cohort revenue grouped by channel (pid) and date.
 *
 * @param {string} appId  - AppsFlyer app ID
 * @param {string} from   - Start date 'YYYY-MM-DD'
 * @param {string} to     - End date 'YYYY-MM-DD'
 * @returns {Promise<Object>} - { [date]: { [pid]: { rev_d0, rev_d1, rev_d7 } } }
 */
async function fetchCohortByChannel(appId, from, to) {
  try {
    const raw = await cohortRequest(appId, {
      cohort_type: 'user_acquisition',
      aggregation_type: 'cumulative',
      min_cohort_size: 1,
      groupings: ['pid', 'date'],
      kpis: ['revenue'],
      periods: [0, 1, 7],
      from,
      to,
      partial_data: true,
    });

    if (!raw) return {};

    const rows = parseCohortCsv(raw);
    const result = {};

    for (const row of rows) {
      const date = (colVal(row, 'date') || '').trim();
      const pid  = (colVal(row, 'pid') || '').trim();
      if (!date || !pid) continue;

      if (!result[date]) result[date] = {};
      result[date][pid] = {
        rev_d0: parseNum(colVal(row, 'revenue_sum_day_0')),
        rev_d1: parseNum(colVal(row, 'revenue_sum_day_1')),
        rev_d7: parseNum(colVal(row, 'revenue_sum_day_7')),
      };
    }

    return result;
  } catch (e) {
    console.warn('[af-cohort] fetchCohortByChannel error:', e.message);
    return {};
  }
}

/**
 * Fetch cohort revenue grouped by channel (pid), date, and geo.
 *
 * @param {string} appId  - AppsFlyer app ID
 * @param {string} from   - Start date 'YYYY-MM-DD'
 * @param {string} to     - End date 'YYYY-MM-DD'
 * @returns {Promise<Object>} - { [date]: [ { country, media_source, installs, cost, rev_d0, rev_d1, rev_d7 } ] }
 */
async function fetchCohortByChannelGeo(appId, from, to) {
  try {
    const raw = await cohortRequest(appId, {
      cohort_type: 'user_acquisition',
      aggregation_type: 'cumulative',
      min_cohort_size: 1,
      groupings: ['pid', 'date', 'geo'],
      kpis: ['revenue'],
      periods: [0, 1, 7],
      from,
      to,
      partial_data: true,
    });

    if (!raw) return {};

    const rows = parseCohortCsv(raw);
    const result = {};

    for (const row of rows) {
      const date    = (colVal(row, 'date') || '').trim();
      const pid     = (colVal(row, 'pid') || '').trim();
      const country = (colVal(row, 'geo') || '').trim();
      if (!date || !pid) continue;

      if (!result[date]) result[date] = [];
      result[date].push({
        country,
        media_source: pid,
        installs: Math.round(parseNum(colVal(row, 'users'))),
        cost:     parseNum(colVal(row, 'cost')),
        rev_d0:   parseNum(colVal(row, 'revenue_sum_day_0')),
        rev_d1:   parseNum(colVal(row, 'revenue_sum_day_1')),
        rev_d7:   parseNum(colVal(row, 'revenue_sum_day_7')),
      });
    }

    return result;
  } catch (e) {
    console.warn('[af-cohort] fetchCohortByChannelGeo error:', e.message);
    return {};
  }
}

/**
 * Fetch cohort retention rates grouped by channel (pid) and date.
 *
 * @param {string} appId  - AppsFlyer app ID
 * @param {string} from   - Start date 'YYYY-MM-DD'
 * @param {string} to     - End date 'YYYY-MM-DD'
 * @returns {Promise<Object>} - { [date]: { [pid]: { ret_d1, ret_d7, ret_d30 } } }
 */
async function fetchCohortRetention(appId, from, to) {
  try {
    const raw = await cohortRequest(appId, {
      cohort_type: 'user_acquisition',
      aggregation_type: 'cumulative',
      min_cohort_size: 1,
      groupings: ['pid', 'date'],
      kpis: ['retention_rate'],
      periods: [1, 7, 30],
      from,
      to,
      partial_data: true,
    });

    if (!raw) return {};

    const rows = parseCohortCsv(raw);
    const result = {};

    for (const row of rows) {
      const date = (colVal(row, 'date') || '').trim();
      const pid  = (colVal(row, 'pid') || '').trim();
      if (!date || !pid) continue;

      if (!result[date]) result[date] = {};
      result[date][pid] = {
        ret_d1:  parseNum(colVal(row, 'retention_rate_conversion_rate_day_1')),
        ret_d7:  parseNum(colVal(row, 'retention_rate_conversion_rate_day_7')),
        ret_d30: parseNum(colVal(row, 'retention_rate_conversion_rate_day_30')),
      };
    }

    return result;
  } catch (e) {
    console.warn('[af-cohort] fetchCohortRetention error:', e.message);
    return {};
  }
}

module.exports = { fetchCohortByChannel, fetchCohortByChannelGeo, fetchCohortRetention };
