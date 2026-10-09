import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Skeleton,
  Snackbar,
  SnackbarContent,
  TextField,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { invalidateExifCache, useExif } from '../../hooks/useExif';
import { trackExifSave } from '../../services/exifSaveCoordinator';
import { writeExif, writeExifBatch } from '../../services/tauri/exif';
import { normalizeError } from '../../services/tauri/image';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { motionTokens } from '../../theme/tokens';
import type { ExifData, ExifEdits, LocationInfo } from '../../types/exif';
import { Icon } from '../Icons';
import { ExifGroup } from './ExifGroup';
import { ExifEditableRow } from './ExifEditableRow';
import { ExifRow } from './ExifRow';
import { ExifSummary } from './ExifSummary';
import { translate, useTranslation, type MessageKey } from '../../i18n/messages';

type Notice = { message: string; error?: boolean; persistent?: boolean } | null;

export function ExifPanel() {
  const t = useTranslation();
  const currentPhotoId = useProjectStore((state) => state.currentPhotoId);
  const currentPath = useProjectStore(
    (state) => state.photos.find((photo) => photo.id === state.currentPhotoId)?.path ?? null,
  );
  const activeRightTab = useUIStore((state) => state.activeRightTab);
  const photos = useProjectStore((state) => state.photos);
  const selectedIds = useProjectStore((state) => state.selectedIds);
  const batchItems = useMemo(
    () =>
      photos
        .filter((photo) => selectedIds.includes(photo.id))
        .map((photo) => ({ id: photo.id, path: photo.path })),
    [photos, selectedIds],
  );
  const { data, loading, error, retry, update } = useExif(currentPhotoId);
  const [notice, setNotice] = useState<Notice>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchFields, setBatchFields] = useState({
    artist: { apply: false, value: '' },
    copyright: { apply: false, value: '' },
    keywords: { apply: false, value: '' },
  });

  const copy = useCallback(
    async (text: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setNotice({ message: successMessage });
      } catch {
        setNotice({ message: t('clipboardFailed'), error: true });
      }
    },
    [t],
  );

  const copyAll = useCallback(() => {
    if (data) void copy(formatExifText(data, useUIStore.getState().language), t('exifCopied'));
  }, [copy, data, t]);

  const saveField = useCallback(
    async (field: 'artist' | 'copyright' | 'keywords', value: string) => {
      if (!currentPhotoId || !currentPath) return;
      const edits: ExifEdits = { [field]: value };
      try {
        const result = await writeExif(currentPath, edits);
        update({ [field]: value || null });
        setNotice(
          result.backupCleanupPath
            ? {
                message: t('exifBackupWarning', { path: result.backupCleanupPath }),
                persistent: true,
              }
            : { message: t('exifSaved') },
        );
      } catch (reason) {
        const failure = normalizeError(reason);
        setNotice({
          message: exifSaveErrorMessage(failure.code, failure.message),
          error: true,
          persistent: failure.code === 'exif_recovery_required',
        });
        throw failure;
      }
    },
    [currentPath, currentPhotoId, update, t],
  );

  const saveBatch = async () => {
    const edits: ExifEdits = {};
    for (const field of ['artist', 'copyright', 'keywords'] as const) {
      if (batchFields[field].apply) edits[field] = batchFields[field].value;
    }
    if (Object.keys(edits).length === 0) return;
    setBatchSaving(true);
    try {
      const result = await trackExifSave(writeExifBatch(batchItems, edits));
      invalidateExifCache(photos.map((photo) => photo.id));
      if (currentPhotoId) retry();
      setBatchOpen(false);
      setNotice(
        result.backupCleanupPaths.length
          ? {
              message: t('exifBatchBackupWarning', {
                count: result.sourceCount,
                paths: result.backupCleanupPaths.join(', '),
              }),
              persistent: true,
            }
          : { message: t('exifBatchSaved', { count: result.sourceCount }) },
      );
    } catch (reason) {
      const failure = normalizeError(reason);
      if (failure.code === 'exif_batch_recovery_required') {
        invalidateExifCache(photos.map((photo) => photo.id));
        if (currentPhotoId) retry();
      }
      setNotice({
        message: exifSaveErrorMessage(failure.code, failure.message),
        error: true,
        persistent:
          failure.code === 'exif_batch_recovery_required' ||
          failure.code === 'exif_recovery_required',
      });
    } finally {
      setBatchSaving(false);
    }
  };

  useEffect(() => {
    if (activeRightTab !== 'exif' || !data) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'c')
        return;
      event.preventDefault();
      copyAll();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRightTab, copyAll, data]);

  if (loading)
    return (
      <Box sx={{ px: 2 }}>
        <ExifSkeleton />
      </Box>
    );
  if (error)
    return (
      <Box sx={{ px: 2 }}>
        <ExifError onRetry={retry} />
      </Box>
    );
  if (!data) return null;

  const empty = !hasExif(data);

  return (
    <Box>
      <ExifSummary data={data} onCopy={copyAll} />
      <Box sx={{ px: 2 }}>
        {batchItems.length > 1 && (
          <Button
            size="small"
            variant="outlined"
            sx={{ mt: 1 }}
            disabled={batchItems.length > 100}
            onClick={() => setBatchOpen(true)}
          >
            {t('editSelectedExif', { count: batchItems.length })}
          </Button>
        )}
        {batchItems.length > 100 && (
          <Box sx={{ fontSize: 11, color: 'text.secondary' }}>{t('exifBatchLimit')}</Box>
        )}
        {empty && (
          <Box sx={{ py: 2, color: 'text.secondary', fontSize: 12, textAlign: 'center' }}>
            {t('exifEmpty')}
          </Box>
        )}

        <ExifGroup title={t('exifCapture')}>
          <ExifRow label={t('exifMake')} value={data.camera.make} />
          <ExifRow label={t('exifCamera')} value={data.camera.model} />
          <ExifRow label={t('exifLens')} value={data.camera.lens} />
          <ExifRow label={t('exifSerial')} value={data.camera.serial} />
          <ExifRow label={t('exifFocalLength')} value={data.exposure.focalLength} />
          <ExifRow label={t('exifAperture')} value={data.exposure.aperture} />
          <ExifRow label={t('exifShutter')} value={data.exposure.shutterSpeed} />
          <ExifRow label={t('exifIso')} value={data.exposure.iso} />
          <ExifRow label={t('exifExposure')} value={data.exposure.exposureBias} />
        </ExifGroup>

        <ExifGroup title={t('exifTime')}>
          <ExifRow label={t('exifCaptured')} value={data.time.datetimeOriginal} />
          <ExifRow label={t('exifModified')} value={data.time.datetimeModified} />
        </ExifGroup>

        <ExifGroup title={t('exifImage')}>
          <ExifRow label={t('exifDimensions')} value={dimensions(data)} />
          <ExifRow label={t('exifOrientation')} value={data.image.orientation} />
          <ExifRow label={t('exifColorSpace')} value={data.image.colorSpace} />
          <ExifRow label={t('exifDpi')} value={data.image.dpi} />
        </ExifGroup>

        {hasCompleteLocation(data.location) && (
          <LocationGroup location={data.location} onCopy={copy} onNotice={setNotice} />
        )}

        <ExifGroup title={t('exifOther')}>
          <ExifRow label={t('exifSoftware')} value={data.other.software} />
          <ExifEditableRow
            key={`${currentPhotoId ?? 'none'}-artist`}
            label={t('exifArtist')}
            value={data.other.artist}
            onSave={(value) => saveField('artist', value)}
          />
          <ExifEditableRow
            key={`${currentPhotoId ?? 'none'}-copyright`}
            label={t('exifCopyright')}
            value={data.other.copyright}
            onSave={(value) => saveField('copyright', value)}
          />
          <ExifEditableRow
            key={`${currentPhotoId ?? 'none'}-keywords`}
            label={t('exifKeywords')}
            value={data.other.keywords}
            onSave={(value) => saveField('keywords', value)}
          />
        </ExifGroup>
      </Box>
      <Dialog
        open={batchOpen}
        onClose={batchSaving ? undefined : () => setBatchOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="batch-exif-title"
      >
        <DialogTitle id="batch-exif-title">{t('exifEditSources')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
            {t('exifBatchHint', {
              count: batchItems.length,
              sources: new Set(batchItems.map((item) => item.path)).size,
            })}
          </Box>
          {(['artist', 'copyright', 'keywords'] as const).map((field) => (
            <Box key={field} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    disabled={batchSaving}
                    checked={batchFields[field].apply}
                    onChange={(event) =>
                      setBatchFields((current) => ({
                        ...current,
                        [field]: { ...current[field], apply: event.target.checked },
                      }))
                    }
                  />
                }
                label={t('exifChangeField', {
                  field: t(
                    field === 'artist'
                      ? 'exifArtist'
                      : field === 'copyright'
                        ? 'exifCopyright'
                        : 'exifKeywords',
                  ),
                })}
                sx={{ minWidth: 150 }}
              />
              <TextField
                size="small"
                fullWidth
                label={t(
                  field === 'artist'
                    ? 'exifArtist'
                    : field === 'copyright'
                      ? 'exifCopyright'
                      : 'exifKeywords',
                )}
                disabled={batchSaving || !batchFields[field].apply}
                value={batchFields[field].value}
                onChange={(event) =>
                  setBatchFields((current) => ({
                    ...current,
                    [field]: { ...current[field], value: event.target.value },
                  }))
                }
              />
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button disabled={batchSaving} onClick={() => setBatchOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={batchSaving || !Object.values(batchFields).some((field) => field.apply)}
            onClick={() => void saveBatch()}
          >
            {batchSaving ? t('saving') : t('saveSourceFiles')}
          </Button>
        </DialogActions>
      </Dialog>
      <ExifNotice notice={notice} onClose={() => setNotice(null)} />
    </Box>
  );
}

function exifSaveErrorMessage(code: string, fallback: string): string {
  const language = useUIStore.getState().language;
  if (code === 'file_busy') return translate(language, 'exifFileBusy');
  if (code === 'file_read_only') return translate(language, 'exifFileReadOnly');
  return fallback || translate(language, 'exifSaveFailed');
}

function LocationGroup({
  location,
  onCopy,
  onNotice,
}: {
  location: LocationInfo;
  onCopy: (text: string, message: string) => Promise<void>;
  onNotice: (notice: Notice) => void;
}) {
  const t = useTranslation();
  const latitude = coordinate(location.latitude, 'N', 'S');
  const longitude = coordinate(location.longitude, 'E', 'W');
  const complete = location.latitude !== null && location.longitude !== null;

  const openMap = async () => {
    if (!complete) return;
    const url = `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}`;
    try {
      await openUrl(url);
    } catch {
      onNotice({ message: t('exifMapFailed'), error: true });
    }
  };

  return (
    <ExifGroup title={t('exifLocation')}>
      <ExifRow
        label={t('exifLatitude')}
        value={
          latitude && (
            <CoordinateButton onClick={() => void onCopy(latitude, t('exifLatitudeCopied'))}>
              {latitude}
            </CoordinateButton>
          )
        }
      />
      <ExifRow
        label={t('exifLongitude')}
        value={
          longitude && (
            <CoordinateButton onClick={() => void onCopy(longitude, t('exifLongitudeCopied'))}>
              {longitude}
            </CoordinateButton>
          )
        }
      />
      <ExifRow
        label={t('exifAltitude')}
        value={location.altitude === null ? null : `${formatNumber(location.altitude)} m`}
      />
      {complete && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, pt: 0.5 }}>
          <Button
            size="small"
            onClick={() =>
              void onCopy(`${location.latitude}, ${location.longitude}`, t('exifCoordinatesCopied'))
            }
            sx={{ minWidth: 0, px: 1, fontSize: 11 }}
          >
            {t('exifCopyCoordinates')}
          </Button>
          <Button
            size="small"
            onClick={() => void openMap()}
            sx={{ minWidth: 0, px: 1, fontSize: 11 }}
          >
            {t('exifOpenMap')}
          </Button>
        </Box>
      )}
    </ExifGroup>
  );
}

function CoordinateButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={(theme) => ({
        m: 0,
        p: 0,
        borderRadius: `${theme.still.radius.sm}px`,
        color: 'inherit',
        textAlign: 'left',
        textDecoration: 'underline',
        textDecorationColor: 'transparent',
        textUnderlineOffset: 2,
        transition: `color ${theme.still.motion.duration.fast}ms ${theme.still.motion.easing}, text-decoration-color ${theme.still.motion.duration.fast}ms ${theme.still.motion.easing}`,
        '&:hover': { color: 'primary.main', textDecorationColor: 'currentColor' },
      })}
    >
      {children}
    </Box>
  );
}

