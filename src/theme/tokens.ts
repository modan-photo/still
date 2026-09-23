export type ColorMode = "light" | "dark";

export const colorTokens = {
  light: {
    bg: {
      base: "#F7F7F9",
      surface: "#FFFFFF",
      elevated: "#FFFFFF",
    },
    border: { subtle: "#E5E5EA" },
    text: {
      primary: "#1C1C1E",
      secondary: "#6E6E73",
    },
    accent: "#007AFF",
    danger: "#FF3B30",
  },
  dark: {
    bg: {
      base: "#121214",
      surface: "#1C1C1F",
      elevated: "#242428",
    },
    border: { subtle: "#2E2E33" },
    text: {
      primary: "#F2F2F7",
      secondary: "#98989F",
    },
    accent: "#0A84FF",
    danger: "#FF453A",
  },
} as const;

export const radiusTokens = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const shadowTokens = {
  elev1: "0 1px 2px rgba(0, 0, 0, 0.06)",
  elev2: "0 4px 16px rgba(0, 0, 0, 0.08)",
  elev3: "0 12px 32px rgba(0, 0, 0, 0.12)",
} as const;

export const spacingTokens = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const typographyTokens = {
  fontFamily:
    '-apple-system, "Segoe UI Variable", "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
} as const;

export const motionTokens = {
  duration: {
    fast: 150,
    base: 200,
    slow: 300,
  },
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

export const glassTokens = {
  backgroundOpacity: 0.7,
  backdropFilter: "blur(20px) saturate(180%)",
} as const;

export const breakpointTokens = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export const designTokens = {
  colors: colorTokens,
  radius: radiusTokens,
  shadow: shadowTokens,
  spacing: spacingTokens,
  typography: typographyTokens,
  motion: motionTokens,
  glass: glassTokens,
  breakpoints: breakpointTokens,
} as const;

export function getCssVariables(mode: ColorMode): Record<string, string> {
  const colors = colorTokens[mode];

  return {
    "--color-bg-base": colors.bg.base,
    "--color-bg-surface": colors.bg.surface,
    "--color-bg-elevated": colors.bg.elevated,
    "--color-border-subtle": colors.border.subtle,
    "--color-text-primary": colors.text.primary,
    "--color-text-secondary": colors.text.secondary,
    "--color-accent": colors.accent,
    "--color-danger": colors.danger,
    "--radius-sm": `${radiusTokens.sm}px`,
    "--radius-md": `${radiusTokens.md}px`,
    "--radius-lg": `${radiusTokens.lg}px`,
    "--radius-xl": `${radiusTokens.xl}px`,
    "--radius-full": `${radiusTokens.full}px`,
    "--shadow-elev1": shadowTokens.elev1,
    "--shadow-elev2": shadowTokens.elev2,
    "--shadow-elev3": shadowTokens.elev3,
    "--space-1": `${spacingTokens.xs}px`,
    "--space-2": `${spacingTokens.sm}px`,
    "--space-3": `${spacingTokens.md}px`,
    "--space-4": `${spacingTokens.lg}px`,
    "--space-6": `${spacingTokens.xl}px`,
    "--space-8": `${spacingTokens.xxl}px`,
    "--font-system": typographyTokens.fontFamily,
    "--motion-fast": `${motionTokens.duration.fast}ms`,
    "--motion-base": `${motionTokens.duration.base}ms`,
    "--motion-slow": `${motionTokens.duration.slow}ms`,
    "--motion-easing": motionTokens.easing,
    "--glass-backdrop": glassTokens.backdropFilter,
  };
}
