require('dotenv').config();
const { getMissingNetworksDates, storeNetworksByDate, getNetworksByDate, getCampaigns } = require('../db');

const { GOOGLE_DEVELOPER_TOKEN, GOOGLE_CUSTOMER_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

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

module.exports = async function handler(req, res) {
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

    res.json({ from, to, campaigns, _fromDB: missing.length === 0 });
  } catch (err) {
    console.error('[networks]', err);
    res.status(500).json({ error: err.message });
  }
};
