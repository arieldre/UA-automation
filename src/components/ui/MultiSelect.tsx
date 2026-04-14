"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
  icon?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
}

export default function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const allSelected = selected.length === options.length;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(options.map((o) => o.value));
    }
  }, [allSelected, onChange, options]);

  const toggle = useCallback(
    (value: string) => {
      if (selected.includes(value)) {
        onChange(selected.filter((v) => v !== value));
      } else {
        onChange([...selected, value]);
      }
    },
    [selected, onChange]
  );

  const remove = useCallback(
    (value: string) => {
      onChange(selected.filter((v) => v !== value));
    },
    [selected, onChange]
  );

  const selectedLabels = selected
    .map((v) => options.find((o) => o.value === v))
    .filter(Boolean);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer"
        style={{
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          color: selected.length > 0 ? "var(--text)" : "var(--muted)",
        }}
      >
        {selected.length > 0 ? (
          <span className="flex items-center gap-1 flex-wrap">
            {selectedLabels.slice(0, 2).map((o) => (
              <span
                key={o!.value}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {o!.icon && <span className="text-sm">{o!.icon}</span>}
                {o!.label}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(o!.value);
                  }}
                  className="ml-0.5 hover:opacity-70 cursor-pointer"
                >
                  &times;
                </button>
              </span>
            ))}
            {selected.length > 2 && (
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                +{selected.length - 2}
              </span>
            )}
          </span>
        ) : (
          placeholder
        )}
        <svg
          className={`ml-1 h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-64 rounded-lg shadow-xl overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Search */}
          <div className="p-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full rounded px-2 py-1 text-xs outline-none"
              style={{
                background: "var(--surface2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
              autoFocus
            />
          </div>

          {/* All toggle */}
          <label
            className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:opacity-80"
            style={{ borderBottom: "1px solid var(--border)", color: "var(--text)" }}
          >
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-[var(--accent)]"
            />
            <span className="font-medium">All</span>
          </label>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:opacity-80"
                style={{ color: "var(--text)" }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  className="accent-[var(--accent)]"
                />
                {option.icon && <span className="text-sm">{option.icon}</span>}
                <span>{option.label}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                No results
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