function ExifNotice({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const t = useTranslation();
  return (
    <Snackbar
      open={Boolean(notice)}
      autoHideDuration={notice?.persistent ? null : motionTokens.duration.slow * 5}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      onClose={(_, reason) => reason !== 'clickaway' && onClose()}
    >
      <SnackbarContent
        role={notice?.error ? 'alert' : 'status'}
        message={notice?.message ?? ''}
        action={
          notice?.persistent ? (
            <Button size="small" onClick={onClose}>
              {t('close')}
            </Button>
          ) : undefined
        }
        sx={(theme) => {
          const colors = theme.still.colors[theme.palette.mode];
          return {
            minWidth: 0,
            color: notice?.error ? colors.danger : colors.text.primary,
            backgroundColor: alpha(colors.bg.elevated, theme.still.glass.backgroundOpacity),
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: `${theme.still.radius.md}px`,
            boxShadow: theme.still.shadow.elev2,
            backdropFilter: theme.still.glass.backdropFilter,
            fontSize: 12,
          };
        }}
      />
    </Snackbar>
  );
}

function ExifSkeleton() {
  const t = useTranslation();
  return (
    <Box aria-label={t('exifLoading')} sx={{ pt: 1 }}>
      {[72, 94, 82, 88].map((width, index) => (
        <Box
          key={width}
          sx={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 1.5, py: 0.75 }}
        >
          <Skeleton animation={false} width={`${60 + index * 5}%`} sx={{ justifySelf: 'end' }} />
          <Skeleton animation={false} width={`${width}%`} />
        </Box>
      ))}
    </Box>
  );
}

