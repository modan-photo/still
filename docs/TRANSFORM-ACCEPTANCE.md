# Transform delivery and acceptance

This document covers the Crop-to-Transform change and supersedes the rotation limitations in `CROP-ACCEPTANCE.md`. UI text and new source comments use English.

## Delivered behavior

- The Transform tab occupies the former Crop position between Frame and Stamp. Legacy persisted `crop` selections migrate to `transform` and are written back.
- Clockwise quarter turns, counterclockwise quarter turns, half turns, and independent horizontal/vertical flips share each photo's render specification.
- Rotation and flips precede normalized cropping in both the single-photo preview and Rust export. EXIF orientation is normalized during decoding. The existing adjustments stage remains between crop and border; border and watermark internals are unchanged.
- Quarter turns exchange dimensions and rearrange pixels without resampling. Identity transforms skip the export rotation stage.
- Crop selection follows the transformed image. A quarter turn exchanges fixed aspect labels, such as `16:9` to `9:16`, so subsequent handle edits preserve the selected region's proportions.
- Existing reflection reverses the crop's display-space rotation delta when exactly one flip is enabled. This preserves the same source region while the stored angle follows the specified accumulation rule. Rendering always applies rotation before flips.
- Rotation, flipping, and reset redraw without geometry transitions. Crop overlay opacity and existing tab transitions remain independent.
- Reset restores both default rotation and disabled Original crop. It has only a button entry point.
- Batch application centers a maximal crop for every photo using its final dimensions. Rotation is preserved by default; the unchecked-by-default Include rotation option copies the source rotation when selected. The source photo is included in the count and centering.
- Per-photo crop and rotation persist together using the existing photo identity and storage prefix. Old crop-only records and specs without rotation remain valid.
- Mobile rotation buttons are 48 by 48 pixels and wrap when needed; desktop buttons are 40 by 40 pixels. Mobile ratio and action controls have 48-pixel heights. The batch dialog uses 16-pixel margins on compact screens.

## Changed files

Paths below are relative to the repository root. The former Crop tab is replaced by Transform; Git currently shows this as a deletion and a new file.

| Status | File | Purpose |
| --- | --- | --- |
| Modified | `src/layout/rightPanelTabs.ts` | Canonical Transform metadata and existing rotation icon |
| Modified | `src/layout/RightPanelContent.tsx` | Transform tab content mapping and accessible panel identity |
| Replaced | `src/layout/RightPanel/tabs/CropTab.tsx` -> `src/layout/RightPanel/tabs/TransformTab.tsx` | Rotation, flips, ratio, reset, batch dialog, mobile controls |
| Added | `src/components/CropRatioSelect.tsx` | Ratio dropdown; caller retains crop computation and edit state |
| Modified | `src/components/Icons.tsx` | Horizontal and vertical flip icons |
| Modified | `src/components/FrameControls.tsx` | Remove the existing global reset shortcut |
| Modified | `src/components/CropOverlay.tsx` | Rotated geometry, instantaneous frame changes, stale-drag cancellation |
| Modified | `src/hooks/useCropEdit.tsx` | Atomic rotation/crop edits, session synchronization, reset and tab mutual exclusion |
| Modified | `src/layout/MainCanvas.tsx` | Rotation before crop, rotated overlay dimensions, layout-effect redraw and stale asynchronous draw protection |
| Added | `src/render/rotation.ts` | Rotation geometry, crop transforms, preview rendering, batch eligibility |
| Modified | `src/render/crop.ts` | Accept rotated canvas sources for cropping |
| Modified | `src/types/renderSpec.ts` | Optional RotationSpec and post-rotation crop-coordinate contract |
| Modified | `src/stores/projectStore.ts` | Batch transform application and coherent per-photo persistence |
| Modified | `src/services/cropStorage.ts` | Backward-compatible crop/rotation records and rotated ratio validation |
| Modified | `src/services/tauri/uiState.ts` | Browser fallback migration and canonical tab serialization |
| Modified | `src-tauri/src/commands/ui.rs` | Native UI-state migration and compatibility tests |
| Modified | `src-tauri/src/render/spec.rs` | Rust rotation model, defaults, allowed-angle validation and contract tests |
| Added | `src-tauri/src/render/rotation.rs` | Exact imageops pixel rotation/flip operations and tests |
| Modified | `src-tauri/src/render/mod.rs` | Register the rotation module |
| Modified | `src-tauri/src/render/pipeline.rs` | EXIF-normalized rotation before crop, identity path and export integration tests |
| Added | `tests/rotation.test.ts` | Dimensions, contain transforms and crop-coordinate combinations |
| Added | `tests/transformEdit.test.ts` | Repeated edits, reflected coordinate synchronization and disabled cropping |
| Added | `tests/transformBatch.test.ts` | Rotation inclusion, final dimensions, independent state and eligibility |
| Added | `tests/uiState.test.ts` | Canonical tab identity, migration and fallback compatibility |
| Modified | `tests/cropGeometry.test.ts` | Rotated-source crop geometry |
| Modified | `tests/cropStorage.test.ts` | Legacy records, rotation persistence, corruption and repeated/batch restore |
| Modified | `tests/renderSpec.test.ts` | Optional rotation contract and compatibility |
| Added | `docs/TRANSFORM-ACCEPTANCE.md` | Delivery inventory and manual acceptance guide |

