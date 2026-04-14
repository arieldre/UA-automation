/** Pure formatting utilities for dashboard values. */

export function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatPercent(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

export function formatROAS(n: number): { text: string; colorClass: string } {
  const pct = n * 100;
  const text = pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

  let colorClass: string;
  if (pct >= 100) colorClass = "text-[var(--green)]";
  else if (pct >= 50) colorClass = "text-[var(--yellow)]";
  else colorClass = "text-[var(--red)]";

  return { text, colorClass };
}
