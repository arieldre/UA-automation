const networkHandler = require('../../api/networks');
const { processNetworkResults, aggregateNetworks } = networkHandler._test;

// ─── processNetworkResults ────────────────────────────────────────────────────

describe('processNetworkResults', () => {
  function mkRow(date, name, id, network, costMicros = 0, clicks = 0, impressions = 0, conversions = 0) {
    return {
      segments: { date, adNetworkType: network },
      campaign: { name, id },
      metrics: { costMicros, clicks: String(clicks), impressions: String(impressions), conversions: String(conversions) },
    };
  }

  test('returns empty structures for empty input', () => {
    const { byDate, campaignIds } = processNetworkResults([]);
    expect(byDate).toEqual({});
    expect(campaignIds).toEqual({});
  });

  test('groups by date, campaign, and network', () => {
    const { byDate, campaignIds } = processNetworkResults([
      mkRow('2026-03-01', 'CampA', '123', 'SEARCH', 1_000_000, 100, 5000, 5),
    ]);
    expect(byDate['2026-03-01']['CampA']['SEARCH'].spend).toBeCloseTo(1);
    expect(byDate['2026-03-01']['CampA']['SEARCH'].clicks).toBe(100);
    expect(byDate['2026-03-01']['CampA']['SEARCH'].impressions).toBe(5000);
    expect(byDate['2026-03-01']['CampA']['SEARCH'].conversions).toBeCloseTo(5);
    expect(campaignIds['CampA']).toBe('123');
  });

  test('accumulates metrics across multiple rows for same date/campaign/network', () => {
    const { byDate } = processNetworkResults([
      mkRow('2026-03-01', 'CampA', '123', 'CONTENT', 1_000_000, 50, 1000, 2),
      mkRow('2026-03-01', 'CampA', '123', 'CONTENT',   500_000, 30,  500, 1),
    ]);
    const net = byDate['2026-03-01']['CampA']['CONTENT'];
    expect(net.spend).toBeCloseTo(1.5);
    expect(net.clicks).toBe(80);
    expect(net.impressions).toBe(1500);
    expect(net.conversions).toBeCloseTo(3);
  });

  test('keeps separate rows for different networks on same day', () => {
    const { byDate } = processNetworkResults([
      mkRow('2026-03-01', 'CampA', '123', 'SEARCH',  1_000_000, 100, 5000),
      mkRow('2026-03-01', 'CampA', '123', 'CONTENT', 2_000_000, 200, 8000),
    ]);
    expect(byDate['2026-03-01']['CampA']['SEARCH'].spend).toBeCloseTo(1);
    expect(byDate['2026-03-01']['CampA']['CONTENT'].spend).toBeCloseTo(2);
  });

  test('captures campaign IDs for multiple campaigns', () => {
    const { campaignIds } = processNetworkResults([
      mkRow('2026-03-01', 'CampA', '111', 'SEARCH'),
      mkRow('2026-03-01', 'CampB', '222', 'SEARCH'),
    ]);
    expect(campaignIds['CampA']).toBe('111');
    expect(campaignIds['CampB']).toBe('222');
  });

  test('skips rows without a date', () => {
    const { byDate } = processNetworkResults([
      { segments: { adNetworkType: 'SEARCH' }, campaign: { name: 'C', id: '1' }, metrics: {} },
    ]);
    expect(byDate).toEqual({});
  });

  test('spans multiple dates', () => {
    const { byDate } = processNetworkResults([
      mkRow('2026-03-01', 'CampA', '1', 'SEARCH', 1_000_000),
      mkRow('2026-03-02', 'CampA', '1', 'SEARCH', 2_000_000),
    ]);
    expect(byDate['2026-03-01']['CampA']['SEARCH'].spend).toBeCloseTo(1);
    expect(byDate['2026-03-02']['CampA']['SEARCH'].spend).toBeCloseTo(2);
  });
});

// ─── aggregateNetworks ────────────────────────────────────────────────────────

