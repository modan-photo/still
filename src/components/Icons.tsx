import type { ReactNode } from "react";

export type IconName =
  | "open" | "sun" | "moon" | "system" | "settings" | "export" | "close"
  | "check" | "chevron" | "sidebar" | "frame" | "watermark" | "info"
  | "transform" | "rotate-left" | "rotate-right";

type IconProps = { name: IconName; size?: number };

const paths: Record<IconName, ReactNode> = {
  open: <><path d="M3.5 7.5h6l2-2h3.5"/><path d="M4 7.5h16l-1.8 10H5.8L4 7.5Z"/></>,
  sun: <><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></>,
  moon: <path d="M20 15.3A8 8 0 0 1 8.7 4a8 8 0 1 0 11.3 11.3Z"/>,
  system: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  export: <><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 13v7h14v-7"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  check: <path d="m5 12.5 4.2 4.2L19 7"/>,
  chevron: <path d="m8 10 4 4 4-4"/>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></>,
  frame: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>,
  watermark: <><path d="M4 18V8l4-3 4 3v10"/><path d="M12 18V8l4-3 4 3v10M2 18h20"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></>,
  transform: <><path d="M8 3H3v5M16 21h5v-5M3 8l5-5M21 16l-5 5"/><rect x="7" y="7" width="10" height="10" rx="1"/></>,
  "rotate-left": <><path d="M4 8V3m0 0h5M4 3l4 4"/><path d="M5.2 11a7 7 0 1 0 2-4"/></>,
  "rotate-right": <><path d="M20 8V3m0 0h-5m5 0-4 4"/><path d="M18.8 11a7 7 0 1 1-2-4"/></>,
};

export function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
