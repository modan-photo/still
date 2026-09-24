import { IconButton, MenuItem, Select, ToggleButton, ToggleButtonGroup, useMediaQuery, useTheme } from "@mui/material";
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon } from "../components/Icons";
import { PanelSection } from "../components/PanelSection";
import { ParamSlider } from "../components/ParamSlider";
import { BorderControls } from "../components/BorderControls";

type RightPanelProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

const MIN_WIDTH = 280;
const MAX_WIDTH = 400;

export function RightPanel({ collapsed, onCollapsedChange }: RightPanelProps) {
  const [width, setWidth] = useState(300);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef({ x: 0, width: 300 });
  const theme = useTheme();
  const tablet = useMediaQuery(theme.breakpoints.between("md", "lg"));
  const effectiveWidth = tablet ? 260 : width;

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setResizing(true);
    dragStart.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const nextWidth = dragStart.current.width + dragStart.current.x - event.clientX;
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth)));
  };

  return (
    <aside
      id="right-panel"
      className="relative min-h-0 shrink-0 border-l border-subtle bg-app-surface transition-[width] duration-base ease-app"
      style={{ width: collapsed ? 0 : effectiveWidth, transitionDuration: resizing ? "0ms" : undefined, borderLeftWidth: collapsed ? 0 : undefined }}
      aria-label="Inspector"
      data-collapsed={collapsed}
    >
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
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const delta = event.key === "ArrowLeft" ? 8 : -8;
            setWidth((current) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, current + delta)));
          }}
        />
      )}

      <IconButton
        aria-label={collapsed ? "Expand inspector" : "Collapse inspector"}
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

export function InspectorContent() {
  return (
    <>
      <div className="shrink-0 px-5 pb-3 pt-4">
        <h2 className="m-0 text-sm font-semibold text-primary">Inspector</h2>
        <p className="m-0 mt-1 text-xs text-secondary">Select a photo to adjust its appearance</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <PanelSection title="Border" defaultOpen>
            <BorderControls />
          </PanelSection>

          <PanelSection title="Watermark">
            <Field label="Type">
              <ToggleButtonGroup exclusive defaultValue="text" size="small" fullWidth>
                <ToggleButton value="text">Text</ToggleButton>
                <ToggleButton value="image">Image</ToggleButton>
              </ToggleButtonGroup>
            </Field>
            <Field label="Position"><CompactSelect value="bottom-right" options={["Top left", "Center", "Bottom right"]} /></Field>
            <ParamSlider label="Opacity" defaultValue={72} suffix="%" />
            <ParamSlider label="Rotation" defaultValue={0} min={-180} max={180} suffix="°" />
          </PanelSection>

          <PanelSection title="EXIF">
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-xs">
              <dt className="text-secondary">Camera</dt><dd className="m-0 text-right text-primary">—</dd>
              <dt className="text-secondary">Lens</dt><dd className="m-0 text-right text-primary">—</dd>
              <dt className="text-secondary">Exposure</dt><dd className="m-0 text-right text-primary">—</dd>
              <dt className="text-secondary">ISO</dt><dd className="m-0 text-right text-primary">—</dd>
            </dl>
          </PanelSection>

          <PanelSection title="Collage">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rows"><CompactSelect value="2" options={["1", "2", "3", "4"]} /></Field>
              <Field label="Columns"><CompactSelect value="2" options={["1", "2", "3", "4"]} /></Field>
            </div>
            <ParamSlider label="Gap" defaultValue={8} max={32} suffix="px" />
            <Field label="Background">
              <button className="flex h-8 w-full items-center gap-2 rounded-md border border-subtle bg-app-elevated px-2 text-xs text-primary" type="button">
                <span className="h-4 w-4 rounded-full border border-subtle bg-app-base" />Canvas color
              </button>
            </Field>
          </PanelSection>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-secondary">{label}</span>{children}</label>;
}

function CompactSelect({ value, options }: { value: string; options: string[] }) {
  return (
    <Select defaultValue={value} size="small" fullWidth sx={{ height: 32, fontSize: 12 }}>
      {options.map((option, index) => <MenuItem value={index === 0 && value.includes("-") ? "top-left" : index === 1 && value.includes("-") ? "center" : index === 2 && value.includes("-") ? "bottom-right" : option} key={option}>{option}</MenuItem>)}
    </Select>
  );
}
