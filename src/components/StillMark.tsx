type StillMarkProps = {
  size?: number;
};

export function StillMark({ size = 24 }: StillMarkProps) {
  return (
    <svg className="still-mark" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 3h16v10l-4-3V7H9l6.6 5H10L4 7.5V3Z" fill="currentColor" />
      <path d="M20 21H4V11l4 3v3h7l-6.6-5H14l6 4.5V21Z" fill="currentColor" />
    </svg>
  );
}
