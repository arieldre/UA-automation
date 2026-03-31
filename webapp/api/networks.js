require('dotenv').config();
const { getMissingNetworksDates, storeNetworksByDate, getNetworksByDate, getCampaigns, getMissingAFChannelDates, storeAFChannelForDate, getAFChannelsForRange } = require('../db');

const { GOOGLE_DEVELOPER_TOKEN, GOOGLE_CUSTOMER_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
        APPSFLYER_TOKEN, APPSFLYER_ANDROID_APP_ID, APPSFLYER_IOS_APP_ID } = process.env;

let _cachedToken = null, _tokenExpiry = 0;
async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry - 60000) return _cachedToken;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' })
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  _cachedToken = data.access_token;
  _tokenExpiry = Date.now() + data.expires_in * 1000;
  return _cachedToken;
}

async function gaQuery(token, q) {
  const r = await fetch(`https://googleads.googleapis.com/v23/customers/${GOOGLE_CUSTOMER_ID}/googleAds:search`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'developer-token': GOOGLE_DEVELOPER_TOKEN, 'login-customer-id': GOOGLE_CUSTOMER_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q })
  });
  return r.json();
}

// v23 AdNetworkType enum string values
const NETWORK_LABELS = {
  SEARCH:               'Google Search',
  SEARCH_PARTNERS:      'Search partners',
  CONTENT:              'Display Network',
  YOUTUBE:              'YouTube',
  YOUTUBE_WATCH:        'YouTube',
  YOUTUBE_SEARCH:       'YouTube Search',
  GMAIL:                'Gmail',
  DISCOVER:             'Discover',
  MAPS:                 'Maps',
  GOOGLE_TV:            'Google TV',
  GOOGLE_OWNED_CHANNELS:'Google Owned Channels',
  MIXED:                'Cross-network',
};

