const { MongoClient, ObjectId } = require('mongodb');

let _db = null;
async function getDb() {
  if (_db) return _db;
  const client = new MongoClient(process.env.UA_GOAT_MONGODB_URI);
  await client.connect();
  _db = client.db('ua_automation');
  return _db;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db  = await getDb();
    const col = db.collection('notes');

    if (req.method === 'GET') {
      const notes = await col.find({}).sort({ createdAt: -1 }).toArray();
      return res.json(notes);
    }

    if (req.method === 'POST') {
      const { text, author } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: 'Note text is required' });
      const doc = { text: text.trim(), author: author?.trim() || 'Anonymous', createdAt: new Date() };
      const result = await col.insertOne(doc);
      return res.json({ ...doc, _id: result.insertedId });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      await col.deleteOne({ _id: new ObjectId(id) });
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
