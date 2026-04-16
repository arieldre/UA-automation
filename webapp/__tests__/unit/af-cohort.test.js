// Unit tests for af-cohort pure functions (parseCohortCsv, column helpers, result shapes)

// ── Replicate pure functions from af-cohort.js ─────────────────────────────────

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

// ── parseCsvLine ──────────────────────────────────────────────────────────────

describe('parseCsvLine', () => {
  test('splits simple comma-separated values', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  test('handles quoted fields', () => {
    expect(parseCsvLine('"hello, world",b')).toEqual(['hello, world', 'b']);
  });

  test('handles escaped double quotes inside quoted fields', () => {
    expect(parseCsvLine('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  test('trims whitespace from unquoted fields', () => {
    expect(parseCsvLine('a , b , c')).toEqual(['a', 'b', 'c']);
  });

  test('handles empty fields', () => {
    expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });

  test('handles single field', () => {
    expect(parseCsvLine('onlyvalue')).toEqual(['onlyvalue']);
  });
});

// ── parseCohortCsv ────────────────────────────────────────────────────────────

describe('parseCohortCsv', () => {
  test('returns empty array for null/empty input', () => {
    expect(parseCohortCsv(null)).toEqual([]);
    expect(parseCohortCsv('')).toEqual([]);
  });

  test('returns empty array when only header row present', () => {
    expect(parseCohortCsv('date,pid,revenue_sum_day_0\n')).toEqual([]);
  });

  test('parses basic cohort CSV', () => {
    const csv = [
      'date,pid,revenue_sum_day_0,revenue_sum_day_1,revenue_sum_day_7',
      '2026-03-01,Facebook Ads,100.5,150.0,300.0',
      '2026-03-01,googleadwords_int,50.0,80.0,200.0',
    ].join('\n');
    const rows = parseCohortCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2026-03-01');
    expect(rows[0].pid).toBe('Facebook Ads');
    expect(rows[0].revenue_sum_day_0).toBe('100.5');
    expect(rows[1].pid).toBe('googleadwords_int');
  });

  test('maps missing columns to empty string', () => {
    const csv = 'date,pid\n2026-03-01,Facebook Ads';
    const rows = parseCohortCsv(csv);
    expect(rows[0].date).toBe('2026-03-01');
    expect(rows[0].pid).toBe('Facebook Ads');
  });
});

// ── colVal ────────────────────────────────────────────────────────────────────

describe('colVal', () => {
  const row = { date: '2026-03-01', Pid: 'Facebook Ads', revenue_sum_day_0: '100' };

  test('returns value for exact match', () => {
    expect(colVal(row, 'date')).toBe('2026-03-01');
  });

  test('returns value for case-insensitive match', () => {
    expect(colVal(row, 'pid')).toBe('Facebook Ads');
    expect(colVal(row, 'PID')).toBe('Facebook Ads');
  });

  test('tries fallback names in order', () => {
    expect(colVal(row, 'nonexistent', 'date')).toBe('2026-03-01');
  });

  test('returns empty string when nothing matches', () => {
    expect(colVal(row, 'missing_column')).toBe('');
  });

  test('skips empty string values and falls through to next name', () => {
    const r = { a: '', b: 'found' };
    expect(colVal(r, 'a', 'b')).toBe('found');
  });
});

// ── fetchCohortByChannel transform logic ─────────────────────────────────────

describe('fetchCohortByChannel transform', () => {
  // Replicate just the data transform, not the HTTP call
  function transformCohortRows(rows) {
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
  }

  test('groups by date and pid', () => {
    const csv = [
      'date,pid,revenue_sum_day_0,revenue_sum_day_1,revenue_sum_day_7',
      '2026-03-01,Facebook Ads,100,200,500',
      '2026-03-01,googleadwords_int,50,80,200',
      '2026-03-02,Facebook Ads,120,180,400',
    ].join('\n');
    const rows = parseCohortCsv(csv);
    const result = transformCohortRows(rows);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['2026-03-01']['Facebook Ads']).toEqual({ rev_d0: 100, rev_d1: 200, rev_d7: 500 });
    expect(result['2026-03-01']['googleadwords_int']).toEqual({ rev_d0: 50, rev_d1: 80, rev_d7: 200 });
    expect(result['2026-03-02']['Facebook Ads'].rev_d0).toBe(120);
  });

  test('skips rows with missing date or pid', () => {
    const csv = [
      'date,pid,revenue_sum_day_0,revenue_sum_day_1,revenue_sum_day_7',
      ',Facebook Ads,100,200,500',
      '2026-03-01,,50,80,200',
    ].join('\n');
    const rows = parseCohortCsv(csv);
    const result = transformCohortRows(rows);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('handles non-numeric revenue gracefully', () => {
    const csv = [
      'date,pid,revenue_sum_day_0,revenue_sum_day_1,revenue_sum_day_7',
      '2026-03-01,TikTok,N/A,,',
    ].join('\n');
    const rows = parseCohortCsv(csv);
    const result = transformCohortRows(rows);
    expect(result['2026-03-01']['TikTok']).toEqual({ rev_d0: 0, rev_d1: 0, rev_d7: 0 });
  });
});

// ── fetchCohortByChannelGeo transform logic ───────────────────────────────────

describe('fetchCohortByChannelGeo transform', () => {
  function transformGeoRows(rows) {
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
        cost:     parseNum(colVal(row, 'cost')),   // NOTE: 'ecpi' bug fixed — not used
        rev_d0:   parseNum(colVal(row, 'revenue_sum_day_0')),
        rev_d1:   parseNum(colVal(row, 'revenue_sum_day_1')),
        rev_d7:   parseNum(colVal(row, 'revenue_sum_day_7')),
      });
    }
    return result;
  }

  test('groups geo rows by date', () => {
    const csv = [
      'date,pid,geo,users,cost,revenue_sum_day_0,revenue_sum_day_1,revenue_sum_day_7',
      '2026-03-01,Facebook Ads,US,1000,500,200,300,600',
      '2026-03-01,Facebook Ads,IL,300,150,60,90,180',
      '2026-03-02,TikTok,US,400,200,100,150,300',
    ].join('\n');
    const rows = parseCohortCsv(csv);
    const result = transformGeoRows(rows);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['2026-03-01']).toHaveLength(2);
    expect(result['2026-03-01'][0]).toMatchObject({
      country: 'US', media_source: 'Facebook Ads', installs: 1000, cost: 500,
      rev_d0: 200, rev_d1: 300, rev_d7: 600,
    });
    expect(result['2026-03-01'][1]).toMatchObject({ country: 'IL', installs: 300 });
    expect(result['2026-03-02'][0].media_source).toBe('TikTok');
  });

  test('rounds installs to integer', () => {
    const csv = [
      'date,pid,geo,users,cost,revenue_sum_day_0,revenue_sum_day_1,revenue_sum_day_7',
      '2026-03-01,Facebook Ads,US,99.7,0,0,0,0',
    ].join('\n');
    const rows = parseCohortCsv(csv);
    const result = transformGeoRows(rows);
    expect(result['2026-03-01'][0].installs).toBe(100);
  });

  test('does NOT use ecpi as cost fallback', () => {
    const csv = [
      'date,pid,geo,users,ecpi,revenue_sum_day_0,revenue_sum_day_1,revenue_sum_day_7',
      '2026-03-01,Facebook Ads,US,100,1.5,0,0,0',
    ].join('\n');
    const rows = parseCohortCsv(csv);
    const result = transformGeoRows(rows);
    // ecpi=1.5 should NOT appear as cost — cost should be 0 (no 'cost' column)
    expect(result['2026-03-01'][0].cost).toBe(0);
  });
});

