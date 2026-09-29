import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { renderBorderPreview } from '../render/border';
import { cacheAssetUrl } from '../services/tauri/image';
import type { FramePreset } from '../types/frame';
import { DEFAULT_BORDER, type BorderSpec } from '../types/renderSpec';

type PreviewPreset = Pick<FramePreset, 'style' | 'params'>;

type FrameMiniPreviewProps = {
  src: string;
  originalWidth: number;
  originalHeight: number;
  label?: string;
} & (
  | { preset: PreviewPreset; config?: never }
  | { preset?: never; config: BorderSpec }
);

/** A 48×32 preview that uses the same Canvas renderer as the main preview. */
export function FrameMiniPreview({
  src,
  originalWidth,
  originalHeight,
  label,
  preset,
  config,
}: FrameMiniPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const renderConfig = useMemo(
    () => preset ? framePresetToBorderSpec(preset) : config,
    [config, preset],
  );
  const shadowStyle = preset?.style === 'shadow'
    ? createPreviewShadow(preset.params.shadow)
    : undefined;

  useEffect(() => {
    let disposed = false;
    const next = new Image();
    next.src = cacheAssetUrl(src);
    void next.decode()
      .then(() => { if (!disposed) setImage(next); })
      .catch(() => undefined);
    return () => {
      disposed = true;
      next.removeAttribute('src');
      setImage(null);
    };
  }, [src]);

  useEffect(() => {
    if (!image) return;
    const frame = window.requestAnimationFrame(() => {
      if (canvasRef.current) {
        renderBorderPreview(canvasRef.current, image, renderConfig, originalWidth, originalHeight);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [image, originalHeight, originalWidth, renderConfig]);

  return (
    <span
      className="grid h-8 w-12 shrink-0 place-items-center overflow-hidden rounded-sm bg-app-base"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <canvas
        ref={canvasRef}
        className={preset?.style === 'shadow'
          ? 'block max-h-[24px] max-w-[40px]'
          : 'block max-h-full max-w-full'}
        style={shadowStyle}
      />
    </span>
  );
}

/** Adapts preset data without changing the existing BorderSpec wire contract. */
export function framePresetToBorderSpec(preset: PreviewPreset): BorderSpec {
  const gradient = preset.params.gradient;
  const colors = gradient?.stops
    .slice()
    .sort((left, right) => left.offset - right.offset)
    .map((stop) => stop.color);
  return {
    ...DEFAULT_BORDER,
    style: preset.style === 'shadow' ? 'solid' : preset.style,
    width: preset.params.width,
    unit: preset.params.unit,
    color: preset.params.color,
    radius: preset.params.radius,
    colors: colors && colors.length >= 2 ? colors : DEFAULT_BORDER.colors,
    angle: gradient?.angle ?? DEFAULT_BORDER.angle,
  };
}

function createPreviewShadow(shadow: PreviewPreset['params']['shadow']): CSSProperties | undefined {
  if (!shadow) return undefined;
  const scale = 0.15;
  return {
    boxShadow: `0 ${shadow.offsetY * scale}px ${shadow.blur * scale}px ${shadow.spread * scale}px ${shadow.color}`,
  };
}
