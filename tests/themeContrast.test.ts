import { describe, expect, it } from 'vitest';
import { createStillTheme } from '../src/theme/muiTheme';
import { colorTokens, type ColorMode } from '../src/theme/tokens';

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('theme text contrast', () => {
  for (const mode of ['light', 'dark'] as const satisfies readonly ColorMode[]) {
    it(`${mode} theme keeps common text and filled button pairs at 4.5:1`, () => {
      const colors = colorTokens[mode];
      const theme = createStillTheme(mode);
      for (const background of Object.values(colors.bg)) {
        for (const foreground of [
          colors.text.primary,
          colors.text.secondary,
          colors.accent,
          colors.danger,
        ]) {
          expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(theme.palette.primary.contrastText, colors.accent)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(theme.palette.error.contrastText, colors.danger)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
