import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { monitor, windowApi, platform } = vi.hoisted(() => ({
  monitor: vi.fn(),
  windowApi: {
    isMaximized: vi.fn(),
    unmaximize: vi.fn(),
    setSize: vi.fn(),
    center: vi.fn(),
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
});
