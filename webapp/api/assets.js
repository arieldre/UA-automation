require('dotenv').config();
const { getAssets, storeAssets } = require('../db');

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

const VIDEO_TYPES  = new Set(['YOUTUBE_VIDEO', 'PORTRAIT_YOUTUBE_VIDEO', 'SQUARE_YOUTUBE_VIDEO']);
const IMAGE_TYPES  = new Set(['MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE', 'PORTRAIT_MARKETING_IMAGE', 'LANDSCAPE_LOGO', 'LOGO']);
const TEXT_TYPES   = new Set(['HEADLINE', 'DESCRIPTION', 'LONG_HEADLINE', 'CALL_TO_ACTION_SELECTION', 'BUSINESS_NAME']);

function orientationFromFieldType(ft) {
  if (ft?.includes('PORTRAIT'))  return 'Portrait';
  if (ft?.includes('SQUARE'))    return 'Square';
  if (ft?.includes('LANDSCAPE')) return 'Landscape';
  return null;
}

function processAssetResults(results) {
  const byAsset = {}; // key = assetId_fieldType

  for (const r of results) {
    const view    = r.adGroupAdAssetView || {};
    const asset   = r.asset || {};
    const fieldType = view.fieldType;
    const assetId  = asset.id;
    if (!assetId || !fieldType) continue;

    const key = `${assetId}_${fieldType}`;
    if (!byAsset[key]) {
      byAsset[key] = {
        id:               assetId,
        fieldType,
        performanceLabel: view.performanceLabel || 'UNSPECIFIED',
        enabled:          view.enabled !== false,
        name:             asset.name || '',
        // Video
        youtubeId:  asset.youtubeVideoAsset?.youtubeVideoId || null,
        // Image
        imageUrl:   asset.imageAsset?.fullSize?.url || null,
        // Text
        text:       asset.textAsset?.text || null,
        // Metrics (accumulated across dates)
        impressions: 0,
        clicks:      0,
        spend:       0,
        conversions: 0,
      };
    }

    const m = byAsset[key];
    // Keep the latest performance label (may vary by row — last wins)
    if (view.performanceLabel && view.performanceLabel !== 'UNSPECIFIED') {
      m.performanceLabel = view.performanceLabel;
    }
    m.impressions += parseInt(r.metrics?.impressions || 0);
    m.clicks      += parseInt(r.metrics?.clicks || 0);
    m.spend       += (r.metrics?.costMicros || 0) / 1e6;
    m.conversions += parseFloat(r.metrics?.conversions || 0);
  }

  const video = [], image = [], text = [];

  for (const m of Object.values(byAsset)) {
    m.spend       = +m.spend.toFixed(2);
    m.conversions = +m.conversions.toFixed(2);
    m.ctr  = m.impressions > 0 ? +((m.clicks / m.impressions) * 100).toFixed(3) : null;
    m.cpi  = m.conversions > 0 ? +(m.spend / m.conversions).toFixed(2) : null;
    m.orientation = orientationFromFieldType(m.fieldType);

    if (VIDEO_TYPES.has(m.fieldType)) {
      video.push(m);
    } else if (IMAGE_TYPES.has(m.fieldType)) {
      image.push(m);
    } else if (TEXT_TYPES.has(m.fieldType)) {
      text.push(m);
    }
  }

  // Sort each group by spend desc
  const bySpend = (a, b) => b.spend - a.spend;
  video.sort(bySpend);
  image.sort(bySpend);
  text.sort(bySpend);

  return { video, image, text };
}

const handler = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { campaignId, from, to } = req.query;
  if (!campaignId || !from || !to) return res.status(400).json({ error: 'campaignId, from, and to are required' });
  if (!/^\d+$/.test(campaignId)) return res.status(400).json({ error: 'Invalid campaignId' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({ error: 'Invalid date format' });

  try {
    const cached = await getAssets(campaignId, from, to);
    if (cached) return res.json({ _fromDB: true, ...cached });

    const token = await getAccessToken();
    const raw   = await gaQuery(token, `
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
      WHERE campaign.id = '${campaignId}'
        AND segments.date BETWEEN '${from}' AND '${to}'
    `);

    if (raw.error) throw new Error(raw.error.message || JSON.stringify(raw.error));

    const campaignName = raw.results?.[0]?.campaign?.name || '';
    const assets = processAssetResults(raw.results || []);

    await storeAssets(campaignId, from, to, { campaignName, assets });
    res.json({ _fromDB: false, campaignName, assets });
  } catch (err) {
    console.error('[assets]', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = handler;
module.exports._test = { processAssetResults, orientationFromFieldType };
