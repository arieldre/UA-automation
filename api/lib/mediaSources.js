'use strict';

/**
 * Builds per-media-source metrics from the af_channels_daily cache.
 *
 * Reads af_channels_daily docs (populated by networks handler / cron) and
 * aggregates per-channel (media source) metrics over a date range.
 *
 * @param {string} from        YYYY-MM-DD
 * @param {string} to          YYYY-MM-DD
 * @param {string} androidId   AF Android app ID
 * @param {string} iosId       AF iOS app ID
 * @returns {Promise<{ android: Record<string,object>, ios: Record<string,object>, gaps: string[] }>}
 */
async function loadByMediaSource(from, to, androidId, iosId) {
  const { getAFDailyBreakdown, getDatesInRange } = require('../../webapp/db');

  const dates = getDatesInRange(from, to);
  const { android: androidByDate, ios: iosByDate } = await getAFDailyBreakdown(
    androidId,
    iosId,
    from,
    to
  );

  const gaps       = [];
  const androidAgg = {};
  const iosAgg     = {};

  for (const date of dates) {
    const hasAndroid = androidByDate[date] && Object.keys(androidByDate[date]).length > 0;
    const hasIos     = iosByDate[date]     && Object.keys(iosByDate[date]).length     > 0;
    if (!hasAndroid && !hasIos) {
      gaps.push(date);
      continue;
    }

    for (const [ch, m] of Object.entries(androidByDate[date] || {})) {
      if (!androidAgg[ch]) {
        androidAgg[ch] = { mediaSource: ch, installs: 0, clicks: 0, impressions: 0, cost: 0, revenue: 0, ecpi: 0, ipm: 0, roas: 0 };
      }
      androidAgg[ch].installs += m.installs || 0;
      androidAgg[ch].cost     += m.cost     || 0;
      androidAgg[ch].revenue  += m.revenue  || 0;
    }

    for (const [ch, m] of Object.entries(iosByDate[date] || {})) {
      if (!iosAgg[ch]) {
        iosAgg[ch] = { mediaSource: ch, installs: 0, clicks: 0, impressions: 0, cost: 0, revenue: 0, ecpi: 0, ipm: 0, roas: 0 };
      }
      iosAgg[ch].installs += m.installs || 0;
      iosAgg[ch].cost     += m.cost     || 0;
      iosAgg[ch].revenue  += m.revenue  || 0;
    }
  }

  // Derive ratios after full aggregation
  for (const m of Object.values(androidAgg)) {
    m.ecpi = m.installs > 0 ? m.cost / m.installs : 0;
    m.ipm  = m.impressions > 0 ? (m.installs / m.impressions) * 1000 : 0;
    m.roas = m.cost > 0 ? (m.revenue / m.cost) * 100 : 0;
  }
  for (const m of Object.values(iosAgg)) {
    m.ecpi = m.installs > 0 ? m.cost / m.installs : 0;
    m.ipm  = m.impressions > 0 ? (m.installs / m.impressions) * 1000 : 0;
    m.roas = m.cost > 0 ? (m.revenue / m.cost) * 100 : 0;
  }

  return { android: androidAgg, ios: iosAgg, gaps };
}

module.exports = { loadByMediaSource };
