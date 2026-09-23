import { useVirtualizer } from "@tanstack/react-virtual";
import { IconButton, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icons";
import { ThumbnailItem } from "../components/ThumbnailItem";

export type FilmStripItem = {
  id: string;
  label: string;
};

type FilmStripProps = {
  items: FilmStripItem[];
  onImport: () => void;
};

export function FilmStrip({ items, onImport }: FilmStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("md"));
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? null);
  const itemPitch = compact ? 64 : 80;

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => itemPitch,
    overscan: 6,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [itemPitch, virtualizer]);

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
                  selected={selectedId === item.id}
                  onSelect={() => setSelectedId(item.id)}
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
    </div>
  );
}
