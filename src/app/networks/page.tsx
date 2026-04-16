"use client";

import NetworksTable from "@/components/NetworksTable";
import { FilterProvider } from "@/hooks/useFilters";
import FilterBar from "@/components/FilterBar";
import { Suspense } from "react";

export default function NetworksPage() {
  return (
    <Suspense fallback={null}>
      <FilterProvider>
        <FilterBar />
        <div className="p-6">
          <NetworksTable />
        </div>
      </FilterProvider>
    </Suspense>
  );
}
