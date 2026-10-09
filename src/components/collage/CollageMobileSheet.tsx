import { Box, Button, Drawer, Typography, useTheme } from '@mui/material';
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { CollagePanelId } from '../../layout/MobileCollageToolbar';
import { AspectPanel } from './panels/AspectPanel';
import { BackgroundPanel } from './panels/BackgroundPanel';
import { GapPanel } from './panels/GapPanel';
import { EffectsPanel } from './panels/EffectsPanel';
import { LayoutPanel } from './panels/LayoutPanel';
import { PhotoPickerPanel } from './panels/PhotoPickerPanel';
import { RadiusPanel } from './panels/RadiusPanel';
import { useTranslation, type MessageKey } from '../../i18n/messages';

type CollageMobileSheetProps = {
  activePanel: CollagePanelId | null;
  onClose: () => void;
};

const TITLES: Record<CollagePanelId, MessageKey> = {
  layout: 'layout',
  gap: 'gap',
  radius: 'cornerRadius',
  background: 'background',
  effects: 'wholeCollageEffects',
  aspect: 'canvasRatio',
  photos: 'photos',
};

export function CollageMobileSheet({ activePanel, onClose }: CollageMobileSheetProps) {
  const t = useTranslation();
  const theme = useTheme();
  const dragStart = useRef<number | null>(null);
  const tall = activePanel === 'layout' || activePanel === 'photos';
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current !== null && event.clientY - dragStart.current > 48) onClose();
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <Drawer
      anchor="bottom"
      variant="temporary"
      open={activePanel !== null}
      onClose={onClose}
      ModalProps={{ keepMounted: true, disablePortal: true }}
      slotProps={{
        paper: {
          sx: {
            bottom: '64px',
            height: tall ? '60dvh' : '40dvh',
            maxHeight: tall ? '60dvh' : '40dvh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            borderTopLeftRadius: `${theme.still.radius.xl}px`,
            borderTopRightRadius: `${theme.still.radius.xl}px`,
            backgroundColor: theme.still.colors[theme.palette.mode].bg.surface,
            boxShadow: theme.still.shadow.panelUp,
            transitionDuration: `${theme.still.motion.duration.base}ms`,
          },
        },
        backdrop: {
          sx: {
            bottom: '64px',
            backgroundColor: `${theme.still.colors[theme.palette.mode].text.primary}33`,
          },
        },
      }}
    >
      <Box
        onPointerDown={startDrag}
        onPointerUp={finishDrag}
        onPointerCancel={() => {
          dragStart.current = null;
        }}
        sx={{
          display: 'grid',
          flex: '0 0 auto',
          placeItems: 'center',
          height: 28,
          touchAction: 'none',
          cursor: 'grab',
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 4,
            borderRadius: `${theme.still.radius.full}px`,
            backgroundColor: theme.still.colors[theme.palette.mode].border.subtle,
          }}
        />
      </Box>
      <Box
        sx={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column', overflow: 'hidden' }}
      >
        <Typography
          component="h2"
          sx={{
            px: `${theme.still.spacing.lg}px`,
            pb: `${theme.still.spacing.md}px`,
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {activePanel ? t(TITLES[activePanel]) : ''}
        </Typography>
        <Box
          sx={{
            minHeight: 0,
            flex: 1,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            px: `${theme.still.spacing.lg}px`,
            pb: `${theme.still.spacing.xl}px`,
          }}
        >
          {renderPanel(activePanel, onClose, t('done'))}
        </Box>
      </Box>
    </Drawer>
  );
}

function renderPanel(panel: CollagePanelId | null, onClose: () => void, done: string) {
  switch (panel) {
    case 'layout':
      return <LayoutPanel />;
    case 'gap':
      return <GapPanel />;
    case 'radius':
      return <RadiusPanel />;
    case 'background':
      return <BackgroundPanel />;
    case 'effects':
      return <EffectsPanel />;
    case 'aspect':
      return <AspectPanel />;
    case 'photos':
      return (
        <Box sx={(theme) => ({ display: 'grid', gap: `${theme.still.spacing.lg}px` })}>
          <PhotoPickerPanel expanded />
          <Button variant="contained" onClick={onClose}>
            {done}
          </Button>
        </Box>
      );
    default:
      return null;
  }
}
