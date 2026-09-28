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

export interface ExportFailure { sourcePath: string; reason: string }
export interface ExportSuccess { sourcePath: string; outputPath: string }
export interface BatchExportReport {
  succeeded: number;
  failed: number;
  skipped: number;
  outputDirectory: string;
  successes: ExportSuccess[];
  failures: ExportFailure[];
}

export interface ExportRequest { specs: RenderSpec[]; options: ExportOptions }
