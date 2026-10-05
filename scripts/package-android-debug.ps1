param(
  [string]$JavaHome,
  [string]$AndroidSdk
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$android = Join-Path $repo 'src-tauri/gen/android'
$manifest = Join-Path $repo 'src-tauri/Cargo.toml'
$library = Join-Path $repo 'src-tauri/target/aarch64-linux-android/debug/libstill_lib.so'
$jniDirectory = Join-Path $android 'app/src/main/jniLibs/arm64-v8a'
$jniLibrary = Join-Path $jniDirectory 'libstill_lib.so'
$apk = Join-Path $android 'app/build/outputs/apk/arm64/debug/app-arm64-debug.apk'

if ($JavaHome) { $env:JAVA_HOME = $JavaHome }
if ($AndroidSdk) { $env:ANDROID_HOME = $AndroidSdk }
$env:GRADLE_USER_HOME = Join-Path $repo '.gradle'
$env:ANDROID_USER_HOME = Join-Path $repo '.gradle/android-user'
New-Item -ItemType Directory -Path $env:ANDROID_USER_HOME -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $android 'gradlew.bat') -PathType Leaf)) {
  throw 'The generated Android project is missing.'
}
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {
  throw 'Pass -JavaHome with a JDK 21 installation.'
}
if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'build-tools'))) {
  throw 'Pass -AndroidSdk with an Android SDK installation.'
}
$ndkBin = Join-Path $env:ANDROID_HOME 'ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin'
if (-not (Test-Path -LiteralPath (Join-Path $ndkBin 'aarch64-linux-android29-clang.cmd'))) {
  throw 'Install Android NDK 29.0.14206865 for the API 29 ARM64 target.'
}
$node = (Get-Command node -ErrorAction Stop).Source
$env:PATH = "$ndkBin;$(Split-Path $node);$env:PATH"
$env:NDK_HOME = Join-Path $env:ANDROID_HOME 'ndk/29.0.14206865'
$env:CC_aarch64_linux_android = Join-Path $ndkBin 'aarch64-linux-android29-clang.cmd'
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = $env:CC_aarch64_linux_android
$env:AR_aarch64_linux_android = Join-Path $ndkBin 'llvm-ar.exe'

& $node (Join-Path $repo 'node_modules/typescript/bin/tsc')
if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed.' }
& $node (Join-Path $repo 'node_modules/vite/bin/vite.js') build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }

# A plain Cargo build can reuse a library with stale embedded web assets.
# Rebuild this package via Tauri after the frontend build, even if Rust is unchanged.
$targetRoot = (Resolve-Path -LiteralPath (Join-Path $repo 'src-tauri/target')).Path
$targetDirectory = (Resolve-Path -LiteralPath (Join-Path $targetRoot 'aarch64-linux-android')).Path
if (-not $targetDirectory.StartsWith($targetRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Cargo target is outside the project build directory.'
}
& cargo clean --manifest-path $manifest -p still --target aarch64-linux-android
if ($LASTEXITCODE -ne 0) { throw 'Unable to refresh the ARM64 build.' }

$config = '{"build":{"beforeBuildCommand":""}}'
$previousNativeErrors = $PSNativeCommandUseErrorActionPreference
$PSNativeCommandUseErrorActionPreference = $false
try {
  & $node (Join-Path $repo 'node_modules/@tauri-apps/cli/tauri.js') android build --debug --apk --target aarch64 --ci --config $config 2>&1 |
    Tee-Object -Variable tauriOutput | Out-Host
  $tauriExitCode = $LASTEXITCODE
} finally {
  $PSNativeCommandUseErrorActionPreference = $previousNativeErrors
}
if ($tauriExitCode -eq 0) {
  Write-Output 'Tauri completed the debug build without a fallback.'
} elseif (($tauriOutput -join "`n") -notmatch 'Creation symbolic link is not allowed for this system') {
  throw "Tauri Android build failed for a reason other than Windows symlink permission (exit $tauriExitCode)."
} else {
  if (-not (Test-Path -LiteralPath $library -PathType Leaf)) {
    throw "Tauri did not build the ARM64 Rust library: $library"
  }

  New-Item -ItemType Directory -Path $jniDirectory -Force | Out-Null
  if (Test-Path -LiteralPath $jniLibrary) { Remove-Item -LiteralPath $jniLibrary -Force }
  New-Item -ItemType HardLink -Path $jniLibrary -Target $library | Out-Null

  # Remove only the known generated artifact; Gradle recreates it below.
  if (Test-Path -LiteralPath $apk) { Remove-Item -LiteralPath $apk -Force }
  Push-Location $android
  try {
    & (Join-Path $android 'gradlew.bat') ':app:assembleArm64Debug' '-x' ':app:rustBuildArm64Debug' '--no-daemon'
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}
if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) { throw "Gradle did not create $apk" }

$signer = Get-ChildItem -LiteralPath (Join-Path $env:ANDROID_HOME 'build-tools') -Directory |
  Sort-Object Name -Descending |
  ForEach-Object { Join-Path $_.FullName 'apksigner.bat' } |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1
if (-not $signer) { throw 'Android SDK build-tools must include apksigner.bat.' }
& $signer verify --min-sdk-version 29 --verbose $apk
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }

$hash = Get-FileHash -LiteralPath $apk -Algorithm SHA256
$file = Get-Item -LiteralPath $apk
Write-Output "APK: $($file.FullName)"
Write-Output "Bytes: $($file.Length)"
Write-Output "SHA256: $($hash.Hash)"
Write-Output 'Debug APK only; install and test it on a device before acceptance.'
