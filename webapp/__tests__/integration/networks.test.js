const express  = require('express');
const supertest = require('supertest');

jest.mock('../../db', () => ({
  getMissingNetworksDates: jest.fn(),
  storeNetworksByDate:     jest.fn().mockResolvedValue(undefined),
  getNetworksByDate:       jest.fn(),
  getCampaigns:            jest.fn(),
}));

const db = require('../../db');
global.fetch = jest.fn();

const networkHandler = require('../../api/networks');
const app = express();
app.get('/api/networks', networkHandler);
const request = supertest(app);

const MOCK_TOKEN    = { access_token: 'mock-token', expires_in: 1 };
const MOCK_NET_BY_DATE = {
  '2026-03-01': {
    CampA: {
      SEARCH:  { spend: 100, clicks: 500, impressions: 10000, conversions: 5 },
      CONTENT: { spend: 200, clicks: 800, impressions: 20000, conversions: 8 },
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch.mockReset();
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe('GET /api/networks — validation', () => {
  test('400 when from and to are missing', async () => {
    const res = await request.get('/api/networks');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  test('400 when only from is provided', async () => {
    const res = await request.get('/api/networks?from=2026-03-01');
    expect(res.status).toBe(400);
  });

  test('400 on invalid from date format', async () => {
    const res = await request.get('/api/networks?from=bad-date&to=2026-03-28');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid date format/);
  });

  test('400 on invalid to date format', async () => {
    const res = await request.get('/api/networks?from=2026-03-01&to=28-03-2026');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid date format/);
  });
});

// ─── Cache hit (all dates in DB) ──────────────────────────────────────────────

describe('GET /api/networks — DB cache hit', () => {
  beforeEach(() => {
    db.getMissingNetworksDates.mockResolvedValue([]);
    db.getNetworksByDate.mockResolvedValue(MOCK_NET_BY_DATE);
    db.getCampaigns.mockResolvedValue([{ name: 'CampA', id: '123' }]);
  });

  test('returns 200 with _fromDB: true', async () => {
    const res = await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    expect(res.status).toBe(200);
    expect(res.body._fromDB).toBe(true);
  });

  test('does not call the GA API', async () => {
    await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns correct campaign structure', async () => {
    const res = await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    expect(res.body.campaigns).toHaveLength(1);
    const camp = res.body.campaigns[0];
    expect(camp.campaignName).toBe('CampA');
    expect(camp.campaignId).toBe('123');          // from getCampaigns cache
    expect(camp.networks).toHaveLength(2);
    expect(camp.total.spend).toBeCloseTo(300);
  });

  test('campaign total includes all networks', async () => {
    const res = await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    const camp = res.body.campaigns[0];
    expect(camp.total.clicks).toBe(1300);
    expect(camp.total.impressions).toBe(30000);
  });

  test('networks have correct labels', async () => {
    const res = await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    const labels = Object.fromEntries(res.body.campaigns[0].networks.map(n => [n.network, n.label]));
    expect(labels['SEARCH']).toBe('Google Search');
    expect(labels['CONTENT']).toBe('Display Network');
  });

  test('networks have CTR, CPM, CPC fields', async () => {
    const res = await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    const n = res.body.campaigns[0].networks[0];
    expect(typeof n.ctr).toBe('number');
    expect(typeof n.cpm).toBe('number');
    expect(typeof n.cpc).toBe('number');
  });
});

// ─── Cache miss (GA API fetch) ────────────────────────────────────────────────

describe('GET /api/networks — GA API fetch', () => {
  const GA_RESULTS = [{
    segments: { date: '2026-03-01', adNetworkType: 'SEARCH' },
    campaign: { name: 'CampA', id: '456' },
    metrics: { costMicros: 1_000_000, clicks: '100', impressions: '5000', conversions: '5' },
  }];

  beforeEach(() => {
    db.getMissingNetworksDates.mockResolvedValue(['2026-03-01']);
    db.getNetworksByDate.mockResolvedValue({
      '2026-03-01': { CampA: { SEARCH: { spend: 1, clicks: 100, impressions: 5000, conversions: 5 } } },
    });
    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => ({ results: GA_RESULTS }) });
  });

  test('returns 200 with _fromDB: false', async () => {
    const res = await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    expect(res.status).toBe(200);
    expect(res.body._fromDB).toBe(false);
  });

  test('calls storeNetworksByDate with processed data', async () => {
    await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    expect(db.storeNetworksByDate).toHaveBeenCalledTimes(1);
  });

  test('campaign ID comes from live GA results', async () => {
    const res = await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    expect(res.body.campaigns[0].campaignId).toBe('456');
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('GET /api/networks — error handling', () => {
  test('500 when GA API returns an error object', async () => {
    db.getMissingNetworksDates.mockResolvedValue(['2026-03-01']);
    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => ({ error: { message: 'GA API error' } }) });

    const res = await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('GA API error');
  });

  test('500 when token refresh fails', async () => {
    db.getMissingNetworksDates.mockResolvedValue(['2026-03-01']);
    global.fetch.mockResolvedValueOnce({ json: async () => ({ error: 'invalid_grant' }) });

    const res = await request.get('/api/networks?from=2026-03-01&to=2026-03-01');
    expect(res.status).toBe(500);
  });
});
