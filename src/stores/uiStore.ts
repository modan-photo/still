import { create } from 'zustand';
interface UIState {
  inspectorOpen: boolean;
  viewMode: 'single' | 'grid';
  theme: 'light' | 'dark' | 'system';
  setInspectorOpen: (open: boolean) => void;
  setViewMode: (mode: UIState['viewMode']) => void;
  setTheme: (theme: UIState['theme']) => void;
}
export const useUIStore = create<UIState>((set) => ({
  inspectorOpen: true, viewMode: 'single', theme: 'system',
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setViewMode: (viewMode) => set({ viewMode }),
  setTheme: (theme) => set({ theme }),
}));
