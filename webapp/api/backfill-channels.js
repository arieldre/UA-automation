'use strict';
/**
 * One-shot endpoint to backfill AF channel data for a date range.
 * GET /api/backfill-channels?from=YYYY-MM-DD&to=YYYY-MM-DD&secret=<CRON_SECRET>[&force=true]
 * Only callable with the CRON_SECRET env var for auth.
 *
 * ?force=true — re-fetch and overwrite dates that already exist in the DB.
 *               Default: skip dates that already have data.
 *
 * Enriches Pull API channel data with cohort revenue (rev_d0, rev_d1, rev_d7)
 * by merging Android + iOS cohort results per pid per date.
 * Also fetches cohort-by-geo (android + ios) and stores the merged geo array.
 */
require('dotenv').config();

const { storeAFChannelForDate, getDatesInRange, getMissingAFChannelDates } = require('../db');
const { fetchAFChannels, parseAFChannelsByDate, mergeAFChannelPlatforms } = require('./networks')._helpers;
const { fetchCohortByChannel, fetchCohortByChannelGeo, fetchCohortRetention } = require('../lib/af-cohort');

const {
  APPSFLYER_ANDROID_APP_ID,
  APPSFLYER_IOS_APP_ID,
  CRON_SECRET,
} = process.env;

// ── Merge helper ──────────────────────────────────────────────────────────────

/**
 * Merge Pull API channel map with cohort revenue from android + ios.
 * @param {Object} channels       - { [pid]: { installs, cost, revenue, ... } }
 * @param {Object} cohortAndroid  - { [pid]: { rev_d0, rev_d1, rev_d7 } } or {}
 * @param {Object} cohortIos      - { [pid]: { rev_d0, rev_d1, rev_d7 } } or {}
 * @returns {Object}              - channels with rev_d0/d1/d7 added
 */
function mergeChannelCohort(channels, cohortAndroid, cohortIos, retAndroid, retIos) {
  const out = {};
  for (const [ch, m] of Object.entries(channels)) {
    const ca = cohortAndroid?.[ch] || {};
    const ci = cohortIos?.[ch] || {};
    const ra = retAndroid?.[ch] || {};
    const ri = retIos?.[ch] || {};
    out[ch] = {
      ...m,
      rev_d0:  (ca.rev_d0  || 0) + (ci.rev_d0  || 0),
      rev_d1:  (ca.rev_d1  || 0) + (ci.rev_d1  || 0),
      rev_d7:  (ca.rev_d7  || 0) + (ci.rev_d7  || 0),
      ret_d1:  (ra.ret_d1  || 0) + (ri.ret_d1  || 0),
      ret_d7:  (ra.ret_d7  || 0) + (ri.ret_d7  || 0),
      ret_d30: (ra.ret_d30 || 0) + (ri.ret_d30 || 0),
    };
  }
  return out;
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const secret = req.query.secret || req.headers['x-cron-secret'];
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' });
  }

  const force = req.query.force === 'true';

  const androidId = APPSFLYER_ANDROID_APP_ID;
  const iosId     = APPSFLYER_IOS_APP_ID;
  if (!androidId || !iosId) {
    return res.status(500).json({ error: 'Missing APPSFLYER app IDs' });
  }

  console.log(`[backfill-channels] Fetching ${from} → ${to} (force=${force})`);

  // Step 1: Pull API (android + ios) — parallel
  // Step 2: Cohort by channel (android + ios) — parallel
  // Step 3: Cohort by channel+geo (android + ios) — parallel
  const [
    androidRaw,
    iosRaw,
    cohortChannelAndroid,
    cohortChannelIos,
    cohortGeoAndroid,
    cohortGeoIos,
    retentionAndroid,
    retentionIos,
  ] = await Promise.all([
    fetchAFChannels(androidId, from, to),
    fetchAFChannels(iosId,     from, to),
    fetchCohortByChannel(androidId, from, to),
    fetchCohortByChannel(iosId,     from, to),
    fetchCohortByChannelGeo(androidId, from, to),
    fetchCohortByChannelGeo(iosId,     from, to),
    fetchCohortRetention(androidId, from, to),
    fetchCohortRetention(iosId,     from, to),
  ]);

  if (androidRaw._afError && iosRaw._afError) {
    return res.status(500).json({ error: androidRaw._afError });
  }

  const byDateAndroid = parseAFChannelsByDate(androidRaw);
  const byDateIos     = parseAFChannelsByDate(iosRaw);

  const allDates = [...new Set([...Object.keys(byDateAndroid), ...Object.keys(byDateIos)])].sort();

  // Determine which dates to process (skip existing unless force=true)
  let datesToProcess;
  if (force) {
    datesToProcess = new Set(allDates.filter(d => d >= from && d <= to));
  } else {
    const missingDates = await getMissingAFChannelDates(androidId, from, to);
    const missingSet   = new Set(missingDates);
    datesToProcess     = new Set(allDates.filter(d => d >= from && d <= to && missingSet.has(d)));
  }

  let stored = 0;
  let cohortDates = 0;
  const skipped = [];

  for (const date of allDates) {
    if (date < from || date > to) continue;

    if (!datesToProcess.has(date)) {
      skipped.push(date);
      continue;
    }

    const channels = mergeAFChannelPlatforms(byDateAndroid[date], byDateIos[date]);
    if (Object.keys(channels).length === 0) {
      skipped.push(date);
      continue;
    }

    // Merge cohort revenue per pid for this date
    const cohortForDateAndroid = cohortChannelAndroid[date] || {};
    const cohortForDateIos     = cohortChannelIos[date]     || {};
    const retForDateAndroid    = retentionAndroid[date]     || {};
    const retForDateIos        = retentionIos[date]         || {};
    const enrichedChannels     = mergeChannelCohort(channels, cohortForDateAndroid, cohortForDateIos, retForDateAndroid, retForDateIos);

    const hasCohort = Object.keys(cohortForDateAndroid).length > 0 || Object.keys(cohortForDateIos).length > 0;
    if (hasCohort) cohortDates++;

    // Merge geo arrays for this date (concatenate android + ios)
    const geoAndroid = cohortGeoAndroid[date] || [];
    const geoIos     = cohortGeoIos[date]     || [];
    const geo        = [...geoAndroid, ...geoIos];

    await storeAFChannelForDate(androidId, date, enrichedChannels, geo.length > 0 ? geo : null);
    stored++;
    console.log(`  stored ${date}: [${Object.keys(enrichedChannels).join(', ')}]${hasCohort ? ' +cohort' : ''}`);
  }

  const allRequested = getDatesInRange(from, to);
  const gaps = allRequested.filter(d => !allDates.includes(d));

  return res.json({
    from,
    to,
    datesFound:  allDates.length,
    stored,
    skipped:     skipped.length,
    cohortDates,
    gaps,
    channels: Object.keys(Object.values(byDateAndroid)[0] || Object.values(byDateIos)[0] || {}),
  });
};