## Architecture integration

1. `rightPanelTabs.ts` remains the tab metadata/type source. The existing UI store inherits the new id. Migration code alone accepts the old id; normal UI state uses `transform`.
2. `TransformTab` uses `useRenderSpec`, the existing photo store and `CropEditProvider`. Each click reads the latest photo state and publishes rotation and crop in one store update, while transforming the edit baseline and draft consistently.
3. `MainCanvas` rotates the EXIF-normalized preview source before cropping. Overlay source dimensions and pixel geometry use the same rotated coordinate space. Filmstrip/grid thumbnails retain their existing source rendering.
4. Rust deserializes the optional rotation on the existing export spec and validates it. The existing export command continues through `apply_render_spec`; no new command or dependency is required.
5. The photo-store subscriber saves crop and rotation together. The existing `still.crop.v1:` identity keys include source path, dimensions and hash; the optional field extends version-one records.
6. The project had custom SVG icons and no existing `CropRatioSelect`. The implementation uses that icon system and adds a dropdown without a new dependency. Other tab metadata and border/watermark/EXIF/collage internal modules remain unchanged.

## Verification recorded

| Check | Result |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed |
| `node node_modules/vitest/vitest.mjs run` | 106 tests passed across 10 files |
| `cargo test --manifest-path src-tauri/Cargo.toml --offline --lib` | 57 passed; 4 existing release-performance tests ignored |
| `node node_modules/vite/bin/vite.js build` | Passed; existing large-chunk warning remains |
| `git diff --check` | Passed; Git reports working-copy LF/CRLF conversion notices |
| Browser: canvas and size wrapper computed styles | No transform transition or animation; rotation redraw exchanges dimensions immediately |
| Browser: crop overlay and repeated rotation | Shared rotated dimensions; opacity-only overlay fade; stale pointer draft discarded after transform |
| Browser: responsive Transform fixture | 280px wraps, 320/375px have no horizontal overflow; rotation controls 48x48; 1024px controls 40x40 |
| Browser: compact batch dialog | 16px margins at 320px; 48px action height; no internal horizontal overflow |
| Browser: light/dark flip state and canvas entry | Accent matches theme; Adjust on canvas closes the inspector; mobile fixture has no warning/error logs |

Browser checks used temporary fixtures with real production Transform controls and edit providers. The mobile fixture reproduced the inspector's viewport/padding/scroll constraints; it was not a physical-device or packaged-native application test. Temporary fixture files, server and browser tab were removed after verification. Rust checks exercise pixel coordinates, EXIF normalization, crop, border and PNG encode/reload. Packaged export interaction and third-party viewing remain manual checks below.

## Manual acceptance procedure

