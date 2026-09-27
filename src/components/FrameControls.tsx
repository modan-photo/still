import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Popover,
  Slider,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useRenderSpec } from '../hooks/useRenderSpec';
import { renderBorderPreview } from '../render/border';
import { cacheAssetUrl } from '../services/tauri/image';
import { useProjectStore } from '../stores/projectStore';
import { DEFAULT_BORDER, type BorderSpec, type BorderStyle } from '../types/renderSpec';

const STYLES: { value: BorderStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'polaroid', label: 'Polaroid' },
  { value: 'film', label: 'Film' },
];
const PRESET_COLORS = ['#FFFFFF', '#F5F0E8', '#D8E7DE', '#BEDBE7', '#F3C6C2', '#F0D28C', '#D8C6E8', '#A8A8A8', '#555555', '#171717', '#B64236', '#2E6450'];

export function FrameControls() {
  const { spec, update } = useRenderSpec();
  const selectedId = useProjectStore((state) => state.selectedId);
  const photo = useProjectStore((state) => state.photos.find((entry) => entry.id === state.selectedId));
  const photoCount = useProjectStore((state) => state.photos.length);
  const applyBorderToAll = useProjectStore((state) => state.applyBorderToAll);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const frameApplied = Boolean(spec?.border);
  const frame = spec?.border ?? DEFAULT_BORDER;
  const change = (patch: Partial<BorderSpec>) => update({ border: { ...frame, ...patch } });
  const dimensionValue = frame.width;

  if (!selectedId || !photo) {
    return <p className="m-0 text-xs leading-5 text-secondary">Select a photo to add a frame.</p>;
  }

  return <div className="space-y-4">
    <div>
      <span className="mb-2 block text-xs font-medium text-secondary">Style</span>
      {!frameApplied && <span className="mb-2 block text-[10px] text-secondary">Choose a style to enable the frame.</span>}
      <div className="filmstrip-scroll flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Frame style">
        {STYLES.map(({ value, label }) => <button
          type="button"
          role="radio"
          aria-checked={frameApplied && frame.style === value}
          className={`min-w-[62px] rounded-lg border p-1.5 text-[10px] transition-colors ${frameApplied && frame.style === value ? 'border-accent bg-app-elevated text-primary' : 'border-subtle text-secondary hover:text-primary'}`}
          key={value}
          onClick={() => change({ style: value })}
        >
          <StylePreview src={photo.thumbUrl} config={{ ...frame, style: value }} originalWidth={photo.width} originalHeight={photo.height} />
          <span className="mt-1 block truncate">{label}</span>
        </button>)}
      </div>
    </div>

    <NumberSlider
      label="Width"
      value={dimensionValue}
      min={0}
      max={200}
      onChange={(value) => change({ width: value })}
      suffix={frame.unit === 'px' ? 'px' : '%'}
      after={<ToggleButtonGroup
        exclusive
        size="small"
        value={frame.unit}
        onChange={(_, unit: BorderSpec['unit'] | null) => {
          if (!unit || unit === frame.unit) return;
          const longEdge = Math.max(photo.width, photo.height);
          const converted = unit === 'percent'
            ? Math.round(dimensionValue / longEdge * 1_000) / 10
            : Math.round(dimensionValue / 100 * longEdge);
          change({ unit, width: clamp(converted, 0, 200) });
        }}
        aria-label="Frame width unit"
        sx={{ height: 28, '& .MuiToggleButton-root': { px: 1, fontSize: 10 } }}
      ><ToggleButton value="px">px</ToggleButton><ToggleButton value="percent">%</ToggleButton></ToggleButtonGroup>}
    />

    {frame.style === 'gradient' ? <GradientStops frame={frame} onChange={change} />
      : frame.style !== 'film' && frame.style !== 'polaroid' ? <ColorPicker label="Color" color={frame.color} onChange={(color) => change({ color })} /> : null}

    {frame.style === 'gradient' && <NumberSlider label="Angle" value={frame.angle} min={-180} max={180} onChange={(angle) => change({ angle })} suffix="°" />}
    <NumberSlider label="Corner radius" value={frame.radius} min={0} max={100} onChange={(radius) => change({ radius })} suffix="px" />
    {frame.style === 'polaroid' && <label className="flex items-center justify-between text-xs text-secondary">
      Reserve caption area
      <Switch size="small" checked={frame.caption} onChange={(event) => change({ caption: event.target.checked })} />
    </label>}

    <Button fullWidth variant="outlined" size="small" disabled={photoCount < 2 || !frameApplied} onClick={() => setConfirmOpen(true)}>
      Apply to all photos
    </Button>
    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} aria-labelledby="apply-frame-title">
      <DialogTitle id="apply-frame-title">Apply frame to all photos?</DialogTitle>
      <DialogContent>This replaces the frame settings on all {photoCount} photos. Other edits stay unchanged.</DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
        <Button variant="contained" onClick={() => { applyBorderToAll(frame); setConfirmOpen(false); }}>Apply</Button>
      </DialogActions>
    </Dialog>
  </div>;
}

