'use strict';
/**
 * One-shot endpoint to backfill AF channel data for a date range.
 * GET /api/backfill-channels?from=YYYY-MM-DD&to=YYYY-MM-DD&secret=<CRON_SECRET>[&force=true]
 */
require('dotenv').config();

const { storeAFChannelForDate, getDatesInRange, getMissingAFChannelDates } = require('../webapp/db');
const { fetchAFByMediaSource } = require('../webapp/lib/af-mcp');

const { APPSFLYER_ANDROID_APP_ID, APPSFLYER_IOS_APP_ID, CRON_SECRET } = process.env;

module.exports = async function handler(req, res) {
  const secret = req.query.secret || req.headers['x-cron-secret'];
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' });
  }

  const force     = req.query.force === 'true';
  const androidId = APPSFLYER_ANDROID_APP_ID;
  const iosId     = APPSFLYER_IOS_APP_ID;
  if (!androidId || !iosId) {
    return res.status(500).json({ error: 'Missing APPSFLYER app IDs' });
  }

  console.log(`[backfill-channels] Fetching ${from} → ${to} (force=${force}) via MCP`);

  const data = await fetchAFByMediaSource(androidId, iosId, from, to);

  const allDates = [...new Set([
    ...Object.keys(data.android),
    ...Object.keys(data.ios),
  ])].sort().filter(d => d >= from && d <= to);

  let datesToProcess;
  if (force) {
    datesToProcess = new Set(allDates);
  } else {
    const missingAndroid = await getMissingAFChannelDates(androidId, from, to);
    const missingIos     = await getMissingAFChannelDates(iosId,     from, to);
    const missing = new Set([...missingAndroid, ...missingIos]);
    datesToProcess = new Set(allDates.filter(d => missing.has(d)));
  }

  let stored = 0;
  const skipped = [];

  for (const date of allDates) {
    if (!datesToProcess.has(date)) { skipped.push(date); continue; }

    const androidChannels = data.android[date] || {};
    const iosChannels     = data.ios[date]     || {};
    const androidGeo      = data.geo.android[date] || [];
    const iosGeo          = data.geo.ios[date]     || [];

    const hasAndroid = Object.keys(androidChannels).length > 0;
    const hasIos     = Object.keys(iosChannels).length > 0;

    if (!hasAndroid && !hasIos) { skipped.push(date); continue; }

    if (hasAndroid) await storeAFChannelForDate(androidId, date, androidChannels, androidGeo.length ? androidGeo : null);
    if (hasIos)     await storeAFChannelForDate(iosId,     date, iosChannels,     iosGeo.length     ? iosGeo     : null);

    stored++;
    const sources = [...new Set([...Object.keys(androidChannels), ...Object.keys(iosChannels)])];
    console.log(`  stored ${date}: [${sources.join(', ')}]`);
  }

  const allRequested = getDatesInRange(from, to);
  const gaps = allRequested.filter(d => !allDates.includes(d));

  return res.json({
    from, to,
    datesFound: allDates.length,
    stored,
    skipped: skipped.length,
    gaps,
    sources: [...new Set(Object.values(data.android).flatMap(d => Object.keys(d)))],
  });
};
