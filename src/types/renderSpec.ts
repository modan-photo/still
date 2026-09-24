/** Wire contract: src-tauri/src/render/spec.rs. Change both before adding parameters. */
export interface RenderSpec {
  version: 1;
  source: SourceSpec;
  border?: BorderSpec;
  watermark?: WatermarkSpec;
  adjustments?: AdjustmentsSpec;
  output?: OutputSpec;
}
export interface SourceSpec { path: string; width: number; height: number }
export type BorderStyle = 'solid' | 'gradient' | 'polaroid' | 'film';
export type BorderUnit = 'px' | 'percent';
export interface BorderSpec {
  style: BorderStyle;
  width: number;
  unit: BorderUnit;
  color: string;
  radius: number;
  colors: string[];
  angle: number;
  caption: boolean;
}

export const DEFAULT_BORDER: BorderSpec = {
  style: 'solid',
  width: 24,
  unit: 'px',
  color: '#FFFFFF',
  radius: 0,
  colors: ['#FFFFFF', '#D8E7DE'],
  angle: 0,
  caption: true,
};
export type Anchor = 'topLeft' | 'topCenter' | 'topRight' | 'centerLeft' | 'center' | 'centerRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight';
export type WatermarkType = 'text' | 'image';
export interface WatermarkSpec {
  type: WatermarkType;
  content: string;
  path?: string;
  position: Anchor;
  offsetX: number;
  offsetY: number;
  opacity: number;
  rotation: number;
  scale: number;
  font?: FontSpec;
}
export interface FontSpec { family: string; size: number; weight: number; italic: boolean; color: string }
export interface AdjustmentsSpec { exposure: number; contrast: number; saturation: number }
export type OutputFormat = 'jpeg' | 'png' | 'webp';
export interface OutputSpec { format: OutputFormat; quality: number }
