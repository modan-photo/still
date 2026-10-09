import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Menu,
  MenuItem,
  TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/messages';
import type { FramePreset } from '../types/frame';
import type { FramePresetActionPosition } from './FramePresetSelect';

export interface FramePresetActionTarget {
  preset: FramePreset;
  position: FramePresetActionPosition;
}

interface FramePresetActionsProps {
  target: FramePresetActionTarget | null;
  onCloseMenu: () => void;
  onRename: (preset: FramePreset, name: string) => Promise<void>;
  onDuplicate: (preset: FramePreset) => Promise<void>;
  onDelete: (preset: FramePreset) => Promise<void>;
  onToggleDefault: (preset: FramePreset) => void;
  defaultPresetId: string | null;
  onError: (message: string) => void;
}

export function FramePresetActions({
  target,
  onCloseMenu,
  onRename,
  onDuplicate,
  onDelete,
  onToggleDefault,
  defaultPresetId,
  onError,
}: FramePresetActionsProps) {
  const t = useTranslation();
  const [renamePreset, setRenamePreset] = useState<FramePreset | null>(null);
  const [deletePreset, setDeletePreset] = useState<FramePreset | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  useEffect(() => {
    if (!renamePreset) return;
    setRenameDraft(renamePreset.name);
    setDialogError('');
  }, [renamePreset]);

  const beginRename = () => {
    if (!target) return;
    setRenamePreset(target.preset);
    onCloseMenu();
  };
  const duplicate = () => {
    if (!target) return;
    const preset = target.preset;
    onCloseMenu();
    void onDuplicate(preset).catch(() => onError(t('presetDuplicateFailed')));
  };
  const beginDelete = () => {
    if (!target) return;
    setDeletePreset(target.preset);
    setDialogError('');
    onCloseMenu();
  };
  const rename = async () => {
    const name = renameDraft.trim();
    if (!renamePreset || !name || busy) return;
    setBusy(true);
    setDialogError('');
    try {
      await onRename(renamePreset, name);
      setRenamePreset(null);
    } catch {
      setDialogError(t('presetRenameFailed'));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deletePreset || busy) return;
    setBusy(true);
    setDialogError('');
    try {
      await onDelete(deletePreset);
      setDeletePreset(null);
    } catch {
      setDialogError(t('presetDeleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const dialogPaper = {
    sx: (theme: import('@mui/material/styles').Theme) => ({
      borderRadius: `${theme.still.radius.lg}px`,
      backgroundColor: theme.still.colors[theme.palette.mode].bg.elevated,
      boxShadow: theme.still.shadow.elev3,
    }),
  };

  return (
    <>
      <Menu
        open={Boolean(target)}
        onClose={onCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={target?.position}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: dialogPaper }}
      >
        <MenuItem
          onClick={() => {
            if (target) onToggleDefault(target.preset);
            onCloseMenu();
          }}
        >
          {target?.preset.id === defaultPresetId ? t('clearDefault') : t('setAsDefault')}
        </MenuItem>
        <MenuItem onClick={beginRename}>{t('rename')}</MenuItem>
        <MenuItem onClick={duplicate}>{t('duplicate')}</MenuItem>
        <MenuItem
          onClick={beginDelete}
          sx={(theme) => ({ color: theme.still.colors[theme.palette.mode].danger })}
        >
          {t('delete')}
        </MenuItem>
      </Menu>

      <Dialog
        open={Boolean(renamePreset)}
        onClose={busy ? undefined : () => setRenamePreset(null)}
        aria-labelledby="rename-frame-preset-title"
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: dialogPaper }}
      >
        <DialogTitle id="rename-frame-preset-title">{t('renamePreset')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={t('presetName')}
            value={renameDraft}
            disabled={busy}
            error={Boolean(dialogError)}
            helperText={dialogError || ' '}
            onChange={(event) => {
              setRenameDraft(event.target.value);
              if (dialogError) setDialogError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void rename();
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setRenamePreset(null)}>
            {t('cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={!renameDraft.trim() || busy}
            onClick={() => void rename()}
          >
            {busy ? t('saving') : t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(deletePreset)}
        onClose={busy ? undefined : () => setDeletePreset(null)}
        aria-labelledby="delete-frame-preset-title"
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: dialogPaper }}
      >
        <DialogTitle id="delete-frame-preset-title">{t('deletePreset')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('deletePresetHint', { name: deletePreset?.name ?? '' })}
          </DialogContentText>
          {dialogError && (
            <div className="mt-2 text-xs text-danger" role="alert">
              {dialogError}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDeletePreset(null)}>
            {t('cancel')}
          </Button>
          <Button color="error" variant="contained" disabled={busy} onClick={() => void remove()}>
            {busy ? t('deleting') : t('delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
