import { useProjectStore } from '../stores/projectStore';
import type { BatchExportReport, PhotoExportRequest } from '../types/export';

/** Match export snapshots to workspace identities, including repeated source paths. */
export function markExportedPhotosClean(request: PhotoExportRequest, report: BatchExportReport) {
  const requested = new Map<string, number>();
  const succeeded = new Map<string, number>();
  for (const spec of request.specs) {
    const path = spec.source.path;
    requested.set(path, (requested.get(path) ?? 0) + 1);
  }
  for (const success of report.successes) {
    succeeded.set(success.sourcePath, (succeeded.get(success.sourcePath) ?? 0) + 1);
  }
  request.specs.forEach((spec, index) => {
    const path = spec.source.path;
    // Reports have no per-item ID. A partially successful repeated path is ambiguous.
    if (succeeded.get(path) !== requested.get(path)) return;
    const project = useProjectStore.getState();
    const id = request.photoIds?.[index];
    const photo = id !== undefined
      ? project.photos.find((entry) => entry.id === id && entry.path === path)
      : project.photos.find((entry) => entry.path === path && JSON.stringify(entry.spec) === JSON.stringify(spec));
    if (photo) project.markClean(photo.id, spec);
  });
}
