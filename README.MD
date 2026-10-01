# Still

> A minimal photography toolkit for refining, presenting, and managing still images.

**Still** is a lightweight photography toolkit focused on the workflow around finished photographs.

It provides a simple way to inspect metadata, refine presentation, process images in batches, and organize photography work without becoming a full-scale photo editor.

## Features

- Add clean and customizable frames
- Add text, watermark, and EXIF-based information
- Inspect photo EXIF metadata
- Resize, rotate, and adjust image orientation
- Batch process multiple images
- Create simple collages and contact sheets
- Organize and manage photography collections

For the current implementation and its boundaries, see [System Status](./docs/overview/SYSTEM-STATUS.md). [docs/overview/FEATURES.md](./docs/overview/FEATURES.md) describes the broader feature roadmap.

## Philosophy

Still is designed around a few principles:

- **Photography first** — features should serve the presentation, understanding, and organization of photographs.
- **Focused and lightweight** — Still complements professional editors instead of replacing them.
- **Non-destructive by default** — original photographs should remain untouched whenever possible.
- **Batch-friendly** — common operations should be reusable and consistent across multiple images.
- **Metadata-aware** — EXIF information should be easy to inspect and reuse when presenting photographs.

## Status

Still is in active development. The Tauri 2 + React + TypeScript application implements local image import and preview, frames, watermarks, EXIF inspection and selected metadata edits, crop/rotation/flip, batch export, and collage. The workspace is session-only; presets and selected preferences persist. Android support has mobile code paths but still requires platform validation.

The feature set, interface, and internal architecture may evolve as the project grows.

## Getting Started

To get started, run:

```sh
cd still
npm install
npm run tauri android init
```

For Desktop development, run:

```sh
npm run tauri dev
```

For Android development, run:

```sh
npm run tauri android dev
```

See the [Development Guide](./docs/development/DEVELOPMENT.md) for prerequisites, Android setup, and build commands.

The app uses Tauri-generated icons stored in `src-tauri/icons/`. Run the following command if:

- you update the master brand icon at `assets/branding/still-icon-master.png`
- the Tauri app icons are missing, for example after a fresh clone or if `src-tauri/icons/` is empty

```bash
npm run tauri icon assets/branding/still-icon-master.png
```

## Documentation

- [Wiki Home — 中文](./docs/Home.md) · [English](./docs/Home-English.md)
- [System Status](./docs/overview/SYSTEM-STATUS.md)
- [Feature Roadmap](./docs/overview/FEATURES.md)
- [Design Language](./docs/design/DESIGN.md)
- [Architecture and Code Map](./docs/overview/SYSTEM-STATUS.md#3-代码结构与职责)
- [Development Guide](./docs/development/DEVELOPMENT.md)
- Contributing Guide — coming soon

## Name

**Still** comes from *still photography* — the practice of creating individual photographic images rather than motion pictures.

The name reflects the project's focus on photographs themselves: how they are refined, presented, understood, and preserved.

## License

Licensed under the [MIT License](./LICENSE).
