const {
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_DEVELOPER_TOKEN,
  GOOGLE_CUSTOMER_ID, GOOGLE_REFRESH_TOKEN,
  APPSFLYER_TOKEN, APPSFLYER_ANDROID_APP_ID, APPSFLYER_IOS_APP_ID
} = process.env;

const { getDatesInRange, getMissingDates, storeGAByDate, storeAFByDate, getGAByDate, getAFByDate } = require('../db');

async function getAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' })
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function gaQuery(token, q) {
  const r = await fetch(`https://googleads.googleapis.com/v23/customers/${GOOGLE_CUSTOMER_ID}/googleAds:search`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'developer-token': GOOGLE_DEVELOPER_TOKEN, 'login-customer-id': GOOGLE_CUSTOMER_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q })
  });
  return r.json();
}

async function fetchGoogleAds(from, to, token) {
  return gaQuery(token, `
    SELECT campaign.name, segments.date,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.all_conversions, metrics.all_conversions_value,
           metrics.average_cpm
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status = ENABLED
  `);
}

async function fetchGoogleAdsPurchases(from, to, token) {
  return gaQuery(token, `
    SELECT campaign.name, segments.date,
           segments.conversion_action_name,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status = ENABLED
      AND segments.conversion_action_category = 'PURCHASE'
  `);
}

async function fetchAppsFlyer(appId, from, to) {
  const r = await fetch(`https://hq1.appsflyer.com/api/agg-data/export/app/${appId}/partners_by_date_report/v5?from=${from}&to=${to}&media_source=googleadwords_int&category=standard`, {
    headers: { 'Authorization': `Bearer ${APPSFLYER_TOKEN}` }
  });
  const text = await r.text();
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    return { _afError: `HTTP ${r.status} — non-CSV response: ${text.substring(0, 200)}` };
  }
  if (!r.ok) return { _afError: `HTTP ${r.status}: ${text.substring(0, 200)}` };
  const lineCount = text.trim().split('\n').filter(l => l.trim()).length;
  return { _afDebug: `HTTP ${r.status} — ${lineCount} lines`, _csv: text };
}

