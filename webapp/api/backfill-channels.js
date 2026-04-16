'use strict';
/**
 * One-shot endpoint to backfill AF channel data for a date range.
 * GET /api/backfill-channels?from=YYYY-MM-DD&to=YYYY-MM-DD&secret=<CRON_SECRET>
 * Only callable with the CRON_SECRET env var for auth.
 */
require('dotenv').config();

const { storeAFChannelForDate, getDatesInRange } = require('../db');
const { fetchAFByMediaSource } = require('./lib/af-mcp');

const {
  APPSFLYER_ANDROID_APP_ID,
  APPSFLYER_IOS_APP_ID,
  CRON_SECRET,
} = process.env;

module.exports = async function handler(req, res) {
  const secret = req.query.secret || req.headers['x-cron-secret'];
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' });
  }

  const androidId = APPSFLYER_ANDROID_APP_ID;
  const iosId     = APPSFLYER_IOS_APP_ID;
  if (!androidId || !iosId) {
    return res.status(500).json({ error: 'Missing APPSFLYER app IDs' });
  }

  console.log(`[backfill-channels] Fetching ${from} → ${to}`);

  const byDate = await fetchAFByMediaSource(androidId, iosId, from, to);

  const allDates = Object.keys(byDate).sort();

  let stored = 0;
  const skipped = [];
  for (const date of allDates) {
    if (date < from || date > to) continue;
    const channels = byDate[date] || {};
    if (Object.keys(channels).length > 0) {
      await storeAFChannelForDate(androidId, date, channels);
      stored++;
      console.log(`  stored ${date}: [${Object.keys(channels).join(', ')}]`);
    } else {
      skipped.push(date);
    }
  }

  const allRequested = getDatesInRange(from, to);
  const gaps = allRequested.filter(d => !allDates.includes(d));

  return res.json({
    from, to,
    datesFound: allDates.length,
    stored,
    skipped: skipped.length,
    gaps,
    channels: Object.keys(
      Object.values(byDate)[0] || {}
    ),
    _debug: {
      hasAndroidId: !!process.env.APPSFLYER_ANDROID_APP_ID,
      hasIosId: !!process.env.APPSFLYER_IOS_APP_ID,
      hasMcpToken: !!process.env.APPSFLYER_MCP,
      mcpTokenLen: (process.env.APPSFLYER_MCP || '').length,
    },
  });
};
