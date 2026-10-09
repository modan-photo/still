import { beforeEach, describe, expect, it } from 'vitest';
import { useEditHistoryStore } from '../src/stores/editHistoryStore';
import { useProjectStore } from '../src/stores/projectStore';
import { DEFAULT_BORDER, DEFAULT_WATERMARK } from '../src/types/renderSpec';

const image = (path: string) => ({
  path,
  hash: path,
  width: 4000,
  height: 3000,
  format: 'jpeg',
  orientation: 1,
  previewUrl: null,
  thumbUrl: `${path}.webp`,
});

beforeEach(() => {
  useProjectStore.getState().resetSession();
  useEditHistoryStore.getState().clear();
});

describe('session edit history', () => {
  it('undoes and redoes only edit parameters, preserving the photo source', () => {
    const project = useProjectStore.getState();
    project.addPhotos([image('a.jpg')]);
    project.updateSpec('a.jpg', { rotation: { angle: 90, flipH: true, flipV: false } });
    project.updateSpec('a.jpg', { border: { ...DEFAULT_BORDER, width: 12 } });
    expect(useEditHistoryStore.getState().undoStack).toHaveLength(2);

    project.undoEdit();
    expect(useProjectStore.getState().photos[0].spec.border).toBeUndefined();
    expect(useProjectStore.getState().photos[0].spec.rotation?.angle).toBe(90);
    project.undoEdit();
    expect(useProjectStore.getState().photos[0].dirty).toBe(false);
    expect(useProjectStore.getState().photos[0].spec.source.path).toBe('a.jpg');
    project.redoEdit();
    expect(useProjectStore.getState().photos[0].spec.rotation?.flipH).toBe(true);
  });

  it('records a batch copy as one step and leaves each target source intact', () => {
    const project = useProjectStore.getState();
    project.addPhotos([image('source.jpg'), image('target.jpg')]);
    project.updateSpec('source.jpg', { border: { ...DEFAULT_BORDER, width: 20 } });
    useEditHistoryStore.getState().clear();
    project.applySpecToPhotos('source.jpg', ['target.jpg']);
    expect(useEditHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useProjectStore.getState().photos[1].spec.source.path).toBe('target.jpg');
    project.undoEdit();
    expect(useProjectStore.getState().photos[1].spec.border).toBeUndefined();
    expect(useProjectStore.getState().photos[1].dirty).toBe(false);
    project.redoEdit();
    expect(useProjectStore.getState().photos[1].spec.border?.width).toBe(20);
  });

  it('uses the latest exported spec when deciding dirty after history replay', () => {
    const project = useProjectStore.getState();
    project.addPhotos([image('a.jpg')]);
    project.updateSpec('a.jpg', { border: { ...DEFAULT_BORDER, width: 4 } });
    project.markClean('a.jpg', useProjectStore.getState().photos[0].spec);
    expect(useProjectStore.getState().photos[0].dirty).toBe(false);
    project.undoEdit();
    expect(useProjectStore.getState().photos[0].dirty).toBe(true);
    project.redoEdit();
    expect(useProjectStore.getState().photos[0].dirty).toBe(false);
  });

  it('coalesces continuous watermark edits and drops redo after a new edit', () => {
    const project = useProjectStore.getState();
    project.addPhotos([image('a.jpg')]);
    project.updateSpec('a.jpg', { watermark: { ...DEFAULT_WATERMARK, content: 'A' } });
    project.updateSpec('a.jpg', { watermark: { ...DEFAULT_WATERMARK, content: 'AB' } });
    expect(useEditHistoryStore.getState().undoStack).toHaveLength(1);
    project.undoEdit();
    expect(useProjectStore.getState().photos[0].spec.watermark).toBeUndefined();
    project.updateSpec('a.jpg', { border: { ...DEFAULT_BORDER, width: 2 } });
    expect(useEditHistoryStore.getState().redoStack).toHaveLength(0);
    project.removePhotos(['a.jpg']);
    expect(useEditHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('keeps surviving edits across import and removal without recording either action', () => {
    const project = useProjectStore.getState();
    project.addPhotos([image('a.jpg')]);
    project.updateSpec('a.jpg', { border: { ...DEFAULT_BORDER, width: 3 } });
    project.addPhotos([image('b.jpg')]);
    expect(useEditHistoryStore.getState().undoStack).toHaveLength(1);
    project.removePhotos(['b.jpg']);
    expect(useEditHistoryStore.getState().undoStack).toHaveLength(1);
    project.undoEdit();
    expect(useProjectStore.getState().photos[0].spec.border).toBeUndefined();
  });
});
