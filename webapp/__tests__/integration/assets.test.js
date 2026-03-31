const express  = require('express');
const supertest = require('supertest');

jest.mock('../../db', () => ({
  getAssets:       jest.fn(),
  storeAssets:     jest.fn().mockResolvedValue(undefined),
  getAssetState:   jest.fn().mockResolvedValue({ lastChecked: new Date().toISOString().split('T')[0], assets: { video: [], image: [], text: [] }, campaignId: '123', campaignName: 'CampA' }),
  storeAssetState: jest.fn().mockResolvedValue(undefined),
}));

const db = require('../../db');
global.fetch = jest.fn();

const assetsHandler = require('../../api/assets');
const app = express();
app.get('/api/assets', assetsHandler);
const request = supertest(app);

const MOCK_TOKEN      = { access_token: 'mock-token', expires_in: 1 };
const MOCK_ASSET_DATA = {
  campaignName: 'CampA',
  assets: { video: [], image: [], text: [] },
};

const GA_VIDEO_RESULT = {
  campaign: { name: 'CampA' },
  adGroupAdAssetView: { fieldType: 'YOUTUBE_VIDEO', performanceLabel: 'BEST', enabled: true },
  asset: {
    id: '999', name: 'My Video',
    youtubeVideoAsset: { youtubeVideoId: 'abc123' },
    imageAsset:        { fullSize: { url: null } },
    textAsset:         { text: null },
  },
  metrics: { impressions: '5000', clicks: '200', costMicros: 2_000_000, conversions: '10' },
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch.mockReset();
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe('GET /api/assets — validation', () => {
  test('400 when campaignId is missing', async () => {
    const res = await request.get('/api/assets?from=2026-03-01&to=2026-03-28');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid campaignId/);
  });

  test('400 when from is missing', async () => {
    const res = await request.get('/api/assets?campaignId=123&to=2026-03-28');
    expect(res.status).toBe(400);
  });

  test('400 when to is missing', async () => {
    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01');
    expect(res.status).toBe(400);
  });

  test('400 on non-numeric campaignId', async () => {
    const res = await request.get('/api/assets?campaignId=abc&from=2026-03-01&to=2026-03-28');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid campaignId/);
  });

  test('400 on campaignId with letters mixed in', async () => {
    const res = await request.get('/api/assets?campaignId=123abc&from=2026-03-01&to=2026-03-28');
    expect(res.status).toBe(400);
  });

  test('400 on invalid from date format', async () => {
    const res = await request.get('/api/assets?campaignId=123&from=bad&to=2026-03-28');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid date format/);
  });

  test('400 on invalid to date format', async () => {
    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01&to=28/03/2026');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid date format/);
  });
});

// ─── Cache hit ────────────────────────────────────────────────────────────────

describe('GET /api/assets — DB cache hit', () => {
  beforeEach(() => {
    db.getAssets.mockResolvedValue(MOCK_ASSET_DATA);
  });

  test('returns 200 with _fromDB: true', async () => {
    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(res.status).toBe(200);
    expect(res.body._fromDB).toBe(true);
  });

  test('returns cached data without calling GA API', async () => {
    await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns campaignName from cached data', async () => {
    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(res.body.campaignName).toBe('CampA');
  });
});

// ─── Cache miss ───────────────────────────────────────────────────────────────

describe('GET /api/assets — GA API fetch', () => {
  beforeEach(() => {
    db.getAssets.mockResolvedValue(null);
    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => ({ results: [GA_VIDEO_RESULT] }) });
  });

  test('returns 200 with _fromDB: false', async () => {
    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(res.status).toBe(200);
    expect(res.body._fromDB).toBe(false);
  });

  test('returns campaignName from GA results', async () => {
    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(res.body.campaignName).toBe('CampA');
  });

  test('returns assets grouped by type', async () => {
    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(res.body.assets).toHaveProperty('video');
    expect(res.body.assets).toHaveProperty('image');
    expect(res.body.assets).toHaveProperty('text');
  });

  test('video assets include youtubeId and performance label', async () => {
    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(res.body.assets.video).toHaveLength(1);
    expect(res.body.assets.video[0].youtubeId).toBe('abc123');
    expect(res.body.assets.video[0].performanceLabel).toBe('BEST');
  });

  test('calls storeAssets after fetching', async () => {
    await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(db.storeAssets).toHaveBeenCalledWith('123', '2026-03-01', '2026-03-28', expect.any(Object));
  });

  test('handles empty GA results gracefully', async () => {
    db.getAssets.mockResolvedValue(null);
    global.fetch
      .mockReset()
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => ({ results: [] }) });

    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(res.status).toBe(200);
    expect(res.body.assets.video).toHaveLength(0);
    expect(res.body.assets.image).toHaveLength(0);
    expect(res.body.assets.text).toHaveLength(0);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('GET /api/assets — error handling', () => {
  test('500 when GA API returns an error', async () => {
    db.getAssets.mockResolvedValue(null);
    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => ({ error: { message: 'Not found' } }) });

    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Not found');
  });

  test('500 when token refresh fails', async () => {
    db.getAssets.mockResolvedValue(null);
    global.fetch.mockResolvedValueOnce({ json: async () => ({ error: 'invalid_grant' }) });

    const res = await request.get('/api/assets?campaignId=123&from=2026-03-01&to=2026-03-28');
    expect(res.status).toBe(500);
  });
});
