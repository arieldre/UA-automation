"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { FilterState, DateRange } from "@/lib/types";

// ── Date preset helpers ──

type Preset = DateRange["preset"];

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getDateRange(preset: Exclude<Preset, "custom">): { from: string; to: string } {
  const today = new Date();
  const to = fmt(today);

  switch (preset) {
    case "7d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { from: fmt(d), to };
    }
    case "14d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 13);
      return { from: fmt(d), to };
    }
    case "30d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      return { from: fmt(d), to };
    }
    case "thisMonth": {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(d), to };
    }
    case "lastMonth": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(start), to: fmt(end) };
    }
  }
}

// ── Default state ──

const DEFAULT_DATE_RANGE: DateRange = {
  ...getDateRange("7d"),
  preset: "7d",
};

const DEFAULT_FILTERS: FilterState = {
  dateRange: DEFAULT_DATE_RANGE,
  games: [],
  os: [],
  mediaSources: [],
  geos: [],
  campaignSearch: "",
};

// ── Context ──

interface FilterContextValue {
  filters: FilterState;
  setDateRange: (range: DateRange) => void;
  setDatePreset: (preset: Exclude<Preset, "custom">) => void;
  setGames: (games: string[]) => void;
  setOs: (os: FilterState["os"]) => void;
  setMediaSources: (sources: string[]) => void;
  setGeos: (geos: string[]) => void;
  setCampaignSearch: (search: string) => void;
  resetFilters: () => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

// ── Serialization helpers ──

function filtersToParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("preset", f.dateRange.preset);
  p.set("from", f.dateRange.from);
  p.set("to", f.dateRange.to);
  if (f.games.length) p.set("games", f.games.join(","));
  if (f.os.length) p.set("os", f.os.join(","));
  if (f.mediaSources.length) p.set("sources", f.mediaSources.join(","));
  if (f.geos.length) p.set("geos", f.geos.join(","));
  if (f.campaignSearch) p.set("q", f.campaignSearch);
  return p;
}

function paramsToFilters(p: URLSearchParams): FilterState {
  const preset = (p.get("preset") as Preset) || "7d";
  let from = p.get("from") || "";
  let to = p.get("to") || "";

  if (preset !== "custom" && (!from || !to)) {
    const range = getDateRange(preset);
    from = range.from;
    to = range.to;
  }

  return {
    dateRange: { from, to, preset },
    games: p.get("games")?.split(",").filter(Boolean) || [],
    os: (p.get("os")?.split(",").filter(Boolean) || []) as FilterState["os"],
    mediaSources: p.get("sources")?.split(",").filter(Boolean) || [],
    geos: p.get("geos")?.split(",").filter(Boolean) || [],
    campaignSearch: p.get("q") || "",
  };
}

// ── Provider ──

export function FilterProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [filters, setFilters] = useState<FilterState>(() => {
    if (searchParams.toString()) {
      return paramsToFilters(searchParams);
    }
    return DEFAULT_FILTERS;
  });

  // Sync state -> URL
  const syncToUrl = useCallback(
    (next: FilterState) => {
      const params = filtersToParams(next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname]
  );

  const update = useCallback(
    (partial: Partial<FilterState>) => {
      setFilters((prev) => {
        const next = { ...prev, ...partial };
        syncToUrl(next);
        return next;
      });
    },
    [syncToUrl]
  );

  const setDateRange = useCallback(
    (range: DateRange) => update({ dateRange: range }),
    [update]
  );

  const setDatePreset = useCallback(
    (preset: Exclude<Preset, "custom">) => {
      const { from, to } = getDateRange(preset);
      update({ dateRange: { from, to, preset } });
    },
    [update]
  );

  const setGames = useCallback((games: string[]) => update({ games }), [update]);
  const setOs = useCallback((os: FilterState["os"]) => update({ os }), [update]);
  const setMediaSources = useCallback(
    (mediaSources: string[]) => update({ mediaSources }),
    [update]
  );
  const setGeos = useCallback((geos: string[]) => update({ geos }), [update]);
  const setCampaignSearch = useCallback(
    (campaignSearch: string) => update({ campaignSearch }),
    [update]
  );
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    syncToUrl(DEFAULT_FILTERS);
  }, [syncToUrl]);

  // Sync URL -> state on external navigation
  useEffect(() => {
    const fromUrl = paramsToFilters(searchParams);
    setFilters(fromUrl);
  }, [searchParams]);

  return (
    <FilterContext.Provider
      value={{
        filters,
        setDateRange,
        setDatePreset,
        setGames,
        setOs,
        setMediaSources,
        setGeos,
        setCampaignSearch,
        resetFilters,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within <FilterProvider>");
  return ctx;
}
