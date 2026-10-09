import type { ProjectPhoto } from '../stores/projectStore';

export type PhotoSort = 'import' | 'name' | 'name-desc';

export function sourceKey(path: string): string {
  // Windows file paths are case-insensitive; document URIs are provider-owned.
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith('\\\\')
    ? path.replace(/\//g, '\\').toLowerCase()
    : path;
}

export function sortedPhotos(photos: ProjectPhoto[], order: PhotoSort): ProjectPhoto[] {
  if (order === 'import') return photos;
  const direction = order === 'name' ? 1 : -1;
  return photos
    .map((photo, index) => ({ photo, index }))
    .sort((a, b) => {
      const nameA = a.photo.path.split(/[\\/]/).pop() ?? a.photo.path;
      const nameB = b.photo.path.split(/[\\/]/).pop() ?? b.photo.path;
      const comparison = nameA.localeCompare(nameB, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return comparison ? comparison * direction : a.index - b.index;
    })
    .map(({ photo }) => photo);
}

export function photoRangeIds(
  photos: Pick<ProjectPhoto, 'id'>[],
  anchorId: string,
  endId: string,
): string[] {
  const start = photos.findIndex((photo) => photo.id === anchorId);
  const end = photos.findIndex((photo) => photo.id === endId);
  if (start < 0 || end < 0) return end < 0 ? [] : [endId];
  return photos.slice(Math.min(start, end), Math.max(start, end) + 1).map((photo) => photo.id);
}
