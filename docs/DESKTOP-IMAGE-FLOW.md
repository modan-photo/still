# Desktop image flow

Import uses plugin-dialog multi-selection or Tauri webview drag/drop paths.
Two images load concurrently; successful results are committed in selection
order. Failures are reported while other images continue. Cancelling an active
import stops the remainder of that batch after the current pair settles.

The filmstrip is virtualized and uses 512px cache paths. Selection is held by
the project store. Single view requests the 2048px preview cache and draws it
on Canvas; `data-preview-long-edge` exposes the decoded preview size for QA.
Grid view uses lazy-loaded thumbnails. Ctrl/Cmd+O imports, arrow keys select
photos when focus is on the canvas, and Tab toggles the inspector.

The progress strip is below the title bar and uses command progress events.
Cancel targets currently active tasks. Export opens a native save dialog and
exports the captured selected spec; an unedited spec preserves source bytes.
Existing destination files are rejected by the Rust layer.

Desktop manual acceptance still required:

- Import 50 real JPEGs, scroll the filmstrip and switch photos.
- Inspect the canvas preview long edge (at most 2048).
- Repeat import and verify cache reuse and no duplicate project photos.
- Export a 40MP image, cancel an in-flight task and inspect partial-file cleanup.
- Measure first-load latency, batch time, and peak memory on target hardware.

Android has no generated native project in this repository. The dialog API is
wired, but Android content URIs need native copying/resolution before the Rust
filesystem loader can open them. Share-intent reception remains unimplemented.
Browser-only preview shows the UI; native import requires the desktop app.
