import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListSubheader,
  MenuItem,
  Select,
  Slider,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRenderSpec } from '../hooks/useRenderSpec';
import { useTranslation, type MessageKey } from '../i18n/messages';
import {
  deleteWatermarkPreset,
  listWatermarkFonts,
  listWatermarkPresets,
  replaceWatermarkPresets,
  saveWatermarkPreset,
  type FontInfo,
  type WatermarkPreset,
} from '../services/tauri/watermark';
import {
  DEFAULT_WATERMARK,
  type Anchor,
  type FontSpec,
  type WatermarkSpec,
} from '../types/renderSpec';
import { useUIStore } from '../stores/uiStore';
import { errorMessage } from '../services/errorMessages';
import { normalizeError } from '../services/tauri/image';
import { selectWatermarkImage } from '../services/watermarkImageSelection';
import {
  createPresetBundle,
  exportPresetText,
  getDefaultPresetId,
  importPresetText,
  isWatermarkPreset,
  mergeImportedPresets,
  parsePresetBundle,
  setDefaultPresetId,
} from '../services/presetBundles';

const ANCHORS: { value: Anchor; label: MessageKey }[] = [
  { value: 'topLeft', label: 'anchorTopLeft' },
  { value: 'topCenter', label: 'anchorTopCenter' },
  { value: 'topRight', label: 'anchorTopRight' },
  { value: 'centerLeft', label: 'anchorCenterLeft' },
  { value: 'center', label: 'anchorCenter' },
  { value: 'centerRight', label: 'anchorCenterRight' },
  { value: 'bottomLeft', label: 'anchorBottomLeft' },
  { value: 'bottomCenter', label: 'anchorBottomCenter' },
  { value: 'bottomRight', label: 'anchorBottomRight' },
];

