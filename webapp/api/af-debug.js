'use strict';
/**
 * Diagnostic endpoint — calls AF partners_by_date_report directly and returns raw response.
 * GET /api/af-debug?from=YYYY-MM-DD&to=YYYY-MM-DD&secret=<CRON_SECRET>
 * DELETE this file after diagnosis is complete.
 */
require('dotenv').config();

const { APPSFLYER_TOKEN, APPSFLYER_ANDROID_APP_ID, APPSFLYER_IOS_APP_ID, CRON_SECRET } = process.env;

module.exports = async function handler(req, res) {
  const secret = req.query.secret || req.headers['x-cron-secret'];
  if (!CRON_SECRET || secret !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { from = '2026-04-14', to = '2026-04-14', platform = 'android' } = req.query;
  const appId = platform === 'ios' ? APPSFLYER_IOS_APP_ID : APPSFLYER_ANDROID_APP_ID;

  const results = {};

  for (const [name, url] of [
    ['partners_by_date_report', `https://hq1.appsflyer.com/api/agg-data/export/app/${appId}/partners_by_date_report/v5?from=${from}&to=${to}&category=standard`],
    ['channel_by_date_report',  `https://hq1.appsflyer.com/api/agg-data/export/app/${appId}/channel_by_date_report/v5?from=${from}&to=${to}&category=standard`],
    ['partners_by_date_report_no_cat', `https://hq1.appsflyer.com/api/agg-data/export/app/${appId}/partners_by_date_report/v5?from=${from}&to=${to}`],
  ]) {
    try {
      const r    = await fetch(url, { headers: { 'Authorization': `Bearer ${APPSFLYER_TOKEN}` } });
      const text = await r.text();
      results[name] = {
        status:  r.status,
        isJSON:  text.trim().startsWith('{') || text.trim().startsWith('['),
        firstLine: text.split('\n')[0].substring(0, 200),
        preview: text.substring(0, 500),
      };
    } catch (e) {
      results[name] = { error: e.message };
    }
  }

  res.json({ appId, from, to, results });
};
