"use client";

import { useRef } from "react";

interface SegmentedToggleProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  size?: "sm" | "md";
}

export default function SegmentedToggle({
  options,
  value,
  onChange,
  size = "md",
}: SegmentedToggleProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = options.findIndex((o) => o.value === value);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (currentIndex + 1) % options.length;
      onChange(options[next].value);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (currentIndex - 1 + options.length) % options.length;
      onChange(options[prev].value);
    }
  };

  const px = size === "sm" ? "10px" : "12px";
  const py = size === "sm" ? "3px" : "4px";
  const fontSize = size === "sm" ? 11 : 12;

  return (
    <div
      ref={containerRef}
      role="group"
      onKeyDown={handleKeyDown}
      style={{
        display: "inline-flex",
        borderRadius: "var(--radius-full)",
        padding: 2,
        backgroundColor: "var(--surface2)",
        border: "1px solid var(--border)",
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(opt.value)}
            style={{
              padding: `${py} ${px}`,
              fontSize,
              borderRadius: "var(--radius-full)",
              border: "none",
              cursor: "pointer",
              transition: "all 150ms ease",
              fontWeight: isActive ? 500 : 400,
              backgroundColor: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "#fff" : "var(--muted)",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)";
              }
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
