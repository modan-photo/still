import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  DEFAULT_RIGHT_PANEL_TAB,
  isRightPanelTabId,
  type RightPanelTabId,
} from "../../layout/rightPanelTabs";

export interface PersistedUIState {
  activeRightTab: RightPanelTabId;
  lastFramePresetId?: string;
}

const BROWSER_STORAGE_KEY = "still.ui-state";
const DEFAULT_UI_STATE: PersistedUIState = {
  activeRightTab: DEFAULT_RIGHT_PANEL_TAB,
};

function normalizeUIState(value: unknown): PersistedUIState {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_UI_STATE;
  }

  const { activeRightTab, lastFramePresetId } = value as Record<string, unknown>;
  const normalizedPresetId = typeof lastFramePresetId === "string" && lastFramePresetId.trim()
    ? lastFramePresetId
    : undefined;
  const withPresetId = (tab: RightPanelTabId): PersistedUIState => ({
    activeRightTab: tab,
    ...(normalizedPresetId ? { lastFramePresetId: normalizedPresetId } : {}),
  });

  if (isRightPanelTabId(activeRightTab)) return withPresetId(activeRightTab);
  // Legacy crop tab IDs are accepted only at the persistence boundary.
  if (activeRightTab === "crop") return withPresetId("transform");
  if (activeRightTab === "border") return withPresetId("frame");
  if (activeRightTab === "watermark") return withPresetId("stamp");

  return withPresetId(DEFAULT_RIGHT_PANEL_TAB);
}

export async function loadUIState(): Promise<PersistedUIState> {
  if (isTauri()) {
    return normalizeUIState(await invoke<unknown>("ui_state_load"));
  }

  const stored = localStorage.getItem(BROWSER_STORAGE_KEY);
  if (!stored) return DEFAULT_UI_STATE;

  try {
    const raw: unknown = JSON.parse(stored);
    const state = normalizeUIState(raw);
    if (typeof raw === "object" && raw !== null
      && (raw as Record<string, unknown>).activeRightTab === "crop") {
      try {
        localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(state));
      } catch (error: unknown) {
        console.warn("Unable to persist the migrated inspector tab", error);
      }
    }
    return state;
  } catch {
    return DEFAULT_UI_STATE;
  }
}

export async function saveUIState(state: Partial<PersistedUIState>): Promise<void> {
  if (isTauri()) {
    await invoke("ui_state_save", { state });
    return;
  }

  const current = await loadUIState();
  localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify({ ...current, ...state }));
}

export async function saveLastFramePresetId(lastFramePresetId: string): Promise<void> {
  await saveUIState({ lastFramePresetId });
}
