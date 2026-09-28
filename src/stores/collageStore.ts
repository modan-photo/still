import { create } from 'zustand';
import type { CollageConfig, CollageItem, CollageTemplate } from '../types/collage';
import { DEFAULT_COLLAGE_CONFIG, makeCollageItems } from '../types/collage';

const TEMPLATE_KEY = 'still.collage.templates.v1';
interface CollageState {
  items: CollageItem[]; config: CollageConfig; selectedItemId: string | null; templates: CollageTemplate[];
  initialize: (photos: Array<{ id: string; path: string }>) => void;
  setConfig: (patch: Partial<CollageConfig>) => void; select: (id: string | null) => void;
  updateItem: (id: string, patch: Partial<CollageItem>) => void; reorder: (from: number, to: number) => void;
  saveTemplate: (name: string) => void; applyTemplate: (id: string) => void; deleteTemplate: (id: string) => void;
}
function readTemplates(): CollageTemplate[] { try { const value = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function persist(templates: CollageTemplate[]) { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates)); }
function arrange(items: CollageItem[], columns: number) { return items.map((item, index) => ({ ...item, cell: { ...item.cell, row: Math.floor(index / columns), column: index % columns, zIndex: index } })); }

export const useCollageStore = create<CollageState>((set) => ({
  items: [], config: structuredClone(DEFAULT_COLLAGE_CONFIG), selectedItemId: null, templates: readTemplates(),
  initialize: (photos) => set((state) => ({ items: makeCollageItems(photos, state.config.columns), selectedItemId: photos[0]?.id ?? null })),
  setConfig: (patch) => set((state) => { const config = { ...state.config, ...structuredClone(patch) }; return { config, items: patch.columns ? arrange(state.items, config.columns) : state.items }; }),
  select: (selectedItemId) => set({ selectedItemId }),
  updateItem: (id, patch) => set((state) => ({ items: state.items.map((item) => item.id === id ? { ...item, ...structuredClone(patch) } : item) })),
  reorder: (from, to) => set((state) => { const items = [...state.items]; const [item] = items.splice(from, 1); items.splice(to, 0, item); return { items: arrange(items, state.config.columns) }; }),
  saveTemplate: (name) => set((state) => { const template: CollageTemplate = { id: crypto.randomUUID(), name, config: (({ outputPath: _path, ...config }) => config)(structuredClone(state.config)), items: state.items.map(({ id: _id, path: _path, ...item }) => item) }; const templates = [...state.templates, template]; persist(templates); return { templates }; }),
  applyTemplate: (id) => set((state) => { const template = state.templates.find((entry) => entry.id === id); if (!template) return state; const config = { ...structuredClone(template.config), outputPath: state.config.outputPath }; const items = state.items.map((item, index) => ({ ...item, ...(template.items[index] ? structuredClone(template.items[index]) : {}) })); return { config, items: arrange(items, config.columns) }; }),
  deleteTemplate: (id) => set((state) => { const templates = state.templates.filter((entry) => entry.id !== id); persist(templates); return { templates }; }),
}));
