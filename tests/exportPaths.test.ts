import { describe, expect, it } from 'vitest';
import {
  parentDirectory,
  recentFilesystemDirectories,
  withOutputExtension,
} from '../src/services/exportPaths';

describe('document export identities', () => {
  const uri = 'content://provider/tree/a%3Ab/document/a%3Ab%2Fphoto.png?opaque=1';
  it('does not invent a parent or rewrite a provider ID', () => {
    expect(parentDirectory(uri)).toBe('');
    expect(withOutputExtension(uri, 'jpeg')).toBe(uri);
  });
  it('does not persist session document grants as recent folders', () => {
    expect(recentFilesystemDirectories([uri, 'D:\\photos', null])).toEqual(['D:\\photos']);
    expect(recentFilesystemDirectories({})).toEqual([]);
  });
  it('retains filesystem filename handling', () => {
    expect(parentDirectory('D:\\photos\\source.jpg')).toBe('D:\\photos');
    expect(withOutputExtension('D:\\photos.v1\\export', 'jpeg')).toBe('D:\\photos.v1\\export.jpg');
    expect(withOutputExtension('/photos/export.png', 'webp')).toBe('/photos/export.webp');
  });
});
