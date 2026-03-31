process.env.APPSFLYER_ANDROID_APP_ID = 'gg.oneupgames.ggclient';
process.env.APPSFLYER_IOS_APP_ID     = 'id1611003698';

const express  = require('express');
const supertest = require('supertest');

jest.mock('../../db', () => ({
  getAFDailyBreakdown: jest.fn(),
}));

const db = require('../../db');
const afDailyHandler = require('../../api/af-daily');
const app = express();
app.get('/api/af-daily', afDailyHandler);
const request = supertest(app);

const MOCK_DATA = {
  android: { '2026-03-01': { ACI_Search: { installs: 60, cost: 30, revenue: 120 } } },
  ios:     { '2026-03-01': { ACI_Search: { installs: 40, cost: 20, revenue: 80  } } },
};

beforeEach(() => {
  jest.clearAllMocks();
  db.getAFDailyBreakdown.mockResolvedValue(MOCK_DATA);
});

// ── Input validation ──────────────────────────────────────

describe('GET /api/af-daily — validation', () => {
  test('400 when from is missing', async () => {
    const res = await request.get('/api/af-daily?to=2026-03-31');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid date format/);
  });

  test('400 when to is missing', async () => {
    const res = await request.get('/api/af-daily?from=2026-03-01');
    expect(res.status).toBe(400);
  });

  test('400 on invalid from date format', async () => {
    const res = await request.get('/api/af-daily?from=01/03/2026&to=2026-03-31');
    expect(res.status).toBe(400);
  });

  test('400 on invalid to date format', async () => {
    const res = await request.get('/api/af-daily?from=2026-03-01&to=bad');
    expect(res.status).toBe(400);
  });
});

// ── Successful response ───────────────────────────────────

describe('GET /api/af-daily — response shape', () => {
  test('returns 200', async () => {
    const res = await request.get('/api/af-daily?from=2026-03-01&to=2026-03-01');
    expect(res.status).toBe(200);
  });

  test('response includes from, to, dates, channels, android, ios', async () => {
    const res = await request.get('/api/af-daily?from=2026-03-01&to=2026-03-01');
    expect(res.body).toHaveProperty('from', '2026-03-01');
    expect(res.body).toHaveProperty('to',   '2026-03-01');
    expect(res.body).toHaveProperty('dates');
    expect(res.body).toHaveProperty('channels');
    expect(res.body).toHaveProperty('android');
    expect(res.body).toHaveProperty('ios');
  });

  test('dates are sorted', async () => {
    db.getAFDailyBreakdown.mockResolvedValue({
      android: { '2026-03-03': {}, '2026-03-01': {} },
      ios:     { '2026-03-02': {} },
    });
    const res = await request.get('/api/af-daily?from=2026-03-01&to=2026-03-03');
    expect(res.body.dates).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  test('channels are sorted and de-duplicated', async () => {
    db.getAFDailyBreakdown.mockResolvedValue({
      android: { '2026-03-01': { ACI_Search: {}, ACI_Display: {} } },
      ios:     { '2026-03-01': { ACI_Search: {}, ACI_YouTube: {} } },
    });
    const res = await request.get('/api/af-daily?from=2026-03-01&to=2026-03-01');
    expect(res.body.channels).toEqual(['ACI_Display', 'ACI_Search', 'ACI_YouTube']);
  });

  test('android and ios data passed through correctly', async () => {
    const res = await request.get('/api/af-daily?from=2026-03-01&to=2026-03-01');
    expect(res.body.android['2026-03-01'].ACI_Search.installs).toBe(60);
    expect(res.body.ios['2026-03-01'].ACI_Search.revenue).toBe(80);
  });

  test('calls getAFDailyBreakdown with correct app IDs and dates', async () => {
    await request.get('/api/af-daily?from=2026-03-01&to=2026-03-31');
    expect(db.getAFDailyBreakdown).toHaveBeenCalledWith(
      'gg.oneupgames.ggclient', 'id1611003698', '2026-03-01', '2026-03-31'
    );
  });

  test('handles empty DB result gracefully', async () => {
    db.getAFDailyBreakdown.mockResolvedValue({ android: {}, ios: {} });
    const res = await request.get('/api/af-daily?from=2026-03-01&to=2026-03-01');
    expect(res.status).toBe(200);
    expect(res.body.dates).toEqual([]);
    expect(res.body.channels).toEqual([]);
  });
});

// ── Error handling ────────────────────────────────────────

describe('GET /api/af-daily — error handling', () => {
  test('500 when DB throws', async () => {
    db.getAFDailyBreakdown.mockRejectedValue(new Error('DB connection failed'));
    const res = await request.get('/api/af-daily?from=2026-03-01&to=2026-03-31');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB connection failed');
  });
});
