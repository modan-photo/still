import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useProjectStore, type CollageAspect } from '../../../stores/projectStore';
import { useTranslation } from '../../../i18n/messages';

const ASPECTS: CollageAspect[] = ['1:1', '4:3', '16:9', '9:16', 'auto'];
export function AspectPanel() {
  const t = useTranslation();
  const aspect = useProjectStore((state) => state.collageDraft.aspect);
  const update = useProjectStore((state) => state.updateCollageDraft);
  return (
    <ToggleButtonGroup
      exclusive
      fullWidth
      size="small"
      value={aspect}
      onChange={(_, value: CollageAspect | null) => value && update({ aspect: value })}
      aria-label={t('canvasRatio')}
    >
      {ASPECTS.map((value) => (
        <ToggleButton key={value} value={value} sx={{ minWidth: 0, px: 0.5 }}>
          {value === 'auto' ? t('auto') : value}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
