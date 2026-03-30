// server.js exports app + _test pure functions
// The require.main guard prevents app.listen() from firing during tests
const app = require('../../server');
const { parseAF, mergeAFData, processGAResults, aggregateGA, computeMetrics, buildCampaignList } = app._test;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AF_HEADER = 'Date,Campaign (c),Installs,Clicks,Impressions,Total Cost,Total Revenue,Average eCPI,ROI,af_purchase (Event counter),af_purchase (Unique users),af_purchase (Sales in USD)';

function afRow(date, camp, installs = 0, clicks = 0, imp = 0, cost = 0, rev = 0, purchases = 0, purchasers = 0, purchaseRev = 0) {
  return `${date},${camp},${installs},${clicks},${imp},${cost.toFixed(2)},${rev.toFixed(2)},0.00,0%,${purchases},${purchasers},${purchaseRev.toFixed(2)}`;
}

function gaResult(date, name, costMicros = 0, clicks = 0, impressions = 0, conversions = 0) {
  return {
    segments: { date },
    campaign: { name },
    metrics: {
      costMicros,
      clicks:              String(clicks),
      impressions:         String(impressions),
      conversions:         String(conversions),
      conversionsValue:    '0',
      allConversions:      String(conversions),
      allConversionsValue: '0',
      averageCpm:          '0',
    },
  };
}

function zeroCamp() {
  return { installs: 0, clicks: 0, impressions: 0, cost: 0, revenue: 0,
           ecpi: 0, roi: 'N/A', purchases: 0, purchasers: 0, purchaseRev: 0 };
}

// ─── parseAF ──────────────────────────────────────────────────────────────────

describe('parseAF', () => {
  test('returns empty structure on _afError', () => {
    const r = parseAF({ _afError: 'rate limit exceeded' });
    expect(r.byDate).toEqual({});
    expect(r.aggregate.total).toBe(0);
    expect(r.aggregate.byCampaign).toEqual({});
    expect(r._debug).toBe('rate limit exceeded');
  });

  test('parses a single data row', () => {
    const csv = `${AF_HEADER}\n${afRow('2026-03-01', 'CampA', 100, 500, 10000, 200, 1000, 10, 8, 800)}`;
    const r = parseAF({ _csv: csv });

    const day = r.byDate['2026-03-01'];
    expect(day.total).toBe(100);
    expect(day.byCampaign['CampA'].installs).toBe(100);
    expect(day.byCampaign['CampA'].clicks).toBe(500);
    expect(day.byCampaign['CampA'].impressions).toBe(10000);
    expect(day.byCampaign['CampA'].cost).toBeCloseTo(200);
    expect(day.byCampaign['CampA'].revenue).toBeCloseTo(1000);
    expect(day.byCampaign['CampA'].purchases).toBe(10);
    expect(day.byCampaign['CampA'].purchasers).toBe(8);
    expect(day.byCampaign['CampA'].purchaseRev).toBeCloseTo(800);

    expect(r.aggregate.total).toBe(100);
    expect(r.aggregate.byCampaign['CampA'].installs).toBe(100);
  });

  test('accumulates multiple rows for same date and campaign', () => {
    const csv = [
      AF_HEADER,
      afRow('2026-03-01', 'CampA', 50, 200, 5000, 100, 500, 5, 4, 400),
      afRow('2026-03-01', 'CampA', 30, 100, 2000, 60,  300, 3, 2, 200),
    ].join('\n');
    const r = parseAF({ _csv: csv });
    expect(r.byDate['2026-03-01'].byCampaign['CampA'].installs).toBe(80);
    expect(r.aggregate.byCampaign['CampA'].installs).toBe(80);
    expect(r.aggregate.total).toBe(80);
  });

  test('handles multiple dates', () => {
    const csv = [
      AF_HEADER,
      afRow('2026-03-01', 'CampA', 100),
      afRow('2026-03-02', 'CampA', 120),
    ].join('\n');
    const r = parseAF({ _csv: csv });
    expect(Object.keys(r.byDate)).toHaveLength(2);
    expect(r.byDate['2026-03-01'].total).toBe(100);
    expect(r.byDate['2026-03-02'].total).toBe(120);
    expect(r.aggregate.total).toBe(220);
  });

  test('returns zero totals for header-only CSV', () => {
    const r = parseAF({ _csv: AF_HEADER + '\n' });
    expect(r.aggregate.total).toBe(0);
    expect(r._debug).toMatch(/0 data rows/);
  });

  test('handles multiple campaigns on same date', () => {
    const csv = [
      AF_HEADER,
      afRow('2026-03-01', 'CampA', 100),
      afRow('2026-03-01', 'CampB', 50),
    ].join('\n');
    const r = parseAF({ _csv: csv });
    expect(r.byDate['2026-03-01'].total).toBe(150);
    expect(Object.keys(r.byDate['2026-03-01'].byCampaign)).toHaveLength(2);
  });
});

