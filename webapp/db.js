// Flat-file JSON store — one file per YYYY-MM, stored in ./data/
// No native dependencies, works on any Node version.

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ── File helpers ──────────────────────────────────────────

function monthFile(date) {
  return path.join(DATA_DIR, date.slice(0, 7) + '.json'); // e.g. data/2026-03.json
}

function loadMonth(date) {
  const f = monthFile(date);
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; }
}

function saveMonth(date, data) {
  fs.writeFileSync(monthFile(date), JSON.stringify(data));
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

function getMissingDates(from, to) {
  return getDatesInRange(from, to).filter(date => {
    const m = loadMonth(date);
    return !m[date] || !m[date].ga || !m[date].af;
  });
}

// ── Write ─────────────────────────────────────────────────

function storeGAByDate(gaByDate, fetchFrom, fetchTo) {
  const allDates = getDatesInRange(fetchFrom, fetchTo);
  // Group by month to minimise file writes
  const byMonth = {};
  for (const date of allDates) {
    const mo = date.slice(0, 7);
    if (!byMonth[mo]) byMonth[mo] = loadMonth(date);
    if (!byMonth[mo][date]) byMonth[mo][date] = {};
    byMonth[mo][date].ga = gaByDate[date] || null; // null = fetched, no data
    byMonth[mo][date].fetched_at = new Date().toISOString();
  }
  for (const [mo, data] of Object.entries(byMonth)) {
    fs.writeFileSync(path.join(DATA_DIR, mo + '.json'), JSON.stringify(data));
  }
}

function storeAFByDate(afAndroidByDate, afIosByDate, fetchFrom, fetchTo) {
  const allDates = getDatesInRange(fetchFrom, fetchTo);
  const byMonth = {};
  for (const date of allDates) {
    const mo = date.slice(0, 7);
    if (!byMonth[mo]) byMonth[mo] = loadMonth(date);
    if (!byMonth[mo][date]) byMonth[mo][date] = {};
    byMonth[mo][date].af = {
      android: afAndroidByDate[date] || { total: 0, byCampaign: {} },
      ios:     afIosByDate[date]     || { total: 0, byCampaign: {} }
    };
    byMonth[mo][date].fetched_at = new Date().toISOString();
  }
  for (const [mo, data] of Object.entries(byMonth)) {
    fs.writeFileSync(path.join(DATA_DIR, mo + '.json'), JSON.stringify(data));
  }
}

// ── Read ──────────────────────────────────────────────────

function getGAByDate(from, to) {
  const byDate = {};
  for (const date of getDatesInRange(from, to)) {
    const entry = loadMonth(date)[date];
    if (entry?.ga) byDate[date] = entry.ga;
  }
  return byDate;
}

function getAFByDate(from, to) {
  const zero = () => ({ installs:0, clicks:0, impressions:0, cost:0, revenue:0, ecpi:0, roi:'N/A', purchases:0, purchasers:0, purchaseRev:0 });
  const android = { byDate:{}, aggregate:{ total:0, byCampaign:{} } };
  const ios     = { byDate:{}, aggregate:{ total:0, byCampaign:{} } };

  for (const date of getDatesInRange(from, to)) {
    const entry = loadMonth(date)[date];
    if (!entry?.af) continue;

    for (const [platform, target] of [['android', android], ['ios', ios]]) {
      const day = entry.af[platform];
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

module.exports = { getDatesInRange, getMissingDates, storeGAByDate, storeAFByDate, getGAByDate, getAFByDate };
