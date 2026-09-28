import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel,
  InputAdornment, InputLabel, MenuItem, Select, Slider, Switch, TextField, ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import type { ExportMode, ExportOptions, ExportRequest, NamingMode, ResizeMode } from '../types/export';
import type { OutputFormat, RenderSpec } from '../types/renderSpec';
import { getCollageCanvasSize } from './collage/collageModel';

type ExportScope = 'all' | 'current' | 'selected';
type Props = { open: boolean; exportMode: ExportMode; onClose: () => void; onExport: (request: ExportRequest) => void };
const RECENT_KEY = 'still.export.recent-directories';

const defaultOptions = (): ExportOptions => ({
  format: 'jpeg', quality: 92, outputDirectory: '',
  size: { mode: 'original', longEdge: 2400, percent: 100, width: 2400, height: 1600, lockAspect: true },
  naming: { mode: 'originalSuffix', suffix: '_export', prefix: 'still_', template: '{name}_border_{n}', startNumber: 1 },
  conflict: 'rename', preserveExif: true, preserveIcc: true,
});

export function ExportDialog({ open, exportMode, onClose, onExport }: Props) {
  const photos = useProjectStore((state) => state.photos);
  const collageDraft = useProjectStore((state) => state.collageDraft);
  const selectedId = useProjectStore((state) => state.selectedId);
  const selectedIds = useProjectStore((state) => state.selectedIds);
  const [scope, setScope] = useState<ExportScope>('all');
  const [options, setOptions] = useState<ExportOptions>(defaultOptions);
  const [recent, setRecent] = useState<string[]>([]);
  const [collageFormat, setCollageFormat] = useState<OutputFormat>('png');
  const [collageQuality, setCollageQuality] = useState(92);
  const [collageOutputPath, setCollageOutputPath] = useState('');
  const targetPhotos = useMemo(() => scope === 'current'
    ? photos.filter((photo) => photo.id === selectedId)
    : scope === 'selected'
      ? photos.filter((photo) => selectedIds.includes(photo.id))
      : photos, [photos, scope, selectedId, selectedIds]);

  useEffect(() => {
    if (!open) return;
    const stored = readRecent();
    setRecent(stored);
    setScope(selectedIds.length > 0 ? 'selected' : 'all');
    setOptions((current) => ({ ...current, outputDirectory: current.outputDirectory || stored[0] || parentDirectory(photos[0]?.path ?? '') }));
  }, [open, photos, selectedIds.length]);
  useEffect(() => {
    if (open && exportMode === 'collage' && collageDraft.background.type === 'transparent' && collageFormat === 'jpeg') {
      setCollageFormat('png');
      setCollageOutputPath((path) => withOutputExtension(path, 'png'));
    }
  }, [collageDraft.background.type, collageFormat, exportMode, open]);

  const patch = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => setOptions((current) => ({ ...current, [key]: value }));
  const patchSize = (value: Partial<ExportOptions['size']>) => patch('size', { ...options.size, ...value });
  const patchNaming = (value: Partial<ExportOptions['naming']>) => patch('naming', { ...options.naming, ...value });
  const aspect = targetPhotos[0] ? targetPhotos[0].width / targetPhotos[0].height : 1.5;
  const estimate = useMemo(() => estimateBytes(targetPhotos.map((photo) => photo.spec), options), [targetPhotos, options]);
  const collagePhotoCount = collageDraft.photoIds.filter((id) => photos.some((photo) => photo.id === id)).length;
  const collageSize = getCollageCanvasSize(collageDraft, collagePhotoCount);

  const chooseDirectory = async () => {
    const value = await openDialog({ directory: true, multiple: false, title: 'Choose export folder', defaultPath: options.outputDirectory || undefined });
    if (typeof value === 'string') patch('outputDirectory', value);
  };
  const submit = () => {
    if (!options.outputDirectory || targetPhotos.length === 0) return;
    const nextRecent = [options.outputDirectory, ...recent.filter((entry) => entry !== options.outputDirectory)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
    setRecent(nextRecent);
    const request: ExportRequest = { exportMode: 'photos', specs: targetPhotos.map((photo) => structuredClone(photo.spec)), options: structuredClone(options) };
    onClose();
    onExport(request);
  };

  const chooseCollageFile = async () => {
    const extension = collageFormat === 'jpeg' ? 'jpg' : collageFormat;
    const value = await saveDialog({
      title: 'Export collage',
      defaultPath: collageOutputPath || `still-collage.${extension}`,
      filters: [{ name: collageFormat === 'jpeg' ? 'JPEG image' : `${collageFormat.toUpperCase()} image`, extensions: [extension] }],
    });
    if (typeof value === 'string') setCollageOutputPath(value);
  };
  const submitCollage = () => {
    if (!collageOutputPath || collagePhotoCount < 2) return;
    const outputPath = withOutputExtension(collageOutputPath, collageFormat);
    setCollageOutputPath(outputPath);
    onClose();
    onExport({ exportMode: 'collage', outputPath, format: collageFormat, quality: collageQuality });
  };

  if (exportMode === 'collage') {
    return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="collage-export-dialog-title"
      slotProps={{ paper: { sx: (theme) => ({ borderRadius: `${theme.still.radius.lg}px`, overflow: 'hidden' }) } }}>
      <DialogTitle id="collage-export-dialog-title" sx={{ pb: 1 }}>
        <div className="flex items-baseline justify-between gap-4"><span>Export collage</span><span className="text-xs font-normal text-secondary">{collagePhotoCount} photos · {collageSize.width} × {collageSize.height}px</span></div>
      </DialogTitle>
      <DialogContent dividers>
        <div className="space-y-5 py-1">
          <Section title="File">
            <FormControl size="small" fullWidth><InputLabel>Format</InputLabel><Select label="Format" value={collageFormat} onChange={(event) => { const format = event.target.value as OutputFormat; setCollageFormat(format); setCollageOutputPath((path) => withOutputExtension(path, format)); }}>
              <MenuItem value="png">PNG</MenuItem>
              {collageDraft.background.type !== 'transparent' && <MenuItem value="jpeg">JPEG</MenuItem>}
              <MenuItem value="webp">WebP</MenuItem>
            </Select></FormControl>
            {(collageFormat === 'jpeg' || collageFormat === 'webp') && <div>
              <div className="mb-1 flex justify-between text-xs text-secondary"><span>Quality</span><span>{collageQuality}</span></div>
              <Slider min={1} max={100} value={collageQuality} onChange={(_, value) => setCollageQuality(value as number)} aria-label="Collage export quality" />
            </div>}
          </Section>
          <Section title="Destination">
            <div className="flex gap-2"><TextField size="small" fullWidth label="Output file" value={collageOutputPath} onChange={(event) => setCollageOutputPath(event.target.value)} />
              <Button variant="outlined" onClick={() => void chooseCollageFile()}>Choose</Button></div>
          </Section>
        </div>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!collageOutputPath || collagePhotoCount < 2} onClick={submitCollage}>Export collage</Button></DialogActions>
    </Dialog>;
  }

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="export-dialog-title"
    slotProps={{ paper: { sx: (theme) => ({ borderRadius: `${theme.still.radius.lg}px`, overflow: 'hidden' }) } }}>
    <DialogTitle id="export-dialog-title" sx={{ pb: 1 }}>
      <div className="flex items-baseline justify-between gap-4"><span>Export</span><span className="text-xs font-normal text-secondary">{targetPhotos.length} photos · approx. {formatBytes(estimate)}</span></div>
    </DialogTitle>
    <DialogContent dividers sx={{ p: 0 }}>
      <div className="grid md:grid-cols-2">
        <div className="space-y-5 p-5 md:border-r md:border-subtle">
          <Section title="Files">
            <div className="grid grid-cols-2 gap-3">
              <FormControl size="small"><InputLabel>Photos</InputLabel><Select label="Photos" value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}>
                <MenuItem value="all">All photos ({photos.length})</MenuItem>
                <MenuItem value="current">Current photo</MenuItem>
                {selectedIds.length > 0 && <MenuItem value="selected">Selected ({selectedIds.length})</MenuItem>}
              </Select></FormControl>
              <FormControl size="small"><InputLabel>Format</InputLabel><Select label="Format" value={options.format} onChange={(event) => patch('format', event.target.value as OutputFormat)}>
                <MenuItem value="jpeg">JPEG</MenuItem><MenuItem value="png">PNG</MenuItem><MenuItem value="webp">WebP</MenuItem>
              </Select></FormControl>
            </div>
            {(options.format === 'jpeg' || options.format === 'webp') && <div className="pt-2">
              <div className="mb-1 flex justify-between text-xs text-secondary"><span>Quality</span><span>{options.quality}</span></div>
              <Slider min={1} max={100} value={options.quality} onChange={(_, value) => patch('quality', value as number)} aria-label="Export quality" />
            </div>}
          </Section>
          <Section title="Size">
            <ToggleButtonGroup exclusive size="small" fullWidth value={options.size.mode} onChange={(_, value: ResizeMode | null) => value && patchSize({ mode: value })}>
              <ToggleButton value="original">Original</ToggleButton><ToggleButton value="longEdge">Long edge</ToggleButton><ToggleButton value="percent">Percent</ToggleButton><ToggleButton value="exact">Exact</ToggleButton>
            </ToggleButtonGroup>
            {options.size.mode === 'longEdge' && <NumberField label="Long edge" value={options.size.longEdge ?? 2400} suffix="px" onChange={(value) => patchSize({ longEdge: value })} />}
            {options.size.mode === 'percent' && <NumberField label="Scale" value={options.size.percent ?? 100} suffix="%" onChange={(value) => patchSize({ percent: value })} />}
            {options.size.mode === 'exact' && <>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Width" value={options.size.width ?? 2400} suffix="px" onChange={(width) => patchSize({ width, ...(options.size.lockAspect ? { height: Math.max(1, Math.round(width / aspect)) } : {}) })} />
                <NumberField label="Height" value={options.size.height ?? 1600} suffix="px" onChange={(height) => patchSize({ height, ...(options.size.lockAspect ? { width: Math.max(1, Math.round(height * aspect)) } : {}) })} />
              </div>
              <FormControlLabel control={<Switch size="small" checked={options.size.lockAspect} onChange={(event) => patchSize({ lockAspect: event.target.checked })} />} label="Lock aspect ratio" />
            </>}
          </Section>
        </div>
        <div className="space-y-5 p-5">
          <Section title="Naming">
            <FormControl size="small" fullWidth><InputLabel>Pattern</InputLabel><Select label="Pattern" value={options.naming.mode} onChange={(event) => patchNaming({ mode: event.target.value as NamingMode })}>
              <MenuItem value="originalSuffix">Original name + suffix</MenuItem><MenuItem value="prefixSequence">Custom prefix + sequence</MenuItem><MenuItem value="template">Custom template</MenuItem>
            </Select></FormControl>
            {options.naming.mode === 'originalSuffix' && <TextField size="small" fullWidth label="Suffix" value={options.naming.suffix} onChange={(event) => patchNaming({ suffix: event.target.value })} />}
            {options.naming.mode === 'prefixSequence' && <div className="grid grid-cols-[1fr_112px] gap-3"><TextField size="small" label="Prefix" value={options.naming.prefix} onChange={(event) => patchNaming({ prefix: event.target.value })} /><NumberField label="Starts at" value={options.naming.startNumber} onChange={(startNumber) => patchNaming({ startNumber })} /></div>}
            {options.naming.mode === 'template' && <TextField size="small" fullWidth label="Template" helperText="Tokens: {name}, {n}, {ext}" value={options.naming.template} onChange={(event) => patchNaming({ template: event.target.value })} />}
          </Section>
          <Section title="Destination">
            <div className="flex gap-2"><TextField size="small" fullWidth label="Output folder" value={options.outputDirectory} onChange={(event) => patch('outputDirectory', event.target.value)} /><Button variant="outlined" onClick={() => void chooseDirectory()}>Choose</Button></div>
            {recent.length > 0 && <div><div className="mb-1 text-[11px] text-secondary">Recent folders</div><div className="flex flex-wrap gap-1">{recent.map((directory) => <Button key={directory} size="small" onClick={() => patch('outputDirectory', directory)} sx={{ maxWidth: '100%', justifyContent: 'flex-start' }}><span className="truncate">{directory}</span></Button>)}</div></div>}
            <FormControl size="small" fullWidth><InputLabel>If a file exists</InputLabel><Select label="If a file exists" value={options.conflict} onChange={(event) => patch('conflict', event.target.value as ExportOptions['conflict'])}>
              <MenuItem value="skip">Skip</MenuItem><MenuItem value="overwrite">Overwrite</MenuItem><MenuItem value="rename">Rename automatically</MenuItem>
            </Select></FormControl>
          </Section>
          <Section title="Metadata">
            <FormControlLabel control={<Switch checked={options.preserveExif} onChange={(event) => patch('preserveExif', event.target.checked)} />} label="Keep EXIF metadata" />
            <div className="-mt-2 text-[11px] leading-4 text-secondary">Camera and capture data are retained. Orientation is normalized after rendering. The original ICC colour profile is preserved.</div>
          </Section>
        </div>
      </div>
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!options.outputDirectory || targetPhotos.length === 0} onClick={submit}>Export {targetPhotos.length}</Button></DialogActions>
  </Dialog>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary">{title}</h3><div className="space-y-3">{children}</div></section>;
}
function NumberField({ label, value, suffix, onChange }: { label: string; value: number; suffix?: string; onChange: (value: number) => void }) {
  return <TextField size="small" type="number" label={label} value={value} onChange={(event) => onChange(Math.max(1, Number(event.target.value) || 1))} slotProps={{ input: { endAdornment: suffix ? <InputAdornment position="end">{suffix}</InputAdornment> : undefined, inputProps: { min: 1 } } }} />;
}
function readRecent(): string[] { try { const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, 5) : []; } catch { return []; } }
function parentDirectory(path: string) { const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')); return index > 0 ? path.slice(0, index) : ''; }
function withOutputExtension(path: string, format: OutputFormat) {
  if (!path) return path;
  const extension = format === 'jpeg' ? 'jpg' : format;
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const dot = path.lastIndexOf('.');
  return `${dot > separator ? path.slice(0, dot) : path}.${extension}`;
}
function estimateBytes(specs: RenderSpec[], options: ExportOptions) {
  return specs.reduce((sum, spec) => {
    let width = spec.source.width; let height = spec.source.height;
    if (spec.border) { const edge = Math.max(width, height); const border = spec.border.unit === 'percent' ? edge * spec.border.width / 100 : spec.border.width; width += border * 2; height += border * (spec.border.style === 'polaroid' && spec.border.caption ? 4 : 2); }
    if (options.size.mode === 'longEdge') { const factor = (options.size.longEdge ?? Math.max(width, height)) / Math.max(width, height); width *= factor; height *= factor; }
    if (options.size.mode === 'percent') { const factor = (options.size.percent ?? 100) / 100; width *= factor; height *= factor; }
    if (options.size.mode === 'exact') {
      const targetWidth = options.size.width ?? width; const targetHeight = options.size.height ?? height;
      if (options.size.lockAspect) { const factor = Math.min(targetWidth / width, targetHeight / height); width *= factor; height *= factor; }
      else { width = targetWidth; height = targetHeight; }
    }
    const quality = options.quality / 100;
    const bytesPerPixel = options.format === 'png' ? 1.35 : options.format === 'webp' ? 0.07 + 0.72 * quality * quality : 0.1 + 0.95 * quality * quality;
    return sum + width * height * bytesPerPixel;
  }, 0);
}
function formatBytes(bytes: number) { if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`; if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`; return `${(bytes / 1024 ** 3).toFixed(1)} GB`; }
