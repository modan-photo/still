import { Box, IconButton, Tooltip } from '@mui/material';
import type { ExifData } from '../../types/exif';
import { Icon } from '../Icons';
import { useTranslation } from '../../i18n/messages';

type ExifSummaryProps = {
  data: ExifData;
  onCopy: () => void;
};

export function ExifSummary({ data, onCopy }: ExifSummaryProps) {
  const t = useTranslation();
  const summary = [
    data.camera.model,
    data.camera.lens,
    [
      data.exposure.focalLength,
      data.exposure.aperture,
      data.exposure.shutterSpeed,
      data.exposure.iso === null ? null : `ISO${data.exposure.iso}`,
    ]
      .filter(Boolean)
      .join(' ') || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box
      sx={(theme) => ({
        position: 'sticky',
        zIndex: 2,
        top: 0,
        display: 'flex',
        alignItems: 'center',
        minHeight: 44,
        gap: 1,
        px: 2,
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
      })}
    >
      <Box
        title={summary || t('exifNoCameraDetails')}
        sx={{
          minWidth: 0,
          flex: 1,
          overflow: 'hidden',
          color: summary ? 'text.primary' : 'text.secondary',
          fontSize: 12,
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {summary || t('exifNoCameraDetails')}
      </Box>
      <Tooltip title={t('exifCopyAll')}>
        <IconButton
          aria-label={t('exifCopyAll')}
          size="small"
          onClick={onCopy}
          sx={{ flex: 'none' }}
        >
          <Icon name="copy" size={15} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
