"use client";

import { useFilters } from "@/hooks/useFilters";
import { useDashboardData } from "@/hooks/useDashboardData";
import DateRangePicker from "@/components/ui/DateRangePicker";
import MultiSelect, { type MultiSelectOption } from "@/components/ui/MultiSelect";
import SegmentedToggle from "@/components/ui/SegmentedToggle";
import { useCallback, useState, useEffect } from "react";
import type { FilterState } from "@/lib/types";

// ── Static media source options ──
const MEDIA_SOURCES: MultiSelectOption[] = [
  { value: "googleadwords_int", label: "Google Ads" },
  { value: "Meta Ads", label: "Meta" },
  { value: "tiktokglobal_int", label: "TikTok" },
  { value: "unityads_int", label: "Unity" },
  { value: "applovin_int", label: "AppLovin" },
  { value: "moloco_int", label: "Moloco" },
];

type OsValue = "android" | "ios";

export default function FilterBar() {
  const {
    filters,
    setDateRange,
    setOs,
    setMediaSources,
    setGeos,
    setCampaignSearch,
  } = useFilters();
  const { refresh } = useDashboardData();

  // Theme toggle
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setDark(current !== "light");
  }, []);

  const toggleTheme = useCallback(() => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setDark(!dark);
  }, [dark]);

  // OS toggle helpers
  const osValue: "all" | OsValue =
    filters.os.length === 0 || filters.os.length === 2
      ? "all"
      : filters.os[0];

  const handleOs = useCallback(
    (val: "all" | OsValue) => {
      if (val === "all") setOs([]);
      else setOs([val]);
    },
    [setOs]
  );

  // Geo options — placeholder, will be populated from data in future
  const GEO_OPTIONS: MultiSelectOption[] = [
    { value: "US", label: "United States" },
    { value: "GB", label: "United Kingdom" },
    { value: "CA", label: "Canada" },
    { value: "AU", label: "Australia" },
    { value: "DE", label: "Germany" },
    { value: "JP", label: "Japan" },
    { value: "KR", label: "South Korea" },
    { value: "BR", label: "Brazil" },
  ];

  return (
    <header
      className="sticky top-0 z-20 flex flex-wrap items-center gap-3 px-4 py-2.5"
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Title */}
      <h1 className="text-base font-semibold whitespace-nowrap" style={{ color: "var(--text)" }}>
        <span style={{ color: "var(--accent)" }}>UA</span> Dashboard
      </h1>

      {/* Separator */}
      <div className="h-5 w-px" style={{ background: "var(--border)" }} />

      {/* Date picker */}
      <DateRangePicker value={filters.dateRange} onChange={setDateRange} />

      {/* OS toggle group */}
      <SegmentedToggle
        size="sm"
        options={[
          { value: "all", label: "All" },
          { value: "android", label: "Android" },
          { value: "ios", label: "iOS" },
        ]}
        value={osValue}
        onChange={(v) => handleOs(v as "all" | OsValue)}
      />

      {/* Media Source */}
      <MultiSelect
        options={MEDIA_SOURCES}
        selected={filters.mediaSources}
        onChange={setMediaSources}
        placeholder="Media Source"
      />

      {/* Geo */}
      <MultiSelect
        options={GEO_OPTIONS}
        selected={filters.geos}
        onChange={setGeos}
        placeholder="Geo"
      />

      {/* Campaign search */}
      <div className="relative">
        <svg
          className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          style={{ color: "var(--muted)" }}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={filters.campaignSearch}
          onChange={(e) => setCampaignSearch(e.target.value)}
          placeholder="Search campaigns..."
          className="rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none w-44"
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        />
      </div>

      {/* Separator */}
      <div className="h-5 w-px" style={{ background: "var(--border)" }} />

      {/* Refresh */}
      <button
        type="button"
        onClick={refresh}
        title="Refresh data"
        className="rounded-lg p-1.5 text-sm transition-colors hover:opacity-80 cursor-pointer"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
      >
        &#8635;
      </button>

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        title="Toggle theme"
        className="rounded-lg p-1.5 text-sm transition-colors hover:opacity-80 cursor-pointer"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
      >
        {dark ? "\u2600\uFE0F" : "\uD83C\uDF19"}
      </button>
    </header>
  );
}
