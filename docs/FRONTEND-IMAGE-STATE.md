# Frontend image state

`src/types/renderSpec.ts` mirrors the Rust v1 contract, including camelCase
anchors and optional effect fields. Types are currently maintained together;
Rust-to-TypeScript generation is not yet configured.

`loadImage(path)` returns metadata and cache paths. Pass successful results to
`useProjectStore.getState().addPhotos(...)`. The canonical path identifies a
photo, repeated imports preserve edits, and the first photo is selected when
the project is empty. No decoded images or base64 belong in stores.

`useRenderSpec()` exposes the selected spec, dirty flag, and an update function
bound to that photo. Updates replace complete effect objects. For export,
capture the spec before invoking `exportImage`; after success call
`markClean(id, capturedSpec)`. New edits during export remain dirty.

`useImagePreview(path)` loads the preview cache through `thumb_get` and exposes
a decoded HTML image for Canvas drawImage. Cleanup releases its image source
and ignores stale results. Pending cache generation can finish after unmount;
it does not update the disposed component. Asset URLs require Tauri.

Services register a progress listener before invoking work and dispose it on
settlement. Task IDs default to random UUIDs; supply a fresh ID to cancel via
`cancelTask(id)`. `useTaskStore` retains active tasks and at most 100 terminal
records. Calls outside Tauri reject with a normalized `unsupported` error.

UI store is ready for inspector/view/theme state. Existing shell state, import
controls, Canvas, and the global progress bar will be wired in the next step.

Verification: `node --experimental-strip-types --test tests/stores.test.mjs`
(Node 22.12+), plus TypeScript checking and the Vite production build.
