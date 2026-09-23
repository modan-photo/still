import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, GlobalStyles } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { useMemo } from "react";
import App from "./App";
import { useTheme } from "./hooks/useTheme";
import { createStillTheme } from "./theme/muiTheme";
import { getCssVariables } from "./theme/tokens";

function Root() {
  const themeController = useTheme();
  const muiTheme = useMemo(
    () => createStillTheme(themeController.resolvedTheme),
    [themeController.resolvedTheme],
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          ":root": getCssVariables(themeController.resolvedTheme),
        }}
      />
      <App theme={themeController} />
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
