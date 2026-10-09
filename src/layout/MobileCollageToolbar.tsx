import { Box, ButtonBase, useTheme } from '@mui/material';
import { Icon, type IconName } from '../components/Icons';
import { useTranslation, type MessageKey } from '../i18n/messages';

export type CollagePanelId =
  'layout' | 'gap' | 'radius' | 'background' | 'effects' | 'aspect' | 'photos';

const ITEMS: ReadonlyArray<{ id: CollagePanelId; label: MessageKey; icon: IconName }> = [
  { id: 'layout', label: 'layout', icon: 'grid' },
  { id: 'gap', label: 'gap', icon: 'gap' },
  { id: 'radius', label: 'radius', icon: 'radius' },
  { id: 'background', label: 'background', icon: 'background' },
  { id: 'effects', label: 'effects', icon: 'background' },
  { id: 'aspect', label: 'ratio', icon: 'aspect' },
  { id: 'photos', label: 'photos', icon: 'photos' },
];

type MobileCollageToolbarProps = {
  activePanel: CollagePanelId | null;
  onPanelChange: (panel: CollagePanelId | null) => void;
};

/** Compact navigator for the mobile collage settings sheet. */
export function MobileCollageToolbar({ activePanel, onPanelChange }: MobileCollageToolbarProps) {
  const t = useTranslation();
  const theme = useTheme();

  return (
    <Box
      component="nav"
      aria-label={t('collageSettings')}
      sx={{
        display: 'grid',
        // Equal columns fill wide screens; the minimum width allows horizontal
        // scrolling instead of shrinking touch targets on narrow devices.
        gridTemplateColumns: 'repeat(7, minmax(54px, 1fr))',
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
            aria-label={`${t(item.label)} · ${t('collageSettings')}`}
            aria-pressed={active}
            // Tapping the active tool toggles its sheet closed.
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
            <Box component="span">{t(item.label)}</Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
