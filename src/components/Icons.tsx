import type { ReactNode } from "react";

/** Supported icon names used by buttons and settings sections. */
export type IconName =
  | "open" | "sun" | "moon" | "system" | "settings" | "export" | "close"
  | "check" | "chevron" | "sidebar" | "frame" | "stamp" | "info"
  | "transform" | "rotate-left" | "rotate-right" | "minimize" | "maximize" | "plus" | "copy"
  | "grid" | "single" | "trash" | "select" | "image-off"
  | "gap" | "radius" | "background" | "aspect" | "photos";

/** name selects the icon; size controls both SVG dimensions and defaults to 18 pixels. */
type IconProps = { name: IconName; size?: number; strokeWidth?: number };

/**
 * Maps icon names to SVG nodes in a shared 24 × 24 coordinate system.
 * Record ensures every IconName has matching artwork; add both when extending the set.
 * Compound artwork uses fragments while color and stroke styles inherit from the outer SVG.
 */
const paths: Record<IconName, ReactNode> = {
  // File actions and appearance controls.
  open: <><path d="M3.5 7.5h6l2-2h3.5"/><path d="M4 7.5h16l-1.8 10H5.8L4 7.5Z"/></>,
  sun: <><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></>,
  moon: <path d="M20 15.3A8 8 0 0 1 8.7 4a8 8 0 1 0 11.3 11.3Z"/>,
  system: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  export: <><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 13v7h14v-7"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  minimize: <path d="M6 12h12"/>,
  maximize: <rect x="5.5" y="5.5" width="13" height="13" rx="0.5"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  single: <rect x="4" y="5" width="16" height="14" rx="2"/>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
  select: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="m14 17 2.2 2.2 4-5"/></>,
  "image-off": <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 4.5-4.5 3 3 2-2 5.5 5.5M15.5 8.5h.01M4 3l16 18"/></>,
  gap: <><rect x="3" y="5" width="6" height="14" rx="1"/><rect x="15" y="5" width="6" height="14" rx="1"/><path d="M11.5 7v10M12.5 7v10" strokeDasharray="2 2"/></>,
  radius: <><path d="M5 19V9a4 4 0 0 1 4-4h10"/><path d="M9 19H5v-4"/></>,
  background: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6"/><circle cx="16.5" cy="7.5" r="1.5"/></>,
  aspect: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h4M7 9v4M17 15h-4M17 15v-4"/></>,
  photos: <><rect x="5" y="3" width="16" height="16" rx="2"/><path d="M3 7v13a1 1 0 0 0 1 1h13M5 15l4-4 3 3 2-2 5 5"/></>,
  // Selection, disclosure, and sidebar layout icons; chevron points down by default.
  check: <path d="m5 12.5 4.2 4.2L19 7"/>,
  chevron: <path d="m8 10 4 4 4-4"/>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></>,
  // Photo-property sections and rotation actions.
  frame: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>,
  stamp: <><path d="M4 18V8l4-3 4 3v10"/><path d="M12 18V8l4-3 4 3v10M2 18h20"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></>,
  transform: <><path d="M8 3H3v5M16 21h5v-5M3 8l5-5M21 16l-5 5"/><rect x="7" y="7" width="10" height="10" rx="1"/></>,
  "rotate-left": <><path d="M4 8V3m0 0h5M4 3l4 4"/><path d="M5.2 11a7 7 0 1 0 2-4"/></>,
  "rotate-right": <><path d="M20 8V3m0 0h-5m5 0-4 4"/><path d="M18.8 11a7 7 0 1 1-2-4"/></>,
};

/**
 * Renders consistent line icons: viewBox scales with size and currentColor inherits CSS text color.
 * Rounded caps and joins keep the stroke style consistent; callers can target the .icon class.
 * SVGs are decorative and hidden from assistive technology; labels belong on the parent control.
 */
export function Icon({ name, size = 18, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
