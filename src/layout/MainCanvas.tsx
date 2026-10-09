import { Button, CircularProgress, IconButton, Tooltip } from '@mui/material';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useImagePreview } from '../hooks/useImagePreview';
import { useCropEdit } from '../hooks/useCropEdit';
import { useProjectStore, type ProjectPhoto } from '../stores/projectStore';
import { useUndoStore } from '../stores/undoStore';
import { Icon } from '../components/Icons';
import { EmptyState } from '../components/EmptyState';
import { cropOverlayTokens, motionTokens } from '../theme/tokens';
import { renderBorderPreview } from '../render/border';
import type {
  AdjustmentsSpec,
  BorderSpec,
  CropSpec,
  RotationSpec,
  WatermarkSpec,
} from '../types/renderSpec';
import { renderRotatedPreview, rotatedDimensions } from '../render/rotation';
import { renderWatermarkPreview } from '../render/watermark';
import { applyAdjustmentsToImageData, renderAdjustedPreview } from '../render/adjustments';
import { cropPixelRect, renderCroppedPreview } from '../render/crop';
import { listWatermarkFonts } from '../services/tauri/watermark';
import { CollagePreview } from '../components/collage/CollagePreview';
import { CropOverlay } from '../components/CropOverlay';
import { useUIStore } from '../stores/uiStore';
import { useEditHistoryStore } from '../stores/editHistoryStore';
import { useTranslation } from '../i18n/messages';

type MainCanvasProps = {
  onImport: () => void;
  onImportFolder: () => void;
  showFolderImport: boolean;
  dragActive: boolean;
  onExport: () => void;
  exporting: boolean;
};

/**
 * Central editor workspace that switches between empty, photo and collage states.
 * Photo pixels are delegated to `Preview`; this component owns workspace actions,
 * transitions, drag feedback and selection/removal behavior.
 */
