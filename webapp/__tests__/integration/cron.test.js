// Set AF env vars before modules are loaded (they destructure at load time)
process.env.APPSFLYER_TOKEN          = 'mock-af-token';
process.env.APPSFLYER_ANDROID_APP_ID = 'com.mock.android';
process.env.APPSFLYER_IOS_APP_ID     = 'id123456';

const express  = require('express');
const supertest = require('supertest');

jest.mock('../../db', () => ({
  getCampaigns:          jest.fn(),
  storeCampaigns:        jest.fn().mockResolvedValue(undefined),
  getAssetState:         jest.fn().mockResolvedValue(null),
  storeAssetState:       jest.fn().mockResolvedValue(undefined),
  getMissingAFChannelDates: jest.fn().mockResolvedValue(['2026-03-30']),
  storeAFChannelForDate: jest.fn().mockResolvedValue(undefined),
}));

const db = require('../../db');
global.fetch = jest.fn();

const cronHandler = require('../../api/cron/refresh');
const app = express();
app.get('/api/cron/refresh', cronHandler);
const request = supertest(app);

const MOCK_TOKEN   = { access_token: 'mock-token', expires_in: 0 }; // expires immediately — no cross-test caching
const MOCK_CAMPS   = [{ id: '123', name: 'CampA', channelType: 'MULTI_CHANNEL' }];
const MOCK_ASSETS  = { results: [] };
const AF_CSV       = `AF Channel,Installs,Cost,Revenue\nACI_Search,100,50,200\n`;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch.mockReset();
  process.env.CRON_SECRET = 'test-secret';
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('GET /api/cron/refresh — auth', () => {
  test('401 when no cron header or secret', async () => {
    const res = await request.get('/api/cron/refresh');
    expect(res.status).toBe(401);
  });

  test('200 with x-vercel-cron: 1 header', async () => {
    db.getCampaigns.mockResolvedValue(MOCK_CAMPS);
    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })       // asset token
      .mockResolvedValueOnce({ json: async () => MOCK_ASSETS })      // asset GA query
      .mockResolvedValueOnce({ text: async () => AF_CSV, ok: true }) // AF android
      .mockResolvedValueOnce({ text: async () => AF_CSV, ok: true }); // AF ios

    const res = await request.get('/api/cron/refresh').set('x-vercel-cron', '1');
    expect(res.status).toBe(200);
  });

  test('200 with correct x-cron-secret header', async () => {
    db.getCampaigns.mockResolvedValue(MOCK_CAMPS);
    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => MOCK_ASSETS })
      .mockResolvedValueOnce({ text: async () => AF_CSV, ok: true })
      .mockResolvedValueOnce({ text: async () => AF_CSV, ok: true });

    const res = await request.get('/api/cron/refresh').set('x-cron-secret', 'test-secret');
    expect(res.status).toBe(200);
  });
});

// ─── Behaviour ────────────────────────────────────────────────────────────────

describe('GET /api/cron/refresh — behaviour', () => {
  beforeEach(() => {
    db.getCampaigns.mockResolvedValue(MOCK_CAMPS);
    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => MOCK_ASSETS })
      .mockResolvedValueOnce({ text: async () => AF_CSV, ok: true })
      .mockResolvedValueOnce({ text: async () => AF_CSV, ok: true });
  });

  test('returns ok:true with campaign count', async () => {
    const res = await request.get('/api/cron/refresh').set('x-vercel-cron', '1');
    expect(res.body.ok).toBe(true);
    expect(res.body.campaigns).toBe(1);
  });

  test('calls storeAssetState for each campaign', async () => {
    await request.get('/api/cron/refresh').set('x-vercel-cron', '1');
    expect(db.storeAssetState).toHaveBeenCalledTimes(1);
    expect(db.storeAssetState).toHaveBeenCalledWith('123', expect.objectContaining({ campaignId: '123' }));
  });

  test('calls storeAFChannelForDate for missing dates', async () => {
    await request.get('/api/cron/refresh').set('x-vercel-cron', '1');
    expect(db.storeAFChannelForDate).toHaveBeenCalledTimes(1);
  });

  test('skips AF store when no missing dates', async () => {
    db.getMissingAFChannelDates.mockResolvedValue([]);
    await request.get('/api/cron/refresh').set('x-vercel-cron', '1');
    expect(db.storeAFChannelForDate).not.toHaveBeenCalled();
  });

  test('fetches campaigns from GA when not in DB cache', async () => {
    db.getCampaigns.mockResolvedValue(null);
    global.fetch.mockReset();
    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })   // campaigns token
      .mockResolvedValueOnce({ json: async () => ({             // campaigns GA
        results: [{ campaign: { id: '123', name: 'CampA', advertisingChannelType: 'MULTI_CHANNEL' } }]
      }) })
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })   // asset token
      .mockResolvedValueOnce({ json: async () => MOCK_ASSETS })  // asset GA query
      .mockResolvedValueOnce({ text: async () => AF_CSV, ok: true })
      .mockResolvedValueOnce({ text: async () => AF_CSV, ok: true });

    const res = await request.get('/api/cron/refresh').set('x-vercel-cron', '1');
    expect(res.status).toBe(200);
    expect(db.storeCampaigns).toHaveBeenCalledTimes(1);
  });
});
