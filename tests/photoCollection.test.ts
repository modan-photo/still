import { describe, expect, it } from 'vitest';
import {
  adjacentPhoto,
  photoRangeIds,
  sortedPhotos,
  sourceKey,
} from '../src/services/photoCollection';
import type { ProjectPhoto } from '../src/stores/projectStore';

const photos = [
  { id: 'a', path: 'C:\\photos\\photo10.jpg' },
  { id: 'b', path: 'C:\\photos\\photo2.jpg' },
  { id: 'c', path: 'C:\\other\\photo2.jpg' },
] as ProjectPhoto[];

describe('photo collection navigation', () => {
  it('keeps import identity and uses natural, stable filename sorting', () => {
    expect(sortedPhotos(photos, 'import')).toBe(photos);
    expect(sortedPhotos(photos, 'name').map((photo) => photo.id)).toEqual(['b', 'c', 'a']);
    expect(sortedPhotos(photos, 'name-desc').map((photo) => photo.id)).toEqual(['a', 'b', 'c']);
    expect(photos.map((photo) => photo.id)).toEqual(['a', 'b', 'c']);
  });

  it('selects an inclusive range in visible order even when navigating backwards', () => {
    const ordered = sortedPhotos(photos, 'name');
    expect(photoRangeIds(ordered, 'a', 'b')).toEqual(['b', 'c', 'a']);
    expect(photoRangeIds(ordered, 'missing', 'c')).toEqual(['c']);
  });

  it('navigates adjacent photos in the selected sort order without changing import order', () => {
    expect(adjacentPhoto(photos, 'name', 'b', 1)?.id).toBe('c');
    expect(adjacentPhoto(photos, 'name', 'a', -1)?.id).toBe('c');
    expect(adjacentPhoto(photos, 'import', 'b', 1)?.id).toBe('c');
    expect(adjacentPhoto(photos, 'name-desc', 'a', -1)).toBeUndefined();
    expect(photos.map((photo) => photo.id)).toEqual(['a', 'b', 'c']);
  });

  it('folds Windows path spelling without folding provider URI identity', () => {
    expect(sourceKey('C:/Photos/A.JPG')).toBe(sourceKey('c:\\photos\\a.jpg'));
    expect(sourceKey('content://provider/A')).not.toBe(sourceKey('content://provider/a'));
  });
});
