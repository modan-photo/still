import type { RenderSpec } from '../types/renderSpec';

export type SyncModule = 'border' | 'watermark' | 'adjustments';

/**
 * Copies every render setting while keeping the target photo as the source.
 * This is the frontend counterpart of RenderSpec::apply_settings_from in Rust.
 */
export function applyRenderSettings(target: RenderSpec, template: RenderSpec): RenderSpec {
  const { source: _templateSource, ...settings } = structuredClone(template);
  return {
    ...settings,
    source: structuredClone(target.source),
  };
}

/** Copies only the selected modules; an absent source module clears it on the target. */
export function syncRenderSettings(
  target: RenderSpec,
  template: RenderSpec,
  modules: readonly SyncModule[],
): RenderSpec {
  const next = structuredClone(target);
  for (const module of modules) {
    const value = structuredClone(template[module]);
    if (value === undefined) delete next[module];
    else Object.assign(next, { [module]: value });
  }
  return next;
}
