require('dotenv').config();
const { getCampaigns, storeCampaigns, getAssetState, storeAssetState, getMissingAFChannelDates, storeAFChannelForDate } = require('../../db');
const { _test: assetsTest } = require('../assets');
const { _test: networksTest, _helpers: networksHelpers } = require('../networks');

const { GOOGLE_DEVELOPER_TOKEN, GOOGLE_CUSTOMER_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
        APPSFLYER_ANDROID_APP_ID, APPSFLYER_IOS_APP_ID } = process.env;

const { processAssetResults, computeAssetStateDiff } = assetsTest;
const { fetchAFChannels, mergeAFChannelPlatforms } = networksTest;
const { parseAFChannelsByDate } = networksHelpers;

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

async function refreshCampaignAssets(campaign, today) {
  const stateFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const stateTo   = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const token     = await getAccessToken();
  const raw       = await gaQuery(token, `
    SELECT
      campaign.name, ad_group.name,
      asset.id, asset.name, asset.type,
      asset.youtube_video_asset.youtube_video_id,
      asset.image_asset.full_size.url,
      asset.text_asset.text,
      ad_group_ad_asset_view.performance_label,
      ad_group_ad_asset_view.field_type,
      ad_group_ad_asset_view.enabled,
      metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM ad_group_ad_asset_view
    WHERE campaign.id = '${campaign.id}'
      AND segments.date BETWEEN '${stateFrom}' AND '${stateTo}'
  `);
  if (raw.error) throw new Error(`[${campaign.name}] GA error: ${raw.error.message}`);
  const prevState  = await getAssetState(campaign.id);
  const freshAssets = processAssetResults((raw.results || []).filter(r => r.adGroupAdAssetView?.enabled !== false));
  const merged      = computeAssetStateDiff(prevState?.assets, freshAssets, today);
  const stateDoc    = { campaignId: campaign.id, campaignName: campaign.name, assets: merged, lastChecked: today };
  await storeAssetState(campaign.id, stateDoc);
}

const REVISION_DAYS = 30;

async function refreshAFChannels(yesterday) {
  const androidId = APPSFLYER_ANDROID_APP_ID;
  const iosId     = APPSFLYER_IOS_APP_ID;
  if (!androidId || !iosId) return;

  // Always refresh the last REVISION_DAYS (AF revises recent conversion data)
  const revisionFrom = new Date(Date.now() - REVISION_DAYS * 86400000).toISOString().split('T')[0];

  const [rawAndroid, rawIos] = await Promise.all([
    fetchAFChannels(androidId, revisionFrom, yesterday),
    fetchAFChannels(iosId, revisionFrom, yesterday),
  ]);

  const byDateAndroid = rawAndroid?._afError ? {} : parseAFChannelsByDate(rawAndroid);
  const byDateIos     = rawIos?._afError     ? {} : parseAFChannelsByDate(rawIos);
  const allDates = [...new Set([...Object.keys(byDateAndroid), ...Object.keys(byDateIos)])].sort();

  for (const date of allDates) {
    if (date < revisionFrom || date > yesterday) continue;
    const merged = mergeAFChannelPlatforms(byDateAndroid[date] || {}, byDateIos[date] || {});
    if (Object.keys(merged).length > 0) {
      await storeAFChannelForDate(androidId, date, merged);
    }
  }
}

module.exports = async function handler(req, res) {
  // Allow Vercel cron (x-vercel-cron header) or manual call with CRON_SECRET
  const cronSecret     = process.env.CRON_SECRET;
  const isVercelCron   = req.headers['x-vercel-cron'] === '1';
  const isManualSecret = cronSecret && req.headers['x-cron-secret'] === cronSecret;
  if (!isVercelCron && !isManualSecret) return res.status(401).json({ error: 'Unauthorized' });

  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  try {
    // Get campaigns list
    let campaigns = await getCampaigns();
    if (!campaigns) {
      const token = await getAccessToken();
      const raw   = await gaQuery(token, `
        SELECT campaign.id, campaign.name, campaign.advertising_channel_type
        FROM campaign
        WHERE campaign.status = ENABLED
        ORDER BY campaign.name
      `);
      if (raw.error) throw new Error('Failed to fetch campaigns: ' + raw.error.message);
      campaigns = (raw.results || []).map(r => ({
        id:          r.campaign.id,
        name:        r.campaign.name,
        channelType: r.campaign.advertisingChannelType,
      }));
      await storeCampaigns(campaigns);
    }

    // Refresh creative state for all campaigns (parallel, up to 5 at a time)
    const errors = [];
    for (let i = 0; i < campaigns.length; i += 5) {
      const batch = campaigns.slice(i, i + 5);
      await Promise.all(batch.map(c =>
        refreshCampaignAssets(c, today).catch(e => errors.push(e.message))
      ));
    }

    // Refresh AF channels for yesterday
    await refreshAFChannels(yesterday).catch(e => errors.push('AF: ' + e.message));

    res.json({ ok: true, today, yesterday, campaigns: campaigns.length, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error('[cron/refresh]', err);
    res.status(500).json({ error: err.message });
  }
};
