"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>(defaultOpen ? "none" : "0px");

  useEffect(() => {
    if (isOpen) {
      const el = contentRef.current;
      if (el) {
        // Temporarily set to auto to measure
        setMaxHeight(`${el.scrollHeight}px`);
        // After transition, set to none for dynamic content
        const timer = setTimeout(() => setMaxHeight("none"), 300);
        return () => clearTimeout(timer);
      }
    } else {
      // Get current height first, then collapse
      const el = contentRef.current;
      if (el) {
        setMaxHeight(`${el.scrollHeight}px`);
        // Force reflow before setting to 0
        requestAnimationFrame(() => {
          setMaxHeight("0px");
        });
      }
    }
  }, [isOpen]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 py-1.5 px-1 text-xs transition-colors cursor-pointer"
        style={{ color: "var(--muted)" }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {title && (
          <span className="text-[11px] font-medium uppercase">{title}</span>
        )}
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight }}
      >
        {children}
      </div>
    </div>
  );
}