// ─── mergeAFData ──────────────────────────────────────────────────────────────

describe('mergeAFData', () => {
  test('sums installs for overlapping campaigns', () => {
    const a = { CampA: { ...zeroCamp(), installs: 100 } };
    const b = { CampA: { ...zeroCamp(), installs: 50  } };
    expect(mergeAFData(a, b).CampA.installs).toBe(150);
  });

  test('includes unique campaigns from each side', () => {
    const merged = mergeAFData(
      { CampA: { ...zeroCamp(), installs: 100 } },
      { CampB: { ...zeroCamp(), installs: 50  } },
    );
    expect(merged.CampA.installs).toBe(100);
    expect(merged.CampB.installs).toBe(50);
  });

  test('both empty returns empty', () => {
    expect(Object.keys(mergeAFData({}, {}))).toHaveLength(0);
  });

  test('one empty side passes through intact', () => {
    const merged = mergeAFData({ CampA: { ...zeroCamp(), installs: 100, cost: 200 } }, {});
    expect(merged.CampA.installs).toBe(100);
    expect(merged.CampA.cost).toBe(200);
  });

  test('sums all numeric fields', () => {
    const mk = (n) => ({ installs: n, clicks: n, impressions: n, cost: n, revenue: n,
                         purchases: n, purchasers: n, purchaseRev: n });
    const merged = mergeAFData({ C: mk(10) }, { C: mk(5) });
    expect(merged.C.installs).toBe(15);
    expect(merged.C.cost).toBe(15);
    expect(merged.C.revenue).toBe(15);
  });
});

// ─── processGAResults ─────────────────────────────────────────────────────────

describe('processGAResults', () => {
  test('groups by date and campaign', () => {
    const results = [
      gaResult('2026-03-01', 'CampA', 1_000_000, 100, 5000, 5),
      gaResult('2026-03-01', 'CampB', 2_000_000, 200, 8000, 10),
    ];
    const r = processGAResults(results, []);
    expect(r['2026-03-01']['CampA'].spend).toBeCloseTo(1);
    expect(r['2026-03-01']['CampB'].spend).toBeCloseTo(2);
  });

  test('accumulates multiple rows for same date and campaign', () => {
    const results = [
      gaResult('2026-03-01', 'CampA', 1_000_000, 100, 5000),
      gaResult('2026-03-01', 'CampA',   500_000,  50, 2000),
    ];
    const r = processGAResults(results, []);
    expect(r['2026-03-01']['CampA'].spend).toBeCloseTo(1.5);
    expect(r['2026-03-01']['CampA'].clicks).toBe(150);
    expect(r['2026-03-01']['CampA'].impressions).toBe(7000);
  });

  test('skips rows without a date', () => {
    const r = processGAResults([{ campaign: { name: 'X' }, metrics: {} }], []);
    expect(Object.keys(r)).toHaveLength(0);
  });

  test('merges purchase data from purchaseResults', () => {
    const results  = [gaResult('2026-03-01', 'CampA', 1_000_000)];
    const purchases = [{
      segments: { date: '2026-03-01' },
      campaign: { name: 'CampA' },
      metrics: { conversions: '5', conversionsValue: '100' },
    }];
    const r = processGAResults(results, purchases);
    expect(r['2026-03-01']['CampA'].purchases).toBe(5);
    expect(r['2026-03-01']['CampA'].purchaseRevenue).toBeCloseTo(100);
  });

  test('spans multiple dates', () => {
    const results = [
      gaResult('2026-03-01', 'CampA', 1_000_000),
      gaResult('2026-03-02', 'CampA', 2_000_000),
    ];
    const r = processGAResults(results, []);
    expect(Object.keys(r)).toHaveLength(2);
    expect(r['2026-03-02']['CampA'].spend).toBeCloseTo(2);
  });
});

