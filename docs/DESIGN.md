# Still Design Language

Still follows a minimal, photography-first visual language.

The interface should stay quiet and neutral so that photographs remain the primary visual focus. Green is used as the brand accent, while most surfaces rely on white, black, and neutral grays.

## 1. Design Principles

### Photography First

The interface should never compete with the photograph.

Avoid large decorative areas, excessive shadows, gradients, or saturated colors. UI elements should remain visually restrained and functional.

### Minimal and Precise

Still should feel simple, structured, and professional.

Use:

- Clear hierarchy
- Generous spacing
- Subtle borders
- Limited color usage
- Consistent alignment
- Predictable interactions

Prefer structure over decoration.

### Neutral by Default

Most of the interface should use neutral colors.

Green should primarily communicate:

- Primary actions
- Selection
- Focus
- Active states
- Progress
- Positive status

Large green surfaces should generally be avoided.

### Light and Dark Are Equal

Light and dark modes should share the same visual hierarchy rather than being simple inversions of each other.

Both themes should feel intentional and suitable for photography work.

# 2. Color System

## Light Theme

The light theme should feel bright, clean, and close to pure white.

It should resemble a modern gallery or photography workspace rather than a tinted productivity application.

| Token | Value | Usage |
|---|---|---|
| `background` | `#FFFFFF` | Main application background |
| `surface` | `#FFFFFF` | Panels, cards, dialogs |
| `surface-secondary` | `#F6F7F6` | Secondary panels and grouped content |
| `surface-tertiary` | `#F0F2F0` | Hovered or nested surfaces |
| `text-primary` | `#161916` | Primary text |
| `text-secondary` | `#666D67` | Secondary text |
| `text-tertiary` | `#929992` | Hints and metadata |
| `border` | `#E5E8E5` | Default borders |
| `border-strong` | `#D4D9D4` | Stronger separators |
| `green-primary` | `#2F7D4A` | Primary brand color |
| `green-hover` | `#286A3F` | Hover state |
| `green-active` | `#215A35` | Pressed state |
| `green-soft` | `#EDF6EF` | Selected or highlighted background |
| `danger` | `#C54848` | Destructive actions |
| `warning` | `#A66A1F` | Warning state |

The main background should remain pure white whenever possible.

Secondary gray surfaces should only be used to separate tools, grouped controls, and supporting content.

## Dark Theme

The dark theme should feel closer to a professional editing workspace or digital darkroom.

Avoid pure black for large application surfaces.

| Token | Value | Usage |
|---|---|---|
| `background` | `#101210` | Main application background |
| `surface` | `#171A17` | Panels and dialogs |
| `surface-secondary` | `#1E221E` | Secondary panels |
| `surface-tertiary` | `#252A25` | Hovered or nested surfaces |
| `text-primary` | `#F3F5F3` | Primary text |
| `text-secondary` | `#A7AEA7` | Secondary text |
| `text-tertiary` | `#747D75` | Hints and metadata |
| `border` | `#2C322C` | Default borders |
| `border-strong` | `#3A423A` | Stronger separators |
| `green-primary` | `#58B977` | Primary brand color |
| `green-hover` | `#69C889` | Hover state |
| `green-active` | `#79D497` | Pressed state |
| `green-soft` | `#193322` | Selected background |
| `danger` | `#E06A6A` | Destructive actions |
| `warning` | `#D49A50` | Warning state |

# 3. Theme Behavior

Still should support three theme preferences:

- System
- Light
- Dark

`System` should be the default.

The selected preference should persist across sessions.

Theme changes should apply immediately without requiring an application restart.

# 4. Canvas

The photograph canvas should be visually separated from the application chrome.

The canvas background does not need to match the main application background.

Recommended defaults:

| Theme | Canvas |
|---|---|
| Light | `#F2F3F2` |
| Dark | `#090B09` |

This separation helps users evaluate:

- Frames
- White margins
- Dark margins
- Borders
- Watermarks
- Overall image contrast

Future versions may allow users to switch the canvas between:

- White
- Light gray
- Dark gray
- Black

The canvas color should never alter the exported image.

# 5. Typography

Still should use modern, neutral sans-serif typography.

Recommended font priority:

```text
Inter
SF Pro
Segoe UI
system-ui
sans-serif
```

For Chinese text, prefer the platform system font.

Suggested type scale:

| Role | Size | Weight |
|---|---:|---:|
| Page title | 24–28px | 600 |
| Section title | 16–18px | 600 |
| Body | 14–16px | 400 |
| Control label | 13–14px | 500 |
| Metadata | 12–13px | 400 |
| Caption | 11–12px | 400 |

Typography should remain compact and functional.

Avoid oversized display typography inside the main application interface.

# 6. Spacing

Use a consistent spacing system based primarily on multiples of `4px`.

Recommended scale:

```text
4
8
12
16
20
24
32
40
48
64
```

Common usage:

- Icon and label spacing: `8px`
- Control spacing: `8–12px`
- Panel padding: `16–20px`
- Section spacing: `24–32px`
- Major page spacing: `32–48px`

