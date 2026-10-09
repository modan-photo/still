import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { platform } from '@tauri-apps/plugin-os';
import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import type {
  ExportMode,
  ExportOptions,
  ExportRequest,
  NamingMode,
  ResizeMode,
} from '../types/export';
import type { OutputFormat, RenderSpec } from '../types/renderSpec';
import { getCollageCanvasSize } from './collage/collageModel';
import { borderGeometry } from '../render/border';
import { cropPixelRect } from '../render/crop';
import {
  isDocumentUri,
  parentDirectory,
  withOutputExtension,
  recentFilesystemDirectories,
} from '../services/exportPaths';
import { pickImportDirectory } from '../services/directoryPicker';
import { useTranslation } from '../i18n/messages';

type ExportScope = 'all' | 'current' | 'selected';
type Props = {
  open: boolean;
  exportMode: ExportMode;
  onClose: () => void;
  onExport: (request: ExportRequest) => void;
};
const RECENT_KEY = 'still.export.recent-directories';

const defaultOptions = (): ExportOptions => ({
  format: 'jpeg',
  quality: 92,
  outputDirectory: '',
  size: {
    mode: 'original',
    longEdge: 2400,
    percent: 100,
    width: 2400,
    height: 1600,
    lockAspect: true,
  },
  naming: {
    mode: 'originalSuffix',
    suffix: '_export',
    prefix: 'still_',
    template: '{name}_border_{n}',
    startNumber: 1,
  },
  conflict: 'rename',
  preserveExif: true,
  preserveIcc: true,
});

