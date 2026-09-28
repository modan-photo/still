import type { CollageDraft } from '../../stores/projectStore';

export type CollageGridShape = { columns: number; rows: number };
export const COLLAGE_LONG_EDGE = 4000;

export function getGridShape(layout: CollageDraft['layout']): CollageGridShape {
  switch (layout) {
    case '1x2': return { columns: 2, rows: 1 };
    case '1x3': return { columns: 3, rows: 1 };
    case '2x1': return { columns: 1, rows: 2 };
    case '2x3': return { columns: 3, rows: 2 };
    case '3x3': return { columns: 3, rows: 3 };
    default: return { columns: 2, rows: 2 };
  }
}

export function getCollageAspectRatio(draft: CollageDraft, photoCount: number) {
  if (draft.aspect !== 'auto') {
    const [width, height] = draft.aspect.split(':').map(Number);
    return width / height;
  }
  if (draft.layout === 'v-strip') return 2 / Math.max(3, photoCount * 2);
  if (draft.layout === 'h-strip') return Math.max(3, photoCount * 2) / 2;
  const shape = getGridShape(draft.layout);
  return shape.columns / shape.rows;
}

export function getCollageCanvasSize(draft: CollageDraft, photoCount: number) {
  const ratio = getCollageAspectRatio(draft, photoCount);
  return ratio >= 1
    ? { width: COLLAGE_LONG_EDGE, height: Math.max(1, Math.round(COLLAGE_LONG_EDGE / ratio)) }
    : { width: Math.max(1, Math.round(COLLAGE_LONG_EDGE * ratio)), height: COLLAGE_LONG_EDGE };
}
