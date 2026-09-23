import { breakpointTokens } from "./src/theme/tokens.ts";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  corePlugins: {
    preflight: false,
  },
  theme: {
    screens: {
      sm: `${breakpointTokens.sm}px`,
      md: `${breakpointTokens.md}px`,
      lg: `${breakpointTokens.lg}px`,
      xl: `${breakpointTokens.xl}px`,
    },
    extend: {
      colors: {
        app: {
          base: "var(--color-bg-base)",
          surface: "var(--color-bg-surface)",
          elevated: "var(--color-bg-elevated)",
        },
        subtle: "var(--color-border-subtle)",
        primary: "var(--color-text-primary)",
        secondary: "var(--color-text-secondary)",
        accent: "var(--color-accent)",
        danger: "var(--color-danger)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        elev1: "var(--shadow-elev1)",
        elev2: "var(--shadow-elev2)",
        elev3: "var(--shadow-elev3)",
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        6: "var(--space-6)",
        8: "var(--space-8)",
      },
      fontFamily: {
        sans: "var(--font-system)",
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        base: "var(--motion-base)",
        slow: "var(--motion-slow)",
      },
      transitionTimingFunction: {
        app: "var(--motion-easing)",
      },
    },
  },
};
