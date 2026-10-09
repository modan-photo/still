import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/messages';
import type { FramePreset, FrameStyle } from '../types/frame';
import { FrameMiniPreview } from './FrameMiniPreview';

type PreviewPreset = Pick<FramePreset, 'style' | 'params'>;

interface SaveFramePresetDialogProps {
  open: boolean;
  preset: PreviewPreset;
  existingNames: readonly string[];
  previewSource: string;
  originalWidth: number;
  originalHeight: number;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export function SaveFramePresetDialog({
  open,
  preset,
  existingNames,
  previewSource,
  originalWidth,
  originalHeight,
  onClose,
  onSave,
}: SaveFramePresetDialogProps) {
  const t = useTranslation();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(suggestFramePresetName(existingNames));
    setSaving(false);
    setError('');
  }, [existingNames, open]);

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave(trimmedName);
      onClose();
    } catch {
      setError(t('presetSaveFailed'));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      aria-labelledby="save-frame-preset-title"
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: (theme) => ({
            borderRadius: `${theme.still.radius.lg}px`,
            backgroundColor: theme.still.colors[theme.palette.mode].bg.elevated,
            boxShadow: theme.still.shadow.elev3,
          }),
        },
      }}
    >
      <DialogTitle id="save-frame-preset-title">{t('saveAsPreset')}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t('presetName')}
          value={name}
          error={Boolean(error)}
          helperText={error || ' '}
          disabled={saving}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          sx={{ mt: 1 }}
        />
        <Box
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            gap: `${theme.still.spacing.md}px`,
            minHeight: 64,
            padding: `${theme.still.spacing.sm}px ${theme.still.spacing.md}px`,
            border: '1px solid',
            borderColor: theme.still.colors[theme.palette.mode].border.subtle,
            borderRadius: `${theme.still.radius.md}px`,
            backgroundColor: theme.still.colors[theme.palette.mode].bg.surface,
          })}
        >
          <FrameMiniPreview
            src={previewSource}
            preset={preset}
            originalWidth={originalWidth}
            originalHeight={originalHeight}
            label={t('presetPreview')}
          />
          <div className="min-w-0">
            <div className="text-xs text-secondary">{t('basedOn')}</div>
            <div className="truncate text-sm text-primary">
              {t(frameStyleLabelKey(preset.style))}
            </div>
          </div>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button variant="contained" disabled={!name.trim() || saving} onClick={() => void submit()}>
          {saving ? t('saving') : t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function makeUniqueFramePresetName(name: string, existingNames: readonly string[]): string {
  const base = name.trim();
  const names = new Set(existingNames.map((entry) => entry.trim().toLocaleLowerCase()));
  if (!names.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} (${suffix})`.toLocaleLowerCase())) suffix += 1;
  return `${base} (${suffix})`;
}

function suggestFramePresetName(existingNames: readonly string[]): string {
  const names = new Set(existingNames.map((entry) => entry.trim().toLocaleLowerCase()));
  let number = 1;
  while (names.has(`my preset ${number}`)) number += 1;
  return `My Preset ${number}`;
}

function frameStyleLabelKey(
  style: FrameStyle,
): 'styleSolid' | 'styleGradient' | 'styleShadow' | 'stylePolaroid' {
  switch (style) {
    case 'solid':
      return 'styleSolid';
    case 'gradient':
      return 'styleGradient';
    case 'shadow':
      return 'styleShadow';
    case 'polaroid':
      return 'stylePolaroid';
  }
}
