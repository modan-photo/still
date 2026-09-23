import { Button, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import { useRef, useState, type DragEvent } from "react";
import { Icon } from "../components/Icons";
import { CropCorners } from "../components/Sketch";
import { StillMark } from "../components/StillMark";

type CanvasView = "single" | "grid";

type MainCanvasProps = {
  photoName: string | null;
  onImport: () => void;
  onFileDrop: (file: File) => void;
};

export function MainCanvas({ photoName, onImport, onFileDrop }: MainCanvasProps) {
  const [view, setView] = useState<CanvasView>("single");
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  const enterDropZone = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };

  const leaveDropZone = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  };

  const dropFile = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"));
    if (file) onFileDrop(file);
  };

  return (
    <main
      className={`relative grid h-full min-h-0 place-items-center overflow-hidden bg-app-base p-2 transition-colors duration-fast md:p-4 lg:p-6 ${dragActive ? "bg-app-elevated" : ""}`}
      aria-label="Photo workspace"
      onDragEnter={enterDropZone}
      onDragLeave={leaveDropZone}
      onDragOver={(event) => event.preventDefault()}
      onDrop={dropFile}
    >
      <div className="absolute right-2 top-2 z-10 md:right-4 md:top-4 lg:right-6 lg:top-6">
        <ToggleButtonGroup
          exclusive
          value={view}
          onChange={(_, nextView: CanvasView | null) => {
            if (nextView) setView(nextView);
          }}
          aria-label="Canvas view"
          size="small"
          sx={{
            gap: 0.25,
            p: 0.5,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "var(--radius-full)",
            backgroundColor: "color-mix(in srgb, var(--color-bg-surface) 70%, transparent)",
            backdropFilter: "var(--glass-backdrop)",
            boxShadow: "var(--shadow-elev1)",
            "& .MuiToggleButtonGroup-grouped": {
              width: 32,
              height: 32,
              m: 0,
              border: 0,
              borderRadius: "var(--radius-full)",
            },
          }}
        >
          <ToggleButton value="grid" aria-label="Grid view">
            <Tooltip title="Grid view" arrow><span className="grid place-items-center"><Icon name="grid" size={16} /></span></Tooltip>
          </ToggleButton>
          <ToggleButton value="single" aria-label="Single photo view">
            <Tooltip title="Single photo view" arrow><span className="grid place-items-center"><Icon name="single" size={16} /></span></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </div>

      {dragActive ? (
        <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-app-surface/70 backdrop-blur-xl">
          <div className="text-center">
            <Icon name="open" size={28} />
            <p className="mb-0 mt-3 text-sm font-semibold text-primary">Drop photos to import</p>
          </div>
        </div>
      ) : photoName ? (
        view === "single" ? <PhotoPlaceholder name={photoName} /> : <GridPlaceholder name={photoName} />
      ) : (
        <EmptyCanvas onImport={onImport} />
      )}
    </main>
  );
}

function EmptyCanvas({ onImport }: { onImport: () => void }) {
  return (
    <div className="w-full max-w-md px-6 text-center text-secondary">
      <div className="relative mx-auto mb-6 grid h-20 w-24 place-items-center" aria-hidden="true">
        <CropCorners />
        <StillMark size={28} />
      </div>
      <h1 className="m-0 text-xl font-semibold tracking-[-0.02em] text-primary">Start with a photograph</h1>
      <p className="mb-0 mt-2 text-sm leading-6">Drag photos here or click to import.</p>
      <Button variant="contained" startIcon={<Icon name="open" size={17} />} onClick={onImport} sx={{ mt: 3 }}>
        Import photos
      </Button>
    </div>
  );
}

function PhotoPlaceholder({ name }: { name: string }) {
  return (
    <div className="grid h-[min(68vh,680px)] w-[min(72vw,960px)] max-h-[90%] max-w-[90%] place-items-center overflow-hidden rounded-lg border border-subtle bg-app-surface shadow-elev2">
      <div className="max-w-[80%] text-center">
        <StillMark size={36} />
        <p className="mb-0 mt-4 truncate text-sm font-medium text-primary" title={name}>{name}</p>
        <p className="mb-0 mt-1 text-xs text-secondary">Photo preview placeholder</p>
      </div>
    </div>
  );
}

function GridPlaceholder({ name }: { name: string }) {
  return (
    <div className="grid h-full max-h-[90%] w-full max-w-[90%] grid-cols-2 content-center gap-3 md:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border border-subtle bg-app-surface shadow-elev1">
          <div className="max-w-[80%] text-center">
            <StillMark size={24} />
            <p className="mb-0 mt-2 truncate text-xs text-secondary">{index === 0 ? name : `Photo ${index + 1}`}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
