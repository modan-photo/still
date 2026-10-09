import { Drawer, IconButton } from "@mui/material";
import { Icon } from "../components/Icons";
import { InspectorContent } from "./RightPanel";
import { useTranslation } from "../i18n/messages";

type MobileRightPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Persistent bottom-sheet inspector for compact editor layouts.
 * Collage is excluded because mobile collage editing has its own full-screen shell.
 */
export function MobileRightPanel({ open, onOpenChange }: MobileRightPanelProps) {
  const t = useTranslation();
  return (
    <>
      <Drawer
        anchor="bottom"
        variant="persistent"
        open={open}
        aria-label={t('inspector')}
        sx={{
          "& .MuiDrawer-paper": {
            // Dynamic viewport units account for mobile browser/system chrome.
            height: "50dvh",
            maxHeight: "calc(100dvh - 72px)",
            // Leave the filmstrip row visible beneath the sheet.
            bottom: "72px",
            overflow: "hidden",
            borderTopLeftRadius: "var(--radius-xl)",
            borderTopRightRadius: "var(--radius-xl)",
            borderBottom: 0,
            boxShadow: "var(--shadow-elev3)",
          },
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="relative flex h-7 shrink-0 items-start justify-center pt-2">
            <div
              className="h-1 w-9 rounded-full bg-subtle"
              aria-hidden="true"
            />
            <IconButton
              aria-label={t('closeInspector')}
              onClick={() => onOpenChange(false)}
              size="small"
              sx={{
                position: "absolute",
                right: 8,
                top: 2,
                width: 28,
                height: 28,
              }}
            >
              <Icon name="chevron" size={16} />
            </IconButton>
          </div>
          <InspectorContent excludeCollage />
        </div>
      </Drawer>

      {/* When the persistent drawer is closed, expose a floating restore control. */}
      {!open && (
        <IconButton
          aria-label={t('openInspector')}
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
