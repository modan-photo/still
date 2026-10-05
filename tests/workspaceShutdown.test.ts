import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloseRequestedEvent } from '@tauri-apps/api/window';
import { useProjectStore, DEFAULT_COLLAGE_DRAFT } from '../src/stores/projectStore';
import { useUIStore } from '../src/stores/uiStore';
import { useUndoStore } from '../src/stores/undoStore';
import { discardWorkspaceSession, installWorkspaceCloseHandler } from '../src/services/workspaceShutdown';
import { DEFAULT_BORDER } from '../src/types/renderSpec';

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(), platform: vi.fn(), invoke: vi.fn(),
  destroy: vi.fn(), onCloseRequested: vi.fn(), unlisten: vi.fn(),
  invalidateCache: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri, invoke: mocks.invoke }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: mocks.platform }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({
  destroy: mocks.destroy, onCloseRequested: mocks.onCloseRequested,
}) }));
vi.mock('../src/services/tauri/image', () => ({
  invalidateCache: mocks.invalidateCache,
  getCachedImage: vi.fn(), normalizeError: (error: unknown) => error,
}));

let handler: (event: CloseRequestedEvent) => void | Promise<void>;
let setItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.isTauri.mockReturnValue(true);
  mocks.platform.mockReturnValue('windows');
  mocks.destroy.mockReset().mockResolvedValue(undefined);
  mocks.onCloseRequested.mockImplementation(async (callback) => {
    handler = callback;
    return mocks.unlisten;
  });
  setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem, removeItem: vi.fn() });
  useUndoStore.getState().clear();
  useProjectStore.getState().resetSession();
  useUIStore.setState({ activeRightTab: 'frame', inspectorOpen: true, gridPanelOpen: false, theme: 'dark', systemFontsEnabled: true });
});
afterEach(() => {
  useUndoStore.getState().clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function editWorkspace() {
  const project = useProjectStore.getState();
  project.addPhotos([{ path: 'original.jpg', width: 4000, height: 3000, hash: 'fixture', format: 'jpeg', orientation: 1, previewUrl: null, thumbUrl: '' }]);
  project.updateSpec('original.jpg', { border: structuredClone(DEFAULT_BORDER) });
  project.setSelectedIds(['original.jpg']);
  project.updateCollageDraft({ gap: 42, photoIds: ['original.jpg'] });
  useUndoStore.getState().push({ removedPhotos: [...useProjectStore.getState().photos], removedIndices: [0], previousCurrentId: 'original.jpg', previousSelectedIds: ['original.jpg'], previousCollagePhotoIds: ['original.jpg'] });
  useUIStore.setState({ activeRightTab: 'collage', inspectorOpen: false, gridPanelOpen: true });
}

function closeEvent() {
  return { preventDefault: vi.fn() } as unknown as CloseRequestedEvent;
}

function expectCleanSession() {
  expect(useProjectStore.getState()).toMatchObject({ photos: [], currentPhotoId: null, selectedIds: [], collageDraft: DEFAULT_COLLAGE_DRAFT });
  expect(useUndoStore.getState()).toMatchObject({ snapshot: null, expiresAt: null, count: 0, notice: null });
  expect(useUIStore.getState()).toMatchObject({ activeRightTab: 'frame', inspectorOpen: true, gridPanelOpen: false, theme: 'dark', systemFontsEnabled: true });
  expect(setItem).not.toHaveBeenCalled();
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.invalidateCache).not.toHaveBeenCalled();
}

describe('workspace shutdown', () => {
  it('clears session memory and undo timers while preserving preferences and caches', () => {
    editWorkspace();
    discardWorkspaceSession();
    expectCleanSession();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the editor and clears memory before explicitly destroying the window', async () => {
    editWorkspace();
    const stopEditor = vi.fn();
    mocks.destroy.mockImplementation(async () => {
      expect(stopEditor).toHaveBeenCalledOnce();
      expectCleanSession();
    });
    const dispose = await installWorkspaceCloseHandler(stopEditor);
    const event = closeEvent();
    await handler(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    dispose();
  });

  it('forces cleanup and destruction after 500ms if stopping the editor stalls', async () => {
    editWorkspace();
    let finishStopping!: () => void;
    const stopEditor = vi.fn(() => new Promise<void>((resolve) => { finishStopping = resolve; }));
    const dispose = await installWorkspaceCloseHandler(stopEditor);
    const closing = handler(closeEvent());
    await vi.advanceTimersByTimeAsync(499);
    expect(mocks.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expectCleanSession();
    finishStopping();
    await closing;
    expect(mocks.destroy).toHaveBeenCalledOnce();
    dispose();
  });

  it('retries destruction at the deadline if the initial request fails', async () => {
    editWorkspace();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.destroy.mockRejectedValueOnce(new Error('temporary failure'));
    const dispose = await installWorkspaceCloseHandler(vi.fn());
    await handler(closeEvent());
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.destroy).toHaveBeenCalledTimes(2);
    expectCleanSession();
    dispose();
  });

  it('deduplicates repeated close requests while cleanup is pending', async () => {
    let finishStopping!: () => void;
    const stopEditor = vi.fn(() => new Promise<void>((resolve) => { finishStopping = resolve; }));
    const dispose = await installWorkspaceCloseHandler(stopEditor);
    const closing = handler(closeEvent());
    const secondEvent = closeEvent();
    await handler(secondEvent);
    expect(secondEvent.preventDefault).toHaveBeenCalledOnce();
    expect(stopEditor).toHaveBeenCalledOnce();
    finishStopping();
    await closing;
    expect(mocks.destroy).toHaveBeenCalledOnce();
    dispose();
  });

  it('still clears memory and destroys the window when editor teardown throws', async () => {
    editWorkspace();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dispose = await installWorkspaceCloseHandler(() => { throw new Error('teardown failed'); });
    await handler(closeEvent());
    expectCleanSession();
    expect(mocks.destroy).toHaveBeenCalledOnce();
    dispose();
  });

  it('listener disposal preserves the workspace for hot reload', async () => {
    editWorkspace();
    const dispose = await installWorkspaceCloseHandler(vi.fn());
    dispose();
    await handler(closeEvent());
    expect(useProjectStore.getState().photos).toHaveLength(1);
    expect(useUndoStore.getState().snapshot).not.toBeNull();
    expect(useUIStore.getState().activeRightTab).toBe('collage');
    expect(mocks.unlisten).toHaveBeenCalledOnce();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('does not register desktop cleanup in browser or mobile environments', async () => {
    editWorkspace();
    mocks.isTauri.mockReturnValue(false);
    await installWorkspaceCloseHandler(vi.fn());
    mocks.isTauri.mockReturnValue(true);
    for (const mobilePlatform of ['android', 'ios']) {
      mocks.platform.mockReturnValue(mobilePlatform);
      await installWorkspaceCloseHandler(vi.fn());
    }
    expect(mocks.onCloseRequested).not.toHaveBeenCalled();
    expect(useProjectStore.getState().photos).toHaveLength(1);
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('keeps Android edits and selections when the app moves to the background', async () => {
    editWorkspace();
    mocks.platform.mockReturnValue('android');
    const documentEvents = new EventTarget();
    const windowEvents = new EventTarget();
    vi.stubGlobal('document', documentEvents);
    vi.stubGlobal('window', windowEvents);
    const stopEditor = vi.fn();
    const dispose = await installWorkspaceCloseHandler(stopEditor);
    const edited = useProjectStore.getState().photos[0].spec;

    documentEvents.dispatchEvent(new Event('visibilitychange'));
    windowEvents.dispatchEvent(new Event('pagehide'));
    documentEvents.dispatchEvent(new Event('pause'));
    documentEvents.dispatchEvent(new Event('resume'));
    expect(useProjectStore.getState().photos[0].spec).toBe(edited);
    expect(useProjectStore.getState().selectedIds).toEqual(['original.jpg']);
    expect(useUndoStore.getState().snapshot).not.toBeNull();
    expect(stopEditor).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    dispose();
  });
});
