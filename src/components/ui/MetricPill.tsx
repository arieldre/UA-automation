"use client";

interface MetricPillProps {
  label: string;
  dotColor: string; // e.g. "var(--pill-spend)"
  active: boolean;
  onClick: () => void;
}

export default function MetricPill({ label, dotColor, active, onClick }: MetricPillProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  const activeStyle: React.CSSProperties = {
    backgroundColor: `color-mix(in srgb, ${dotColor} 15%, transparent)`,
    color: dotColor,
    border: `1px solid color-mix(in srgb, ${dotColor} 40%, transparent)`,
  };

  const inactiveStyle: React.CSSProperties = {
    backgroundColor: "var(--surface2)",
    color: "var(--muted)",
    border: "1px solid transparent",
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        fontSize: 11,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        lineHeight: 1,
        borderRadius: "var(--radius-full)",
        cursor: "pointer",
        userSelect: "none",
        ...(active ? activeStyle : inactiveStyle),
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: dotColor,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
