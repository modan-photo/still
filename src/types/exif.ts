export interface ExifData {
  camera: CameraInfo;
  exposure: ExposureInfo;
  time: TimeInfo;
  image: ExifImageInfo;
  location: LocationInfo | null;
  other: OtherInfo;
}

export interface CameraInfo {
  make: string | null;
  model: string | null;
  lens: string | null;
  serial: string | null;
}

export interface ExposureInfo {
  focalLength: string | null;
  aperture: string | null;
  shutterSpeed: string | null;
  iso: number | null;
  exposureBias: string | null;
}

export interface TimeInfo {
  datetimeOriginal: string | null;
  datetimeModified: string | null;
}

export interface ExifImageInfo {
  width: number | null;
  height: number | null;
  orientation: string | null;
  colorSpace: string | null;
  dpi: string | null;
}

export interface LocationInfo {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
}

export interface OtherInfo {
  software: string | null;
  artist: string | null;
  copyright: string | null;
  keywords: string | null;
}

export interface ExifEdits {
  artist?: string | null;
  copyright?: string | null;
  keywords?: string | null;
}
