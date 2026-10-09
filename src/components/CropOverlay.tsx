import { Box, Fade } from '@mui/material';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from '../i18n/messages';
import { moveCropRect, resizeCropRect, type CropHandle } from '../render/cropGeometry';
import { cropOverlayTokens, motionTokens } from '../theme/tokens';
import type { CropAspect, CropRect } from '../types/renderSpec';

const HANDLES: ReadonlyArray<{ id: CropHandle; x: number; y: number; cursor: string }> = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { id: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { id: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { id: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { id: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { id: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
];

interface CropOverlayProps {
  rect: CropRect;
  aspect: CropAspect;
  sourceWidth: number;
  sourceHeight: number;
  visible: boolean;
  /** Changes when rotation or flips invalidate a pointer's coordinate snapshot. */
  coordinateSpaceKey?: string;
  onPreviewChange: (rect: CropRect | null) => void;
  onCommit: (rect: CropRect, aspect: CropAspect) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onExited?: () => void;
}

/** Pointer capture keeps edits local until release, cancellation, or panel exit. */
export function CropOverlay({
  rect,
  aspect,
  sourceWidth,
  sourceHeight,
  visible,
  coordinateSpaceKey,
  onPreviewChange,
  onCommit,
  onCancel,
  onConfirm,
  onExited,
}: CropOverlayProps) {
  const t = useTranslation();
  const photoRegion = useRef<HTMLDivElement>(null);
  const cropFrame = useRef<HTMLDivElement>(null);
  const session = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    width: number;
    height: number;
    start: CropRect;
    latest: CropRect;
    handle: CropHandle | null;
    aspect: CropAspect;
    sourceWidth: number;
    sourceHeight: number;
  } | null>(null);
  const [draft, setDraft] = useState<CropRect | null>(null);
  const callbacks = useRef({ onCommit, onPreviewChange });
  callbacks.current = { onCommit, onPreviewChange };
  const finish = (unmounting = false) => {
    const drag = session.current;
    if (!drag) return;
    session.current = null;
    if (!unmounting) setDraft(null);
    const changed = (['x', 'y', 'width', 'height'] as const).some(
      (key) => drag.start[key] !== drag.latest[key],
    );
    if (changed) callbacks.current.onCommit(drag.latest, drag.aspect);
    callbacks.current.onPreviewChange(null);
  };
  useEffect(() => {
    if (!visible) finish();
  }, [visible]);
  useEffect(() => {
    if (visible) cropFrame.current?.focus({ preventScroll: true });
  }, [visible]);
  useEffect(() => () => finish(true), []);
  useLayoutEffect(() => {
    // A transform or external crop edit invalidates the drag's old bounds. Discard
    // it before paint, without committing old coordinates into the new image space.
    const drag = session.current;
    if (!drag) return;
    session.current = null;
    setDraft(null);
    callbacks.current.onPreviewChange(null);
    const frame = cropFrame.current;
    if (frame?.hasPointerCapture(drag.pointerId)) frame.releasePointerCapture(drag.pointerId);
  }, [aspect, coordinateSpaceKey, rect, sourceWidth, sourceHeight]);
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!visible || session.current || !event.isPrimary || event.button !== 0) return;
    const bounds = photoRegion.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    const handleId = (event.target as HTMLElement)
      .closest('[data-crop-handle]')
      ?.getAttribute('data-crop-handle');
    const handle = HANDLES.find((entry) => entry.id === handleId)?.id ?? null;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    session.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: bounds.width,
      height: bounds.height,
      start: { ...rect },
      latest: { ...rect },
      handle,
      aspect,
      sourceWidth,
      sourceHeight,
    };
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = session.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startX) / drag.width;
    const dy = (event.clientY - drag.startY) / drag.height;
    const next = drag.handle
      ? resizeCropRect(
          drag.start,
          drag.handle,
          dx,
          dy,
          drag.aspect,
          drag.sourceWidth,
          drag.sourceHeight,
        )
      : moveCropRect(drag.start, dx, dy);
    drag.latest = next;
    setDraft(next);
    callbacks.current.onPreviewChange(next);
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (session.current?.pointerId !== event.pointerId) return;
    if (!cancelled) moveDrag(event);
    finish();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const displayed = draft ?? rect;
  const position = {
    left: `${displayed.x * 100}%`,
    top: `${displayed.y * 100}%`,
    width: `${displayed.width * 100}%`,
    height: `${displayed.height * 100}%`,
  };
  return (
    <Fade
      in={visible}
      timeout={motionTokens.duration.fast}
      easing={motionTokens.easing}
      onExited={onExited}
    >
      <Box
        ref={photoRegion}
        data-crop-overlay
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          pointerEvents: 'none',
          transitionProperty: 'opacity',
        }}
      >
        {/* Clip only the mask to the photo. Handle hit areas can extend beyond its edges. */}
        <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <Box
            sx={{
              position: 'absolute',
              ...position,
              boxSizing: 'border-box',
              border: `1px solid ${cropOverlayTokens.handle}`,
              boxShadow: `0 0 0 9999px ${cropOverlayTokens.mask}`,
            }}
          >
            {[1, 2].map((index) => (
              <Box
                key={`h-${index}`}
                sx={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: `${(index * 100) / 3}%`,
                  height: '1px',
                  backgroundColor: cropOverlayTokens.grid,
                }}
              />
            ))}
            {[1, 2].map((index) => (
              <Box
                key={`v-${index}`}
                sx={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${(index * 100) / 3}%`,
                  width: '1px',
                  backgroundColor: cropOverlayTokens.grid,
                }}
              />
            ))}
          </Box>
        </Box>
        <Box
          ref={cropFrame}
          data-crop-frame
          tabIndex={visible ? 0 : -1}
          role="group"
          aria-label={t('cropFrame')}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={(event) => endDrag(event)}
          onPointerCancel={(event) => endDrag(event, true)}
          onLostPointerCapture={() => finish()}
          onKeyDown={(event) => {
            if (!visible || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'Escape' || event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              const pointerId = session.current?.pointerId;
              if (event.key === 'Escape') {
                session.current = null;
                setDraft(null);
                onPreviewChange(null);
                onCancel();
              } else {
                finish();
                onConfirm();
              }
              if (pointerId !== undefined && event.currentTarget.hasPointerCapture(pointerId))
                event.currentTarget.releasePointerCapture(pointerId);
              return;
            }
            if (session.current) return;
            const directions: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            const direction = directions[event.key];
            if (!direction) return;
            event.preventDefault();
            event.stopPropagation();
            const step = event.shiftKey ? 10 : 1;
            onCommit(
              moveCropRect(
                rect,
                (direction[0] * step) / sourceWidth,
                (direction[1] * step) / sourceHeight,
              ),
              aspect,
            );
          }}
          sx={{
            position: 'absolute',
            ...position,
            pointerEvents: visible ? 'auto' : 'none',
            transitionProperty: 'none',
            animation: 'none',
            touchAction: 'none',
            userSelect: 'none',
            cursor: draft ? 'grabbing' : 'move',
          }}
        >
          {HANDLES.map(({ id, x, y, cursor }) => {
            const corner = id.length === 2;
            const horizontal = id === 'n' || id === 's';
            return (
              <Box
                key={id}
                data-crop-handle={id}
                sx={{
                  position: 'absolute',
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: cropOverlayTokens.handleHitSize,
                  height: cropOverlayTokens.handleHitSize,
                  transform: 'translate(-50%, -50%)',
                  display: 'grid',
                  placeItems: 'center',
                  touchAction: 'none',
                  cursor,
                  '@media (hover: hover) and (pointer: fine)': {
                    '&:hover > span': { transform: 'scale(1.2)' },
                  },
                  '@media (prefers-reduced-motion: reduce)': {
                    '&:hover > span': { transform: 'none' },
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                    width: corner ? 20 : horizontal ? 24 : 3,
                    height: corner ? 20 : horizontal ? 3 : 24,
                    ...(corner
                      ? {
                          position: 'absolute',
                          left: x === 0 ? 22 : 2,
                          top: y === 0 ? 22 : 2,
                          borderTop: y === 0 ? `3px solid ${cropOverlayTokens.handle}` : undefined,
                          borderBottom:
                            y === 1 ? `3px solid ${cropOverlayTokens.handle}` : undefined,
                          borderLeft: x === 0 ? `3px solid ${cropOverlayTokens.handle}` : undefined,
                          borderRight:
                            x === 1 ? `3px solid ${cropOverlayTokens.handle}` : undefined,
                        }
                      : { backgroundColor: cropOverlayTokens.handle }),
                    transition: `transform ${motionTokens.duration.fast}ms ${motionTokens.easing}`,
                  }}
                />
              </Box>
            );
          })}
        </Box>
      </Box>
    </Fade>
  );
}
