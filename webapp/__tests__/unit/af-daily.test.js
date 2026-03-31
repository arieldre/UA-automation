// Unit tests for af-daily data transform helpers

// Replicated from the frontend JS so we can test in Node
function deriveMetric(metric, { installs = 0, cost = 0, revenue = 0 }) {
  if (metric === 'installs') return installs;
  if (metric === 'cost')     return cost;
  if (metric === 'revenue')  return revenue;
  if (metric === 'cpa')      return installs > 0 ? cost / installs : 0;
  if (metric === 'roas')     return cost > 0 ? revenue / cost : 0;
  return 0;
}

// Replicated from af-daily.js — builds dates/channels union from android+ios data
function buildResponseMeta(android, ios, from, to) {
  const dateSet    = new Set([...Object.keys(android), ...Object.keys(ios)]);
  const dates      = [...dateSet].sort();
  const channelSet = new Set();
  for (const dayData of [...Object.values(android), ...Object.values(ios)]) {
    for (const ch of Object.keys(dayData)) channelSet.add(ch);
  }
  const channels = [...channelSet].sort();
  return { from, to, dates, channels, android, ios };
}

// ── deriveMetric ──────────────────────────────────────────

describe('deriveMetric', () => {
  const d = { installs: 100, cost: 500, revenue: 1000 };

  test('installs returns installs', () => {
    expect(deriveMetric('installs', d)).toBe(100);
  });

  test('cost returns cost', () => {
    expect(deriveMetric('cost', d)).toBe(500);
  });

  test('revenue returns revenue', () => {
    expect(deriveMetric('revenue', d)).toBe(1000);
  });

  test('cpa = cost / installs', () => {
    expect(deriveMetric('cpa', d)).toBeCloseTo(5, 5);
  });

  test('roas = revenue / cost', () => {
    expect(deriveMetric('roas', d)).toBeCloseTo(2, 5);
  });

  test('cpa is 0 when installs = 0', () => {
    expect(deriveMetric('cpa', { installs: 0, cost: 100, revenue: 0 })).toBe(0);
  });

  test('roas is 0 when cost = 0', () => {
    expect(deriveMetric('roas', { installs: 0, cost: 0, revenue: 500 })).toBe(0);
  });

  test('unknown metric returns 0', () => {
    expect(deriveMetric('clicks', d)).toBe(0);
  });

  test('handles missing fields gracefully', () => {
    expect(deriveMetric('installs', {})).toBe(0);
    expect(deriveMetric('cpa', {})).toBe(0);
  });
});

// ── buildResponseMeta ─────────────────────────────────────

describe('buildResponseMeta — dates and channels', () => {
  test('returns sorted union of dates from both platforms', () => {
    const android = { '2026-03-03': {}, '2026-03-01': {} };
    const ios     = { '2026-03-02': {}, '2026-03-01': {} };
    const { dates } = buildResponseMeta(android, ios, '2026-03-01', '2026-03-03');
    expect(dates).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  test('returns sorted union of channel keys', () => {
    const android = { '2026-03-01': { ACI_Search: {}, ACI_Display: {} } };
    const ios     = { '2026-03-01': { ACI_Search: {}, ACI_YouTube: {} } };
    const { channels } = buildResponseMeta(android, ios, '2026-03-01', '2026-03-01');
    expect(channels).toEqual(['ACI_Display', 'ACI_Search', 'ACI_YouTube']);
  });

  test('handles empty platforms', () => {
    const { dates, channels } = buildResponseMeta({}, {}, '2026-03-01', '2026-03-07');
    expect(dates).toEqual([]);
    expect(channels).toEqual([]);
  });

  test('passes through android and ios data unchanged', () => {
    const android = { '2026-03-01': { ACI_Search: { installs: 60, cost: 30, revenue: 120 } } };
    const ios     = { '2026-03-01': { ACI_Search: { installs: 40, cost: 20, revenue: 80  } } };
    const resp = buildResponseMeta(android, ios, '2026-03-01', '2026-03-01');
    expect(resp.android['2026-03-01'].ACI_Search.installs).toBe(60);
    expect(resp.ios['2026-03-01'].ACI_Search.revenue).toBe(80);
  });
});
