"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/components/ui/Formatters";

/* ── Types ── */

interface AssetBase {
  assetName?: string;
  assetText?: string;
  performanceLabel: string;
  impressions: number;
  clicks: number;
  spend?: number;
  ctr?: number;
  thumbnailUrl?: string;
  youtubeUrl?: string;
}

interface AssetsState {
  video: AssetBase[];
  image: AssetBase[];
  text: AssetBase[];
}

interface AssetsResponse {
  campaignName: string;
  assets: AssetsState;
  state: string;
}

interface HistoryEntry {
  campaignId: string;
  assetKey: string;
  changeType: string;
  oldValue: string;
  newValue: string;
  effectiveDate: string;
  recordedAt: string;
}

interface HistoryResponse {
  history: HistoryEntry[];
}

type TabName = "live" | "stopped" | "history";

/* ── Performance badge ── */

function PerfBadge({ label }: { label: string }) {
  const upper = label.toUpperCase();
  let bg: string;
  let fg: string;

  switch (upper) {
    case "BEST":
      bg = "rgba(34,197,94,0.15)";
      fg = "var(--green)";
      break;
    case "GOOD":
      bg = "rgba(124,111,255,0.15)";
      fg = "var(--accent)";
      break;
    case "LOW":
      bg = "rgba(239,68,68,0.15)";
      fg = "var(--red)";
      break;
    default:
      bg = "rgba(107,107,136,0.15)";
      fg = "var(--muted)";
      break;
  }

  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
      style={{ background: bg, color: fg }}
    >
      {upper}
    </span>
  );
}

/* ── Asset table ── */

interface AssetTableProps {
  typeLabel: string;
  assets: AssetBase[];
}

