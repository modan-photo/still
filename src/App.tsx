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
import type {
  BatchExportReport,
  ExportMode,
  ExportRequest,
  PhotoExportRequest,
} from './types/export';
import { MobileCollageEditor } from './layout/MobileCollageEditor';
import type { RightPanelTabId } from './layout/rightPanelTabs';
import { motionTokens } from './theme/tokens';
import { restoreViewAfterCollage } from './services/collageMode';
import { createExportRetry, markExportedPhotosClean } from './services/exportCompletion';
import { errorMessage } from './services/errorMessages';

/**
 * Application composition root.
 *
 * Connects the long-lived project/UI stores to the responsive layout, coordinates
 * mode transitions, and owns dialogs or notifications shared by multiple feature
 * regions. Processing stays in services and stores; layout slots receive narrow
 * callbacks and render-ready data.
 */
function App({ theme }: { theme: ThemeController }) {
  const systemFontsEnabled = useUIStore((state) => state.systemFontsEnabled);

  // Refresh the font catalogue whenever system-font access changes. When system
  // fonts are disabled, migrate existing watermark specs onto trusted bundled fonts.
  useEffect(() => {
    void listWatermarkFonts(systemFontsEnabled).then((fonts) => {
      if (systemFontsEnabled) return;
      // Prefer the bundled Chinese-capable font for broad text coverage, retaining
      // another bundled font as a last-resort fallback.
      const fallback =
        fonts.find((font) => font.builtin && font.family === 'Noto Sans SC') ??
        fonts.find((font) => font.builtin);
      if (!fallback) return;
      const project = useProjectStore.getState();
      for (const photo of project.photos) {
        const stamp = photo.spec.watermark;
        const font = stamp?.font;
        if (!stamp || !font) continue;
        // Keep the selected family when a bundled copy exists, but always use the
        // resource path returned by the backend.
        const bundled = fonts.find((entry) => entry.builtin && entry.family === font.family);
        const allowed = bundled ?? fallback;
        if (font.family !== allowed.family || font.path !== allowed.path) {
          project.updateSpec(photo.id, {
            watermark: { ...stamp, font: { ...font, family: allowed.family, path: allowed.path } },
          });
        }
      }
    });
  }, [systemFontsEnabled]);

  const muiTheme = useMuiTheme();
  // The inspector switches at the MUI md breakpoint; only narrower phone layouts
  // replace the whole application shell for collage editing.
  const mobileLayout = useMediaQuery(muiTheme.breakpoints.down('md'));
  const isMobile = useMediaQuery('(max-width: 767px)');
  const inspectorOpen = useUIStore((state) => state.inspectorOpen);
  const setInspectorOpen = useUIStore((state) => state.setInspectorOpen);
  const activeRightTab = useUIStore((state) => state.activeRightTab);
  const setActiveRightTab = useUIStore((state) => state.setActiveRightTab);
  // Last non-collage tab is the restoration target when collage mode exits.
  const previousRightTab = useRef<RightPanelTabId>('frame');
  // Tracks the transition edge out of collage mode without triggering a rerender.
  const wasCollageMode = useRef(false);
  const isCollageMode = activeRightTab === 'collage';
  const photos = useProjectStore((state) => state.photos);
  const collagePhotoIds = useProjectStore((state) => state.collageDraft.photoIds);
  const selectedId = useProjectStore((state) => state.selectedId);
  const selectPhoto = useProjectStore((state) => state.selectPhoto);
  const { choosePhotos, chooseFolder, dragActive, error, clearError } = useImageImport();
  // One dialog serves both export modes, while progress and errors belong to the
  // application shell rather than an individual canvas or inspector component.
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportInFlight = useRef(false);
  const [lastPhotoRequest, setLastPhotoRequest] = useState<PhotoExportRequest | null>(null);
  const [exportReport, setExportReport] = useState<BatchExportReport | null>(null);
  const [exportNoticeOpen, setExportNoticeOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('photos');
  const [collageExportPath, setCollageExportPath] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Folder selection is desktop-only; Android uses individual file picking.
  const desktopFolderImport = isTauri() && platform() !== 'android';
  // Read the latest store value at invocation time so shortcut callbacks never
  // toggle from a stale captured `inspectorOpen` value.
  const toggleInspector = useCallback(
    () => setInspectorOpen(!useUIStore.getState().inspectorOpen),
    [setInspectorOpen],
  );
  useEditorShortcuts(toggleInspector, choosePhotos);

  useEffect(() => {
    // Grid selection has no meaning in an empty project. Clear both UI and project
    // selection state when the final photo is removed.
    if (photos.length !== 0) return;
    useUIStore.getState().setGridPanelOpen(false);
    useProjectStore.getState().setSelectedIds([]);
  }, [photos.length]);

  useEffect(() => {
    // Record collage entry, then restore any view state captured by the mode service
    // on the first transition back to a standard inspector tab.
    if (activeRightTab === 'collage') {
      wasCollageMode.current = true;
      return;
    }
    if (wasCollageMode.current) restoreViewAfterCollage();
    wasCollageMode.current = false;
    // Only non-collage tabs are valid restoration targets.
    previousRightTab.current = activeRightTab;
  }, [activeRightTab]);

  useEffect(() => {
    if (!isCollageMode) return;
    // Photos can be removed while the collage editor is open. Purge stale IDs and
    // leave collage mode when fewer than two usable photos remain.
    const availableIds = new Set(photos.map((photo) => photo.id));
    const validIds = collagePhotoIds.filter((id) => availableIds.has(id));
    if (validIds.length !== collagePhotoIds.length)
      useProjectStore.getState().updateCollageDraft({ photoIds: validIds });
    if (validIds.length < 2) setActiveRightTab(previousRightTab.current);
  }, [collagePhotoIds, isCollageMode, photos, setActiveRightTab]);

  useEffect(() => {
    // Desktop and mobile collage controls live in different component trees. A DOM
    // event provides one bridge to this application-owned export dialog.
    const openCollageExport = () => {
      setExportMode('collage');
      setExportDialogOpen(true);
    };
    window.addEventListener('still:request-collage-export', openCollageExport);
    return () => window.removeEventListener('still:request-collage-export', openCollageExport);
  }, []);

  /** Execute either export workflow while enforcing one active export at a time. */
  const beginExport = async (request: ExportRequest) => {
    // Guard duplicate submissions and empty photo batches before entering busy state.
    if (exportInFlight.current) return;
    if (request.exportMode === 'photos' && request.items.length === 0) return;
    exportInFlight.current = true;
    setExporting(true);
    setExportError(null);
    setExportNoticeOpen(false);
    if (request.exportMode === 'photos') setLastPhotoRequest(request);
    try {
      if (request.exportMode === 'collage') {
        // Snapshot current project state at submission time and translate the UI
        // draft into the renderer's wire format.
        const project = useProjectStore.getState();
        const payload = createCollageExportPayload(
          project.collageDraft,
          project.photos,
          request.outputPath,
          request.quality,
        );
        payload.config.outputFormat = request.format;
        // Photo deletion can race with an already-open export dialog.
        if (payload.items.length < 2) return;
        const path = await composeCollage(payload.items, payload.config);
        setCollageExportPath(path);
        return;
      }
      const report = await exportImageBatch(request.items, request.options);
      // Mark successful photos clean only when their current spec still matches what
      // was exported; `markClean` protects edits made during the async operation.
      markExportedPhotosClean(request, report);
      setExportReport(report);
      setExportNoticeOpen(true);
    } catch (reason) {
      const error = normalizeError(reason);
      if (request.exportMode === 'photos') {
        const cancelled = error.code === 'cancelled';
        setExportReport({
          succeeded: 0,
          failed: cancelled ? 0 : request.items.length,
          skipped: 0,
          cancelled: cancelled ? request.items.length : 0,
          cancellationRequested: cancelled,
          outputDirectory: request.options.outputDirectory,
          results: request.items.map((item) => ({
            itemId: item.itemId,
            sourcePath: item.spec.source.path,
            outputPath: null,
            status: cancelled ? 'cancelled' : 'failed',
            code: error.code,
            message: error.message,
          })),
        });
        setExportNoticeOpen(true);
      } else setExportError(errorMessage(error));
    } finally {
      exportInFlight.current = false;
      setExporting(false);
    }
  };
  const canRetry = Boolean(
    lastPhotoRequest &&
    exportReport &&
    lastPhotoRequest.items.some(
      (item) =>
        photos.some((photo) => photo.id === item.photoId && photo.path === item.spec.source.path) &&
        exportReport.results.some(
          (result) =>
            result.itemId === item.itemId &&
            (result.status === 'failed' || result.status === 'cancelled'),
        ),
    ),
  );
  const retryExport = () => {
    if (!lastPhotoRequest || !exportReport) return;
    const request = createExportRetry(lastPhotoRequest, exportReport);
    if (request) void beginExport(request);
  };
  return (
    <>
      {/* Phones replace the full editor shell during collage editing. Wider layouts
        keep collage inside the standard canvas and inspector composition. */}
      {isMobile && isCollageMode ? (
        <MobileCollageEditor onExit={() => setActiveRightTab(previousRightTab.current)} />
      ) : (
        <AppShell
          titleBarVisible={!(isTauri() && platform() === 'android')}
          titleBar={
            <>
              <TitleBar
                onOpenSettings={() => setSettingsOpen(true)}
                onToggleTheme={theme.toggleResolvedTheme}
                themeMode={theme.resolvedTheme}
              />
              <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            </>
          }
          progress={
            <>
              <TaskProgressBar />
              {error && (
                <Alert severity="error" onClose={clearError}>
                  {error}
                </Alert>
              )}
              {exportError && (
                <Alert severity="error" onClose={() => setExportError(null)}>
                  {exportError}
                </Alert>
              )}
            </>
          }
          mainCanvas={
            <MainCanvas
              onImport={choosePhotos}
              onImportFolder={chooseFolder}
              showFolderImport={desktopFolderImport}
              dragActive={dragActive}
              onExport={() => {
                setExportMode('photos');
                setExportDialogOpen(true);
              }}
              exporting={exporting}
            />
          }
          rightPanel={
            photos.length === 0 ? null : mobileLayout ? (
              <MobileRightPanel open={inspectorOpen} onOpenChange={setInspectorOpen} />
            ) : (
              <RightPanel
                collapsed={!inspectorOpen}
                onCollapsedChange={(collapsed) => setInspectorOpen(!collapsed)}
              />
            )
          }
          filmStrip={
            <FilmStrip
              items={photos.map((photo) => ({
                id: photo.id,
                label: photo.path.split(/[\\/]/).pop() ?? photo.path,
                thumbPath: photo.thumbUrl,
                thumbRevision: photo.thumbRevision,
              }))}
              selectedId={selectedId}
              onSelect={selectPhoto}
              onImport={choosePhotos}
            />
          }
        />
      )}
      {/* Export UI remains outside the responsive shell so replacing the mobile layout
        cannot interrupt an open dialog or completion notice. */}
      <ExportDialog
        open={exportDialogOpen}
        exportMode={exportMode}
        onClose={() => setExportDialogOpen(false)}
        onExport={(request) => void beginExport(request)}
      />
      <ExportCompletionNotice
        report={exportReport}
        open={exportNoticeOpen}
        onClose={() => setExportNoticeOpen(false)}
        canRetry={canRetry && !exporting}
        onRetry={retryExport}
      />
      {/* Collage produces one output path, so a lightweight success snackbar is enough;
        batch photo exports use the detailed completion notice above. */}
      <Snackbar
        open={collageExportPath !== null}
        autoHideDuration={motionTokens.duration.slow * 16}
        onClose={() => setCollageExportPath(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setCollageExportPath(null)}>
          Collage exported to {collageExportPath}
        </Alert>
      </Snackbar>
    </>
  );
}
export default App;
