import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '../src/stores/projectStore';
import { createExportRetry, markExportedPhotosClean } from '../src/services/exportCompletion';
import type { BatchExportReport, ExportItemResult, PhotoExportRequest } from '../src/types/export';

const source = {
  path: 'photo.jpg',
  width: 100,
  height: 100,
  hash: '',
  format: 'jpeg',
  orientation: 1,
  previewUrl: null,
  thumbUrl: '',
};
const options: PhotoExportRequest['options'] = {
  format: 'jpeg',
  quality: 92,
  outputDirectory: 'exports',
  size: {
    mode: 'original',
    longEdge: null,
    percent: null,
    width: null,
    height: null,
    lockAspect: true,
  },
  naming: {
    mode: 'prefixSequence',
    suffix: '_edited',
    prefix: 'still_',
    template: '',
    startNumber: 3,
  },
  conflict: 'overwrite',
  preserveExif: true,
  preserveIcc: true,
};
beforeEach(() => useProjectStore.getState().resetSession());

function setup(): PhotoExportRequest {
  const project = useProjectStore.getState();
  project.addPhotos([source]);
  project.updateSpec(source.path, { rotation: { angle: 90, flipH: false, flipV: false } });
  project.addPhotos([source]);
  const secondId = useProjectStore.getState().photos[1].id;
  project.updateSpec(secondId, { rotation: { angle: 180, flipH: false, flipV: false } });
  return {
    exportMode: 'photos',
    options: structuredClone(options),
    items: useProjectStore.getState().photos.map((photo, sequenceIndex) => ({
      itemId: `item-${sequenceIndex}`,
      photoId: photo.id,
      sequenceIndex,
      spec: structuredClone(photo.spec),
    })),
  };
}
function report(
  request: PhotoExportRequest,
  statuses: ExportItemResult['status'][],
): BatchExportReport {
  const results = statuses.map((status, index): ExportItemResult => ({
    itemId: request.items[index].itemId,
    sourcePath: source.path,
    outputPath: `exports/${index}.jpg`,
    status,
    code: status === 'failed' ? 'io_error' : status === 'cancelled' ? 'cancelled' : null,
    message: status === 'failed' ? 'disk full' : null,
  }));
  const count = (status: ExportItemResult['status']) =>
    results.filter((item) => item.status === status).length;
  return {
    succeeded: count('success'),
    failed: count('failed'),
    skipped: count('skipped'),
    cancelled: count('cancelled'),
    cancellationRequested: statuses.includes('cancelled'),
    outputDirectory: 'exports',
    results,
  };
}

describe('per-item export completion', () => {
  it('clears only the successful instance of a repeated source path', () => {
    const request = setup();
    markExportedPhotosClean(request, report(request, ['failed', 'success']));
    expect(useProjectStore.getState().photos.map((photo) => photo.dirty)).toEqual([true, false]);
  });
  it('matches out-of-order results by item ID', () => {
    const request = setup();
    const result = report(request, ['success', 'failed']);
    result.results.reverse();
    markExportedPhotosClean(request, result);
    expect(useProjectStore.getState().photos.map((photo) => photo.dirty)).toEqual([false, true]);
  });
  it('clears both successful instances', () => {
    const request = setup();
    markExportedPhotosClean(request, report(request, ['success', 'success']));
    expect(useProjectStore.getState().photos.every((photo) => !photo.dirty)).toBe(true);
  });
  it('retains edits made while exporting', () => {
    const request = setup();
    useProjectStore.getState().updateSpec(request.items[1].photoId, {
      rotation: { angle: 270, flipH: false, flipV: false },
    });
    markExportedPhotosClean(request, report(request, ['success', 'success']));
    expect(useProjectStore.getState().photos.map((photo) => photo.dirty)).toEqual([false, true]);
  });
  it('keeps successful items clean when their siblings are cancelled', () => {
    const request = setup();
    markExportedPhotosClean(request, report(request, ['success', 'cancelled']));
    expect(useProjectStore.getState().photos.map((photo) => photo.dirty)).toEqual([false, true]);
  });
  it('never clears skipped items', () => {
    const request = setup();
    markExportedPhotosClean(request, report(request, ['skipped', 'skipped']));
    expect(useProjectStore.getState().photos.every((photo) => photo.dirty)).toBe(true);
  });
  it('rejects unknown item IDs or mismatched source paths', () => {
    const request = setup();
    const result = report(request, ['success', 'success']);
    result.results[0].itemId = 'other';
    result.results[1].sourcePath = 'other.jpg';
    markExportedPhotosClean(request, result);
    expect(useProjectStore.getState().photos.every((photo) => photo.dirty)).toBe(true);
  });
  it('does not clean another instance after the exported photo is removed', () => {
    const request = setup();
    useProjectStore.getState().removePhotos([request.items[1].photoId]);
    markExportedPhotosClean(request, report(request, ['failed', 'success']));
    expect(useProjectStore.getState().photos[0].dirty).toBe(true);
  });
});

describe('retry unfinished exports', () => {
  it('keeps the submitted edits, source, and original sequence index, with a new ID', () => {
    const request = setup();
    const original = structuredClone(request);
    useProjectStore.getState().updateSpec(request.items[1].photoId, {
      rotation: { angle: 270, flipH: false, flipV: false },
    });
    const retry = createExportRetry(request, report(request, ['success', 'failed']))!;
    expect(retry.items).toHaveLength(1);
    expect(retry.items[0].itemId).not.toBe(request.items[1].itemId);
    expect(retry.items[0].photoId).toBe(request.items[1].photoId);
    expect(retry.items[0].sequenceIndex).toBe(1);
    expect(retry.items[0].spec).toEqual(request.items[1].spec);
    expect(retry.options.naming).toEqual(request.options.naming);
    expect(retry.options.conflict).toBe('rename');
    expect(request).toEqual(original);
  });
  it('includes cancelled items but excludes successes and skips', () => {
    const request = setup();
    expect(
      createExportRetry(request, report(request, ['skipped', 'cancelled']))!.items.map(
        (item) => item.photoId,
      ),
    ).toEqual([request.items[1].photoId]);
    expect(createExportRetry(request, report(request, ['success', 'skipped']))).toBeNull();
  });
  it('does not retry a removed or reimported identity', () => {
    const request = setup();
    useProjectStore.getState().removePhotos([request.items[1].photoId]);
    useProjectStore.getState().addPhotos([source]);
    expect(createExportRetry(request, report(request, ['success', 'failed']))).toBeNull();
  });
});
