require('dotenv').config();
const { getMissingNetworksDates, storeNetworksByDate, getNetworksByDate,
        getMissingAFChannelDates, storeAFChannelForDate, getAFChannelsForRange } = require('../db');
const { getAccessToken, gaQuery, processNetworkResults, aggregateNetworks,
        fetchAFChannels, parseAFChannelsByDate, mergeAFChannelPlatforms, buildAFChannelRows } = require('./networks')._helpers;

const { APPSFLYER_ANDROID_APP_ID, APPSFLYER_IOS_APP_ID } = process.env;

// Returns { prevFrom: "YYYY-MM-DD", prevTo: "YYYY-MM-DD" } — previous full calendar month
function getPrevMonthRange(from) {
  const d = new Date(from + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(); // m is 0-indexed
  const prevFrom = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay  = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const prevTo   = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { prevFrom, prevTo };
}

async function fetchNetworksForRange(from, to) {
  const missing = await getMissingNetworksDates(from, to);
  if (missing.length > 0) {
    const fetchFrom = missing[0], fetchTo = missing[missing.length - 1];
    const token = await getAccessToken();
    const raw   = await gaQuery(token, `
      SELECT campaign.name, campaign.id, segments.date, segments.ad_network_type,
             metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions,
             metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${fetchFrom}' AND '${fetchTo}'
        AND campaign.status = ENABLED
    `);
    if (!raw.error) {
      const { byDate } = processNetworkResults(raw.results || []);
      await storeNetworksByDate(byDate, fetchFrom, fetchTo);
    }
  }
  return getNetworksByDate(from, to);
}

async function fetchAFForRange(from, to) {
  const androidId = APPSFLYER_ANDROID_APP_ID;
  const iosId     = APPSFLYER_IOS_APP_ID;
  if (!androidId || !iosId) return null;

  const missingDates = await getMissingAFChannelDates(androidId, from, to);
  if (missingDates.length > 0) {
    const fetchFrom = missingDates[0], fetchTo = missingDates[missingDates.length - 1];
    const [rawAndroid, rawIos] = await Promise.all([
      fetchAFChannels(androidId, fetchFrom, fetchTo),
      fetchAFChannels(iosId,     fetchFrom, fetchTo),
    ]);
    if (!rawAndroid?._afError || !rawIos?._afError) {
      const byDateAndroid = parseAFChannelsByDate(rawAndroid);
      const byDateIos     = parseAFChannelsByDate(rawIos);
      const missingSet    = new Set(missingDates);
      const allDates      = new Set([...Object.keys(byDateAndroid), ...Object.keys(byDateIos)]);
      for (const date of allDates) {
        if (!missingSet.has(date)) continue;
        const merged = mergeAFChannelPlatforms(byDateAndroid[date] || {}, byDateIos[date] || {});
        if (Object.keys(merged).length > 0) await storeAFChannelForDate(androidId, date, merged);
      }
    }
  }
  return getAFChannelsForRange(androidId, from, to);
}

const handler = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return res.status(400).json({ error: 'Invalid date format' });

  try {
    const { prevFrom, prevTo } = getPrevMonthRange(from);

    // Fetch previous month GA + AF in parallel
    const [networksByDate, afChannels] = await Promise.all([
      fetchNetworksForRange(prevFrom, prevTo),
      fetchAFForRange(prevFrom, prevTo),
    ]);

    const campaigns = aggregateNetworks(networksByDate, {});
    const campaignsWithAF = campaigns.map(camp => ({
      ...camp,
      afChannelRows: buildAFChannelRows(camp, afChannels),
    }));

    // Index by campaignId and normalized name for frontend joining
    const byId   = {};
    const byName = {};
    for (const c of campaignsWithAF) {
      if (c.campaignId) byId[c.campaignId] = c;
      byName[c.campaignName] = c;
    }

    res.json({ prevFrom, prevTo, campaigns: campaignsWithAF, byId, byName });
  } catch (err) {
    console.error('[networks-compare]', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = handler;
module.exports._test = { getPrevMonthRange };