function parseAF(raw) {
  if (raw && raw._afError) return { byDate:{}, aggregate:{ total:0, byCampaign:{} }, _debug: raw._afError };
  const csv = raw && raw._csv ? raw._csv : (typeof raw === 'string' ? raw : JSON.stringify(raw));
  const _debug = raw && raw._afDebug ? raw._afDebug : null;
  const lines = csv.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return { byDate:{}, aggregate:{ total:0, byCampaign:{} }, _debug: (_debug||'') + ' — 0 data rows' };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
  const idx = n => headers.indexOf(n);
  const dateIdx       = idx('Date');
  const campIdx       = idx('Campaign (c)') !== -1 ? idx('Campaign (c)') : idx('Campaign');
  const installsIdx   = idx('Installs');
  const clicksIdx     = idx('Clicks');
  const impIdx        = idx('Impressions');
  const costIdx       = idx('Total Cost') !== -1 ? idx('Total Cost') : idx('Cost');
  const revIdx        = idx('Total Revenue');
  const ecpiIdx       = idx('Average eCPI');
  const roiIdx        = idx('ROI');
  const purchasesIdx  = idx('af_purchase (Event counter)');
  const purchasersIdx = idx('af_purchase (Unique users)');
  const purchaseRevIdx= idx('af_purchase (Sales in USD)');

  const zero = () => ({ installs:0, clicks:0, impressions:0, cost:0, revenue:0, ecpi:0, roi:'N/A', purchases:0, purchasers:0, purchaseRev:0 });
  const add = (obj, camp, vals) => {
    if (!obj[camp]) obj[camp] = zero();
    obj[camp].installs    += parseInt(vals[installsIdx]    || 0);
    obj[camp].clicks      += parseInt(vals[clicksIdx]      || 0);
    obj[camp].impressions += parseInt(vals[impIdx]         || 0);
    obj[camp].cost        += parseFloat(vals[costIdx]      || 0);
    obj[camp].revenue     += parseFloat(vals[revIdx]       || 0);
    obj[camp].ecpi         = parseFloat(vals[ecpiIdx]      || 0);
    obj[camp].roi          = vals[roiIdx] || 'N/A';
    if (purchasesIdx  !== -1) obj[camp].purchases   += parseInt(vals[purchasesIdx]    || 0);
    if (purchasersIdx !== -1) obj[camp].purchasers  += parseInt(vals[purchasersIdx]   || 0);
    if (purchaseRevIdx!== -1) obj[camp].purchaseRev += parseFloat(vals[purchaseRevIdx]|| 0);
  };
  const splitCSV = line => {
    const out = []; let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const byDate = {}, aggregate = { total:0, byCampaign:{} };
  for (const line of lines.slice(1)) {
    const vals = splitCSV(line);
    const camp = vals[campIdx] || 'Unknown';
    const date = dateIdx !== -1 ? vals[dateIdx] : null;
    if (date) {
      if (!byDate[date]) byDate[date] = { total:0, byCampaign:{} };
      add(byDate[date].byCampaign, camp, vals);
      byDate[date].total += parseInt(vals[installsIdx] || 0);
    }
    add(aggregate.byCampaign, camp, vals);
    aggregate.total += parseInt(vals[installsIdx] || 0);
  }
  return { byDate, aggregate, _debug };
}

function mergeAFData(a, b) {
  const merged = {};
  const zero = () => ({ installs:0, clicks:0, impressions:0, cost:0, revenue:0, ecpi:0, roi:'N/A', purchases:0, purchasers:0, purchaseRev:0 });
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] || zero(), y = b[k] || zero();
    merged[k] = {
      installs:    (x.installs||0)+(y.installs||0),
      clicks:      (x.clicks||0)+(y.clicks||0),
      impressions: (x.impressions||0)+(y.impressions||0),
      cost:        (x.cost||0)+(y.cost||0),
      revenue:     (x.revenue||0)+(y.revenue||0),
      purchases:   (x.purchases||0)+(y.purchases||0),
      purchasers:  (x.purchasers||0)+(y.purchasers||0),
      purchaseRev: (x.purchaseRev||0)+(y.purchaseRev||0),
      ecpi: x.ecpi||y.ecpi, roi: x.roi||y.roi
    };
  }
  return merged;
}

function processGAResults(results, purchaseResults) {
  const byDate = {};
  for (const r of results) {
    const date = r.segments?.date;
    const name = r.campaign?.name || 'Unknown';
    if (!byDate[date]) byDate[date] = {};
    if (!byDate[date][name]) byDate[date][name] = { spend:0, clicks:0, impressions:0, conversions:0, revenue:0, allConversions:0, allRevenue:0, avgCpmMicros:0, _impCount:0, purchases:0, purchaseRevenue:0 };
    const m = byDate[date][name];
    m.spend          += (r.metrics?.costMicros || 0) / 1e6;
    m.clicks         += parseInt(r.metrics?.clicks || 0);
    m.impressions    += parseInt(r.metrics?.impressions || 0);
    m.conversions    += parseFloat(r.metrics?.conversions || 0);
    m.revenue        += parseFloat(r.metrics?.conversionsValue || 0);
    m.allConversions += parseFloat(r.metrics?.allConversions || 0);
    m.allRevenue     += parseFloat(r.metrics?.allConversionsValue || 0);
    m.avgCpmMicros   += (parseFloat(r.metrics?.averageCpm || 0)) * parseInt(r.metrics?.impressions || 0);
    m._impCount      += parseInt(r.metrics?.impressions || 0);
  }
  for (const r of (purchaseResults || [])) {
    const date = r.segments?.date;
    const name = r.campaign?.name || 'Unknown';
    if (!byDate[date]) byDate[date] = {};
    if (!byDate[date][name]) byDate[date][name] = { spend:0, clicks:0, impressions:0, conversions:0, revenue:0, allConversions:0, allRevenue:0, avgCpmMicros:0, _impCount:0, purchases:0, purchaseRevenue:0 };
    byDate[date][name].purchases       += parseFloat(r.metrics?.conversions || 0);
    byDate[date][name].purchaseRevenue += parseFloat(r.metrics?.conversionsValue || 0);
  }
  for (const day of Object.values(byDate)) {
    for (const m of Object.values(day)) {
      m.cpm = m._impCount > 0 ? (m.avgCpmMicros / m._impCount) / 1e6 : null;
    }
  }
  return byDate;
}

