import { Collapse, IconButton } from "@mui/material";
import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icons";

type PanelSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function PanelSection({ title, children, defaultOpen = false }: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

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
        <IconButton
          component="span"
          size="small"
          tabIndex={-1}
          sx={{
            width: 28,
            height: 28,
            color: "text.secondary",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform var(--motion-base) var(--motion-easing)",
          }}
        >
          <Icon name="chevron" size={15} />
        </IconButton>
      </button>

      <Collapse in={open} timeout={200} easing="var(--motion-easing)" unmountOnExit>
        <div id={contentId} className="space-y-4 pt-4">
          {children}
        </div>
      </Collapse>
    </section>
  );
}
