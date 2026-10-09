import { Slider } from '@mui/material';
import { useProjectStore } from '../../../stores/projectStore';
import { ValueSlider } from './ValueSlider';
import { useTranslation } from '../../../i18n/messages';

export function RadiusPanel() {
  const t = useTranslation();
  const radius = useProjectStore((state) => state.collageDraft.radius);
  const update = useProjectStore((state) => state.updateCollageDraft);
  return (
    <ValueSlider label={t('cornerRadius')} value={radius} suffix="px">
      <Slider
        value={radius}
        min={0}
        max={40}
        onChange={(_, value) => update({ radius: value as number })}
        aria-label={t('collageRadius')}
      />
    </ValueSlider>
  );
}
