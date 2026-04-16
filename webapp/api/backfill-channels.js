'use strict';
/**
 * One-shot endpoint to backfill AF channel data for a date range.
 * GET /api/backfill-channels?from=YYYY-MM-DD&to=YYYY-MM-DD&secret=<CRON_SECRET>
 * Only callable with the CRON_SECRET env var for auth.
 */
require('dotenv').config();

const { storeAFChannelForDate, getDatesInRange } = require('../db');
const { _helpers: { fetchAFChannels, parseAFChannelsByDate, mergeAFChannelPlatforms } } = require('./networks');

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

  const [rawAndroid, rawIos] = await Promise.all([
    fetchAFChannels(androidId, from, to),
    fetchAFChannels(iosId, from, to),
  ]);

  if (rawAndroid?._afError) console.warn('Android AF error:', rawAndroid._afError);
  if (rawIos?._afError)     console.warn('iOS AF error:', rawIos._afError);

  const byDateAndroid = rawAndroid?._afError ? {} : parseAFChannelsByDate(rawAndroid);
  const byDateIos     = rawIos?._afError     ? {} : parseAFChannelsByDate(rawIos);

  const allDates = [...new Set([...Object.keys(byDateAndroid), ...Object.keys(byDateIos)])].sort();

  let stored = 0;
  const skipped = [];
  for (const date of allDates) {
    if (date < from || date > to) continue;
    const androidChannels = byDateAndroid[date] || {};
    const iosChannels     = byDateIos[date]     || {};
    const hasData = Object.keys(androidChannels).length > 0 || Object.keys(iosChannels).length > 0;
    if (hasData) {
      // Store android and ios separately so the report can read per-platform splits
      if (Object.keys(androidChannels).length > 0) await storeAFChannelForDate(androidId, date, androidChannels);
      if (Object.keys(iosChannels).length > 0)     await storeAFChannelForDate(iosId,     date, iosChannels);
      stored++;
      console.log(`  stored ${date}: android=[${Object.keys(androidChannels).join(', ')}] ios=[${Object.keys(iosChannels).join(', ')}]`);
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
      Object.values(byDateAndroid)[0] || Object.values(byDateIos)[0] || {}
    ),
  });
};
