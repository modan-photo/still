import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Popover,
  Snackbar,
  SnackbarContent,
  Slider,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { BUILTIN_FRAME_PRESETS, DEFAULT_FRAME_PRESET_ID } from '../constants/framePresets';
import { useRenderSpec } from '../hooks/useRenderSpec';
import { loadFramePresets, saveFramePresets } from '../services/tauri/framePresets';
import { loadUIState, saveLastFramePresetId } from '../services/tauri/uiState';
import { useProjectStore } from '../stores/projectStore';
import type { FramePreset } from '../types/frame';
import { DEFAULT_BORDER, type BorderSpec } from '../types/renderSpec';
import { framePresetToBorderSpec } from './FrameMiniPreview';
import { FramePresetActions, type FramePresetActionTarget } from './FramePresetActions';
import { FramePresetSelect } from './FramePresetSelect';
import { makeUniqueFramePresetName, SaveFramePresetDialog } from './SaveFramePresetDialog';
import { motionTokens } from '../theme/tokens';

const PRESET_COLORS = ['#FFFFFF', '#F5F0E8', '#D8E7DE', '#BEDBE7', '#F3C6C2', '#F0D28C', '#D8C6E8', '#A8A8A8', '#555555', '#171717', '#B64236', '#2E6450'];

export function FrameControls() {
  const { spec, update } = useRenderSpec();
  const selectedId = useProjectStore((state) => state.selectedId);
  const photo = useProjectStore((state) => state.photos.find((entry) => entry.id === state.selectedId));
  const photoCount = useProjectStore((state) => state.photos.length);
  const applyBorderToAll = useProjectStore((state) => state.applyBorderToAll);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [presetActionTarget, setPresetActionTarget] = useState<FramePresetActionTarget | null>(null);
  const [userPresets, setUserPresets] = useState<FramePreset[]>([]);
  const [currentFramePresetId, setCurrentFramePresetId] = useState(DEFAULT_FRAME_PRESET_ID);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const selectionChangedDuringLoad = useRef(false);
  const presets = useMemo<FramePreset[]>(() => [
    ...BUILTIN_FRAME_PRESETS.map((preset) => structuredClone(preset)),
    ...userPresets,
  ], [userPresets]);
  const selectedPreset = presets.find((preset) => preset.id === currentFramePresetId)
    ?? presets.find((preset) => preset.id === DEFAULT_FRAME_PRESET_ID)
    ?? presets[0];
  const frameApplied = Boolean(spec?.border);
  const frame = spec?.border ?? DEFAULT_BORDER;
  const change = (patch: Partial<BorderSpec>) => update({ border: { ...frame, ...patch } });
  const dimensionValue = frame.width;

  useEffect(() => {
    let disposed = false;
    void Promise.all([loadFramePresets(), loadUIState()])
      .then(([storedPresets, uiState]) => {
        if (disposed) return;
        setUserPresets(storedPresets);
        const availableIds = new Set([
          ...BUILTIN_FRAME_PRESETS.map((preset) => preset.id),
          ...storedPresets.map((preset) => preset.id),
        ]);
        if (!selectionChangedDuringLoad.current) {
          setCurrentFramePresetId(
            uiState.lastFramePresetId && availableIds.has(uiState.lastFramePresetId)
              ? uiState.lastFramePresetId
              : DEFAULT_FRAME_PRESET_ID,
          );
        }
      })
      .catch((error: unknown) => {
        console.warn('Unable to restore frame presets', error);
      })
      .finally(() => {
        if (!disposed) setPresetsLoaded(true);
      });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!presetsLoaded || !selectedId || !photo || spec?.border || !selectedPreset) return;
    update({ border: framePresetToBorderSpec(selectedPreset) });
  }, [photo, presetsLoaded, selectedId, selectedPreset, spec?.border, update]);

  const selectPreset = (preset: FramePreset) => {
    selectionChangedDuringLoad.current = true;
    setCurrentFramePresetId(preset.id);
    update({ border: framePresetToBorderSpec(preset) });
    void saveLastFramePresetId(preset.id).catch((error: unknown) => {
      console.warn('Unable to persist the selected frame preset', error);
    });
  };

  const presetModified = selectedPreset
    ? !borderMatchesPreset(frame, selectedPreset)
    : false;
  const currentPreviewPreset = selectedPreset
    ? framePreviewPreset(frame, selectedPreset)
    : undefined;

  const saveCurrentPreset = async (requestedName: string) => {
    if (!selectedPreset || !currentPreviewPreset) return;
    const name = makeUniqueFramePresetName(requestedName, presets.map((preset) => preset.name));
    const preset: FramePreset = {
      id: createUserPresetId(),
      name,
      style: currentPreviewPreset.style,
      params: structuredClone(currentPreviewPreset.params),
      builtin: false,
      createdAt: Date.now(),
    };
    const nextUserPresets = [...userPresets, preset];
    await saveFramePresets(nextUserPresets);
    await saveLastFramePresetId(preset.id);
    setUserPresets(nextUserPresets);
    setCurrentFramePresetId(preset.id);
    selectionChangedDuringLoad.current = true;
    setNotice('Saved to My Presets');
  };

  const renameUserPreset = async (preset: FramePreset, requestedName: string) => {
    if (preset.builtin) return;
    const otherNames = presets.filter((entry) => entry.id !== preset.id).map((entry) => entry.name);
    const name = makeUniqueFramePresetName(requestedName, otherNames);
    const nextUserPresets = userPresets.map((entry) => (
      entry.id === preset.id ? { ...entry, name } : entry
    ));
    await saveFramePresets(nextUserPresets);
    setUserPresets(nextUserPresets);
    setNotice('Preset renamed');
  };

  const duplicateUserPreset = async (preset: FramePreset) => {
    if (preset.builtin) return;
    const copy: FramePreset = {
      ...structuredClone(preset),
      id: createUserPresetId(),
      name: makeUniqueFramePresetName(`${preset.name} Copy`, presets.map((entry) => entry.name)),
      createdAt: Date.now(),
    };
    const nextUserPresets = [...userPresets, copy];
    await saveFramePresets(nextUserPresets);
    setUserPresets(nextUserPresets);
    setNotice('Preset duplicated');
  };

  const deleteUserPreset = async (preset: FramePreset) => {
    if (preset.builtin) return;
    const nextUserPresets = userPresets.filter((entry) => entry.id !== preset.id);
    await saveFramePresets(nextUserPresets);
    setUserPresets(nextUserPresets);
    if (currentFramePresetId === preset.id) {
      const fallback = presets.find((entry) => entry.id === DEFAULT_FRAME_PRESET_ID);
      if (fallback) {
        setCurrentFramePresetId(fallback.id);
        update({ border: framePresetToBorderSpec(fallback) });
        void saveLastFramePresetId(fallback.id).catch((error: unknown) => {
          console.warn('Unable to persist the fallback frame preset', error);
        });
      }
    }
    setNotice('Preset deleted');
  };

  if (!selectedId || !photo) {
    return <p className="m-0 text-xs leading-5 text-secondary">Select a photo to add a frame.</p>;
  }

  return <div className="space-y-4">
    <FramePresetSelect
      presets={presets}
      selectedPresetId={selectedPreset.id}
      currentPreviewPreset={currentPreviewPreset}
      modified={presetModified}
      previewSource={photo.thumbUrl}
      originalWidth={photo.width}
      originalHeight={photo.height}
      onSelect={selectPreset}
      onSaveCurrent={() => setSaveDialogOpen(true)}
      onPresetActions={(preset, position) => setPresetActionTarget({ preset, position })}
    />

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
    {currentPreviewPreset && <SaveFramePresetDialog
      open={saveDialogOpen}
      preset={currentPreviewPreset}
      existingNames={presets.map((preset) => preset.name)}
      previewSource={photo.thumbUrl}
      originalWidth={photo.width}
      originalHeight={photo.height}
      onClose={() => setSaveDialogOpen(false)}
      onSave={saveCurrentPreset}
    />}
    <FramePresetActions
      target={presetActionTarget}
      onCloseMenu={() => setPresetActionTarget(null)}
      onRename={renameUserPreset}
      onDuplicate={duplicateUserPreset}
      onDelete={deleteUserPreset}
      onError={setNotice}
    />
    <Snackbar
      open={Boolean(notice)}
      autoHideDuration={motionTokens.duration.slow * 8}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') setNotice(null);
      }}
    >
      <SnackbarContent
        role="status"
        message={notice ?? ''}
        sx={(theme) => ({
          minWidth: 0,
          color: theme.still.colors[theme.palette.mode].text.primary,
          backgroundColor: theme.still.colors[theme.palette.mode].bg.elevated,
          borderColor: theme.still.colors[theme.palette.mode].border.subtle,
          borderRadius: `${theme.still.radius.lg}px`,
          boxShadow: theme.still.shadow.elev3,
        })}
      />
    </Snackbar>
  </div>;
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

function borderMatchesPreset(border: BorderSpec, preset: FramePreset): boolean {
  return JSON.stringify(border) === JSON.stringify(framePresetToBorderSpec(preset));
}

function framePreviewPreset(border: BorderSpec, preset: FramePreset): Pick<FramePreset, 'style' | 'params'> {
  const gradient = preset.style === 'gradient'
    ? {
        stops: border.colors.map((color, index) => ({
          offset: border.colors.length > 1 ? index / (border.colors.length - 1) : 0,
          color,
        })),
        angle: border.angle,
      }
    : preset.params.gradient;
  return {
    style: preset.style,
    params: {
      ...preset.params,
      width: border.width,
      unit: border.unit,
      color: border.color,
      radius: border.radius,
      gradient,
    },
  };
}

function createUserPresetId(): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `user-${Array.from(bytes, (byte) => alphabet[byte & 63]).join('')}`;
}
