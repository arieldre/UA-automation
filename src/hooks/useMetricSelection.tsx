"use client";
import { createContext, useContext, useState, useCallback } from "react";

export type ChartMetric =
  | "spend"
  | "installs"
  | "revenue"
  | "ecpi"
  | "ipm"
  | "arpuD0"
  | "arpuD7"
  | "arpuD30"
  | "roasD0"
  | "roasD7"
  | "roasD30"
  | "cvr"
  | "ctr";

interface MetricSelectionContext {
  primary: ChartMetric;
  secondary: ChartMetric | null;
  setPrimary: (m: ChartMetric) => void;
  setSecondary: (m: ChartMetric | null) => void;
  toggle: (m: ChartMetric, shift?: boolean) => void;
}

const MetricSelectionCtx = createContext<MetricSelectionContext | null>(null);

export function MetricSelectionProvider({ children }: { children: React.ReactNode }) {
  const [primary, setPrimary] = useState<ChartMetric>("spend");
  const [secondary, setSecondary] = useState<ChartMetric | null>("installs");

  const toggle = useCallback((m: ChartMetric, shift = false) => {
    if (shift) {
      // Shift-click: set/clear secondary
      setSecondary((prev) => (prev === m ? null : m));
    } else {
      // Normal click: set primary, clear secondary if it matches
      setPrimary(m);
      setSecondary((prev) => (prev === m ? null : prev));
    }
  }, []);

  return (
    <MetricSelectionCtx.Provider value={{ primary, secondary, setPrimary, setSecondary, toggle }}>
      {children}
    </MetricSelectionCtx.Provider>
  );
}

export function useMetricSelection(): MetricSelectionContext {
  const ctx = useContext(MetricSelectionCtx);
  if (!ctx) throw new Error("useMetricSelection must be used inside MetricSelectionProvider");
  return ctx;
}
