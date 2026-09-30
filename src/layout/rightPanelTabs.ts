import type { IconName } from "../components/Icons";

/** Canonical tab order shared by rendering, persistence and keyboard shortcuts. */
export const RIGHT_PANEL_TABS = [
  { id: "frame", label: "Frame", icon: "frame" },
  { id: "crop", label: "Crop", icon: "crop" },
  { id: "stamp", label: "Stamp", icon: "stamp" },
  { id: "exif", label: "EXIF", icon: "info" },
  { id: "collage", label: "Collage", icon: "grid" },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: IconName;
}>;

export type RightPanelTabId = (typeof RIGHT_PANEL_TABS)[number]["id"];

export const DEFAULT_RIGHT_PANEL_TAB: RightPanelTabId = "frame";

/** Validate persisted or otherwise untrusted values before using them as tab IDs. */
export function isRightPanelTabId(value: unknown): value is RightPanelTabId {
  return RIGHT_PANEL_TABS.some((tab) => tab.id === value);
}
