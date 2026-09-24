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
export type BorderStyle = 'solid' | 'gradient' | 'shadow' | 'polaroid' | 'film';
export interface BorderSpec { style: BorderStyle; width: number; color: string; radius: number }
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