function AssetTable({ typeLabel, assets }: AssetTableProps) {
  if (!assets.length) return null;

  return (
    <div className="mb-4">
      <h4
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--muted)" }}
      >
        {typeLabel} ({assets.length})
      </h4>
      <table className="w-full text-[12px]" style={{ color: "var(--text)" }}>
        <thead>
          <tr className="border-b" style={{ borderColor: "var(--border)" }}>
            <th
              className="px-2 py-1.5 text-[10px] font-semibold uppercase text-left"
              style={{ color: "var(--muted)" }}
            >
              Asset
            </th>
            <th
              className="px-2 py-1.5 text-[10px] font-semibold uppercase text-center"
              style={{ color: "var(--muted)" }}
            >
              Perf
            </th>
            <th
              className="px-2 py-1.5 text-[10px] font-semibold uppercase text-right"
              style={{ color: "var(--muted)" }}
            >
              Impressions
            </th>
            <th
              className="px-2 py-1.5 text-[10px] font-semibold uppercase text-right"
              style={{ color: "var(--muted)" }}
            >
              Clicks
            </th>
            {typeLabel !== "Text" && (
              <>
                <th
                  className="px-2 py-1.5 text-[10px] font-semibold uppercase text-right"
                  style={{ color: "var(--muted)" }}
                >
                  Spend
                </th>
                <th
                  className="px-2 py-1.5 text-[10px] font-semibold uppercase text-right"
                  style={{ color: "var(--muted)" }}
                >
                  CTR
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {assets.map((a, i) => (
            <tr
              key={i}
              className="border-b hover:bg-white/[0.02]"
              style={{ borderColor: "var(--border)" }}
            >
              <td className="px-2 py-1.5 text-left max-w-[300px]">
                <div className="flex items-center gap-2">
                  {a.thumbnailUrl && typeLabel !== "Text" && (
                    <img
                      src={a.thumbnailUrl}
                      alt=""
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <span className="truncate">
                    {typeLabel === "Text" ? (
                      <span className="italic">{a.assetText || "—"}</span>
                    ) : a.youtubeUrl ? (
                      <a
                        href={a.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        {a.assetName || "Video"}
                      </a>
                    ) : (
                      a.assetName || "—"
                    )}
                  </span>
                </div>
              </td>
              <td className="px-2 py-1.5 text-center">
                <PerfBadge label={a.performanceLabel} />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatNumber(a.impressions)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatNumber(a.clicks)}
              </td>
              {typeLabel !== "Text" && (
                <>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {a.spend != null ? formatCurrency(a.spend) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {a.ctr != null ? formatPercent(a.ctr) : "—"}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Change type badge ── */

function ChangeTypeBadge({ type }: { type: string }) {
  const upper = type.toUpperCase();
  let color: string;

  switch (upper) {
    case "ADDED":
      color = "var(--green)";
      break;
    case "PAUSED":
    case "REMOVED":
      color = "var(--red)";
      break;
    case "RESUMED":
      color = "var(--accent)";
      break;
    default:
      color = "var(--muted)";
      break;
  }

  return (
    <span className="text-[11px] font-semibold uppercase" style={{ color }}>
      {upper}
    </span>
  );
}

/* ── Props ── */

interface AssetModalProps {
  campaignId: string;
  campaignName: string;
  from: string;
  to: string;
  onClose: () => void;
}

/* ── Main modal ── */

export default function AssetModal({
  campaignId,
  campaignName,
  from,
  to,
  onClose,
}: AssetModalProps) {
  const [tab, setTab] = useState<TabName>("live");
  const [assetsData, setAssetsData] = useState<AssetsResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Fetch assets ── */
  const fetchAssets = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/assets?campaignId=${encodeURIComponent(campaignId)}&from=${from}&to=${to}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`Assets API error: ${res.status}`);
      const json: AssetsResponse = await res.json();
      setAssetsData(json);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown fetch error");
    } finally {
      setLoading(false);
    }
  }, [campaignId, from, to]);

  /* ── Fetch history (lazy on tab switch) ── */
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const fetchHistory = useCallback(async () => {
    if (historyLoaded) return;

    try {
      const res = await fetch(
        `/api/assets?campaignId=${encodeURIComponent(campaignId)}&history=1`
      );
      if (!res.ok) throw new Error(`History API error: ${res.status}`);
      const json: HistoryResponse = await res.json();
      setHistory(json.history || []);
      setHistoryLoaded(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown fetch error");
    }
  }, [campaignId, historyLoaded]);

  useEffect(() => {
    fetchAssets();
    return () => abortRef.current?.abort();
  }, [fetchAssets]);

  useEffect(() => {
    if (tab === "history") fetchHistory();
  }, [tab, fetchHistory]);

  /* ── Click outside handler ── */
  const overlayRef = useRef<HTMLDivElement>(null);
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  /* ── Filter assets by state ── */
  const filterByState = (state: "live" | "stopped"): AssetsState => {
    if (!assetsData) return { video: [], image: [], text: [] };

    // If the API returns pre-filtered by state, use state field;
    // otherwise just show all for "live" tab
    if (state === "live") {
      return assetsData.assets;
    }
    // "stopped" — typically returned separately; show empty if single state
    return { video: [], image: [], text: [] };
  };

  /* ── Tab styling ── */
  const tabClass = (t: TabName): string => {
    const base =
      "px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors cursor-pointer";
    if (t === tab) {
      return `${base}`;
    }
    return `${base}`;
  };

  const tabStyle = (t: TabName): React.CSSProperties => {
    if (t === tab) {
      return { color: "var(--accent)", borderColor: "var(--accent)" };
    }
    return {
      color: "var(--muted)",
      borderColor: "transparent",
    };
  };

  const liveAssets = filterByState("live");
  const stoppedAssets = filterByState("stopped");

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={handleOverlayClick}
    >
      <div
        className="rounded-xl border w-full relative flex flex-col"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          maxWidth: "1300px",
          maxHeight: "90vh",
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-5 pt-4 pb-3 border-b flex-shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>
            {campaignName} — Assets
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-lg hover:bg-white/10 transition-colors"
            style={{ color: "var(--muted)" }}
          >
            &times;
          </button>
        </div>

        {/* ── Tabs ── */}
        <div
          className="flex gap-0 px-5 border-b flex-shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          {(["live", "stopped", "history"] as TabName[]).map((t) => (
            <button
              key={t}
              className={tabClass(t)}
              style={tabStyle(t)}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {loading && (
            <div
              className="text-center text-sm py-8 animate-pulse"
              style={{ color: "var(--muted)" }}
            >
              Loading assets...
            </div>
          )}

          {error && (
            <div className="text-sm py-4" style={{ color: "var(--red)" }}>
              {error}
            </div>
          )}

          {!loading && !error && tab === "live" && (
            <>
              <AssetTable typeLabel="Video" assets={liveAssets.video} />
              <AssetTable typeLabel="Image" assets={liveAssets.image} />
              <AssetTable typeLabel="Text" assets={liveAssets.text} />
              {!liveAssets.video.length &&
                !liveAssets.image.length &&
                !liveAssets.text.length && (
                  <div
                    className="text-center text-sm py-8"
                    style={{ color: "var(--muted)" }}
                  >
                    No live assets found.
                  </div>
                )}
            </>
          )}

          {!loading && !error && tab === "stopped" && (
            <>
              <AssetTable typeLabel="Video" assets={stoppedAssets.video} />
              <AssetTable typeLabel="Image" assets={stoppedAssets.image} />
              <AssetTable typeLabel="Text" assets={stoppedAssets.text} />
              {!stoppedAssets.video.length &&
                !stoppedAssets.image.length &&
                !stoppedAssets.text.length && (
                  <div
                    className="text-center text-sm py-8"
                    style={{ color: "var(--muted)" }}
                  >
                    No stopped assets found.
                  </div>
                )}
            </>
          )}

          {!loading && !error && tab === "history" && (
            <>
              {history.length === 0 ? (
                <div
                  className="text-center text-sm py-8"
                  style={{ color: "var(--muted)" }}
                >
                  No asset history found.
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 py-2 border-b"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <ChangeTypeBadge type={h.changeType} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: "var(--text)" }}>
                          {h.assetKey}
                        </p>
                        {h.oldValue && h.newValue && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                            {h.oldValue} &rarr; {h.newValue}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-xs flex-shrink-0 tabular-nums"
                        style={{ color: "var(--muted)" }}
                      >
                        {new Date(h.effectiveDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
