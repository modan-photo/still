import type { ReactNode } from "react";

type AppShellProps = {
  titleBar: ReactNode;
  titleBarVisible: boolean;
  mainCanvas: ReactNode;
  rightPanel: ReactNode;
  filmStrip: ReactNode;
};

/**
 * Editor-wide layout only. Feature regions are supplied as slots so the shell
 * stays independent from photo editing state and platform-specific behavior.
 */
export function AppShell({ titleBar, titleBarVisible, mainCanvas, rightPanel, filmStrip }: AppShellProps) {
  const rowLayout = titleBarVisible
    ? "grid-rows-[0_minmax(0,1fr)_72px] md:grid-rows-[40px_minmax(0,1fr)_84px] lg:grid-rows-[40px_minmax(0,1fr)_96px]"
    : "grid-rows-[0_minmax(0,1fr)_72px] md:grid-rows-[0_minmax(0,1fr)_84px] lg:grid-rows-[0_minmax(0,1fr)_96px]";

  return (
    <div className={`grid h-full min-h-0 w-full overflow-hidden bg-app-base text-primary ${rowLayout}`}>
      <div className={titleBarVisible ? "hidden min-w-0 border-b border-subtle bg-app-surface md:block" : "hidden"}>{titleBar}</div>

      <div className="flex min-h-0 min-w-0 overflow-hidden">
        <section className="min-h-0 min-w-0 flex-1 overflow-hidden" aria-label="Editor canvas">
          {mainCanvas}
        </section>
        {rightPanel}
      </div>

      <footer className="min-h-0 min-w-0 border-t border-subtle bg-app-surface" aria-label="Photo filmstrip">
        {filmStrip}
      </footer>
    </div>
  );
}
