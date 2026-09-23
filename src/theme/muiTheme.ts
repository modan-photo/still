import { alpha, createTheme } from "@mui/material/styles";
import {
  breakpointTokens,
  colorTokens,
  designTokens,
  glassTokens,
  motionTokens,
  radiusTokens,
  typographyTokens,
  type ColorMode,
} from "./tokens";

declare module "@mui/material/styles" {
  interface Theme {
    still: typeof designTokens;
  }

  interface ThemeOptions {
    still?: typeof designTokens;
  }
}

export function createStillTheme(mode: ColorMode) {
  const colors = colorTokens[mode];

  return createTheme({
    still: designTokens,
    palette: {
      mode,
      background: {
        default: colors.bg.base,
        paper: colors.bg.surface,
      },
      text: colors.text,
      primary: { main: colors.accent },
      error: { main: colors.danger },
      divider: colors.border.subtle,
    },
    breakpoints: {
      values: {
        xs: 0,
        sm: breakpointTokens.sm,
        md: breakpointTokens.md,
        lg: breakpointTokens.lg,
        xl: breakpointTokens.xl,
      },
    },
    shape: { borderRadius: radiusTokens.md },
    spacing: 8,
    typography: {
      fontFamily: typographyTokens.fontFamily,
      button: { textTransform: "none" },
    },
    transitions: {
      easing: {
        easeInOut: motionTokens.easing,
        easeOut: motionTokens.easing,
        easeIn: motionTokens.easing,
        sharp: motionTokens.easing,
      },
      duration: {
        shortest: motionTokens.duration.fast,
        shorter: motionTokens.duration.fast,
        short: motionTokens.duration.fast,
        standard: motionTokens.duration.base,
        complex: motionTokens.duration.slow,
        enteringScreen: motionTokens.duration.base,
        leavingScreen: motionTokens.duration.base,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":focus-visible": {
            outline: `2px solid ${colors.accent}`,
            outlineOffset: 2,
          },
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: {
            "&.Mui-focusVisible": {
              outline: `2px solid ${colors.accent}`,
              outlineOffset: 2,
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            boxShadow: "none",
            textTransform: "none",
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: `1px solid ${colors.border.subtle}`,
          },
        },
      },
      MuiSlider: {
        styleOverrides: {
          rail: { height: 4 },
          track: { height: 4, border: 0 },
          thumb: { width: 16, height: 16 },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            padding: "5px 8px",
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radiusTokens.md,
            backgroundColor: alpha(colors.bg.surface, glassTokens.backgroundOpacity),
            backdropFilter: glassTokens.backdropFilter,
            WebkitBackdropFilter: glassTokens.backdropFilter,
            color: colors.text.primary,
            fontSize: 11,
          },
        },
      },
    },
  });
}
