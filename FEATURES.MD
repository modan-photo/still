# Features

This document describes the planned and supported capabilities of **Still**.

Still focuses on the workflow around finished photographs: presentation, metadata, batch processing, and organization.

## 1. Frames

Add clean, configurable frames around photographs.

Planned capabilities include:

- Multiple frame styles
- Adjustable frame width and spacing
- Configurable background color
- Different layouts for portrait and landscape images
- Reusable frame presets
- Consistent frame application across multiple images

## 2. Watermarks and Information

Add text, marks, or other information to the image or frame area.

Supported content may include:

- Photographer name
- Copyright information
- Custom text
- Camera information
- Lens information
- Shooting parameters
- Capture date
- Logo or graphic watermark

Presentation options may include:

- Position
- Alignment
- Font
- Size
- Spacing
- Opacity
- Layout presets

Watermark styles can be saved and reused.

## 3. EXIF Metadata

Inspect metadata embedded in photographs.

Common metadata includes:

- Camera manufacturer and model
- Lens
- Focal length
- Aperture
- Shutter speed
- ISO
- Exposure compensation
- Capture date and time
- Image dimensions
- Orientation
- GPS information, when available

Selected EXIF fields can be inserted directly into watermark or frame information.

Example:

```text
Leica M11 · Summilux-M 35mm F1.4
35mm · f/2 · 1/250s · ISO 100
```

## 4. Image Transformations

Perform common image adjustments before export.

Planned operations include:

- Resize
- Rotate
- Flip
- Crop
- Orientation correction
- Aspect ratio adjustment
- Output quality configuration

Still should preserve image quality and metadata whenever possible.

## 5. Batch Processing

Apply the same processing configuration to multiple images.

Batch operations may include:

- Apply frames
- Add watermarks
- Insert EXIF information
- Resize
- Rotate
- Export
- Rename files
- Apply reusable presets

Batch processing should produce consistent results while keeping the original files unchanged.

## 6. Collage

Combine multiple photographs into a single output image.

Planned layouts include:

- Grid
- Horizontal sequence
- Vertical sequence
- Contact sheet
- Custom spacing and margins

Collage generation should integrate with the same frame, watermark, and export options used elsewhere in Still.

## 7. Presets

Save reusable configurations for common workflows.

Presets may include:

- Frame style
- Watermark layout
- EXIF fields
- Typography
- Image size
- Export quality
- Naming rules
- Collage layout

A preset should be applicable to both individual images and batch processing.

## 8. Photography Collection

Organize photographs and reference works inside Still.

Planned capabilities include:

- Favorites
- Collections
- Tags
- Ratings
- Notes
- Photographer information
- Project information
- Search
- Filtering

This feature is intended for lightweight photography organization rather than replacing a full digital asset management system.

## 9. Export

Export processed photographs using configurable output options.

Planned capabilities include:

- Output format
- Compression quality
- Image dimensions
- File naming
- Output location
- Metadata preservation
- Metadata removal
- Batch export

Export should remain non-destructive and should never modify the original image unless explicitly requested.

## Roadmap

The roadmap is organized around building a solid core workflow first, then expanding into reusable workflows and photography management.

### Phase 1 — Core

- [ ] Image import
- [ ] Image preview
- [ ] EXIF inspection
- [ ] Basic frame styles
- [ ] Text watermark
- [ ] EXIF-based watermark
- [ ] Resize
- [ ] Rotate
- [ ] Basic export
- [ ] Metadata preservation

### Phase 2 — Workflow

- [ ] Batch processing
- [ ] Batch export
- [ ] Reusable frame presets
- [ ] Reusable watermark presets
- [ ] Combined processing presets
- [ ] File naming rules
- [ ] Additional export options
- [ ] Logo and graphic watermarks

### Phase 3 — Layout

- [ ] Grid collage
- [ ] Horizontal and vertical layouts
- [ ] Contact sheets
- [ ] Custom spacing and margins
- [ ] Layout presets
- [ ] Combined frame and watermark layouts

### Phase 4 — Library

- [ ] Favorites
- [ ] Collections
- [ ] Tags
- [ ] Ratings
- [ ] Notes
- [ ] Search and filtering
- [ ] Photographer and project metadata
- [ ] Reference photography library

### Future

- [ ] Custom layout templates
- [ ] Advanced typography
- [ ] Color profile support
- [ ] Metadata editing
- [ ] Smart collections
- [ ] Photo comparison
- [ ] Workflow automation
- [ ] Cross-device synchronization
- [ ] Plugin or extension support

The roadmap is intentionally flexible and may evolve as Still develops.

## Scope

Still is not intended to replace professional photo editing software such as Lightroom, Capture One, or Photoshop.

Its focus is narrower:

- Presentation
- Metadata
- Batch processing
- Export
- Lightweight organization

The goal is to make the final steps around photography simple, consistent, and efficient.
