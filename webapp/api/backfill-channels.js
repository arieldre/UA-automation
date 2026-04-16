'use strict';
/**
 * One-shot endpoint to backfill AF channel data for a date range.
 * GET /api/backfill-channels?from=YYYY-MM-DD&to=YYYY-MM-DD&secret=<CRON_SECRET>[&force=true]
 * Only callable with CRON_SECRET env var for auth.
 *
 * ?force=true — re-fetch and overwrite dates that already exist in the DB.
 *               Default: skip dates that already have data for EITHER platform.
 *
 * Uses AF Pull API (partners_by_date_report) — works reliably from Vercel.
 * Stores per-platform: one document per (appId, date) for both Android and iOS.
 */
require('dotenv').config();

const { storeAFChannelForDate, getDatesInRange, getMissingAFChannelDates } = require('../db');
const { fetchAFChannels, parseAFChannelsByDate } = require('./networks')._helpers;

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

  console.log(`[backfill-channels] Fetching ${from} → ${to} (force=${force}) via Pull API`);

  const [rawAndroid, rawIos] = await Promise.all([
    fetchAFChannels(androidId, from, to),
    fetchAFChannels(iosId, from, to),
  ]);

  const errors = {};
  if (rawAndroid?._afError) { console.warn('[backfill] Android error:', rawAndroid._afError); errors.android = rawAndroid._afError; }
  if (rawIos?._afError)     { console.warn('[backfill] iOS error:',     rawIos._afError);     errors.ios     = rawIos._afError; }

  const byDateAndroid = rawAndroid?._afError ? {} : parseAFChannelsByDate(rawAndroid);
  const byDateIos     = rawIos?._afError     ? {} : parseAFChannelsByDate(rawIos);

  const allDates = [...new Set([
    ...Object.keys(byDateAndroid),
    ...Object.keys(byDateIos),
  ])].sort().filter(d => d >= from && d <= to);

  // Determine which dates to process
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
  const allSources = new Set();

  for (const date of allDates) {
    if (!datesToProcess.has(date)) { skipped.push(date); continue; }

    const androidChannels = byDateAndroid[date] || {};
    const iosChannels     = byDateIos[date]     || {};

    const hasAndroid = Object.keys(androidChannels).length > 0;
    const hasIos     = Object.keys(iosChannels).length > 0;

    if (!hasAndroid && !hasIos) { skipped.push(date); continue; }

    if (hasAndroid) await storeAFChannelForDate(androidId, date, androidChannels, null);
    if (hasIos)     await storeAFChannelForDate(iosId,     date, iosChannels,     null);

    stored++;
    const sources = [...new Set([...Object.keys(androidChannels), ...Object.keys(iosChannels)])];
    sources.forEach(s => allSources.add(s));
    console.log(`  stored ${date}: android=${Object.keys(androidChannels).length} ios=${Object.keys(iosChannels).length} sources`);
  }

  const allRequested = getDatesInRange(from, to);
  const gaps = allRequested.filter(d => !allDates.includes(d));

  return res.json({
    from, to,
    datesFound: allDates.length,
    stored,
    skipped: skipped.length,
    gaps,
    sources: [...allSources],
    ...(Object.keys(errors).length ? { errors } : {}),
  });
};
