"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface ColumnConfig {
  key: string;
  label: string;
  defaultVisible: boolean;
}

export const ALL_COLUMNS: ColumnConfig[] = [
  { key: "name", label: "Name", defaultVisible: true },
  { key: "spend", label: "Spend", defaultVisible: true },
  { key: "installs", label: "Installs", defaultVisible: true },
  { key: "revenue", label: "Revenue", defaultVisible: true },
  { key: "ecpi", label: "eCPI", defaultVisible: true },
  { key: "roas", label: "ROAS", defaultVisible: true },
  { key: "arpu", label: "ARPU", defaultVisible: true },
  { key: "ipm", label: "IPM", defaultVisible: false },
  { key: "cpm", label: "CPM", defaultVisible: false },
  { key: "ctr", label: "CTR", defaultVisible: false },
  { key: "cvr", label: "CVR", defaultVisible: false },
];

export const DEFAULT_VISIBLE_COLUMNS = ALL_COLUMNS
  .filter((c) => c.defaultVisible)
  .map((c) => c.key);

interface ColumnSettingsProps {
  visibleColumns: string[];
  onChange: (columns: string[]) => void;
}

export default function ColumnSettings({ visibleColumns, onChange }: ColumnSettingsProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside]);

  const toggle = (key: string) => {
    // "name" is always visible
    if (key === "name") return;

    if (visibleColumns.includes(key)) {
      onChange(visibleColumns.filter((c) => c !== key));
    } else {
      onChange([...visibleColumns, key]);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors cursor-pointer"
        style={{
          background: open ? "var(--accent)" : "var(--surface2)",
          color: open ? "#fff" : "var(--muted)",
          border: "1px solid var(--border)",
        }}
        title="Column settings"
        aria-label="Column settings"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 z-50 rounded-xl p-3 shadow-lg min-w-[180px]"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <p
            className="text-[11px] font-medium uppercase mb-2"
            style={{ color: "var(--muted)" }}
          >
            Visible Columns
          </p>
          <div className="flex flex-col gap-1">
            {ALL_COLUMNS.map((col) => {
              const checked = visibleColumns.includes(col.key);
              const disabled = col.key === "name";

              return (
                <label
                  key={col.key}
                  className={`flex items-center gap-2 py-1 px-1.5 rounded text-xs cursor-pointer transition-colors ${
                    disabled ? "opacity-50 cursor-default" : ""
                  }`}
                  style={{ color: "var(--text)" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(col.key)}
                    className="accent-[var(--accent)] w-3.5 h-3.5"
                  />
                  {col.label}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
