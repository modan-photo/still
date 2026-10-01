# Stateless workspace implementation and acceptance

The workspace exists only in the current window's memory. A new process starts
with no photos, selections, collage draft content, or undo snapshot. Imported
photos receive independent clones of `DEFAULT_RENDER_SPEC`, with their own source
metadata and `dirty: false`. Border and watermark are absent; crop is disabled,
rotation is zero, and flips are disabled.

Importing an already loaded path creates another clean photo with a distinct ID
and preserves the previously edited photo. Duplicate paths within a single import
request are decoded and added once. Existing path IDs remain compatible with
consumers; an ID collision uses the platform's `crypto.randomUUID()`.

## Changed files

| Status | File | Purpose |
| --- | --- | --- |
| Added | `src/stores/createSessionStore.ts` | Retain the store in development HMR memory and refresh action implementations. |
| Added | `src/services/workspaceInitialization.ts` | Run startup cleanup and migrations before mounting the editor. |
| Added | `src/services/workspaceShutdown.ts` | Stop the editor, reset session memory, and destroy desktop windows with a 500 ms fallback. |
| Added | `src/services/exportCompletion.ts` | Match exported snapshots to photo IDs when multiple photos share a source path. |
| Added | `src-tauri/src/commands/session.rs` | Delete only four allowlisted legacy session files; test idempotence and file boundaries. |
| Added | `src-tauri/src/commands/preferences.rs` | Remove known session fields from existing preference/UI files and mark version 2. |
| Added | `tests/uiStoreSession.test.ts` | Check default inspector state, no session persistence, and retained font preference. |
| Added | `tests/workspaceInitialization.test.ts` | Check startup ordering, idempotence, resource retention, and failure handling. |
| Added | `tests/workspaceShutdown.test.ts` | Check memory reset, absence of storage writes, timeout, repeated close requests, and mobile background behavior. |
| Added | `tests/sessionStoreHotReload.test.ts` | Check retained state, refreshed actions, subscriptions, and independent new stores. |
| Added | `tests/exportCompletion.test.ts` | Check export identity, concurrent edits, and partial duplicate-path results. |
| Added | `docs/STATELESS-WORKSPACE-ACCEPTANCE.md` | Implementation handoff and manual acceptance checklist. |
| Modified | `src/types/renderSpec.ts` | Define `DEFAULT_RENDER_SPEC` using existing crop and rotation defaults. |
| Modified | `src/stores/projectStore.ts` | Initialize fresh specs, remove transform persistence, add memory-only reset, and preserve HMR memory. |
| Modified | `src/stores/uiStore.ts` | Remove persisted inspector tab restoration/writes and add memory-only reset and HMR support. |
| Modified | `src/stores/undoStore.ts` | Retain undo state and timer references in HMR memory. |
| Modified | `src/components/FrameControls.tsx` | Remove history of preset selection while retaining user preset loading and saving. |
| Modified | `src/main.tsx` | Gate mounting on initialization, install the close handler, and reuse the React root during HMR. |
| Modified | `src/App.tsx` | Delegate export completion to identity-aware clean-state marking. |
| Modified | `src/types/export.ts` | Carry optional workspace photo IDs in frontend export requests. |
| Modified | `src/components/ExportDialog.tsx` | Capture workspace photo IDs with export snapshots; retain preference writes. |
| Modified | `src-tauri/src/commands/mod.rs` | Register new modules and remove the retired UI module. |
| Modified | `src-tauri/src/lib.rs` | Register cleanup/migration commands and remove UI session load/save commands. |
| Modified | `src-tauri/capabilities/default.json` | Allow explicit window destruction. |
| Modified | `tests/cropStorage.test.ts` | Replace persistence expectations with default import and memory-only behavior checks. |
| Modified | `tests/cropBatch.test.ts` | Expect an explicit disabled default crop on new imports. |
| Deleted | `src/services/cropStorage.ts` | Retire per-photo crop/rotation storage. |
| Deleted | `src/services/tauri/uiState.ts` | Retire persisted session UI loading/saving. |
| Deleted | `src-tauri/src/commands/ui.rs` | Retire backend UI session loading/saving. |
| Deleted | `tests/uiState.test.ts` | Remove tests that required history restoration. |

## Architecture connections

- `useImageImport` retains its picker, folder, drag/drop, and metadata pipeline.
  `projectStore.addPhotos` is the shared point for fresh specification creation.
- The canonical border inspector ID remains `frame`; `border` was a legacy alias.
- Startup runs `cleanup_legacy_session_files`, then
  `migrate_preferences_if_needed`, then cleans WebView legacy records, before the
  React editor mounts. Errors are logged and never restore session state.
- Rust cleanup only targets `session.json`, `workspace.json`, `photos.json`, and
  `last-spec.json` directly inside the resolved application data directory. It
  never reads photo paths from their contents or recursively removes directories.
- Migration changes existing `preferences.json` and `ui-state.json` only. It
  removes known session fields, retains other values and their structure, and
  adds `version: 2`. A version-2 file with reintroduced legacy fields is cleaned
  again. Missing files are not created; clean files are not rewritten.
- Malformed UI state is replaced with `{ "version": 2 }`. Malformed preferences
  are left intact and logged to avoid losing user resources. Migration does not
  follow preference file symlinks.
- WebView migration cleans `still.ui-state` and removes only `still.crop.v1:`
  records. Theme, system-font preference, recent export folders, and presets stay
  in their existing storage locations.