describe('aggregateNetworks', () => {
  function mkDay(campaigns) {
    // campaigns: { name: { network: { spend, clicks, impressions, conversions } } }
    return campaigns;
  }

  test('returns empty array for empty input', () => {
    expect(aggregateNetworks({}, {})).toEqual([]);
  });

  test('aggregates a single date correctly', () => {
    const networksByDate = {
      '2026-03-01': { CampA: { SEARCH: { spend: 100, clicks: 500, impressions: 10000, conversions: 5 } } },
    };
    const campaigns = aggregateNetworks(networksByDate, { CampA: '123' });
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].campaignName).toBe('CampA');
    expect(campaigns[0].campaignId).toBe('123');
    const search = campaigns[0].networks.find(n => n.network === 'SEARCH');
    expect(search.spend).toBe(100);
  });

  test('sums the same campaign/network across multiple dates', () => {
    const networksByDate = {
      '2026-03-01': { CampA: { SEARCH: { spend: 100, clicks: 500, impressions: 10000, conversions: 5 } } },
      '2026-03-02': { CampA: { SEARCH: { spend: 150, clicks: 700, impressions: 15000, conversions: 8 } } },
    };
    const [camp] = aggregateNetworks(networksByDate, {});
    const search = camp.networks.find(n => n.network === 'SEARCH');
    expect(search.spend).toBe(250);
    expect(search.clicks).toBe(1200);
    expect(search.impressions).toBe(25000);
    expect(search.conversions).toBeCloseTo(13);
  });

  test('computes CTR, CPM, and CPC correctly', () => {
    const networksByDate = {
      '2026-03-01': { CampA: { SEARCH: { spend: 100, clicks: 500, impressions: 10000, conversions: 5 } } },
    };
    const [camp] = aggregateNetworks(networksByDate, {});
    const n = camp.networks[0];
    expect(n.ctr).toBeCloseTo((500 / 10000) * 100, 2);
    expect(n.cpm).toBeCloseTo((100 / 10000) * 1000, 2);
    expect(n.cpc).toBeCloseTo(100 / 500, 3);
  });

  test('sets CTR/CPM/CPC to null when denominators are zero', () => {
    const networksByDate = {
      '2026-03-01': { CampA: { SEARCH: { spend: 10, clicks: 0, impressions: 0, conversions: 0 } } },
    };
    const [camp] = aggregateNetworks(networksByDate, {});
    const n = camp.networks[0];
    expect(n.ctr).toBeNull();
    expect(n.cpm).toBeNull();
    expect(n.cpc).toBeNull();
  });

  test('filters out zero-spend zero-impression networks', () => {
    const networksByDate = {
      '2026-03-01': {
        CampA: {
          SEARCH:  { spend: 100, clicks: 500, impressions: 10000, conversions: 5 },
          UNKNOWN: { spend: 0,   clicks: 0,   impressions: 0,     conversions: 0 },
        },
      },
    };
    const [camp] = aggregateNetworks(networksByDate, {});
    expect(camp.networks).toHaveLength(1);
    expect(camp.networks[0].network).toBe('SEARCH');
  });

  test('sorts campaigns by total spend descending', () => {
    const networksByDate = {
      '2026-03-01': {
        CampA: { SEARCH: { spend: 100, clicks: 10, impressions: 1000, conversions: 0 } },
        CampB: { SEARCH: { spend: 500, clicks: 50, impressions: 5000, conversions: 0 } },
      },
    };
    const campaigns = aggregateNetworks(networksByDate, {});
    expect(campaigns[0].campaignName).toBe('CampB');
    expect(campaigns[1].campaignName).toBe('CampA');
  });

  test('sorts networks within a campaign by spend descending', () => {
    const networksByDate = {
      '2026-03-01': {
        CampA: {
          SEARCH:  { spend: 100, clicks: 500, impressions: 10000, conversions: 0 },
          CONTENT: { spend: 300, clicks: 800, impressions: 20000, conversions: 0 },
          YOUTUBE: { spend: 200, clicks: 600, impressions: 15000, conversions: 0 },
        },
      },
    };
    const [camp] = aggregateNetworks(networksByDate, {});
    expect(camp.networks[0].network).toBe('CONTENT');
    expect(camp.networks[1].network).toBe('YOUTUBE');
    expect(camp.networks[2].network).toBe('SEARCH');
  });

  test('applies correct labels for known network types', () => {
    const networksByDate = {
      '2026-03-01': {
        CampA: {
          SEARCH:         { spend: 10, clicks: 5, impressions: 100, conversions: 0 },
          CONTENT:        { spend: 10, clicks: 5, impressions: 100, conversions: 0 },
          YOUTUBE:        { spend: 10, clicks: 5, impressions: 100, conversions: 0 },
          SEARCH_PARTNERS:{ spend: 10, clicks: 5, impressions: 100, conversions: 0 },
          MIXED:          { spend: 10, clicks: 5, impressions: 100, conversions: 0 },
        },
      },
    };
    const [camp] = aggregateNetworks(networksByDate, {});
    const labels = Object.fromEntries(camp.networks.map(n => [n.network, n.label]));
    expect(labels['SEARCH']).toBe('Google Search');
    expect(labels['CONTENT']).toBe('Display Network');
    expect(labels['YOUTUBE']).toBe('YouTube');
    expect(labels['SEARCH_PARTNERS']).toBe('Search partners');
    expect(labels['MIXED']).toBe('Cross-network');
  });

  test('uses raw network name as label for unknown types', () => {
    const networksByDate = {
      '2026-03-01': { CampA: { FUTURE_NET: { spend: 10, clicks: 5, impressions: 100, conversions: 0 } } },
    };
    const [camp] = aggregateNetworks(networksByDate, {});
    expect(camp.networks[0].label).toBe('FUTURE_NET');
  });

  test('campaign total is sum of all network totals', () => {
    const networksByDate = {
      '2026-03-01': {
        CampA: {
          SEARCH:  { spend: 100, clicks: 500, impressions: 10000, conversions: 5 },
          CONTENT: { spend: 200, clicks: 800, impressions: 20000, conversions: 8 },
        },
      },
    };
    const [camp] = aggregateNetworks(networksByDate, {});
    expect(camp.total.spend).toBeCloseTo(300);
    expect(camp.total.clicks).toBe(1300);
    expect(camp.total.impressions).toBe(30000);
    expect(camp.total.conversions).toBeCloseTo(13);
  });

  test('campaignId is null when not in map', () => {
    const networksByDate = {
      '2026-03-01': { CampX: { SEARCH: { spend: 10, clicks: 5, impressions: 100, conversions: 0 } } },
    };
    const [camp] = aggregateNetworks(networksByDate, {});
    expect(camp.campaignId).toBeNull();
  });
});
