import { Box, Button, MenuItem, Slider, Stack, TextField, Typography } from '@mui/material';
import { useProjectStore } from '../../../stores/projectStore';
import { DEFAULT_BORDER, DEFAULT_WATERMARK, type BorderStyle } from '../../../types/renderSpec';

/** Effects are owned by the finished collage, never by its source cells. */
export function EffectsPanel() {
  const draft = useProjectStore((state) => state.collageDraft);
  const currentPhotoId = useProjectStore((state) => state.currentPhotoId);
  const current = useProjectStore((state) =>
    state.photos.find((photo) => photo.id === currentPhotoId),
  );
  const update = useProjectStore((state) => state.updateCollageDraft);
  const border = draft.border;
  const watermark = draft.watermark;

  return (
    <Stack spacing={2}>
      <Typography variant="caption">
        Applied once to the finished collage, after spacing and rounded corners.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          size="small"
          variant={border ? 'contained' : 'outlined'}
          onClick={() =>
            update({
              border: border ? undefined : structuredClone(current?.spec.border ?? DEFAULT_BORDER),
            })
          }
        >
          {border ? 'Remove border' : 'Add border'}
        </Button>
        <Button
          size="small"
          variant={watermark ? 'contained' : 'outlined'}
          onClick={() =>
            update({
              watermark: watermark
                ? undefined
                : structuredClone(current?.spec.watermark ?? DEFAULT_WATERMARK),
            })
          }
        >
          {watermark ? 'Remove watermark' : 'Add watermark'}
        </Button>
      </Box>
      {border && (
        <>
          <TextField
            select
            size="small"
            label="Border style"
            value={border.style}
            onChange={(event) =>
              update({ border: { ...border, style: event.target.value as BorderStyle } })
            }
          >
            {(['solid', 'gradient', 'polaroid', 'film'] as const).map((style) => (
              <MenuItem key={style} value={style}>
                {style}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="color"
            label="Border color"
            value={border.color.slice(0, 7)}
            onChange={(event) => update({ border: { ...border, color: event.target.value } })}
            InputLabelProps={{ shrink: true }}
          />
          <Typography variant="caption">
            Border width: {border.width}
            {border.unit === 'percent' ? '%' : ' px'}
          </Typography>
          <Slider
            aria-label="Border width"
            value={border.width}
            min={0}
            max={border.unit === 'percent' ? 20 : 200}
            onChange={(_, value) => update({ border: { ...border, width: value as number } })}
          />
        </>
      )}
      {watermark && (
        <>
          {watermark.type === 'text' && (
            <TextField
              size="small"
              label="Watermark text"
              value={watermark.content}
              onChange={(event) =>
                update({ watermark: { ...watermark, content: event.target.value } })
              }
            />
          )}
          {watermark.type === 'image' && (
            <Typography variant="caption" noWrap title={watermark.path}>
              Image: {watermark.path}
            </Typography>
          )}
          <Typography variant="caption">Opacity: {Math.round(watermark.opacity * 100)}%</Typography>
          <Slider
            aria-label="Watermark opacity"
            value={watermark.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(_, value) =>
              update({ watermark: { ...watermark, opacity: value as number } })
            }
          />
        </>
      )}
    </Stack>
  );
}
