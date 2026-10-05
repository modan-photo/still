param(
  [Parameter(Mandatory = $true)][string]$ApkPath,
  [Parameter(Mandatory = $true)][string]$ExpectedCertificateSha256,
  [Parameter(Mandatory = $true)][int]$ExpectedVersionCode,
  [Parameter(Mandatory = $true)][string]$ExpectedVersionName,
  [int]$ExpectedTargetSdk = 36,
  [string]$AndroidSdk,
  [string]$JavaHome,
  [string[]]$ExpectedAbi = @('arm64-v8a')
)

$ErrorActionPreference = 'Stop'
if ($AndroidSdk) { $env:ANDROID_HOME = $AndroidSdk }
if ($JavaHome) { $env:JAVA_HOME = $JavaHome }

$apk = (Resolve-Path -LiteralPath $ApkPath).Path
if ([System.IO.Path]::GetExtension($apk) -ne '.apk') { throw 'Select an APK file.' }
$expectedCertificate = ($ExpectedCertificateSha256 -replace ':', '').ToUpperInvariant()
if ($expectedCertificate -notmatch '^[0-9A-F]{64}$') {
  throw 'ExpectedCertificateSha256 must be a 64-digit SHA-256 fingerprint.'
}
if ($ExpectedVersionCode -le 0 -or [string]::IsNullOrWhiteSpace($ExpectedVersionName)) {
  throw 'Provide the intended positive version code and version name.'
}
if (-not $env:ANDROID_HOME) { throw 'Pass -AndroidSdk with an Android SDK installation.' }
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {
  throw 'Pass -JavaHome with a JDK installation.'
}

$buildTools = Get-ChildItem -LiteralPath (Join-Path $env:ANDROID_HOME 'build-tools') -Directory |
  Sort-Object Name -Descending |
  Where-Object {
    (Test-Path -LiteralPath (Join-Path $_.FullName 'apksigner.bat')) -and
    (Test-Path -LiteralPath (Join-Path $_.FullName 'aapt.exe'))
  } | Select-Object -First 1
if (-not $buildTools) { throw 'Android SDK build-tools must include apksigner and aapt.' }

$signature = & (Join-Path $buildTools.FullName 'apksigner.bat') verify --min-sdk-version 29 --verbose --print-certs $apk 2>&1
if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed: $($signature -join ' ')" }
$signatureText = $signature -join "`n"
if ($signatureText -notmatch 'Number of signers: 1') { throw 'Expected exactly one APK signer.' }
if ($signatureText -match 'Signer #1 certificate DN:.*CN=Android Debug') {
  throw 'Android Debug signing is not a release signature.'
}
$certificateMatch = [regex]::Match($signatureText, 'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]{64})')
if (-not $certificateMatch.Success) { throw 'Could not read the signer certificate SHA-256.' }
$actualCertificate = $certificateMatch.Groups[1].Value.ToUpperInvariant()
if ($actualCertificate -ne $expectedCertificate) {
  throw "Signer certificate does not match the approved fingerprint: $actualCertificate"
}

$badging = & (Join-Path $buildTools.FullName 'aapt.exe') dump badging $apk 2>&1
if ($LASTEXITCODE -ne 0) { throw "Unable to inspect APK manifest: $($badging -join ' ')" }
$badgingText = $badging -join "`n"
$package = [regex]::Match($badgingText, "(?m)^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'" )
if (-not $package.Success -or $package.Groups[1].Value -ne 'dev.still.app') {
  throw 'APK package name is not dev.still.app.'
}
if ($package.Groups[2].Value -ne [string]$ExpectedVersionCode -or
    $package.Groups[3].Value -ne $ExpectedVersionName) {
  throw 'APK version does not match the intended release version.'
}
if ($badgingText -notmatch "(?m)^sdkVersion:'29'$") { throw 'APK minimum SDK is not API 29.' }
if ($badgingText -notmatch "(?m)^targetSdkVersion:'$ExpectedTargetSdk'$") {
  throw "APK target SDK is not API $ExpectedTargetSdk."
}
if ($badgingText -match '(?m)^application-debuggable') { throw 'APK is debuggable.' }
$abiLine = [regex]::Match($badgingText, '(?m)^native-code: (.+)$')
if (-not $abiLine.Success) { throw 'APK has no native ABI declaration.' }
foreach ($abi in $ExpectedAbi) {
  if ($abiLine.Groups[1].Value -notmatch "'$([regex]::Escape($abi))'") {
    throw "APK is missing required ABI: $abi"
  }
}

$file = Get-Item -LiteralPath $apk
$hash = Get-FileHash -LiteralPath $apk -Algorithm SHA256
Write-Output "APK: $($file.FullName)"
Write-Output "Bytes: $($file.Length)"
Write-Output "SHA256: $($hash.Hash)"
Write-Output "Signer certificate SHA256: $actualCertificate"
Write-Output "Package: dev.still.app $ExpectedVersionName ($ExpectedVersionCode), minSdk 29"
Write-Output "Native ABIs: $($abiLine.Groups[1].Value)"
