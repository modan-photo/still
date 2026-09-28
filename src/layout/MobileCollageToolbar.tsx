import { Box, ButtonBase, useTheme } from '@mui/material';
import { Icon, type IconName } from '../components/Icons';

export type CollagePanelId = 'layout' | 'gap' | 'radius' | 'background' | 'aspect' | 'photos';

const ITEMS: ReadonlyArray<{ id: CollagePanelId; label: string; icon: IconName }> = [
  { id: 'layout', label: 'Layout', icon: 'grid' },
  { id: 'gap', label: 'Gap', icon: 'gap' },
  { id: 'radius', label: 'Radius', icon: 'radius' },
  { id: 'background', label: 'Background', icon: 'background' },
  { id: 'aspect', label: 'Ratio', icon: 'aspect' },
  { id: 'photos', label: 'Photos', icon: 'photos' },
];

type MobileCollageToolbarProps = {
  activePanel: CollagePanelId | null;
  onPanelChange: (panel: CollagePanelId | null) => void;
};

export function MobileCollageToolbar({ activePanel, onPanelChange }: MobileCollageToolbarProps) {
  const theme = useTheme();

  return (
    <Box
      component="nav"
      aria-label="Collage settings"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, minmax(54px, 1fr))',
        width: '100%',
        height: 64,
        flex: '0 0 64px',
        overflowX: 'auto',
        overscrollBehaviorX: 'contain',
        borderTop: '1px solid',
        borderColor: 'divider',
        backgroundColor: theme.still.colors[theme.palette.mode].bg.surface,
      }}
    >
      {ITEMS.map((item) => {
        const active = activePanel === item.id;
        return (
          <ButtonBase
            key={item.id}
            aria-label={`${item.label} settings`}
            aria-pressed={active}
            onClick={() => onPanelChange(active ? null : item.id)}
            sx={{
              display: 'flex',
              minWidth: 54,
              height: 64,
              flexDirection: 'column',
              gap: `${theme.still.spacing.xs}px`,
              color: active ? 'primary.main' : 'text.secondary',
              fontSize: 11,
              lineHeight: 1,
              transition: theme.transitions.create(['color', 'background-color'], {
                duration: theme.still.motion.duration.fast,
                easing: theme.still.motion.easing,
              }),
              '&:hover': { backgroundColor: theme.still.colors[theme.palette.mode].bg.elevated },
              '&.Mui-focusVisible': {
                outline: `2px solid ${theme.still.colors[theme.palette.mode].accent}`,
                outlineOffset: -2,
              },
            }}
          >
            <Icon name={item.icon} size={20} strokeWidth={1.5} />
            <Box component="span">{item.label}</Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
