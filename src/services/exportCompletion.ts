import { useProjectStore } from '../stores/projectStore';
import type { BatchExportReport, PhotoExportRequest } from '../types/export';

/** Item identity is independent of source path and of the task running it. */
export function markExportedPhotosClean(request: PhotoExportRequest, report: BatchExportReport) {
  const submitted = new Map(request.items.map((item) => [item.itemId, item]));
  for (const result of report.results) {
    if (result.status !== 'success') continue;
    const item = submitted.get(result.itemId);
    if (!item || item.spec.source.path !== result.sourcePath) continue;
    const project = useProjectStore.getState();
    const photo = project.photos.find(
      (entry) => entry.id === item.photoId && entry.path === result.sourcePath,
    );
    if (photo) project.markClean(photo.id, item.spec);
  }
}

/** Retry original snapshots, retaining sequence numbers; re-plan paths safely. */
export function createExportRetry(
  request: PhotoExportRequest,
  report: BatchExportReport,
): PhotoExportRequest | null {
  const retryIds = new Set(
    report.results
      .filter((item) => item.status === 'failed' || item.status === 'cancelled')
      .map((item) => item.itemId),
  );
  const project = useProjectStore.getState();
  const items = request.items
    .filter(
      (item) =>
        retryIds.has(item.itemId) &&
        project.photos.some(
          (photo) => photo.id === item.photoId && photo.path === item.spec.source.path,
        ),
    )
    .map((item) => ({ ...structuredClone(item), itemId: crypto.randomUUID() }));
  if (items.length === 0) return null;
  return {
    exportMode: 'photos',
    items,
    options: { ...structuredClone(request.options), conflict: 'rename' },
  };
}
