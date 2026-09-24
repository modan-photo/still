import { Alert, Button, CircularProgress, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useEffect, useRef } from 'react';
import { useImagePreview } from '../hooks/useImagePreview';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { cacheAssetUrl } from '../services/tauri/image';
import { StillMark } from '../components/StillMark';

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
    </div></div> : view === 'single' ? <Preview key={photo.id} path={photo.path} />
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

function Preview({ path }: { path: string }) {
  const { image, loading, error } = useImagePreview(path);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target || !image) return;
    target.width = image.naturalWidth;
    target.height = image.naturalHeight;
    target.getContext('2d')?.drawImage(image, 0, 0);
    return () => { target.width = 0; target.height = 0; };
  }, [image]);
  return <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
    {loading && <CircularProgress size={28} aria-label="Loading preview" />}
    {error && <Alert severity="error">{error.message}</Alert>}
    <canvas ref={canvas} aria-label="Photo preview" data-preview-long-edge={image ? Math.max(image.naturalWidth, image.naturalHeight) : undefined}
      style={{ display: image ? 'block' : 'none', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
  </div>;
}
