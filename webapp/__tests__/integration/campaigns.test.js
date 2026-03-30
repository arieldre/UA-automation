const express  = require('express');
const supertest = require('supertest');

jest.mock('../../db', () => ({
  getCampaigns:    jest.fn(),
  storeCampaigns:  jest.fn().mockResolvedValue(undefined),
}));

const db = require('../../db');
global.fetch = jest.fn();

const campaignsHandler = require('../../api/campaigns');
const app = express();
app.get('/api/campaigns', campaignsHandler);
const request = supertest(app);

const MOCK_TOKEN     = { access_token: 'mock-token', expires_in: 1 };
const MOCK_CAMPAIGNS = [
  { id: '111', name: 'CampA', channelType: 'MULTI_CHANNEL' },
  { id: '222', name: 'CampB', channelType: 'SEARCH' },
];

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch.mockReset();
});

// ─── Cache hit ────────────────────────────────────────────────────────────────

describe('GET /api/campaigns — DB cache hit', () => {
  beforeEach(() => {
    db.getCampaigns.mockResolvedValue(MOCK_CAMPAIGNS);
  });

  test('returns 200 with _fromDB: true', async () => {
    const res = await request.get('/api/campaigns');
    expect(res.status).toBe(200);
    expect(res.body._fromDB).toBe(true);
  });

  test('returns cached campaign list', async () => {
    const res = await request.get('/api/campaigns');
    expect(res.body.campaigns).toEqual(MOCK_CAMPAIGNS);
  });

  test('does not call the GA API', async () => {
    await request.get('/api/campaigns');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─── Cache miss ───────────────────────────────────────────────────────────────

describe('GET /api/campaigns — GA API fetch', () => {
  const GA_RESULTS = [
    { campaign: { id: '111', name: 'CampA', advertisingChannelType: 'MULTI_CHANNEL' } },
    { campaign: { id: '222', name: 'CampB', advertisingChannelType: 'SEARCH' } },
  ];

  beforeEach(() => {
    db.getCampaigns.mockResolvedValue(null);
    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => ({ results: GA_RESULTS }) });
  });

  test('returns 200 with _fromDB: false', async () => {
    const res = await request.get('/api/campaigns');
    expect(res.status).toBe(200);
    expect(res.body._fromDB).toBe(false);
  });

  test('returns all campaigns from GA', async () => {
    const res = await request.get('/api/campaigns');
    expect(res.body.campaigns).toHaveLength(2);
    expect(res.body.campaigns[0].id).toBe('111');
    expect(res.body.campaigns[0].name).toBe('CampA');
    expect(res.body.campaigns[0].channelType).toBe('MULTI_CHANNEL');
  });

  test('stores campaigns in DB after fetching', async () => {
    await request.get('/api/campaigns');
    expect(db.storeCampaigns).toHaveBeenCalledWith(MOCK_CAMPAIGNS);
  });

  test('handles empty results from GA', async () => {
    db.getCampaigns.mockResolvedValue(null);
    global.fetch
      .mockReset()
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => ({ results: [] }) });

    const res = await request.get('/api/campaigns');
    expect(res.status).toBe(200);
    expect(res.body.campaigns).toHaveLength(0);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('GET /api/campaigns — error handling', () => {
  test('500 when GA API returns an error', async () => {
    db.getCampaigns.mockResolvedValue(null);
    global.fetch
      .mockResolvedValueOnce({ json: async () => MOCK_TOKEN })
      .mockResolvedValueOnce({ json: async () => ({ error: { message: 'Unauthorized' } }) });

    const res = await request.get('/api/campaigns');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('500 when token refresh fails', async () => {
    db.getCampaigns.mockResolvedValue(null);
    global.fetch.mockResolvedValueOnce({ json: async () => ({ error: 'invalid_client' }) });

    const res = await request.get('/api/campaigns');
    expect(res.status).toBe(500);
  });
});
