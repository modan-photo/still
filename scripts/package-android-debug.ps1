param(
  [string]$JavaHome,
  [string]$AndroidSdk
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$android = Join-Path $repo 'src-tauri/gen/android'
$library = Join-Path $repo 'src-tauri/target/aarch64-linux-android/debug/libstill_lib.so'
$jniDirectory = Join-Path $android 'app/src/main/jniLibs/arm64-v8a'
$jniLibrary = Join-Path $jniDirectory 'libstill_lib.so'
$apk = Join-Path $android 'app/build/outputs/apk/arm64/debug/app-arm64-debug.apk'

if ($JavaHome) { $env:JAVA_HOME = $JavaHome }
if ($AndroidSdk) { $env:ANDROID_HOME = $AndroidSdk }
$env:GRADLE_USER_HOME = Join-Path $repo '.gradle'
$env:ANDROID_USER_HOME = Join-Path $repo '.gradle/android-user'
New-Item -ItemType Directory -Path $env:ANDROID_USER_HOME -Force | Out-Null
if (-not (Test-Path -LiteralPath $library -PathType Leaf)) {
  throw "Build the current ARM64 Rust library first: $library"
}
if (-not (Test-Path -LiteralPath (Join-Path $android 'gradlew.bat') -PathType Leaf)) {
  throw 'The generated Android project is missing.'
}
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {
  throw 'Pass -JavaHome with a JDK 21 installation.'
}
if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'build-tools'))) {
  throw 'Pass -AndroidSdk with an Android SDK installation.'
}

# The normal Tauri CLI prepares the Android project and web assets. This only
# finishes a debug build when Windows disallows its jniLibs symlink creation.
New-Item -ItemType Directory -Path $jniDirectory -Force | Out-Null
if (Test-Path -LiteralPath $jniLibrary) { Remove-Item -LiteralPath $jniLibrary -Force }
New-Item -ItemType HardLink -Path $jniLibrary -Target $library | Out-Null

# A stale incrementally rebuilt APK can retain duplicate native payloads.
# Delete only this known generated artifact; Gradle recreates it below.
if (Test-Path -LiteralPath $apk) { Remove-Item -LiteralPath $apk -Force }
Push-Location $android
try {
  & (Join-Path $android 'gradlew.bat') ':app:assembleArm64Debug' '-x' ':app:rustBuildArm64Debug' '--no-daemon'
  if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
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
