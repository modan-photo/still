import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRightPanelTabId, RIGHT_PANEL_TABS } from '../src/layout/rightPanelTabs';
import { loadUIState, saveUIState } from '../src/services/tauri/uiState';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));

const storageKey = 'still.ui-state';
let entries: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  entries = new Map();
  setItem = vi.fn((key: string, value: string) => entries.set(key, value));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('transform tab persistence', () => {
  it('retains earlier tab aliases and falls back for malformed or unknown persisted state', async () => {
    for (const [stored, expected] of [
      [JSON.stringify({ activeRightTab: 'border' }), 'frame'],
      [JSON.stringify({ activeRightTab: 'watermark' }), 'stamp'],
      [JSON.stringify({ activeRightTab: 'unknown' }), 'frame'],
      ['broken json', 'frame'],
      ['null', 'frame'],
    ]) {
      entries.set(storageKey, stored);
      expect((await loadUIState()).activeRightTab).toBe(expected);
    }
  });
  it('migrates the legacy tab on first load and preserves the frame preset', async () => {
    entries.set(storageKey, JSON.stringify({ activeRightTab: 'crop', lastFramePresetId: 'user-example' }));
    const expected = { activeRightTab: 'transform', lastFramePresetId: 'user-example' };
    expect(await loadUIState()).toEqual(expected);
    expect(JSON.parse(entries.get(storageKey)!)).toEqual(expected);
    expect(await loadUIState()).toEqual(expected);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('keeps the migrated tab when saving a partial preset update', async () => {
    entries.set(storageKey, JSON.stringify({ activeRightTab: 'crop' }));
    await saveUIState({ lastFramePresetId: 'new-preset' });
    expect(JSON.parse(entries.get(storageKey)!)).toEqual({
      activeRightTab: 'transform', lastFramePresetId: 'new-preset',
    });
  });

  it('still restores the migrated tab when storage cannot write it back', async () => {
    entries.set(storageKey, JSON.stringify({ activeRightTab: 'crop' }));
    setItem.mockImplementation(() => { throw new Error('Storage unavailable'); });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await loadUIState()).toEqual({ activeRightTab: 'transform' });
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });

  it('preserves other tabs and accepts the new ID without another migration', async () => {
    for (const tab of RIGHT_PANEL_TABS) {
      entries.set(storageKey, JSON.stringify({ activeRightTab: tab.id }));
      expect(await loadUIState()).toEqual({ activeRightTab: tab.id });
    }
    expect(setItem).not.toHaveBeenCalled();
    expect(isRightPanelTabId('crop')).toBe(false);
    expect(isRightPanelTabId('transform')).toBe(true);
    expect(RIGHT_PANEL_TABS.map(tab => tab.id)).toEqual(['frame', 'transform', 'stamp', 'exif', 'collage']);
  });
});
