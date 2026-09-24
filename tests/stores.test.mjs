import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useProjectStore } from '../src/stores/projectStore.ts';
import { useTaskStore } from '../src/stores/taskStore.ts';

test('deduplicates imports, isolates photo edits, and preserves edits during export', () => {
  const store = useProjectStore;
  store.getState().clear();
  const photo = (path) => ({ path, width: 4000, height: 3000, format: 'jpeg', orientation: 1, previewUrl: null, thumbUrl: `${path}.webp` });
  store.getState().addPhotos([photo('a.jpg'), photo('b.jpg'), photo('a.jpg')]);
  assert.equal(store.getState().photos.length, 2);
  assert.equal(store.getState().selectedId, 'a.jpg');
  const exported = structuredClone(store.getState().photos[0].spec);
  store.getState().updateSpec('a.jpg', { output: { format: 'png', quality: 100 } });
  store.getState().markClean('a.jpg', exported);
  assert.equal(store.getState().photos[0].dirty, true);
  assert.equal(store.getState().photos[1].spec.output, undefined);
  store.getState().markClean('a.jpg', store.getState().photos[0].spec);
  assert.equal(store.getState().photos[0].dirty, false);
  store.getState().removePhoto('a.jpg');
  assert.equal(store.getState().selectedId, 'b.jpg');
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
