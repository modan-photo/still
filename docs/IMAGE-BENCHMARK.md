# Repeatable image benchmark

Run from the repository root using an existing output directory:

```powershell
cargo run --release --manifest-path src-tauri/Cargo.toml --example image_bench -- D:/photos/test-set D:/bench-results
```

The input scan is non-recursive. Inputs are read only. Each execution creates a
unique child directory for caches, JPEG exports and `report.json`; outputs are
retained for inspection. No existing directory or file is cleared or overwritten.
Use a dedicated collection of 100 JPEGs for batch timing and include an actual
40MP JPEG to assess the preview target. Run at least three times and keep all
reports; record hardware, storage and competing workload alongside the results.

Smoke check, requiring no personal photos:

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --example image_bench -- --smoke D:/bench-results
```

Smoke generates three small patterned JPEGs; it only validates the harness.
Never use debug or synthetic results to claim performance acceptance.

Reported measurements (milliseconds): metadata inspection, empty-cache
preview, repeat preview hit, decoding and JPEG encoding. The tool asserts
preview dimensions and cache-hit behavior.
Failures exit nonzero; intermediate outputs remain for diagnosis.

Limitations:

- Empty application caches do not flush the operating system's file cache.
- Preview time excludes IPC, browser image decoding and Canvas drawing.
- Export combines original-image decoding and JPEG quality-90 encoding; it
  does not benchmark the unedited byte-copy path or business effects.
- `decodedBytes` is pixel-buffer size, not peak process memory.
  `peakMemoryBytes` is null until an external process-memory profiler is used.
- No automatic performance pass/fail is inferred from arbitrary input sizes.

The 800ms first-preview, 100-photo/3s, 2.5× peak-memory and 60fps targets still
need representative release-build measurements and desktop profiling; this
tool does not measure the application's two-worker import queue.
