import { alpha, Box, Button } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useUndoStore } from '../stores/undoStore';
import { motionTokens } from '../theme/tokens';
import { useTranslation } from '../i18n/messages';

export function UndoToast() {
  const t = useTranslation();
  const notice = useUndoStore((state) => state.notice);
  const count = useUndoStore((state) => state.count);
  const undo = useUndoStore((state) => state.undo);
  const showFilmStrip = useProjectStore((state) => state.photos.length >= 2);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);
  const enterFrame = useRef<number | null>(null);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    if (enterFrame.current !== null) window.cancelAnimationFrame(enterFrame.current);
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);

    if (notice) {
      setRendered(true);
      enterFrame.current = window.requestAnimationFrame(() => {
        setVisible(true);
        enterFrame.current = null;
      });
      return;
    }

    setVisible(false);
    exitTimer.current = window.setTimeout(() => {
      setRendered(false);
      exitTimer.current = null;
    }, motionTokens.duration.fast);
  }, [notice]);

  useEffect(
    () => () => {
      if (enterFrame.current !== null) window.cancelAnimationFrame(enterFrame.current);
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  if (!rendered) return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={(theme) => {
        const colors = theme.still.colors[theme.palette.mode];

        return {
          position: 'fixed',
          zIndex: theme.zIndex.snackbar,
          left: '50%',
          bottom: showFilmStrip ? { xs: 88, md: 100, lg: 112 } : 24,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          minHeight: 44,
          padding: '6px 8px 6px 16px',
          border: '1px solid',
          borderColor: colors.border.subtle,
          borderRadius: `${theme.still.radius.lg}px`,
          backgroundColor: alpha(colors.bg.elevated, theme.still.glass.backgroundOpacity),
          backdropFilter: theme.still.glass.backdropFilter,
          WebkitBackdropFilter: theme.still.glass.backdropFilter,
          boxShadow: theme.still.shadow.elev3,
          color: colors.text.primary,
          fontSize: 13,
          whiteSpace: 'nowrap',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transform: `translate(-50%, ${visible ? 0 : 8}px)`,
          transitionProperty: 'transform, opacity, bottom',
          transitionDuration: `${visible ? theme.still.motion.duration.base : theme.still.motion.duration.fast}ms`,
          transitionTimingFunction: theme.still.motion.easing,
        };
      }}
    >
      <span>
        {notice === 'restored'
          ? t('restored')
          : t(count === 1 ? 'removedPhotoOne' : 'removedPhotos', { count })}
      </span>
      {notice === 'removed' && (
        <Button
          size="small"
          onClick={undo}
          sx={(theme) => ({
            minWidth: 44,
            color: theme.still.colors[theme.palette.mode].accent,
            borderRadius: `${theme.still.radius.md}px`,
          })}
        >
          {t('undo')}
        </Button>
      )}
    </Box>
  );
}
