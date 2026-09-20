# Development

Still uses Tauri 2, Rust, React, TypeScript, Vite, and Tailwind CSS. Windows and Android share the frontend and the Rust library entry point. Photo features in FEATURES.MD are planned, not implemented by this scaffold.

## Recommended development toolchain

Use the existing stack as the baseline. Versions below describe the major versions declared in the project; `package-lock.json` and `src-tauri/Cargo.lock` record resolved dependencies. Optional tools are recommendations, not installed or configured project features.

| Area | Tooling | Project usage |
| --- | --- | --- |
| Application runtime | Tauri 2 + Rust | Native application shell and platform integration; share the Rust library between Windows and Android. |
| Frontend | React 19 + TypeScript 6 | Components, UI state, and typed frontend code. |
| Styling | Tailwind CSS 4 + CSS custom properties + SVG | Keep theme tokens in `src/App.css` and follow `docs/DESIGN.md`; reuse SVG primitives for Still's photography marks. |
| Development and bundling | Vite 8 | Fast frontend iteration and production asset builds. |
| JavaScript packages | Node.js + npm | Follow the versions in Prerequisites and use `npm ci` for reproducible installs. |
| Rust toolchain | rustup + Cargo + rustfmt | Manage Rust, build native code, and check formatting using the commands below. |
| Editor | VS Code + Tauri extension + rust-analyzer | The repository already recommends `tauri-apps.tauri-vscode` and `rust-lang.rust-analyzer` in `.vscode/extensions.json`. |
| Windows native tooling | Visual Studio Build Tools + Windows SDK + WebView2 | Build and run the native Windows application with the MSVC toolchain. |
| Android tooling | Android Studio + SDK + NDK + bundled JDK | Needed only for Android development; follow the setup section below. |
| Source control | Git | Review changes and commit dependency lockfiles together with manifest changes. |

### Debugging workflow

Use `npm run dev` for layout, theme, and browser interaction work. Use `npm run desktop:dev` to verify native behavior; a browser preview cannot validate Tauri commands or platform permissions. For Rust breakpoints, configure VS Code using the official [Tauri debugging guide](https://v2.tauri.app/develop/debug/vscode/). On Windows, the Microsoft C/C++ extension is a supported debugger option; see [Rust in VS Code](https://code.visualstudio.com/docs/languages/rust).

### Optional quality tools

Adopt these when the project needs them, with committed configuration and scripts so local development and CI use the same checks:

- **ESLint + typescript-eslint** for frontend code checks, and **Prettier** for TSX, CSS, and Markdown formatting. These are not configured yet. Use `eslint-config-prettier` to disable conflicting formatting rules when combining the tools; see the [Prettier installation guide](https://prettier.io/docs/install.html).
- **Clippy** for additional Rust lint checks. After installing the component with `rustup component add clippy`, run `cargo clippy --manifest-path src-tauri/Cargo.toml --locked -- -D warnings`. This is an additional recommended check, not an existing npm script.
- **Vitest** for frontend logic tests when functional behavior is added. It uses Vite's tooling; see the [Vitest guide](https://vitest.dev/guide/index.html). No frontend test runner is configured yet. Keep `npm run check` as a separate type-checking step.
- **Cargo's built-in test runner** for Rust logic as native features are implemented: `cargo test --manifest-path src-tauri/Cargo.toml --locked`.

## Prerequisites

- Node.js 22.12+ and npm 11.19.0 (the version in package.json).
- Stable Rust installed through rustup.
- Windows: Visual Studio Build Tools with Desktop development with C++, a Windows SDK, and Microsoft Edge WebView2 Runtime. Use the MSVC Rust toolchain.
- Android: Android Studio, its bundled JDK, Android SDK Platform and Build Tools, Platform Tools, SDK Command-line Tools, and NDK (Side by side).

Follow the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) when installing native tooling.

## Install and run

```sh
npm ci
npm run dev                 # Browser-only frontend
npm run desktop:dev         # Native desktop application
npm run desktop:build       # Native release and installers for the host OS
```

Build Windows packages on Windows. The scaffold currently uses the official template icons; replace them before distribution. The initial application identifier is `dev.still.app`; choose a permanent identifier before publishing, then regenerate the Android project if necessary.

## Android setup on Windows

Set the following variables in PowerShell, adjusting paths and the NDK version to your installation:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\<installed-version>"
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
npm run android:init
npm run android:dev
```

Start an Android emulator in Android Studio or connect a device with USB debugging enabled. `android:init` generates `src-tauri/gen/android`; it requires the SDK/NDK and must run before Android development or builds. This directory has not yet been generated because the initialization machine has no Android SDK. Commit the generated native project when initialization succeeds, excluding local paths, build outputs, and signing secrets.

```sh
npm run android:build -- --apk
npm run android:build -- --aab
```

Release distribution additionally requires Android signing configuration. Do not commit keystores or passwords. Vite respects `TAURI_DEV_HOST`, set by the Tauri mobile CLI, so a device can reach the development server.

## Checks

```sh
npm run check
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

## Layout

- `src/`: shared React interface and styles.
- `src-tauri/src/lib.rs`: shared Tauri runtime and future Rust commands; includes the mobile entry point.
- `src-tauri/src/main.rs`: desktop executable entry point.
- `src-tauri/tauri.conf.json`: application metadata, window, build, and security configuration.
- `src-tauri/capabilities/`: narrowly scoped native permissions; currently only Tauri core defaults.

Add feature permissions and plugins only when a feature needs them. Browser preview does not provide native APIs. Android photo access will need platform-aware URI and permission handling when image import is implemented.
