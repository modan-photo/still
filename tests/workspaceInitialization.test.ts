import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, isTauri, platform } = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(), platform: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform }));

let entries: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;
let removeItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  invoke.mockReset().mockResolvedValue(undefined);
  isTauri.mockReset().mockReturnValue(true);
  platform.mockReset().mockReturnValue('windows');
  entries = new Map();
  setItem = vi.fn((key: string, value: string) => entries.set(key, value));
  removeItem = vi.fn((key: string) => entries.delete(key));
  vi.stubGlobal('localStorage', {
    get length() { return entries.size; },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem,
    removeItem,
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('workspace startup migration', () => {
  it('cancels orphaned Android tasks before initializing a recreated WebView', async () => {
    platform.mockReturnValue('android');
    const { initializeWorkspace } = await import('../src/services/workspaceInitialization');
    await initializeWorkspace();
    expect(invoke.mock.calls).toEqual([
      ['task_cancel_all'], ['cleanup_legacy_session_files'], ['migrate_preferences_if_needed'],
    ]);
  });

  it('still starts Android after orphan cancellation fails', async () => {
    platform.mockReturnValue('android');
    invoke.mockImplementation((command: string) => command === 'task_cancel_all'
      ? Promise.reject(new Error('registry unavailable'))
      : Promise.resolve());
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { initializeWorkspace } = await import('../src/services/workspaceInitialization');
    await initializeWorkspace();
    expect(invoke.mock.calls).toEqual([
      ['task_cancel_all'], ['cleanup_legacy_session_files'], ['migrate_preferences_if_needed'],
    ]);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('still starts when the OS plugin cannot identify the platform', async () => {
    platform.mockImplementation(() => { throw new Error('OS plugin unavailable'); });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { initializeWorkspace } = await import('../src/services/workspaceInitialization');
    await initializeWorkspace();
    expect(invoke.mock.calls).toEqual([
      ['cleanup_legacy_session_files'], ['migrate_preferences_if_needed'],
    ]);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('runs cleanup and migration in order once per window', async () => {
    const { initializeWorkspace } = await import('../src/services/workspaceInitialization');
    const first = initializeWorkspace();
    expect(initializeWorkspace()).toBe(first);
    await first;
    await initializeWorkspace();
    expect(invoke.mock.calls).toEqual([
      ['cleanup_legacy_session_files'], ['migrate_preferences_if_needed'],
    ]);
  });

  it('waits for cleanup and migration before startup resolves', async () => {
    let completeCleanup!: () => void;
    let completeMigration!: () => void;
    invoke.mockImplementation((command: string) => new Promise<void>((resolve) => {
      if (command === 'cleanup_legacy_session_files') completeCleanup = resolve;
      else completeMigration = resolve;
    }));
    const { initializeWorkspace } = await import('../src/services/workspaceInitialization');
    let initialized = false;
    const pending = initializeWorkspace().then(() => { initialized = true; });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(initialized).toBe(false);
    completeCleanup();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(initialized).toBe(false);
    completeMigration();
    await pending;
    expect(initialized).toBe(true);
  });

  it('removes legacy UI fields while preserving preferences and resource storage', async () => {
    entries.set('still.ui-state', JSON.stringify({
      activeRightTab: 'collage', lastFramePresetId: 'old', lastWatermarkPresetId: 'old',
      lastUsedSpec: {}, lastAppliedSpec: {}, photoList: ['photo.jpg'], lastImportPath: 'imports',
      rightPanelCollapsed: true, gridPanelOpen: true, isCollageMode: true,
      photos: [{}], renderSpecs: [{}], collageDraft: {}, undoStack: [],
      currentPhotoId: 'old', selectedId: 'old', selectedIds: ['old'], inspectorOpen: false,
      theme: 'dark', language: 'en', window: { width: 1100 }, futurePreference: true,
    }));
    const resourceEntries = [
      ['still-theme', 'dark'],
      ['still.use-system-fonts', 'true'],
      ['still.export.recent-directories', '["exports"]'],
      ['still.frame-presets', 'user frame fixture'],
      ['still.watermark-presets', 'user watermark fixture'],
    ] as const;
    for (const [key, value] of resourceEntries) entries.set(key, value);
    entries.set('still.crop.v1:first', 'legacy transform');
    entries.set('still.crop.v1:second', 'legacy transform');
    const { initializeWorkspace } = await import('../src/services/workspaceInitialization');
    await initializeWorkspace();
    expect(JSON.parse(entries.get('still.ui-state')!)).toEqual({
      version: 2, theme: 'dark', language: 'en', window: { width: 1100 }, futurePreference: true,
    });
    for (const [key, value] of resourceEntries) expect(entries.get(key)).toBe(value);
    expect(removeItem.mock.calls).toEqual([['still.crop.v1:first'], ['still.crop.v1:second']]);
  });

  it('is idempotent after migration and still cleans old fields in version two', async () => {
    entries.set('still.ui-state', JSON.stringify({ version: 2, lastFramePresetId: 'old', theme: 'dark' }));
    const { migratePreferencesIfNeeded } = await import('../src/services/workspaceInitialization');
    await migratePreferencesIfNeeded();
    await migratePreferencesIfNeeded();
    expect(JSON.parse(entries.get('still.ui-state')!)).toEqual({ version: 2, theme: 'dark' });
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('recovers malformed legacy UI state', async () => {
    const { migratePreferencesIfNeeded } = await import('../src/services/workspaceInitialization');
    for (const stored of ['broken json', 'null', '[]', '"invalid"']) {
      entries.set('still.ui-state', stored);
      await migratePreferencesIfNeeded();
      expect(JSON.parse(entries.get('still.ui-state')!)).toEqual({ version: 2 });
    }
  });

  it('does not create absent browser state or call native commands in browser mode', async () => {
    isTauri.mockReturnValue(false);
    const { initializeWorkspace } = await import('../src/services/workspaceInitialization');
    await initializeWorkspace();
    expect(invoke).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('continues migration and startup after command failures', async () => {
    invoke.mockRejectedValue(new Error('native migration failed'));
    entries.set('still.crop.v1:first', 'legacy');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { initializeWorkspace } = await import('../src/services/workspaceInitialization');
    await expect(initializeWorkspace()).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledTimes(2);
    expect(entries.has('still.crop.v1:first')).toBe(false);
  });

  it('continues photo-record cleanup when UI-state migration cannot write', async () => {
    entries.set('still.ui-state', '{"activeRightTab":"collage"}');
    entries.set('still.crop.v1:first', 'legacy');
    setItem.mockImplementation(() => { throw new Error('storage denied'); });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { initializeWorkspace } = await import('../src/services/workspaceInitialization');
    await expect(initializeWorkspace()).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledTimes(1);
    expect(entries.has('still.crop.v1:first')).toBe(false);
  });
});
