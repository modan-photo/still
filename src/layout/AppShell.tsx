import type { ReactNode } from "react";

type AppShellProps = {
  titleBar: ReactNode;
  mainCanvas: ReactNode;
  rightPanel: ReactNode;
  filmStrip: ReactNode;
};

/**
 * Editor-wide layout only. Feature regions are supplied as slots so the shell
 * stays independent from photo editing state and platform-specific behavior.
 */
export function AppShell({ titleBar, mainCanvas, rightPanel, filmStrip }: AppShellProps) {
  return (
    <div className="grid h-full min-h-0 w-full grid-rows-[40px_minmax(0,1fr)_96px] overflow-hidden bg-app-base text-primary">
      <div className="min-w-0 border-b border-subtle bg-app-surface">{titleBar}</div>

      <div className="flex min-h-0 min-w-0 overflow-hidden">
        <section className="min-h-0 min-w-0 flex-1 overflow-hidden" aria-label="Editor canvas">
          {mainCanvas}
        </section>
        <aside className="min-h-0 w-[300px] shrink-0 border-l border-subtle bg-app-surface" aria-label="Editor parameters">
          {rightPanel}
        </aside>
      </div>

      <footer className="min-h-0 min-w-0 border-t border-subtle bg-app-surface" aria-label="Photo filmstrip">
        {filmStrip}
      </footer>
    </div>
  );
}
