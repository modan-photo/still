import assert from 'node:assert/strict';
import { test } from 'vitest';
import { useProjectStore } from '../src/stores/projectStore.ts';
import { useTaskStore } from '../src/stores/taskStore.ts';
import { useUIStore } from '../src/stores/uiStore.ts';
import { useUndoStore } from '../src/stores/undoStore.ts';

test('system fonts are opt-in by default', () => {
  assert.equal(useUIStore.getState().systemFontsEnabled, false);
});

test('grid panel starts closed and supports explicit and toggled updates', () => {
  useUIStore.getState().setGridPanelOpen(false);
  assert.equal(useUIStore.getState().gridPanelOpen, false);
  useUIStore.getState().toggleGridPanel();
  assert.equal(useUIStore.getState().gridPanelOpen, true);
  useUIStore.getState().setGridPanelOpen(false);
  assert.equal(useUIStore.getState().gridPanelOpen, false);
});

test('deduplicates imports, isolates photo edits, and preserves edits during export', () => {
  const store = useProjectStore;
  store.getState().clear();
  const photo = (path) => ({ path, width: 4000, height: 3000, format: 'jpeg', orientation: 1, previewUrl: null, thumbUrl: `${path}.webp` });
  store.getState().addPhotos([photo('a.jpg'), photo('b.jpg'), photo('a.jpg')]);
  assert.equal(store.getState().photos.length, 2);
  assert.equal(store.getState().currentPhotoId, 'a.jpg');
  assert.equal(store.getState().selectedId, 'a.jpg');
  const exported = structuredClone(store.getState().photos[0].spec);
  store.getState().updateSpec('a.jpg', { output: { format: 'png', quality: 100 } });
  store.getState().markClean('a.jpg', exported);
  assert.equal(store.getState().photos[0].dirty, true);
  assert.equal(store.getState().photos[1].spec.output, undefined);
  store.getState().markClean('a.jpg', store.getState().photos[0].spec);
  assert.equal(store.getState().photos[0].dirty, false);
  const border = { style: 'film', width: 18, unit: 'px', color: '#FFFFFF', radius: 2, colors: ['#FFFFFF', '#000000'], angle: 0, caption: false };
  store.getState().applyBorderToAll(border);
  assert.deepEqual(store.getState().photos[0].spec.border, border);
  assert.deepEqual(store.getState().photos[1].spec.border, border);
  assert.notEqual(store.getState().photos[0].spec.border, store.getState().photos[1].spec.border);
  store.getState().removePhoto('a.jpg');
  assert.equal(store.getState().currentPhotoId, 'b.jpg');
  assert.equal(store.getState().selectedId, 'b.jpg');
});

test('batch removal updates selections and chooses the next photo before the previous one', () => {
  const store = useProjectStore;
  store.getState().clear();
  const photo = (path) => ({ path, width: 100, height: 100, format: 'jpeg', orientation: 1, previewUrl: null, thumbUrl: `${path}.webp` });
  store.getState().addPhotos([photo('a.jpg'), photo('b.jpg'), photo('c.jpg'), photo('d.jpg')]);
  store.getState().selectPhoto('c.jpg');
  store.setState({ selectedIds: ['a.jpg', 'c.jpg'] });

  const snapshot = store.getState().removePhotos(['a.jpg', 'c.jpg']);
  assert.deepEqual(store.getState().photos.map((entry) => entry.id), ['b.jpg', 'd.jpg']);
  assert.equal(store.getState().currentPhotoId, 'd.jpg');
  assert.equal(store.getState().selectedId, 'd.jpg');
  assert.deepEqual(store.getState().selectedIds, []);
  assert.deepEqual(snapshot.removedPhotos.map((entry) => entry.id), ['a.jpg', 'c.jpg']);
  assert.deepEqual(snapshot.removedIndices, [0, 2]);
  assert.equal(snapshot.previousCurrentId, 'c.jpg');

  store.getState().restorePhotos(snapshot);
  assert.deepEqual(store.getState().photos.map((entry) => entry.id), ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
  assert.equal(store.getState().currentPhotoId, 'c.jpg');
  assert.deepEqual(store.getState().selectedIds, ['a.jpg', 'c.jpg']);

  store.getState().removePhotos(['d.jpg']);
  assert.equal(store.getState().currentPhotoId, 'c.jpg');
  store.getState().clearAll();
  assert.deepEqual(store.getState().photos, []);
  assert.equal(store.getState().currentPhotoId, null);
  assert.equal(store.getState().selectedId, null);
});

test('applies the current RenderSpec to selected photos while preserving each source', () => {
  const store = useProjectStore;
  store.getState().clear();
  const photo = (path, width) => ({ path, width, height: 10, format: 'png', orientation: 1, previewUrl: null, thumbUrl: `${path}.webp` });
  store.getState().addPhotos([photo('source.png', 10), photo('target-a.png', 20), photo('target-b.png', 30)]);
  const border = { style: 'solid', width: 1, unit: 'px', color: '#FF0000', radius: 0, colors: ['#FF0000', '#FF0000'], angle: 0, caption: false };
  store.getState().updateSpec('source.png', { border, output: { format: 'png', quality: 100 } });

  store.getState().applySpecToPhotos('source.png', ['target-a.png', 'target-b.png']);

  const [, targetA, targetB] = store.getState().photos;
  assert.deepEqual(targetA.spec.border, border);
  assert.deepEqual(targetB.spec.border, border);
  assert.deepEqual(targetA.spec.source, { path: 'target-a.png', width: 20, height: 10 });
  assert.deepEqual(targetB.spec.source, { path: 'target-b.png', width: 30, height: 10 });
  assert.notEqual(targetA.spec.border, targetB.spec.border);
  assert.equal(targetA.dirty, true);
  assert.equal(targetB.dirty, true);
});

test('undo store restores only the latest removal snapshot', () => {
  const store = useProjectStore;
  store.getState().clear();
  useUndoStore.getState().clear();
  const photo = (path) => ({ path, width: 100, height: 100, format: 'jpeg', orientation: 1, previewUrl: null, thumbUrl: `${path}.webp` });
  store.getState().addPhotos([photo('a.jpg'), photo('b.jpg')]);
  const snapshot = store.getState().removePhotos(['a.jpg']);
  useUndoStore.getState().push(snapshot);
  assert.equal(useUndoStore.getState().count, 1);
  assert.equal(useUndoStore.getState().notice, 'removed');
  useUndoStore.getState().undo();
  assert.deepEqual(store.getState().photos.map((entry) => entry.id), ['a.jpg', 'b.jpg']);
  assert.equal(useUndoStore.getState().notice, 'restored');
  useUndoStore.getState().clear();
});

test('terminal tasks ignore late running events and history is bounded', () => {
  useTaskStore.setState({ tasks: {} });
  const event = { taskId: 'test', operation: 'image_load', stage: 'finished', progress: 100, status: 'completed', error: null };
  useTaskStore.getState().receive(event);
  useTaskStore.getState().receive({ ...event, status: 'running', progress: 10 });
  assert.equal(useTaskStore.getState().tasks.test.status, 'completed');
  for (let i = 0; i < 110; i++) useTaskStore.getState().receive({ ...event, taskId: String(i) });
  assert.equal(Object.keys(useTaskStore.getState().tasks).length, 100);
});
