import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { IconButton as MuiIconButton, Tooltip } from "@mui/material";
import { Icon } from "../components/Icons";
import { StillMark } from "../components/StillMark";

type TitleBarProps = {
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  themeMode: "light" | "dark";
};

/**
 * Desktop custom title bar with application actions and native window controls.
 * Elements marked with `data-tauri-drag-region` remain draggable; interactive
 * buttons intentionally sit outside those regions so clicks reach their handlers.
 */
export function TitleBar({ onOpenSettings, onToggleTheme, themeMode }: TitleBarProps) {
  // Android supplies its own system chrome and must not render desktop controls.
  if (isTauri() && platform() === "android") return null;

  const windowAction = (action: "minimize" | "maximize" | "close") => async () => {
    // Browser preview renders the title bar for visual parity but has no native window.
    if (!isTauri()) return;

    const appWindow = getCurrentWindow();
    try {
      if (action === "minimize") await appWindow.minimize();
      if (action === "maximize") await appWindow.toggleMaximize();
      if (action === "close") await appWindow.close();
    } catch (error) {
      console.error(`Unable to ${action} the window`, error);
    }
  };

  return (
    <header className="flex h-10 w-full select-none items-center bg-app-surface text-secondary" data-tauri-drag-region>
      <div className="flex h-full shrink-0 items-center pl-3" data-tauri-drag-region>
        <div className="mr-1 flex items-center gap-2 pr-2 text-[13px] font-medium" data-tauri-drag-region>
          <StillMark size={18} />
          <span data-tauri-drag-region>Still</span>
        </div>
      </div>

      {/* Flexible drag region pushes all actions to the right edge. */}
      <div className="h-full min-w-8 flex-1" data-tauri-drag-region />

      <div className="flex h-full shrink-0 items-center">
        <Tooltip title={`Switch to ${themeMode === "light" ? "dark" : "light"} theme`} arrow>
          <MuiIconButton aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} theme`} onClick={onToggleTheme} size="small" sx={titleBarActionSx}>
            <Icon name={themeMode === "light" ? "moon" : "sun"} size={16} />
          </MuiIconButton>
        </Tooltip>
        <Tooltip title="Application settings" arrow>
          <MuiIconButton aria-label="Open application settings" onClick={onOpenSettings} size="small" sx={titleBarActionSx}>
            <Icon name="settings" size={16} />
          </MuiIconButton>
        </Tooltip>
      </div>

      <div className="flex h-full shrink-0 items-center">
        <MuiIconButton aria-label="Minimize window" disableRipple onClick={windowAction("minimize")} sx={windowButtonSx}>
          <Icon name="minimize" size={16} />
        </MuiIconButton>
        <MuiIconButton aria-label="Maximize or restore window" disableRipple onClick={windowAction("maximize")} sx={windowButtonSx}>
          <Icon name="maximize" size={15} />
        </MuiIconButton>
        <MuiIconButton
          aria-label="Close window"
          disableRipple
          onClick={windowAction("close")}
          sx={{ ...windowButtonSx, "&:hover": { bgcolor: "error.main", color: "common.white" } }}
        >
          <Icon name="close" size={16} />
        </MuiIconButton>
      </div>

    </header>
  );
}

/** Windows-style full-height hit target for native window actions. */
const windowButtonSx = {
  width: 46,
  height: 40,
  borderRadius: 0,
  color: "text.secondary",
  transition: "background-color var(--motion-fast) var(--motion-easing), color var(--motion-fast) var(--motion-easing)",
  "&:hover": { bgcolor: "var(--color-bg-elevated)", color: "text.primary" },
} as const;

/** Match native controls geometrically while retaining application focus styling. */
const titleBarActionSx = {
  width: 46,
  height: 40,
  borderRadius: 0,
  color: "text.secondary",
  transition: "background-color var(--motion-fast) var(--motion-easing), color var(--motion-fast) var(--motion-easing)",
  "&:hover": { bgcolor: "action.hover", color: "text.primary" },
  "&:focus-visible": { outline: "2px solid var(--color-accent)", outlineOffset: 2 },
} as const;
