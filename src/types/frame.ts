export type FrameStyle = 'solid' | 'gradient' | 'shadow' | 'polaroid';

export interface FrameGradientStop {
  offset: number;
  color: string;
}

export interface FrameGradient {
  stops: FrameGradientStop[];
  angle: number;
}

export interface FrameShadow {
  spread: number;
  blur: number;
  offsetY: number;
  color: string;
}

export interface FrameParams {
  width: number;
  unit: 'px' | 'percent';
  color: string;
  radius: number;
  gradient?: FrameGradient;
  shadow?: FrameShadow;
}

export interface FramePreset {
  id: string;
  name: string;
  style: FrameStyle;
  params: FrameParams;
  builtin: boolean;
  createdAt: number;
}
