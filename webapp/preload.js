// preload.js — bulk-load historical data into MongoDB via Vercel
// Usage: node preload.js
// Fetches up to 90 days in 2-week chunks; skips dates already in DB.

const VERCEL_URL = 'https://ua-automation-lac.vercel.app';
const CHUNK_DAYS = 14;
const DELAY_MS   = 6000; // 6s between chunks to stay under AF rate limit

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const to   = daysAgo(1);      // yesterday
  const from = daysAgo(90);     // 90 days back (AppsFlyer's typical history limit)

  // Build 2-week chunks, oldest → newest
  const chunks = [];
  let start = from;
  while (start <= to) {
    const end = addDays(start, CHUNK_DAYS - 1);
    chunks.push({ from: start, to: end > to ? to : end });
    start = addDays(end > to ? to : end, 1);
  }

  console.log(`\nPreloading ${from} → ${to}  (${chunks.length} chunks of ${CHUNK_DAYS} days)\n`);

  for (let i = 0; i < chunks.length; i++) {
    const { from: f, to: t } = chunks[i];
    process.stdout.write(`[${i + 1}/${chunks.length}] ${f} → ${t}  `);

    try {
      const res  = await fetch(`${VERCEL_URL}/api/report?from=${f}&to=${t}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const source = data._fromDB ? '(already cached)' : '(fetched + stored)';
      let afNote = '';
      if (data._afDebug) {
        const { android, ios } = data._afDebug;
        if (android || ios) afNote = `  AF: ${android || '—'} | ${ios || '—'}`;
      }
      console.log(`✓ ${source}${afNote}`);
    } catch (err) {
      console.log(`✗ ${err.message}`);
    }

    if (i < chunks.length - 1) await sleep(DELAY_MS);
  }

  console.log('\nDone.\n');
}

main().catch(console.error);
