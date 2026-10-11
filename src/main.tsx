import React from 'react';
import ReactDOM from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { Alert, CssBaseline, GlobalStyles } from '@mui/material';
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
import {
  installWindowPositionTracking,
  restoreWindowPosition,
} from './services/windowPositionPreferences';
import {
  installWindowMaximizationTracking,
  restoreWindowMaximized,
} from './services/windowMaximizationPreferences';
import { useUIStore } from './stores/uiStore';
import { translate } from './i18n/messages';
import './theme/global.css';

function Root({ preferenceRecovery }: { preferenceRecovery: string | null }) {
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
      {preferenceRecovery && (
        <Alert
          severity="error"
          sx={{
            position: 'fixed',
            zIndex: (theme) => theme.zIndex.snackbar,
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(90vw, 720px)',
            overflowWrap: 'anywhere',
          }}
        >
          <strong>{translate(language, 'preferenceRecoveryNotice')}</strong>
          <br />
          {preferenceRecovery}
        </Alert>
      )}
      <CropEditProvider>
        <App theme={themeController} />
      </CropEditProvider>
    </ThemeProvider>
  );
}

let disposed = false;
let removeCloseHandler: (() => void) | undefined;
let removeWindowSizeTracking: (() => Promise<void>) | undefined;
let removeWindowPositionTracking: (() => Promise<void>) | undefined;
let removeWindowMaximizationTracking: (() => Promise<void>) | undefined;
let reactRoot: ReactRoot | undefined = import.meta.hot?.data.reactRoot;

void initializeWorkspace().then(async (preferenceRecovery) => {
  if (disposed) return;
  try {
    await restoreWindowSizePreset();
  } catch (error) {
    console.warn('Unable to restore the window size preference', error);
  }
  try {
    await restoreWindowPosition();
  } catch (error) {
    console.warn('Unable to restore the window position preference', error);
  }
  try {
    await restoreWindowMaximized();
  } catch (error) {
    console.warn('Unable to restore the window maximization preference', error);
  }
  try {
    removeWindowSizeTracking = await installWindowSizeTracking();
  } catch (error) {
    console.warn('Unable to track window size changes', error);
  }
  try {
    removeWindowPositionTracking = await installWindowPositionTracking();
  } catch (error) {
    console.warn('Unable to track window position changes', error);
  }
  try {
    removeWindowMaximizationTracking = await installWindowMaximizationTracking();
  } catch (error) {
    console.warn('Unable to track window maximization changes', error);
  }
  const root = (reactRoot ??= ReactDOM.createRoot(document.getElementById('root') as HTMLElement));
  let stopped = false;
  try {
    removeCloseHandler = await installWorkspaceCloseHandler(async () => {
      stopped = true;
      root.unmount();
      await Promise.all([
        removeWindowSizeTracking?.(),
        removeWindowPositionTracking?.(),
        removeWindowMaximizationTracking?.(),
      ]);
    });
  } catch (error) {
    console.warn('Unable to register the workspace close handler', error);
  }
  if (disposed) {
    removeCloseHandler?.();
    void removeWindowSizeTracking?.();
    void removeWindowPositionTracking?.();
    void removeWindowMaximizationTracking?.();
    return;
  }
  if (stopped) return;
  root.render(
    <React.StrictMode>
      <Root preferenceRecovery={preferenceRecovery} />
    </React.StrictMode>,
  );
});

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    disposed = true;
    removeCloseHandler?.();
    void removeWindowSizeTracking?.();
    void removeWindowPositionTracking?.();
    void removeWindowMaximizationTracking?.();
    data.reactRoot = reactRoot;
  });
}
