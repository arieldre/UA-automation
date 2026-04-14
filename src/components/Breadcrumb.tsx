"use client";

import type { BreadcrumbSegment, DrillLevel } from "@/hooks/useDrillDown";

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  onNavigate: (level: DrillLevel) => void;
}

export default function Breadcrumb({ segments, onNavigate }: BreadcrumbProps) {
  if (segments.length <= 1) return null;

  return (
    <nav
      className="flex items-center gap-1 text-xs"
      aria-label="Drill-down breadcrumb"
    >
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;

        return (
          <span key={`${seg.level}-${seg.label}`} className="flex items-center gap-1">
            {i > 0 && (
              <span
                className="select-none"
                style={{ color: "var(--muted)" }}
                aria-hidden
              >
                &#x203A;
              </span>
            )}
            {seg.clickable ? (
              <button
                type="button"
                onClick={() => onNavigate(seg.level)}
                className="transition-colors cursor-pointer hover:underline"
                style={{ color: "var(--accent)", fontSize: 12 }}
              >
                {seg.label}
              </button>
            ) : (
              <span
                className="max-w-[200px] truncate"
                style={{ color: "var(--muted)", fontSize: 12 }}
                title={seg.label}
              >
                {seg.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
