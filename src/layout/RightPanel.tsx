import { IconButton, useMediaQuery, useTheme } from "@mui/material";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../components/Icons";
import { RightPanelContent } from "./RightPanelContent";
import { RightPanelTabs } from "./RightPanelTabs.tsx";
import { useTranslation } from "../i18n/messages";

type RightPanelProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

const MIN_WIDTH = 280;
const MAX_WIDTH = 400;

/**
 * Resizable desktop inspector container.
 *
 * Tablet layouts use a fixed narrower width, while larger desktop layouts remember
 * the user's drag/keyboard width for the current session.
 */
export function RightPanel({ collapsed, onCollapsedChange }: RightPanelProps) {
  const t = useTranslation();
  const [width, setWidth] = useState(300);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef({ x: 0, width: 300 });
  const theme = useTheme();
  const tablet = useMediaQuery(theme.breakpoints.between("md", "lg"));
  const effectiveWidth = tablet ? 260 : width;

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Pointer capture keeps resize events flowing even if the pointer leaves the
    // narrow separator hit target.
    if (event.button !== 0) return;
    setResizing(true);
    dragStart.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    // The inspector is right-aligned, so dragging left increases its width.
    const nextWidth = dragStart.current.width + dragStart.current.x - event.clientX;
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth)));
  };

  return (
    <aside
      id="right-panel"
      className="relative h-full min-h-0 shrink-0 border-l border-subtle bg-app-surface transition-[width] duration-base ease-app"
      style={{ width: collapsed ? 0 : effectiveWidth, transitionDuration: resizing ? "0ms" : undefined, borderLeftWidth: collapsed ? 0 : undefined }}
      aria-label={t('inspector')}
      data-collapsed={collapsed}
    >
      {/* Tablet width is fixed; only full desktop exposes the resize separator. */}
      {!collapsed && !tablet && (
        <div
          className="absolute inset-y-0 left-0 z-20 w-1 -translate-x-1/2 cursor-col-resize touch-none outline-none transition-colors duration-fast hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          role="separator"
          aria-label="Resize inspector"
          aria-orientation="vertical"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={startResize}
          onPointerMove={resize}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            setResizing(false);
          }}
          onLostPointerCapture={() => setResizing(false)}
          onKeyDown={(event) => {
            // Keyboard resizing mirrors the pointer direction from the left edge.
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const delta = event.key === "ArrowLeft" ? 8 : -8;
            setWidth((current) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, current + delta)));
          }}
        />
      )}

      <IconButton
        aria-label={t(collapsed ? 'expandInspector' : 'collapseInspector')}
        onClick={() => onCollapsedChange(!collapsed)}
        size="small"
        sx={{
          position: "absolute",
          zIndex: 30,
          top: 12,
          left: -14,
          width: 28,
          height: 28,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          boxShadow: "var(--shadow-elev1)",
          "&:hover": { bgcolor: "background.default" },
        }}
      >
        <span className={collapsed ? "rotate-90" : "-rotate-90"}>
          <Icon name="chevron" size={14} />
        </span>
      </IconButton>

      <div
        className="flex h-full flex-col"
        style={{ display: collapsed ? "none" : undefined, minWidth: effectiveWidth }}
        aria-hidden={collapsed}
      >
        <InspectorContent />
      </div>
    </aside>
  );
}

/** Shared tab/content composition used by both desktop and mobile inspectors. */
export function InspectorContent({ excludeCollage = false }: { excludeCollage?: boolean }) {
  return (
    <>
      <RightPanelTabs excludeCollage={excludeCollage} />
      <RightPanelContent excludeCollage={excludeCollage} />
    </>
  );
}
