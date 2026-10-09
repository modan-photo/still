import { Box, ButtonBase, useTheme } from '@mui/material';
import { useProjectStore, type CollageLayout } from '../../../stores/projectStore';
import { useTranslation, type MessageKey } from '../../../i18n/messages';

const LAYOUTS: Array<{ value: CollageLayout; label: MessageKey; columns: number; rows: number }> = [
  { value: '1x2', label: 'layoutTwoColumns', columns: 2, rows: 1 },
  { value: '1x3', label: 'layoutThreeColumns', columns: 3, rows: 1 },
  { value: '2x1', label: 'layoutTwoRows', columns: 1, rows: 2 },
  { value: '2x2', label: 'layoutTwoByTwo', columns: 2, rows: 2 },
  { value: '2x3', label: 'layoutTwoByThree', columns: 3, rows: 2 },
  { value: '3x3', label: 'layoutThreeByThree', columns: 3, rows: 3 },
  { value: 'v-strip', label: 'layoutVerticalStrip', columns: 1, rows: 3 },
  { value: 'h-strip', label: 'layoutHorizontalStrip', columns: 3, rows: 1 },
];

export function LayoutPanel() {
  const t = useTranslation();
  const theme = useTheme();
  const layout = useProjectStore((state) => state.collageDraft.layout);
  const update = useProjectStore((state) => state.updateCollageDraft);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: theme.still.spacing.sm,
      }}
    >
      {LAYOUTS.map((option) => {
        const selected = layout === option.value;
        return (
          <ButtonBase
            key={option.value}
            aria-label={t(option.label)}
            aria-pressed={selected}
            onClick={() => update({ layout: option.value })}
            sx={{
              display: 'grid',
              minWidth: 0,
              gap: `${theme.still.spacing.xs}px`,
              padding: `${theme.still.spacing.sm}px`,
              border: '1px solid',
              borderColor: selected ? 'primary.main' : 'divider',
              borderRadius: `${theme.still.radius.md}px`,
              color: selected ? 'primary.main' : 'text.secondary',
              backgroundColor: selected
                ? `${theme.still.colors[theme.palette.mode].accent}14`
                : 'transparent',
              transition: theme.transitions.create(['border-color', 'background-color', 'color'], {
                duration: theme.still.motion.duration.fast,
              }),
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: theme.still.colors[theme.palette.mode].bg.elevated,
              },
            }}
          >
            <MiniLayout columns={option.columns} rows={option.rows} />
            <Box component="span" sx={{ fontSize: 10, lineHeight: 1.2 }}>
              {option.value.replace('-', ' ')}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function MiniLayout({ columns, rows }: { columns: number; rows: number }) {
  return (
    <Box
      aria-hidden="true"
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: '2px',
        width: 32,
        height: 24,
        '& span': {
          border: '1px solid currentColor',
          borderRadius: `${theme.still.radius.sm / 2}px`,
        },
      })}
    >
      {Array.from({ length: columns * rows }, (_, index) => (
        <span key={index} />
      ))}
    </Box>
  );
}
