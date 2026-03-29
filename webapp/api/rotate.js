const { connect } = require('../db');
const { getAccessToken, gaMutate } = require('../lib/google-ads');

// Re-use ads fetching logic
const adsHandler = require('./ads');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db  = await connect();
    const col = db.collection('rotation_config');

    // ── Config CRUD ──────────────────────────────────────
    if (req.url?.includes('/rotate/config') || req.path?.includes('/rotate/config')) {
      if (req.method === 'GET') {
        const configs = await col.find({}).toArray();
        return res.json(configs);
      }

      if (req.method === 'POST') {
        const cfg = req.body;
        if (!cfg?.campaignId) return res.status(400).json({ error: 'campaignId required' });
        cfg._id = `campaignId_${cfg.campaignId}`;
        cfg.updatedAt = new Date().toISOString();
        await col.updateOne({ _id: cfg._id }, { $set: cfg }, { upsert: true });
        return res.json({ ok: true });
      }

      if (req.method === 'DELETE') {
        const { campaignId } = req.query;
        if (!campaignId) return res.status(400).json({ error: 'campaignId required' });
        await col.deleteOne({ _id: `campaignId_${campaignId}` });
        return res.json({ ok: true });
      }

      return res.status(405).end();
    }

    // ── Rotation ─────────────────────────────────────────
    if (req.method !== 'POST') return res.status(405).end();

    const preview = req.query.preview !== 'false';
    const { from, to } = req.body || {};
    if (!from || !to) return res.status(400).json({ error: 'from and to required in body' });

    // Fetch configs
    const configs = await col.find({}).toArray();
    if (!configs.length) return res.json({ preview, changes: [], summary: { toEnable: 0, toPause: 0, unchanged: 0 }, message: 'No rotation configs set up' });

    // Fetch live ad data by calling ads handler logic inline
    const adsData = await fetchAdsData(req, from, to);
    if (adsData.error) return res.status(500).json({ error: adsData.error });

    // Build ad lookup
    const adByRN = {};
    for (const camp of adsData.campaigns) {
      for (const ad of camp.ads) adByRN[ad.resourceName] = ad;
    }

    // Compute rotation plan
    const changes = [];
    for (const cfg of configs) {
      if (!cfg.enabled && cfg.enabled !== undefined) continue;

      const pool = (cfg.poolResourceNames || []).map(rn => adByRN[rn]).filter(Boolean);
      if (!pool.length) continue;

      const threshold = cfg.minSpendThreshold ?? 20;
      const keepN     = cfg.keepTopN ?? 2;
      const metric    = cfg.rankMetric || 'cpi';
      const asc       = cfg.rankDirection !== 'desc';

      const rankable  = pool.filter(ad => ad.spend >= threshold && ad[metric] != null);
      const unranked  = pool.filter(ad => ad.spend < threshold || ad[metric] == null);

      // Sort rankable
      rankable.sort((a, b) => asc ? (a[metric] - b[metric]) : (b[metric] - a[metric]));

      // Top N → ENABLED, rest → PAUSED
      for (let i = 0; i < rankable.length; i++) {
        const ad = rankable[i];
        const desired = i < keepN ? 'ENABLED' : 'PAUSED';
        if (ad.status !== desired) {
          changes.push({
            resourceName:  ad.resourceName,
            campaignName:  ad.campaignName,
            adId:          ad.adId,
            displayName:   ad.displayName,
            currentStatus: ad.status,
            newStatus:     desired,
            reason: desired === 'PAUSED'
              ? `Ranked #${i + 1} by ${metric.toUpperCase()} (${fmtMetric(metric, ad[metric])}) — only top ${keepN} kept active`
              : `Ranked #${i + 1} by ${metric.toUpperCase()} (${fmtMetric(metric, ad[metric])}) — promoted to active`
          });
        }
      }

      // Unranked: enable if paused (needs data)
      for (const ad of unranked) {
        if (ad.status === 'PAUSED') {
          changes.push({
            resourceName:  ad.resourceName,
            campaignName:  ad.campaignName,
            adId:          ad.adId,
            displayName:   ad.displayName,
            currentStatus: ad.status,
            newStatus:     'ENABLED',
            reason:        `Below spend threshold ($${threshold}) — enabling to gather data`
          });
        }
      }
    }

    const summary = {
      toEnable:  changes.filter(c => c.newStatus === 'ENABLED').length,
      toPause:   changes.filter(c => c.newStatus === 'PAUSED').length,
      unchanged: Object.keys(adByRN).length - changes.length,
    };

    if (preview) return res.json({ preview: true, changes, summary });

    // Apply mutations
    const token = await getAccessToken();
    const operations = changes.map(c => ({
      updateMask: 'status',
      update: { resourceName: c.resourceName, status: c.newStatus }
    }));

    let mutateResponse = null, errors = [];
    if (operations.length) {
      mutateResponse = await gaMutate(token, operations);
      if (mutateResponse.partialFailureError || mutateResponse.error) {
        errors = [mutateResponse.partialFailureError || mutateResponse.error];
      }
    }

    // Log rotation
    const logCol = db.collection('rotation_log');
    await logCol.insertOne({ rotatedAt: new Date().toISOString(), from, to, changes, summary, mutateResponse, errors });

    res.json({ preview: false, applied: true, changes, summary, mutateResponse, errors, rotatedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

function fmtMetric(metric, val) {
  if (val == null) return 'N/A';
  if (['cpi', 'cpa'].includes(metric)) return '$' + val.toFixed(2);
  return val.toFixed(2) + '%';
}

// Fetch ad data without going through HTTP — call the module's logic directly
async function fetchAdsData(req, from, to) {
  return new Promise((resolve) => {
    const fakeReq = { method: 'GET', query: { from, to }, url: '/api/ads' };
    const fakeRes = {
      setHeader: () => {},
      status: () => fakeRes,
      end: () => {},
      json: (data) => resolve(data),
    };
    adsHandler(fakeReq, fakeRes).catch(err => resolve({ error: err.message }));
  });
}
