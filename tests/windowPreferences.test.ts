import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { monitor, windowApi, platform } = vi.hoisted(() => ({
  monitor: vi.fn(),
  windowApi: {
    isMaximized: vi.fn(),
    unmaximize: vi.fn(),
    setSize: vi.fn(),
    center: vi.fn(),
    innerSize: vi.fn(),
    scaleFactor: vi.fn(),
    onResized: vi.fn(),
  },
  platform: vi.fn(() => 'windows'),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform }));
vi.mock('@tauri-apps/api/window', () => ({
  currentMonitor: monitor,
  getCurrentWindow: () => windowApi,
}));

beforeEach(() => {
  vi.clearAllMocks();
  platform.mockReturnValue('windows');
  monitor.mockResolvedValue(null);
  windowApi.isMaximized.mockResolvedValue(false);
  windowApi.unmaximize.mockResolvedValue(undefined);
  windowApi.setSize.mockResolvedValue(undefined);
  windowApi.center.mockResolvedValue(undefined);
  windowApi.innerSize.mockResolvedValue({ width: 1200, height: 900 });
  windowApi.scaleFactor.mockResolvedValue(1);
  windowApi.onResized.mockResolvedValue(vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('desktop window size preference', () => {
  it('fits logical presets inside a high-DPI monitor work area', async () => {
    const { fitWindowSize } = await import('../src/services/windowPreferences');
    expect(fitWindowSize('spacious', { width: 1920, height: 1080, scaleFactor: 1.5 })).toEqual({
      width: 1248,
      height: 688,
    });
  });

  it('restores only an explicitly saved preset and unmaximizes before resizing', async () => {
    const { restoreWindowSizePreset } = await import('../src/services/windowPreferences');
    const getItem = vi.fn(() => null as string | null);
    vi.stubGlobal('localStorage', { getItem });
    await restoreWindowSizePreset();
    expect(windowApi.setSize).not.toHaveBeenCalled();

    getItem.mockReturnValue('compact');
    windowApi.isMaximized.mockResolvedValue(true);
    await restoreWindowSizePreset();
    expect(windowApi.unmaximize).toHaveBeenCalledOnce();
    expect(windowApi.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 900, height: 620 }),
    );
    expect(windowApi.center).toHaveBeenCalledOnce();
  });

  it('does not apply desktop window settings on Android', async () => {
    const { applyWindowSizePreset } = await import('../src/services/windowPreferences');
    platform.mockReturnValue('android');
    await applyWindowSizePreset('spacious');
    expect(monitor).not.toHaveBeenCalled();
    expect(windowApi.setSize).not.toHaveBeenCalled();
  });

  it('restores a remembered logical size within the current work area', async () => {
    const { restoreWindowSizePreset } = await import('../src/services/windowPreferences');
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key === 'still.window.size-preset'
          ? 'custom'
          : key === 'still.window.custom-size'
            ? JSON.stringify({ width: 1600, height: 1000 })
            : null,
    });
    monitor.mockResolvedValue({
      workArea: { size: { width: 1920, height: 1080 } },
      scaleFactor: 1.5,
    });
    await restoreWindowSizePreset();
    expect(windowApi.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1248, height: 688 }),
    );
    monitor.mockResolvedValue(null);
    windowApi.setSize.mockClear();
    await restoreWindowSizePreset();
    expect(windowApi.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1100, height: 760 }),
    );
  });

  it('captures the current logical size and flushes a pending resize on teardown', async () => {
    const { captureCustomWindowSize, installWindowSizeTracking } =
      await import('../src/services/windowPreferences');
    const values = new Map<string, string>([['still.window.size-preset', 'custom']]);
    const setItem = vi.fn((key: string, value: string) => values.set(key, value));
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem });
    windowApi.innerSize.mockResolvedValue({ width: 2400, height: 1500 });
    windowApi.scaleFactor.mockResolvedValue(1.5);
    await captureCustomWindowSize();
    expect(values.get('still.window.custom-size')).toBe(
      JSON.stringify({ width: 1600, height: 1000 }),
    );

    let resized: (() => void) | undefined;
    const unlisten = vi.fn();
    windowApi.onResized.mockImplementation((handler: () => void) => {
      resized = handler;
      return Promise.resolve(unlisten);
    });
    const stop = await installWindowSizeTracking();
    windowApi.innerSize.mockResolvedValue({ width: 1500, height: 900 });
    resized?.();
    await stop();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(values.get('still.window.custom-size')).toBe(
      JSON.stringify({ width: 1000, height: 600 }),
    );
  });

  it('ignores invalid saved custom dimensions', async () => {
    const { readCustomWindowSize } = await import('../src/services/windowPreferences');
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ width: 100000, height: 700 }),
    });
    expect(readCustomWindowSize()).toBeNull();
  });

  it('does not save maximized dimensions as a remembered size', async () => {
    const { installWindowSizeTracking } = await import('../src/services/windowPreferences');
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', {
      getItem: () => 'custom',
      setItem,
    });
    windowApi.isMaximized.mockResolvedValue(true);
    let resized: (() => void) | undefined;
    windowApi.onResized.mockImplementation((handler: () => void) => {
      resized = handler;
      return Promise.resolve(vi.fn());
    });
    const stop = await installWindowSizeTracking();
    resized?.();
    await stop();
    expect(setItem).not.toHaveBeenCalled();
    expect(windowApi.innerSize).not.toHaveBeenCalled();
  });
});
