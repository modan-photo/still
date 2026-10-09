import { ThumbnailImage } from './ThumbnailImage';
import { useTranslation } from '../i18n/messages';
type ThumbnailItemProps = {
  thumbPath: string;
  thumbRevision?: number;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  photoId?: string;
};

export function ThumbnailItem({
  label,
  selected,
  onSelect,
  onKeyDown,
  photoId,
  thumbPath,
  thumbRevision,
}: ThumbnailItemProps) {
  const t = useTranslation();
  return (
    <button
      type="button"
      className={`group relative grid h-14 w-14 place-items-center overflow-hidden rounded-md border-2 bg-app-elevated text-secondary outline-none transition-[transform,box-shadow,border-color,color] duration-fast ease-app hover:scale-[1.04] hover:text-primary hover:shadow-elev2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:h-[72px] md:w-[72px] ${selected ? 'border-accent text-primary shadow-[0_0_12px_color-mix(in_srgb,var(--color-accent)_32%,transparent)]' : 'border-transparent'}`}
      aria-label={t('selectPhotoNamed', { name: label })}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      data-film-photo-id={photoId}
    >
      <ThumbnailImage thumbPath={thumbPath} revision={thumbRevision} label={label} />
    </button>
  );
}
