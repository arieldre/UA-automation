"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useFilters } from "@/hooks/useFilters";
import type { ReportResponse } from "@/lib/types";
import { API_BASE } from "@/lib/apiBase";

interface UseDashboardDataReturn {
  data: ReportResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDashboardData(): UseDashboardDataReturn {
  const { filters } = useFilters();
  const { from, to } = filters.dateRange;

  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/report?from=${from}&to=${to}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Report API error: ${res.status} ${res.statusText}`);
      }
      const json: ReportResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown fetch error");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  // Fetch on mount and when date range changes
  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}
