import { useEffect, useRef, useState, type ReactNode } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useUIStore } from "../stores/uiStore";
import { motionTokens } from "../theme/tokens";
import { GridPanel } from "./GridPanel";

const FAST_MOTION_MS = motionTokens.duration.fast;

type AppShellProps = {
  titleBar: ReactNode;
  titleBarVisible: boolean;
  mainCanvas: ReactNode;
  rightPanel: ReactNode;
  filmStrip: ReactNode;
  progress?: ReactNode;
};

/**
 * Editor-wide layout only. Feature regions are supplied as slots; photo count
 * controls whether the filmstrip row exists, while editing stays in its slot.
 */
export function AppShell({ titleBar, titleBarVisible, mainCanvas, rightPanel, filmStrip, progress }: AppShellProps) {
  const photoCount = useProjectStore((state) => state.photos.length);
  const wantsFilmStrip = photoCount >= 2;
  const [filmStripMounted, setFilmStripMounted] = useState(wantsFilmStrip);
  const [filmStripShown, setFilmStripShown] = useState(wantsFilmStrip);
  const filmStripMountedRef = useRef(filmStripMounted);
  const hideDelayRef = useRef<number | null>(null);
  const unmountDelayRef = useRef<number | null>(null);
  const enterFrameRef = useRef<number | null>(null);

  const updateFilmStripMounted = (mounted: boolean) => {
    filmStripMountedRef.current = mounted;
    setFilmStripMounted(mounted);
  };

  useEffect(() => {
    if (hideDelayRef.current !== null) window.clearTimeout(hideDelayRef.current);
    if (unmountDelayRef.current !== null) window.clearTimeout(unmountDelayRef.current);
    if (enterFrameRef.current !== null) window.cancelAnimationFrame(enterFrameRef.current);

    if (wantsFilmStrip) {
      if (!filmStripMountedRef.current) {
        updateFilmStripMounted(true);
        setFilmStripShown(false);
        enterFrameRef.current = window.requestAnimationFrame(() => {
          setFilmStripShown(true);
          enterFrameRef.current = null;
        });
      } else {
        setFilmStripShown(true);
      }
      return;
    }

    if (!filmStripMountedRef.current) return;
    const hideFilmStrip = () => {
      setFilmStripShown(false);
      unmountDelayRef.current = window.setTimeout(() => {
        updateFilmStripMounted(false);
        unmountDelayRef.current = null;
      }, FAST_MOTION_MS);
    };

    if (useUIStore.getState().gridPanelOpen) {
      useUIStore.getState().setGridPanelOpen(false);
      hideDelayRef.current = window.setTimeout(() => {
        hideFilmStrip();
        hideDelayRef.current = null;
      }, FAST_MOTION_MS);
    } else {
      hideFilmStrip();
    }
  }, [wantsFilmStrip]);

  useEffect(() => () => {
    if (hideDelayRef.current !== null) window.clearTimeout(hideDelayRef.current);
    if (unmountDelayRef.current !== null) window.clearTimeout(unmountDelayRef.current);
    if (enterFrameRef.current !== null) window.cancelAnimationFrame(enterFrameRef.current);
  }, []);

  const rowLayout = filmStripMounted
    ? filmStripShown
      ? titleBarVisible
        ? "grid-rows-[0_minmax(0,1fr)_72px] md:grid-rows-[40px_minmax(0,1fr)_84px] lg:grid-rows-[40px_minmax(0,1fr)_96px]"
        : "grid-rows-[0_minmax(0,1fr)_72px] md:grid-rows-[0_minmax(0,1fr)_84px] lg:grid-rows-[0_minmax(0,1fr)_96px]"
      : titleBarVisible
        ? "grid-rows-[0_minmax(0,1fr)_0px] md:grid-rows-[40px_minmax(0,1fr)_0px]"
        : "grid-rows-[0_minmax(0,1fr)_0px]"
    : titleBarVisible
      ? "grid-rows-[0_minmax(0,1fr)] md:grid-rows-[40px_minmax(0,1fr)]"
      : "grid-rows-[0_minmax(0,1fr)]";

  return (
    <div className={`grid h-full min-h-0 w-full overflow-hidden bg-app-base text-primary transition-[grid-template-rows] ease-app ${filmStripShown ? "duration-base" : "duration-fast"} ${rowLayout}`}>
      <div className={titleBarVisible ? "relative z-30 hidden min-w-0 border-b border-subtle bg-app-surface md:block" : "hidden"}>{titleBar}</div>

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {progress}
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <section className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden" aria-label="Editor canvas">
            {mainCanvas}
            {filmStripMounted && <GridPanel />}
          </section>
          <div className="relative z-20 flex min-h-0 shrink-0">
            {rightPanel}
          </div>
        </div>
      </div>

      {filmStripMounted && (
        <footer
          className={`min-h-0 min-w-0 border-t border-subtle bg-app-surface transition-[transform,opacity] ease-app ${filmStripShown ? "translate-y-0 opacity-100 duration-base" : "pointer-events-none translate-y-full opacity-0 duration-fast"}`}
          aria-label="Photo filmstrip"
          aria-hidden={!filmStripShown}
        >
          {filmStrip}
        </footer>
      )}
    </div>
  );
}
