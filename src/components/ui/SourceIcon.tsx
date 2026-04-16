"use client";

import { useState } from "react";

interface SourceIconProps {
  source: string;
  size?: number;
}

interface SourceConfig {
  bg: string;
  text: string;
  initial: string;
  iconUrl?: string;
}

function normalizeSource(source: string): string {
  return source.toLowerCase().replace(/[_\-\s]/g, "");
}

const SOURCE_MAP: Record<string, SourceConfig> = {
  meta: {
    bg: "#1877F2",
    text: "#fff",
    initial: "M",
    iconUrl: "https://cdn.simpleicons.org/meta/ffffff",
  },
  facebook: {
    bg: "#1877F2",
    text: "#fff",
    initial: "F",
    iconUrl: "https://cdn.simpleicons.org/facebook/ffffff",
  },
  tiktok: {
    bg: "#010101",
    text: "#fff",
    initial: "T",
    iconUrl: "https://cdn.simpleicons.org/tiktok/ffffff",
  },
  google: {
    bg: "#4285F4",
    text: "#fff",
    initial: "G",
    iconUrl: "https://cdn.simpleicons.org/google/ffffff",
  },
  googleads: {
    bg: "#4285F4",
    text: "#fff",
    initial: "G",
    iconUrl: "https://cdn.simpleicons.org/googleads/ffffff",
  },
  googleadwordsint: {
    bg: "#4285F4",
    text: "#fff",
    initial: "G",
    iconUrl: "https://cdn.simpleicons.org/googleads/ffffff",
  },
  applovin: {
    bg: "#E8523A",
    text: "#fff",
    initial: "A",
  },
  unity: {
    bg: "#222222",
    text: "#fff",
    initial: "U",
    iconUrl: "https://cdn.simpleicons.org/unity/ffffff",
  },
  unityads: {
    bg: "#222222",
    text: "#fff",
    initial: "U",
    iconUrl: "https://cdn.simpleicons.org/unity/ffffff",
  },
  apple: {
    bg: "#555555",
    text: "#fff",
    initial: "A",
    iconUrl: "https://cdn.simpleicons.org/apple/ffffff",
  },
  applesearchads: {
    bg: "#555555",
    text: "#fff",
    initial: "A",
    iconUrl: "https://cdn.simpleicons.org/apple/ffffff",
  },
  ios: {
    bg: "#555555",
    text: "#fff",
    initial: "i",
    iconUrl: "https://cdn.simpleicons.org/apple/ffffff",
  },
  android: {
    bg: "#3DDC84",
    text: "#fff",
    initial: "A",
    iconUrl: "https://cdn.simpleicons.org/android/ffffff",
  },
  snapchat: {
    bg: "#FFFC00",
    text: "#000",
    initial: "S",
    iconUrl: "https://cdn.simpleicons.org/snapchat/000000",
  },
  twitter: {
    bg: "#1DA1F2",
    text: "#fff",
    initial: "T",
    iconUrl: "https://cdn.simpleicons.org/twitter/ffffff",
  },
  x: {
    bg: "#000000",
    text: "#fff",
    initial: "X",
    iconUrl: "https://cdn.simpleicons.org/x/ffffff",
  },
  ironSource: {
    bg: "#FF6B35",
    text: "#fff",
    initial: "I",
  },
  ironsource: {
    bg: "#FF6B35",
    text: "#fff",
    initial: "I",
  },
};

function getConfig(source: string): SourceConfig {
  const normalized = normalizeSource(source);
  if (SOURCE_MAP[normalized]) return SOURCE_MAP[normalized];

  // Generate a deterministic color from the source string
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = source.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue}, 55%, 45%)`,
    text: "#fff",
    initial: source.charAt(0).toUpperCase(),
  };
}

interface CircleShellProps {
  size: number;
  bg: string;
  children: React.ReactNode;
}

function CircleShell({ size, bg, children }: CircleShellProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        backgroundColor: bg,
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

export { CircleShell };

export default function SourceIcon({ source, size = 24 }: SourceIconProps) {
  const config = getConfig(source);
  const [imgFailed, setImgFailed] = useState(false);

  const showFallback = !config.iconUrl || imgFailed;

  return (
    <CircleShell size={size} bg={config.bg}>
      {showFallback ? (
        <span
          style={{
            fontSize: Math.floor(size * 0.45),
            fontWeight: 700,
            color: config.text,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {config.initial}
        </span>
      ) : (
        <img
          src={config.iconUrl}
          alt={source}
          width={Math.floor(size * 0.6)}
          height={Math.floor(size * 0.6)}
          onError={() => setImgFailed(true)}
          style={{ objectFit: "contain" }}
        />
      )}
    </CircleShell>
  );
}
