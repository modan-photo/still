import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSingleKeyActions, singleKeyActionEnabled } from '../src/services/shortcutPreferences';

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
});
