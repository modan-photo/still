import { Slider } from '@mui/material';
import { useProjectStore } from '../../../stores/projectStore';
import { ValueSlider } from './ValueSlider';

export function GapPanel() {
  const gap = useProjectStore((state) => state.collageDraft.gap);
  const update = useProjectStore((state) => state.updateCollageDraft);
  return <ValueSlider label="Gap" value={gap} suffix="px"><Slider value={gap} min={0} max={100} onChange={(_, value) => update({ gap: value as number })} aria-label="Collage gap" /></ValueSlider>;
}
