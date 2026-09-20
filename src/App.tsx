import { useEffect, useRef, useState } from "react";
import "./App.css";
import { Inspector } from "./components/Inspector";
import { Icon, type IconName } from "./components/Icons";
import { StillMark } from "./components/StillMark";
import { useTheme, type ThemePreference } from "./hooks/useTheme";

type IconButtonProps = {
  label: string;
  icon: IconName;
  onClick?: () => void;
  pressed?: boolean;
};

function IconButton({ label, icon, onClick, pressed }: IconButtonProps) {
  return (
    <button
      className="icon-button tooltip"
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-tooltip={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

const themeLabels: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function App() {
  const { preference, resolvedTheme, setPreference, toggleResolvedTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  const openPhoto = () => {
    document.getElementById("photo-input")?.click();
  };

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="toolbar-start">
          <div className="brand" aria-label="Still">
            <StillMark size={22} />
            <span>Still</span>
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
          <input id="photo-input" className="visually-hidden" type="file" accept="image/*" />
          <button className="button button-ghost toolbar-open" type="button" aria-label="Open photograph" onClick={openPhoto}>
            <Icon name="open" />
            <span>Open</span>
          </button>
        </div>

        <div className="document-context" aria-label="Current document">
          <span className="document-name">No photo open</span>
        </div>

        <div className="toolbar-actions">
          <IconButton
            label={`Switch to ${resolvedTheme === "light" ? "dark" : "light"} theme`}
            icon={resolvedTheme === "light" ? "moon" : "sun"}
            onClick={toggleResolvedTheme}
          />

          <div className="popover-anchor" ref={settingsRef}>
            <IconButton
              label="Settings"
              icon="settings"
              pressed={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            />
            {settingsOpen && (
              <div className="settings-popover" role="dialog" aria-label="Appearance settings">
                <div className="popover-heading">
                  <div>
                    <p className="popover-title">Appearance</p>
                    <p className="popover-description">Choose how Still looks.</p>
                  </div>
                  <button
                    className="icon-button icon-button-small"
                    type="button"
                    aria-label="Close settings"
                    onClick={() => setSettingsOpen(false)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                <div className="theme-options" role="radiogroup" aria-label="Theme preference">
                  {(["system", "light", "dark"] as ThemePreference[]).map((theme) => (
                    <button
                      className="theme-option"
                      data-selected={preference === theme}
                      type="button"
                      role="radio"
                      aria-checked={preference === theme}
                      key={theme}
                      onClick={() => setPreference(theme)}
                    >
                      <Icon name={theme === "system" ? "system" : theme === "light" ? "sun" : "moon"} />
                      <span>{themeLabels[theme]}</span>
                      {preference === theme && <Icon name="check" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span className="toolbar-divider" aria-hidden="true" />
          <button className="button button-primary" type="button" disabled aria-label="Export; open a photo first">
            <Icon name="export" />
            <span>Export</span>
          </button>
        </div>
      </header>

      <div className="workspace-layout">
        <main className="canvas" aria-label="Photo workspace">
          <div className="canvas-caption"><span>Workspace</span><span>Still / Photo studio</span></div>
          <div className="viewing-surface">
            <div className="empty-state">
              <div className="empty-mark" aria-hidden="true">
                <StillMark size={28} />
              </div>
              <div className="empty-copy">
                <h1>Open a photograph</h1>
                <p>A quiet space for the finishing touches.</p>
              </div>
              <button className="button button-primary empty-action" type="button" onClick={openPhoto}>
                <Icon name="open" />
                <span>Open Photo</span>
              </button>
            </div>
          </div>
          <div className="canvas-footer"><span>No photograph loaded</span><span>Frame · Refine · Export</span></div>
        </main>
        <Inspector />
      </div>
    </div>
  );
}

export default App;
