require('dotenv').config();

let cachedToken = null, tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' })
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

async function gaQuery(token, query) {
  const { GOOGLE_CUSTOMER_ID, GOOGLE_DEVELOPER_TOKEN } = process.env;
  const r = await fetch(`https://googleads.googleapis.com/v23/customers/${GOOGLE_CUSTOMER_ID}/googleAds:search`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'developer-token': GOOGLE_DEVELOPER_TOKEN, 'login-customer-id': GOOGLE_CUSTOMER_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return r.json();
}

async function gaMutate(token, operations) {
  const { GOOGLE_CUSTOMER_ID, GOOGLE_DEVELOPER_TOKEN } = process.env;
  const r = await fetch(`https://googleads.googleapis.com/v23/customers/${GOOGLE_CUSTOMER_ID}/adGroupAds:mutate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'developer-token': GOOGLE_DEVELOPER_TOKEN, 'login-customer-id': GOOGLE_CUSTOMER_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations })
  });
  return r.json();
}

module.exports = { getAccessToken, gaQuery, gaMutate };
