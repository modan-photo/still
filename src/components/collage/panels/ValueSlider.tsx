import { Box } from '@mui/material';
import type { ReactNode } from 'react';

export function ValueSlider({ label, value, suffix, children }: { label: string; value: number; suffix?: string; children: ReactNode }) {
  return <Box><Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'text.secondary', fontSize: 12 }}><span>{label}</span><Box component="output" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{value}{suffix}</Box></Box>{children}</Box>;
}