- Desktop shutdown calls `preventDefault()`, unmounts the editor to stop pending
  import commits, clears undo/project/UI memory, and awaits `destroy()`. A 500 ms
  fallback clears memory and requests destruction if teardown stalls or the first
  destruction fails. It performs no file persistence or cache invalidation.
- Project reset does not use the existing user-facing `clear()` action, which
  invalidates caches. User-facing removal behavior remains available separately.
- Export requests retain frontend photo IDs so successful export completion does
  not clear another photo sharing the same path. Later edits stay dirty. When
  exports for a repeated path only partially succeed, the backend's path-only
  report cannot identify the successful snapshot; dirty state is retained
  conservatively. Backend export processing and report formats are unchanged.
- Android/iOS do not register the desktop shutdown handler. No background,
  visibility, pause, or page-hide handler clears the workspace. Process termination
  naturally discards its memory.
- HMR retains stores, timer references, startup completion, and the React root in
  Vite `hot.data`. Disposal removes native listeners without resetting the session.
  A complete page reload, native rebuild, or process restart starts a fresh workspace.

No new dependencies were introduced. Rendering/processing modules for borders,
watermarks, EXIF, collage, and transforms were not changed. Frame/watermark preset
formats and their persistence services were not changed. Original photo files are
not deletion targets. Thumbnail caches are retained during startup and shutdown.

## Existing preference capabilities

The current application persists theme via `still-theme`, system-font consent via
`still.use-system-fonts`, and recent export folders via
`still.export.recent-directories`. User presets retain their existing desktop JSON
files and browser fallbacks.

There was no active `preferences.json` preference service in this checkout.
Migration preserves fields such as language, shortcut configuration, default export
directory, and window geometry when present; this change does not add missing UI
settings or a window geometry persistence feature. Export directory selection
continues to use the existing recent-directory behavior.

## Automated validation

- Frontend: 127 tests across 14 files passed.
- Rust commands: 22 tests passed, including 3 cleanup and 4 migration tests.
- TypeScript checking, Rust offline checking, and the production Vite build passed.
- Diff whitespace checking passed.
- Vite reports a bundle-size warning; the build succeeds.

Automated tests use synthetic fixtures in temporary directories. They do not
migrate the real user profile. Native window shutdown, live Vite HMR, and Android
device lifecycle behavior require the manual checks below.

## Manual acceptance

Use disposable copies of photos for testing. On Windows the configured identifier
resolves to `%APPDATA%/dev.still.app`; inspect the actual application data directory
on other platforms. Finish startup migration before observing close-time writes.

1. Start the application. Expect an empty canvas, the `frame` tab, an expanded
   inspector, and a closed grid.
2. Import three photos. Expect no border or watermark, disabled full-image crop,
   zero rotation, no flips, and clean state on every photo.
3. Apply a border, watermark, crop, and rotation to A; import a different B.
   Expect B to use defaults while A retains its edits.
4. Import A's path again while edited A remains loaded. Expect another photo with
   defaults and a distinct ID; expect edited A to be unchanged. Edit and export
   only the new copy, and verify only its dirty indicator clears on success.
5. Give three photos different edits, then close without exporting. Expect no
   discard-warning dialog. Restart and expect an empty workspace.
6. Reimport those photos after restart. Expect defaults without restored edits.
7. Create a user frame preset and watermark preset. Restart and expect both user
   resources to remain available, without automatic application to new photos.
8. Select dark theme and export to a new folder. Restart and expect dark theme
   and the retained recent export directory. Verify existing default-directory
   settings if the environment exposes them.
9. Place synthetic legacy `session.json`, `workspace.json`, `photos.json`, and
   `last-spec.json` in the application data directory. Start the app and expect
   only those files to be deleted. Photo paths inside them must not be deleted.
10. Place valid legacy preferences containing `lastFramePresetId`,
    `lastWatermarkPresetId`, `lastUsedSpec`, `lastAppliedSpec`, `photoList`,
    `lastImportPath`, and `activeRightTab`, alongside theme/export/window values.
    Start and expect session fields removed, resource values preserved, and
    `version: 2` added. Restart and check that the clean file is not rewritten.
11. Repeat with legacy `ui-state.json` and `still.ui-state` WebView data. Expect
    obsolete fields removed. Repeat with malformed UI JSON; startup must succeed
    with default UI state. Verify old `still.crop.v1:` records are removed.
12. After startup, observe native requests and WebView storage writes while editing
    photos, switching tabs, and closing. Expect no session saves, preference
    writes from shutdown, or shutdown-triggered cache invalidation. Explicit user
    resource changes and exports remain legitimate writes.
13. Force-kill the process after editing. Restart and expect an empty workspace.
    Previously exported files and original photos must remain intact.
14. During Vite development, edit a component and then a store module. Expect
    imported photos, specs, selections, and an unexpired undo snapshot to survive
    HMR. The updated store action code must take effect. A full page reload or
    native process rebuild starts a fresh workspace.
15. On Android, import/edit, press Home, then return. Expect the current state.
    End the application process and reopen; expect an empty workspace. Check
    recent-task removal on the target device because process termination is
    controlled by Android.
16. Open independent windows/processes where supported. Edit one and expect the
    other workspace to remain independent. Close one and expect the other to keep
    its session.

Inspect originals and user preset files before and after migration/shutdown to
confirm their contents are unchanged. Confirm that any existing thumbnail cache
remains present after ordinary application close.
