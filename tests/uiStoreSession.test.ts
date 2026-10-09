import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke }));

let getItem: ReturnType<typeof vi.fn>;
let setItem: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  invoke.mockReset();
  getItem = vi.fn((key: string) =>
    key === 'still.ui-state'
      ? JSON.stringify({ activeRightTab: 'collage', lastFramePresetId: 'old-preset' })
      : null,
  );
  setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem, setItem });
});
afterEach(() => vi.unstubAllGlobals());

describe('in-memory inspector state', () => {
  it('starts on the frame tab with expanded inspector and closed grid despite legacy state', async () => {
    const { useUIStore } = await import('../src/stores/uiStore');
    expect(useUIStore.getState()).toMatchObject({
      activeRightTab: 'frame',
      inspectorOpen: true,
      gridPanelOpen: false,
    });
    expect(getItem).not.toHaveBeenCalledWith('still.ui-state');
    expect(setItem).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('changes tabs and panels without writing storage or invoking persistence', async () => {
    const { useUIStore } = await import('../src/stores/uiStore');
    const store = useUIStore.getState();
    store.setActiveRightTab('collage');
    store.setInspectorOpen(false);
    store.toggleGridPanel();
    expect(useUIStore.getState()).toMatchObject({
      activeRightTab: 'collage',
      inspectorOpen: false,
      gridPanelOpen: true,
    });
    expect(setItem).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('continues to persist the system-font preference', async () => {
    getItem.mockImplementation((key: string) => (key === 'still.use-system-fonts' ? 'true' : null));
    const { useUIStore } = await import('../src/stores/uiStore');
    expect(useUIStore.getState().systemFontsEnabled).toBe(true);
    useUIStore.getState().setSystemFontsEnabled(false);
    expect(setItem).toHaveBeenCalledExactlyOnceWith('still.use-system-fonts', 'false');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('loads and persists language without restoring workspace state', async () => {
    getItem.mockImplementation((key: string) => (key === 'still.language' ? 'zh' : null));
    const { useUIStore } = await import('../src/stores/uiStore');
    expect(useUIStore.getState()).toMatchObject({
      language: 'zh',
      activeRightTab: 'frame',
      gridPanelOpen: false,
    });
    useUIStore.getState().setLanguage('en');
    expect(setItem).toHaveBeenCalledExactlyOnceWith('still.language', 'en');
    expect(useUIStore.getState().language).toBe('en');
  });

  it('keeps editor single-key shortcuts enabled by default and persists the opt-out', async () => {
    const { useUIStore } = await import('../src/stores/uiStore');
    expect(useUIStore.getState().singleKeyShortcutsEnabled).toBe(true);
    useUIStore.getState().setSingleKeyShortcutsEnabled(false);
    expect(setItem).toHaveBeenCalledExactlyOnceWith('still.shortcuts.single-key-enabled', 'false');
    expect(useUIStore.getState().singleKeyShortcutsEnabled).toBe(false);
    useUIStore.getState().resetSession();
    expect(useUIStore.getState().singleKeyShortcutsEnabled).toBe(false);
    expect(useUIStore.getState()).toMatchObject({ activeRightTab: 'frame', gridPanelOpen: false });
  });

  it('restores the shortcut preference without restoring photo workspace state', async () => {
    getItem.mockImplementation((key: string) =>
      key === 'still.shortcuts.single-key-enabled' ? 'false' : null,
    );
    const { useUIStore } = await import('../src/stores/uiStore');
    expect(useUIStore.getState()).toMatchObject({
      singleKeyShortcutsEnabled: false,
      activeRightTab: 'frame',
      inspectorOpen: true,
      gridPanelOpen: false,
    });
  });

  it('persists window size independently of the session state', async () => {
    getItem.mockImplementation((key: string) =>
      key === 'still.window.size-preset' ? 'compact' : null,
    );
    const { useUIStore } = await import('../src/stores/uiStore');
    expect(useUIStore.getState()).toMatchObject({
      windowSizePreset: 'compact',
      activeRightTab: 'frame',
    });
    useUIStore.getState().setWindowSizePreset('spacious');
    expect(setItem).toHaveBeenCalledExactlyOnceWith('still.window.size-preset', 'spacious');
    useUIStore.getState().resetSession();
    expect(useUIStore.getState().windowSizePreset).toBe('spacious');
  });

  it('shares photo sort within the session and resets it without storing it', async () => {
    const { useUIStore } = await import('../src/stores/uiStore');
    useUIStore.getState().setPhotoSort('name-desc');
    expect(useUIStore.getState().photoSort).toBe('name-desc');
    expect(setItem).not.toHaveBeenCalled();
    useUIStore.getState().resetSession();
    expect(useUIStore.getState().photoSort).toBe('import');
  });
});
