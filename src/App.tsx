import { useCallback, useEffect, useState } from 'react';
import { Alert, useMediaQuery, useTheme as useMuiTheme } from '@mui/material';
import { isTauri } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { save } from '@tauri-apps/plugin-dialog';
import type { ThemeController } from './hooks/useTheme';
import { AppShell } from './layout/AppShell';
import { TitleBar } from './layout/TitleBar';
import { RightPanel } from './layout/RightPanel';
import { FilmStrip } from './layout/FilmStrip';
import { MainCanvas } from './layout/MainCanvas';
import { MobileRightPanel } from './layout/MobileRightPanel';
import { useEditorShortcuts } from './hooks/useEditorShortcuts';
import { useImageImport } from './hooks/useImageImport';
import { useProjectStore } from './stores/projectStore';
import { useUIStore } from './stores/uiStore';
import { exportImage, normalizeError } from './services/tauri/image';
import { TaskProgressBar } from './components/TaskProgressBar';
import { listWatermarkFonts } from './services/tauri/watermark';

function App({ theme }: { theme: ThemeController }) {
  useEffect(() => { void listWatermarkFonts(); }, []);
  const muiTheme = useMuiTheme();
  const mobileLayout = useMediaQuery(muiTheme.breakpoints.down('md'));
  const inspectorOpen = useUIStore((state) => state.inspectorOpen);
  const setInspectorOpen = useUIStore((state) => state.setInspectorOpen);
  const photos = useProjectStore((state) => state.photos);
  const selectedId = useProjectStore((state) => state.selectedId);
  const selectPhoto = useProjectStore((state) => state.selectPhoto);
  const { choosePhotos, dragActive, error, clearError } = useImageImport();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const toggleInspector = useCallback(() => setInspectorOpen(!useUIStore.getState().inspectorOpen), [setInspectorOpen]);
  useEditorShortcuts(toggleInspector, choosePhotos);
  const exportSelected = async () => {
    const photo = photos.find((entry) => entry.id === selectedId);
    if (!photo || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const spec = structuredClone(photo.spec);
      const path = await save({ title: 'Export photo', defaultPath: photo.path.replace(/(\.[^.\\/]+)$/, '-export$1') });
      if (path) {
        await exportImage(spec, path);
        useProjectStore.getState().markClean(photo.id, spec);
      }
    } catch (reason) { setExportError(normalizeError(reason).message); }
    finally { setExporting(false); }
  };
  return <AppShell
    titleBarVisible={!(isTauri() && platform() === 'android')}
    titleBar={<TitleBar onOpen={choosePhotos} onOpenSettings={() => {}} onTogglePanel={toggleInspector}
      onToggleTheme={theme.toggleResolvedTheme} panelOpen={inspectorOpen} themeMode={theme.resolvedTheme} />}
    progress={<><TaskProgressBar />{error && <Alert severity="error" onClose={clearError}>{error}</Alert>}
      {exportError && <Alert severity="error" onClose={() => setExportError(null)}>{exportError}</Alert>}</>}
    mainCanvas={<MainCanvas onImport={choosePhotos} dragActive={dragActive} onExport={() => void exportSelected()} exporting={exporting} />}
    rightPanel={mobileLayout ? <MobileRightPanel open={inspectorOpen} onOpenChange={setInspectorOpen} />
      : <RightPanel collapsed={!inspectorOpen} onCollapsedChange={(collapsed) => setInspectorOpen(!collapsed)} />}
    filmStrip={<FilmStrip items={photos.map((photo) => ({ id: photo.id, label: photo.path.split(/[\\/]/).pop() ?? photo.path, thumbPath: photo.thumbUrl }))}
      selectedId={selectedId} onSelect={selectPhoto} onImport={choosePhotos} />}
  />;
}
export default App;
