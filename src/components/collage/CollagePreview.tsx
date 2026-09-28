import { Box, CircularProgress, useTheme } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cacheAssetUrl, getCachedImage } from '../../services/tauri/image';
import { useProjectStore, type CollageDraft, type ProjectPhoto } from '../../stores/projectStore';
import { getCollageAspectRatio, getCollageCanvasSize, getGridShape } from './collageModel';

type PreviewImageMap = Record<string, HTMLImageElement>;
type Size = { width: number; height: number };

export function CollagePreview({ className }: { className?: string }) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draft = useProjectStore((state) => state.collageDraft);
  const photos = useProjectStore((state) => state.photos);
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });
  const [images, setImages] = useState<PreviewImageMap>({});
  const selectedPhotos = useMemo(() => {
    const byId = new Map(photos.map((photo) => [photo.id, photo]));
    return draft.photoIds.map((id) => byId.get(id)).filter((photo): photo is ProjectPhoto => Boolean(photo));
  }, [draft.photoIds, photos]);
  const aspectRatio = getCollageAspectRatio(draft, selectedPhotos.length);
  const displaySize = fitWithin(containerSize, aspectRatio);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    const loaded: PreviewImageMap = {};
    void Promise.all(selectedPhotos.map(async (photo) => {
      try {
        const cached = await getCachedImage(photo.path, 'preview');
        const image = new Image();
        image.src = cacheAssetUrl(cached.path);
        await image.decode();
        loaded[photo.id] = image;
      } catch {
        // Missing previews are rendered as themed empty cells.
      }
    })).then(() => {
      if (!disposed) setImages(loaded);
    });
    return () => {
      disposed = true;
      Object.values(loaded).forEach((image) => image.removeAttribute('src'));
    };
  }, [selectedPhotos]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || displaySize.width <= 0 || displaySize.height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(displaySize.width * dpr));
    canvas.height = Math.max(1, Math.round(displaySize.height * dpr));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderCollagePreview(context, displaySize, draft, selectedPhotos, images, {
      emptyCell: theme.still.colors[theme.palette.mode].bg.elevated,
      checkerA: theme.still.colors[theme.palette.mode].bg.surface,
      checkerB: theme.still.colors[theme.palette.mode].border.subtle,
    });
  }, [displaySize.height, displaySize.width, draft, images, selectedPhotos, theme]);

  const isLoading = selectedPhotos.length > 0 && Object.keys(images).length === 0;

  return (
    <Box
      ref={containerRef}
      className={className}
      aria-label="Collage preview"
      sx={{
        position: 'relative',
        display: 'grid',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        placeItems: 'center',
        overflow: 'hidden',
      }}
    >
      <Box
        component="canvas"
        ref={canvasRef}
        sx={{
          display: displaySize.width > 0 ? 'block' : 'none',
          width: displaySize.width,
          height: displaySize.height,
          maxWidth: '90%',
          maxHeight: '90%',
          borderRadius: `${theme.still.radius.md}px`,
          boxShadow: theme.still.shadow.elev3,
          opacity: isLoading ? 0.45 : 1,
          transition: theme.transitions.create('opacity', {
            duration: theme.still.motion.duration.fast,
            easing: theme.still.motion.easing,
          }),
        }}
      />
      {isLoading && <CircularProgress size={28} aria-label="Loading collage preview" sx={{ position: 'absolute' }} />}
    </Box>
  );
}

function renderCollagePreview(
  context: CanvasRenderingContext2D,
  size: Size,
  draft: CollageDraft,
  photos: ProjectPhoto[],
  images: PreviewImageMap,
  colors: { emptyCell: string; checkerA: string; checkerB: string },
) {
  context.clearRect(0, 0, size.width, size.height);
  if (draft.background.type === 'transparent') {
    drawCheckerboard(context, size, colors.checkerA, colors.checkerB);
  } else {
    context.fillStyle = draft.background.color;
    context.fillRect(0, 0, size.width, size.height);
  }

  const cells = calculateCells(draft, photos.length, size);
  const logicalSize = getCollageCanvasSize(draft, photos.length);
  const scale = size.width / logicalSize.width;
  const radius = draft.radius * scale;
  photos.slice(0, cells.length).forEach((photo, index) => {
    const cell = cells[index];
    context.save();
    roundedRect(context, cell.x, cell.y, cell.width, cell.height, radius);
    context.clip();
    const image = images[photo.id];
    if (image) {
      drawCover(context, image, cell);
    } else {
      context.fillStyle = colors.emptyCell;
      context.fillRect(cell.x, cell.y, cell.width, cell.height);
    }
    context.restore();
  });
}

function calculateCells(draft: CollageDraft, photoCount: number, size: Size) {
  const logicalSize = getCollageCanvasSize(draft, photoCount);
  const gap = draft.gap * size.width / logicalSize.width;
  if (draft.layout === 'v-strip') {
    const count = Math.max(1, photoCount);
    const height = (size.height - gap * (count - 1)) / count;
    return Array.from({ length: count }, (_, index) => ({ x: 0, y: index * (height + gap), width: size.width, height }));
  }
  if (draft.layout === 'h-strip') {
    const count = Math.max(1, photoCount);
    const width = (size.width - gap * (count - 1)) / count;
    return Array.from({ length: count }, (_, index) => ({ x: index * (width + gap), y: 0, width, height: size.height }));
  }
  const { columns, rows } = getGridShape(draft.layout);
  const cellWidth = (size.width - gap * (columns - 1)) / columns;
  const cellHeight = (size.height - gap * (rows - 1)) / rows;
  return Array.from({ length: columns * rows }, (_, index) => ({
    x: (index % columns) * (cellWidth + gap),
    y: Math.floor(index / columns) * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight,
  }));
}

function fitWithin(container: Size, aspectRatio: number): Size {
  if (container.width <= 0 || container.height <= 0) return { width: 0, height: 0 };
  const availableWidth = container.width * 0.9;
  const availableHeight = container.height * 0.9;
  const width = Math.min(availableWidth, availableHeight * aspectRatio);
  return { width, height: width / aspectRatio };
}

function drawCheckerboard(context: CanvasRenderingContext2D, size: Size, first: string, second: string) {
  const tile = 12;
  for (let y = 0; y < size.height; y += tile) {
    for (let x = 0; x < size.width; x += tile) {
      context.fillStyle = ((x / tile + y / tile) % 2 === 0) ? first : second;
      context.fillRect(x, y, tile, tile);
    }
  }
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, cell: { x: number; y: number; width: number; height: number }) {
  const scale = Math.max(cell.width / image.naturalWidth, cell.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, cell.x + (cell.width - width) / 2, cell.y + (cell.height - height) / 2, width, height);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}
