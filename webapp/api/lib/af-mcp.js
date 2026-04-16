'use strict';

const MCP_URL = 'https://mcp.appsflyer.com/auth/mcp';
const MCP_TIMEOUT_MS = 40000;

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const fields = [];
  let i = 0, field = '';
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { field += line[i++]; }
      }
    } else if (line[i] === ',') {
      fields.push(field.trim());
      field = '';
      i++;
    } else {
      field += line[i++];
    }
  }
  fields.push(field.trim());
  return fields;
}

function parseMcpCsv(rawText) {
  if (!rawText) return [];
  const dataSection = rawText.split('; ## Metadata:')[0].replace(/^## Data:\s*/m, '');
  const lines = dataSection.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

// ── MCP helpers ───────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options, timeoutMs = MCP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`MCP request timeout after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function initMcpSession(url, token) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 0, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ua-automation', version: '1.0' },
      },
    }),
  });
  if (res.status !== 200 && res.status !== 201) {
    const body = await res.text();
    throw new Error(`MCP init failed: ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.headers.get('mcp-session-id');
}

async function callMcpTool(url, token, sessionId, id, query) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json, text/event-stream',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id, method: 'tools/call',
      params: { name: 'fetch_aggregated_data', arguments: { query } },
    }),
  });

  const ct = res.headers.get('content-type') || '';
  const body = await res.text();

  if (ct.includes('text/event-stream')) {
    for (const block of body.split('\n\n')) {
      const dataLine = block.split('\n').find(l => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        const msg = JSON.parse(dataLine.slice(6));
        const text = msg.result?.content?.[0]?.text;
        if (text !== undefined) {
          if (msg.result?.isError) throw new Error(`MCP tool error: ${text}`);
          return text;
        }
        if (msg.error) throw new Error(`MCP tool error: ${JSON.stringify(msg.error)}`);
      } catch (e) {
        if (e.message.startsWith('MCP tool error')) throw e;
        console.error('[af-mcp] SSE parse error:', e.message);
      }
    }
    throw new Error(`MCP tool: no SSE data block. Status ${res.status}`);
  }

  const msg = JSON.parse(body);
  if (msg.error) throw new Error(`MCP tool error: ${msg.error.message}`);
  if (msg.result?.isError) throw new Error(`MCP tool error: ${msg.result?.content?.[0]?.text}`);
  return msg.result?.content?.[0]?.text ?? null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function colVal(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== '') return row[name];
    const lower = name.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === lower && row[k] !== '') return row[k];
    }
  }
  return '';
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Fetch AppsFlyer aggregated data grouped by Media source + Date.
 *
 * @param {string} androidId  - Android app ID (e.g. 'com.example.app')
 * @param {string} iosId      - iOS app ID (e.g. 'id1234567890')
 * @param {string} from       - Start date 'YYYY-MM-DD'
 * @param {string} to         - End date 'YYYY-MM-DD'
 * @returns {Promise<Object>} - { [date]: { [mediaSource]: { installs, cost, revenue, clicks, impressions } } }
 */
async function fetchAFByMediaSource(androidId, iosId, from, to) {
  const token = process.env.APPSFLYER_MCP?.trim();
  if (!token) {
    console.warn('[af-mcp] APPSFLYER_MCP not set');
    return {};
  }

  try {
    const sessionId = await initMcpSession(MCP_URL, token);
    const rawText = await callMcpTool(MCP_URL, token, sessionId, 1, {
      app_ids: [androidId, iosId],
      start_date: from,
      end_date: to,
      groupings: ['Media source', 'Date'],
      metrics: [
        { metric_name: 'Cost' },
        { metric_name: 'Installs' },
        { metric_name: 'Clicks' },
        { metric_name: 'Impressions' },
        { metric_name: 'Revenue', period: '0' },
      ],
      row_count: 1000,
    });

    const rows = parseMcpCsv(rawText || '');
    const result = {};

    for (const row of rows) {
      const date        = (row['Date'] || '').trim();
      const mediaSource = (row['Media source'] || '').trim();
      if (!date || !mediaSource) continue;

      const installs    = Math.round(parseNum(colVal(row, 'Installs appsflyer', 'Installs')));
      const cost        = parseNum(colVal(row, 'Total Cost', 'Cost'));
      const revenue     = parseNum(colVal(row, 'Total Revenue', 'Revenue'));
      const clicks      = Math.round(parseNum(colVal(row, 'Clicks')));
      const impressions = Math.round(parseNum(colVal(row, 'Impressions')));

      if (!result[date]) result[date] = {};
      result[date][mediaSource] = { installs, cost, revenue, clicks, impressions };
    }

    return result;
  } catch (e) {
    console.warn('[af-mcp] fetchAFByMediaSource error:', e.message);
    return {};
  }
}

module.exports = { fetchAFByMediaSource };
