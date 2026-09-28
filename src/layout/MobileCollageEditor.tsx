import { Box, Button, IconButton, Typography, useTheme } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { CollageMobileSheet } from '../components/collage/CollageMobileSheet';
import { CollagePreview } from '../components/collage/CollagePreview';
import { Icon } from '../components/Icons';
import { useProjectStore } from '../stores/projectStore';
import { MobileCollageToolbar, type CollagePanelId } from './MobileCollageToolbar';

type MobileCollageEditorProps = {
  onExit: () => void;
};

export function MobileCollageEditor({ onExit }: MobileCollageEditorProps) {
  const theme = useTheme();
  const reset = useProjectStore((state) => state.resetCollageDraft);
  const photoCount = useProjectStore((state) => state.collageDraft.photoIds.length);
  const [activePanel, setActivePanel] = useState<CollagePanelId | null>(null);

  const closeSheet = useCallback(() => {
    if (activePanel !== null && window.history.state?.stillCollageSheet) {
      window.history.back();
    } else {
      setActivePanel(null);
    }
  }, [activePanel]);

  const changePanel = useCallback((panel: CollagePanelId | null) => {
    if (panel === null) {
      closeSheet();
      return;
    }
    if (activePanel === null) window.history.pushState({ ...window.history.state, stillCollageSheet: true }, '');
    setActivePanel(panel);
  }, [activePanel, closeSheet]);

  useEffect(() => {
    const handlePopState = () => setActivePanel(null);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const exit = () => {
    if (activePanel !== null && window.history.state?.stillCollageSheet) window.history.back();
    onExit();
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        minWidth: 0,
        minHeight: 0,
        flexDirection: 'column',
        overflow: 'hidden',
        overscrollBehavior: 'none',
        backgroundColor: theme.still.colors[theme.palette.mode].bg.base,
      }}
    >
      <Box
        component="header"
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(88px, 1fr) auto minmax(88px, 1fr)',
          alignItems: 'center',
          height: 52,
          flex: '0 0 52px',
          px: `${theme.still.spacing.sm}px`,
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: theme.still.colors[theme.palette.mode].bg.surface,
        }}
      >
        <IconButton aria-label="Back to editor" onClick={exit} sx={{ justifySelf: 'start' }}>
          <Box component="span" sx={{ display: 'grid', transform: 'rotate(90deg)' }}><Icon name="chevron" size={20} /></Box>
        </IconButton>
        <Typography component="h1" sx={{ m: 0, fontSize: 15, fontWeight: 600 }}>Collage</Typography>
        <Box sx={{ display: 'flex', justifySelf: 'end', gap: `${theme.still.spacing.xs}px` }}>
          <Button size="small" onClick={reset}>Reset</Button>
          <Button size="small" variant="contained" disabled={photoCount < 2} onClick={() => window.dispatchEvent(new CustomEvent('still:request-collage-export'))}>Export</Button>
        </Box>
      </Box>

      <Box component="main" sx={{ minWidth: 0, minHeight: 0, flex: 1, overflow: 'hidden', p: `${theme.still.spacing.sm}px` }}>
        <CollagePreview />
      </Box>

      <Box sx={{ position: 'relative', zIndex: theme.zIndex.modal + 1 }}>
        <MobileCollageToolbar activePanel={activePanel} onPanelChange={changePanel} />
      </Box>
      <CollageMobileSheet activePanel={activePanel} onClose={closeSheet} />
    </Box>
  );
}
