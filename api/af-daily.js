const { getAFDailyBreakdown } = require('../webapp/db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async function afDailyHandler(req, res) {
  const { from, to } = req.query;

  if (!from || !DATE_RE.test(from) || !to || !DATE_RE.test(to)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD for from and to.' });
  }

  const androidId = process.env.APPSFLYER_ANDROID_APP_ID;
  const iosId     = process.env.APPSFLYER_IOS_APP_ID;

  if (!androidId || !iosId) {
    return res.status(500).json({ error: 'AF app IDs not configured' });
  }

  try {
    const { android, ios } = await getAFDailyBreakdown(androidId, iosId, from, to);

    // Build sorted union of all dates and channel keys
    const dateSet    = new Set([...Object.keys(android), ...Object.keys(ios)]);
    const dates      = [...dateSet].sort();
    const channelSet = new Set();
    for (const dayData of [...Object.values(android), ...Object.values(ios)]) {
      for (const ch of Object.keys(dayData)) channelSet.add(ch);
    }
    const channels = [...channelSet].sort();

    res.json({ from, to, dates, channels, android, ios });
  } catch (err) {
    console.error('[af-daily]', err);
    res.status(500).json({ error: err.message });
  }
};
