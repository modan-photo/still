import type { FramePreset } from '../types/frame';

/**
 * Built-in presets are immutable application defaults. Persist only their ids,
 * never these objects, in user-owned preset storage.
 */
export const BUILTIN_FRAME_PRESETS = [
  {
    id: 'builtin-solid',
    name: '内置 · 纯白边',
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
    name: '内置 · 极简黑框',
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
    name: '内置 · 圆角白卡',
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
    name: '内置 · 渐变边',
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
    name: '内置 · 悬浮投影',
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

