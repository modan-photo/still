# Development

Still uses Tauri 2, Rust, React, TypeScript, Vite, and Tailwind CSS. Windows and Android share the frontend and the Rust library entry point. Photo features in FEATURES.MD are planned, not implemented by this scaffold.

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