export function MainCanvas({
  onImport,
  onImportFolder,
  showFolderImport,
  dragActive,
  onExport,
  exporting,
}: MainCanvasProps) {
  const t = useTranslation();
  const photos = useProjectStore((state) => state.photos);
  const isCollageMode = useUIStore((state) => state.activeRightTab === 'collage');
  const setGridPanelOpen = useUIStore((state) => state.setGridPanelOpen);
  const selectedId = useProjectStore((state) => state.currentPhotoId);
  const removePhotos = useProjectStore((state) => state.removePhotos);
  const pushUndo = useUndoStore((state) => state.push);
  const canUndoEdit = useEditHistoryStore((state) => state.undoStack.length > 0);
  const canRedoEdit = useEditHistoryStore((state) => state.redoStack.length > 0);
  const undoEdit = useProjectStore((state) => state.undoEdit);
  const redoEdit = useProjectStore((state) => state.redoEdit);
  const photo = photos.find((entry) => entry.id === selectedId);
  // A single-photo project can afford more canvas padding than the filmstrip layout.
  const focusedLayout = photos.length <= 1;
  // Preserve the last photo briefly so removal can fade the preview out instead of
  // tearing it from the DOM on the same frame as the store update.
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
    // Grid and collage both occupy the canvas; collage always takes precedence.
    if (isCollageMode) setGridPanelOpen(false);
  }, [isCollageMode, setGridPanelOpen]);

  const renderedPhoto = photo ?? exitingPhoto ?? lastPhoto.current;
  const removeCurrentPhoto = () => {
    if (!photo) return;
    // Store the complete removal snapshot so the global undo toast can restore it.
    pushUndo(removePhotos([photo.id]));
  };

  return (
    <main
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-app-base"
      aria-label={t('photoWorkspace')}
      tabIndex={0}
      data-editor-shortcut-scope="canvas"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      {!photo && !isCollageMode && (
        <EmptyState
          onImportPhotos={onImport}
          onImportFolder={onImportFolder}
          showFolderImport={showFolderImport}
        />
      )}
      {/* Collage remains mounted only while active; opacity controls the workspace swap. */}
      <div
        className={`absolute inset-0 min-h-0 min-w-0 p-3 transition-opacity duration-fast ease-app ${isCollageMode ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden={!isCollageMode}
      >
        {isCollageMode && <CollagePreview />}
      </div>
      {renderedPhoto && (
        <div
          className={`absolute inset-0 flex min-h-0 flex-col transition-opacity duration-fast ease-app ${focusedLayout ? 'p-5' : 'p-3'} ${photo && !isCollageMode ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          aria-hidden={isCollageMode}
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
            <Button size="small" onClick={onImport}>
              {t('importPhotos')}
            </Button>
            <div className="flex items-center gap-2">
              <Tooltip title={t('undoEditShortcut')} arrow>
                <span>
                  <IconButton
                    size="small"
                    aria-label={t('undoEdit')}
                    disabled={!canUndoEdit}
                    onClick={undoEdit}
                  >
                    <Icon name="undo" size={18} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={t('redoEditShortcut')} arrow>
                <span>
                  <IconButton
                    size="small"
                    aria-label={t('redoEdit')}
                    disabled={!canRedoEdit}
                    onClick={redoEdit}
                  >
                    <Icon name="redo" size={18} />
                  </IconButton>
                </span>
              </Tooltip>
              <Button size="small" disabled={!photo || exporting} onClick={onExport}>
                {exporting ? t('exporting') : t('export')}
              </Button>
              <Tooltip title={t('removeCurrentPhotoShortcut')} arrow>
                <span>
                  <IconButton
                    aria-label={t('removeCurrentPhoto')}
                    disabled={!photo}
                    onClick={removeCurrentPhoto}
                    sx={(theme) => {
                      const colors = theme.still.colors[theme.palette.mode];

                      return {
                        width: 36,
                        height: 36,
                        borderRadius: `${theme.still.radius.md}px`,
                        color: colors.text.secondary,
                        transition: theme.transitions.create(['background-color', 'color'], {
                          duration: theme.still.motion.duration.fast,
                          easing: theme.still.motion.easing,
                        }),
                        '&:hover': {
                          backgroundColor: colors.bg.elevated,
                          color: colors.danger,
                        },
                        '&.Mui-focusVisible': {
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
          <Preview
            key={renderedPhoto.id}
            photoId={renderedPhoto.id}
            path={renderedPhoto.path}
            rotation={renderedPhoto.spec.rotation}
            crop={renderedPhoto.spec.crop}
            frame={renderedPhoto.spec.border}
            stamp={renderedPhoto.spec.watermark}
            adjustments={renderedPhoto.spec.adjustments}
            originalWidth={renderedPhoto.width}
            originalHeight={renderedPhoto.height}
            focusedLayout={focusedLayout}
            editable={Boolean(photo)}
          />
          <div
            className="mt-2 truncate text-center text-xs text-secondary"
            title={renderedPhoto.path}
          >
            {renderedPhoto.path.split(/[\\/]/).pop()} · {renderedPhoto.width} ×{' '}
            {renderedPhoto.height}
          </div>
        </div>
      )}
      {dragActive && (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-app-surface/90">
          {t('dropPhotosToImport')}
        </div>
      )}
    </main>
  );
}

/** Draws the decoded photo and all non-destructive edits onto one preview canvas. */
function Preview({
  photoId,
  path,
  rotation,
  crop,
  frame,
  stamp,
  adjustments,
  originalWidth,
  originalHeight,
  focusedLayout,
  editable,
}: {
  photoId: string;
  path: string;
  rotation?: RotationSpec;
  crop?: CropSpec;
  frame?: BorderSpec;
  stamp?: WatermarkSpec;
  adjustments?: AdjustmentsSpec;
  originalWidth: number;
  originalHeight: number;
  focusedLayout: boolean;
  editable: boolean;
}) {
  const t = useTranslation();
  const { image, loading, error } = useImagePreview(path);
  const cropEdit = useCropEdit();
  const cropSession = cropEdit.session?.photoId === photoId ? cropEdit.session : null;
  const draftCrop = cropSession?.draft;
  const previewCrop = draftCrop ?? crop;
  const rotatedSourceSize = rotatedDimensions(originalWidth, originalHeight, rotation);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cropCanvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const activeRightTab = useUIStore((state) => state.activeRightTab);
  const cropEditing =
    editable &&
    activeRightTab === 'transform' &&
    Boolean(crop?.enabled) &&
    Boolean(image) &&
    !cropSession?.dismissed;
  const lastCrop = useRef(crop);
  if (crop?.enabled) lastCrop.current = crop;
  const [retainCropContext, setRetainCropContext] = useState(false);
  // Reset and Original leave crop mode immediately; only tab exits retain its fade.
  const showCropContext = editable && Boolean(crop?.enabled) && (cropEditing || retainCropContext);
  const [availableSize, setAvailableSize] = useState({ width: 0, height: 0 });
  const [renderSize, setRenderSize] = useState({ width: originalWidth, height: originalHeight });
  const dragging = useRef(false);
  const markSize = useRef<{ width: number; height: number } | null>(null);
  const previewPixelScale = useRef(1);
  const updateSpec = useProjectStore((state) => state.updateSpec);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  useEffect(() => {
    if (cropEditing) setRetainCropContext(true);
    if (!editable) setRetainCropContext(false);
  }, [cropEditing, editable]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailableSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const target = cropCanvas.current;
    if (!target || !image || !showCropContext) return;
    const source = renderRotatedPreview(image, rotation);
    const size = rotatedDimensions(image.naturalWidth, image.naturalHeight, rotation);
    target.width = size.width;
    target.height = size.height;
    target.getContext('2d')?.drawImage(source, 0, 0);
    const context = target.getContext('2d');
    if (adjustments && context) {
      const pixels = context.getImageData(0, 0, target.width, target.height);
      context.putImageData(applyAdjustmentsToImageData(pixels, adjustments), 0, 0);
    }
  }, [adjustments, image, rotation, showCropContext]);
  useLayoutEffect(() => {
    const target = canvas.current;
    if (!target || !image) return;
    let cancelled = false;
    // Rotation, flips and reset redraw before paint, without a timer or CSS transform.
    void (async () => {
      let source = renderRotatedPreview(image, rotation);
      const croppedSize = cropPixelRect(
        rotatedSourceSize.width,
        rotatedSourceSize.height,
        previewCrop,
      );
      if (previewCrop?.enabled) source = renderCroppedPreview(source, previewCrop);
      if (adjustments) {
        if (source instanceof HTMLImageElement) source = renderAdjustedPreview(source, adjustments);
        else {
          const context = source.getContext('2d');
          if (context) {
            const pixels = context.getImageData(0, 0, source.width, source.height);
            context.putImageData(applyAdjustmentsToImageData(pixels, adjustments), 0, 0);
          }
        }
      }
      const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
      previewPixelScale.current = sourceWidth / Math.max(1, croppedSize.width);
      if (frame) {
        renderBorderPreview(target, source, frame, croppedSize.width, croppedSize.height);
      } else {
        target.width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
        target.height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
        target.getContext('2d')?.drawImage(source, 0, 0);
      }
      setRenderSize({ width: target.width, height: target.height });
      markSize.current = null;
      if (stamp) {
        // Async watermark work uses a private snapshot so old renders cannot paint
        // over a newer orientation while an image watermark is still loading.
        const stamped = document.createElement('canvas');
        stamped.width = target.width;
        stamped.height = target.height;
        stamped.getContext('2d')?.drawImage(target, 0, 0);
        const pixelScale = previewPixelScale.current;
        // Font discovery must complete before text measurement and rendering.
        await listWatermarkFonts();
        if (!cancelled) {
          // Scale source pixels independently of the border-expanded/cropped canvas.
          const bounds = await renderWatermarkPreview(
            stamped,
            stamp,
            Math.max(originalWidth, originalHeight),
            pixelScale,
          );
          if (!cancelled) {
            const context = target.getContext('2d');
            context?.clearRect(0, 0, target.width, target.height);
            context?.drawImage(stamped, 0, 0);
            markSize.current = bounds ? { width: bounds.width, height: bounds.height } : null;
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    adjustments,
    previewCrop,
    frame,
    image,
    originalHeight,
    originalWidth,
    rotatedSourceSize.height,
    rotatedSourceSize.width,
    rotation,
    stamp,
  ]);
  // Explicitly release the canvas backing store and its potentially large pixel buffer.
  useEffect(
    () => () => {
      if (canvas.current) {
        canvas.current.width = 0;
        canvas.current.height = 0;
      }
      if (cropCanvas.current) {
        cropCanvas.current.width = 0;
        cropCanvas.current.height = 0;
      }
    },
    [],
  );
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current || !stamp?.freePosition || stamp.tiled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    let x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    let y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const rendered = markSize.current;
    // Convert the desired 32-source-pixel inset into preview-canvas coordinates.
    const margin = 32 * previewPixelScale.current;
    const edgeX = rendered
      ? Math.min(0.45, (rendered.width / 2 + margin) / event.currentTarget.width)
      : 0.08;
    const edgeY = rendered
      ? Math.min(0.45, (rendered.height / 2 + margin) / event.currentTarget.height)
      : 0.08;
    const targetsX = [edgeX, 0.5, 1 - edgeX];
    const targetsY = [edgeY, 0.5, 1 - edgeY];
    // Twelve CSS pixels provides a predictable snap affordance at any zoom level.
    const thresholdX = 12 / rect.width;
    const thresholdY = 12 / rect.height;
    const snapX = targetsX.find((target) => Math.abs(target - x) <= thresholdX);
    const snapY = targetsY.find((target) => Math.abs(target - y) <= thresholdY);
    if (snapX !== undefined) x = snapX;
    if (snapY !== undefined) y = snapY;
    setGuides({ x: snapX, y: snapY });
    // Free positioning supersedes the legacy anchor offsets.
    updateSpec(photoId, {
      watermark: { ...stamp, offsetX: 0, offsetY: 0, freePosition: { x, y } },
    });
  };
  const viewSize =
    showCropContext && image
      ? rotatedDimensions(image.naturalWidth, image.naturalHeight, rotation)
      : renderSize;
  const paddingFactor = focusedLayout ? 0.9 : 1;
  const handleGutter = showCropContext ? cropOverlayTokens.handleHitSize : 0;
  const displayScale = Math.max(
    0,
    Math.min(
      1,
      ((availableSize.width - handleGutter) * paddingFactor) / viewSize.width,
      ((availableSize.height - handleGutter) * paddingFactor) / viewSize.height,
    ),
  );
  return (
    <div
      ref={viewport}
      className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
    >
      {loading && <CircularProgress size={28} aria-label={t('loadingPreview')} />}
      {error && (
        <div
          role="alert"
          className="flex max-w-sm flex-col items-center gap-2 rounded-lg border border-subtle bg-app-surface px-6 py-5 text-center text-secondary"
        >
          <Icon name="image-off" size={28} />
          <span className="text-sm">{t('photoLoadFailed')}</span>
          <span className="text-xs">{error.message}</span>
        </div>
      )}
      <div
        className="relative shrink-0"
        style={{
          width: viewSize.width * displayScale,
          height: viewSize.height * displayScale,
          transitionProperty: 'none',
          animation: 'none',
        }}
      >
        <canvas
          ref={canvas}
          aria-label={t('photoPreview')}
          data-preview-long-edge={
            image ? Math.max(image.naturalWidth, image.naturalHeight) : undefined
          }
          aria-hidden={showCropContext}
          onPointerDown={(event) => {
            if (!stamp?.freePosition || stamp.tiled) return;
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            move(event);
          }}
          onPointerMove={move}
          onPointerUp={(event) => {
            dragging.current = false;
            setGuides({});
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => {
            dragging.current = false;
            setGuides({});
          }}
          style={{
            display: image && !showCropContext ? 'block' : 'none',
            width: '100%',
            height: '100%',
            transitionProperty: 'none',
            animation: 'none',
            touchAction: stamp?.freePosition ? 'none' : undefined,
            cursor: stamp?.freePosition && !stamp.tiled ? 'grab' : undefined,
          }}
        />
        <canvas
          ref={cropCanvas}
          aria-label={t('cropSourceImage')}
          aria-hidden={!showCropContext}
          style={{
            display: showCropContext && image ? 'block' : 'none',
            width: '100%',
            height: '100%',
            transitionProperty: 'none',
            animation: 'none',
          }}
        />
        {showCropContext && image && lastCrop.current && (
          <CropOverlay
            rect={lastCrop.current.rect}
            aspect={lastCrop.current.aspect}
            sourceWidth={rotatedSourceSize.width}
            sourceHeight={rotatedSourceSize.height}
            visible={cropEditing}
            coordinateSpaceKey={`${rotation?.angle ?? 0}:${Boolean(rotation?.flipH)}:${Boolean(rotation?.flipV)}`}
            onPreviewChange={(rect) =>
              cropEdit.preview(
                photoId,
                rect && lastCrop.current ? { ...lastCrop.current, rect } : null,
              )
            }
            onCommit={(rect, aspect) => {
              const current = useProjectStore
                .getState()
                .photos.find((photo) => photo.id === photoId)?.spec.crop;
              if (current?.enabled && current.aspect === aspect)
                updateSpec(photoId, { crop: { ...current, rect } });
            }}
            onCancel={() => cropEdit.cancel(photoId)}
            onConfirm={() => cropEdit.confirm(photoId)}
            onExited={() => setRetainCropContext(false)}
          />
        )}
        {!showCropContext && guides.x !== undefined && (
          <span
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent shadow-[0_0_5px_var(--color-accent)]"
            style={{ left: `${guides.x * 100}%` }}
          />
        )}
        {!showCropContext && guides.y !== undefined && (
          <span
            className="pointer-events-none absolute inset-x-0 z-10 h-px bg-accent shadow-[0_0_5px_var(--color-accent)]"
            style={{ top: `${guides.y * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