Use an asymmetric landscape image with clearly different corners, a portrait image, and a JPEG carrying EXIF orientation 6. Import at least two photos. Keep originals unchanged and choose fresh export filenames. Run the normal Tauri development application with `npm run desktop:dev` (or the project's equivalent installed package-manager command).

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Open Transform with Original selected; click right, left and half-turn controls. | Preview changes immediately; quarter turns exchange width/height; cropping remains disabled and no overlay appears. |
| 2 | Reset; click right four times, then reset and rapidly click right ten times. | Four turns restore original direction; ten turns finish at 180 degrees. Every click is a discrete update. |
| 3 | Toggle each flip twice, then combine both with 90/180/270-degree angles. | Each flip activates/deactivates independently; preview agrees with rotation-then-flip rendering. |
| 4 | Select 1:1, move its frame off center and rotate right. | Frame follows the same source region and remains square. |
| 5 | Select Free and set `{x:.25,y:0,width:.5,height:1}` on a 4:3 image; rotate right without flips. | Rect becomes `{x:0,y:.25,width:1,height:.5}`. |
| 6 | Rotate first, then select 16:9; drag frame and handles. Also rotate a pre-existing 16:9 crop. | New crop uses rotated dimensions. A pre-existing crop follows the image and its aspect label becomes 9:16 after a quarter turn. |
| 7 | Start a crop drag, trigger an external transform or photo change before pointer release. | The stale drag is discarded; releasing does not overwrite the new geometry. |
| 8 | Inspect canvas, its image-size wrapper and crop frame in DevTools; rapidly rotate five times. | No transform transition or animation applies to these elements. Overlay opacity fade and ordinary tab changes remain available. |
| 9 | Apply 1:1 from a rotated/flipped source to all photos with Include rotation unchecked, then repeat with it checked. | Default preserves each photo's rotation. Checked mode copies source angle and flips. Every photo, including source, gets a centered maximal crop and becomes dirty; toast count includes all photos. |
| 10 | Test Free, Original with default rotation, and a project containing only one photo. Open a valid batch dialog several times. | Batch is disabled with the corresponding explanation. Include rotation starts unchecked on every open. |
| 11 | Rotate, flip and crop; click Reset. Press Ctrl/Cmd+Shift+R after making a new edit. | Button restores defaults, removes overlay and shows Transform reset. Shortcut does not reset photo/frame state; a browser shell may handle its own reload shortcut. |
| 12 | Switch between photos, restart, and reimport unchanged sources. Load an old spec without rotation and an old crop-only storage record. | Each photo keeps independent state; unchanged identity restores crop and rotation. Legacy inputs load normally. |
| 13 | With the application closed, set `activeRightTab` to `crop` in its existing app-data `ui-state.json`, preserving other fields; reopen. | Transform opens and the file is rewritten with `transform`, preserving the frame preset. Back up the file before editing. |
| 14 | Enter Transform from collage or grid mode. Inspect filmstrip/grid thumbnails after rotating the single-photo preview. | Existing mutual exclusion restores single-photo editing; thumbnails retain source orientation. |
| 15 | Rotate and crop the EXIF-oriented JPEG, add border and watermark, and export PNG to a fresh filename. Open it in an independent image viewer. | Export agrees with preview: EXIF normalization, user rotation/flips, crop, border, watermark. Dimensions and corner content show baked pixel rotation rather than reliance on a new EXIF flag. |
| 16 | Test light/dark themes at 320/375px and a narrower 280px viewport; scroll the mobile inspector and open the batch dialog. Repeat on a physical device when available. | Rotation touch targets are at least 48x48; narrow rows wrap; controls are reachable by vertical scrolling; no horizontal overflow; active flips use theme accent. Adjust on canvas closes the sheet. |
| 17 | Repeat at desktop/tablet widths and inspect console during real import/edit/export. | Desktop rotation buttons are 40x40. No new application exceptions or MUI warnings appear. |

The complete native workflow, physical-device touch behavior and independent-viewer export check are not marked as manually passed by this delivery document.