Prefer whitespace over decorative separators.

# 7. Radius

Still should use restrained corner rounding.

Recommended values:

| Component | Radius |
|---|---:|
| Small controls | 6px |
| Buttons | 8px |
| Inputs | 8px |
| Cards | 8–10px |
| Dialogs | 10–12px |
| Image thumbnails | 6–8px |

Avoid excessive pill-shaped controls except where the interaction naturally requires them, such as segmented selections or tags.

# 8. Borders and Shadows

Borders should be preferred over shadows.

Default border:

```text
1px solid var(--border)
```

Shadows should only be used when elevation is functionally useful, such as:

- Menus
- Popovers
- Dialogs
- Floating toolbars

Shadows should remain soft and subtle.

Do not use heavy card shadows throughout the interface.

# 9. Icons

Use a consistent line-based icon system.

Recommended characteristics:

- Simple geometry
- Consistent stroke width
- Minimal detail
- Clear meaning at small sizes

Icons should normally inherit neutral text colors.

Use green for icons only when representing an active or selected state.

Avoid mixing unrelated icon styles.

# 10. Buttons

## Primary Button

Use the main green color.

Light theme:

```text
background: #2F7D4A
text: #FFFFFF
```

Dark theme:

```text
background: #58B977
text: #0E160F
```

Primary buttons should be reserved for the most important action within a context.

Examples:

- Export
- Apply
- Save preset
- Import

## Secondary Button

Use a neutral surface with a subtle border.

## Ghost Button

Use for toolbar actions and low-emphasis commands.

## Destructive Button

Use the danger color only for destructive operations.

Examples:

- Delete
- Remove
- Reset destructive changes

# 11. Inputs and Controls

Inputs should remain simple and compact.

Recommended structure:

- Neutral background
- 1px border
- 8px radius
- Clear focus state
- Green focus indicator

Controls should avoid unnecessary visual chrome.

Sliders, toggles, checkboxes, and selected options may use the green accent.

# 12. Layout

Still should use a focused editing workspace rather than a permanent library-style layout.

A typical desktop structure may contain:

```text
┌──────────────────────────────────────────────────────┐
│ Toolbar                                              │
├───────────────────────────────────────┬──────────────┤
│                                       │ Inspector    │
│                                       │              │
│               Canvas                  │ Frame        │
│                                       │ Watermark    │
│                                       │ EXIF         │
│                                       │ Transform    │
│                                       │ Export       │
├───────────────────────────────────────┴──────────────┤
│ Optional filmstrip / batch selection                 │
└──────────────────────────────────────────────────────┘
```

The canvas should remain the dominant element.

The inspector should contain contextual editing tools and may be collapsible.

An optional bottom filmstrip can appear when:

- Multiple images are open
- Batch processing is active
- A collage is being created

It should not be shown when it is unnecessary.

## Layout Priorities

1. Photograph
2. Active editing controls
3. Current image or batch context
4. Secondary application actions

Permanent sidebars without an active purpose should be avoided.

# 13. Navigation

Still should avoid traditional application navigation where possible.

The primary workflow should be direct:

```text
Open → Refine → Export
```

Core tools such as:

- Frame
- Watermark
- EXIF
- Transform
- Collage

should live inside the editing workspace rather than becoming separate application pages.

Secondary areas such as settings, presets, or future photo collections may be accessed from menus, dialogs, or dedicated views when needed.

# 14. Photo Presentation

Photographs should normally be displayed without decorative UI around them.

Use:

- Neutral canvas
- Subtle selection outline
- Minimal overlay controls
- Simple loading indicators

Avoid:

- Heavy thumbnail borders
- Decorative gradients
- Permanent floating buttons over photographs
- Strong colored backgrounds

When selected, a photograph may use a subtle green outline or indicator.

# 15. Metadata Presentation

EXIF and technical information should be easy to scan.

Prefer structured rows such as:

```text
Camera          Leica M11
Lens            Summilux-M 35mm F1.4
Focal Length    35 mm
Aperture        f/2
Shutter         1/250 s
ISO             100
```

Labels should use secondary text.

Values should use primary text.

Dense metadata should remain visually quiet.

# 16. Motion

Animation should be subtle and functional.

Recommended duration:

```text
120–200ms
```

Appropriate uses include:

- Theme switching
- Panel transitions
- Hover states
- Selection states
- Popovers
- Progress feedback

Avoid decorative or prolonged animations.

# 17. Accessibility

Still should maintain sufficient contrast in both light and dark themes.

Interactive states should not rely on color alone.

Use combinations of:

- Color
- Border
- Icon
- Shape
- Text

Keyboard focus should always remain visible.

Text and controls should remain usable under system scaling.

# 18. Visual Direction

The intended visual character of Still is:

- Minimal
- Calm
- Precise
- Professional
- Neutral
- Photography-focused

The application should feel closer to a professional photographic workspace than a general-purpose consumer photo app.

The interface should disappear when the user focuses on the photograph.

## Design Motto

> Quiet interface, precise tools, photography first.