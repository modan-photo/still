import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Snackbar,
  SnackbarContent,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Icon } from '../../../components/Icons';
import { CropRatioSelect } from '../../../components/CropRatioSelect';
import { useRenderSpec } from '../../../hooks/useRenderSpec';
import { useCropEdit } from '../../../hooks/useCropEdit';
import { useTranslation, type MessageKey } from '../../../i18n/messages';
import { useProjectStore } from '../../../stores/projectStore';
import { useUIStore } from '../../../stores/uiStore';
import { motionTokens } from '../../../theme/tokens';
import { cropForAspect } from '../../../render/crop';
import { rotatedDimensions, transformBatchDisabledReason } from '../../../render/rotation';
import {
  DEFAULT_CROP,
  DEFAULT_ROTATION,
  type CropAspect,
  type RotationSpec,
} from '../../../types/renderSpec';

const ROTATION_ACTIONS = [
  { id: 'left', label: 'rotateLeft', icon: 'rotate-left' },
  { id: 'right', label: 'rotateRight', icon: 'rotate-right' },
  { id: 'half', label: 'rotateHalf' },
  { id: 'horizontal', label: 'flipHorizontal', icon: 'flip-horizontal' },
  { id: 'vertical', label: 'flipVertical', icon: 'flip-vertical' },
] as const;

const DISABLED_REASON_KEYS: Record<string, MessageKey> = {
  'Free aspect ratios cannot be applied to all photos': 'freeAspectBatchUnsupported',
  'No transforms to apply': 'noTransformsToApply',
  'Only one photo': 'onlyOnePhoto',
};

