export type CollageMode = 'grid' | 'strip' | 'free';
export type FitMode = 'contain' | 'cover';
export type StripDirection = 'vertical' | 'horizontal';
export interface CollageTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  fit: FitMode;
}
export interface CollageCell {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}
export interface CollageItem {
  id: string;
  path: string;
  transform: CollageTransform;
  cell: CollageCell;
}
export type CollageBackground =
  | { type: 'solid' }
  | { type: 'color'; color: string }
  | { type: 'linearGradient'; colors: string[]; angle: number }
  | { type: 'image'; path: string; mode: 'tile' | 'stretch' | 'contain' };
export interface CollageConfig {
  outputPath: string;
  outputFormat?: import('./renderSpec').OutputFormat;
  width: number;
  height: number;
  mode: CollageMode;
  rows: number;
  columns: number;
  direction: StripDirection;
  outerMargin: number;
  gap: number;
  cornerRadius: number;
  shadow: { enabled: boolean; color: string; blur: number; offsetX: number; offsetY: number };
  background: CollageBackground;
  quality: number;
}
export interface CollageTemplate {
  id: string;
  name: string;
  config: Omit<CollageConfig, 'outputPath'>;
  items: Array<Omit<CollageItem, 'id' | 'path'>>;
}

export const DEFAULT_COLLAGE_CONFIG: CollageConfig = {
  outputPath: '',
  width: 4000,
  height: 4000,
  mode: 'grid',
  rows: 2,
  columns: 2,
  direction: 'vertical',
  outerMargin: 40,
  gap: 20,
  cornerRadius: 0,
  shadow: { enabled: false, color: '#00000055', blur: 18, offsetX: 0, offsetY: 8 },
  background: { type: 'color', color: '#f3f1ec' },
  quality: 92,
};

export function makeCollageItems(
  photos: Array<{ id: string; path: string }>,
  columns = 2,
): CollageItem[] {
  return photos.map((photo, index) => ({
    id: photo.id,
    path: photo.path,
    transform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, fit: 'cover' },
    cell: {
      row: Math.floor(index / columns),
      column: index % columns,
      rowSpan: 1,
      columnSpan: 1,
      x: 0.08 + (index % 3) * 0.27,
      y: 0.08 + Math.floor(index / 3) * 0.3,
      width: 0.3,
      height: 0.3,
      zIndex: index,
    },
  }));
}
