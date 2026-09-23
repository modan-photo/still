import { Box, Collapse, useMediaQuery } from "@mui/material";
import { motionTokens } from "../theme/tokens";
import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import { Placeholder } from "./Placeholder";

type PanelSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function PanelSection({ title, children, defaultOpen = false }: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  return (
    <section className="border-b border-subtle px-4 py-4 last:border-b-0">
      <button
        className="flex w-full items-center justify-between rounded-sm text-left outline-none transition-colors duration-fast ease-app hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-sm font-semibold text-primary">{title}</span>
        <Box
          component="span"
          sx={{
            width: 28,
            height: 28,
            display: "grid",
            placeItems: "center",
            color: "text.secondary",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform var(--motion-base) var(--motion-easing)",
          }}
        >
          <Icon name="chevron" size={15} />
        </Box>
      </button>

      <Collapse in={open} timeout={reducedMotion ? 0 : motionTokens.duration.base} easing="var(--motion-easing)">
        <div id={contentId} className="space-y-4 pt-4">
          <Placeholder label={title} className="space-y-4">{children}</Placeholder>
        </div>
      </Collapse>
    </section>
  );
}
