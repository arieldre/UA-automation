"use client";
/**
 * Feature flag: ?v=next routes to the redesigned dashboard.
 * Remove this file and all usages once Phase 15 retires the flag.
 */
import { useSearchParams } from "next/navigation";

export function useNextDashboard(): boolean {
  // During SSR searchParams is null — default to showing new dashboard
  // (Phase 15 will remove the flag entirely)
  try {
    const params = useSearchParams();
    const v = params?.get("v");
    // Allow both explicit ?v=next and the default (no flag = new dashboard)
    return v !== "old";
  } catch {
    return true;
  }
}
