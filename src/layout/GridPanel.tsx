import { useVirtualizer } from '@tanstack/react-virtual';
import {
  alpha,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Icon } from '../components/Icons';
import { ThumbnailImage } from '../components/ThumbnailImage';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useUndoStore } from '../stores/undoStore';
import type { SyncModule } from '../render/spec';
import { photoRangeIds, sortedPhotos, type PhotoSort } from '../services/photoCollection';
import { useTranslation, type MessageKey } from '../i18n/messages';

const DEFAULT_HEIGHT_PERCENT = 60;
const MIN_HEIGHT_PERCENT = 30;
const MAX_HEIGHT_PERCENT = 80;
// Dragging below this threshold dismisses the panel rather than leaving a sliver.
const DISMISS_HEIGHT_PERCENT = 20;
const KEYBOARD_RESIZE_STEP = 5;
const THUMBNAIL_MIN_WIDTH = {
  small: 80,
  medium: 120,
  large: 180,
} as const;

type ThumbnailSize = keyof typeof THUMBNAIL_MIN_WIDTH;

const THUMBNAIL_SIZE_OPTIONS = [
  { value: 'small', label: 'smallThumbnails', density: 3 },
  { value: 'medium', label: 'mediumThumbnails', density: 2 },
  { value: 'large', label: 'largeThumbnails', density: 1 },
] as const satisfies ReadonlyArray<{ value: ThumbnailSize; label: MessageKey; density: number }>;