function aggregateGA(byDate) {
  const agg = {};
  for (const day of Object.values(byDate)) {
    for (const [name, m] of Object.entries(day)) {
      if (!agg[name]) agg[name] = { spend:0, clicks:0, impressions:0, conversions:0, revenue:0, allConversions:0, allRevenue:0, purchases:0, purchaseRevenue:0, _cpmSum:0, _impCount:0 };
      agg[name].spend          += m.spend;
      agg[name].clicks         += m.clicks;
      agg[name].impressions    += m.impressions;
      agg[name].conversions    += m.conversions;
      agg[name].revenue        += m.revenue;
      agg[name].allConversions += m.allConversions;
      agg[name].allRevenue     += m.allRevenue;
      agg[name].purchases      += m.purchases;
      agg[name].purchaseRevenue+= m.purchaseRevenue;
      if (m.cpm != null) { agg[name]._cpmSum += m.cpm * m.impressions; agg[name]._impCount += m.impressions; }
    }
  }
  for (const m of Object.values(agg)) {
    m.cpm = m._impCount > 0 ? m._cpmSum / m._impCount : null;
  }
  return agg;
}

function computeMetrics(gaByName, afByCampaign, afTotal) {
  let gaSpend=0,gaClicks=0,gaImp=0,gaConv=0,gaRev=0,gaAllConv=0,gaAllRev=0,gaPurchases=0,gaPurchaseRev=0,gaCpmSum=0,gaCpmImp=0;
  let afSpend=0,afClicks=0,afImp=0,afRev=0,afPurchases=0,afPurchasers=0,afPurchaseRev=0;
  for (const g of Object.values(gaByName)) {
    gaSpend+=g.spend||0; gaClicks+=g.clicks||0; gaImp+=g.impressions||0; gaConv+=g.conversions||0;
    gaRev+=g.revenue||0; gaAllConv+=g.allConversions||0; gaAllRev+=g.allRevenue||0;
    gaPurchases+=g.purchases||0; gaPurchaseRev+=g.purchaseRevenue||0;
    if (g.cpm!=null){ gaCpmSum+=g.cpm*(g.impressions||0); gaCpmImp+=g.impressions||0; }
  }
  for (const a of Object.values(afByCampaign)) {
    afSpend+=a.cost||0; afClicks+=a.clicks||0; afImp+=a.impressions||0; afRev+=a.revenue||0;
    afPurchases+=a.purchases||0; afPurchasers+=a.purchasers||0; afPurchaseRev+=a.purchaseRev||0;
  }
  return {
    ga: {
      spend: gaSpend, clicks: gaClicks, impressions: gaImp,
      conversions: gaConv, allConversions: gaAllConv,
      revenue: gaRev || null, allRevenue: gaAllRev || null,
      purchases: gaPurchases || null, purchaseRevenue: gaPurchaseRev || null,
      cpm:  gaCpmImp>0 ? gaCpmSum/gaCpmImp : gaImp>0 ? (gaSpend/gaImp)*1000 : null,
      cpa:  gaConv>0 ? gaSpend/gaConv : null,
      ctr:  gaImp>0  ? (gaClicks/gaImp)*100 : null,
      cvr:  gaClicks>0 ? (gaConv/gaClicks)*100 : null
    },
    af: {
      spend: afSpend, clicks: afClicks, impressions: afImp, installs: afTotal,
      revenue: afRev, purchases: afPurchases, purchasers: afPurchasers, purchaseRev: afPurchaseRev,
      cpm:  afImp>0    ? (afSpend/afImp)*1000 : null,
      ecpi: afTotal>0  ? afSpend/afTotal : null,
      ctr:  afImp>0    ? (afClicks/afImp)*100 : null,
      cvr:  afClicks>0 ? (afTotal/afClicks)*100 : null,
      roas: afSpend>0  ? (afRev/afSpend)*100 : null,
      arpu: afTotal>0  ? afRev/afTotal : null
    }
  };
}