// ─── aggregateGA ──────────────────────────────────────────────────────────────

describe('aggregateGA', () => {
  const dayMetrics = (spend, clicks, impressions, conversions = 0) => ({
    spend, clicks, impressions, conversions, revenue: 0, allConversions: conversions,
    allRevenue: 0, purchases: 0, purchaseRevenue: 0, cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  });

  test('sums spend and clicks across multiple dates', () => {
    const byDate = {
      '2026-03-01': { CampA: dayMetrics(100, 500, 10000) },
      '2026-03-02': { CampA: dayMetrics(150, 700, 15000) },
    };
    const agg = aggregateGA(byDate);
    expect(agg['CampA'].spend).toBeCloseTo(250);
    expect(agg['CampA'].clicks).toBe(1200);
    expect(agg['CampA'].impressions).toBe(25000);
  });

  test('aggregates multiple campaigns independently', () => {
    const byDate = {
      '2026-03-01': {
        CampA: dayMetrics(100, 500, 10000),
        CampB: dayMetrics(200, 800, 20000),
      },
    };
    const agg = aggregateGA(byDate);
    expect(agg['CampA'].spend).toBeCloseTo(100);
    expect(agg['CampB'].spend).toBeCloseTo(200);
  });

  test('returns empty object for empty input', () => {
    expect(aggregateGA({})).toEqual({});
  });
});

// ─── computeMetrics ───────────────────────────────────────────────────────────

describe('computeMetrics', () => {
  const gaBase = {
    spend: 100, clicks: 500, impressions: 10000, conversions: 10,
    revenue: 0, allConversions: 10, allRevenue: 0,
    purchases: 5, purchaseRevenue: 50, cpm: 10,
  };

  test('calculates GA CTR correctly', () => {
    const { ga } = computeMetrics({ C: gaBase }, {}, 0);
    expect(ga.ctr).toBeCloseTo((500 / 10000) * 100, 3);
  });

  test('calculates GA CPA correctly', () => {
    const { ga } = computeMetrics({ C: gaBase }, {}, 0);
    expect(ga.cpa).toBeCloseTo(100 / 10, 3);
  });

  test('returns null CTR and CPA when no impressions or conversions', () => {
    const { ga } = computeMetrics(
      { C: { ...gaBase, clicks: 0, impressions: 0, conversions: 0 } }, {}, 0,
    );
    expect(ga.ctr).toBeNull();
    expect(ga.cpa).toBeNull();
  });

  test('calculates AF eCPI correctly', () => {
    const af = { C: { ...zeroCamp(), installs: 50, cost: 100 } };
    const { af: afOut } = computeMetrics({}, af, 50);
    expect(afOut.ecpi).toBeCloseTo(2); // 100 / 50
    expect(afOut.installs).toBe(50);
  });

  test('sums GA spend across multiple campaigns', () => {
    const { ga } = computeMetrics(
      {
        CampA: { ...gaBase, spend: 100 },
        CampB: { ...gaBase, spend: 200, clicks: 1000, impressions: 20000 },
      },
      {}, 0,
    );
    expect(ga.spend).toBeCloseTo(300);
  });
});

// ─── buildCampaignList ────────────────────────────────────────────────────────

describe('buildCampaignList', () => {
  const gaByName = {
    CampA: {
      spend: 100, clicks: 500, impressions: 10000, conversions: 10,
      revenue: 0, allConversions: 10, allRevenue: 0,
      purchases: 5, purchaseRevenue: 50, cpm: 10,
    },
  };

  test('creates one entry per GA campaign', () => {
    const list = buildCampaignList(gaByName, {});
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('CampA');
  });

  test('includes GA metrics', () => {
    const list = buildCampaignList(gaByName, {});
    expect(list[0].ga.spend).toBeCloseTo(100);
    expect(list[0].ga.clicks).toBe(500);
  });

  test('includes AF data when available', () => {
    const afByCampaign = { CampA: { ...zeroCamp(), installs: 50, cost: 100 } };
    const list = buildCampaignList(gaByName, afByCampaign);
    expect(list[0].af.installs).toBe(50);
  });

  test('uses zero AF data when campaign has no AF match', () => {
    const list = buildCampaignList(gaByName, {});
    expect(list[0].af.installs).toBe(0);
  });
});
