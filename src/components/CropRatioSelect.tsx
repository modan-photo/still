import { MenuItem, Select } from '@mui/material';
import type { CropAspect } from '../types/renderSpec';

const ASPECT_OPTIONS: ReadonlyArray<{ value: CropAspect; label: string }> = [
  { value: 'original', label: 'Original' },
  { value: 'free', label: 'Free' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '2:3', label: '2:3' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
];

/** Ratio selection only; the caller owns crop geometry and edit sessions. */
export function CropRatioSelect({ value, labelledBy, onChange, onReselect }: {
  value: CropAspect;
  labelledBy: string;
  onChange: (aspect: CropAspect) => void;
  onReselect: () => void;
}) {
  return <Select<CropAspect> value={value} size="small" fullWidth
    labelId={labelledBy}
    onChange={event => onChange(event.target.value as CropAspect)}
    sx={theme => ({ borderRadius: `${theme.still.radius.md}px` })}>
    {ASPECT_OPTIONS.map(option => <MenuItem key={option.value} value={option.value}
      onClick={() => { if (option.value === value) onReselect(); }}>
      {option.label}
    </MenuItem>)}
  </Select>;
}
