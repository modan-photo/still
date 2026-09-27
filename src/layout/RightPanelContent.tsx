import { Box, MenuItem, Select } from "@mui/material";
import type { ReactNode } from "react";
import { FrameControls } from "../components/FrameControls";
import { StampControls } from "../components/StampControls";
import { useUIStore } from "../stores/uiStore";
import { RIGHT_PANEL_TABS, type RightPanelTabId } from "./rightPanelTabs";

export function RightPanelContent() {
  const activeRightTab = useUIStore((state) => state.activeRightTab);

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      {RIGHT_PANEL_TABS.map((tab) => {
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
              padding: "var(--space-4) var(--space-4) var(--space-6)",
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

function renderTabContent(tab: RightPanelTabId) {
  switch (tab) {
    case "frame":
      return <FrameControls />;
    case "stamp":
      return <StampControls />;
    case "exif":
      return <ExifContent />;
    case "collage":
      return <CollageContent />;
  }
}

function ExifContent() {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-xs">
      <dt className="text-secondary">Camera</dt>
      <dd className="m-0 text-right text-primary">—</dd>
      <dt className="text-secondary">Lens</dt>
      <dd className="m-0 text-right text-primary">—</dd>
      <dt className="text-secondary">Exposure</dt>
      <dd className="m-0 text-right text-primary">—</dd>
      <dt className="text-secondary">ISO</dt>
      <dd className="m-0 text-right text-primary">—</dd>
    </dl>
  );
}

function CollageContent() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rows">
          <CompactSelect value="2" options={["1", "2", "3", "4"]} />
        </Field>
        <Field label="Columns">
          <CompactSelect value="2" options={["1", "2", "3", "4"]} />
        </Field>
      </div>
      <Field label="Background">
        <button
          className="flex h-8 w-full items-center gap-2 rounded-md border border-subtle bg-app-elevated px-2 text-xs text-primary"
          type="button"
        >
          <span className="h-4 w-4 rounded-full border border-subtle bg-app-base" />
          Canvas color
        </button>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

function CompactSelect({ value, options }: { value: string; options: string[] }) {
  return (
    <Select defaultValue={value} size="small" fullWidth sx={{ height: 32, fontSize: 12 }}>
      {options.map((option) => (
        <MenuItem value={option} key={option}>
          {option}
        </MenuItem>
      ))}
    </Select>
  );
}
