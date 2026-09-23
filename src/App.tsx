import { useState } from "react";
import "./App.css";
import type { ThemeController } from "./hooks/useTheme";
import { AppShell } from "./layout/AppShell";
import { TitleBar } from "./layout/TitleBar";
import { RightPanel } from "./layout/RightPanel";
import { FilmStrip, type FilmStripItem } from "./layout/FilmStrip";
import { MainCanvas } from "./layout/MainCanvas";

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
        <MainCanvas
          photoName={photoName}
          onImport={openPhoto}
          onFileDrop={(file) => setPhotoName(file.name)}
        />
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
