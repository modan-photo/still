import { useEffect, useRef, useState, type ReactNode } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useUIStore } from "../stores/uiStore";
import { motionTokens } from "../theme/tokens";
import { UndoToast } from "../components/UndoToast";
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
 * Owns the editor's top-level geometry without owning feature behavior.
 *
 * Feature regions are supplied as slots so this component only coordinates the
 * title bar, canvas, inspector, filmstrip and global overlays. Photo count controls
 * whether the filmstrip row exists, while the canvas remains mounted in its slot.
 */
export function AppShell({ titleBar, titleBarVisible, mainCanvas, rightPanel, filmStrip, progress }: AppShellProps) {
  const photoCount = useProjectStore((state) => state.photos.length);
  const wantsFilmStrip = photoCount >= 2;
  // Mounting and visibility are separate so the row can animate to zero before its
  // relatively expensive virtualized contents are removed from the DOM.
  const [filmStripMounted, setFilmStripMounted] = useState(wantsFilmStrip);
  const [filmStripShown, setFilmStripShown] = useState(wantsFilmStrip);
  const filmStripMountedRef = useRef(filmStripMounted);
  const hideDelayRef = useRef<number | null>(null);
  const unmountDelayRef = useRef<number | null>(null);
  const enterFrameRef = useRef<number | null>(null);

  // The ref exposes the latest mount state to delayed callbacks without making the
  // transition effect depend on state that it changes itself.
  const updateFilmStripMounted = (mounted: boolean) => {
    filmStripMountedRef.current = mounted;
    setFilmStripMounted(mounted);
  };

  useEffect(() => {
    // A rapid sequence of imports/removals supersedes any animation scheduled for
    // the previous photo count.
    if (hideDelayRef.current !== null) window.clearTimeout(hideDelayRef.current);
    if (unmountDelayRef.current !== null) window.clearTimeout(unmountDelayRef.current);
    if (enterFrameRef.current !== null) window.cancelAnimationFrame(enterFrameRef.current);

    if (wantsFilmStrip) {
      if (!filmStripMountedRef.current) {
        // Render the zero-height row first, then reveal it on the next frame so the
        // browser has two distinct grid states to interpolate between.
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
      // Keep the footer mounted until its slide/fade transition has completed.
      unmountDelayRef.current = window.setTimeout(() => {
        updateFilmStripMounted(false);
        unmountDelayRef.current = null;
      }, FAST_MOTION_MS);
    };

    if (useUIStore.getState().gridPanelOpen) {
      // The grid is anchored above the filmstrip. Close it first so the two bottom
      // surfaces do not animate through each other when the second photo disappears.
      useUIStore.getState().setGridPanelOpen(false);
      hideDelayRef.current = window.setTimeout(() => {
        hideFilmStrip();
        hideDelayRef.current = null;
      }, FAST_MOTION_MS);
    } else {
      hideFilmStrip();
    }
  }, [wantsFilmStrip]);

  // Release every timer/frame owned by the shell if the entire editor unmounts.
  useEffect(() => () => {
    if (hideDelayRef.current !== null) window.clearTimeout(hideDelayRef.current);
    if (unmountDelayRef.current !== null) window.clearTimeout(unmountDelayRef.current);
    if (enterFrameRef.current !== null) window.cancelAnimationFrame(enterFrameRef.current);
  }, []);

  // On compact screens the title bar slot is a zero-height row; desktop reserves
  // the native-title-bar height explicitly to keep canvas sizing deterministic.
  const shellRowLayout = titleBarVisible
    ? "grid-rows-[0_minmax(0,1fr)] md:grid-rows-[40px_minmax(0,1fr)]"
    : "grid-rows-[0_minmax(0,1fr)]";
  // Grid row animation controls layout height while the footer transition controls
  // its visual slide and opacity.
  const leftColumnRowLayout = filmStripMounted
    ? filmStripShown
      ? "grid-rows-[minmax(0,1fr)_72px] md:grid-rows-[minmax(0,1fr)_84px] lg:grid-rows-[minmax(0,1fr)_96px]"
      : "grid-rows-[minmax(0,1fr)_0px]"
    : "grid-rows-[minmax(0,1fr)]";

  return (
    <div className={`grid h-full min-h-0 w-full overflow-hidden bg-app-base text-primary ${shellRowLayout}`}>
      <div className={titleBarVisible ? "relative z-30 hidden min-w-0 border-b border-subtle bg-app-surface md:block" : "hidden"}>{titleBar}</div>

      <div className="relative flex h-full min-h-0 min-w-0 overflow-hidden">
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {progress}
          <div className={`grid min-h-0 min-w-0 flex-1 overflow-hidden transition-[grid-template-rows] ease-app ${filmStripShown ? "duration-base" : "duration-fast"} ${leftColumnRowLayout}`}>
            <section className="relative isolate h-full min-h-0 min-w-0 overflow-hidden" aria-label="Editor canvas">
              {mainCanvas}
              {filmStripMounted && <GridPanel />}
            </section>

            {filmStripMounted && (
              <footer
                className={`min-h-0 min-w-0 w-full overflow-hidden border-t border-subtle bg-app-surface transition-[transform,opacity] ease-app ${filmStripShown ? "translate-y-0 opacity-100 duration-base" : "pointer-events-none translate-y-full opacity-0 duration-fast"}`}
                aria-label="Photo filmstrip"
                aria-hidden={!filmStripShown}
              >
                {filmStrip}
              </footer>
            )}
          </div>
        </div>
        <div className="relative z-20 flex h-full min-h-0 shrink-0">
          {rightPanel}
        </div>
      </div>
      <UndoToast />
    </div>
  );
}
