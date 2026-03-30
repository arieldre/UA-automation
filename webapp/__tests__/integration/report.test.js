const supertest = require('supertest');

// Mock db before requiring server — Jest hoists jest.mock() calls automatically
jest.mock('../../db', () => ({
  getDatesInRange: jest.requireActual('../../db').getDatesInRange,
  getMissingDates: jest.fn(),
  storeGAByDate:   jest.fn().mockResolvedValue(undefined),
  storeAFByDate:   jest.fn().mockResolvedValue(undefined),
  getGAByDate:     jest.fn(),
  getAFByDate:     jest.fn(),
}));

const db  = require('../../db');
global.fetch = jest.fn();

const app     = require('../../server');
const request = supertest(app);

const MOCK_TOKEN = { access_token: 'mock-token', expires_in: 1 };

// Shape returned by getGAByDate — already-processed daily data
const MOCK_GA_BY_DATE = {
  '2026-03-01': {
    CampA: {
      spend: 100, clicks: 500, impressions: 10000, conversions: 10,
      revenue: 0, allConversions: 10, allRevenue: 0,
      avgCpmMicros: 0, _impCount: 10000, purchases: 5, purchaseRevenue: 50, cpm: 10,
    },
  },
};

// Shape returned by getAFByDate
const MOCK_AF_BY_DATE = {
  android: {
    byDate: {
      '2026-03-01': {
        total: 80,
        byCampaign: {
          CampA: { installs: 80, clicks: 400, impressions: 9000, cost: 80, revenue: 400,
                   ecpi: 1, roi: '400%', purchases: 6, purchasers: 5, purchaseRev: 60 },
        },
      },
    },
    aggregate: {
      total: 80,
      byCampaign: {
        CampA: { installs: 80, clicks: 400, impressions: 9000, cost: 80, revenue: 400,
                 ecpi: 1, roi: '400%', purchases: 6, purchasers: 5, purchaseRev: 60 },
      },
    },
  },
  ios: {
    byDate:    {},
    aggregate: { total: 0, byCampaign: {} },
  },
};

// Empty AF state (e.g. when fetched fresh with no rows)
const EMPTY_AF = {
  android: { byDate: {}, aggregate: { total: 0, byCampaign: {} } },
  ios:     { byDate: {}, aggregate: { total: 0, byCampaign: {} } },
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch.mockReset();
});

// ─── DB cache hit ─────────────────────────────────────────────────────────────

describe('GET /api/report — DB cache hit', () => {
  beforeEach(() => {
    db.getMissingDates.mockResolvedValue([]);
    db.getGAByDate.mockResolvedValue(MOCK_GA_BY_DATE);
    db.getAFByDate.mockResolvedValue(MOCK_AF_BY_DATE);
  });

  test('returns 200 with correct shape', async () => {
    const res = await request.get('/api/report?from=2026-03-01&to=2026-03-01');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('from', '2026-03-01');
    expect(res.body).toHaveProperty('to', '2026-03-01');
    expect(res.body).toHaveProperty('campaignNames');
    expect(res.body).toHaveProperty('aggregate');
    expect(res.body).toHaveProperty('days');
    expect(res.body._fromDB).toBe(true);
  });

  test('does not call the GA or AF APIs', async () => {
    await request.get('/api/report?from=2026-03-01&to=2026-03-01');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('aggregate.all.ga.spend sums correctly', async () => {
    const res = await request.get('/api/report?from=2026-03-01&to=2026-03-01');
    expect(res.body.aggregate.all.ga.spend).toBeCloseTo(100);
  });

  test('aggregate.all.af.installs sums correctly', async () => {
    const res = await request.get('/api/report?from=2026-03-01&to=2026-03-01');
    expect(res.body.aggregate.all.af.installs).toBe(80);
  });

  test('campaignNames lists all campaigns', async () => {
    const res = await request.get('/api/report?from=2026-03-01&to=2026-03-01');
    expect(res.body.campaignNames).toContain('CampA');
  });

  test('days array has one entry per date', async () => {
    const res = await request.get('/api/report?from=2026-03-01&to=2026-03-01');
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].date).toBe('2026-03-01');
  });

  test('aggregate has all and android and ios keys', async () => {
    const res = await request.get('/api/report?from=2026-03-01&to=2026-03-01');
    expect(res.body.aggregate).toHaveProperty('all');
    expect(res.body.aggregate).toHaveProperty('android');
    expect(res.body.aggregate).toHaveProperty('ios');
  });

  test('aggregate.all.campaigns list includes campaign breakdown', async () => {
    const res = await request.get('/api/report?from=2026-03-01&to=2026-03-01');
    expect(Array.isArray(res.body.aggregate.all.campaigns)).toBe(true);
    expect(res.body.aggregate.all.campaigns[0].name).toBe('CampA');
  });
});

// ─── Cache miss — API fetch ───────────────────────────────────────────────────

describe('GET /api/report — API fetch', () => {
  const AF_EMPTY_CSV = 'Date,Campaign (c),Installs,Clicks,Impressions,Total Cost,Total Revenue,Average eCPI,ROI\n';

  beforeEach(() => {
    db.getMissingDates.mockResolvedValue(['2026-03-01']);
    db.getGAByDate.mockResolvedValue(MOCK_GA_BY_DATE);
    db.getAFByDate.mockResolvedValue(EMPTY_AF);

    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })         // OAuth
      .mockResolvedValueOnce({ json: async () => ({ results: [] }) })  // GA main
      .mockResolvedValueOnce({ json: async () => ({ results: [] }) })  // GA purchases
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => AF_EMPTY_CSV }) // AF android
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => AF_EMPTY_CSV }); // AF ios
  });

  test('returns 200 with _fromDB: false', async () => {
    const res = await request.get('/api/report?from=2026-03-01&to=2026-03-01');
    expect(res.status).toBe(200);
    expect(res.body._fromDB).toBe(false);
  });

  test('calls storeGAByDate and storeAFByDate', async () => {
    await request.get('/api/report?from=2026-03-01&to=2026-03-01');
    expect(db.storeGAByDate).toHaveBeenCalled();
    expect(db.storeAFByDate).toHaveBeenCalled();
  });

  test('uses default dates when from/to are omitted', async () => {
    const res = await request.get('/api/report');
    expect(res.status).toBe(200);
    // from and to should be set to defaults (not undefined)
    expect(res.body.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── Force refresh ────────────────────────────────────────────────────────────

describe('GET /api/report — force refresh', () => {
  const AF_CSV = 'Date,Campaign (c),Installs,Clicks,Impressions,Total Cost,Total Revenue,Average eCPI,ROI\n';

  test('treats all dates as missing when refresh=1', async () => {
    // Without refresh, getMissingDates would return []
    db.getMissingDates.mockResolvedValue([]);
    db.getGAByDate.mockResolvedValue(MOCK_GA_BY_DATE);
    db.getAFByDate.mockResolvedValue(EMPTY_AF);

    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({ json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => AF_CSV })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => AF_CSV });

    const res = await request.get('/api/report?from=2026-03-01&to=2026-03-01&refresh=1');
    expect(res.status).toBe(200);
    expect(res.body._fromDB).toBe(false);
    // Fetch was called even though getMissingDates returned []
    expect(global.fetch).toHaveBeenCalled();
  });
});
