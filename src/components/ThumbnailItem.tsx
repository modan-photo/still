import { ThumbnailImage } from './ThumbnailImage';
type ThumbnailItemProps = {
  thumbPath: string;
  thumbRevision?: number;
  label: string;
  selected: boolean;
  onSelect: () => void;
};

export function ThumbnailItem({ label, selected, onSelect, thumbPath, thumbRevision }: ThumbnailItemProps) {
  return (
    <button
      type="button"
      className={`group relative grid h-14 w-14 place-items-center overflow-hidden rounded-md border-2 bg-app-elevated text-secondary outline-none transition-[transform,box-shadow,border-color,color] duration-fast ease-app hover:scale-[1.04] hover:text-primary hover:shadow-elev2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:h-[72px] md:w-[72px] ${selected ? "border-accent text-primary shadow-[0_0_12px_color-mix(in_srgb,var(--color-accent)_32%,transparent)]" : "border-transparent"}`}
      aria-label={`Select photo ${label}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <ThumbnailImage thumbPath={thumbPath} revision={thumbRevision} label={label} />
    </button>
  );
}
