import {
  alpha,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  SnackbarContent,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useUndoStore } from "../stores/undoStore";

type ExportCompletionNoticeProps = {
  exportedPhotoIds: string[];
  open: boolean;
  onClose: () => void;
};

/** Offers workspace removal after a successful export without touching source files. */
export function ExportCompletionNotice({ exportedPhotoIds, open, onClose }: ExportCompletionNoticeProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const theme = useTheme();
  const photos = useProjectStore((state) => state.photos);
  const removePhotos = useProjectStore((state) => state.removePhotos);
  const pushUndo = useUndoStore((state) => state.push);
  const availableIds = exportedPhotoIds.filter((id) => photos.some((photo) => photo.id === id));
  const exportedCount = exportedPhotoIds.length;

  const openConfirmation = () => {
    onClose();
    setConfirmOpen(true);
  };

  const closeConfirmation = () => setConfirmOpen(false);

  const confirmRemoval = () => {
    if (availableIds.length > 0) pushUndo(removePhotos(availableIds));
    setConfirmOpen(false);
  };

  return (
    <>
      <Snackbar
        open={open && exportedCount > 0}
        autoHideDuration={6_000}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={(_, reason) => {
          if (reason !== "clickaway") onClose();
        }}
        TransitionProps={{
          timeout: {
            enter: theme.still.motion.duration.base,
            exit: theme.still.motion.duration.fast,
          },
        }}
      >
        <SnackbarContent
          role="status"
          message={`Exported ${exportedCount} ${exportedCount === 1 ? "photo" : "photos"}`}
          action={(
            <Button size="small" onClick={openConfirmation}>
              Remove exported photos
            </Button>
          )}
          sx={(currentTheme) => {
            const colors = currentTheme.still.colors[currentTheme.palette.mode];

            return {
              minWidth: 0,
              color: colors.text.primary,
              backgroundColor: alpha(colors.bg.elevated, currentTheme.still.glass.backgroundOpacity),
              backgroundImage: "none",
              border: `1px solid ${colors.border.subtle}`,
              borderRadius: `${currentTheme.still.radius.lg}px`,
              boxShadow: currentTheme.still.shadow.elev3,
              backdropFilter: currentTheme.still.glass.backdropFilter,
              WebkitBackdropFilter: currentTheme.still.glass.backdropFilter,
              "& .MuiSnackbarContent-action": { marginRight: 0 },
            };
          }}
        />
      </Snackbar>

      <Dialog
        open={confirmOpen}
        onClose={closeConfirmation}
        aria-labelledby="remove-exported-photos-title"
        aria-describedby="remove-exported-photos-description"
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: (currentTheme) => ({
              borderRadius: `${currentTheme.still.radius.lg}px`,
              boxShadow: currentTheme.still.shadow.elev3,
            }),
          },
        }}
      >
        <DialogTitle id="remove-exported-photos-title">Remove exported photos?</DialogTitle>
        <DialogContent>
          <DialogContentText id="remove-exported-photos-description">
            This will remove {availableIds.length} {availableIds.length === 1 ? "photo" : "photos"} from the workspace. Original files will not be deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirmation}>Cancel</Button>
          <Button
            onClick={confirmRemoval}
            disabled={availableIds.length === 0}
            sx={(currentTheme) => ({
              color: currentTheme.still.colors[currentTheme.palette.mode].danger,
            })}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
