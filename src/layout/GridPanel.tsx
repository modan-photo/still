import { useVirtualizer } from "@tanstack/react-virtual";
import { alpha, Box, ToggleButton, ToggleButtonGroup, Tooltip, useTheme } from "@mui/material";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cacheAssetUrl } from "../services/tauri/image";
import { useProjectStore } from "../stores/projectStore";
import { useUIStore } from "../stores/uiStore";

const DEFAULT_HEIGHT_PERCENT = 60;
const MIN_HEIGHT_PERCENT = 30;
const MAX_HEIGHT_PERCENT = 80;
const DISMISS_HEIGHT_PERCENT = 20;
const KEYBOARD_RESIZE_STEP = 5;
const THUMBNAIL_MIN_WIDTH = {
  small: 80,
  medium: 120,
  large: 180,
} as const;

type ThumbnailSize = keyof typeof THUMBNAIL_MIN_WIDTH;

const THUMBNAIL_SIZE_OPTIONS = [
  { value: "small", label: "Small thumbnails", density: 3 },
  { value: "medium", label: "Medium thumbnails", density: 2 },
  { value: "large", label: "Large thumbnails", density: 1 },
] as const satisfies ReadonlyArray<{ value: ThumbnailSize; label: string; density: number }>;

type DragState = {
  pointerId: number;
  startY: number;
  startHeightPercent: number;
  workspaceHeight: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function GridPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridSurfaceRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);
  const liveHeightPercent = useRef(DEFAULT_HEIGHT_PERCENT);
  const closeTimer = useRef<number | null>(null);
  const heightResetTimer = useRef<number | null>(null);
  const [heightPercent, setHeightPercent] = useState(DEFAULT_HEIGHT_PERCENT);
  const [dragging, setDragging] = useState(false);
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>("medium");
  const [gridWidth, setGridWidth] = useState(0);
  const theme = useTheme();
  const photos = useProjectStore((state) => state.photos);
  const selectedId = useProjectStore((state) => state.selectedId);
  const selectPhoto = useProjectStore((state) => state.selectPhoto);
  const gridPanelOpen = useUIStore((state) => state.gridPanelOpen);
  const setGridPanelOpen = useUIStore((state) => state.setGridPanelOpen);
  const gridGap = theme.still.spacing.md;
  const thumbnailMinWidth = THUMBNAIL_MIN_WIDTH[thumbnailSize];
  const columnCount = Math.max(1, Math.floor((gridWidth + gridGap) / (thumbnailMinWidth + gridGap)));
  const thumbnailWidth = gridWidth > 0
    ? (gridWidth - gridGap * (columnCount - 1)) / columnCount
    : thumbnailMinWidth;
  const rowHeight = thumbnailWidth * 0.75;
  const rowCount = Math.ceil(photos.length / columnCount);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight + gridGap,
    overscan: 3,
    getItemKey: (rowIndex) => photos[rowIndex * columnCount]?.id ?? rowIndex,
  });

  useEffect(() => {
    const target = gridSurfaceRef.current;
    if (!target) return;
    const updateWidth = () => setGridWidth(target.getBoundingClientRect().width);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    virtualizer.measure();
  }, [columnCount, rowHeight, virtualizer]);

  useEffect(() => {
    if (!gridPanelOpen) return;
    const selectedIndex = photos.findIndex((photo) => photo.id === selectedId);
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(Math.floor(selectedIndex / columnCount), { align: "auto" });
    }
  }, [columnCount, gridPanelOpen, photos.length, selectedId, virtualizer]);

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    if (heightResetTimer.current !== null) window.clearTimeout(heightResetTimer.current);
  }, []);

  const updateHeight = (nextHeightPercent: number) => {
    liveHeightPercent.current = nextHeightPercent;
    setHeightPercent(nextHeightPercent);
  };

  const finishResize = () => {
    const finalHeight = liveHeightPercent.current;
    dragState.current = null;
    setDragging(false);

    if (finalHeight < DISMISS_HEIGHT_PERCENT) {
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
    const workspaceHeight = panelRef.current?.parentElement?.getBoundingClientRect().height ?? 0;
    if (workspaceHeight <= 0) return;

    dragState.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeightPercent: liveHeightPercent.current,
      workspaceHeight,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaPercent = ((drag.startY - event.clientY) / drag.workspaceHeight) * 100;
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
    selectPhoto(photoId);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setGridPanelOpen(false);
      closeTimer.current = null;
    }, theme.still.motion.duration.slow);
  };

  const selectAndKeepOpen = (photoId: string) => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    selectPhoto(photoId);
  };

  return (
    <Box
      ref={panelRef}
      component="section"
      aria-label="Photo grid panel"
      aria-hidden={!gridPanelOpen}
      className={`absolute inset-x-0 bottom-0 z-10 flex min-h-0 flex-col overflow-hidden border-t ${gridPanelOpen ? "" : "pointer-events-none"}`}
      sx={(theme) => {
        const colors = theme.still.colors[theme.palette.mode];

        return {
          height: `${heightPercent}%`,
          transform: gridPanelOpen ? "translateY(0)" : "translateY(100%)",
          transitionProperty: "transform",
          transitionDuration: `${gridPanelOpen ? theme.still.motion.duration.base : theme.still.motion.duration.fast}ms`,
          transitionTimingFunction: theme.still.motion.easing,
          borderColor: colors.border.subtle,
          borderTopLeftRadius: `${theme.still.radius.lg}px`,
          borderTopRightRadius: `${theme.still.radius.lg}px`,
          backgroundColor: alpha(colors.bg.surface, theme.still.glass.backgroundOpacity),
          backdropFilter: theme.still.glass.backdropFilter,
          WebkitBackdropFilter: theme.still.glass.backdropFilter,
          boxShadow: gridPanelOpen ? theme.still.shadow.panelUp : "none",
          willChange: "transform",
        };
      }}
    >
      <div
        role="separator"
        aria-label="Resize photo grid panel"
        aria-orientation="horizontal"
        aria-valuemin={MIN_HEIGHT_PERCENT}
        aria-valuemax={MAX_HEIGHT_PERCENT}
        aria-valuenow={Math.round(heightPercent)}
        tabIndex={gridPanelOpen ? 0 : -1}
        className="flex h-6 shrink-0 touch-none cursor-row-resize items-center justify-center outline-none"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={() => {
          if (dragState.current) finishResize();
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const direction = event.key === "ArrowUp" ? 1 : -1;
          updateHeight(clamp(heightPercent + direction * KEYBOARD_RESIZE_STEP, MIN_HEIGHT_PERCENT, MAX_HEIGHT_PERCENT));
        }}
      >
        <span
          className={`h-1 w-9 rounded-full bg-subtle transition-colors duration-fast ease-app ${dragging ? "bg-accent" : "hover:bg-secondary"}`}
          aria-hidden="true"
        />
      </div>

      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4 text-sm text-primary">
        <span>{photos.length} photos</span>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={thumbnailSize}
          aria-label="Thumbnail size"
          onChange={(_, nextSize: ThumbnailSize | null) => {
            if (nextSize) setThumbnailSize(nextSize);
          }}
          sx={(currentTheme) => {
            const colors = currentTheme.still.colors[currentTheme.palette.mode];

            return {
              height: 28,
              "& .MuiToggleButton-root": {
                width: 32,
                padding: 0,
                color: colors.text.secondary,
                borderColor: colors.border.subtle,
                transition: currentTheme.transitions.create(["background-color", "color"], {
                  duration: currentTheme.still.motion.duration.fast,
                  easing: currentTheme.still.motion.easing,
                }),
                "&:hover": { color: colors.text.primary, backgroundColor: colors.bg.elevated },
                "&.Mui-selected": { color: colors.accent, backgroundColor: colors.bg.elevated },
                "&.Mui-selected:hover": { color: colors.accent, backgroundColor: colors.bg.elevated },
              },
            };
          }}
        >
          {THUMBNAIL_SIZE_OPTIONS.map((option) => (
            <Tooltip key={option.value} title={option.label} arrow>
              <ToggleButton value={option.value} aria-label={option.label} tabIndex={gridPanelOpen ? 0 : -1}>
                <ThumbnailSizeIcon density={option.density} />
              </ToggleButton>
            </Tooltip>
          ))}
        </ToggleButtonGroup>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4">
        <div
          ref={gridSurfaceRef}
          className="relative mx-4"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const firstPhotoIndex = virtualRow.index * columnCount;
            const rowPhotos = photos.slice(firstPhotoIndex, firstPhotoIndex + columnCount);

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
                  const selected = selectedId === photo.id;
                  const label = photo.path.split(/[\\/]/).pop() ?? photo.path;

                  return (
                    <button
                      key={photo.id}
                      type="button"
                      aria-label={`Select ${label}`}
                      aria-pressed={selected}
                      tabIndex={gridPanelOpen ? 0 : -1}
                      title={label}
                      className={`group relative aspect-[4/3] min-w-0 overflow-hidden rounded-md border-2 bg-app-elevated outline-none transition-[border-color,box-shadow,transform] duration-fast ease-app hover:-translate-y-0.5 hover:shadow-elev2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selected ? "border-accent shadow-elev1" : "border-subtle"}`}
                      onClick={() => selectAndScheduleClose(photo.id)}
                      onDoubleClick={() => selectAndKeepOpen(photo.id)}
                    >
                      <img
                        src={cacheAssetUrl(photo.thumbUrl)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-contain"
                      />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </Box>
  );
}

function ThumbnailSizeIcon({ density }: { density: number }) {
  const gap = 1.5;
  const cellSize = (16 - gap * (density - 1)) / density;
  const cells = Array.from({ length: density * density }, (_, index) => ({
    x: 1 + (index % density) * (cellSize + gap),
    y: 1 + Math.floor(index / density) * (cellSize + gap),
  }));

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
      {cells.map((cell) => (
        <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={cellSize} height={cellSize} rx="1" />
      ))}
    </svg>
  );
}
