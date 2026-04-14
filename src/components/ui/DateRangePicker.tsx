"use client";

import { useState, useRef, useEffect } from "react";
import type { DateRange } from "@/lib/types";
import { getDateRange } from "@/hooks/useFilters";

type Preset = DateRange["preset"];

const PRESET_LABELS: { preset: Preset; label: string }[] = [
  { preset: "7d", label: "Last 7 days" },
  { preset: "14d", label: "Last 14 days" },
  { preset: "30d", label: "Last 30 days" },
  { preset: "thisMonth", label: "This Month" },
  { preset: "lastMonth", label: "Last Month" },
  { preset: "custom", label: "Custom" },
];

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click-away
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const activeLabel =
    PRESET_LABELS.find((p) => p.preset === value.preset)?.label ?? "Select range";

  function handlePreset(preset: Preset) {
    if (preset === "custom") {
      // Keep dropdown open for custom date inputs
      onChange({ from: customFrom, to: customTo, preset: "custom" });
      return;
    }
    const range = getDateRange(preset);
    onChange({ ...range, preset });
    setOpen(false);
  }

  function handleCustomApply() {
    onChange({ from: customFrom, to: customTo, preset: "custom" });
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer"
        style={{
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span>{activeLabel}</span>
        {value.preset === "custom" && (
          <span style={{ color: "var(--muted)" }}>
            {value.from} - {value.to}
          </span>
        )}
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-72 rounded-lg shadow-xl overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {PRESET_LABELS.map(({ preset, label }) => (
            <button
              key={preset}
              type="button"
              onClick={() => handlePreset(preset)}
              className="w-full text-left px-4 py-2 text-xs transition-colors cursor-pointer"
              style={{
                color: value.preset === preset ? "var(--accent)" : "var(--text)",
                background: value.preset === preset ? "var(--surface2)" : "transparent",
              }}
            >
              {label}
            </button>
          ))}

          {/* Custom date inputs */}
          {value.preset === "custom" && (
            <div
              className="p-3 flex flex-col gap-2"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <label className="text-[11px]" style={{ color: "var(--muted)" }}>
                  From
                </label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="flex-1 rounded px-2 py-1 text-xs outline-none"
                  style={{
                    background: "var(--surface2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    colorScheme: "dark",
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px]" style={{ color: "var(--muted)" }}>
                  To
                </label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="flex-1 rounded px-2 py-1 text-xs outline-none ml-3.5"
                  style={{
                    background: "var(--surface2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    colorScheme: "dark",
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleCustomApply}
                className="mt-1 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