function StylePreview({ src, config, originalWidth, originalHeight }: { src: string; config: BorderSpec; originalWidth: number; originalHeight: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let disposed = false;
    const next = new Image();
    next.src = cacheAssetUrl(src);
    void next.decode().then(() => { if (!disposed) setImage(next); }).catch(() => undefined);
    return () => { disposed = true; next.removeAttribute('src'); setImage(null); };
  }, [src]);
  useEffect(() => {
    if (!image) return;
    const timer = window.setTimeout(() => {
      if (canvasRef.current) renderBorderPreview(canvasRef.current, image, config, originalWidth, originalHeight);
    }, 16);
    return () => window.clearTimeout(timer);
  }, [config, image, originalHeight, originalWidth]);
  return <span className="grid h-9 place-items-center overflow-hidden rounded bg-app-base">
    <canvas ref={canvasRef} className="block max-h-full max-w-full" aria-hidden="true" />
  </span>;
}

function NumberSlider({ label, value, min, max, suffix, onChange, after }: {
  label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void; after?: ReactNode;
}) {
  return <div>
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-secondary">{label}</span>
      <div className="flex items-center gap-1.5">
        <TextField
          size="small"
          type="number"
          value={value}
          onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
          slotProps={{ htmlInput: { min, max, step: suffix === '%' ? 0.1 : 1, 'aria-label': label } }}
          sx={{ width: 68, '& .MuiInputBase-root': { height: 28, fontSize: 11 }, '& input': { py: 0, px: 1 } }}
        />
        <span className="w-5 text-[10px] text-secondary">{suffix}</span>
        {after}
      </div>
    </div>
    <Slider size="small" aria-label={label} value={value} min={min} max={max} step={suffix === '%' ? 0.1 : 1} onChange={(_, next) => onChange(next as number)} />
  </div>;
}

function ColorPicker({ label, color, onChange }: { label: string; color: string; onChange: (color: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState(color);
  useEffect(() => setDraft(color), [color]);
  const pickFromScreen = async () => {
    type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
    const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!EyeDropper) return;
    try { onChange((await new EyeDropper().open()).sRGBHex.toUpperCase()); } catch { /* User cancelled. */ }
  };
  return <div>
    <span className="mb-1.5 block text-xs font-medium text-secondary">{label}</span>
    <button type="button" className="flex h-8 w-full items-center gap-2 rounded-md border border-subtle bg-app-elevated px-2 text-xs text-primary" onClick={(event) => setAnchor(event.currentTarget)}>
      <span className="h-4 w-4 rounded-full border border-subtle" style={{ background: color }} />
      <span className="font-mono uppercase">{color}</span>
    </button>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
      <div className="w-56 p-3">
        <div className="grid grid-cols-6 gap-2">
          {PRESET_COLORS.map((preset) => <button type="button" aria-label={`Choose ${preset}`} key={preset} className="h-6 rounded-full border border-subtle" style={{ background: preset }} onClick={() => onChange(preset)} />)}
        </div>
        <div className="mt-3 flex gap-2">
          <TextField size="small" value={draft} onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (/^#[\dA-F]{6}([\dA-F]{2})?$/i.test(next)) onChange(next.toUpperCase());
          }} slotProps={{ htmlInput: { 'aria-label': 'Custom hex color', maxLength: 9 } }} sx={{ flex: 1, '& .MuiInputBase-root': { height: 32, fontSize: 12 } }} />
          {'EyeDropper' in window && <IconButton size="small" aria-label="Pick color from screen" title="Pick from screen" onClick={() => void pickFromScreen()}>⌾</IconButton>}
        </div>
      </div>
    </Popover>
  </div>;
}

function GradientStops({ frame, onChange }: { frame: BorderSpec; onChange: (patch: Partial<BorderSpec>) => void }) {
  const dragging = useRef<number | null>(null);
  const move = (event: DragEvent, target: number) => {
    event.preventDefault();
    const from = dragging.current;
    if (from === null || from === target) return;
    const colors = [...frame.colors];
    const [color] = colors.splice(from, 1);
    colors.splice(target, 0, color);
    dragging.current = target;
    onChange({ colors });
  };
  return <div>
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-xs font-medium text-secondary">Gradient stops</span>
      <Button size="small" disabled={frame.colors.length >= 6} onClick={() => onChange({ colors: [...frame.colors, '#FFFFFF'] })}>Add</Button>
    </div>
    <div className="space-y-2">
      {frame.colors.map((color, index) => <div
        className="flex items-center gap-2 rounded-md border border-subtle p-1.5"
        draggable
        key={`${color}-${index}`}
        onDragStart={() => { dragging.current = index; }}
        onDragOver={(event) => move(event, index)}
        onDragEnd={() => { dragging.current = null; }}
      >
        <span className="cursor-grab text-xs text-secondary" aria-hidden="true">⠿</span>
        <div className="min-w-0 flex-1"><ColorPicker label={`Stop ${index + 1}`} color={color} onChange={(next) => {
          const colors = [...frame.colors]; colors[index] = next; onChange({ colors });
        }} /></div>
        <IconButton size="small" aria-label={`Remove stop ${index + 1}`} disabled={frame.colors.length <= 2} onClick={() => onChange({ colors: frame.colors.filter((_, item) => item !== index) })}>×</IconButton>
      </div>)}
    </div>
  </div>;
}

const clamp = (value: number, min: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