export function StampControls() {
  const t = useTranslation();
  const { spec, update } = useRenderSpec();
  const [draft, setDraft] = useState<WatermarkSpec>(() => structuredClone(DEFAULT_WATERMARK));
  const stamp = spec?.watermark ?? draft;
  const enabled = Boolean(spec?.watermark);
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const [presets, setPresets] = useState<WatermarkPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [defaultWatermarkPresetId, setDefaultWatermarkPresetId] = useState(() =>
    getDefaultPresetId('watermark'),
  );
  const [renameTarget, setRenameTarget] = useState<WatermarkPreset | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<WatermarkPreset | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const systemFontsEnabled = useUIStore((state) => state.systemFontsEnabled);
  useEffect(() => {
    void listWatermarkFonts(systemFontsEnabled)
      .then((available) => {
        setFonts(available);
        const current = stamp.font;
        const exact = available.find((font) => font.family === current?.family);
        if (current && !current.path && exact?.path) changeFont({ path: exact.path });
        else if (current && !exact) {
          const fallback =
            available.find((font) => font.builtin && font.family === 'Noto Sans SC') ??
            available.find((font) => font.builtin);
          if (fallback) changeFont({ family: fallback.family, path: fallback.path });
        }
      })
      .catch((error) => setMessage(String(error)));
  }, [systemFontsEnabled]); // Each source mode is cached for the app lifetime.
  useEffect(() => {
    void listWatermarkPresets()
      .then((stored) => {
        setPresets(stored);
        if (
          defaultWatermarkPresetId &&
          !stored.some((preset) => preset.id === defaultWatermarkPresetId)
        ) {
          setDefaultPresetId('watermark', null);
          setDefaultWatermarkPresetId(null);
        }
      })
      .catch((error) => setMessage(String(error)));
  }, []);
  const selectedFont = useMemo(
    () => fonts.find((font) => font.family === stamp.font?.family),
    [fonts, stamp.font?.family],
  );
  const change = (patch: Partial<WatermarkSpec>) => {
    const next = { ...stamp, ...patch };
    if (enabled) update({ watermark: next });
    else setDraft(next);
  };
  const changeFont = (patch: Partial<FontSpec>) =>
    change({ font: { ...DEFAULT_WATERMARK.font!, ...stamp.font, ...patch } });

  if (!spec) return <p className="m-0 text-xs leading-5 text-secondary">{t('stampChoosePhoto')}</p>;

  const chooseImage = async () => {
    try {
      const path = await selectWatermarkImage();
      if (path !== null) {
        change({ type: 'image', path, content: '' });
        setMessage(null);
      }
    } catch (error) {
      setMessage(errorMessage(normalizeError(error)));
    }
  };
  const savePreset = async () => {
    const name = presetName.trim();
    if (!name) {
      setMessage(t('stampPresetNameRequired'));
      return;
    }
    const preset = {
      id: crypto.randomUUID(),
      name: uniquePresetName(name, presets),
      watermark: structuredClone(stamp),
    };
    try {
      setPresets(await saveWatermarkPreset(preset));
      setPresetName('');
      setMessage(t('stampPresetSaved'));
    } catch (error) {
      setMessage(String(error));
    }
  };

  const applyPreset = (preset: WatermarkPreset) => {
    const loaded = withAllowedFont(preset.watermark, fonts);
    setDraft(structuredClone(loaded));
    update({ watermark: structuredClone(loaded) });
  };

  const toggleDefault = (preset: WatermarkPreset) => {
    const id = defaultWatermarkPresetId === preset.id ? null : preset.id;
    setDefaultPresetId('watermark', id);
    setDefaultWatermarkPresetId(id);
    setMessage(id ? t('stampDefaultSet', { name: preset.name }) : t('stampDefaultCleared'));
  };

  const renamePreset = async () => {
    if (!renameTarget || !renameDraft.trim()) return;
    try {
      const name = uniquePresetName(
        renameDraft,
        presets.filter((item) => item.id !== renameTarget.id),
      );
      setPresets(
        await replaceWatermarkPresets(
          presets.map((item) => (item.id === renameTarget.id ? { ...item, name } : item)),
        ),
      );
      setRenameTarget(null);
      setMessage(t('presetRenamed'));
    } catch (error) {
      setMessage(String(error));
    }
  };

  const removePreset = async () => {
    if (!deleteTarget) return;
    try {
      setPresets(await deleteWatermarkPreset(deleteTarget.id));
      if (defaultWatermarkPresetId === deleteTarget.id) {
        setDefaultPresetId('watermark', null);
        setDefaultWatermarkPresetId(null);
      }
      setDeleteTarget(null);
      setMessage(t('presetDeleted'));
    } catch (error) {
      setMessage(String(error));
    }
  };

  const importPresets = async () => {
    try {
      const contents = await importPresetText('watermark');
      if (contents === null) return;
      const bundle = parsePresetBundle(contents, 'watermark', isWatermarkPreset);
      const merged = mergeImportedPresets(
        presets,
        bundle.presets,
        bundle.defaultPresetId,
        'watermark',
      );
      setPresets(await replaceWatermarkPresets(merged.presets));
      if (!defaultWatermarkPresetId && merged.importedDefaultId) {
        setDefaultPresetId('watermark', merged.importedDefaultId);
        setDefaultWatermarkPresetId(merged.importedDefaultId);
      }
      setMessage(
        t('stampPresetsImported', { count: bundle.presets.length }) +
          (bundle.presets.some((item) => item.watermark.type === 'image')
            ? t('stampImagePathsHint')
            : ''),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('presetsImportFailed'));
    }
  };

  const exportPresets = async () => {
    try {
      const contents = createPresetBundle('watermark', presets, defaultWatermarkPresetId);
      if (await exportPresetText('watermark', contents)) setMessage(t('stampPresetsExported'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('presetsExportFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between text-xs font-medium text-secondary">
        {t('stampEnable')}
        <Switch
          size="small"
          checked={enabled}
          onChange={(event) => {
            if (event.target.checked) update({ watermark: structuredClone(stamp) });
            else {
              setDraft(structuredClone(stamp));
              update({ watermark: undefined });
            }
          }}
        />
      </label>
      <Tabs
        value={stamp.type}
        onChange={(_, value: WatermarkSpec['type']) => change({ type: value })}
        variant="fullWidth"
        sx={{ minHeight: 34, '& .MuiTab-root': { minHeight: 34, py: 0, fontSize: 11 } }}
      >
        <Tab value="text" label={t('text')} />
        <Tab value="image" label={t('imagePng')} />
      </Tabs>

      {stamp.type === 'text' ? (
        <>
          <TextField
            multiline
            minRows={2}
            fullWidth
            size="small"
            label={t('stampText')}
            value={stamp.content}
            onChange={(event) => change({ content: event.target.value })}
          />
          <Field label={t('font')}>
            <Select
              fullWidth
              size="small"
              value={stamp.font?.family ?? ''}
              onChange={(event) => {
                const font = fonts.find((entry) => entry.family === event.target.value);
                changeFont({ family: String(event.target.value), path: font?.path });
              }}
              sx={{ height: 34, fontSize: 12, fontFamily: `"${stamp.font?.family}"` }}
            >
              <ListSubheader>{t('applicationFonts')}</ListSubheader>
              {fonts
                .filter((font) => font.builtin)
                .map((font) => (
                  <MenuItem
                    key={`${font.family}-${font.path}`}
                    value={font.family}
                    sx={{ fontFamily: `"${font.family}"` }}
                  >
                    {font.family}
                  </MenuItem>
                ))}
              {systemFontsEnabled && fonts.some((font) => !font.builtin) && (
                <ListSubheader>{t('systemFonts')}</ListSubheader>
              )}
              {systemFontsEnabled &&
                fonts
                  .filter((font) => !font.builtin)
                  .map((font) => (
                    <MenuItem
                      key={`${font.family}-${font.path}`}
                      value={font.family}
                      sx={{ fontFamily: `"${font.family}"` }}
                    >
                      {font.family}
                    </MenuItem>
                  ))}
            </Select>
          </Field>
          {selectedFont && (
            <p className="-mt-2 m-0 truncate text-[10px] text-secondary">
              {selectedFont.builtin ? t('bundledFontHint') : t('systemFont')}
            </p>
          )}
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <NumberControl
              label={t('fontSize')}
              value={stamp.font?.size ?? 32}
              min={1}
              max={stamp.font?.sizeUnit === 'percent' ? 20 : 500}
              step={stamp.font?.sizeUnit === 'percent' ? 0.1 : 1}
              onChange={(size) => changeFont({ size })}
            />
            <ToggleButtonGroup
              exclusive
              size="small"
              value={stamp.font?.sizeUnit ?? 'px'}
              onChange={(_, sizeUnit: FontSpec['sizeUnit'] | null) =>
                sizeUnit && changeFont({ sizeUnit })
              }
              sx={{ height: 32 }}
            >
              <ToggleButton value="px">px</ToggleButton>
              <ToggleButton value="percent">%</ToggleButton>
            </ToggleButtonGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ColorField
              label={t('color')}
              value={stamp.font?.color ?? '#FFFFFF'}
              onChange={(color) => changeFont({ color })}
            />
            <ColorField
              label={t('stroke')}
              value={stamp.font?.strokeColor ?? '#000000'}
              onChange={(strokeColor) => changeFont({ strokeColor })}
            />
          </div>
          <Range
            label={t('strokeWidth')}
            value={stamp.font?.strokeWidth ?? 0}
            min={0}
            max={12}
            step={0.5}
            suffix="px"
            onChange={(strokeWidth) => changeFont({ strokeWidth })}
          />
          <div className="rounded-md border border-subtle p-3">
            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-secondary">
              {t('shadow')}
            </span>
            <ColorField
              label={t('color')}
              value={(stamp.font?.shadow.color ?? '#00000080').slice(0, 7)}
              onChange={(color) =>
                changeFont({ shadow: { ...stamp.font!.shadow, color: `${color}80` } })
              }
            />
            <Range
              label={t('blur')}
              value={stamp.font?.shadow.blur ?? 0}
              min={0}
              max={32}
              suffix="px"
              onChange={(blur) => changeFont({ shadow: { ...stamp.font!.shadow, blur } })}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberControl
                label={t('offsetX')}
                value={stamp.font?.shadow.offsetX ?? 0}
                min={-100}
                max={100}
                onChange={(offsetX) => changeFont({ shadow: { ...stamp.font!.shadow, offsetX } })}
              />
              <NumberControl
                label={t('offsetY')}
                value={stamp.font?.shadow.offsetY ?? 0}
                min={-100}
                max={100}
                onChange={(offsetY) => changeFont({ shadow: { ...stamp.font!.shadow, offsetY } })}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Button fullWidth variant="outlined" onClick={() => void chooseImage()}>
            {stamp.path ? t('replacePng') : t('choosePng')}
          </Button>
          <p className="m-0 truncate text-[10px] text-secondary" title={stamp.path}>
            {stamp.path?.split(/[\\/]/).pop() ?? t('noImageSelected')}
          </p>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-secondary">{t('position')}</span>
          <label className="flex items-center gap-1 text-[10px] text-secondary">
            {t('freePositioning')}
            <Switch
              size="small"
              checked={Boolean(stamp.freePosition)}
              onChange={(event) =>
                change({
                  freePosition: event.target.checked ? { x: 0.5, y: 0.5 } : undefined,
                  ...(event.target.checked ? { offsetX: 0, offsetY: 0 } : {}),
                })
              }
            />
          </label>
        </div>
        <div
          className="grid grid-cols-3 gap-1 rounded-lg border border-subtle bg-app-base p-1"
          role="group"
          aria-label={t('stampAnchor')}
        >
          {ANCHORS.map((anchor) => (
            <button
              key={anchor.value}
              type="button"
              title={t(anchor.label)}
              aria-label={t(anchor.label)}
              aria-pressed={!stamp.freePosition && stamp.position === anchor.value}
              className={`grid h-8 place-items-center rounded border transition-colors ${!stamp.freePosition && stamp.position === anchor.value ? 'border-accent bg-app-elevated' : 'border-transparent hover:border-subtle'}`}
              onClick={() => change({ position: anchor.value, freePosition: undefined })}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            </button>
          ))}
        </div>
        {stamp.freePosition && (
          <p className="mb-0 mt-2 text-[10px] leading-4 text-secondary">{t('freePositionHint')}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberControl
          label={t('offsetX')}
          value={stamp.offsetX}
          min={-2000}
          max={2000}
          onChange={(offsetX) => change({ offsetX })}
        />
        <NumberControl
          label={t('offsetY')}
          value={stamp.offsetY}
          min={-2000}
          max={2000}
          onChange={(offsetY) => change({ offsetY })}
        />
      </div>
      <Range
        label={t('opacity')}
        value={stamp.opacity * 100}
        min={0}
        max={100}
        suffix="%"
        onChange={(opacity) => change({ opacity: opacity / 100 })}
      />
      <Range
        label={t('rotation')}
        value={stamp.rotation}
        min={-180}
        max={180}
        suffix="°"
        onChange={(rotation) => change({ rotation })}
      />
      <Range
        label={t('scale')}
        value={stamp.scale * 100}
        min={10}
        max={400}
        suffix="%"
        onChange={(scale) => change({ scale: scale / 100 })}
      />
      <label className="flex items-center justify-between text-xs font-medium text-secondary">
        {t('tileImage')}
        <Switch
          size="small"
          checked={stamp.tiled}
          onChange={(event) => change({ tiled: event.target.checked })}
        />
      </label>
      {stamp.tiled && (
        <Range
          label={t('tileGap')}
          value={stamp.tileGap}
          min={0}
          max={500}
          suffix="px"
          onChange={(tileGap) => change({ tileGap })}
        />
      )}

      <div className="border-t border-subtle pt-3">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-secondary">
          {t('presets')}
        </span>
        {presets.length > 0 && (
          <div className="mb-2 space-y-1">
            {presets.map((preset) => (
              <div key={preset.id} className="flex flex-wrap items-center gap-1">
                <Button
                  size="small"
                  fullWidth
                  variant="text"
                  sx={{ justifyContent: 'flex-start', fontSize: 11 }}
                  onClick={() => applyPreset(preset)}
                >
                  {preset.name}
                  {defaultWatermarkPresetId === preset.id ? t('defaultSuffix') : ''}
                </Button>
                <Button
                  size="small"
                  aria-label={t('setNamedDefault', { name: preset.name })}
                  onClick={() => toggleDefault(preset)}
                >
                  {defaultWatermarkPresetId === preset.id ? t('unset') : t('default')}
                </Button>
                <Button
                  size="small"
                  aria-label={t('renameNamed', { name: preset.name })}
                  onClick={() => {
                    setRenameTarget(preset);
                    setRenameDraft(preset.name);
                  }}
                >
                  {t('rename')}
                </Button>
                <Button
                  size="small"
                  color="error"
                  aria-label={t('deleteNamed', { name: preset.name })}
                  onClick={() => setDeleteTarget(preset)}
                >
                  {t('delete')}
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <TextField
            size="small"
            fullWidth
            placeholder={t('presetName')}
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <Button size="small" variant="outlined" onClick={() => void savePreset()}>
            {t('save')}
          </Button>
        </div>
        <div className="mt-2 flex gap-2">
          <Button size="small" variant="outlined" onClick={() => void importPresets()}>
            {t('import')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={presets.length === 0}
            onClick={() => void exportPresets()}
          >
            {t('exportPresetsShort')}
          </Button>
          {defaultWatermarkPresetId && (
            <Button
              size="small"
              onClick={() => {
                const preset = presets.find((item) => item.id === defaultWatermarkPresetId);
                if (preset) applyPreset(preset);
              }}
            >
              {t('applyDefault')}
            </Button>
          )}
        </div>
        {message && <p className="mb-0 mt-2 text-[10px] text-secondary">{message}</p>}
      </div>
      <Dialog
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="rename-stamp-preset-title"
      >
        <DialogTitle id="rename-stamp-preset-title">{t('renameStampPreset')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={t('presetName')}
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)}>{t('cancel')}</Button>
          <Button disabled={!renameDraft.trim()} onClick={() => void renamePreset()}>
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="delete-stamp-preset-title"
      >
        <DialogTitle id="delete-stamp-preset-title">{t('deleteStampPreset')}</DialogTitle>
        <DialogContent>
          {t('deleteStampPresetHint', { name: deleteTarget?.name ?? '' })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => void removePreset()}>
            {t('delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

function uniquePresetName(requested: string, presets: WatermarkPreset[]): string {
  const base = requested.trim();
  const names = new Set(presets.map((preset) => preset.name.toLocaleLowerCase()));
  let name = base;
  for (let index = 2; names.has(name.toLocaleLowerCase()); index += 1) name = `${base} (${index})`;
  return name;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-medium text-secondary">{label}</span>
      {children}
    </label>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-secondary">
        <span>{label}</span>
        <output className="font-mono text-primary">
          {Math.round(value * 10) / 10}
          {suffix}
        </output>
      </div>
      <Slider
        size="small"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_, next) => onChange(next as number)}
      />
    </div>
  );
}
function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={value}
      onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value))))}
      slotProps={{ htmlInput: { min, max, step } }}
    />
  );
}
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-secondary">
      <span>{label}</span>
      <input
        type="color"
        className="h-8 w-12 cursor-pointer rounded border border-subtle bg-transparent p-0.5"
        value={value.slice(0, 7)}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
      />
    </label>
  );
}

function withAllowedFont(stamp: WatermarkSpec, fonts: FontInfo[]): WatermarkSpec {
  if (!stamp.font || fonts.some((font) => font.family === stamp.font?.family)) return stamp;
  const fallback =
    fonts.find((font) => font.builtin && font.family === 'Noto Sans SC') ??
    fonts.find((font) => font.builtin);
  return fallback
    ? { ...stamp, font: { ...stamp.font, family: fallback.family, path: fallback.path } }
    : stamp;
}
