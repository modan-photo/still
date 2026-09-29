import type { FramePreset } from '../types/frame';

/** Application defaults are immutable and never written to user preset storage. */
export const BUILTIN_FRAME_PRESETS = [
  {
    id: 'builtin-solid',
    name: 'White Border',
    style: 'solid',
    params: {
      width: 40,
      unit: 'px',
      color: '#FFFFFF',
      radius: 0,
    },
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-minimal-black',
    name: 'Minimal Black Frame',
    style: 'solid',
    params: {
      width: 24,
      unit: 'px',
      color: '#000000',
      radius: 0,
    },
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-rounded-white-card',
    name: 'Rounded White Card',
    style: 'solid',
    params: {
      width: 60,
      unit: 'px',
      color: '#FFFFFF',
      radius: 24,
    },
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-gradient',
    name: 'Gradient Border',
    style: 'gradient',
    params: {
      width: 48,
      unit: 'px',
      color: '#667EEA',
      radius: 16,
      gradient: {
        stops: [
          { offset: 0, color: '#3B82F6' },
          { offset: 1, color: '#8B5CF6' },
        ],
        angle: 135,
      },
    },
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-shadow',
    name: 'Floating Shadow',
    style: 'shadow',
    params: {
      width: 0,
      unit: 'px',
      color: '#FFFFFF',
      radius: 16,
      shadow: {
        spread: 0,
        blur: 40,
        offsetY: 12,
        color: '#0000004D',
      },
    },
    builtin: true,
    createdAt: 0,
  },
] as const satisfies readonly FramePreset[];

export const DEFAULT_FRAME_PRESET_ID = 'builtin-solid';