function buildCampaignList(gaByName, afByCampaign) {
  return Object.entries(gaByName).map(([name, ga]) => {
    const af = afByCampaign[name] || { installs:0, clicks:0, impressions:0, cost:0, revenue:0, ecpi:0, roi:'N/A', purchases:0, purchasers:0, purchaseRev:0 };
    return { name, ...computeMetrics({ [name]:ga }, { [name]:af }, af.installs) };
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const today = new Date();
    const defaultTo   = new Date(today - 86400000).toISOString().split('T')[0];
    const defaultFrom = new Date(today - 14 * 86400000).toISOString().split('T')[0];
    const from = req.query.from || defaultFrom;
    const to   = req.query.to   || defaultTo;
    const forceRefresh = !!req.query.refresh;

    const missing = forceRefresh ? getDatesInRange(from, to) : await getMissingDates(from, to);
    let afDebug = null;

    if (missing.length > 0) {
      const fetchFrom = missing[0];
      const fetchTo   = missing[missing.length - 1];

      const token = await getAccessToken();
      const [adsData, adsPurchases, rawAndroid, rawIos] = await Promise.all([
        fetchGoogleAds(fetchFrom, fetchTo, token),
        fetchGoogleAdsPurchases(fetchFrom, fetchTo, token),
        fetchAppsFlyer(APPSFLYER_ANDROID_APP_ID, fetchFrom, fetchTo),
        fetchAppsFlyer(APPSFLYER_IOS_APP_ID, fetchFrom, fetchTo)
      ]);

      const afAndroid = parseAF(rawAndroid);
      const afIos     = parseAF(rawIos);
      afDebug = { android: afAndroid._debug, ios: afIos._debug };

      const gaByDateFetched = processGAResults(adsData.results || [], adsPurchases.results || []);
      await storeGAByDate(gaByDateFetched, fetchFrom, fetchTo);
      await storeAFByDate(afAndroid.byDate, afIos.byDate, fetchFrom, fetchTo);
    }

    const gaByDate = await getGAByDate(from, to);
    const { android: afAndroid, ios: afIos } = await getAFByDate(from, to);
    const gaAgg = aggregateGA(gaByDate);

    const campaignNames = [...new Set([
      ...Object.keys(gaAgg),
      ...Object.keys(mergeAFData(afAndroid.aggregate.byCampaign, afIos.aggregate.byCampaign))
    ])].sort();

    const allDates = [...new Set([
      ...Object.keys(gaByDate),
      ...Object.keys(afAndroid.byDate),
      ...Object.keys(afIos.byDate)
    ])].sort().reverse();

    const days = allDates.map(date => {
      const gaDay      = gaByDate[date] || {};
      const afDayAll   = { byCampaign: mergeAFData(afAndroid.byDate[date]?.byCampaign||{}, afIos.byDate[date]?.byCampaign||{}), total:(afAndroid.byDate[date]?.total||0)+(afIos.byDate[date]?.total||0) };
      const afDayDroid = afAndroid.byDate[date] || { byCampaign:{}, total:0 };
      const afDayIos   = afIos.byDate[date]     || { byCampaign:{}, total:0 };
      return {
        date,
        all:     computeMetrics(gaDay, afDayAll.byCampaign,   afDayAll.total),
        android: computeMetrics(gaDay, afDayDroid.byCampaign, afDayDroid.total),
        ios:     computeMetrics(gaDay, afDayIos.byCampaign,   afDayIos.total),
      };
    });

    const afAggAll  = { byCampaign: mergeAFData(afAndroid.aggregate.byCampaign, afIos.aggregate.byCampaign), total: afAndroid.aggregate.total + afIos.aggregate.total };
    const aggregate = {
      all:     { ...computeMetrics(gaAgg, afAggAll.byCampaign, afAggAll.total), campaigns: buildCampaignList(gaAgg, afAggAll.byCampaign) },
      android: { ...computeMetrics(gaAgg, afAndroid.aggregate.byCampaign, afAndroid.aggregate.total), campaigns: buildCampaignList(gaAgg, afAndroid.aggregate.byCampaign) },
      ios:     { ...computeMetrics(gaAgg, afIos.aggregate.byCampaign, afIos.aggregate.total), campaigns: buildCampaignList(gaAgg, afIos.aggregate.byCampaign) }
    };

    res.json({ from, to, campaignNames, aggregate, days, _fromDB: missing.length === 0, _afDebug: afDebug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