type DragState = {
  pointerId: number;
  startY: number;
  startHeightPercent: number;
  mainCanvasHeight: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Expandable, virtualized photo grid layered over the lower canvas.
 *
 * The panel combines navigation, batch selection, render-setting propagation and
 * height resizing. Rows—not individual photos—are virtualized because column count
 * changes responsively with the measured panel width and thumbnail-size preference.
 */
export function GridPanel() {
  const t = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridSurfaceRef = useRef<HTMLDivElement>(null);
  // High-frequency pointer values live in refs so resizing does not depend on stale
  // render closures. React state is updated only for values that affect rendering.
  const dragState = useRef<DragState | null>(null);
  const liveHeightPercent = useRef(DEFAULT_HEIGHT_PERCENT);
  const closeTimer = useRef<number | null>(null);
  const heightResetTimer = useRef<number | null>(null);
  const widthMeasureFrame = useRef<number | null>(null);
  const [heightPercent, setHeightPercent] = useState(DEFAULT_HEIGHT_PERCENT);
  const [dragging, setDragging] = useState(false);
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>('medium');
  const [sortOrder, setSortOrder] = useState<PhotoSort>('import');
  const selectionAnchor = useRef<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncSourceId, setSyncSourceId] = useState('');
  const [syncModules, setSyncModules] = useState<Record<SyncModule, boolean>>({
    border: true,
    watermark: true,
    adjustments: true,
  });
  const theme = useTheme();
  const photos = useProjectStore((state) => state.photos);
  const visiblePhotos = sortedPhotos(photos, sortOrder);
  const selectedId = useProjectStore((state) => state.currentPhotoId);
  const selectedIds = useProjectStore((state) => state.selectedIds);
  const selectPhoto = useProjectStore((state) => state.selectPhoto);
  const setSelectedIds = useProjectStore((state) => state.setSelectedIds);
  const toggleSelectedId = useProjectStore((state) => state.toggleSelectedId);
  const removePhotos = useProjectStore((state) => state.removePhotos);
  const applySpecToPhotos = useProjectStore((state) => state.applySpecToPhotos);
  const syncSpecModules = useProjectStore((state) => state.syncSpecModules);
  const pushUndo = useUndoStore((state) => state.push);
  const gridPanelOpen = useUIStore((state) => state.gridPanelOpen);
  const setGridPanelOpen = useUIStore((state) => state.setGridPanelOpen);
  const gridGap = theme.still.spacing.md;
  // Derive a complete row model from the measured surface width. The same values
  // feed CSS grid and the virtualizer so their geometry cannot drift apart.
  const thumbnailMinWidth = THUMBNAIL_MIN_WIDTH[thumbnailSize];
  const columnCount = Math.max(
    1,
    Math.floor((gridWidth + gridGap) / (thumbnailMinWidth + gridGap)),
  );
  const thumbnailWidth =
    gridWidth > 0 ? (gridWidth - gridGap * (columnCount - 1)) / columnCount : thumbnailMinWidth;
  const rowHeight = thumbnailWidth * 0.75;
  const rowCount = Math.ceil(visiblePhotos.length / columnCount);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight + gridGap,
    // A few off-screen rows prevent blank flashes during fast wheel scrolling.
    overscan: 3,
    getItemKey: (rowIndex) => visiblePhotos[rowIndex * columnCount]?.id ?? rowIndex,
  });

  useEffect(() => {
    const target = gridSurfaceRef.current;
    if (!target) return;
    const updateWidth = () => {
      const nextWidth = target.getBoundingClientRect().width;
      // ResizeObserver can fire repeatedly during panel animation; publish at most
      // one width measurement per animation frame.
      if (widthMeasureFrame.current !== null)
        window.cancelAnimationFrame(widthMeasureFrame.current);
      widthMeasureFrame.current = window.requestAnimationFrame(() => {
        setGridWidth(nextWidth);
        widthMeasureFrame.current = null;
      });
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(target);
    return () => {
      observer.disconnect();
      if (widthMeasureFrame.current !== null)
        window.cancelAnimationFrame(widthMeasureFrame.current);
    };
  }, []);

  useEffect(() => {
    // Column count, thumbnail density and panel width all invalidate row estimates.
    virtualizer.measure();
  }, [columnCount, gridWidth, rowHeight, thumbnailSize, virtualizer]);

  useEffect(() => {
    // Opening the panel should reveal the current photo even when selection changed
    // through the filmstrip or keyboard while the grid was closed.
    if (!gridPanelOpen) return;
    const selectedIndex = visiblePhotos.findIndex((photo) => photo.id === selectedId);
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(Math.floor(selectedIndex / columnCount), { align: 'auto' });
    }
  }, [columnCount, gridPanelOpen, photos.length, selectedId, sortOrder, virtualizer]);

  useEffect(() => {
    // Batch selection is scoped to one open-grid session.
    if (gridPanelOpen || !multiSelectMode) return;
    setMultiSelectMode(false);
    setSelectedIds([]);
  }, [gridPanelOpen, multiSelectMode, setSelectedIds]);

  useEffect(() => {
    if (!gridPanelOpen || !multiSelectMode) return;

    const handleMultiSelectShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[role="dialog"]')) return;

      if (event.key === 'Escape') {
        // Capture phase and stopImmediatePropagation ensure the editor-level Escape
        // handler does not close the entire grid before selection mode is cleared.
        event.preventDefault();
        event.stopImmediatePropagation();
        setMultiSelectMode(false);
        setSelectedIds([]);
        return;
      }

      const textEntryActive =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          Boolean(target.closest('input, textarea, select, [role="combobox"], [role="dialog"]')));
      if (
        !textEntryActive &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'a'
      ) {
        // Ctrl/Cmd+A is intentionally active only while batch selection owns the grid.
        event.preventDefault();
        event.stopImmediatePropagation();
        setSelectedIds(visiblePhotos.map((photo) => photo.id));
      }
    };

    window.addEventListener('keydown', handleMultiSelectShortcut, { capture: true });
    return () =>
      window.removeEventListener('keydown', handleMultiSelectShortcut, { capture: true });
  }, [gridPanelOpen, multiSelectMode, photos, sortOrder, setSelectedIds]);

  // Timers may outlive a closing animation; release them with the panel component.
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      if (heightResetTimer.current !== null) window.clearTimeout(heightResetTimer.current);
    },
    [],
  );

  const updateHeight = (nextHeightPercent: number) => {
    // Keep a synchronous copy for pointer-up, which may occur before React commits
    // the latest height state.
    liveHeightPercent.current = nextHeightPercent;
    setHeightPercent(nextHeightPercent);
  };

  const finishResize = () => {
    const finalHeight = liveHeightPercent.current;
    dragState.current = null;
    setDragging(false);

    if (finalHeight < DISMISS_HEIGHT_PERCENT) {
      // Reset after the close transition so the next open starts at the default size
      // without visibly jumping while it slides away.
      setGridPanelOpen(false);
      heightResetTimer.current = window.setTimeout(() => {
        updateHeight(DEFAULT_HEIGHT_PERCENT);
        heightResetTimer.current = null;
      }, theme.still.motion.duration.fast);
      return;
    }

    updateHeight(clamp(finalHeight, MIN_HEIGHT_PERCENT, MAX_HEIGHT_PERCENT));
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (heightResetTimer.current !== null) {
      window.clearTimeout(heightResetTimer.current);
      heightResetTimer.current = null;
    }
    // Pointer pixels are converted to percentages relative to the canvas that owns
    // the panel, not the full browser window.
    const mainCanvasHeight = panelRef.current?.parentElement?.getBoundingClientRect().height ?? 0;
    if (mainCanvasHeight <= 0) return;

    dragState.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeightPercent: liveHeightPercent.current,
      mainCanvasHeight,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaPercent = ((drag.startY - event.clientY) / drag.mainCanvasHeight) * 100;
    updateHeight(clamp(drag.startHeightPercent + deltaPercent, 0, MAX_HEIGHT_PERCENT));
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) return;
    finishResize();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const selectAndScheduleClose = (photoId: string) => {
    // Single click previews the choice briefly before returning to the editor canvas.
    selectPhoto(photoId);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setGridPanelOpen(false);
      closeTimer.current = null;
    }, theme.still.motion.duration.slow);
  };

  const selectAndKeepOpen = (photoId: string) => {
    // Double click cancels the single-click close timer and keeps browsing context.
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    selectPhoto(photoId);
  };

  const enterMultiSelect = () => {
    selectionAnchor.current = selectedId;
    setSelectedIds([]);
    setMultiSelectMode(true);
  };

  const exitMultiSelect = () => {
    selectionAnchor.current = null;
    setMultiSelectMode(false);
    setSelectedIds([]);
  };

  const selectInGrid = (photoId: string, shift: boolean, toggle: boolean) => {
    if ((shift || toggle || multiSelectMode) && closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (shift) {
      const anchor = selectionAnchor.current ?? selectedId ?? photoId;
      selectionAnchor.current = anchor;
      setMultiSelectMode(true);
      setSelectedIds(photoRangeIds(visiblePhotos, anchor, photoId));
      return;
    }
    selectionAnchor.current = photoId;
    if (multiSelectMode || toggle) {
      setMultiSelectMode(true);
      toggleSelectedId(photoId);
    } else selectAndScheduleClose(photoId);
  };

  const focusGridPhoto = (photoId: string) => {
    const index = visiblePhotos.findIndex((photo) => photo.id === photoId);
    if (index < 0) return;
    virtualizer.scrollToIndex(Math.floor(index / columnCount), { align: 'auto' });
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const buttons =
          gridSurfaceRef.current?.querySelectorAll<HTMLButtonElement>('[data-grid-photo-id]');
        [...(buttons ?? [])].find((button) => button.dataset.gridPhotoId === photoId)?.focus();
      }),
    );
  };

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, photoId: string) => {
    if (multiSelectMode && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      event.stopPropagation();
      removeSelectedPhotos();
      return;
    }
    const index = visiblePhotos.findIndex((photo) => photo.id === photoId);
    const nextIndex =
      event.key === 'ArrowLeft'
        ? index - 1
        : event.key === 'ArrowRight'
          ? index + 1
          : event.key === 'ArrowUp'
            ? index - columnCount
            : event.key === 'ArrowDown'
              ? index + columnCount
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? visiblePhotos.length - 1
                  : -1;
    if (nextIndex < 0 || nextIndex >= visiblePhotos.length) return;
    event.preventDefault();
    event.stopPropagation();
    const nextId = visiblePhotos[nextIndex].id;
    if (event.shiftKey) selectInGrid(nextId, true, false);
    else if (!multiSelectMode) selectPhoto(nextId);
    focusGridPhoto(nextId);
  };

  const removeSelectedPhotos = () => {
    if (selectedIds.length === 0) return;
    // One snapshot groups the batch removal into a single undo operation.
    pushUndo(removePhotos(selectedIds));
    setMultiSelectMode(false);
    setSelectedIds([]);
  };

  const sourcePhoto = photos.find((photo) => photo.id === selectedId);
  const applyCurrentSpec = () => {
    // Full apply copies every render module while preserving each target's source.
    if (!sourcePhoto || selectedIds.length === 0) return;
    applySpecToPhotos(sourcePhoto.id, selectedIds);
    setApplyConfirmOpen(false);
  };
  const selectedSyncModules = (Object.keys(syncModules) as SyncModule[]).filter(
    (module) => syncModules[module],
  );
  // The source may itself be selected, but it is not a sync target.
  const syncTargetCount = selectedIds.filter((id) => id !== syncSourceId).length;
  const openSyncSettings = () => {
    setSyncSourceId(selectedId ?? photos[0]?.id ?? '');
    setSyncOpen(true);
  };
  const syncSettings = () => {
    if (!syncSourceId || syncTargetCount === 0 || selectedSyncModules.length === 0) return;
    syncSpecModules(syncSourceId, selectedIds, selectedSyncModules);
    setSyncOpen(false);
  };

  return (
    <Box
      ref={panelRef}
      component="section"
      aria-label={t('photoGridPanel')}
      aria-hidden={!gridPanelOpen}
      className={`absolute bottom-0 left-0 right-0 z-10 flex min-h-0 flex-col overflow-hidden border-t ${gridPanelOpen ? '' : 'pointer-events-none'}`}
      sx={(theme) => {
        const colors = theme.still.colors[theme.palette.mode];

        return {
          height: `${heightPercent}%`,
          maxHeight: `${MAX_HEIGHT_PERCENT}%`,
          // Translate instead of conditionally mounting so close/open animations and
          // virtualized scroll state remain stable.
          transform: gridPanelOpen ? 'translateY(0)' : 'translateY(100%)',
          transitionProperty: 'transform',
          transitionDuration: `${gridPanelOpen ? theme.still.motion.duration.base : theme.still.motion.duration.fast}ms`,
          transitionTimingFunction: theme.still.motion.easing,
          borderColor: colors.border.subtle,
          borderTopLeftRadius: `${theme.still.radius.lg}px`,
          borderTopRightRadius: `${theme.still.radius.lg}px`,
          backgroundColor: alpha(colors.bg.surface, theme.still.glass.backgroundOpacity),
          backdropFilter: theme.still.glass.backdropFilter,
          WebkitBackdropFilter: theme.still.glass.backdropFilter,
          boxShadow: gridPanelOpen ? theme.still.shadow.panelUp : 'none',
          willChange: 'transform',
        };
      }}
    >
      <div
        role="separator"
        aria-label={t('resizePhotoGrid')}
        aria-orientation="horizontal"
        aria-valuemin={MIN_HEIGHT_PERCENT}
        aria-valuemax={MAX_HEIGHT_PERCENT}
        aria-valuenow={Math.round(heightPercent)}
        tabIndex={gridPanelOpen ? 0 : -1}
        className="relative z-40 flex h-6 shrink-0 touch-none cursor-row-resize items-center justify-center outline-none"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={() => {
          if (dragState.current) finishResize();
        }}
        onKeyDown={(event) => {
          // The separator is keyboard-resizable for parity with pointer dragging.
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          const direction = event.key === 'ArrowUp' ? 1 : -1;
          updateHeight(
            clamp(
              heightPercent + direction * KEYBOARD_RESIZE_STEP,
              MIN_HEIGHT_PERCENT,
              MAX_HEIGHT_PERCENT,
            ),
          );
        }}
      >
        <span
          className={`h-1 w-9 rounded-full bg-subtle transition-colors duration-fast ease-app ${dragging ? 'bg-accent' : 'hover:bg-secondary'}`}
          aria-hidden="true"
        />
      </div>

      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4 text-sm text-primary">
        <span>
          {multiSelectMode
            ? t('selectedPhotosCount', { count: selectedIds.length })
            : t('photoCount', { count: photos.length })}
        </span>
        {multiSelectMode ? (
          <div className="flex items-center gap-1">
            <Button
              size="small"
              aria-label={t('applyCurrentToSelected')}
              disabled={!sourcePhoto || selectedIds.length === 0}
              onClick={() => setApplyConfirmOpen(true)}
            >
              {t('apply')}
            </Button>
            <Button
              size="small"
              aria-label={t('syncSelectedSettings')}
              disabled={selectedIds.length === 0}
              onClick={openSyncSettings}
            >
              {t('sync')}
            </Button>
            <Button
              size="small"
              onClick={() => setSelectedIds(visiblePhotos.map((photo) => photo.id))}
              disabled={selectedIds.length === photos.length}
            >
              {t('selectAll')}
            </Button>
            <Button size="small" onClick={exitMultiSelect}>
              {t('cancelSelection')}
            </Button>
            <Tooltip title={t('removeSelectedPhotos')} arrow>
              <span className="inline-flex">
                <IconButton
                  size="small"
                  aria-label={t('removeSelectedPhotos')}
                  disabled={selectedIds.length === 0}
                  onClick={removeSelectedPhotos}
                  sx={(currentTheme) => {
                    const colors = currentTheme.still.colors[currentTheme.palette.mode];
                    return {
                      width: 36,
                      height: 36,
                      borderRadius: `${currentTheme.still.radius.md}px`,
                      color: colors.danger,
                      transition: currentTheme.transitions.create(['background-color', 'color'], {
                        duration: currentTheme.still.motion.duration.fast,
                        easing: currentTheme.still.motion.easing,
                      }),
                      '&::after': { content: '\"\"', position: 'absolute', inset: -4 },
                      '&:hover': { backgroundColor: colors.bg.elevated, color: colors.danger },
                    };
                  }}
                >
                  <Icon name="trash" size={17} />
                </IconButton>
              </span>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <TextField
              select
              size="small"
              value={sortOrder}
              label={t('sort')}
              aria-label={t('sortPhotos')}
              onChange={(event) => setSortOrder(event.target.value as PhotoSort)}
              sx={{ minWidth: 135 }}
            >
              <MenuItem value="import">{t('importOrder')}</MenuItem>
              <MenuItem value="name">{t('nameAscending')}</MenuItem>
              <MenuItem value="name-desc">{t('nameDescending')}</MenuItem>
            </TextField>
            <Tooltip title={t('selectPhotos')} arrow>
              <IconButton
                size="small"
                aria-label={t('selectPhotos')}
                onClick={enterMultiSelect}
                sx={(currentTheme) => {
                  const colors = currentTheme.still.colors[currentTheme.palette.mode];
                  return {
                    width: 36,
                    height: 36,
                    border: '1px solid',
                    borderColor: colors.border.subtle,
                    borderRadius: `${currentTheme.still.radius.md}px`,
                    color: colors.text.secondary,
                    transition: currentTheme.transitions.create(['background-color', 'color'], {
                      duration: currentTheme.still.motion.duration.fast,
                      easing: currentTheme.still.motion.easing,
                    }),
                    '&::after': { content: '\"\"', position: 'absolute', inset: -4 },
                    '&:hover': { backgroundColor: colors.bg.elevated, color: colors.accent },
                  };
                }}
              >
                <Icon name="select" size={20} />
              </IconButton>
            </Tooltip>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={thumbnailSize}
              aria-label={t('thumbnailSize')}
              onChange={(_, nextSize: ThumbnailSize | null) => {
                if (nextSize) setThumbnailSize(nextSize);
              }}
              sx={(currentTheme) => {
                const colors = currentTheme.still.colors[currentTheme.palette.mode];

                return {
                  height: 36,
                  '& .MuiToggleButton-root': {
                    width: 36,
                    padding: 0,
                    color: colors.text.secondary,
                    borderColor: colors.border.subtle,
                    transition: currentTheme.transitions.create(['background-color', 'color'], {
                      duration: currentTheme.still.motion.duration.fast,
                      easing: currentTheme.still.motion.easing,
                    }),
                    '&:hover': { color: colors.text.primary, backgroundColor: colors.bg.elevated },
                    '&.Mui-selected': { color: colors.accent, backgroundColor: colors.bg.elevated },
                    '&.Mui-selected:hover': {
                      color: colors.accent,
                      backgroundColor: colors.bg.elevated,
                    },
                  },
                };
              }}
            >
              {THUMBNAIL_SIZE_OPTIONS.map((option) => (
                <Tooltip key={option.value} title={t(option.label)} arrow>
                  <ToggleButton
                    value={option.value}
                    aria-label={t(option.label)}
                    tabIndex={gridPanelOpen ? 0 : -1}
                  >
                    <ThumbnailSizeIcon density={option.density} />
                  </ToggleButton>
                </Tooltip>
              ))}
            </ToggleButtonGroup>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain py-4"
      >
        <div
          ref={gridSurfaceRef}
          className="relative mx-4"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            // Convert the virtual row index back into its contiguous photo slice.
            const firstPhotoIndex = virtualRow.index * columnCount;
            const rowPhotos = visiblePhotos.slice(firstPhotoIndex, firstPhotoIndex + columnCount);

            return (
              <div
                key={virtualRow.key}
                className="absolute inset-x-0 top-0 grid gap-3"
                style={{
                  height: rowHeight,
                  gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailMinWidth}px, 1fr))`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {rowPhotos.map((photo) => {
                  const selected = multiSelectMode
                    ? selectedIds.includes(photo.id)
                    : selectedId === photo.id;
                  const label = photo.path.split(/[\\/]/).pop() ?? photo.path;

                  return (
                    <button
                      key={photo.id}
                      data-grid-photo-id={photo.id}
                      type="button"
                      aria-label={t(
                        multiSelectMode && selected ? 'deselectNamedPhoto' : 'selectNamedPhoto',
                        { name: label },
                      )}
                      aria-pressed={selected}
                      tabIndex={gridPanelOpen ? 0 : -1}
                      title={label}
                      className={`group relative aspect-[4/3] min-w-0 overflow-hidden rounded-md border-2 bg-app-elevated outline-none transition-[border-color,box-shadow,transform] duration-fast ease-app hover:-translate-y-0.5 hover:shadow-elev2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selected ? 'border-accent shadow-elev1' : 'border-subtle'}`}
                      onClick={(event) => {
                        // Ignore the synthetic second click of a double-click so a
                        // batch item toggles only once.
                        if (multiSelectMode && event.detail > 1) return;
                        selectInGrid(photo.id, event.shiftKey, event.ctrlKey || event.metaKey);
                      }}
                      onKeyDown={(event) => handleGridKeyDown(event, photo.id)}
                      onDoubleClick={() => {
                        if (!multiSelectMode) selectAndKeepOpen(photo.id);
                      }}
                    >
                      <ThumbnailImage
                        thumbPath={photo.thumbUrl}
                        revision={photo.thumbRevision}
                        label={label}
                      />
                      {multiSelectMode && (
                        <span
                          className="pointer-events-none absolute left-0 top-0 grid h-11 w-11 place-items-center"
                          aria-hidden="true"
                        >
                          <span
                            className={`grid h-[22px] w-[22px] place-items-center rounded-full border transition-[background-color,border-color,color] duration-fast ease-app ${selected ? 'border-accent bg-accent text-[var(--color-bg-surface)]' : 'border-subtle bg-app-surface text-secondary'}`}
                          >
                            <span className={selected ? 'opacity-100' : 'opacity-0'}>
                              <Icon name="check" size={14} strokeWidth={2.2} />
                            </span>
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <Dialog
        open={applyConfirmOpen}
        onClose={() => setApplyConfirmOpen(false)}
        aria-labelledby="apply-current-spec-title"
      >
        <DialogTitle id="apply-current-spec-title">{t('applyCurrentSettings')}</DialogTitle>
        <DialogContent>
          {t('applyCurrentSettingsHint', {
            source: sourcePhoto?.path.split(/[\\/]/).pop() ?? t('currentPhotoFallback'),
            count: selectedIds.length,
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApplyConfirmOpen(false)}>{t('cancel')}</Button>
          <Button variant="contained" onClick={applyCurrentSpec}>
            {t('apply')}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        aria-labelledby="sync-settings-title"
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id="sync-settings-title">{t('syncSettings')}</DialogTitle>
        <DialogContent>
          <div className="space-y-3 pt-1">
            <TextField
              select
              fullWidth
              size="small"
              label={t('sourcePhoto')}
              value={syncSourceId}
              onChange={(event) => setSyncSourceId(event.target.value)}
            >
              {photos.map((photo) => (
                <MenuItem key={photo.id} value={photo.id}>
                  {photo.path.split(/[\\/]/).pop()}
                </MenuItem>
              ))}
            </TextField>
            <div>
              <span className="block text-xs font-medium text-secondary">{t('modules')}</span>
              {(['border', 'watermark', 'adjustments'] as const).map((module) => (
                <FormControlLabel
                  key={module}
                  control={
                    <Checkbox
                      size="small"
                      checked={syncModules[module]}
                      onChange={(event) =>
                        setSyncModules((current) => ({
                          ...current,
                          [module]: event.target.checked,
                        }))
                      }
                    />
                  }
                  label={t(
                    module === 'border'
                      ? 'frame'
                      : module === 'watermark'
                        ? 'watermark'
                        : 'adjustments',
                  )}
                />
              ))}
            </div>
            <p className="m-0 text-xs leading-5 text-secondary">
              {t('syncSettingsHint', { count: syncTargetCount })}
            </p>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncOpen(false)}>{t('cancel')}</Button>
          <Button
            variant="contained"
            disabled={!syncSourceId || syncTargetCount === 0 || selectedSyncModules.length === 0}
            onClick={syncSettings}
          >
            {t('sync')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function ThumbnailSizeIcon({ density }: { density: number }) {
  // Generate the density glyph from geometry so all size options share one icon.
  const gap = 1.5;
  const cellSize = (16 - gap * (density - 1)) / density;
  const cells = Array.from({ length: density * density }, (_, index) => ({
    x: 1 + (index % density) * (cellSize + gap),
    y: 1 + Math.floor(index / density) * (cellSize + gap),
  }));

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden="true"
    >
      {cells.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={cell.x}
          y={cell.y}
          width={cellSize}
          height={cellSize}
          rx="1"
        />
      ))}
    </svg>
  );
}
