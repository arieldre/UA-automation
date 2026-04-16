require('dotenv').config();
const { getCampaigns, storeCampaigns } = require('../webapp/db');

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const cached = await getCampaigns();
    if (cached) return res.json({ campaigns: cached, _fromDB: true });

    const token = await getAccessToken();
    const raw   = await gaQuery(token, `
      SELECT campaign.id, campaign.name, campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.status = ENABLED
      ORDER BY campaign.name
    `);
    if (raw.error) throw new Error(raw.error.message || JSON.stringify(raw.error));

    const campaigns = (raw.results || []).map(r => ({
      id:          r.campaign.id,
      name:        r.campaign.name,
      channelType: r.campaign.advertisingChannelType || 'UNKNOWN',
    }));

    await storeCampaigns(campaigns);
    res.json({ campaigns, _fromDB: false });
  } catch (err) {
    console.error('[campaigns]', err);
    res.status(500).json({ error: err.message });
  }
};
