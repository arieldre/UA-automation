"use client";

import TreeTable from "@/components/TreeTable";
import FacebookSection from "@/components/FacebookSection";

export default function CampaignsPage() {
  return (
    <>
      <TreeTable />
      <div className="mt-6">
        <FacebookSection />
      </div>
    </>
  );
}
