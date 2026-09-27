import { Alert, Button, CircularProgress, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useImagePreview } from '../hooks/useImagePreview';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { cacheAssetUrl } from '../services/tauri/image';
import { StillMark } from '../components/StillMark';
import { renderBorderPreview } from '../render/border';
import type { BorderSpec } from '../types/renderSpec';
import type { WatermarkSpec } from '../types/renderSpec';
import { renderWatermarkPreview } from '../render/watermark';
import { listWatermarkFonts } from '../services/tauri/watermark';

type MainCanvasProps = { onImport: () => void; dragActive: boolean; onExport: () => void; exporting: boolean };
export function MainCanvas({ onImport, dragActive, onExport, exporting }: MainCanvasProps) {
  const photos = useProjectStore((state) => state.photos);
  const selectedId = useProjectStore((state) => state.selectedId);
  const selectPhoto = useProjectStore((state) => state.selectPhoto);
  const view = useUIStore((state) => state.viewMode);
  const setView = useUIStore((state) => state.setViewMode);
  const photo = photos.find((entry) => entry.id === selectedId);
  return <main className="relative flex h-full min-h-0 flex-col bg-app-base p-3" aria-label="Photo workspace" tabIndex={0}
    data-editor-shortcut-scope="canvas" onDragOver={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()}>
    <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
      <Button size="small" onClick={onImport}>Import photos</Button>
      <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, next: 'single' | 'grid' | null) => { if (next) setView(next); }}>
        <ToggleButton value="single">Single</ToggleButton><ToggleButton value="grid">Grid</ToggleButton>
      </ToggleButtonGroup>
      <Button size="small" disabled={!photo || exporting} onClick={onExport}>{exporting ? 'Exporting…' : 'Export'}</Button>
    </div>
    {!photo ? <div className="grid min-h-0 flex-1 place-items-center text-center"><div>
      <StillMark size={36} /><h1 className="text-xl">Start with a photograph</h1>
      <p className="text-sm text-secondary">Drop photos here or choose files to import.</p>
      <Button variant="contained" onClick={onImport}>Import photos</Button>
    </div></div> : view === 'single' ? <Preview key={photo.id} photoId={photo.id} path={photo.path} frame={photo.spec.border} stamp={photo.spec.watermark} originalWidth={photo.width} originalHeight={photo.height} />
      : <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto md:grid-cols-3">
        {photos.map((entry) => <button key={entry.id} type="button" aria-label={`Select ${entry.path}`} aria-pressed={selectedId === entry.id}
          className={`aspect-[4/3] overflow-hidden rounded-md border-2 ${selectedId === entry.id ? 'border-accent' : 'border-transparent'}`}
          onClick={() => { selectPhoto(entry.id); setView('single'); }}>
          <img src={cacheAssetUrl(entry.thumbUrl)} alt={entry.path.split(/[\\/]/).pop()} loading="lazy" decoding="async" className="h-full w-full object-contain" />
        </button>)}
      </div>}
    {photo && <div className="mt-2 truncate text-center text-xs text-secondary" title={photo.path}>{photo.path.split(/[\\/]/).pop()} · {photo.width} × {photo.height}</div>}
    {dragActive && <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-app-surface/90">Drop photos to import</div>}
  </main>;
}

function Preview({ photoId, path, frame, stamp, originalWidth, originalHeight }: { photoId: string; path: string; frame?: BorderSpec; stamp?: WatermarkSpec; originalWidth: number; originalHeight: number }) {
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
      if (frame) {
        renderBorderPreview(target, image, frame, originalWidth, originalHeight);
      } else {
        target.width = image.naturalWidth;
        target.height = image.naturalHeight;
        target.getContext('2d')?.drawImage(image, 0, 0);
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
  }, [frame, image, originalHeight, originalWidth, stamp]);
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
    {error && <Alert severity="error">{error.message}</Alert>}
    <div className="relative inline-flex max-h-full max-w-full">
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
