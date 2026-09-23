import { useCallback, useState } from "react";
import { useMediaQuery, useTheme as useMuiTheme } from "@mui/material";
import { isTauri } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import type { ThemeController } from "./hooks/useTheme";
import { AppShell } from "./layout/AppShell";
import { TitleBar } from "./layout/TitleBar";
import { RightPanel } from "./layout/RightPanel";
import { FilmStrip, type FilmStripItem } from "./layout/FilmStrip";
import { MainCanvas } from "./layout/MainCanvas";
import { MobileRightPanel } from "./layout/MobileRightPanel";
import { useEditorShortcuts } from "./hooks/useEditorShortcuts";

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
  const muiTheme = useMuiTheme();
  const mobileLayout = useMediaQuery(muiTheme.breakpoints.down("md"));
  const titleBarVisible = !(isTauri() && platform() === "android");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const toggleInspector = useCallback(() => setInspectorOpen((open) => !open), []);
  useEditorShortcuts(toggleInspector);

  const openPhoto = () => {
    document.getElementById("photo-input")?.click();
  };

  return (
    <AppShell
      titleBarVisible={titleBarVisible}
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
            onTogglePanel={toggleInspector}
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
      rightPanel={mobileLayout ? (
        <MobileRightPanel open={inspectorOpen} onOpenChange={setInspectorOpen} />
      ) : (
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