function processNetworkResults(results) {
  // Returns { byDate: { "YYYY-MM-DD": { "CampaignName": { "SEARCH": {...} } } }, campaignIds: { name → id } }
  const byDate = {}, campaignIds = {};
  for (const r of results) {
    const date    = r.segments?.date;
    const name    = r.campaign?.name || 'Unknown';
    const id      = r.campaign?.id;
    const network = r.segments?.adNetworkType || 'UNKNOWN';
    if (!date) continue;
    if (id) campaignIds[name] = id;
    if (!byDate[date])          byDate[date] = {};
    if (!byDate[date][name])    byDate[date][name] = {};
    if (!byDate[date][name][network]) byDate[date][name][network] = { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
    const m = byDate[date][name][network];
    m.spend       += (r.metrics?.costMicros || 0) / 1e6;
    m.clicks      += parseInt(r.metrics?.clicks || 0);
    m.impressions += parseInt(r.metrics?.impressions || 0);
    m.conversions += parseFloat(r.metrics?.conversions || 0);
  }
  return { byDate, campaignIds };
}

function aggregateNetworks(networksByDate, campaignIds) {
  // Aggregate all dates: { campaignName → { networkType → { spend, clicks, impressions, conversions } } }
  const byCampaign = {};
  for (const dayData of Object.values(networksByDate)) {
    for (const [camp, networks] of Object.entries(dayData)) {
      if (!byCampaign[camp]) byCampaign[camp] = {};
      for (const [net, m] of Object.entries(networks)) {
        if (!byCampaign[camp][net]) byCampaign[camp][net] = { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
        const a = byCampaign[camp][net];
        a.spend       += m.spend;
        a.clicks      += m.clicks;
        a.impressions += m.impressions;
        a.conversions += m.conversions;
      }
    }
  }

  const campaigns = Object.entries(byCampaign).map(([campaignName, nets]) => {
    const networks = Object.entries(nets)
      .filter(([, m]) => m.spend > 0 || m.impressions > 0)
      .map(([network, m]) => ({
        network,
        label:       NETWORK_LABELS[network] || network,
        spend:       +m.spend.toFixed(2),
        clicks:      m.clicks,
        impressions: m.impressions,
        conversions: +m.conversions.toFixed(2),
        ctr:  m.impressions > 0 ? +((m.clicks / m.impressions) * 100).toFixed(3) : null,
        cpm:  m.impressions > 0 ? +((m.spend / m.impressions) * 1000).toFixed(2) : null,
        cpc:  m.clicks > 0      ? +(m.spend / m.clicks).toFixed(3) : null,
      }))
      .sort((a, b) => b.spend - a.spend);

    const total = networks.reduce((acc, n) => {
      acc.spend       += n.spend;
      acc.clicks      += n.clicks;
      acc.impressions += n.impressions;
      acc.conversions += n.conversions;
      return acc;
    }, { spend: 0, clicks: 0, impressions: 0, conversions: 0 });

    total.spend       = +total.spend.toFixed(2);
    total.conversions = +total.conversions.toFixed(2);
    total.ctr  = total.impressions > 0 ? +((total.clicks / total.impressions) * 100).toFixed(3) : null;
    total.cpm  = total.impressions > 0 ? +((total.spend / total.impressions) * 1000).toFixed(2) : null;
    total.cpc  = total.clicks > 0      ? +(total.spend / total.clicks).toFixed(3) : null;

    return { campaignId: campaignIds[campaignName] || null, campaignName, networks, total };
  }).sort((a, b) => b.total.spend - a.total.spend);

  return campaigns;
}

// ── AppsFlyer channel mapping ─────────────────────────────────────────────────

const GA_TO_AF_CHANNEL = {
  SEARCH:          'ACI_Search',
  SEARCH_PARTNERS: 'ACI_Search',
  CONTENT:         'ACI_Display',
  YOUTUBE_WATCH:   'ACI_Youtube',
  YOUTUBE_SEARCH:  'ACI_Youtube',
  YOUTUBE:         'ACI_Youtube',
  MIXED:           'ACI_',
};

// AF channel display config: channel key → { label, gaNetworks }
const AF_CHANNEL_CONFIG = [
  { afChannel: 'ACI_Search',  label: 'Search',  gaNetworks: ['SEARCH', 'SEARCH_PARTNERS'] },
  { afChannel: 'ACI_Display', label: 'Display', gaNetworks: ['CONTENT'] },
  { afChannel: 'ACI_Youtube', label: 'YouTube', gaNetworks: ['YOUTUBE_WATCH', 'YOUTUBE_SEARCH', 'YOUTUBE'] },
];

async function fetchAFChannels(appId, from, to) {
  if (!APPSFLYER_TOKEN || !appId) return { _afError: 'missing config' };
  try {
    const url = `https://hq1.appsflyer.com/api/agg-data/export/app/${appId}/partners_by_date_report/v5` +
      `?from=${from}&to=${to}` +
      `&groupings=af_channel&kpis=installs,cost,revenue&media_source=googleadwords_int`;
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${APPSFLYER_TOKEN}` } });
    const text = await r.text();
    if (!r.ok || text.trim().startsWith('{')) return { _afError: text.substring(0, 200) };
    return text;
  } catch (e) {
    return { _afError: e.message };
  }
}

function parseAFChannels(raw) {
  if (!raw || typeof raw !== 'string') return {};
  const lines = raw.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return {};
  const headers = lines[0].split(',').map(h => h.trim());
  const chIdx  = headers.findIndex(h => h.toLowerCase().includes('channel'));
  const inIdx  = headers.findIndex(h => h.toLowerCase() === 'installs');
  const coIdx  = headers.findIndex(h => h.toLowerCase() === 'cost');
  const reIdx  = headers.findIndex(h => h.toLowerCase() === 'revenue');
  if (chIdx === -1) return {};

  const result = {};
  for (let i = 1; i < lines.length; i++) {
    const cols    = lines[i].split(',');
    const channel = cols[chIdx]?.trim();
    if (!channel) continue;
    result[channel] = {
      installs: inIdx >= 0 ? (parseFloat(cols[inIdx]) || 0) : 0,
      cost:     coIdx >= 0 ? (parseFloat(cols[coIdx]) || 0) : 0,
      revenue:  reIdx >= 0 ? (parseFloat(cols[reIdx]) || 0) : 0,
    };
  }
  return result;
}

function mergeAFChannelPlatforms(android, ios) {
  const a = android || {}, b = ios || {};
  const result = {};
  for (const [ch, m] of Object.entries(a)) {
    result[ch] = { installs: m.installs, cost: m.cost, revenue: m.revenue };
  }
  for (const [ch, m] of Object.entries(b)) {
    if (!result[ch]) result[ch] = { installs: 0, cost: 0, revenue: 0 };
    result[ch].installs += m.installs;
    result[ch].cost     += m.cost;
    result[ch].revenue  += m.revenue;
  }
  return result;
}

function buildAFChannelRows(campaign, afChannels) {
  if (!afChannels) return [];
  const rows = [];
  for (const { afChannel, label, gaNetworks } of AF_CHANNEL_CONFIG) {
    // Sum GA metrics for all GA networks that map to this AF channel
    const gaNetworksInCamp = (campaign.networks || []).filter(n => gaNetworks.includes(n.network));
    const gaSpend       = gaNetworksInCamp.reduce((s, n) => s + n.spend, 0);
    const gaClicks      = gaNetworksInCamp.reduce((s, n) => s + n.clicks, 0);
    const gaImpressions = gaNetworksInCamp.reduce((s, n) => s + n.impressions, 0);
    const gaConversions = gaNetworksInCamp.reduce((s, n) => s + n.conversions, 0);

    const af = afChannels[afChannel];
    const afInstalls = af?.installs || 0;
    const afCost     = af?.cost     || 0;
    const afRevenue  = af?.revenue  || 0;

    // Skip row if no GA data AND no AF installs
    if (gaSpend === 0 && gaImpressions === 0 && afInstalls === 0) continue;

    rows.push({
      afChannel,
      label,
      gaSpend:       +gaSpend.toFixed(2),
      gaClicks,
      gaImpressions,
      gaConversions: +gaConversions.toFixed(2),
      gaCtr:         gaImpressions > 0 ? +((gaClicks / gaImpressions) * 100).toFixed(3) : null,
      afInstalls,
      afCost:        +afCost.toFixed(2),
      afRevenue:     +afRevenue.toFixed(2),
      afCpa:         afInstalls > 0 ? +(afCost / afInstalls).toFixed(4) : null,
      afRoas:        afCost > 0     ? +((afRevenue / afCost) * 100).toFixed(2) : null,
    });
  }
  return rows;
}

const handler = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({ error: 'Invalid date format' });

  try {
    const missing = await getMissingNetworksDates(from, to);
    let liveCampaignIds = null;

    if (missing.length > 0) {
      const fetchFrom = missing[0];
      const fetchTo   = missing[missing.length - 1];
      const token     = await getAccessToken();
      const raw = await gaQuery(token, `
        SELECT campaign.name, campaign.id, segments.date, segments.ad_network_type,
               metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
        FROM campaign
        WHERE segments.date BETWEEN '${fetchFrom}' AND '${fetchTo}'
          AND campaign.status = ENABLED
      `);
      if (raw.error) throw new Error(raw.error.message || JSON.stringify(raw.error));
      const { byDate, campaignIds } = processNetworkResults(raw.results || []);
      liveCampaignIds = campaignIds;
      await storeNetworksByDate(byDate, fetchFrom, fetchTo);
    }

    // Build campaignIds map: prefer live data; fall back to campaigns cache
    let campaignIds = liveCampaignIds;
    if (!campaignIds) {
      const cached = await getCampaigns();
      campaignIds = {};
      for (const c of (cached || [])) campaignIds[c.name] = c.id;
    }

    const networksByDate = await getNetworksByDate(from, to);
    const campaigns      = aggregateNetworks(networksByDate, campaignIds);

    // ── AF channel data (per-date store) ─────────────────────────────────────
    let afChannels  = null;
    const androidId = APPSFLYER_ANDROID_APP_ID;
    const iosId     = APPSFLYER_IOS_APP_ID;

    const afDebug = { hasConfig: !!(androidId && iosId), missingDates: [], errors: [], stored: 0 };
    if (androidId && iosId) {
      const missingDates = await getMissingAFChannelDates(androidId, from, to);
      afDebug.missingDates = missingDates;
      if (missingDates.length > 0) {
        // Fetch missing dates in batches of 5
        for (let i = 0; i < missingDates.length; i += 5) {
          const batch = missingDates.slice(i, i + 5);
          await Promise.all(batch.map(async date => {
            const [rawAndroid, rawIos] = await Promise.all([
              fetchAFChannels(androidId, date, date),
              fetchAFChannels(iosId, date, date),
            ]);
            if (rawAndroid?._afError) afDebug.errors.push(`android ${date}: ${rawAndroid._afError}`);
            if (rawIos?._afError)     afDebug.errors.push(`ios ${date}: ${rawIos._afError}`);
            const merged = mergeAFChannelPlatforms(parseAFChannels(rawAndroid), parseAFChannels(rawIos));
            if (Object.keys(merged).length > 0) {
              await storeAFChannelForDate(androidId, date, merged);
              afDebug.stored++;
            }
          }));
        }
      }
      afChannels = await getAFChannelsForRange(androidId, from, to);
      afDebug.rangeResult = afChannels ? Object.keys(afChannels) : null;
    }

    // Attach AF channel rows to each campaign
    const campaignsWithAF = campaigns.map(camp => ({
      ...camp,
      afChannelRows: buildAFChannelRows(camp, afChannels),
    }));

    res.json({ from, to, campaigns: campaignsWithAF, _fromDB: missing.length === 0, _afDebug: afDebug });
  } catch (err) {
    console.error('[networks]', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = handler;
module.exports._test = { processNetworkResults, aggregateNetworks, fetchAFChannels, parseAFChannels, mergeAFChannelPlatforms, buildAFChannelRows };
