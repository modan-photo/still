import { useEffect, useState } from "react";
import { cacheAssetUrl } from "../services/tauri/image";
import { Icon } from "./Icons";

type ThumbnailImageProps = {
  thumbPath: string;
  label: string;
  revision?: number;
};

export function ThumbnailImage({ thumbPath, label, revision = 0 }: ThumbnailImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [revision, thumbPath]);

  if (failed) {
    return (
      <span
        className="grid h-full w-full place-items-center border border-subtle bg-app-base text-secondary"
        title={`${label} is unavailable`}
        aria-hidden="true"
      >
        <Icon name="image-off" size={22} />
      </span>
    );
  }

  return (
    <img
      src={cacheAssetUrl(thumbPath)}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-full w-full object-contain"
      onError={() => setFailed(true)}
    />
  );
}
