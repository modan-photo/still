import { Slider } from '@mui/material';
import { useProjectStore } from '../../../stores/projectStore';
import { ValueSlider } from './ValueSlider';

export function RadiusPanel() {
  const radius = useProjectStore((state) => state.collageDraft.radius);
  const update = useProjectStore((state) => state.updateCollageDraft);
  return <ValueSlider label="Corner radius" value={radius} suffix="px"><Slider value={radius} min={0} max={40} onChange={(_, value) => update({ radius: value as number })} aria-label="Collage corner radius" /></ValueSlider>;
}
