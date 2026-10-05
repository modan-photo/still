param(
    [Parameter(Mandatory = $true)][string]$ApkPath,
    [string]$NativeLibraryPath,
    [string]$NativeAbi = 'arm64-v8a'
)

$ErrorActionPreference = 'Stop'

function Format-MiB([long]$Bytes) {
    return [math]::Round($Bytes / 1MB, 2)
}

function Get-EntryCategory([string]$Name) {
    if ($Name -match '^lib/') { return 'native libraries' }
    if ($Name -match '^classes\d*\.dex$') { return 'DEX bytecode' }
    if ($Name -match '^assets/') { return 'assets' }
    if ($Name -match '^(res/|resources\.arsc$)') { return 'Android resources' }
    return 'other'
}

$apk = (Resolve-Path -LiteralPath $ApkPath).Path
$library = if ($NativeLibraryPath) { (Resolve-Path -LiteralPath $NativeLibraryPath).Path } else { $null }
$archive = [System.IO.Compression.ZipFile]::OpenRead($apk)
try {
    $entries = @($archive.Entries | Where-Object { $_.Name.Length -gt 0 })
    $rows = @($entries | ForEach-Object {
        [pscustomobject]@{
            Name = $_.FullName
            Category = Get-EntryCategory $_.FullName
            CompressedBytes = [long]$_.CompressedLength
            RawBytes = [long]$_.Length
        }
    })
    $summary = @($rows | Group-Object Category | ForEach-Object {
        [pscustomobject]@{
            Category = $_.Name
            Count = $_.Count
            CompressedMiB = Format-MiB (($_.Group | Measure-Object CompressedBytes -Sum).Sum)
            RawMiB = Format-MiB (($_.Group | Measure-Object RawBytes -Sum).Sum)
        }
    } | Sort-Object CompressedMiB -Descending)
    $largest = @($rows | Sort-Object CompressedBytes -Descending | Select-Object -First 12 | ForEach-Object {
        [pscustomobject]@{
            Name = $_.Name
            CompressedMiB = Format-MiB $_.CompressedBytes
            RawMiB = Format-MiB $_.RawBytes
        }
    })
    Write-Output "APK: $apk"
    Write-Output "Bytes: $((Get-Item -LiteralPath $apk).Length)"
    Write-Output "SHA-256: $((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash)"
    Write-Output "Categories (MiB):"
    Write-Output ($summary | Format-Table -AutoSize | Out-String)
    Write-Output "Largest entries (MiB):"
    Write-Output ($largest | Format-Table -AutoSize | Out-String)
    if ($library) {
        $entryName = "lib/$NativeAbi/$([System.IO.Path]::GetFileName($library))"
        $entry = $archive.GetEntry($entryName)
        if (-not $entry) { throw "APK does not contain $entryName" }
        $inputStream = $entry.Open()
        try {
            $packagedHash = (Get-FileHash -InputStream $inputStream -Algorithm SHA256).Hash
        } finally {
            $inputStream.Dispose()
        }
        $localHash = (Get-FileHash -LiteralPath $library -Algorithm SHA256).Hash
        if ($packagedHash -ne $localHash) {
            throw "Local ELF differs from $entryName in the APK. Analyze the matching build artifact."
        }
        Write-Output "Packaged $entryName matches local ELF SHA-256: $localHash"
    }
} finally {
    $archive.Dispose()
}

if (-not $library) { return }

$stream = [System.IO.File]::OpenRead($library)
$reader = [System.IO.BinaryReader]::new($stream)
try {
    if ($reader.ReadByte() -ne 0x7f -or $reader.ReadByte() -ne 0x45 -or
        $reader.ReadByte() -ne 0x4c -or $reader.ReadByte() -ne 0x46 -or
        $reader.ReadByte() -ne 2 -or $reader.ReadByte() -ne 1) {
        throw 'Native library must be a little-endian 64-bit ELF file.'
    }
    $stream.Position = 0x28
    $sectionOffset = [long]$reader.ReadUInt64()
    $stream.Position = 0x3a
    $sectionHeaderSize = [int]$reader.ReadUInt16()
    $sectionCount = [int]$reader.ReadUInt16()
    $namesIndex = [int]$reader.ReadUInt16()
    if ($sectionHeaderSize -lt 64 -or $sectionCount -eq 0 -or $namesIndex -ge $sectionCount -or
        $sectionOffset + $sectionHeaderSize * $sectionCount -gt $stream.Length) {
        throw 'Invalid or unsupported ELF section table.'
    }

    $sections = for ($index = 0; $index -lt $sectionCount; $index++) {
        $stream.Position = $sectionOffset + $index * $sectionHeaderSize
        $nameIndex = [int]$reader.ReadUInt32()
        $null = $reader.ReadUInt32()
        $null = $reader.ReadUInt64()
        $null = $reader.ReadUInt64()
        [pscustomobject]@{
            NameIndex = $nameIndex
            Offset = [long]$reader.ReadUInt64()
            Bytes = [long]$reader.ReadUInt64()
        }
    }
    $namesSection = $sections[$namesIndex]
    if ($namesSection.Bytes -gt 1MB -or $namesSection.Offset + $namesSection.Bytes -gt $stream.Length) {
        throw 'Invalid ELF section name table.'
    }
    $stream.Position = $namesSection.Offset
    $names = $reader.ReadBytes([int]$namesSection.Bytes)
    $named = @($sections | ForEach-Object {
        if ($_.NameIndex -ge $names.Length) { throw 'Invalid ELF section name index.' }
        $end = $_.NameIndex
        while ($end -lt $names.Length -and $names[$end] -ne 0) { $end++ }
        [pscustomobject]@{
            Name = [System.Text.Encoding]::ASCII.GetString($names, $_.NameIndex, $end - $_.NameIndex)
            Bytes = $_.Bytes
        }
    })
    $debugBytes = [long](($named | Where-Object { $_.Name -match '^\.(z?debug|gdb_index|symtab|strtab)' } |
        Measure-Object Bytes -Sum).Sum)
    $topSections = @($named | Sort-Object Bytes -Descending | Select-Object -First 12 | ForEach-Object {
        [pscustomobject]@{ Name = $_.Name; MiB = Format-MiB $_.Bytes }
    })
    Write-Output "ELF: $library"
    Write-Output "ELF bytes: $($stream.Length); debug/symbol sections: $debugBytes ($([math]::Round(100 * $debugBytes / $stream.Length, 1))%)"
    Write-Output "Largest ELF sections (MiB):"
    Write-Output ($topSections | Format-Table -AutoSize | Out-String)
} finally {
    $reader.Dispose()
}
