import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Snackbar, useMediaQuery, useTheme as useMuiTheme } from '@mui/material';
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
import { composeCollage } from './services/tauri/collage';
import { createCollageExportPayload } from './services/collageExport';
import { TaskProgressBar } from './components/TaskProgressBar';
import { listWatermarkFonts } from './services/tauri/watermark';
import { SettingsDialog } from './components/SettingsDialog';
import { ExportCompletionNotice } from './components/ExportCompletionNotice';
import { ExportDialog } from './components/ExportDialog';
import type { BatchExportReport, ExportMode, ExportRequest } from './types/export';
import { MobileCollageEditor } from './layout/MobileCollageEditor';
import type { RightPanelTabId } from './layout/rightPanelTabs';
import { motionTokens } from './theme/tokens';
import { restoreViewAfterCollage } from './services/collageMode';

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
  const isMobile = useMediaQuery('(max-width: 767px)');
  const inspectorOpen = useUIStore((state) => state.inspectorOpen);
  const setInspectorOpen = useUIStore((state) => state.setInspectorOpen);
  const activeRightTab = useUIStore((state) => state.activeRightTab);
  const setActiveRightTab = useUIStore((state) => state.setActiveRightTab);
  const previousRightTab = useRef<RightPanelTabId>('frame');
  const wasCollageMode = useRef(false);
  const isCollageMode = activeRightTab === 'collage';
  const photos = useProjectStore((state) => state.photos);
  const collagePhotoIds = useProjectStore((state) => state.collageDraft.photoIds);
  const selectedId = useProjectStore((state) => state.selectedId);
  const selectPhoto = useProjectStore((state) => state.selectPhoto);
  const { choosePhotos, chooseFolder, dragActive, error, clearError } = useImageImport();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportReport, setExportReport] = useState<BatchExportReport | null>(null);
  const [exportNoticeOpen, setExportNoticeOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('photos');
  const [collageExportPath, setCollageExportPath] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const desktopFolderImport = isTauri() && platform() !== 'android';
  const toggleInspector = useCallback(() => setInspectorOpen(!useUIStore.getState().inspectorOpen), [setInspectorOpen]);
  useEditorShortcuts(toggleInspector, choosePhotos);
  useEffect(() => {
    if (photos.length !== 0) return;
    useUIStore.getState().setGridPanelOpen(false);
    useProjectStore.getState().setSelectedIds([]);
  }, [photos.length]);
  useEffect(() => {
    if (activeRightTab === 'collage') {
      wasCollageMode.current = true;
      return;
    }
    if (wasCollageMode.current) restoreViewAfterCollage();
    wasCollageMode.current = false;
    previousRightTab.current = activeRightTab;
  }, [activeRightTab]);
  useEffect(() => {
    if (!isCollageMode) return;
    const availableIds = new Set(photos.map((photo) => photo.id));
    const validIds = collagePhotoIds.filter((id) => availableIds.has(id));
    if (validIds.length !== collagePhotoIds.length) useProjectStore.getState().updateCollageDraft({ photoIds: validIds });
    if (validIds.length < 2) setActiveRightTab(previousRightTab.current);
  }, [collagePhotoIds, isCollageMode, photos, setActiveRightTab]);
  useEffect(() => {
    const openCollageExport = () => {
      setExportMode('collage');
      setExportDialogOpen(true);
    };
    window.addEventListener('still:request-collage-export', openCollageExport);
    return () => window.removeEventListener('still:request-collage-export', openCollageExport);
  }, []);
  const beginExport = async (request: ExportRequest) => {
    if (exporting) return;
    if (request.exportMode === 'photos' && request.specs.length === 0) return;
    setExporting(true);
    setExportError(null);
    setExportNoticeOpen(false);
    try {
      if (request.exportMode === 'collage') {
        const project = useProjectStore.getState();
        const payload = createCollageExportPayload(project.collageDraft, project.photos, request.outputPath, request.quality);
        if (payload.items.length < 2) return;
        const path = await composeCollage(payload.items, payload.config);
        setCollageExportPath(path);
        return;
      }
      const report = await exportImageBatch(request.specs, request.options);
      const exportedByPath = new Map(request.specs.map((spec) => [spec.source.path, spec]));
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
  return <>
    {isMobile && isCollageMode ? (
      <MobileCollageEditor onExit={() => setActiveRightTab(previousRightTab.current)} />
    ) : <AppShell
      titleBarVisible={!(isTauri() && platform() === 'android')}
      titleBar={<><TitleBar onOpenSettings={() => setSettingsOpen(true)}
        onToggleTheme={theme.toggleResolvedTheme} themeMode={theme.resolvedTheme} />
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} /></>}
      progress={<><TaskProgressBar />{error && <Alert severity="error" onClose={clearError}>{error}</Alert>}
        {exportError && <Alert severity="error" onClose={() => setExportError(null)}>{exportError}</Alert>}</>}
      mainCanvas={<MainCanvas onImport={choosePhotos} onImportFolder={chooseFolder} showFolderImport={desktopFolderImport}
        dragActive={dragActive} onExport={() => { setExportMode('photos'); setExportDialogOpen(true); }} exporting={exporting} />}
      rightPanel={photos.length === 0 ? null : mobileLayout ? <MobileRightPanel open={inspectorOpen} onOpenChange={setInspectorOpen} />
        : <RightPanel collapsed={!inspectorOpen} onCollapsedChange={(collapsed) => setInspectorOpen(!collapsed)} />}
      filmStrip={<FilmStrip items={photos.map((photo) => ({ id: photo.id, label: photo.path.split(/[\\/]/).pop() ?? photo.path,
        thumbPath: photo.thumbUrl, thumbRevision: photo.thumbRevision }))}
        selectedId={selectedId} onSelect={selectPhoto} onImport={choosePhotos} />}
    />}
    <ExportDialog open={exportDialogOpen} exportMode={exportMode} onClose={() => setExportDialogOpen(false)} onExport={(request) => void beginExport(request)} />
    <ExportCompletionNotice
      report={exportReport}
      open={exportNoticeOpen}
      onClose={() => setExportNoticeOpen(false)}
    />
    <Snackbar open={collageExportPath !== null} autoHideDuration={motionTokens.duration.slow * 16} onClose={() => setCollageExportPath(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert severity="success" variant="filled" onClose={() => setCollageExportPath(null)}>Collage exported to {collageExportPath}</Alert>
    </Snackbar>
  </>;
}
export default App;
