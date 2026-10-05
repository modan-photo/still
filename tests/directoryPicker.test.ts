import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), platform: vi.fn(), open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: mocks.platform }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }));
import { pickImportDirectory } from '../src/services/directoryPicker';
beforeEach(() => vi.resetAllMocks());
it('uses the Android tree picker and preserves cancellation', async () => {
  mocks.platform.mockReturnValue('android');
  mocks.invoke.mockResolvedValueOnce('content://provider/tree/42').mockResolvedValueOnce(null);
  expect(await pickImportDirectory()).toBe('content://provider/tree/42');
  expect(await pickImportDirectory()).toBeNull();
  expect(mocks.open).not.toHaveBeenCalled();
});
it('retains the desktop folder picker', async () => {
  mocks.platform.mockReturnValue('windows');
  mocks.open.mockResolvedValue('D:\\photos');
  expect(await pickImportDirectory()).toBe('D:\\photos');
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('propagates provider failures instead of treating them as cancellation', async () => {
  mocks.platform.mockReturnValue('android');
  mocks.invoke.mockRejectedValue(new Error('permission denied'));
  await expect(pickImportDirectory()).rejects.toThrow('permission denied');
});
