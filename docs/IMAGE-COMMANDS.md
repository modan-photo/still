# Stage 0 image commands

All slow commands take a caller-generated, unique `taskId` (for example
`crypto.randomUUID()`). Subscribe to `task://progress` before invoking them.
They execute CPU/file work on a blocking worker; errors use `{ code, message }`.

| Command | Arguments | Result |
| --- | --- | --- |
| `image_load` | `taskId, path` | oriented dimensions, format, original EXIF orientation, canonical path, thumbUrl, previewUrl |
| `thumb_get` | `taskId, path, kind: 'thumbnail' \| 'preview'` | path, width, height, cacheHit |
| `image_export` | `taskId, spec, outPath` | void |
| `task_cancel` | `taskId` | void |
| `task_list` | none | active task snapshots |
| `image_apply_border`, `image_apply_watermark` | `spec` | `{ implemented: false, spec }` |

`thumbUrl` currently contains a filesystem path. Convert it (and the path from
`thumb_get`) with Tauri `convertFileSrc` before assigning an image source.
`previewUrl` is null on load: request `thumb_get` with `kind: 'preview'` upon
selection. Only the two application-cache directories are asset-protocol scoped.

Progress payload: `taskId`, `operation`, `stage`, `progress` (0–100), `status`
(`running`, `completed`, `cancelled`, `failed`), and nullable `error` message.
Progress is phase-based, not an estimate of elapsed time or decoded scanlines.
Terminal events are emitted before removing tasks from the active registry.

An empty editing spec means version/source with no effects or output. This path
copies bytes unchanged, preserving metadata. With output configured, export
normalizes EXIF orientation and encodes JPEG/PNG/lossless WebP. A border also
activates the render pipeline; when output is omitted its format is inferred
from the destination extension. Existing paths are never overwritten.
Watermark and adjustment effects remain unsupported and are rejected rather
than silently discarded.

Cancellation is cooperative: copy checks each 256 KiB chunk; encoders check on
writes and before publication. A codec's internal decoding/computation cannot
be forcibly interrupted and may finish its current computation first.
Publication uses a same-directory hard link to prevent an overwrite race;
filesystems without hard-link support return an error and clean the temporary
file. JPEG quality is 1–100; PNG and WebP are lossless.

UI integration, Android content URI handling and real-image performance
benchmarks are subsequent steps.
