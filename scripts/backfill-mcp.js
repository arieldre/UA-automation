#!/usr/bin/env node
'use strict';
/**
 * Backfills af_channels_daily for both Android and iOS via MCP.
 * Stores per-platform documents (one per appId per date).
 *
 * Usage:
 *   node scripts/backfill-mcp.js [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--force]
 *
 * Defaults: from = 30 days ago, to = yesterday.
 * --force: overwrites existing documents (otherwise skips dates already populated for BOTH platforms).
 */

require('dotenv').config();

const { storeAFChannelForDate, getMissingAFChannelDates, getDatesInRange } = require('../webapp/db');
const { fetchAFByMediaSource } = require('../webapp/lib/af-mcp');

const { APPSFLYER_ANDROID_APP_ID, APPSFLYER_IOS_APP_ID } = process.env;

function isoDate(d) { return d.toISOString().split('T')[0]; }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from')  args.from  = argv[++i];
    if (argv[i] === '--to')    args.to    = argv[++i];
    if (argv[i] === '--force') args.force = true;
  }
  return args;
}

async function main() {
  if (!APPSFLYER_ANDROID_APP_ID || !APPSFLYER_IOS_APP_ID) {
    console.error('ERROR: APPSFLYER_ANDROID_APP_ID / APPSFLYER_IOS_APP_ID not set');
    process.exit(1);
  }

  const args       = parseArgs(process.argv.slice(2));
  const today      = isoDate(new Date());
  const yesterday  = addDays(today, -1);
  const thirtyAgo  = addDays(today, -30);

  const from       = args.from  || thirtyAgo;
  const to         = args.to    || yesterday;
  const force      = !!args.force;
  const androidId  = APPSFLYER_ANDROID_APP_ID;
  const iosId      = APPSFLYER_IOS_APP_ID;

  console.log(`\nAF MCP Backfill: ${from} → ${to}${force ? ' [FORCE]' : ''}`);
  console.log(`Android: ${androidId}\niOS:     ${iosId}\n`);

  // Find dates missing for either platform
  let datesToProcess;
  if (force) {
    datesToProcess = new Set(getDatesInRange(from, to));
  } else {
    const missingAndroid = await getMissingAFChannelDates(androidId, from, to);
    const missingIos     = await getMissingAFChannelDates(iosId,     from, to);
    datesToProcess = new Set([...missingAndroid, ...missingIos]);
    console.log(`Missing android: ${missingAndroid.length} dates, iOS: ${missingIos.length} dates`);
    if (datesToProcess.size === 0) {
      console.log('Nothing to backfill — all dates already populated for both platforms.');
      process.exit(0);
    }
    console.log(`Dates to fill: ${datesToProcess.size}\n`);
  }

  // Fetch all in one MCP call (one call per platform, both parallel)
  console.log(`Fetching via MCP...`);
  const data = await fetchAFByMediaSource(androidId, iosId, from, to);

  if (data._errors?.android) console.warn('[WARN] Android MCP error:', data._errors.android);
  if (data._errors?.ios)     console.warn('[WARN] iOS MCP error:',     data._errors.ios);

  const allDates = [...new Set([
    ...Object.keys(data.android),
    ...Object.keys(data.ios),
  ])].sort().filter(d => d >= from && d <= to);

  console.log(`MCP returned data for ${allDates.length} dates\n`);

  let stored = 0, skipped = 0;

  for (const date of allDates) {
    if (!force && !datesToProcess.has(date)) { skipped++; continue; }

    const androidChannels = data.android[date] || {};
    const iosChannels     = data.ios[date]     || {};
    const androidGeo      = data.geo?.android?.[date] || [];
    const iosGeo          = data.geo?.ios?.[date]     || [];

    const hasAndroid = Object.keys(androidChannels).length > 0;
    const hasIos     = Object.keys(iosChannels).length > 0;

    if (!hasAndroid && !hasIos) { console.log(`  ${date}: no data — skip`); skipped++; continue; }

    if (hasAndroid) await storeAFChannelForDate(androidId, date, androidChannels, androidGeo.length ? androidGeo : null);
    if (hasIos)     await storeAFChannelForDate(iosId,     date, iosChannels,     iosGeo.length     ? iosGeo     : null);

    const aSrc = Object.keys(androidChannels).length;
    const iSrc = Object.keys(iosChannels).length;
    console.log(`  ${date}: android=${aSrc} channels, ios=${iSrc} channels`);
    stored++;
  }

  console.log(`\nDone. Stored: ${stored} dates, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
