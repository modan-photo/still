import { Drawer, IconButton } from "@mui/material";
import { Icon } from "../components/Icons";
import { InspectorContent } from "./RightPanel";

type MobileRightPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MobileRightPanel({ open, onOpenChange }: MobileRightPanelProps) {
  return (
    <>
      <Drawer
        anchor="bottom"
        variant="persistent"
        open={open}
        aria-label="Inspector"
        sx={{
          "& .MuiDrawer-paper": {
            height: "50dvh",
            maxHeight: "calc(100dvh - 72px)",
            bottom: "72px",
            overflow: "hidden",
            borderTopLeftRadius: "var(--radius-xl)",
            borderTopRightRadius: "var(--radius-xl)",
            borderBottom: 0,
            boxShadow: "var(--shadow-elev3)",
          },
        }}
      >
        <div className="relative flex h-full min-h-0 flex-col pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-subtle" aria-hidden="true" />
          <IconButton
            aria-label="Close inspector"
            onClick={() => onOpenChange(false)}
            size="small"
            sx={{ position: "absolute", right: 12, top: 8 }}
          >
            <Icon name="chevron" size={16} />
          </IconButton>
          <InspectorContent />
        </div>
      </Drawer>

      {!open && (
        <IconButton
          aria-label="Open inspector"
          onClick={() => onOpenChange(true)}
          sx={{
            position: "fixed",
            zIndex: (theme) => theme.zIndex.drawer + 1,
            right: 12,
            bottom: 84,
            width: 40,
            height: 40,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            boxShadow: "var(--shadow-elev2)",
            "&:hover": { bgcolor: "background.default", color: "primary.main" },
          }}
        >
          <Icon name="sidebar" size={18} />
        </IconButton>
      )}
    </>
  );
}
