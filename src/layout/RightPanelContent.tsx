import { Box } from "@mui/material";
import { FrameControls } from "../components/FrameControls";
import { TransformTab } from "./RightPanel/tabs/TransformTab";
import { ExifPanel } from "../components/exif/ExifPanel";
import { StampControls } from "../components/StampControls";
import { useUIStore } from "../stores/uiStore";
import { RIGHT_PANEL_TABS, type RightPanelTabId } from "./rightPanelTabs";
import { CollageTab } from "./RightPanel/tabs/CollageTab";

/**
 * Hosts all inspector panels in a stable tabpanel structure.
 * Inactive panels stay represented for accessible tab relationships but are removed
 * from layout with `display: none` so only the active panel can scroll.
 */
export function RightPanelContent({ excludeCollage = false }: { excludeCollage?: boolean }) {
  const activeRightTab = useUIStore((state) => state.activeRightTab);

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      {RIGHT_PANEL_TABS.filter((tab) => !excludeCollage || tab.id !== 'collage').map((tab) => {
        const active = activeRightTab === tab.id;

        return (
          <Box
            key={tab.id}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={!active}
            sx={(theme) => ({
              display: active ? "block" : "none",
              boxSizing: "border-box",
              height: "100%",
              overflowY: "auto",
              overscrollBehavior: "contain",
              // EXIF owns its own grouped edge-to-edge layout; editing tabs receive
              // the shared inspector padding here.
              padding: tab.id === "exif"
                ? "0 0 var(--space-6)"
                : "var(--space-4) var(--space-4) var(--space-6)",
              scrollbarWidth: "thin",
              scrollbarColor: `${theme.palette.divider} transparent`,
              "&::-webkit-scrollbar": {
                width: 6,
              },
              "&::-webkit-scrollbar-track": {
                backgroundColor: "transparent",
              },
              "&::-webkit-scrollbar-thumb": {
                borderRadius: theme.still.radius.full,
                backgroundColor: "divider",
              },
              "&::-webkit-scrollbar-thumb:hover": {
                backgroundColor: "text.secondary",
              },
            })}
          >
            {renderTabContent(tab.id)}
          </Box>
        );
      })}
    </div>
  );
}

/** Keep tab metadata and its concrete feature component mapped in one place. */
function renderTabContent(tab: RightPanelTabId) {
  switch (tab) {
    case "frame":
      return <FrameControls />;
    case "transform":
      return <TransformTab />;
    case "stamp":
      return <StampControls />;
    case "exif":
      return <ExifPanel />;
    case "collage":
      return <CollageTab />;
  }
}