function ExifError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslation();
  return (
    <Box
      role="alert"
      sx={(theme) => ({
        display: 'grid',
        justifyItems: 'center',
        gap: 1,
        mt: 2,
        p: 2,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: `${theme.still.radius.md}px`,
        color: 'text.secondary',
        textAlign: 'center',
      })}
    >
      <Icon name="info" size={20} />
      <Box sx={{ fontSize: 12 }}>{t('exifReadFailed')}</Box>
      <Button size="small" onClick={onRetry}>
        {t('retry')}
      </Button>
    </Box>
  );
}

function dimensions(data: ExifData): string | null {
  return data.image.width !== null && data.image.height !== null
    ? `${data.image.width} × ${data.image.height}`
    : null;
}

function hasCompleteLocation(location: LocationInfo | null): location is LocationInfo {
  return (
    location?.latitude !== null && location?.latitude !== undefined && location.longitude !== null
  );
}

function coordinate(value: number | null, positive: string, negative: string): string | null {
  if (value === null) return null;
  return `${Math.abs(value).toFixed(4)}° ${value < 0 ? negative : positive}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function hasExif(data: ExifData): boolean {
  return [
    ...Object.values(data.camera),
    ...Object.values(data.exposure),
    ...Object.values(data.time),
    ...Object.values(data.image),
    ...Object.values(data.other),
    ...(data.location ? Object.values(data.location) : []),
  ].some((value) => value !== null);
}

export function formatExifText(data: ExifData, language: 'en' | 'zh' = 'en'): string {
  const sections: Array<[MessageKey, Array<[MessageKey, string | number | null]>]> = [
    [
      'exifCapture',
      [
        ['exifMake', data.camera.make],
        ['exifCamera', data.camera.model],
        ['exifLens', data.camera.lens],
        ['exifSerial', data.camera.serial],
        ['exifFocalLength', data.exposure.focalLength],
        ['exifAperture', data.exposure.aperture],
        ['exifShutter', data.exposure.shutterSpeed],
        ['exifIso', data.exposure.iso],
        ['exifExposure', data.exposure.exposureBias],
      ],
    ],
    [
      'exifTime',
      [
        ['exifCaptured', data.time.datetimeOriginal],
        ['exifModified', data.time.datetimeModified],
      ],
    ],
    [
      'exifImage',
      [
        ['exifDimensions', dimensions(data)],
        ['exifOrientation', data.image.orientation],
        ['exifColorSpace', data.image.colorSpace],
        ['exifDpi', data.image.dpi],
      ],
    ],
  ];
  if (hasCompleteLocation(data.location))
    sections.push([
      'exifLocation',
      [
        ['exifLatitude', coordinate(data.location.latitude, 'N', 'S')],
        ['exifLongitude', coordinate(data.location.longitude, 'E', 'W')],
        [
          'exifAltitude',
          data.location.altitude === null ? null : `${formatNumber(data.location.altitude)} m`,
        ],
      ],
    ]);
  sections.push([
    'exifOther',
    [
      ['exifSoftware', data.other.software],
      ['exifArtist', data.other.artist],
      ['exifCopyright', data.other.copyright],
      ['exifKeywords', data.other.keywords],
    ],
  ]);
  return sections
    .map(([title, rows]) =>
      [
        translate(language, title),
        ...rows.map(([label, value]) => `${translate(language, label)}: ${value ?? '—'}`),
      ].join('\n'),
    )
    .join('\n\n');
}
