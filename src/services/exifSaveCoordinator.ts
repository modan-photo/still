const pendingExifSaves = new Set<Promise<unknown>>();

export function trackExifSave<T>(save: Promise<T>): Promise<T> {
  pendingExifSaves.add(save);
  void save.finally(() => pendingExifSaves.delete(save)).catch(() => undefined);
  return save;
}

export function hasPendingExifSaves(): boolean {
  return pendingExifSaves.size > 0;
}

export async function waitForPendingExifSaves(): Promise<void> {
  while (pendingExifSaves.size > 0) {
    await Promise.allSettled([...pendingExifSaves]);
  }
}
