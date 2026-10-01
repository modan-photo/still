import { createSessionStore } from './createSessionStore';
import {
  DEFAULT_RIGHT_PANEL_TAB,
  type RightPanelTabId,
} from '../layout/rightPanelTabs';

export interface UIState {
  inspectorOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  systemFontsEnabled: boolean;
  activeRightTab: RightPanelTabId;
  gridPanelOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
  setTheme: (theme: UIState['theme']) => void;
  setSystemFontsEnabled: (enabled: boolean) => void;
  setActiveRightTab: (tab: UIState['activeRightTab']) => void;
  setGridPanelOpen: (open: boolean) => void;
  toggleGridPanel: () => void;
  resetSession: () => void;
}
const SYSTEM_FONTS_KEY = 'still.use-system-fonts';
const storedSystemFontsEnabled = () => typeof localStorage !== 'undefined' && localStorage.getItem(SYSTEM_FONTS_KEY) === 'true';

export const useUIStore = createSessionStore<UIState>((set) => ({
  inspectorOpen: true,
  theme: 'system',
  systemFontsEnabled: storedSystemFontsEnabled(),
  activeRightTab: DEFAULT_RIGHT_PANEL_TAB,
  gridPanelOpen: false,
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setTheme: (theme) => set({ theme }),
  setSystemFontsEnabled: (systemFontsEnabled) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SYSTEM_FONTS_KEY, String(systemFontsEnabled));
    set({ systemFontsEnabled });
  },
  setActiveRightTab: (activeRightTab) => set({ activeRightTab }),
  setGridPanelOpen: (gridPanelOpen) => set({ gridPanelOpen }),
  toggleGridPanel: () => set((state) => ({ gridPanelOpen: !state.gridPanelOpen })),
  resetSession: () => set({
    activeRightTab: DEFAULT_RIGHT_PANEL_TAB,
    inspectorOpen: true,
    gridPanelOpen: false,
  }),
}), import.meta.hot?.data.uiStore);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => { data.uiStore = useUIStore; });
}
