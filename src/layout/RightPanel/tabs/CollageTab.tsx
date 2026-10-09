import { Box, Button } from '@mui/material';
import { CollageExportButton } from '../../../components/collage/CollageExportButton';
import { AspectPanel } from '../../../components/collage/panels/AspectPanel';
import { BackgroundPanel } from '../../../components/collage/panels/BackgroundPanel';
import { GapPanel } from '../../../components/collage/panels/GapPanel';
import { EffectsPanel } from '../../../components/collage/panels/EffectsPanel';
import { LayoutPanel } from '../../../components/collage/panels/LayoutPanel';
import { PhotoPickerPanel } from '../../../components/collage/panels/PhotoPickerPanel';
import { RadiusPanel } from '../../../components/collage/panels/RadiusPanel';
import { PanelSection } from '../../../components/PanelSection';
import { useProjectStore } from '../../../stores/projectStore';
import { useTranslation } from '../../../i18n/messages';

/** Desktop collage settings panel with a scrollable body and fixed actions. */
export function CollageTab() {
  const t = useTranslation();
  const reset = useProjectStore((state) => state.resetCollageDraft);

  return (
    <Box sx={{ display: 'flex', minHeight: '100%', flexDirection: 'column' }}>
      <Box sx={{ flex: 1 }}>
        <PanelSection title={t('photos')}>
          <PhotoPickerPanel />
        </PanelSection>
        <PanelSection title={t('layout')}>
          <LayoutPanel />
        </PanelSection>
        <PanelSection title={t('gap')}>
          <GapPanel />
          <RadiusPanel />
        </PanelSection>
        <PanelSection title={t('background')}>
          <BackgroundPanel />
        </PanelSection>
        <PanelSection title={t('wholeCollageEffects')}>
          <EffectsPanel />
        </PanelSection>
        <PanelSection title={t('canvasRatio')}>
          <AspectPanel />
        </PanelSection>
      </Box>
      {/* Keep export/reset reachable when the settings list exceeds panel height. */}
      <Box
        sx={(theme) => ({
          position: 'sticky',
          bottom: 0,
          zIndex: 2,
          display: 'grid',
          gap: `${theme.still.spacing.sm}px`,
          padding: `${theme.still.spacing.md}px ${theme.still.spacing.lg}px`,
          borderTop: '1px solid',
          borderColor: 'divider',
          backgroundColor: theme.still.colors[theme.palette.mode].bg.surface,
        })}
      >
        <CollageExportButton />
        <Button size="small" onClick={reset}>
          {t('resetSettings')}
        </Button>
      </Box>
    </Box>
  );
}
