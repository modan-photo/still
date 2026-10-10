import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { windowApi, platform } = vi.hoisted(() => ({
  windowApi: {
    isMinimized: vi.fn(),
    isMaximized: vi.fn(),
    maximize: vi.fn(),
    onResized: vi.fn(),
  },
  platform: vi.fn(() => 'windows'),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => windowApi }));

let values: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  values = new Map([['still.window.remember-maximized', 'true']]);
  setItem = vi.fn((key: string, value: string) => values.set(key, value));
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem });
  platform.mockReturnValue('windows');
  windowApi.isMinimized.mockResolvedValue(false);
  windowApi.isMaximized.mockResolvedValue(false);
  windowApi.maximize.mockResolvedValue(undefined);
  windowApi.onResized.mockResolvedValue(vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('desktop maximization preference', () => {
  it('restores only an opted-in saved maximized state', async () => {
    const { restoreWindowMaximized } =
      await import('../src/services/windowMaximizationPreferences');
    values.set('still.window.maximized', 'true');
    await restoreWindowMaximized();
    expect(windowApi.maximize).toHaveBeenCalledOnce();
    windowApi.maximize.mockClear();
    values.set('still.window.remember-maximized', 'false');
    await restoreWindowMaximized();
    expect(windowApi.maximize).not.toHaveBeenCalled();
  });

  it('saves the last nonminimized state on close and ignores disabled tracking', async () => {
    const { installWindowMaximizationTracking } =
      await import('../src/services/windowMaximizationPreferences');
    let resized: (() => void) | undefined;
    const unlisten = vi.fn();
    windowApi.onResized.mockImplementation((handler: () => void) => {
      resized = handler;
      return Promise.resolve(unlisten);
    });
    windowApi.isMaximized.mockResolvedValue(true);
    const stop = await installWindowMaximizationTracking();
    resized?.();
    await stop();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(values.get('still.window.maximized')).toBe('true');

    windowApi.isMinimized.mockResolvedValue(true);
    const stopMinimized = await installWindowMaximizationTracking();
    await stopMinimized();
    expect(values.get('still.window.maximized')).toBe('true');

    values.set('still.window.remember-maximized', 'false');
    windowApi.isMinimized.mockResolvedValue(false);
    const stopDisabled = await installWindowMaximizationTracking();
    await stopDisabled();
    expect(values.get('still.window.maximized')).toBe('true');
  });
});
