import type { CollageDraft, ProjectPhoto } from '../stores/projectStore';
import type { CollageConfig, CollageItem } from '../types/collage';
import { colorTokens } from '../theme/tokens';
import { getCollageCanvasSize, getGridShape } from '../components/collage/collageModel';

export function createCollageExportPayload(
  draft: CollageDraft,
  photos: ProjectPhoto[],
  outputPath: string,
  quality: number,
): { items: CollageItem[]; config: CollageConfig } {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const selected = draft.photoIds.map((id) => byId.get(id)).filter((photo): photo is ProjectPhoto => Boolean(photo));
  const shape = getGridShape(draft.layout);
  const strip = draft.layout === 'v-strip' || draft.layout === 'h-strip';
  const capacity = strip ? selected.length : shape.columns * shape.rows;
  const items = selected.slice(0, capacity).map((photo, index): CollageItem => ({
    id: photo.id,
    path: photo.path,
    transform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, fit: 'cover' },
    cell: {
      row: Math.floor(index / shape.columns),
      column: index % shape.columns,
      rowSpan: 1,
      columnSpan: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      zIndex: index,
    },
  }));
  const size = getCollageCanvasSize(draft, items.length);
  return {
    items,
    config: {
      outputPath,
      width: size.width,
      height: size.height,
      mode: strip ? 'strip' : 'grid',
      rows: shape.rows,
      columns: shape.columns,
      direction: draft.layout === 'h-strip' ? 'horizontal' : 'vertical',
      outerMargin: 0,
      gap: draft.gap,
      cornerRadius: draft.radius,
      shadow: { enabled: false, color: colorTokens.dark.text.primary, blur: 0, offsetX: 0, offsetY: 0 },
      background: { type: 'color', color: draft.background.type === 'transparent' ? '#00000000' : draft.background.color },
      quality,
    },
  };
}
