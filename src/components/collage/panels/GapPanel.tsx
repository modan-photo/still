import { Slider } from '@mui/material';
import { useProjectStore } from '../../../stores/projectStore';
import { ValueSlider } from './ValueSlider';
import { useTranslation } from '../../../i18n/messages';

export function GapPanel() {
  const t = useTranslation();
  const gap = useProjectStore((state) => state.collageDraft.gap);
  const update = useProjectStore((state) => state.updateCollageDraft);
  return (
    <ValueSlider label={t('gap')} value={gap} suffix="px">
      <Slider
        value={gap}
        min={0}
        max={100}
        onChange={(_, value) => update({ gap: value as number })}
        aria-label={t('collageGap')}
      />
    </ValueSlider>
  );
}
