type PlaceholderProps = {
  label: string;
  description?: string;
  className?: string;
};

/** Visible boundary for a feature that will be connected in a later step. */
export function Placeholder({ label, description, className = "" }: PlaceholderProps) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center gap-2 text-secondary ${className}`}
      data-placeholder={label}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
      <span className="text-xs font-medium">{label}</span>
      {description ? <span className="text-xs opacity-70">{description}</span> : null}
    </div>
  );
}
