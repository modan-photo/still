import { Box, Button } from '@mui/material';
import { CollageExportButton } from '../../../components/collage/CollageExportButton';
import { AspectPanel } from '../../../components/collage/panels/AspectPanel';
import { BackgroundPanel } from '../../../components/collage/panels/BackgroundPanel';
import { GapPanel } from '../../../components/collage/panels/GapPanel';
import { LayoutPanel } from '../../../components/collage/panels/LayoutPanel';
import { PhotoPickerPanel } from '../../../components/collage/panels/PhotoPickerPanel';
import { RadiusPanel } from '../../../components/collage/panels/RadiusPanel';
import { PanelSection } from '../../../components/PanelSection';
import { useProjectStore } from '../../../stores/projectStore';

export function CollageTab() {
  const reset = useProjectStore((state) => state.resetCollageDraft);

  return <Box sx={{ display: 'flex', minHeight: '100%', flexDirection: 'column' }}>
    <Box sx={{ flex: 1 }}>
      <PanelSection title="Photos"><PhotoPickerPanel /></PanelSection>
      <PanelSection title="Layout"><LayoutPanel /></PanelSection>
      <PanelSection title="Spacing"><GapPanel /><RadiusPanel /></PanelSection>
      <PanelSection title="Background"><BackgroundPanel /></PanelSection>
      <PanelSection title="Canvas ratio"><AspectPanel /></PanelSection>
    </Box>
    <Box sx={(theme) => ({ position: 'sticky', bottom: 0, zIndex: 2, display: 'grid', gap: `${theme.still.spacing.sm}px`, padding: `${theme.still.spacing.md}px ${theme.still.spacing.lg}px`, borderTop: '1px solid', borderColor: 'divider', backgroundColor: theme.still.colors[theme.palette.mode].bg.surface })}>
      <CollageExportButton />
      <Button size="small" onClick={reset}>Reset settings</Button>
    </Box>
  </Box>;
}
