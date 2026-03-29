# UA Automation — Google Ads × AppsFlyer Dashboard

A local web dashboard that pulls Google Ads and AppsFlyer data side-by-side, caches results in a flat-file DB, and lets you analyze performance by date range, campaign, and platform (Android / iOS / All).

---

## What it does

- Fetches **Google Ads** campaign metrics (spend, clicks, impressions, conversions, CPM, ROAS, purchases) via the Google Ads API v23
- Fetches **AppsFlyer** installs, clicks, revenue, and purchase events for both Android and iOS apps
- Merges and cross-references both sources by campaign name and date
- Caches all fetched data locally in `webapp/data/<YYYY-MM>.json` — repeat requests for the same date range are served instantly from the cache
- Exposes a REST API (`/api/report`) and a single-page HTML dashboard at `http://localhost:3000`

---

## Project structure

```
automating-google-ads/
├── webapp/
│   ├── server.js          # Express server: auth, API endpoints, data fetching
│   ├── db.js              # Flat-file cache (reads/writes data/*.json)
│   ├── index.html         # Dashboard UI
│   ├── api/report.js      # (Vercel serverless adapter)
│   ├── data/              # Auto-generated monthly JSON cache files
│   ├── vercel.json        # Vercel deployment config
│   ├── package.json
│   └── .env               # Secrets (never committed)
├── daily-report-workflow.json   # n8n workflow for scheduled daily pulls
├── package.json
└── .gitignore
```

---

## Setup

### 1. Prerequisites

- Node.js 18+
- A Google Cloud project with the **Google Ads API** enabled
- A Google Ads **Developer Token** (from your Google Ads Manager account)
- An **AppsFlyer** account with API access

### 2. Install dependencies

```bash
cd webapp
npm install
```

### 3. Configure environment variables

Copy the template below into `webapp/.env`:

```env
# Google Ads
GOOGLE_CLIENT_ID=your_oauth_client_id
GOOGLE_CLIENT_SECRET=your_oauth_client_secret
GOOGLE_DEVELOPER_TOKEN=your_developer_token
GOOGLE_CUSTOMER_ID=your_customer_id_no_dashes

# Leave blank on first run — filled automatically after OAuth
GOOGLE_REFRESH_TOKEN=

# AppsFlyer
APPSFLYER_TOKEN=your_appsflyer_api_token
APPSFLYER_ANDROID_APP_ID=com.your.android.app
APPSFLYER_IOS_APP_ID=id0000000000

# Server
PORT=3000
```

> **GOOGLE_CUSTOMER_ID** — use the 10-digit ID without dashes (e.g. `1234567890`).

### 4. Authorize Google Ads (first run only)

Start the server, then open the auth URL in your browser:

```bash
node server.js
# Visit: http://localhost:3000/auth/google
```

Complete the OAuth flow. The server writes your `GOOGLE_REFRESH_TOKEN` back into `.env` automatically. You won't need to do this again unless the token is revoked.

### 5. Start the dashboard

```bash
node server.js
# Dashboard: http://localhost:3000
```

---

## API

### `GET /api/report`

Returns merged Google Ads + AppsFlyer data for a date range.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `from` | 14 days ago | Start date (`YYYY-MM-DD`) |
| `to` | Yesterday | End date (`YYYY-MM-DD`) |
| `refresh` | — | Any value forces a re-fetch from APIs (bypasses cache) |

**Example:**
```
GET /api/report?from=2026-03-01&to=2026-03-28
GET /api/report?from=2026-03-01&to=2026-03-28&refresh=1
```

**Response shape:**
```json
{
  "from": "2026-03-01",
  "to": "2026-03-28",
  "campaignNames": ["Campaign A", "Campaign B"],
  "aggregate": {
    "all":     { "ga": {...}, "af": {...}, "campaigns": [...] },
    "android": { "ga": {...}, "af": {...}, "campaigns": [...] },
    "ios":     { "ga": {...}, "af": {...}, "campaigns": [...] }
  },
  "days": [
    {
      "date": "2026-03-28",
      "all":     { "ga": {...}, "af": {...} },
      "android": { "ga": {...}, "af": {...} },
      "ios":     { "ga": {...}, "af": {...} }
    }
  ],
  "_fromDB": true,
  "_afDebug": { "android": "...", "ios": "..." }
}
```

**Metrics per source:**

| Metric | Google Ads (`ga`) | AppsFlyer (`af`) |
|--------|------------------|------------------|
| `spend` | ✓ | ✓ |
| `clicks` | ✓ | ✓ |
| `impressions` | ✓ | ✓ |
| `conversions` | ✓ | — |
| `allConversions` | ✓ | — |
| `revenue` | ✓ (tROAS only) | ✓ |
| `purchases` | ✓ (PURCHASE actions) | ✓ |
| `purchaseRevenue` | ✓ | ✓ |
| `installs` | — | ✓ |
| `cpm` | ✓ (weighted avg) | ✓ |
| `ctr` | ✓ | ✓ |
| `cvr` | ✓ | ✓ |
| `cpa` | ✓ | — |
| `ecpi` | — | ✓ |
| `roas` | — | ✓ |
| `arpu` | — | ✓ |

### `GET /api/debug`

Returns a summary of the local cache: how many months of data are stored and what the latest cached date is per file.

---

## Caching

All fetched data is stored in `webapp/data/<YYYY-MM>.json`, keyed by date. On each `/api/report` request, the server checks which dates in the requested range are missing from the cache and fetches only those. This means:

- First call for a date range hits both APIs
- Subsequent calls for the same range are instant (no API calls)
- Use `?refresh=1` to force a re-fetch and overwrite cached dates

---

## n8n workflow

`daily-report-workflow.json` contains an n8n workflow that can be imported to trigger a daily report pull automatically. Import it via **n8n → Workflows → Import from file**.

---

## Deployment (Vercel)

The `webapp/` directory includes a `vercel.json` that routes all requests through `api/report.js`. To deploy:

```bash
cd webapp
vercel
```

Set all environment variables from `.env` in the Vercel project settings (Dashboard → Settings → Environment Variables).

---

## Security note

Never commit `.env` — it is listed in `.gitignore`. Rotate any credentials that were accidentally exposed.
