import { Button, CircularProgress, IconButton, Tooltip } from '@mui/material';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useImagePreview } from '../hooks/useImagePreview';
import { useProjectStore, type ProjectPhoto } from '../stores/projectStore';
import { useUndoStore } from '../stores/undoStore';
import { Icon } from '../components/Icons';
import { EmptyState } from '../components/EmptyState';
import { motionTokens } from '../theme/tokens';
import { renderBorderPreview } from '../render/border';
import type { AdjustmentsSpec, BorderSpec, WatermarkSpec } from '../types/renderSpec';
import { renderWatermarkPreview } from '../render/watermark';
import { renderAdjustedPreview } from '../render/adjustments';
import { listWatermarkFonts } from '../services/tauri/watermark';
import { CollagePreview } from '../components/collage/CollagePreview';
import { useUIStore } from '../stores/uiStore';

type MainCanvasProps = {
  onImport: () => void;
  onImportFolder: () => void;
  showFolderImport: boolean;
  dragActive: boolean;
  onExport: () => void;
  exporting: boolean;
};

export function MainCanvas({ onImport, onImportFolder, showFolderImport, dragActive, onExport, exporting }: MainCanvasProps) {
  const photos = useProjectStore((state) => state.photos);
  const isCollageMode = useUIStore((state) => state.activeRightTab === 'collage');
  const setGridPanelOpen = useUIStore((state) => state.setGridPanelOpen);
  const selectedId = useProjectStore((state) => state.selectedId);
  const removePhotos = useProjectStore((state) => state.removePhotos);
  const pushUndo = useUndoStore((state) => state.push);
  const photo = photos.find((entry) => entry.id === selectedId);
  const focusedLayout = photos.length <= 1;
  const lastPhoto = useRef<ProjectPhoto | null>(photo ?? null);
  const [exitingPhoto, setExitingPhoto] = useState<ProjectPhoto | null>(null);
  if (photo) lastPhoto.current = photo;

  useEffect(() => {
    if (photo) {
      setExitingPhoto(null);
      return;
    }
    if (!lastPhoto.current) return;
    setExitingPhoto(lastPhoto.current);
    const timer = window.setTimeout(() => {
      setExitingPhoto(null);
      lastPhoto.current = null;
    }, motionTokens.duration.fast);
    return () => window.clearTimeout(timer);
  }, [photo]);

  useEffect(() => {
    if (isCollageMode) setGridPanelOpen(false);
  }, [isCollageMode, setGridPanelOpen]);

  const renderedPhoto = photo ?? exitingPhoto ?? lastPhoto.current;
  const removeCurrentPhoto = () => {
    if (!photo) return;
    pushUndo(removePhotos([photo.id]));
  };

  return <main className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-app-base" aria-label="Photo workspace" tabIndex={0}
    data-editor-shortcut-scope="canvas" onDragOver={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()}>
    {!photo && !isCollageMode && <EmptyState onImportPhotos={onImport} onImportFolder={onImportFolder} showFolderImport={showFolderImport} />}
    <div
      className={`absolute inset-0 min-h-0 min-w-0 p-3 transition-opacity duration-fast ease-app ${isCollageMode ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      aria-hidden={!isCollageMode}
    >
      {isCollageMode && <CollagePreview />}
    </div>
    {renderedPhoto && (
      <div className={`absolute inset-0 flex min-h-0 flex-col transition-opacity duration-fast ease-app ${focusedLayout ? 'p-5' : 'p-3'} ${photo && !isCollageMode ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={isCollageMode}>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <Button size="small" onClick={onImport}>Import photos</Button>
          <div className="flex items-center gap-2">
            <Button size="small" disabled={!photo || exporting} onClick={onExport}>{exporting ? 'Exporting…' : 'Export'}</Button>
            <Tooltip title="Remove current photo (Del)" arrow>
              <span>
                <IconButton
                  aria-label="Remove current photo"
                  disabled={!photo}
                  onClick={removeCurrentPhoto}
                  sx={(theme) => {
                    const colors = theme.still.colors[theme.palette.mode];

                    return {
                      width: 36,
                      height: 36,
                      borderRadius: `${theme.still.radius.md}px`,
                      color: colors.text.secondary,
                      transition: theme.transitions.create(["background-color", "color"], {
                        duration: theme.still.motion.duration.fast,
                        easing: theme.still.motion.easing,
                      }),
                      "&:hover": {
                        backgroundColor: colors.bg.elevated,
                        color: colors.danger,
                      },
                      "&.Mui-focusVisible": {
                        outline: `2px solid ${colors.accent}`,
                        outlineOffset: 2,
                      },
                    };
                  }}
                >
                  <Icon name="trash" size={18} />
                </IconButton>
              </span>
            </Tooltip>
          </div>
        </div>
        <Preview key={renderedPhoto.id} photoId={renderedPhoto.id} path={renderedPhoto.path} frame={renderedPhoto.spec.border} stamp={renderedPhoto.spec.watermark} adjustments={renderedPhoto.spec.adjustments} originalWidth={renderedPhoto.width} originalHeight={renderedPhoto.height} focusedLayout={focusedLayout} />
        <div className="mt-2 truncate text-center text-xs text-secondary" title={renderedPhoto.path}>{renderedPhoto.path.split(/[\\/]/).pop()} · {renderedPhoto.width} × {renderedPhoto.height}</div>
      </div>
    )}
    {dragActive && <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-app-surface/90">Drop photos to import</div>}
  </main>;
}

function Preview({ photoId, path, frame, stamp, adjustments, originalWidth, originalHeight, focusedLayout }: { photoId: string; path: string; frame?: BorderSpec; stamp?: WatermarkSpec; adjustments?: AdjustmentsSpec; originalWidth: number; originalHeight: number; focusedLayout: boolean }) {
  const { image, loading, error } = useImagePreview(path);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const markSize = useRef<{ width: number; height: number } | null>(null);
  const updateSpec = useProjectStore((state) => state.updateSpec);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  useEffect(() => {
    const target = canvas.current;
    if (!target || !image) return;
    let cancelled = false;
    const timer = window.setTimeout(() => { void (async () => {
      const source = adjustments ? renderAdjustedPreview(image, adjustments) : image;
      if (frame) {
        renderBorderPreview(target, source, frame, originalWidth, originalHeight);
      } else {
        target.width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
        target.height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
        target.getContext('2d')?.drawImage(source, 0, 0);
      }
      if (stamp) {
        await listWatermarkFonts();
        if (!cancelled) {
          const bounds = await renderWatermarkPreview(target, stamp, Math.max(originalWidth, originalHeight));
          markSize.current = bounds ? { width: bounds.width, height: bounds.height } : null;
        }
      }
    })(); }, 16);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [adjustments, frame, image, originalHeight, originalWidth, stamp]);
  useEffect(() => () => {
    if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; }
  }, []);
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current || !stamp?.freePosition || stamp.tiled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    let x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    let y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const rendered = markSize.current;
    const previewLongEdge = Math.max(event.currentTarget.width, event.currentTarget.height);
    const margin = 32 * previewLongEdge / Math.max(originalWidth, originalHeight);
    const edgeX = rendered ? Math.min(0.45, (rendered.width / 2 + margin) / event.currentTarget.width) : 0.08;
    const edgeY = rendered ? Math.min(0.45, (rendered.height / 2 + margin) / event.currentTarget.height) : 0.08;
    const targetsX = [edgeX, 0.5, 1 - edgeX];
    const targetsY = [edgeY, 0.5, 1 - edgeY];
    const thresholdX = 12 / rect.width;
    const thresholdY = 12 / rect.height;
    const snapX = targetsX.find((target) => Math.abs(target - x) <= thresholdX);
    const snapY = targetsY.find((target) => Math.abs(target - y) <= thresholdY);
    if (snapX !== undefined) x = snapX;
    if (snapY !== undefined) y = snapY;
    setGuides({ x: snapX, y: snapY });
    updateSpec(photoId, { watermark: { ...stamp, offsetX: 0, offsetY: 0, freePosition: { x, y } } });
  };
  return <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
    {loading && <CircularProgress size={28} aria-label="Loading preview" />}
    {error && (
      <div
        role="alert"
        className="flex max-w-sm flex-col items-center gap-2 rounded-lg border border-subtle bg-app-surface px-6 py-5 text-center text-secondary"
      >
        <Icon name="image-off" size={28} />
        <span className="text-sm">Unable to load photo</span>
        <span className="text-xs">{error.message}</span>
      </div>
    )}
    <div className={`relative inline-flex ${focusedLayout ? 'max-h-[90%] max-w-[90%]' : 'max-h-full max-w-full'}`}>
      <canvas ref={canvas} aria-label="Photo preview" data-preview-long-edge={image ? Math.max(image.naturalWidth, image.naturalHeight) : undefined}
        onPointerDown={(event) => { if (!stamp?.freePosition || stamp.tiled) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); move(event); }}
        onPointerMove={move}
        onPointerUp={(event) => { dragging.current = false; setGuides({}); event.currentTarget.releasePointerCapture(event.pointerId); }}
        onLostPointerCapture={() => { dragging.current = false; setGuides({}); }}
        style={{ display: image ? 'block' : 'none', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', touchAction: stamp?.freePosition ? 'none' : undefined, cursor: stamp?.freePosition && !stamp.tiled ? 'grab' : undefined }} />
      {guides.x !== undefined && <span className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent shadow-[0_0_5px_var(--color-accent)]" style={{ left: `${guides.x * 100}%` }} />}
      {guides.y !== undefined && <span className="pointer-events-none absolute inset-x-0 z-10 h-px bg-accent shadow-[0_0_5px_var(--color-accent)]" style={{ top: `${guides.y * 100}%` }} />}
    </div>
  </div>;
}
