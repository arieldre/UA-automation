#!/usr/bin/env node
'use strict';

/**
 * scripts/backfill-daily.js
 *
 * Backfills AF channel data (af_channels_daily collection) for a date range.
 *
 * Usage:
 *   node scripts/backfill-daily.js --from 2026-01-01 --to 2026-01-31
 *   node scripts/backfill-daily.js --from 2026-01-01 --to 2026-01-31 --force-last 7
 *   node scripts/backfill-daily.js --from 2026-01-01 --to 2026-01-31 --dry-run
 *
 * Flags:
 *   --from YYYY-MM-DD     Start date (required unless --force-last used standalone)
 *   --to   YYYY-MM-DD     End date (required unless --force-last used standalone)
 *   --force-last N        Always re-fetch the last N days (AF revision window)
 *   --dry-run             Print dates that would be filled without writing
 */

require('dotenv').config();

const { getDatesInRange, getMissingAFChannelDates, storeAFChannelForDate } = require('../webapp/db');
const { fetchAFChannels, parseAFChannelsByDate, mergeAFChannelPlatforms } = require('../api/networks')._helpers;

const { APPSFLYER_ANDROID_APP_ID, APPSFLYER_IOS_APP_ID } = process.env;

// ── CLI arg parsing ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from')       args.from      = argv[++i];
    else if (argv[i] === '--to')    args.to        = argv[++i];
    else if (argv[i] === '--force-last') args.forceLast = parseInt(argv[++i], 10);
    else if (argv[i] === '--dry-run')    args.dryRun    = true;
  }
  return args;
}

function isoDate(d) {
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!APPSFLYER_ANDROID_APP_ID || !APPSFLYER_IOS_APP_ID) {
    console.error('ERROR: APPSFLYER_ANDROID_APP_ID and APPSFLYER_IOS_APP_ID must be set in .env');
    process.exit(1);
  }

  // Determine date range
  const todayStr     = isoDate(new Date());
  const yesterdayStr = addDays(todayStr, -1);

  let from = args.from;
  let to   = args.to || yesterdayStr;

  // If --force-last N is given without explicit --from, derive it
  if (!from && args.forceLast) {
    from = addDays(todayStr, -args.forceLast);
  }

  if (!from || !to) {
    console.error('ERROR: --from and --to are required (or use --force-last N)');
    console.error('Usage: node scripts/backfill-daily.js --from YYYY-MM-DD --to YYYY-MM-DD [--force-last N] [--dry-run]');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    console.error('ERROR: dates must be in YYYY-MM-DD format');
    process.exit(1);
  }

  const dryRun    = !!args.dryRun;
  const forceLast = args.forceLast || 0;
  const androidId = APPSFLYER_ANDROID_APP_ID;
  const iosId     = APPSFLYER_IOS_APP_ID;

  console.log(`AF Channel Backfill: ${from} → ${to}${dryRun ? ' [DRY RUN]' : ''}${forceLast ? ` [force-last ${forceLast} days]` : ''}`);

  // Determine the "force window" boundary
  const forceFrom = forceLast > 0 ? addDays(todayStr, -forceLast) : null;

  // Find missing dates for the full range
  const missingDates = await getMissingAFChannelDates(androidId, from, to);
  const missingSet   = new Set(missingDates);

  // Build list of dates to process: missing + force window
  const allDates = getDatesInRange(from, to);
  const toProcess = allDates.filter(d => {
    if (missingSet.has(d)) return true;
    if (forceFrom && d >= forceFrom) return true;
    return false;
  });

  if (toProcess.length === 0) {
    console.log('Nothing to backfill — all dates already populated.');
    return;
  }

  console.log(`Dates to process: ${toProcess.length}`);
  if (dryRun) {
    console.log('Would process:', toProcess.join(', '));
    return;
  }

  // Fetch in one range call to minimise API requests
  const fetchFrom = toProcess[0];
  const fetchTo   = toProcess[toProcess.length - 1];

  console.log(`Fetching AF channels ${fetchFrom} → ${fetchTo} for both platforms...`);
  const [rawAndroid, rawIos] = await Promise.all([
    fetchAFChannels(androidId, fetchFrom, fetchTo),
    fetchAFChannels(iosId, fetchFrom, fetchTo),
  ]);

  if (rawAndroid?._afError) console.warn('Android fetch error:', rawAndroid._afError);
  if (rawIos?._afError)     console.warn('iOS fetch error:', rawIos._afError);

  const byDateAndroid = rawAndroid?._afError ? {} : parseAFChannelsByDate(rawAndroid);
  const byDateIos     = rawIos?._afError     ? {} : parseAFChannelsByDate(rawIos);

  let stored = 0, skipped = 0;
  const processSet = new Set(toProcess);

  for (const date of processSet) {
    const andDay = byDateAndroid[date] || {};
    const iosDay = byDateIos[date]     || {};
    const merged = mergeAFChannelPlatforms(andDay, iosDay);

    if (Object.keys(merged).length === 0) {
      console.log(`  ${date}: no channel data returned — skipping`);
      skipped++;
      continue;
    }

    await storeAFChannelForDate(androidId, date, merged);
    console.log(`  ${date}: stored ${Object.keys(merged).length} channels`);
    stored++;
  }

  console.log(`Done. Stored: ${stored}, Skipped (no data): ${skipped}`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