/** Current-photo transforms and batch controls share the normalized crop contract. */
export function TransformTab() {
  const t = useTranslation();
  const { spec } = useRenderSpec();
  const photoId = useProjectStore((state) => state.currentPhotoId);
  const activeTab = useUIStore((state) => state.activeRightTab);
  const edit = useCropEdit();
  const photos = useProjectStore((state) => state.photos);
  const applyTransformToAll = useProjectStore((state) => state.applyTransformToAll);
  const [notice, setNotice] = useState<{ message: string; key: number } | null>(null);
  const [batch, setBatch] = useState<{
    sourceId: string;
    aspect: CropAspect;
    rotation: RotationSpec;
  } | null>(null);
  const [includeRotation, setIncludeRotation] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const crop = spec?.crop ?? DEFAULT_CROP;
  const rotation = spec?.rotation ?? DEFAULT_ROTATION;
  const position =
    edit.session?.photoId === photoId ? (edit.session.draft?.rect ?? crop.rect) : crop.rect;
  const disabledReason = transformBatchDisabledReason(crop, rotation, photos.length);
  const disabledHint = disabledReason
    ? DISABLED_REASON_KEYS[disabledReason]
      ? t(DISABLED_REASON_KEYS[disabledReason])
      : disabledReason
    : '';
  const targetCount = batch ? photos.length : 0;
  useEffect(() => {
    // A modal must not confirm a different ratio/photo after an external selection change.
    if (
      confirmOpen &&
      batch &&
      (activeTab !== 'transform' ||
        photoId !== batch.sourceId ||
        crop.aspect !== batch.aspect ||
        rotation.angle !== batch.rotation.angle ||
        rotation.flipH !== batch.rotation.flipH ||
        rotation.flipV !== batch.rotation.flipV ||
        Boolean(disabledReason))
    )
      setConfirmOpen(false);
  }, [
    activeTab,
    batch,
    confirmOpen,
    crop.aspect,
    disabledReason,
    photoId,
    rotation.angle,
    rotation.flipH,
    rotation.flipV,
  ]);

  if (!spec)
    return (
      <Typography
        component="p"
        sx={(theme) => ({
          margin: 0,
          fontSize: 12,
          lineHeight: 1.7,
          color: theme.still.colors[theme.palette.mode].text.secondary,
        })}
      >
        {t('transformStart')}
      </Typography>
    );

  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        gap: `${theme.still.spacing.lg}px`,
        color: theme.still.colors[theme.palette.mode].text.primary,
      })}
    >
      <Box component="section" aria-labelledby="transform-rotation-label">
        <SectionLabel id="transform-rotation-label">{t('rotation')}</SectionLabel>
        <Box
          role="group"
          aria-labelledby="transform-rotation-label"
          sx={(theme) => ({
            display: 'flex',
            flexWrap: 'wrap',
            gap: `${theme.still.spacing.sm}px`,
          })}
        >
          {ROTATION_ACTIONS.map((action) => {
            const flip = action.id === 'horizontal' || action.id === 'vertical';
            const selected =
              action.id === 'horizontal'
                ? rotation.flipH
                : action.id === 'vertical'
                  ? rotation.flipV
                  : false;
            return (
              <Tooltip key={action.id} title={t(action.label)} arrow>
                <Box component="span" sx={{ display: 'inline-flex' }}>
                  <IconButton
                    aria-label={t(action.label)}
                    aria-pressed={flip ? selected : undefined}
                    onClick={() => {
                      if (photoId) edit.transform(photoId, action.id);
                    }}
                    sx={(theme) => {
                      const colors = theme.still.colors[theme.palette.mode];
                      return {
                        width: { xs: 48, md: 40 },
                        height: { xs: 48, md: 40 },
                        flexShrink: 0,
                        borderRadius: `${theme.still.radius.md}px`,
                        backgroundColor: colors.bg.elevated,
                        border: `1px solid ${selected ? colors.accent : colors.border.subtle}`,
                        color: selected ? colors.accent : colors.text.secondary,
                        touchAction: 'manipulation',
                        transition: theme.transitions.create(
                          ['background-color', 'color', 'border-color'],
                          {
                            duration: theme.still.motion.duration.fast,
                            easing: theme.still.motion.easing,
                          },
                        ),
                        '&:hover': {
                          backgroundColor: colors.bg.base,
                          color: selected ? colors.accent : colors.text.primary,
                        },
                        '&.Mui-focusVisible': {
                          outline: `2px solid ${colors.accent}`,
                          outlineOffset: 2,
                        },
                      };
                    }}
                  >
                    {'icon' in action ? (
                      <Icon name={action.icon} size={18} />
                    ) : (
                      <Typography component="span" sx={{ fontSize: 11, fontWeight: 600 }}>
                        180°
                      </Typography>
                    )}
                  </IconButton>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </Box>
      <Divider />
      <Box
        component="section"
        aria-labelledby="crop-aspect-label"
        sx={{
          '& .MuiInputBase-root': { minHeight: { xs: 48, md: 40 } },
        }}
      >
        <SectionLabel id="crop-aspect-label">{t('aspectRatio')}</SectionLabel>
        <CropRatioSelect
          value={crop.enabled ? crop.aspect : 'original'}
          labelledBy="crop-aspect-label"
          onChange={(aspect) => {
            // Clicking the selected option must not clear the ratio or dirty the photo.
            const size = rotatedDimensions(spec.source.width, spec.source.height, rotation);
            if (aspect && photoId)
              edit.apply(photoId, cropForAspect(aspect, size.width, size.height, crop));
          }}
          onReselect={() => {
            if (photoId && edit.session?.dismissed) edit.reopen(photoId);
          }}
        />
      </Box>
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Button
          variant="outlined"
          fullWidth
          disabled={!crop.enabled}
          startIcon={<Icon name="crop" size={16} />}
          onClick={() => useUIStore.getState().setInspectorOpen(false)}
          sx={{ minHeight: 48, touchAction: 'manipulation' }}
        >
          {t('adjustOnCanvas')}
        </Button>
        <Typography
          component="p"
          sx={(theme) => ({
            mb: 0,
            fontSize: 12,
            lineHeight: 1.7,
            color: theme.still.colors[theme.palette.mode].text.secondary,
          })}
        >
          {t('adjustCropHint')}
        </Typography>
      </Box>
      <Divider />
      <Box component="section" aria-labelledby="crop-position-label">
        <SectionLabel id="crop-position-label">{t('positionReadOnly')}</SectionLabel>
        <Box
          component="dl"
          sx={(theme) => ({
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: `${theme.still.spacing.sm}px`,
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
          })}
        >
          {(
            [
              ['X', position.x],
              ['Y', position.y],
              ['W', position.width],
              ['H', position.height],
            ] as const
          ).map(([label, value]) => (
            <Box key={label} sx={{ display: 'flex', gap: 1 }}>
              <Box
                component="dt"
                sx={(theme) => ({ color: theme.still.colors[theme.palette.mode].text.secondary })}
              >
                {label}:
              </Box>
              <Box component="dd" sx={{ margin: 0 }}>
                {(value * 100).toFixed(1)}%
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
      <Divider />
      <Button
        startIcon={<Icon name="reset" size={16} />}
        sx={{ alignSelf: 'flex-start', minHeight: { xs: 48, md: 44 }, touchAction: 'manipulation' }}
        onClick={() => {
          if (!photoId) return;
          edit.resetTransform(photoId);
          setNotice({ message: t('transformReset'), key: Date.now() });
        }}
      >
        {t('reset')}
      </Button>
      <Divider />
      <Tooltip title={disabledHint} arrow>
        <Box component="span" sx={{ display: 'block', width: '100%' }}>
          <Button
            disabled={Boolean(disabledReason)}
            variant="outlined"
            fullWidth
            sx={{ minHeight: { xs: 48, md: 44 }, touchAction: 'manipulation' }}
            onClick={() => {
              if (photoId) {
                setBatch({ sourceId: photoId, aspect: crop.aspect, rotation: { ...rotation } });
                setIncludeRotation(false);
                setConfirmOpen(true);
              }
            }}
          >
            {t('frameApplyAll')}
          </Button>
        </Box>
      </Tooltip>
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="transform-batch-title"
        aria-describedby="transform-batch-description"
        slotProps={{
          paper: {
            sx: (theme) => ({
              borderRadius: `${theme.still.radius.lg}px`,
              margin: { xs: `${theme.still.spacing.lg}px`, md: `${theme.still.spacing.xxl}px` },
              width: {
                xs: `calc(100% - ${theme.still.spacing.lg * 2}px)`,
                md: `calc(100% - ${theme.still.spacing.xxl * 2}px)`,
              },
              '& .MuiDialogActions-root .MuiButton-root': {
                minHeight: { xs: 48, md: 36 },
                touchAction: 'manipulation',
              },
            }),
          },
        }}
      >
        <DialogTitle id="transform-batch-title">{t('transformBatchTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText id="transform-batch-description" component="div">
            <Typography component="p" sx={{ mt: 0 }}>
              {t('currentAspectRatio', {
                aspect:
                  batch?.aspect === 'original'
                    ? t('original')
                    : batch?.aspect === 'free'
                      ? t('cropFree')
                      : (batch?.aspect ?? ''),
              })}
            </Typography>
            <FormControlLabel
              sx={{ minHeight: { xs: 48, md: 42 } }}
              control={
                <Checkbox
                  checked={includeRotation}
                  onChange={(_, checked) => setIncludeRotation(checked)}
                />
              }
              label={t('includeRotation')}
            />
            <Typography component="p">
              {t(targetCount === 1 ? 'transformBatchCountOne' : 'transformBatchCount', {
                count: targetCount,
              })}
            </Typography>
            <Typography component="p">{t('transformBatchOverwrite')}</Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t('cancel')}</Button>
          <Button
            variant="contained"
            disabled={targetCount < 2 || Boolean(disabledReason)}
            onClick={() => {
              if (!batch) return;
              const count = applyTransformToAll(
                batch.sourceId,
                batch.aspect,
                includeRotation,
                batch.rotation,
              );
              setConfirmOpen(false);
              if (count > 0) {
                edit.reopen(batch.sourceId);
                setNotice({
                  message: t(count === 1 ? 'transformBatchAppliedOne' : 'transformBatchApplied', {
                    count,
                  }),
                  key: Date.now(),
                });
              }
            }}
          >
            {t('apply')}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        key={notice?.key}
        open={notice !== null}
        autoHideDuration={motionTokens.duration.slow * 8}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setNotice(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <SnackbarContent
          message={notice?.message}
          sx={(theme) => ({
            backgroundColor: theme.still.colors[theme.palette.mode].bg.elevated,
            color: theme.still.colors[theme.palette.mode].text.primary,
            borderRadius: `${theme.still.radius.md}px`,
            border: `1px solid ${theme.still.colors[theme.palette.mode].border.subtle}`,
          })}
        />
      </Snackbar>
    </Box>
  );
}

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Typography
      id={id}
      component="h3"
      sx={(theme) => ({
        margin: 0,
        marginBottom: `${theme.still.spacing.sm}px`,
        fontSize: 12,
        fontWeight: 600,
        color: theme.still.colors[theme.palette.mode].text.secondary,
      })}
    >
      {children}
    </Typography>
  );
}
