export interface ImageMeta {
  path: string;
  width: number;
  height: number;
  format: string;
  orientation: number;
  /** Rust returns cache paths, not browser URLs. */
  previewUrl: string | null;
  thumbUrl: string;
}
export type CacheKind = 'thumbnail' | 'preview';
export interface CachedImage { path: string; width: number; height: number; cacheHit: boolean }
export interface TaskProgress {
  taskId: string;
  operation: string;
  stage: string;
  progress: number;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  error: string | null;
}
