import { useCallback, useEffect, useState } from 'react';
import { Alert, useMediaQuery, useTheme as useMuiTheme } from '@mui/material';
import { isTauri } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
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
import { exportImageBatch, normalizeError } from './services/tauri/image';
import { TaskProgressBar } from './components/TaskProgressBar';
import { listWatermarkFonts } from './services/tauri/watermark';
import { SettingsDialog } from './components/SettingsDialog';
import { ExportCompletionNotice } from './components/ExportCompletionNotice';
import { ExportDialog } from './components/ExportDialog';
import type { BatchExportReport, ExportRequest } from './types/export';
import { CollageWorkspace } from './components/collage/CollageWorkspace';

function App({ theme }: { theme: ThemeController }) {
  const systemFontsEnabled = useUIStore((state) => state.systemFontsEnabled);
  useEffect(() => {
    void listWatermarkFonts(systemFontsEnabled).then((fonts) => {
      if (systemFontsEnabled) return;
      const fallback = fonts.find((font) => font.builtin && font.family === 'Noto Sans SC') ?? fonts.find((font) => font.builtin);
      if (!fallback) return;
      const project = useProjectStore.getState();
      for (const photo of project.photos) {
        const stamp = photo.spec.watermark;
        const font = stamp?.font;
        if (!stamp || !font) continue;
        const bundled = fonts.find((entry) => entry.builtin && entry.family === font.family);
        const allowed = bundled ?? fallback;
        if (font.family !== allowed.family || font.path !== allowed.path) {
          project.updateSpec(photo.id, { watermark: { ...stamp, font: { ...font, family: allowed.family, path: allowed.path } } });
        }
      }
    });
  }, [systemFontsEnabled]);
  const muiTheme = useMuiTheme();
  const mobileLayout = useMediaQuery(muiTheme.breakpoints.down('md'));
  const inspectorOpen = useUIStore((state) => state.inspectorOpen);
  const setInspectorOpen = useUIStore((state) => state.setInspectorOpen);
  const photos = useProjectStore((state) => state.photos);
  const selectedId = useProjectStore((state) => state.selectedId);
  const selectPhoto = useProjectStore((state) => state.selectPhoto);
  const { choosePhotos, chooseFolder, dragActive, error, clearError } = useImageImport();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportReport, setExportReport] = useState<BatchExportReport | null>(null);
  const [exportNoticeOpen, setExportNoticeOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collageOpen, setCollageOpen] = useState(false);
  const desktopFolderImport = isTauri() && platform() !== 'android';
  const toggleInspector = useCallback(() => setInspectorOpen(!useUIStore.getState().inspectorOpen), [setInspectorOpen]);
  useEditorShortcuts(toggleInspector, choosePhotos);
  useEffect(() => {
    if (photos.length !== 0) return;
    useUIStore.getState().setGridPanelOpen(false);
    useProjectStore.getState().setSelectedIds([]);
  }, [photos.length]);
  const beginExport = async ({ specs, options }: ExportRequest) => {
    if (exporting || specs.length === 0) return;
    setExporting(true);
    setExportError(null);
    setExportNoticeOpen(false);
    try {
      const report = await exportImageBatch(specs, options);
      const exportedByPath = new Map(specs.map((spec) => [spec.source.path, spec]));
      for (const success of report.successes) {
        const spec = exportedByPath.get(success.sourcePath);
        const photo = useProjectStore.getState().photos.find((entry) => entry.path === success.sourcePath);
        if (spec && photo) useProjectStore.getState().markClean(photo.id, spec);
      }
      setExportReport(report);
      setExportNoticeOpen(true);
    } catch (reason) { const error = normalizeError(reason); if (error.code !== 'cancelled') setExportError(error.message); }
    finally { setExporting(false); }
  };
  const collagePhotos = (useProjectStore.getState().selectedIds.length > 0
    ? photos.filter((photo) => useProjectStore.getState().selectedIds.includes(photo.id))
    : photos).map((photo) => ({ id: photo.id, path: photo.path, thumbUrl: photo.thumbUrl }));
  return <>
    <AppShell
      titleBarVisible={!(isTauri() && platform() === 'android')}
      titleBar={<><TitleBar onOpen={choosePhotos} onOpenSettings={() => setSettingsOpen(true)} onTogglePanel={toggleInspector}
        onToggleTheme={theme.toggleResolvedTheme} panelOpen={inspectorOpen} themeMode={theme.resolvedTheme} />
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} /></>}
      progress={<><TaskProgressBar />{error && <Alert severity="error" onClose={clearError}>{error}</Alert>}
        {exportError && <Alert severity="error" onClose={() => setExportError(null)}>{exportError}</Alert>}</>}
      mainCanvas={<MainCanvas onImport={choosePhotos} onImportFolder={chooseFolder} showFolderImport={desktopFolderImport}
        dragActive={dragActive} onExport={() => setExportDialogOpen(true)} onOpenCollage={() => setCollageOpen(true)} exporting={exporting} />}
      rightPanel={photos.length === 0 ? null : mobileLayout ? <MobileRightPanel open={inspectorOpen} onOpenChange={setInspectorOpen} />
        : <RightPanel collapsed={!inspectorOpen} onCollapsedChange={(collapsed) => setInspectorOpen(!collapsed)} />}
      filmStrip={<FilmStrip items={photos.map((photo) => ({ id: photo.id, label: photo.path.split(/[\\/]/).pop() ?? photo.path,
        thumbPath: photo.thumbUrl, thumbRevision: photo.thumbRevision }))}
        selectedId={selectedId} onSelect={selectPhoto} onImport={choosePhotos} />}
    />
    <ExportDialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} onExport={(request) => void beginExport(request)} />
    <ExportCompletionNotice
      report={exportReport}
      open={exportNoticeOpen}
      onClose={() => setExportNoticeOpen(false)}
    />
    {collageOpen && <CollageWorkspace photos={collagePhotos} onClose={() => setCollageOpen(false)} />}
  </>;
}
export default App;
