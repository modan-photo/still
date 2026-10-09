import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  gridShortcutMatches,
  photoNavigationDirection,
  readGridShortcutKey,
  readPhotoNavigationKeys,
  readSingleKeyActions,
  singleKeyActionEnabled,
} from '../src/services/shortcutPreferences';

afterEach(() => vi.unstubAllGlobals());

describe('editor single-key action preferences', () => {
  it('accepts only known boolean values and defaults missing or invalid actions to enabled', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ grid: false, remove: 'false', unknown: false }),
    });
    expect(readSingleKeyActions()).toEqual({
      grid: false,
      remove: true,
      inspector: true,
      photoNavigation: true,
    });
  });

  it('uses the master switch without losing each action choice', () => {
    const actions = {
      grid: true,
      remove: false,
      inspector: true,
      photoNavigation: true,
    };
    expect(singleKeyActionEnabled(false, actions, 'grid')).toBe(false);
    expect(singleKeyActionEnabled(true, actions, 'grid')).toBe(true);
    expect(singleKeyActionEnabled(true, actions, 'remove')).toBe(false);
    expect(singleKeyActionEnabled(false, actions, 'remove')).toBe(false);
  });

  it('accepts only the supported alternative bindings', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key === 'still.shortcuts.grid-key'
          ? 'v'
          : key === 'still.shortcuts.photo-navigation-keys'
            ? 'jl'
            : null,
    });
    expect(readGridShortcutKey()).toBe('v');
    expect(readPhotoNavigationKeys()).toBe('jl');
    expect(gridShortcutMatches('V', 'v')).toBe(true);
    expect(gridShortcutMatches('g', 'v')).toBe(false);
    expect(photoNavigationDirection('J', 'jl')).toBe(-1);
    expect(photoNavigationDirection('l', 'jl')).toBe(1);
    expect(photoNavigationDirection('ArrowLeft', 'jl')).toBeNull();
    expect(photoNavigationDirection('ArrowRight', 'arrows')).toBe(1);
    expect(photoNavigationDirection('j', 'arrows')).toBeNull();
  });

  it('falls back to the original keys for unsupported saved values', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'invalid' });
    expect(readGridShortcutKey()).toBe('g');
    expect(readPhotoNavigationKeys()).toBe('arrows');
  });
});
