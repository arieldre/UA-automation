const { getAccessToken, gaQuery } = require('../lib/google-ads');
const { getAFByDate } = require('../db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  try {
    const token = await getAccessToken();

    // Run both queries in parallel
    const [statusResult, metricsResult] = await Promise.all([
      gaQuery(token, `
        SELECT
          ad_group_ad.resource_name,
          ad_group_ad.ad.id,
          ad_group_ad.ad.name,
          ad_group_ad.ad.type,
          ad_group_ad.ad.responsive_search_ad.headlines,
          ad_group_ad.ad.app_ad.headlines,
          ad_group_ad.status,
          ad_group.id,
          ad_group.name,
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type
        FROM ad_group_ad
        WHERE campaign.status = ENABLED
          AND ad_group.status = ENABLED
      `),
      gaQuery(token, `
        SELECT
          ad_group_ad.resource_name,
          ad_group_ad.ad.id,
          ad_group.id,
          campaign.id,
          campaign.name,
          campaign.advertising_channel_type,
          metrics.cost_micros,
          metrics.clicks,
          metrics.impressions,
          metrics.conversions,
          metrics.all_conversions
        FROM ad_group_ad
        WHERE segments.date BETWEEN '${from}' AND '${to}'
          AND campaign.status = ENABLED
          AND ad_group.status = ENABLED
      `)
    ]);

    if (statusResult.error) throw new Error(statusResult.error.message);
    if (metricsResult.error) throw new Error(metricsResult.error.message);

    // Build ad map from status query
    const adMap = {};
    for (const row of (statusResult.results || [])) {
      const rn = row.adGroupAd?.resourceName;
      if (!rn) continue;
      const headlines = row.adGroupAd?.ad?.responsiveSearchAd?.headlines
        || row.adGroupAd?.ad?.appAd?.headlines || [];
      const displayName = row.adGroupAd?.ad?.name
        || (headlines[0]?.text) || `Ad ${row.adGroupAd?.ad?.id}`;
      adMap[rn] = {
        resourceName:  rn,
        adId:          String(row.adGroupAd?.ad?.id || ''),
        adGroupId:     String(row.adGroup?.id || ''),
        adGroupName:   row.adGroup?.name || '',
        campaignId:    String(row.campaign?.id || ''),
        campaignName:  row.campaign?.name || '',
        channelType:   row.campaign?.advertisingChannelType || 'UNKNOWN',
        adType:        row.adGroupAd?.ad?.type || 'UNKNOWN',
        displayName,
        status:        row.adGroupAd?.status || 'UNKNOWN',
        spend: 0, clicks: 0, impressions: 0, conversions: 0, allConversions: 0,
      };
    }

    // Accumulate metrics
    for (const row of (metricsResult.results || [])) {
      const rn = row.adGroupAd?.resourceName;
      if (!adMap[rn]) continue;
      adMap[rn].spend       += (row.metrics?.costMicros || 0) / 1e6;
      adMap[rn].clicks      += parseInt(row.metrics?.clicks || 0);
      adMap[rn].impressions += parseInt(row.metrics?.impressions || 0);
      adMap[rn].conversions += parseFloat(row.metrics?.conversions || 0);
      adMap[rn].allConversions += parseFloat(row.metrics?.allConversions || 0);
    }

    // Load AF data from MongoDB for install cross-ref
    const { android: afAndroid, ios: afIos } = await getAFByDate(from, to);

    // Build campaign spend totals for proportional install attribution
    const campSpend = {};
    for (const ad of Object.values(adMap)) {
      if (!campSpend[ad.campaignName]) campSpend[ad.campaignName] = 0;
      campSpend[ad.campaignName] += ad.spend;
    }

    // Compute AF installs per campaign (android + ios aggregate)
    const campInstalls = {};
    for (const [campName] of Object.entries(campSpend)) {
      const aDroid = afAndroid.aggregate.byCampaign[campName];
      const aIos   = afIos.aggregate.byCampaign[campName];
      campInstalls[campName] = (aDroid?.installs || 0) + (aIos?.installs || 0);
    }

    // Compute per-ad derived metrics
    for (const ad of Object.values(adMap)) {
      const totalCampSpend = campSpend[ad.campaignName] || 0;
      const spendShare = totalCampSpend > 0 ? ad.spend / totalCampSpend : 0;
      const installs = Math.round((campInstalls[ad.campaignName] || 0) * spendShare);

      ad.installs    = installs;
      ad.ctr         = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : null;
      ad.cpa         = ad.conversions > 0 ? ad.spend / ad.conversions : null;
      ad.cpi         = installs > 0 ? ad.spend / installs : null;
      ad.cvr         = ad.clicks > 0 ? (ad.conversions / ad.clicks) * 100 : null;
      ad.cvrAF       = ad.clicks > 0 ? (installs / ad.clicks) * 100 : null;
      ad.cpmGA       = ad.impressions > 0 ? (ad.spend / ad.impressions) * 1000 : null;

      // Round spend
      ad.spend = +ad.spend.toFixed(2);
    }

    // Group by campaign, sorted by channelType then campaignName
    const byCampaign = {};
    for (const ad of Object.values(adMap)) {
      const key = ad.campaignId;
      if (!byCampaign[key]) byCampaign[key] = {
        campaignId:   ad.campaignId,
        campaignName: ad.campaignName,
        channelType:  ad.channelType,
        ads: []
      };
      byCampaign[key].ads.push(ad);
    }

    const campaigns = Object.values(byCampaign).sort((a, b) =>
      a.channelType.localeCompare(b.channelType) || a.campaignName.localeCompare(b.campaignName)
    );

    res.json({ from, to, campaigns });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