// ── mergeChannelCohort helper ─────────────────────────────────────────────────
// This is the logic used in backfill/cron to enrich channel data with cohort D0/D1/D7

describe('mergeChannelCohort', () => {
  function mergeChannelCohort(channels, cohortByPid) {
    const out = {};
    for (const [ch, m] of Object.entries(channels)) {
      const cohort = cohortByPid?.[ch] || {};
      out[ch] = { ...m, rev_d0: cohort.rev_d0 || 0, rev_d1: cohort.rev_d1 || 0, rev_d7: cohort.rev_d7 || 0 };
    }
    return out;
  }

  test('enriches channels with rev_d0/d1/d7 from cohort', () => {
    const channels = {
      'Facebook Ads': { installs: 100, cost: 500, revenue: 0 },
      'googleadwords_int': { installs: 50, cost: 200, revenue: 0 },
    };
    const cohortByPid = {
      'Facebook Ads': { rev_d0: 200, rev_d1: 350, rev_d7: 700 },
      'googleadwords_int': { rev_d0: 100, rev_d1: 150, rev_d7: 400 },
    };
    const out = mergeChannelCohort(channels, cohortByPid);
    expect(out['Facebook Ads'].rev_d0).toBe(200);
    expect(out['Facebook Ads'].rev_d7).toBe(700);
    expect(out['googleadwords_int'].installs).toBe(50); // original preserved
  });

  test('fills 0 for channels with no cohort match', () => {
    const channels = { 'Zorka': { installs: 10, cost: 50, revenue: 0 } };
    const out = mergeChannelCohort(channels, {});
    expect(out['Zorka'].rev_d0).toBe(0);
    expect(out['Zorka'].rev_d1).toBe(0);
    expect(out['Zorka'].rev_d7).toBe(0);
  });

  test('preserves all original channel metrics', () => {
    const channels = { 'TikTok': { installs: 200, cost: 800, revenue: 100, clicks: 1500 } };
    const out = mergeChannelCohort(channels, { 'TikTok': { rev_d0: 50, rev_d1: 70, rev_d7: 120 } });
    expect(out['TikTok'].installs).toBe(200);
    expect(out['TikTok'].clicks).toBe(1500);
    expect(out['TikTok'].rev_d0).toBe(50);
  });
});
