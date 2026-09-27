import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  DEFAULT_RIGHT_PANEL_TAB,
  isRightPanelTabId,
  type RightPanelTabId,
} from "../../layout/rightPanelTabs";

export interface PersistedUIState {
  activeRightTab: RightPanelTabId;
}

const BROWSER_STORAGE_KEY = "still.ui-state";
const DEFAULT_UI_STATE: PersistedUIState = {
  activeRightTab: DEFAULT_RIGHT_PANEL_TAB,
};

function normalizeUIState(value: unknown): PersistedUIState {
  if (typeof value !== "object" || value === null || !("activeRightTab" in value)) {
    return DEFAULT_UI_STATE;
  }

  const { activeRightTab } = value;
  if (isRightPanelTabId(activeRightTab)) return { activeRightTab };
  if (activeRightTab === "border") return { activeRightTab: "frame" };
  if (activeRightTab === "watermark") return { activeRightTab: "stamp" };

  return DEFAULT_UI_STATE;
}

export async function loadUIState(): Promise<PersistedUIState> {
  if (isTauri()) {
    return normalizeUIState(await invoke<unknown>("ui_state_load"));
  }

  const stored = localStorage.getItem(BROWSER_STORAGE_KEY);
  if (!stored) return DEFAULT_UI_STATE;

  try {
    return normalizeUIState(JSON.parse(stored));
  } catch {
    return DEFAULT_UI_STATE;
  }
}

export async function saveUIState(state: PersistedUIState): Promise<void> {
  if (isTauri()) {
    await invoke("ui_state_save", { state });
    return;
  }

  localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(state));
}
