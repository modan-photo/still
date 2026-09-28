import { useVirtualizer } from "@tanstack/react-virtual";
import { IconButton, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import { useEffect, useRef } from "react";
import { Icon } from "../components/Icons";
import { ThumbnailItem } from "../components/ThumbnailItem";
import { useProjectStore } from "../stores/projectStore";
import { useUIStore } from "../stores/uiStore";
import { enterCollageMode } from "../services/collageMode";

export type FilmStripItem = {
  id: string;
  label: string;
  thumbPath: string;
  thumbRevision?: number;
};

type FilmStripProps = {
  items: FilmStripItem[];
  onImport: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function FilmStrip({ items, onImport, selectedId, onSelect }: FilmStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("md"));
  const itemPitch = compact ? 64 : 80;
  const photoCount = useProjectStore((state) => state.photos.length);
  const showGridButton = photoCount >= 2;
  const gridPanelOpen = useUIStore((state) => state.gridPanelOpen);
  const toggleGridPanel = useUIStore((state) => state.toggleGridPanel);
  const activeRightTab = useUIStore((state) => state.activeRightTab);
  const collageActive = activeRightTab === 'collage';

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => itemPitch,
    overscan: 6,
    getItemKey: (index) => items[index].id,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [itemPitch, virtualizer]);

  useEffect(() => {
    const index = items.findIndex((item) => item.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [selectedId, items.length, virtualizer]);

  return (
    <div className="flex h-full min-w-0 bg-app-surface">
      <div
        ref={scrollRef}
        className="filmstrip-scroll min-w-0 flex-1 overflow-x-auto overflow-y-hidden px-3"
        aria-label={`${items.length} photos`}
      >
        <div className="relative h-full" style={{ width: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = items[virtualItem.index];

            return (
              <div
                key={item.id}
                className="absolute left-0 top-0 flex h-full items-center"
                style={{ width: virtualItem.size, transform: `translateX(${virtualItem.start}px)` }}
              >
                <ThumbnailItem
                  label={item.label}
                  thumbPath={item.thumbPath}
                  thumbRevision={item.thumbRevision}
                  selected={selectedId === item.id}
                  onSelect={() => onSelect(item.id)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid w-16 shrink-0 place-items-center border-l border-subtle bg-app-surface">
        <Tooltip title="Import photos" arrow>
          <IconButton
            aria-label="Import photos"
            onClick={onImport}
            sx={{
              width: 40,
              height: 40,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
              color: "text.secondary",
              "&:hover": { bgcolor: "background.default", color: "primary.main" },
              "&:focus-visible": { outline: "2px solid var(--color-accent)", outlineOffset: 2 },
            }}
          >
            <Icon name="plus" size={18} />
          </IconButton>
        </Tooltip>
      </div>

      {showGridButton && (
        <div className="h-full w-[72px] shrink-0 border-l border-subtle bg-app-surface md:w-[84px] lg:w-[96px]">
          <Tooltip title="Collage" arrow>
            <IconButton
              aria-label="Open collage editor"
              aria-pressed={collageActive}
              onClick={enterCollageMode}
              sx={(currentTheme) => {
                const colors = currentTheme.still.colors[currentTheme.palette.mode];
                return {
                  width: '100%',
                  height: '100%',
                  borderRadius: 0,
                  color: collageActive ? colors.accent : colors.text.secondary,
                  backgroundColor: collageActive ? colors.bg.elevated : undefined,
                  transition: currentTheme.transitions.create(['background-color', 'color'], {
                    duration: currentTheme.still.motion.duration.fast,
                    easing: currentTheme.still.motion.easing,
                  }),
                  '&:hover': { color: collageActive ? colors.accent : colors.text.primary, backgroundColor: colors.bg.elevated },
                  '&.Mui-focusVisible': { outlineColor: colors.accent, outlineOffset: -2 },
                };
              }}
            >
              <Icon name="grid" size={20} />
            </IconButton>
          </Tooltip>
        </div>
      )}

      {showGridButton && (
        <div className="h-full w-[72px] shrink-0 border-l border-subtle bg-app-surface md:w-[84px] lg:w-[96px]">
          <Tooltip title="Grid view (G)" arrow>
            <IconButton
              aria-label="Grid view"
              aria-pressed={gridPanelOpen}
              disabled={collageActive}
              onClick={toggleGridPanel}
              sx={(currentTheme) => {
                const colors = currentTheme.still.colors[currentTheme.palette.mode];

                return {
                  width: "100%",
                  height: "100%",
                  borderRadius: 0,
                  color: gridPanelOpen ? colors.accent : colors.text.secondary,
                  backgroundColor: gridPanelOpen ? colors.bg.elevated : undefined,
                  transition: currentTheme.transitions.create(["background-color", "color"], {
                    duration: currentTheme.still.motion.duration.fast,
                    easing: currentTheme.still.motion.easing,
                  }),
                  "&:hover": {
                    color: gridPanelOpen ? colors.accent : colors.text.primary,
                    backgroundColor: colors.bg.elevated,
                  },
                  "&.Mui-focusVisible": {
                    outlineColor: colors.accent,
                    outlineOffset: -2,
                  },
                  '&.Mui-disabled': {
                    color: colors.text.secondary,
                    opacity: 0.38,
                  },
                };
              }}
            >
              <Icon name="grid" size={20} />
            </IconButton>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
