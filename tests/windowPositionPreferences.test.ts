import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { currentMonitor, primaryMonitor, availableMonitors, windowApi, platform } = vi.hoisted(
  () => ({
    currentMonitor: vi.fn(),
    primaryMonitor: vi.fn(),
    availableMonitors: vi.fn(),
    windowApi: {
      isMaximized: vi.fn(),
      isMinimized: vi.fn(),
      outerPosition: vi.fn(),
      outerSize: vi.fn(),
      setPosition: vi.fn(),
      onMoved: vi.fn(),
    },
    platform: vi.fn(() => 'windows'),
  }),
);
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform }));
vi.mock('@tauri-apps/api/window', () => ({
  currentMonitor,
  primaryMonitor,
  availableMonitors,
  getCurrentWindow: () => windowApi,
}));

const monitor = {
  name: 'Display A',
  position: { x: -1600, y: 0 },
  workArea: { position: { x: -1600, y: 40 }, size: { width: 1600, height: 900 } },
  scaleFactor: 1.25,
};

let values: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  values = new Map([['still.window.remember-position', 'true']]);
  setItem = vi.fn((key: string, value: string) => values.set(key, value));
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem });
  platform.mockReturnValue('windows');
  currentMonitor.mockResolvedValue(monitor);
  primaryMonitor.mockResolvedValue(monitor);
  availableMonitors.mockResolvedValue([monitor]);
  windowApi.isMaximized.mockResolvedValue(false);
  windowApi.isMinimized.mockResolvedValue(false);
  windowApi.outerPosition.mockResolvedValue({ x: -1500, y: 140 });
  windowApi.outerSize.mockResolvedValue({ width: 800, height: 600 });
  windowApi.setPosition.mockResolvedValue(undefined);
  windowApi.onMoved.mockResolvedValue(vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('desktop window position preference', () => {
  it('captures a logical offset from the current monitor work area', async () => {
    const { captureWindowPosition } = await import('../src/services/windowPositionPreferences');
    await captureWindowPosition();
    expect(JSON.parse(values.get('still.window.position') ?? '{}')).toEqual({
      monitorName: 'Display A',
      monitorX: -1600,
      monitorY: 0,
      x: 80,
      y: 80,
    });
  });

  it('clamps a restored position to the visible work area', async () => {
    const { fitWindowPosition, restoreWindowPosition } =
      await import('../src/services/windowPositionPreferences');
    const saved = { monitorName: 'Display A', monitorX: -1600, monitorY: 0, x: 1000, y: 500 };
    expect(
      fitWindowPosition(
        saved,
        { x: -1600, y: 40, width: 1600, height: 900, scaleFactor: 1.25 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ x: -800, y: 340 });
    values.set('still.window.position', JSON.stringify(saved));
    await restoreWindowPosition();
    expect(windowApi.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: -800, y: 340 }),
    );
  });

  it('falls back to an available monitor when the saved monitor is missing', async () => {
    const { restoreWindowPosition } = await import('../src/services/windowPositionPreferences');
    values.set(
      'still.window.position',
      JSON.stringify({
        monitorName: 'Disconnected',
        monitorX: 3000,
        monitorY: 0,
        x: 100,
        y: 100,
      }),
    );
    await restoreWindowPosition();
    expect(windowApi.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: -1475, y: 165 }),
    );
  });

  it('flushes a pending move and skips maximized or disabled tracking', async () => {
    const { installWindowPositionTracking } =
      await import('../src/services/windowPositionPreferences');
    let moved: (() => void) | undefined;
    const unlisten = vi.fn();
    windowApi.onMoved.mockImplementation((handler: () => void) => {
      moved = handler;
      return Promise.resolve(unlisten);
    });
    const stop = await installWindowPositionTracking();
    moved?.();
    await stop();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledWith('still.window.position', expect.any(String));

    setItem.mockClear();
    windowApi.isMaximized.mockResolvedValue(true);
    const stopMaximized = await installWindowPositionTracking();
    moved?.();
    await stopMaximized();
    expect(setItem).not.toHaveBeenCalled();

    windowApi.isMaximized.mockResolvedValue(false);
    values.set('still.window.remember-position', 'false');
    const stopDisabled = await installWindowPositionTracking();
    moved?.();
    await stopDisabled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
