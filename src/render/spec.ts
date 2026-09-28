import type { RenderSpec } from '../types/renderSpec';

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
