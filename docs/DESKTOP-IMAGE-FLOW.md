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
Cancel targets currently active tasks. Export opens a batch-options dialog for
format, sizing, naming, destination, conflict handling, and metadata retention.
The dialog closes before work starts; a single global task runs on a dedicated
Rayon pool capped at four workers and reports progress after every photo.

Each encoded image is written to a sibling temporary file and is published only
after encoding and metadata insertion complete. Cancellation keeps published
files, skips remaining work, and removes in-flight partial files. JPEG, PNG, and
WebP exports retain EXIF (with Orientation normalized to 1) and the source ICC
profile. Completion reports successes and failures and can open the desktop
output folder through plugin-opener.

Desktop manual acceptance still required:

- Import 50 real JPEGs, scroll the filmstrip and switch photos.
- Inspect the canvas preview long edge (at most 2048).
- Repeat import and verify cache reuse and no duplicate project photos.
- Export 100 framed/watermarked photos and verify smooth progress and responsive UI.
- Cancel an in-flight batch and verify completed files remain with no partial files.
- Validate capture time, camera model, Orientation=1, and AdobeRGB ICC after export.
- Measure first-load latency, batch time, and peak memory on target hardware.

Android has no generated native project in this repository. The dialog API is
wired, but Android content URIs need native copying/resolution before the Rust
filesystem loader can open them. Share-intent reception remains unimplemented.
Browser-only preview shows the UI; native import requires the desktop app.
