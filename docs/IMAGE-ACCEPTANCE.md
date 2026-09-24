# Image infrastructure acceptance — 2026-09-24

Automated checks on Windows:

- 50 generated JPEG files (2304×768) produce 50 thumbnails. Every repeat
  request reports a cache hit; the cache contains no extra thumbnail files.
- Preview generation produces 2048×683 from the same source dimensions.
- The cancellable writer rejects further bytes after cancellation and its
  temporary-file guard removes the partial output.
- Existing export tests cover byte-preserving copies, no-overwrite behavior,
  and JPEG/PNG/WebP encoding.
- TypeScript checking, state regression tests and the production build pass.

The synthetic batch test is a correctness check in a debug build, not a
performance benchmark. It does not establish the 800ms first-preview target,
100-photo/3s target, memory ceiling, or 60fps scrolling.

Fixed during inspection: a cancelled cache request could be reported as a
successful cache hit if another request had already published the destination.
Cancellation now takes precedence in that error-recovery path.

Native desktop interaction has not been exercised by this automated pass.
The available UI-control surface does not support native desktop windows.
Real drag/drop, asset-protocol rendering, cancel-button interaction and
scrolling therefore still require desktop acceptance. Android URI resolution
and share-intent reception remain pending as documented in DESKTOP-IMAGE-FLOW.

The existing staged UI changes were preserved. This pass changes only the
image I/O regression tests, cache cancellation recovery and this report.
