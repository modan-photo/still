import {
  Button, IconButton, MenuItem, Select, Slider, Switch, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRenderSpec } from '../hooks/useRenderSpec';
import {
  deleteWatermarkPreset, listWatermarkFonts, listWatermarkPresets, saveWatermarkPreset,
  type FontInfo, type WatermarkPreset,
} from '../services/tauri/watermark';
import { DEFAULT_WATERMARK, type Anchor, type FontSpec, type WatermarkSpec } from '../types/renderSpec';

const ANCHORS: { value: Anchor; label: string }[] = [
  { value: 'topLeft', label: 'Top left' }, { value: 'topCenter', label: 'Top center' }, { value: 'topRight', label: 'Top right' },
  { value: 'centerLeft', label: 'Center left' }, { value: 'center', label: 'Center' }, { value: 'centerRight', label: 'Center right' },
  { value: 'bottomLeft', label: 'Bottom left' }, { value: 'bottomCenter', label: 'Bottom center' }, { value: 'bottomRight', label: 'Bottom right' },
];

export function WatermarkControls() {
  const { spec, update } = useRenderSpec();
  const [draft, setDraft] = useState<WatermarkSpec>(() => structuredClone(DEFAULT_WATERMARK));
  const watermark = spec?.watermark ?? draft;
  const enabled = Boolean(spec?.watermark);
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const [presets, setPresets] = useState<WatermarkPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void listWatermarkFonts().then((available) => {
    setFonts(available);
    const current = watermark.font;
    const exact = available.find((font) => font.family === current?.family);
    if (current && !current.path && exact?.path) changeFont({ path: exact.path });
  }).catch((error) => setMessage(String(error))); }, []); // Font enumeration is cached for the app lifetime.
  useEffect(() => { void listWatermarkPresets().then(setPresets).catch((error) => setMessage(String(error))); }, []);
  const selectedFont = useMemo(() => fonts.find((font) => font.family === watermark.font?.family), [fonts, watermark.font?.family]);
  const change = (patch: Partial<WatermarkSpec>) => {
    const next = { ...watermark, ...patch };
    if (enabled) update({ watermark: next }); else setDraft(next);
  };
  const changeFont = (patch: Partial<FontSpec>) => change({ font: { ...DEFAULT_WATERMARK.font!, ...watermark.font, ...patch } });

  if (!spec) return <p className="m-0 text-xs leading-5 text-secondary">Select a photo to add a watermark.</p>;

  const chooseImage = async () => {
    const path = await open({ multiple: false, filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (typeof path === 'string') change({ type: 'image', path, content: '' });
  };
  const savePreset = async () => {
    const name = presetName.trim();
    if (!name) { setMessage('Enter a preset name first.'); return; }
    const preset = { id: crypto.randomUUID(), name, watermark: structuredClone(watermark) };
    try { setPresets(await saveWatermarkPreset(preset)); setPresetName(''); setMessage('Preset saved.'); }
    catch (error) { setMessage(String(error)); }
  };

  return <div className="space-y-4">
    <label className="flex items-center justify-between text-xs font-medium text-secondary">
      Enable watermark
      <Switch size="small" checked={enabled} onChange={(event) => {
        if (event.target.checked) update({ watermark: structuredClone(watermark) });
        else { setDraft(structuredClone(watermark)); update({ watermark: undefined }); }
      }} />
    </label>
    <Tabs value={watermark.type} onChange={(_, value: WatermarkSpec['type']) => change({ type: value })} variant="fullWidth" sx={{ minHeight: 34, '& .MuiTab-root': { minHeight: 34, py: 0, fontSize: 11 } }}>
      <Tab value="text" label="Text" /><Tab value="image" label="Image (PNG)" />
    </Tabs>

    {watermark.type === 'text' ? <>
      <TextField multiline minRows={2} fullWidth size="small" label="Watermark text" value={watermark.content}
        onChange={(event) => change({ content: event.target.value })} />
      <Field label="Font">
        <Select fullWidth size="small" value={watermark.font?.family ?? ''} onChange={(event) => {
          const font = fonts.find((entry) => entry.family === event.target.value);
          changeFont({ family: String(event.target.value), path: font?.path });
        }} sx={{ height: 34, fontSize: 12, fontFamily: `"${watermark.font?.family}"` }}>
          {fonts.map((font) => <MenuItem key={`${font.family}-${font.path}`} value={font.family} sx={{ fontFamily: `"${font.family}"` }}>{font.family}</MenuItem>)}
        </Select>
      </Field>
      {selectedFont && <p className="-mt-2 m-0 truncate text-[10px] text-secondary">{selectedFont.builtin ? 'Bundled · exact preview/export match' : 'System font'}</p>}
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <NumberControl label="Font size" value={watermark.font?.size ?? 32} min={1} max={watermark.font?.sizeUnit === 'percent' ? 20 : 500} step={watermark.font?.sizeUnit === 'percent' ? 0.1 : 1} onChange={(size) => changeFont({ size })} />
        <ToggleButtonGroup exclusive size="small" value={watermark.font?.sizeUnit ?? 'px'} onChange={(_, sizeUnit: FontSpec['sizeUnit'] | null) => sizeUnit && changeFont({ sizeUnit })} sx={{ height: 32 }}>
          <ToggleButton value="px">px</ToggleButton><ToggleButton value="percent">%</ToggleButton>
        </ToggleButtonGroup>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Color" value={watermark.font?.color ?? '#FFFFFF'} onChange={(color) => changeFont({ color })} />
        <ColorField label="Stroke" value={watermark.font?.strokeColor ?? '#000000'} onChange={(strokeColor) => changeFont({ strokeColor })} />
      </div>
      <Range label="Stroke width" value={watermark.font?.strokeWidth ?? 0} min={0} max={12} step={0.5} suffix="px" onChange={(strokeWidth) => changeFont({ strokeWidth })} />
      <div className="rounded-md border border-subtle p-3">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-secondary">Shadow</span>
        <ColorField label="Color" value={(watermark.font?.shadow.color ?? '#00000080').slice(0, 7)} onChange={(color) => changeFont({ shadow: { ...watermark.font!.shadow, color: `${color}80` } })} />
        <Range label="Blur" value={watermark.font?.shadow.blur ?? 0} min={0} max={32} suffix="px" onChange={(blur) => changeFont({ shadow: { ...watermark.font!.shadow, blur } })} />
        <div className="grid grid-cols-2 gap-2">
          <NumberControl label="Offset X" value={watermark.font?.shadow.offsetX ?? 0} min={-100} max={100} onChange={(offsetX) => changeFont({ shadow: { ...watermark.font!.shadow, offsetX } })} />
          <NumberControl label="Offset Y" value={watermark.font?.shadow.offsetY ?? 0} min={-100} max={100} onChange={(offsetY) => changeFont({ shadow: { ...watermark.font!.shadow, offsetY } })} />
        </div>
      </div>
    </> : <div className="space-y-2">
      <Button fullWidth variant="outlined" onClick={() => void chooseImage()}>{watermark.path ? 'Replace PNG' : 'Choose transparent PNG'}</Button>
      <p className="m-0 truncate text-[10px] text-secondary" title={watermark.path}>{watermark.path?.split(/[\\/]/).pop() ?? 'No image selected'}</p>
    </div>}

    <div>
      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-secondary">Position</span>
        <label className="flex items-center gap-1 text-[10px] text-secondary">Free positioning<Switch size="small" checked={Boolean(watermark.freePosition)} onChange={(event) => change({ freePosition: event.target.checked ? { x: 0.5, y: 0.5 } : undefined, ...(event.target.checked ? { offsetX: 0, offsetY: 0 } : {}) })} /></label>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-subtle bg-app-base p-1" role="radiogroup" aria-label="Watermark anchor">
        {ANCHORS.map((anchor) => <button key={anchor.value} type="button" title={anchor.label} aria-label={anchor.label} aria-pressed={!watermark.freePosition && watermark.position === anchor.value}
          className={`grid h-8 place-items-center rounded border transition-colors ${!watermark.freePosition && watermark.position === anchor.value ? 'border-accent bg-app-elevated' : 'border-transparent hover:border-subtle'}`}
          onClick={() => change({ position: anchor.value, freePosition: undefined })}><span className="h-1.5 w-1.5 rounded-full bg-current" /></button>)}
      </div>
      {watermark.freePosition && <p className="mb-0 mt-2 text-[10px] leading-4 text-secondary">Drag the watermark on the canvas. Green guides show anchor snapping.</p>}
    </div>

    <div className="grid grid-cols-2 gap-2"><NumberControl label="Offset X" value={watermark.offsetX} min={-2000} max={2000} onChange={(offsetX) => change({ offsetX })} /><NumberControl label="Offset Y" value={watermark.offsetY} min={-2000} max={2000} onChange={(offsetY) => change({ offsetY })} /></div>
    <Range label="Opacity" value={watermark.opacity * 100} min={0} max={100} suffix="%" onChange={(opacity) => change({ opacity: opacity / 100 })} />
    <Range label="Rotation" value={watermark.rotation} min={-180} max={180} suffix="°" onChange={(rotation) => change({ rotation })} />
    <Range label="Scale" value={watermark.scale * 100} min={10} max={400} suffix="%" onChange={(scale) => change({ scale: scale / 100 })} />
    <label className="flex items-center justify-between text-xs font-medium text-secondary">Tile across image<Switch size="small" checked={watermark.tiled} onChange={(event) => change({ tiled: event.target.checked })} /></label>
    {watermark.tiled && <Range label="Tile gap" value={watermark.tileGap} min={0} max={500} suffix="px" onChange={(tileGap) => change({ tileGap })} />}

    <div className="border-t border-subtle pt-3">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-secondary">Presets</span>
      {presets.length > 0 && <div className="mb-2 space-y-1">{presets.map((preset) => <div key={preset.id} className="flex items-center gap-1">
        <Button size="small" fullWidth variant="text" sx={{ justifyContent: 'flex-start', fontSize: 11 }} onClick={() => { setDraft(structuredClone(preset.watermark)); update({ watermark: structuredClone(preset.watermark) }); }}>{preset.name}</Button>
        <IconButton size="small" aria-label={`Delete ${preset.name}`} onClick={() => void deleteWatermarkPreset(preset.id).then(setPresets)}>×</IconButton>
      </div>)}</div>}
      <div className="flex gap-2"><TextField size="small" fullWidth placeholder="Preset name" value={presetName} onChange={(event) => setPresetName(event.target.value)} /><Button size="small" variant="outlined" onClick={() => void savePreset()}>Save</Button></div>
      {message && <p className="mb-0 mt-2 text-[10px] text-secondary">{message}</p>}
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label><span className="mb-1.5 block text-xs font-medium text-secondary">{label}</span>{children}</label>; }
function Range({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) {
  return <div><div className="flex items-center justify-between text-xs text-secondary"><span>{label}</span><output className="font-mono text-primary">{Math.round(value * 10) / 10}{suffix}</output></div><Slider size="small" value={value} min={min} max={max} step={step} onChange={(_, next) => onChange(next as number)} /></div>;
}
function NumberControl({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <TextField label={label} type="number" size="small" value={value} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value))))} slotProps={{ htmlInput: { min, max, step } }} />;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="flex items-center justify-between gap-2 text-xs text-secondary"><span>{label}</span><input type="color" className="h-8 w-12 cursor-pointer rounded border border-subtle bg-transparent p-0.5" value={value.slice(0, 7)} onChange={(event) => onChange(event.target.value.toUpperCase())} /></label>;
}
