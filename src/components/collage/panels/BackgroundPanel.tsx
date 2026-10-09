import { Box, ToggleButton, ToggleButtonGroup, useTheme } from '@mui/material';
import { useProjectStore } from '../../../stores/projectStore';
import { useTranslation } from '../../../i18n/messages';

export function BackgroundPanel() {
  const t = useTranslation();
  const theme = useTheme();
  const background = useProjectStore((state) => state.collageDraft.background);
  const update = useProjectStore((state) => state.updateCollageDraft);
  return (
    <Box sx={{ display: 'grid', gap: `${theme.still.spacing.md}px` }}>
      <ToggleButtonGroup
        aria-label={t('background')}
        exclusive
        fullWidth
        size="small"
        value={background.type}
        onChange={(_, type: 'color' | 'transparent' | null) =>
          type && update({ background: { ...background, type } })
        }
      >
        <ToggleButton value="color">{t('color')}</ToggleButton>
        <ToggleButton value="transparent">{t('transparent')}</ToggleButton>
      </ToggleButtonGroup>
      {background.type === 'color' && (
        <Box
          component="label"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: `${theme.still.spacing.sm}px`,
            color: 'text.secondary',
            fontSize: 12,
          }}
        >
          <Box
            component="input"
            type="color"
            aria-label={t('backgroundColor')}
            value={background.color}
            onChange={(event) =>
              update({ background: { type: 'color', color: event.target.value } })
            }
            sx={{
              width: 40,
              height: 32,
              padding: 0,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: `${theme.still.radius.sm}px`,
              backgroundColor: 'transparent',
              cursor: 'pointer',
            }}
          />
          <Box
            component="span"
            sx={{ color: 'text.primary', fontFamily: 'monospace', textTransform: 'uppercase' }}
          >
            {background.color}
          </Box>
        </Box>
      )}
    </Box>
  );
}
