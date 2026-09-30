import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, Snackbar, SnackbarContent, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Icon } from '../../../components/Icons';
import { useRenderSpec } from '../../../hooks/useRenderSpec';
import { useCropEdit } from '../../../hooks/useCropEdit';
import { useProjectStore } from '../../../stores/projectStore';
import { useUIStore } from '../../../stores/uiStore';
import { motionTokens } from '../../../theme/tokens';
import { cropForAspect } from '../../../render/crop';
import { DEFAULT_CROP, type CropAspect } from '../../../types/renderSpec';

const ASPECT_OPTIONS: ReadonlyArray<{ value: CropAspect; label: string }> = [
  { value: 'original', label: 'Original' },
  { value: 'free', label: 'Free' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '2:3', label: '2:3' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
];

/** Current-photo editing and ratio-only batch application share the normalized crop contract. */
export function CropTab() {
  const { spec } = useRenderSpec();
  const photoId = useProjectStore(state => state.selectedId);
  const activeTab = useUIStore(state => state.activeRightTab);
  const edit = useCropEdit();
  const photos = useProjectStore(state => state.photos);
  const applyCropToAll = useProjectStore(state => state.applyCropToAll);
  const [notice, setNotice] = useState<{ message: string; key: number } | null>(null);
  const [batch, setBatch] = useState<{ sourceId: string; aspect: CropAspect } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const crop = spec?.crop ?? DEFAULT_CROP;
  const position = edit.session?.photoId === photoId ? edit.session.draft?.rect ?? crop.rect : crop.rect;
  const disabledReason = crop.aspect === 'free' ? 'Free aspect ratios cannot be applied to all photos'
    : photos.length <= 1 ? 'Only one photo'
    : !crop.enabled || crop.aspect === 'original' ? 'Select a crop aspect ratio first' : '';
  const targetCount = batch ? photos.filter(photo => photo.id !== batch.sourceId).length : 0;
  useEffect(() => {
    // A modal must not confirm a different ratio/photo after an external selection change.
    if (confirmOpen && batch && (activeTab !== 'crop' || photoId !== batch.sourceId || crop.aspect !== batch.aspect || !crop.enabled)) setConfirmOpen(false);
  }, [activeTab, batch, confirmOpen, crop.aspect, crop.enabled, photoId]);

  if (!spec) return <Typography component="p" sx={(theme) => ({
    margin: 0, fontSize: 12, lineHeight: 1.7,
    color: theme.still.colors[theme.palette.mode].text.secondary,
  })}>Import photos to get started</Typography>;

  return <Box sx={(theme) => ({
    display: 'flex', flexDirection: 'column', gap: `${theme.still.spacing.lg}px`,
    color: theme.still.colors[theme.palette.mode].text.primary,
  })}>
    <Box component="section" aria-labelledby="crop-aspect-label">
      <SectionLabel id="crop-aspect-label">Aspect ratio</SectionLabel>
      <ToggleButtonGroup exclusive value={crop.enabled ? crop.aspect : 'original'}
        aria-labelledby="crop-aspect-label" size="small"
        onChange={(_, aspect: CropAspect | null) => {
          // Clicking the selected option must not clear the ratio or dirty the photo.
          if (aspect && photoId) edit.apply(photoId, cropForAspect(aspect, spec.source.width, spec.source.height, crop));
          else if (photoId && edit.session?.dismissed) edit.reopen(photoId);
        }}
        sx={(theme) => ({ display: 'flex', flexWrap: 'wrap', gap: `${theme.still.spacing.xs}px` })}>
        {ASPECT_OPTIONS.map((option) => <ToggleButton key={option.value} value={option.value}
          sx={(theme) => {
            const colors = theme.still.colors[theme.palette.mode];
            return {
              flex: {
                xs: `0 0 calc((100% - ${theme.still.spacing.xs * 3}px) / 4)`,
                md: `0 0 calc((100% - ${theme.still.spacing.xs * 4}px) / 5)`,
              },
              minWidth: 0, minHeight: 44, padding: `${theme.still.spacing.xs}px`,
              touchAction: 'manipulation',
              flexDirection: 'column', gap: `${theme.still.spacing.xs}px`, fontSize: 11,
              transition: theme.transitions.create(['background-color', 'color'], {
                duration: theme.still.motion.duration.fast, easing: theme.still.motion.easing,
              }),
              '&.MuiToggleButtonGroup-grouped': {
                margin: 0, border: `1px solid ${colors.border.subtle}`,
                borderRadius: `${theme.still.radius.sm}px`,
              },
              '&.Mui-selected, &.Mui-selected:hover': {
                backgroundColor: colors.accent, color: theme.still.colors.light.bg.surface,
                borderColor: colors.accent,
              },
            };
          }}>
          <Icon name="single" size={16} />
          {option.label}
        </ToggleButton>)}
      </ToggleButtonGroup>
    </Box>
    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
      <Button variant="outlined" fullWidth disabled={!crop.enabled}
        startIcon={<Icon name="crop" size={16} />}
        onClick={() => useUIStore.getState().setInspectorOpen(false)}
        sx={{ minHeight: 44, touchAction: 'manipulation' }}>Adjust on canvas</Button>
      <Typography component="p" sx={theme => ({
        mb: 0, fontSize: 12, lineHeight: 1.7,
        color: theme.still.colors[theme.palette.mode].text.secondary,
      })}>Close the panel, then drag the crop frame or handles to adjust its position and size.</Typography>
    </Box>
    <Divider />
    <Box component="section" aria-labelledby="crop-position-label">
      <SectionLabel id="crop-position-label">Position (read-only)</SectionLabel>
      <Box component="dl" sx={(theme) => ({
        margin: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: `${theme.still.spacing.sm}px`, fontSize: 12, fontVariantNumeric: 'tabular-nums',
      })}>
        {([['X', position.x], ['Y', position.y], ['W', position.width], ['H', position.height]] as const)
          .map(([label, value]) => <Box key={label} sx={{ display: 'flex', gap: 1 }}>
            <Box component="dt" sx={(theme) => ({ color: theme.still.colors[theme.palette.mode].text.secondary })}>{label}:</Box>
            <Box component="dd" sx={{ margin: 0 }}>{(value * 100).toFixed(1)}%</Box>
          </Box>)}
      </Box>
    </Box>
    <Divider />
    <Button startIcon={<Icon name="reset" size={16} />} sx={{ alignSelf: 'flex-start', minHeight: 44, touchAction: 'manipulation' }} onClick={() => {
      if (!photoId) return;
      edit.apply(photoId, structuredClone(DEFAULT_CROP));
      setNotice({ message: 'Crop reset', key: Date.now() });
    }}>Reset crop</Button>
    <Divider />
    <Tooltip title={disabledReason} arrow>
      <Box component="span" sx={{ display: 'block', width: '100%' }}>
        <Button disabled={Boolean(disabledReason)} variant="outlined" fullWidth sx={{ minHeight: 44, touchAction: 'manipulation' }} onClick={() => {
          if (photoId) { setBatch({ sourceId: photoId, aspect: crop.aspect }); setConfirmOpen(true); }
        }}>Apply to all photos</Button>
      </Box>
    </Tooltip>
    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="xs"
      aria-labelledby="crop-batch-title" aria-describedby="crop-batch-description"
      slotProps={{ paper: { sx: theme => ({ borderRadius: `${theme.still.radius.lg}px` }) } }}>
      <DialogTitle id="crop-batch-title">Apply to all photos?</DialogTitle>
      <DialogContent>
        <DialogContentText id="crop-batch-description" component="div">
          <Typography component="p" sx={{ mt: 0 }}>Current aspect ratio: {batch?.aspect}</Typography>
          <Typography component="p">This will apply to {targetCount} other {targetCount === 1 ? 'photo' : 'photos'} (excluding the current photo).</Typography>
          <Typography component="p">Existing crops on other photos will be overwritten.</Typography>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
        <Button variant="contained" disabled={targetCount < 1 || Boolean(disabledReason)} onClick={() => {
          if (!batch) return;
          const count = applyCropToAll(batch.sourceId, batch.aspect);
          setConfirmOpen(false);
          if (count > 0) setNotice({ message: `Applied to ${count} ${count === 1 ? 'photo' : 'photos'}`, key: Date.now() });
        }}>Apply</Button>
      </DialogActions>
    </Dialog>
    <Snackbar key={notice?.key} open={notice !== null} autoHideDuration={motionTokens.duration.slow * 8}
      onClose={(_, reason) => { if (reason !== 'clickaway') setNotice(null); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <SnackbarContent message={notice?.message} sx={theme => ({
        backgroundColor: theme.still.colors[theme.palette.mode].bg.elevated,
        color: theme.still.colors[theme.palette.mode].text.primary,
        borderRadius: `${theme.still.radius.md}px`,
        border: `1px solid ${theme.still.colors[theme.palette.mode].border.subtle}`,
      })} />
    </Snackbar>
  </Box>;
}

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return <Typography id={id} component="h3" sx={(theme) => ({
    margin: 0, marginBottom: `${theme.still.spacing.sm}px`, fontSize: 12, fontWeight: 600,
    color: theme.still.colors[theme.palette.mode].text.secondary,
  })}>{children}</Typography>;
}
