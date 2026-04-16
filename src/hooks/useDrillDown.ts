"use client";

import { useState, useCallback, useMemo } from "react";

export type DrillLevel = "os" | "campaign" | "date";

export interface DrillState {
  level: DrillLevel;
  selectedOS?: string;
  selectedCampaign?: string;
}

export interface BreadcrumbSegment {
  label: string;
  level: DrillLevel;
  clickable: boolean;
}

export interface UseDrillDownReturn {
  state: DrillState;
  breadcrumbs: BreadcrumbSegment[];
  goToOS: () => void;
  selectOS: (os: string) => void;
  selectCampaign: (name: string) => void;
  goBack: (level: DrillLevel) => void;
}

const INITIAL_STATE: DrillState = { level: "os" };

export function useDrillDown(): UseDrillDownReturn {
  const [state, setState] = useState<DrillState>(INITIAL_STATE);

  const goToOS = useCallback(() => {
    setState({ level: "os" });
  }, []);

  const selectOS = useCallback((os: string) => {
    setState({ level: "campaign", selectedOS: os });
  }, []);

  const selectCampaign = useCallback((name: string) => {
    setState((prev) => ({
      level: "date",
      selectedOS: prev.selectedOS,
      selectedCampaign: name,
    }));
  }, []);

  const goBack = useCallback((level: DrillLevel) => {
    switch (level) {
      case "os":
        setState({ level: "os" });
        break;
      case "campaign":
        setState((prev) => ({
          level: "campaign",
          selectedOS: prev.selectedOS,
        }));
        break;
      case "date":
        // Already at date, no-op
        break;
    }
  }, []);

  const breadcrumbs = useMemo((): BreadcrumbSegment[] => {
    const segments: BreadcrumbSegment[] = [];

    // OS level is always first
    segments.push({
      label: "All Platforms",
      level: "os",
      clickable: state.level !== "os",
    });

    if (state.selectedOS && (state.level === "campaign" || state.level === "date")) {
      const osLabel =
        state.selectedOS === "all"
          ? "All"
          : state.selectedOS === "android"
            ? "Android"
            : "iOS";
      segments.push({
        label: osLabel,
        level: "campaign",
        clickable: state.level !== "campaign",
      });
    }

    if (state.selectedCampaign && state.level === "date") {
      segments.push({
        label: state.selectedCampaign,
        level: "date",
        clickable: false,
      });
    }

    return segments;
  }, [state]);

  return { state, breadcrumbs, goToOS, selectOS, selectCampaign, goBack };
}
