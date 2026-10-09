import React from 'react';
import ReactDOM from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { CssBaseline, GlobalStyles } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { useMemo } from 'react';
import App from './App';
import { useTheme } from './hooks/useTheme';
import { createStillTheme } from './theme/muiTheme';
import { getCssVariables } from './theme/tokens';
import { CropEditProvider } from './hooks/useCropEdit';
import { initializeWorkspace } from './services/workspaceInitialization';
import { installWorkspaceCloseHandler } from './services/workspaceShutdown';
import { installWindowSizeTracking, restoreWindowSizePreset } from './services/windowPreferences';
import { useUIStore } from './stores/uiStore';
import './theme/global.css';

function Root() {
  const themeController = useTheme();
  const language = useUIStore((state) => state.language);
  React.useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);
  const muiTheme = useMemo(
    () => createStillTheme(themeController.resolvedTheme),
    [themeController.resolvedTheme],
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          ':root': getCssVariables(themeController.resolvedTheme),
        }}
      />
      <CropEditProvider>
        <App theme={themeController} />
      </CropEditProvider>
    </ThemeProvider>
  );
}

let disposed = false;
let removeCloseHandler: (() => void) | undefined;
let removeWindowSizeTracking: (() => Promise<void>) | undefined;
let reactRoot: ReactRoot | undefined = import.meta.hot?.data.reactRoot;

void initializeWorkspace().then(async () => {
  if (disposed) return;
  try {
    await restoreWindowSizePreset();
  } catch (error) {
    console.warn('Unable to restore the window size preference', error);
  }
  try {
    removeWindowSizeTracking = await installWindowSizeTracking();
  } catch (error) {
    console.warn('Unable to track window size changes', error);
  }
  const root = (reactRoot ??= ReactDOM.createRoot(document.getElementById('root') as HTMLElement));
  let stopped = false;
  try {
    removeCloseHandler = await installWorkspaceCloseHandler(() => {
      stopped = true;
      const flushWindowSize = removeWindowSizeTracking?.();
      root.unmount();
      return flushWindowSize;
    });
  } catch (error) {
    console.warn('Unable to register the workspace close handler', error);
  }
  if (disposed) {
    removeCloseHandler?.();
    void removeWindowSizeTracking?.();
    return;
  }
  if (stopped) return;
  root.render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
});

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    disposed = true;
    removeCloseHandler?.();
    void removeWindowSizeTracking?.();
    data.reactRoot = reactRoot;
  });
}
