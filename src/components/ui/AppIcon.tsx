"use client";

import { useState } from "react";
import { CircleShell } from "./SourceIcon";

interface AppIconProps {
  appName: string;
  size?: number;
}

interface AppConfig {
  iconPath?: string;
  gradient?: string;
  bg?: string;
  text: string;
  initials: string;
}

const APP_MAP: Record<string, AppConfig> = {
  "urban heat": {
    iconPath: "/icons/urban-heat.png",
    gradient: "linear-gradient(135deg, #F97316, #DC2626)",
    text: "#fff",
    initials: "UH",
  },
};

function normalizeApp(name: string): string {
  return name.toLowerCase().trim();
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAppConfig(appName: string): AppConfig {
  const key = normalizeApp(appName);
  if (APP_MAP[key]) return APP_MAP[key];

  // Generate deterministic gradient from name
  let hash = 0;
  for (let i = 0; i < appName.length; i++) {
    hash = appName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 40) % 360;

  return {
    gradient: `linear-gradient(135deg, hsl(${h1}, 65%, 50%), hsl(${h2}, 65%, 40%))`,
    text: "#fff",
    initials: getInitials(appName),
  };
}

export default function AppIcon({ appName, size = 28 }: AppIconProps) {
  const config = getAppConfig(appName);
  const [imgFailed, setImgFailed] = useState(false);

  const showFallback = !config.iconPath || imgFailed;
  const bg = config.gradient || config.bg || "#6B7280";

  return (
    <CircleShell size={size} bg={bg}>
      {showFallback ? (
        <span
          style={{
            fontSize: Math.floor(size * 0.38),
            fontWeight: 700,
            color: config.text,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {config.initials}
        </span>
      ) : (
        <img
          src={config.iconPath}
          alt={appName}
          width={size}
          height={size}
          onError={() => setImgFailed(true)}
          style={{ objectFit: "cover", width: "100%", height: "100%" }}
        />
      )}
    </CircleShell>
  );
}
