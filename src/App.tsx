import { useState } from "react";
import "./App.css";
import { Icon } from "./components/Icons";
import { CropCorners } from "./components/Sketch";
import { StillMark } from "./components/StillMark";
import type { ThemeController } from "./hooks/useTheme";
import { AppShell } from "./layout/AppShell";
import { TitleBar } from "./layout/TitleBar";
import { RightPanel } from "./layout/RightPanel";
import { FilmStrip, type FilmStripItem } from "./layout/FilmStrip";

const placeholderPhotos: FilmStripItem[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `photo-${index + 1}`,
  label: String(index + 1).padStart(3, "0"),
}));

type AppProps = {
  theme: ThemeController;
};

/** Composes the editor shell while feature implementations remain isolated. */
function App({ theme }: AppProps) {
  const { resolvedTheme, toggleResolvedTheme } = theme;
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [photoName, setPhotoName] = useState<string | null>(null);

  const openPhoto = () => {
    document.getElementById("photo-input")?.click();
  };

  return (
    <AppShell
      titleBar={(
        <>
          <input
            id="photo-input"
            className="visually-hidden"
            type="file"
            accept="image/*"
            aria-label="Choose photograph"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) setPhotoName(file.name);
            }}
          />
          <TitleBar
            onOpen={openPhoto}
            onOpenSettings={() => console.log("Open application settings")}
            onTogglePanel={() => setInspectorOpen((open) => !open)}
            onToggleTheme={toggleResolvedTheme}
            panelOpen={inspectorOpen}
            themeMode={resolvedTheme}
          />
        </>
      )}
      mainCanvas={(
        <main className="canvas" aria-label="Photo workspace">
          <div className="canvas-caption"><span>Workspace</span><span>Still / Photo studio</span></div>
          <div className="viewing-surface">
            <div className="empty-state">
              <div className="empty-mark" aria-hidden="true">
                <CropCorners />
                <StillMark size={28} />
              </div>
              <div className="empty-copy">
                <h1>Open a photograph</h1>
                <p>Choose a file to begin.</p>
              </div>
              <button className="button button-primary empty-action" type="button" onClick={openPhoto}>
                <Icon name="open" />
                <span>Open Photo</span>
              </button>
            </div>
          </div>
          <div className="canvas-footer">
            <span>{photoName ?? "No photograph loaded"}</span>
            <span>Frame · Refine · Export</span>
          </div>
        </main>
      )}
      rightPanel={(
        <RightPanel
          collapsed={!inspectorOpen}
          onCollapsedChange={(collapsed) => setInspectorOpen(!collapsed)}
        />
      )}
      filmStrip={<FilmStrip items={placeholderPhotos} onImport={openPhoto} />}
    />
  );
}

export default App;
