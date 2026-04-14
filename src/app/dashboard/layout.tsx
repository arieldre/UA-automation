"use client";

import { Suspense } from "react";
import { FilterProvider } from "@/hooks/useFilters";
import FilterBar from "@/components/FilterBar";
import KPIStrip from "@/components/KPIStrip";
import TrendChart from "@/components/TrendChart";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <FilterProvider>
        <div className="flex flex-col flex-1">
          <FilterBar />
          <KPIStrip />
          <div className="p-6">
            <TrendChart />
            <main className="flex-1">{children}</main>
          </div>
        </div>
      </FilterProvider>
    </Suspense>
  );
}
