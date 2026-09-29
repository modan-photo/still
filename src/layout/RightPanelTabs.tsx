import { Tab, Tabs } from "@mui/material";
import { Icon } from "../components/Icons";
import { enterCollageMode } from "../services/collageMode";
import { useUIStore } from "../stores/uiStore";
import { RIGHT_PANEL_TABS, type RightPanelTabId } from "./rightPanelTabs";

export function RightPanelTabs({ excludeCollage = false }: { excludeCollage?: boolean }) {
  const activeRightTab = useUIStore((state) => state.activeRightTab);
  const setActiveRightTab = useUIStore((state) => state.setActiveRightTab);

  return (
    <Tabs
      aria-label="Inspector panel"
      value={activeRightTab}
      onChange={(_, value: RightPanelTabId) => {
        if (value === "collage") enterCollageMode();
        else setActiveRightTab(value);
      }}
      variant="fullWidth"
      TabIndicatorProps={{
        children: <span className="right-panel-tab-indicator" />,
      }}
      sx={(theme) => ({
        flex: "0 0 auto",
        minHeight: { xs: 52, md: 56 },
        height: { xs: 52, md: 56 },
        borderBottom: "1px solid",
        borderColor: "divider",
        "& .MuiTabs-flexContainer": {
          height: "100%",
        },
        "& .MuiTabs-indicator": {
          display: "flex",
          justifyContent: "center",
          height: 2,
          backgroundColor: "transparent",
          transitionDuration: `${theme.still.motion.duration.base}ms`,
        },
        "& .right-panel-tab-indicator": {
          width: 24,
          height: 2,
          borderRadius: theme.still.radius.full,
          backgroundColor: "primary.main",
        },
      })}
    >
      {RIGHT_PANEL_TABS.filter((tab) => !excludeCollage || tab.id !== 'collage').map((tab) => (
        <Tab
          key={tab.id}
          id={`tab-${tab.id}`}
          aria-label={tab.label}
          aria-controls={`panel-${tab.id}`}
          value={tab.id}
          disableRipple
          icon={<Icon name={tab.icon} size={18} strokeWidth={1.5} />}
          iconPosition="top"
          label={tab.label}
          sx={(theme) => ({
            minWidth: 0,
            minHeight: { xs: 52, md: 56 },
            height: "100%",
            gap: 0.25,
            padding: 0,
            color: "text.secondary",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.2,
            transition: theme.transitions.create(
              ["color", "background-color"],
              { duration: theme.still.motion.duration.fast },
            ),
            "& .MuiTab-iconWrapper": {
              marginBottom: 0,
            },
            "&:hover": {
              backgroundColor:
                theme.still.colors[theme.palette.mode].bg.elevated,
            },
            "&.Mui-selected": {
              color: "primary.main",
            },
          })}
        />
      ))}
    </Tabs>
  );
}
