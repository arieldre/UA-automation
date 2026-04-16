// MongoDB store — collection: daily_data, _id = YYYY-MM-DD
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { attachDatabasePool } = require('@vercel/functions');

const uri = process.env.UA_GOAT_MONGODB_URI;
let _client = null, _db = null;

async function connect() {
  if (_db) return _db;
  _client = new MongoClient(uri);
  attachDatabasePool(_client);
  await _client.connect();
  _db = _client.db('ua_automation');
  return _db;
}

// ── Date range helpers ────────────────────────────────────

function parseUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function getDatesInRange(from, to) {
  const dates = [];
  const d   = parseUTC(from);
  const end = parseUTC(to);
  while (d <= end) {
    dates.push(d.toISOString().split('T')[0]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

async function getMissingDates(from, to) {
  const db    = await connect();
  const dates = getDatesInRange(from, to);
  const docs  = await db.collection('daily_data')
    .find({ _id: { $in: dates }, ga: { $ne: null }, af: { $ne: null } })
    .project({ _id: 1 })
    .toArray();
  const have = new Set(docs.map(d => d._id));
  return dates.filter(d => !have.has(d));
}

// ── Write ─────────────────────────────────────────────────

async function storeGAByDate(gaByDate, fetchFrom, fetchTo) {
  const db  = await connect();
  const col = db.collection('daily_data');
  const ops = getDatesInRange(fetchFrom, fetchTo).map(date => ({
    updateOne: {
      filter: { _id: date },
      update: { $set: { ga: gaByDate[date] || null, fetched_at: new Date().toISOString() } },
      upsert: true
    }
  }));
  await col.bulkWrite(ops);
}

async function storeAFByDate(afAndroidByDate, afIosByDate, fetchFrom, fetchTo) {
  const db  = await connect();
  const col = db.collection('daily_data');
  const ops = getDatesInRange(fetchFrom, fetchTo)
    .filter(date => afAndroidByDate[date] || afIosByDate[date]) // skip dates with no AF data (rate limit)
    .map(date => ({
      updateOne: {
        filter: { _id: date },
        update: {
          $set: {
            af: {
              android: afAndroidByDate[date] || { total: 0, byCampaign: {} },
              ios:     afIosByDate[date]     || { total: 0, byCampaign: {} }
            },
            fetched_at: new Date().toISOString()
          }
        },
        upsert: true
      }
    }));
  if (!ops.length) return;
  await col.bulkWrite(ops);
}

// ── Read ──────────────────────────────────────────────────

async function getGAByDate(from, to) {
  const db   = await connect();
  const docs = await db.collection('daily_data')
    .find({ _id: { $in: getDatesInRange(from, to) }, ga: { $ne: null } })
    .toArray();
  const byDate = {};
  for (const doc of docs) byDate[doc._id] = doc.ga;
  return byDate;
}

async function getAFByDate(from, to) {
  const zero = () => ({ installs:0, clicks:0, impressions:0, cost:0, revenue:0, ecpi:0, roi:'N/A', purchases:0, purchasers:0, purchaseRev:0 });
  const android = { byDate:{}, aggregate:{ total:0, byCampaign:{} } };
  const ios     = { byDate:{}, aggregate:{ total:0, byCampaign:{} } };

  const db   = await connect();
  const docs = await db.collection('daily_data')
    .find({ _id: { $in: getDatesInRange(from, to) }, af: { $ne: null } })
    .toArray();

  for (const doc of docs) {
    const date = doc._id;
    for (const [platform, target] of [['android', android], ['ios', ios]]) {
      const day = doc.af?.[platform];
      if (!day) continue;
      target.byDate[date] = day;
      target.aggregate.total += day.total || 0;
      for (const [camp, m] of Object.entries(day.byCampaign || {})) {
        if (!target.aggregate.byCampaign[camp]) target.aggregate.byCampaign[camp] = zero();
        const a = target.aggregate.byCampaign[camp];
        a.installs    += m.installs    || 0;
        a.clicks      += m.clicks      || 0;
        a.impressions += m.impressions || 0;
        a.cost        += m.cost        || 0;
        a.revenue     += m.revenue     || 0;
        a.purchases   += m.purchases   || 0;
        a.purchasers  += m.purchasers  || 0;
        a.purchaseRev += m.purchaseRev || 0;
      }
    }
  }
  return { android, ios };
}

// ── Networks (stored in daily_data as `networks` field) ───

async function getMissingNetworksDates(from, to) {
  const db    = await connect();
  const dates = getDatesInRange(from, to);
  const docs  = await db.collection('daily_data')
    .find({ _id: { $in: dates }, networks: { $exists: true } })  // null is fine — means no data for that day
    .project({ _id: 1 })
    .toArray();
  const have = new Set(docs.map(d => d._id));
  return dates.filter(d => !have.has(d));
}

async function storeNetworksByDate(networksByDate, fetchFrom, fetchTo) {
  const db  = await connect();
  const col = db.collection('daily_data');
  const ops = getDatesInRange(fetchFrom, fetchTo).map(date => ({
    updateOne: {
      filter: { _id: date },
      update: { $set: { networks: networksByDate[date] || null, fetched_at: new Date().toISOString() } },
      upsert: true
    }
  }));
  await col.bulkWrite(ops);
}

async function getNetworksByDate(from, to) {
  const db   = await connect();
  const docs = await db.collection('daily_data')
    .find({ _id: { $in: getDatesInRange(from, to) }, networks: { $exists: true, $ne: null } })
    .project({ _id: 1, networks: 1 })
    .toArray();
  const byDate = {};
  for (const doc of docs) byDate[doc._id] = doc.networks;
  return byDate;
}

// ── Assets (collection: assets_data, keyed by campaignId_from_to) ─

async function getAssets(campaignId, from, to) {
  const db  = await connect();
  const doc = await db.collection('assets_data').findOne({ _id: `${campaignId}_${from}_${to}` });
  if (!doc) return null;
  return doc.data;
}

async function storeAssets(campaignId, from, to, data) {
  const db = await connect();
  await db.collection('assets_data').updateOne(
    { _id: `${campaignId}_${from}_${to}` },
    { $setOnInsert: { campaignId, from, to, data, fetched_at: new Date().toISOString() } },
    { upsert: true }
  );
}

// ── AF Network channel cache (collection: af_channels_daily, keyed by appId_date) ─

async function getMissingAFChannelDates(appId, from, to) {
  const db    = await connect();
  const dates = getDatesInRange(from, to);
  const docs  = await db.collection('af_channels_daily')
    .find({ _id: { $in: dates.map(d => `${appId}_${d}`) } })
    .project({ _id: 1 })
    .toArray();
  const have = new Set(docs.map(d => d._id));
  return dates.filter(d => !have.has(`${appId}_${d}`));
}

async function storeAFChannelForDate(appId, date, channels) {
  const db = await connect();
  await db.collection('af_channels_daily').updateOne(
    { _id: `${appId}_${date}` },
    { $set: { appId, date, channels, fetched_at: new Date().toISOString() } },
    { upsert: true }
  );
}

async function getAFDailyBreakdown(androidId, iosId, from, to) {
  const db   = await connect();
  const dates = getDatesInRange(from, to);
  const ids   = [
    ...dates.map(d => `${androidId}_${d}`),
    ...dates.map(d => `${iosId}_${d}`)
  ];
  const docs = await db.collection('af_channels_daily').find({ _id: { $in: ids } }).toArray();
  const result = { android: {}, ios: {} };
  for (const doc of docs) {
    const platform = doc.appId === androidId ? 'android' : 'ios';
    result[platform][doc.date] = doc.channels || {};
  }
  return result;
}

async function getAFChannelsForRange(appId, from, to) {
  const db   = await connect();
  const dates = getDatesInRange(from, to);
  const docs  = await db.collection('af_channels_daily')
    .find({ _id: { $in: dates.map(d => `${appId}_${d}`) } })
    .toArray();
  const merged = {};
  for (const doc of docs) {
    for (const [ch, m] of Object.entries(doc.channels || {})) {
      if (!merged[ch]) merged[ch] = { installs: 0, cost: 0, revenue: 0 };
      merged[ch].installs += m.installs || 0;
      merged[ch].cost     += m.cost     || 0;
      merged[ch].revenue  += m.revenue  || 0;
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

// ── Asset state (collection: campaign_assets_state, keyed by campaignId) ─

async function getAssetState(campaignId) {
  const db = await connect();
  return db.collection('campaign_assets_state').findOne({ _id: campaignId });
}

async function storeAssetState(campaignId, doc) {
  const db = await connect();
  await db.collection('campaign_assets_state').findOneAndReplace(
    { _id: campaignId, lastChecked: { $ne: doc.lastChecked } },
    { _id: campaignId, ...doc },
    { upsert: true }
  );
}

// ── Asset change log (collection: asset_change_log) ──────────────────────────

async function appendAssetChanges(entries) {
  if (!entries || entries.length === 0) return;
  const db = await connect();
  await db.collection('asset_change_log').insertMany(entries);
}

async function getAssetHistory(campaignId) {
  const db = await connect();
  return db.collection('asset_change_log')
    .find({ campaignId })
    .sort({ effectiveDate: -1, recordedAt: -1 })
    .toArray();
}

// ── Campaign list (collection: campaigns, single doc with 24h TTL) ─

async function getCampaigns() {
  const db  = await connect();
  const doc = await db.collection('campaigns').findOne({ _id: 'list' });
  if (!doc) return null;
  if (Date.now() - new Date(doc.fetched_at).getTime() > 86400000) return null; // 24h TTL
  return doc.data;
}

async function storeCampaigns(data) {
  const db = await connect();
  await db.collection('campaigns').updateOne(
    { _id: 'list' },
    { $set: { data, fetched_at: new Date().toISOString() } },
    { upsert: true }
  );
}

module.exports = { connect, getDatesInRange, getMissingDates, storeGAByDate, storeAFByDate, getGAByDate, getAFByDate, getMissingNetworksDates, storeNetworksByDate, getNetworksByDate, getAssets, storeAssets, getCampaigns, storeCampaigns, getMissingAFChannelDates, storeAFChannelForDate, getAFChannelsForRange, getAFDailyBreakdown, getAssetState, storeAssetState, appendAssetChanges, getAssetHistory };