export function ExportDialog({ open, exportMode, onClose, onExport }: Props) {
  const t = useTranslation();
  const photos = useProjectStore((state) => state.photos);
  const collageDraft = useProjectStore((state) => state.collageDraft);
  const selectedId = useProjectStore((state) => state.currentPhotoId);
  const selectedIds = useProjectStore((state) => state.selectedIds);
  const [scope, setScope] = useState<ExportScope>('all');
  const [options, setOptions] = useState<ExportOptions>(defaultOptions);
  const [recent, setRecent] = useState<string[]>([]);
  const [collageFormat, setCollageFormat] = useState<OutputFormat>('png');
  const [collageQuality, setCollageQuality] = useState(92);
  const [collageOutputPath, setCollageOutputPath] = useState('');
  const targetPhotos = useMemo(
    () =>
      scope === 'current'
        ? photos.filter((photo) => photo.id === selectedId)
        : scope === 'selected'
          ? photos.filter((photo) => selectedIds.includes(photo.id))
          : photos,
    [photos, scope, selectedId, selectedIds],
  );

  useEffect(() => {
    if (!open) return;
    const stored = readRecent();
    setRecent(stored);
    setScope(selectedIds.length > 0 ? 'selected' : 'all');
    setOptions((current) => ({
      ...current,
      outputDirectory:
        current.outputDirectory || stored[0] || parentDirectory(photos[0]?.path ?? ''),
    }));
  }, [open, photos, selectedIds.length]);
  useEffect(() => {
    if (
      open &&
      exportMode === 'collage' &&
      collageDraft.background.type === 'transparent' &&
      collageFormat === 'jpeg'
    ) {
      setCollageFormat('png');
      setCollageOutputPath((path) => withOutputExtension(path, 'png'));
    }
  }, [collageDraft.background.type, collageFormat, exportMode, open]);

  const patch = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));
  const patchSize = (value: Partial<ExportOptions['size']>) =>
    patch('size', { ...options.size, ...value });
  const patchNaming = (value: Partial<ExportOptions['naming']>) =>
    patch('naming', { ...options.naming, ...value });
  const firstPhoto = targetPhotos[0];
  const croppedSize = firstPhoto
    ? cropPixelRect(firstPhoto.width, firstPhoto.height, firstPhoto.spec.crop)
    : null;
  const aspect = croppedSize ? croppedSize.width / croppedSize.height : 1.5;
  const estimate = useMemo(
    () =>
      estimateBytes(
        targetPhotos.map((photo) => photo.spec),
        options,
      ),
    [targetPhotos, options],
  );
  const collagePhotoCount = collageDraft.photoIds.filter((id) =>
    photos.some((photo) => photo.id === id),
  ).length;
  const collageCanvasSize = getCollageCanvasSize(collageDraft, collagePhotoCount);
  const collageSize = collageDraft.border
    ? borderGeometry(
        collageCanvasSize.width,
        collageCanvasSize.height,
        collageCanvasSize.width,
        collageCanvasSize.height,
        collageDraft.border,
      )
    : collageCanvasSize;

  const chooseDirectory = async () => {
    const value = await pickImportDirectory(
      t('chooseExportFolder'),
      isDocumentUri(options.outputDirectory) ? undefined : options.outputDirectory || undefined,
    );
    if (typeof value === 'string')
      setOptions((current) => ({
        ...current,
        outputDirectory: value,
        conflict:
          isDocumentUri(value) && current.conflict === 'overwrite' ? 'rename' : current.conflict,
      }));
  };
  const submit = () => {
    if (
      !options.outputDirectory ||
      (isDocumentUri(options.outputDirectory) && options.conflict === 'overwrite') ||
      targetPhotos.length === 0
    )
      return;
    const nextRecent = [
      options.outputDirectory,
      ...recent.filter((entry) => entry !== options.outputDirectory),
    ]
      .filter((entry) => !isDocumentUri(entry))
      .slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
    setRecent(nextRecent);
    const request: ExportRequest = {
      exportMode: 'photos',
      items: targetPhotos.map((photo, sequenceIndex) => ({
        itemId: crypto.randomUUID(),
        photoId: photo.id,
        sequenceIndex,
        spec: structuredClone(photo.spec),
      })),
      options: structuredClone(options),
    };
    onClose();
    onExport(request);
  };

  const chooseCollageFile = async () => {
    const extension = collageFormat === 'jpeg' ? 'jpg' : collageFormat;
    const value = await saveDialog({
      title: t('exportCollage'),
      defaultPath:
        (!isDocumentUri(collageOutputPath) && collageOutputPath) || `still-collage.${extension}`,
      filters: [
        {
          name:
            collageFormat === 'jpeg'
              ? t('jpegImage')
              : t('genericImage', { format: collageFormat.toUpperCase() }),
          extensions: [extension],
        },
      ],
    });
    if (typeof value === 'string') {
      if (isDocumentUri(value)) {
        setCollageOutputPath('');
        onClose();
        onExport({
          exportMode: 'collage',
          outputPath: value,
          format: collageFormat,
          quality: collageQuality,
        });
      } else {
        setCollageOutputPath(value);
      }
    }
  };
  const submitCollage = () => {
    if (!collageOutputPath || isDocumentUri(collageOutputPath) || collagePhotoCount < 2) return;
    const outputPath = withOutputExtension(collageOutputPath, collageFormat);
    setCollageOutputPath(outputPath);
    onClose();
    onExport({ exportMode: 'collage', outputPath, format: collageFormat, quality: collageQuality });
  };

  if (exportMode === 'collage') {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="sm"
        aria-labelledby="collage-export-dialog-title"
        slotProps={{
          paper: {
            sx: (theme) => ({ borderRadius: `${theme.still.radius.lg}px`, overflow: 'hidden' }),
          },
        }}
      >
        <DialogTitle id="collage-export-dialog-title" sx={{ pb: 1 }}>
          <div className="flex items-baseline justify-between gap-4">
            <span>{t('exportCollage')}</span>
            <span className="text-xs font-normal text-secondary">
              {t('photoCountSize', {
                count: collagePhotoCount,
                width: collageSize.width,
                height: collageSize.height,
              })}
            </span>
          </div>
        </DialogTitle>
        <DialogContent dividers>
          <div className="space-y-5 py-1">
            <Section title={t('file')}>
              <FormControl size="small" fullWidth>
                <InputLabel>{t('format')}</InputLabel>
                <Select
                  label={t('format')}
                  value={collageFormat}
                  onChange={(event) => {
                    const format = event.target.value as OutputFormat;
                    setCollageFormat(format);
                    setCollageOutputPath((path) => withOutputExtension(path, format));
                  }}
                >
                  <MenuItem value="png">PNG</MenuItem>
                  {collageDraft.background.type !== 'transparent' && (
                    <MenuItem value="jpeg">JPEG</MenuItem>
                  )}
                  <MenuItem value="webp">WebP</MenuItem>
                </Select>
              </FormControl>
              {(collageFormat === 'jpeg' || collageFormat === 'webp') && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-secondary">
                    <span>{t('quality')}</span>
                    <span>{collageQuality}</span>
                  </div>
                  <Slider
                    min={1}
                    max={100}
                    value={collageQuality}
                    onChange={(_, value) => setCollageQuality(value as number)}
                    aria-label={t('collageExportQuality')}
                  />
                </div>
              )}
            </Section>
            <Section title={t('destination')}>
              <div className="flex gap-2">
                <TextField
                  size="small"
                  fullWidth
                  label={t('outputFile')}
                  value={collageOutputPath}
                  onChange={(event) => setCollageOutputPath(event.target.value)}
                />
                <Button variant="outlined" onClick={() => void chooseCollageFile()}>
                  {platform() === 'android' ? t('chooseAndExport') : t('choose')}
                </Button>
              </div>
              {isDocumentUri(collageOutputPath) && (
                <p role="alert" className="mt-2 text-xs text-secondary">
                  {t('androidDocumentHint')}
                </p>
              )}
            </Section>
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button
            variant="contained"
            disabled={
              !collageOutputPath || isDocumentUri(collageOutputPath) || collagePhotoCount < 2
            }
            onClick={submitCollage}
          >
            {t('exportCollage')}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="export-dialog-title"
      slotProps={{
        paper: {
          sx: (theme) => ({ borderRadius: `${theme.still.radius.lg}px`, overflow: 'hidden' }),
        },
      }}
    >
      <DialogTitle id="export-dialog-title" sx={{ pb: 1 }}>
        <div className="flex items-baseline justify-between gap-4">
          <span>{t('export')}</span>
          <span className="text-xs font-normal text-secondary">
            {t('photoCountEstimate', { count: targetPhotos.length, size: formatBytes(estimate) })}
          </span>
        </div>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <div className="grid md:grid-cols-2">
          <div className="space-y-5 p-5 md:border-r md:border-subtle">
            <Section title={t('files')}>
              <div className="grid grid-cols-2 gap-3">
                <FormControl size="small">
                  <InputLabel>{t('photos')}</InputLabel>
                  <Select
                    label={t('photos')}
                    value={scope}
                    onChange={(event) => setScope(event.target.value as ExportScope)}
                  >
                    <MenuItem value="all">{t('allPhotos', { count: photos.length })}</MenuItem>
                    <MenuItem value="current">{t('currentPhoto')}</MenuItem>
                    {selectedIds.length > 0 && (
                      <MenuItem value="selected">
                        {t('selectedCount', { count: selectedIds.length })}
                      </MenuItem>
                    )}
                  </Select>
                </FormControl>
                <FormControl size="small">
                  <InputLabel>{t('format')}</InputLabel>
                  <Select
                    label={t('format')}
                    value={options.format}
                    onChange={(event) => patch('format', event.target.value as OutputFormat)}
                  >
                    <MenuItem value="jpeg">JPEG</MenuItem>
                    <MenuItem value="png">PNG</MenuItem>
                    <MenuItem value="webp">WebP</MenuItem>
                  </Select>
                </FormControl>
              </div>
              {(options.format === 'jpeg' || options.format === 'webp') && (
                <div className="pt-2">
                  <div className="mb-1 flex justify-between text-xs text-secondary">
                    <span>{t('quality')}</span>
                    <span>{options.quality}</span>
                  </div>
                  <Slider
                    min={1}
                    max={100}
                    value={options.quality}
                    onChange={(_, value) => patch('quality', value as number)}
                    aria-label={t('exportQuality')}
                  />
                </div>
              )}
            </Section>
            <Section title={t('size')}>
              <ToggleButtonGroup
                exclusive
                size="small"
                fullWidth
                value={options.size.mode}
                onChange={(_, value: ResizeMode | null) => value && patchSize({ mode: value })}
              >
                <ToggleButton value="original">{t('original')}</ToggleButton>
                <ToggleButton value="longEdge">{t('longEdge')}</ToggleButton>
                <ToggleButton value="percent">{t('percent')}</ToggleButton>
                <ToggleButton value="exact">{t('exact')}</ToggleButton>
              </ToggleButtonGroup>
              {options.size.mode === 'longEdge' && (
                <NumberField
                  label={t('longEdge')}
                  value={options.size.longEdge ?? 2400}
                  suffix="px"
                  onChange={(value) => patchSize({ longEdge: value })}
                />
              )}
              {options.size.mode === 'percent' && (
                <NumberField
                  label={t('scale')}
                  value={options.size.percent ?? 100}
                  suffix="%"
                  onChange={(value) => patchSize({ percent: value })}
                />
              )}
              {options.size.mode === 'exact' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      label={t('width')}
                      value={options.size.width ?? 2400}
                      suffix="px"
                      onChange={(width) =>
                        patchSize({
                          width,
                          ...(options.size.lockAspect
                            ? { height: Math.max(1, Math.round(width / aspect)) }
                            : {}),
                        })
                      }
                    />
                    <NumberField
                      label={t('height')}
                      value={options.size.height ?? 1600}
                      suffix="px"
                      onChange={(height) =>
                        patchSize({
                          height,
                          ...(options.size.lockAspect
                            ? { width: Math.max(1, Math.round(height * aspect)) }
                            : {}),
                        })
                      }
                    />
                  </div>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={options.size.lockAspect}
                        onChange={(event) => patchSize({ lockAspect: event.target.checked })}
                      />
                    }
                    label={t('lockAspectRatio')}
                  />
                </>
              )}
            </Section>
          </div>
          <div className="space-y-5 p-5">
            <Section title={t('naming')}>
              <FormControl size="small" fullWidth>
                <InputLabel>{t('pattern')}</InputLabel>
                <Select
                  label={t('pattern')}
                  value={options.naming.mode}
                  onChange={(event) => patchNaming({ mode: event.target.value as NamingMode })}
                >
                  <MenuItem value="originalSuffix">{t('originalSuffix')}</MenuItem>
                  <MenuItem value="prefixSequence">{t('prefixSequence')}</MenuItem>
                  <MenuItem value="template">{t('customTemplate')}</MenuItem>
                </Select>
              </FormControl>
              {options.naming.mode === 'originalSuffix' && (
                <TextField
                  size="small"
                  fullWidth
                  label={t('suffix')}
                  value={options.naming.suffix}
                  onChange={(event) => patchNaming({ suffix: event.target.value })}
                />
              )}
              {options.naming.mode === 'prefixSequence' && (
                <div className="grid grid-cols-[1fr_112px] gap-3">
                  <TextField
                    size="small"
                    label={t('prefix')}
                    value={options.naming.prefix}
                    onChange={(event) => patchNaming({ prefix: event.target.value })}
                  />
                  <NumberField
                    label={t('startsAt')}
                    value={options.naming.startNumber}
                    onChange={(startNumber) => patchNaming({ startNumber })}
                  />
                </div>
              )}
              {options.naming.mode === 'template' && (
                <TextField
                  size="small"
                  fullWidth
                  label={t('template')}
                  helperText={t('templateTokens')}
                  value={options.naming.template}
                  onChange={(event) => patchNaming({ template: event.target.value })}
                />
              )}
            </Section>
            <Section title={t('destination')}>
              <div className="flex gap-2">
                <TextField
                  size="small"
                  fullWidth
                  label={t('outputFolder')}
                  value={options.outputDirectory}
                  onChange={(event) => patch('outputDirectory', event.target.value)}
                />
                <Button variant="outlined" onClick={() => void chooseDirectory()}>
                  {t('choose')}
                </Button>
              </div>
              {isDocumentUri(options.outputDirectory) && (
                <p role="alert" className="mt-2 text-xs text-secondary">
                  {t('androidExportHint')}
                </p>
              )}
              {recent.length > 0 && (
                <div>
                  <div className="mb-1 text-[11px] text-secondary">{t('recentFolders')}</div>
                  <div className="flex flex-wrap gap-1">
                    {recent.map((directory) => (
                      <Button
                        key={directory}
                        size="small"
                        onClick={() => patch('outputDirectory', directory)}
                        sx={{ maxWidth: '100%', justifyContent: 'flex-start' }}
                      >
                        <span className="truncate">{directory}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <FormControl size="small" fullWidth>
                <InputLabel>{t('ifFileExists')}</InputLabel>
                <Select
                  label={t('ifFileExists')}
                  value={options.conflict}
                  onChange={(event) =>
                    patch('conflict', event.target.value as ExportOptions['conflict'])
                  }
                >
                  <MenuItem value="skip">{t('skip')}</MenuItem>
                  <MenuItem value="overwrite" disabled={isDocumentUri(options.outputDirectory)}>
                    {t('overwrite')}
                  </MenuItem>
                  <MenuItem value="rename">{t('renameAutomatically')}</MenuItem>
                </Select>
              </FormControl>
            </Section>
            <Section title={t('metadata')}>
              <FormControlLabel
                control={
                  <Switch
                    checked={options.preserveExif}
                    onChange={(event) => patch('preserveExif', event.target.checked)}
                  />
                }
                label={t('keepExif')}
              />
              <div className="-mt-2 text-[11px] leading-4 text-secondary">{t('metadataHint')}</div>
            </Section>
          </div>
        </div>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button
          variant="contained"
          disabled={
            !options.outputDirectory ||
            (isDocumentUri(options.outputDirectory) && options.conflict === 'overwrite') ||
            targetPhotos.length === 0
          }
          onClick={submit}
        >
          {t('exportCount', { count: targetPhotos.length })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function NumberField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <TextField
      size="small"
      type="number"
      label={label}
      value={value}
      onChange={(event) => onChange(Math.max(1, Number(event.target.value) || 1))}
      slotProps={{
        input: {
          endAdornment: suffix ? (
            <InputAdornment position="end">{suffix}</InputAdornment>
          ) : undefined,
          inputProps: { min: 1 },
        },
      }}
    />
  );
}
function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return recentFilesystemDirectories(value);
  } catch {
    return [];
  }
}
function estimateBytes(specs: RenderSpec[], options: ExportOptions) {
  return specs.reduce((sum, spec) => {
    let { width, height } = cropPixelRect(spec.source.width, spec.source.height, spec.crop);
    if (spec.border) {
      const edge = Math.max(width, height);
      const border =
        spec.border.unit === 'percent' ? (edge * spec.border.width) / 100 : spec.border.width;
      width += border * 2;
      height += border * (spec.border.style === 'polaroid' && spec.border.caption ? 4 : 2);
    }
    if (options.size.mode === 'longEdge') {
      const factor = (options.size.longEdge ?? Math.max(width, height)) / Math.max(width, height);
      width *= factor;
      height *= factor;
    }
    if (options.size.mode === 'percent') {
      const factor = (options.size.percent ?? 100) / 100;
      width *= factor;
      height *= factor;
    }
    if (options.size.mode === 'exact') {
      const targetWidth = options.size.width ?? width;
      const targetHeight = options.size.height ?? height;
      if (options.size.lockAspect) {
        const factor = Math.min(targetWidth / width, targetHeight / height);
        width *= factor;
        height *= factor;
      } else {
        width = targetWidth;
        height = targetHeight;
      }
    }
    const quality = options.quality / 100;
    const bytesPerPixel =
      options.format === 'png'
        ? 1.35
        : options.format === 'webp'
          ? 0.07 + 0.72 * quality * quality
          : 0.1 + 0.95 * quality * quality;
    return sum + width * height * bytesPerPixel;
  }, 0);
}
function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
