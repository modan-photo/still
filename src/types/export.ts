import type { OutputFormat, RenderSpec } from './renderSpec';

export type ResizeMode = 'original' | 'longEdge' | 'percent' | 'exact';
export type NamingMode = 'originalSuffix' | 'prefixSequence' | 'template';
export type ConflictPolicy = 'skip' | 'overwrite' | 'rename';

export interface ExportOptions {
  format: OutputFormat;
  quality: number;
  outputDirectory: string;
  size: {
    mode: ResizeMode;
    longEdge: number | null;
    percent: number | null;
    width: number | null;
    height: number | null;
    lockAspect: boolean;
  };
  naming: {
    mode: NamingMode;
    suffix: string;
    prefix: string;
    template: string;
    startNumber: number;
  };
  conflict: ConflictPolicy;
  preserveExif: boolean;
  preserveIcc: boolean;
}

export interface ExportItem {
  itemId: string;
  sequenceIndex: number;
  spec: RenderSpec;
}
export interface PhotoExportItem extends ExportItem {
  photoId: string;
}
export interface ExportItemResult {
  itemId: string;
  sourcePath: string;
  outputPath: string | null;
  status: 'success' | 'failed' | 'skipped' | 'cancelled';
  code: string | null;
  message: string | null;
}
export interface BatchExportReport {
  succeeded: number;
  failed: number;
  skipped: number;
  cancelled: number;
  cancellationRequested: boolean;
  outputDirectory: string;
  results: ExportItemResult[];
}

export type ExportMode = 'photos' | 'collage';
export interface PhotoExportRequest {
  exportMode: 'photos';
  items: PhotoExportItem[];
  options: ExportOptions;
}
export interface CollageExportRequest {
  exportMode: 'collage';
  outputPath: string;
  format: OutputFormat;
  quality: number;
}
export type ExportRequest = PhotoExportRequest | CollageExportRequest;
