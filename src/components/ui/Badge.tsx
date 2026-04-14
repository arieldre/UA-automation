"use client";

interface BadgeProps {
  value: number;
  type: "roas" | "diff" | "neutral";
}

export default function Badge({ value, type }: BadgeProps) {
  let bg: string;
  let text: string;
  let display: string;

  if (type === "roas") {
    const pct = value * 100;
    display = pct.toFixed(1) + "%";
    if (pct >= 100) {
      bg = "var(--green-bg)";
      text = "var(--green)";
    } else if (pct >= 50) {
      bg = "var(--yellow-bg)";
      text = "var(--yellow)";
    } else {
      bg = "var(--red-bg)";
      text = "var(--red)";
    }
  } else if (type === "diff") {
    display = (value >= 0 ? "+" : "") + value.toFixed(1) + "%";
    if (value >= 0) {
      bg = "var(--green-bg)";
      text = "var(--green)";
    } else {
      bg = "var(--red-bg)";
      text = "var(--red)";
    }
  } else {
    display = value.toFixed(1);
    bg = "var(--surface2)";
    text = "var(--muted)";
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {display}
    </span>
  );
}
