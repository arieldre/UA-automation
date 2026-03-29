// Temporary one-time migration endpoint — push local AF data to MongoDB via HTTPS
const { MongoClient } = require('mongodb');

let _db = null;
async function getDb() {
  if (_db) return _db;
  const client = new MongoClient(process.env.UA_GOAT_MONGODB_URI);
  await client.connect();
  _db = client.db('ua_automation');
  return _db;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { date, android, ios } = req.body;
    if (!date || !android || !ios) return res.status(400).json({ error: 'Missing date/android/ios' });
    const db = await getDb();
    await db.collection('daily_data').updateOne(
      { _id: date },
      { $set: { af: { android, ios }, fetched_at: new Date().toISOString() } },
      { upsert: true }
    );
    res.json({ ok: true, date });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
