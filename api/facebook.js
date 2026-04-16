module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const token    = process.env.FACEBOOK_ACCESS_TOKEN;
  const accounts = {
    titan:   process.env.FACEBOOK_AD_ACCOUNT_ID_TITAN,
    hitzone: process.env.FACEBOOK_AD_ACCOUNT_ID_HITZONE,
  };

  const results = {};
  for (const [name, accountId] of Object.entries(accounts)) {
    if (!accountId) { results[name] = { error: 'Account ID not configured' }; continue; }
    results[name] = await fetchInsights(accountId, from, to, token);
  }

  res.json(results);
};

async function fetchInsights(rawId, from, to, token) {
  const accountId = rawId.startsWith('act_') ? rawId : `act_${rawId}`;
  const fields = 'campaign_name,spend,clicks,impressions,cpm,cpc,ctr,actions,action_values';
  const timeRange = JSON.stringify({ since: from, until: to });

  const rows = [];
  let url = `https://graph.facebook.com/v21.0/${accountId}/insights` +
    `?fields=${encodeURIComponent(fields)}` +
    `&time_range=${encodeURIComponent(timeRange)}` +
    `&level=campaign` +
    `&time_increment=1` +
    `&limit=500` +
    `&access_token=${token}`;

  while (url) {
    const r    = await fetch(url);
    const json = await r.json();
    if (json.error) return { error: json.error.message, code: json.error.code };
    rows.push(...(json.data || []));
    url = json.paging?.next || null;
  }

  return parseInsights(rows);
}

function getAction(actions, type) {
  return parseFloat(actions?.find(a => a.action_type === type)?.value || 0);
}

function parseInsights(rows) {
  const byCampaign = {};
  for (const row of rows) {
    const name = row.campaign_name;
    if (!byCampaign[name]) byCampaign[name] = { spend:0, clicks:0, impressions:0, installs:0, purchases:0, purchaseRev:0 };
    const m = byCampaign[name];
    m.spend       += parseFloat(row.spend || 0);
    m.clicks      += parseInt(row.clicks || 0);
    m.impressions += parseInt(row.impressions || 0);
    m.installs    += getAction(row.actions, 'mobile_app_install');
    m.purchases   += getAction(row.actions, 'app_custom_event.fb_mobile_purchase');
    m.purchaseRev += parseFloat(row.action_values?.find(a => a.action_type === 'app_custom_event.fb_mobile_purchase')?.value || 0);
  }

  const campaigns = Object.entries(byCampaign).map(([name, m]) => ({
    name,
    spend:       +m.spend.toFixed(2),
    clicks:      m.clicks,
    impressions: m.impressions,
    installs:    m.installs,
    purchases:   m.purchases,
    purchaseRev: +m.purchaseRev.toFixed(2),
    cpm:  m.impressions > 0 ? +((m.spend / m.impressions) * 1000).toFixed(2) : null,
    cpc:  m.clicks      > 0 ? +(m.spend / m.clicks).toFixed(3) : null,
    ctr:  m.impressions > 0 ? +((m.clicks / m.impressions) * 100).toFixed(3) : null,
    ecpi: m.installs    > 0 ? +(m.spend / m.installs).toFixed(2) : null,
  }));

  const total = campaigns.reduce((acc, c) => {
    acc.spend       += c.spend;
    acc.clicks      += c.clicks;
    acc.impressions += c.impressions;
    acc.installs    += c.installs;
    acc.purchases   += c.purchases;
    acc.purchaseRev += c.purchaseRev;
    return acc;
  }, { spend:0, clicks:0, impressions:0, installs:0, purchases:0, purchaseRev:0 });

  total.spend       = +total.spend.toFixed(2);
  total.purchaseRev = +total.purchaseRev.toFixed(2);
  total.cpm  = total.impressions > 0 ? +((total.spend / total.impressions) * 1000).toFixed(2) : null;
  total.cpc  = total.clicks      > 0 ? +(total.spend / total.clicks).toFixed(3) : null;
  total.ctr  = total.impressions > 0 ? +((total.clicks / total.impressions) * 100).toFixed(3) : null;
  total.ecpi = total.installs    > 0 ? +(total.spend / total.installs).toFixed(2) : null;

  return { campaigns, total };
}
