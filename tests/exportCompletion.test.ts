import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '../src/stores/projectStore';
import { markExportedPhotosClean } from '../src/services/exportCompletion';
import type { BatchExportReport, PhotoExportRequest } from '../src/types/export';

const source = { path: 'photo.jpg', width: 100, height: 100, hash: '', format: 'jpeg', orientation: 1, previewUrl: null, thumbUrl: '' };
const options: PhotoExportRequest['options'] = {
  format: 'jpeg', quality: 92, outputDirectory: 'exports',
  size: { mode: 'original', longEdge: null, percent: null, width: null, height: null, lockAspect: true },
  naming: { mode: 'originalSuffix', suffix: '_edited', prefix: '', template: '', startNumber: 1 },
  conflict: 'rename', preserveExif: true, preserveIcc: true,
};
beforeEach(() => useProjectStore.getState().resetSession());

function setup() {
  const project = useProjectStore.getState();
  project.addPhotos([source]);
  project.updateSpec(source.path, { rotation: { angle: 90, flipH: false, flipV: false } });
  project.addPhotos([source]);
  const secondId = useProjectStore.getState().photos[1].id;
  project.updateSpec(secondId, { rotation: { angle: 180, flipH: false, flipV: false } });
  return useProjectStore.getState().photos;
}
function report(count: number): BatchExportReport {
  return { succeeded: count, failed: 0, skipped: 0, outputDirectory: 'exports', failures: [],
    successes: Array.from({ length: count }, (_, index) => ({ sourcePath: source.path, outputPath: `exports/${index}.jpg` })) };
}

describe('export completion with repeated source paths', () => {
  it('clears only the exported identity when exporting the second photo', () => {
    const photos = setup();
    markExportedPhotosClean({ exportMode: 'photos', specs: [structuredClone(photos[1].spec)], photoIds: [photos[1].id], options }, report(1));
    expect(useProjectStore.getState().photos.map((photo) => photo.dirty)).toEqual([true, false]);
  });

  it('clears both identities after both exports succeed', () => {
    const photos = setup();
    markExportedPhotosClean({ exportMode: 'photos', specs: photos.map((photo) => structuredClone(photo.spec)), photoIds: photos.map((photo) => photo.id), options }, report(2));
    expect(useProjectStore.getState().photos.map((photo) => photo.dirty)).toEqual([false, false]);
  });

  it('retains edits made while export was running', () => {
    const photos = setup();
    const request: PhotoExportRequest = { exportMode: 'photos', specs: [structuredClone(photos[1].spec)], photoIds: [photos[1].id], options };
    useProjectStore.getState().updateSpec(photos[1].id, { rotation: { angle: 270, flipH: false, flipV: false } });
    markExportedPhotosClean(request, report(1));
    expect(useProjectStore.getState().photos[1].dirty).toBe(true);
  });

  it('retains dirty state when a repeated source path succeeds only partially', () => {
    const photos = setup();
    markExportedPhotosClean({ exportMode: 'photos', specs: photos.map((photo) => structuredClone(photo.spec)), photoIds: photos.map((photo) => photo.id), options }, report(1));
    expect(useProjectStore.getState().photos.every((photo) => photo.dirty)).toBe(true);
  });

  it('supports earlier requests without photo IDs by comparing the full snapshot', () => {
    const photos = setup();
    markExportedPhotosClean({ exportMode: 'photos', specs: [structuredClone(photos[1].spec)], options }, report(1));
    expect(useProjectStore.getState().photos.map((photo) => photo.dirty)).toEqual([true, false]);
  });
});
