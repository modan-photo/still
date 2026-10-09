use std::{
    collections::HashSet,
    fs::File,
    io::BufReader,
    path::Path,
    sync::{Mutex, OnceLock},
};
use std::{
    fs::{self, OpenOptions},
    io,
    panic::{catch_unwind, AssertUnwindSafe},
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

use exif::{Context, Exif, Field, In, Reader as ExifReader, Tag, Value};
use little_exif::{
    exif_tag::{ExifTag, ExifTagGroup},
    metadata::Metadata,
};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExifData {
    pub camera: CameraInfo,
    pub exposure: ExposureInfo,
    pub time: TimeInfo,
    pub image: ImageInfo,
    pub location: Option<LocationInfo>,
    pub other: OtherInfo,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CameraInfo {
    pub make: Option<String>,
    pub model: Option<String>,
    pub lens: Option<String>,
    pub serial: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExposureInfo {
    pub focal_length: Option<String>,
    pub aperture: Option<String>,
    pub shutter_speed: Option<String>,
    pub iso: Option<u32>,
    pub exposure_bias: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimeInfo {
    pub datetime_original: Option<String>,
    pub datetime_modified: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub orientation: Option<String>,
    pub color_space: Option<String>,
    pub dpi: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocationInfo {
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OtherInfo {
    pub software: Option<String>,
    pub artist: Option<String>,
    pub copyright: Option<String>,
    pub keywords: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExifEdits {
    pub artist: Option<String>,
    pub copyright: Option<String>,
    pub keywords: Option<String>,
}

#[derive(Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExifWriteResult {
    /// The update succeeded, but this original-file backup needs manual cleanup.
    pub backup_cleanup_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifBatchItem {
    pub id: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifBatchResult {
    pub source_count: usize,
    pub photo_ids: Vec<String>,
    pub backup_cleanup_paths: Vec<String>,
}

static EXIF_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static ACTIVE_EXIF_WRITES: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();

/// Reads metadata without decoding the image pixel buffer.
///
/// A supported image with no EXIF container returns an empty `ExifData`. This is
/// intentionally different from I/O failures, which retain the shared AppError
/// shape used by the rest of the Tauri API.
#[tauri::command]
pub async fn exif_read(path: String) -> Result<ExifData, AppError> {
    read_exif(Path::new(&path))
}

/// Safely writes the supported EXIF fields without decoding image pixels.
///
#[tauri::command]
pub async fn exif_write(path: String, edits: ExifEdits) -> Result<ExifWriteResult, AppError> {
    tokio::task::spawn_blocking(move || {
        write_exif(Path::new(&path), edits).map_err(classify_write_error)
    })
    .await
    .map_err(|error| AppError::InvalidInput(format!("EXIF writer failed: {error}")))?
}

#[tauri::command]
pub async fn exif_write_batch(
    items: Vec<ExifBatchItem>,
    edits: ExifEdits,
) -> Result<ExifBatchResult, AppError> {
    tokio::task::spawn_blocking(move || {
        write_exif_batch(&items, edits).map_err(classify_write_error)
    })
    .await
    .map_err(|error| AppError::InvalidInput(format!("EXIF batch writer failed: {error}")))?
}

fn write_exif(path: &Path, edits: ExifEdits) -> Result<ExifWriteResult, AppError> {
    if crate::image_io::source::is_content_uri(path) {
        return Err(AppError::DocumentWriteUnsupported);
    }
    if edits.artist.is_none() && edits.copyright.is_none() && edits.keywords.is_none() {
        return Ok(ExifWriteResult::default());
    }

    let _write_guard = ExifWriteGuard::acquire(path)?;
    let mut staged = prepare_exif(path, &edits)?;
    replace_with_rollback(path, &mut staged)
}

fn prepare_exif(path: &Path, edits: &ExifEdits) -> Result<SiblingTemporaryFile, AppError> {
    let source_metadata = fs::metadata(path)?;
    if source_metadata.permissions().readonly() {
        return Err(AppError::FileReadOnly);
    }

    let staged = SiblingTemporaryFile::copy_of(path, "exif-write")?;
    let existing = read_exif(staged.path())?;
    let artist = edits.artist.clone().or(existing.other.artist);
    let copyright = edits.copyright.clone().or(existing.other.copyright);
    let keywords = edits.keywords.clone().or(existing.other.keywords);
    let library_result = catch_unwind(AssertUnwindSafe(|| -> io::Result<()> {
        let mut metadata = Metadata::new_from_path(staged.path())?;
        // Re-apply editable strings from kamadak-exif because little_exif
        // 0.5.1 decodes UTF-8 bytes one byte at a time on subsequent edits.
        if let Some(artist) = &artist {
            metadata.set_tag(ExifTag::Artist(artist.clone()));
        }
        if let Some(copyright) = &copyright {
            metadata.set_tag(ExifTag::Copyright(copyright.clone()));
        }
        if let Some(keywords) = &keywords {
            metadata.set_tag(ExifTag::UnknownINT8U(
                encode_xp_keywords(keywords),
                0x9c9e,
                ExifTagGroup::IFD0,
            ));
        }

        // little_exif 0.5.1 always emits an InteropIFD pointer. Without at
        // least one Interop tag the pointer targets EOF and the next edit can
        // panic while reading it. Preserve an existing index or add the
        // standard R98 marker so repeated metadata-only edits remain valid.
        if metadata
            .get_tag(&ExifTag::InteroperabilityIndex(String::new()))
            .is_none()
        {
            metadata.set_tag(ExifTag::InteroperabilityIndex("R98".into()));
        }
        metadata.write_to_file(staged.path())
    }));
    match library_result {
        Ok(result) => result?,
        Err(_) => {
            return Err(AppError::InvalidInput(
                "unable to update malformed EXIF metadata".into(),
            ))
        }
    }

    OpenOptions::new()
        .read(true)
        .write(true)
        .open(staged.path())?
        .sync_all()?;
    fs::set_permissions(staged.path(), source_metadata.permissions())?;

    let written = read_exif(staged.path())?;
    if !edit_matches(edits.artist.as_deref(), written.other.artist.as_deref())
        || !edit_matches(
            edits.copyright.as_deref(),
            written.other.copyright.as_deref(),
        )
        || !edit_matches(edits.keywords.as_deref(), written.other.keywords.as_deref())
    {
        return Err(AppError::InvalidInput(
            "EXIF verification failed after writing metadata".into(),
        ));
    }

    Ok(staged)
}

fn write_exif_batch(
    items: &[ExifBatchItem],
    edits: ExifEdits,
) -> Result<ExifBatchResult, AppError> {
    if items.is_empty() || items.len() > 100 {
        return Err(AppError::InvalidInput(
            "EXIF batch needs 1 to 100 photo items".into(),
        ));
    }
    if edits.artist.is_none() && edits.copyright.is_none() && edits.keywords.is_none() {
        return Err(AppError::InvalidInput(
            "EXIF batch has no fields to change".into(),
        ));
    }
    let mut ids = HashSet::new();
    let mut sources = HashSet::new();
    let mut paths = Vec::new();
    for item in items {
        if item.id.trim().is_empty() || !ids.insert(item.id.clone()) {
            return Err(AppError::InvalidInput(
                "EXIF batch photo IDs must be unique".into(),
            ));
        }
        let path = Path::new(&item.path);
        if crate::image_io::source::is_content_uri(path) {
            return Err(AppError::DocumentWriteUnsupported);
        }
        let canonical = fs::canonicalize(path).map_err(|error| AppError::ExifBatchFailed {
            path: item.path.clone(),
            cause: classify_write_error(error.into()).to_string(),
        })?;
        if sources.insert(canonical.clone()) {
            paths.push(canonical);
        }
    }
    paths.sort();
    let _guards = paths
        .iter()
        .map(|path| {
            ExifWriteGuard::acquire(path).map_err(|error| AppError::ExifBatchFailed {
                path: path.to_string_lossy().into_owned(),
                cause: classify_write_error(error).to_string(),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    let mut prepared = Vec::with_capacity(paths.len());
    for path in &paths {
        let staged = prepare_exif(path, &edits).map_err(|error| AppError::ExifBatchFailed {
            path: path.to_string_lossy().into_owned(),
            cause: classify_write_error(error).to_string(),
        })?;
        prepared.push((path.clone(), staged));
    }
    let backup_cleanup_paths =
        commit_exif_batch(prepared, crate::image_io::save::rename_no_replace)?;
    Ok(ExifBatchResult {
        source_count: paths.len(),
        photo_ids: items.iter().map(|item| item.id.clone()).collect(),
        backup_cleanup_paths,
    })
}

fn commit_exif_batch(
    prepared: Vec<(PathBuf, SiblingTemporaryFile)>,
    mut rename: impl FnMut(&Path, &Path) -> io::Result<()>,
) -> Result<Vec<String>, AppError> {
    let mut committed: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (path, mut staged) in prepared {
        let backup = unique_sibling_path(&path, "exif-batch-backup");
        let mut original_in_backup = false;
        let result = rename(&path, &backup).and_then(|_| {
            original_in_backup = true;
            match rename(staged.path(), &path) {
                Ok(()) => {
                    staged.disarm();
                    Ok(())
                }
                Err(error) => {
                    if let Err(rollback) = rename(&backup, &path) {
                        return Err(io::Error::other(format!(
                            "publish failed ({error}); original retained at {} but restore failed ({rollback})",
                            backup.display()
                        )));
                    }
                    Err(error)
                }
            }
        });
        match result {
            Ok(()) => committed.push((path, backup)),
            Err(error) => {
                let current_recovery = original_in_backup && backup.exists();
                let mut recovery = Vec::new();
                if current_recovery {
                    recovery.push(format!("original at {}", backup.display()));
                }
                for (destination, original) in committed.iter().rev() {
                    let displaced = unique_sibling_path(destination, "exif-batch-replaced");
                    if let Err(rollback) =
                        rename(destination, &displaced).and_then(|_| {
                            match rename(original, destination) {
                                Ok(()) => {
                                    if let Err(cleanup) = fs::remove_file(&displaced) {
                                        recovery.push(format!(
                                            "updated copy at {} ({cleanup})",
                                            displaced.display()
                                        ));
                                    }
                                    Ok(())
                                }
                                Err(restore_error) => {
                                    let _ = rename(&displaced, destination);
                                    Err(restore_error)
                                }
                            }
                        })
                    {
                        recovery.push(format!("original at {} ({rollback})", original.display()));
                    }
                }
                return if recovery.is_empty() {
                    Err(AppError::ExifBatchFailed {
                        path: path.to_string_lossy().into_owned(),
                        cause: classify_write_error(error.into()).to_string(),
                    })
                } else {
                    Err(AppError::ExifBatchRecoveryRequired {
                        details: recovery.join("; "),
                    })
                };
            }
        }
    }
    let mut leftovers = Vec::new();
    for (_, backup) in committed {
        if let Err(error) = fs::remove_file(&backup) {
            eprintln!(
                "unable to remove EXIF batch backup {}: {error}",
                backup.display()
            );
            leftovers.push(backup.to_string_lossy().into_owned());
        }
    }
    Ok(leftovers)
}

fn classify_write_error(error: AppError) -> AppError {
    match error {
        AppError::Io(error) if matches!(error.raw_os_error(), Some(32 | 33)) => AppError::FileBusy,
        AppError::Io(error) if error.kind() == io::ErrorKind::PermissionDenied => {
            AppError::FileReadOnly
        }
        error => error,
    }
}

struct ExifWriteGuard {
    path: PathBuf,
}

impl ExifWriteGuard {
    fn acquire(path: &Path) -> Result<Self, AppError> {
        let path = fs::canonicalize(path)?;
        let mut active = ACTIVE_EXIF_WRITES
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
            .map_err(|_| AppError::InvalidInput("EXIF writer state is unavailable".into()))?;
        if !active.insert(path.clone()) {
            return Err(AppError::FileBusy);
        }
        Ok(Self { path })
    }
}

impl Drop for ExifWriteGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = ACTIVE_EXIF_WRITES
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
        {
            active.remove(&self.path);
        }
    }
}

fn encode_xp_keywords(value: &str) -> Vec<u8> {
    value
        .encode_utf16()
        .chain(std::iter::once(0))
        .flat_map(u16::to_le_bytes)
        .collect()
}

fn edit_matches(requested: Option<&str>, written: Option<&str>) -> bool {
    requested.is_none_or(|value| {
        let expected = (!value.is_empty()).then_some(value);
        written == expected
    })
}

fn replace_with_rollback(
    destination: &Path,
    staged: &mut SiblingTemporaryFile,
) -> Result<ExifWriteResult, AppError> {
    replace_with_rollback_using(
        destination,
        staged,
        crate::image_io::save::rename_no_replace,
        |path| fs::remove_file(path),
    )
}

fn replace_with_rollback_using(
    destination: &Path,
    staged: &mut SiblingTemporaryFile,
    mut rename: impl FnMut(&Path, &Path) -> io::Result<()>,
    remove_backup: impl FnOnce(&Path) -> io::Result<()>,
) -> Result<ExifWriteResult, AppError> {
    let backup_path = unique_sibling_path(destination, "exif-backup");
    rename(destination, &backup_path)?;
    let mut backup = SiblingTemporaryFile::from_existing(backup_path);

    match rename(staged.path(), destination) {
        Ok(()) => {
            staged.disarm();
            let cleanup = remove_backup(backup.path());
            let backup_cleanup_path = cleanup.err().map(|error| {
                eprintln!(
                    "unable to remove EXIF backup {}: {error}",
                    backup.path().display()
                );
                backup.path().to_string_lossy().into_owned()
            });
            backup.disarm();
            Ok(ExifWriteResult {
                backup_cleanup_path,
            })
        }
        Err(commit_error) => match rename(backup.path(), destination) {
            Ok(()) => {
                backup.disarm();
                Err(commit_error.into())
            }
            Err(rollback_error) => {
                backup.disarm();
                Err(AppError::ExifRecoveryRequired {
                    backup_path: backup.path().to_string_lossy().into_owned(),
                    commit_error: commit_error.to_string(),
                    rollback_error: rollback_error.to_string(),
                })
            }
        },
    }
}

struct SiblingTemporaryFile {
    path: PathBuf,
    armed: bool,
}

impl SiblingTemporaryFile {
    fn copy_of(source: &Path, label: &str) -> Result<Self, AppError> {
        let path = unique_sibling_path(source, label);
        let mut input = File::open(source)?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)?;
        if let Err(error) = io::copy(&mut input, &mut output).and_then(|_| output.sync_all()) {
            let _ = fs::remove_file(&path);
            return Err(error.into());
        }
        Ok(Self { path, armed: true })
    }

    fn from_existing(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for SiblingTemporaryFile {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn unique_sibling_path(source: &Path, label: &str) -> PathBuf {
    let sequence = EXIF_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("jpg");
    source.with_file_name(format!(
        ".{stem}.still-{label}-{}-{sequence}.{extension}",
        std::process::id()
    ))
}

fn read_exif(path: &Path) -> Result<ExifData, AppError> {
    let file = File::open(crate::image_io::source::resolve(path)?)?;
    let mut reader = BufReader::new(file);
    let exif = match ExifReader::new()
        .continue_on_error(true)
        .read_from_container(&mut reader)
        .or_else(|error| {
            error.distill_partial_result(|errors| {
                for error in errors {
                    eprintln!("warning: ignored malformed EXIF field: {error}");
                }
            })
        }) {
        Ok(exif) => exif,
        Err(exif::Error::NotFound(_) | exif::Error::InvalidFormat(_)) => {
            return Ok(ExifData::default())
        }
        Err(error) => return Err(error.into()),
    };

    Ok(parse_exif(&exif))
}

fn parse_exif(exif: &Exif) -> ExifData {
    let latitude = gps_coordinate(exif, Tag::GPSLatitude, Tag::GPSLatitudeRef);
    let longitude = gps_coordinate(exif, Tag::GPSLongitude, Tag::GPSLongitudeRef);
    let location = match (latitude, longitude) {
        (Some(latitude), Some(longitude)) => Some(LocationInfo {
            latitude: Some(latitude),
            longitude: Some(longitude),
            altitude: gps_altitude(exif),
        }),
        _ => None,
    };

    ExifData {
        camera: CameraInfo {
            make: text(exif, Tag::Make),
            model: text(exif, Tag::Model),
            lens: text(exif, Tag::LensModel),
            serial: text(exif, Tag::BodySerialNumber),
        },
        exposure: ExposureInfo {
            focal_length: focal_length(exif),
            aperture: unsigned_rational(exif, Tag::FNumber)
                .map(|value| format!("f/{}", decimal(value, 1))),
            shutter_speed: shutter_speed(exif),
            iso: unsigned_integer(exif, Tag::PhotographicSensitivity)
                .or_else(|| unsigned_integer(exif, Tag::ISOSpeed)),
            exposure_bias: signed_number(exif, Tag::ExposureBiasValue).map(format_exposure_bias),
        },
        time: TimeInfo {
            datetime_original: text(exif, Tag::DateTimeOriginal),
            datetime_modified: text(exif, Tag::DateTime),
        },
        image: ImageInfo {
            width: unsigned_integer(exif, Tag::PixelXDimension)
                .or_else(|| unsigned_integer(exif, Tag::ImageWidth)),
            height: unsigned_integer(exif, Tag::PixelYDimension)
                .or_else(|| unsigned_integer(exif, Tag::ImageLength)),
            orientation: unsigned_integer(exif, Tag::Orientation).map(orientation_name),
            color_space: color_space(exif),
            dpi: dpi(exif),
        },
        location,
        other: OtherInfo {
            software: text(exif, Tag::Software),
            artist: text(exif, Tag::Artist),
            copyright: text(exif, Tag::Copyright),
            keywords: xp_keywords(exif),
        },
    }
}

fn field(exif: &Exif, tag: Tag) -> Option<&Field> {
    exif.get_field(tag, In::PRIMARY)
}

fn text(exif: &Exif, tag: Tag) -> Option<String> {
    let field = field(exif, tag)?;
    let value = match &field.value {
        Value::Ascii(parts) => parts
            .iter()
            .map(|part| String::from_utf8_lossy(part))
            .collect::<Vec<_>>()
            .join(" "),
        Value::Undefined(bytes, _) | Value::Byte(bytes) => String::from_utf8_lossy(bytes).into(),
        _ => return None,
    };
    non_empty(value.trim_matches(['\0', ' ']).to_owned())
}

fn unsigned_integer(exif: &Exif, tag: Tag) -> Option<u32> {
    field(exif, tag)?.value.get_uint(0)
}

fn unsigned_rational(exif: &Exif, tag: Tag) -> Option<f64> {
    match &field(exif, tag)?.value {
        Value::Rational(values) => values
            .first()
            .filter(|value| value.denom != 0)
            .map(|value| value.num as f64 / value.denom as f64),
        _ => None,
    }
}

fn signed_number(exif: &Exif, tag: Tag) -> Option<f64> {
    match &field(exif, tag)?.value {
        Value::SRational(values) => values
            .first()
            .filter(|value| value.denom != 0)
            .map(|value| value.num as f64 / value.denom as f64),
        Value::Rational(values) => values
            .first()
            .filter(|value| value.denom != 0)
            .map(|value| value.num as f64 / value.denom as f64),
        _ => None,
    }
}

fn focal_length(exif: &Exif) -> Option<String> {
    let focal = unsigned_rational(exif, Tag::FocalLength)?;
    let mut result = format!("{}mm", decimal(focal, 1));
    if let Some(equivalent) = unsigned_integer(exif, Tag::FocalLengthIn35mmFilm) {
        result.push_str(&format!(" ({equivalent}mm equivalent)"));
    }
    Some(result)
}

fn shutter_speed(exif: &Exif) -> Option<String> {
    let field = field(exif, Tag::ExposureTime)?;
    let Value::Rational(values) = &field.value else {
        return None;
    };
    let value = values.first().filter(|value| value.denom != 0)?;
    if value.num == 0 {
        return None;
    }
    if value.num < value.denom {
        let divisor = gcd(value.num, value.denom);
        Some(format!(
            "{}/{}s",
            value.num / divisor,
            value.denom / divisor
        ))
    } else {
        Some(format!(
            "{}s",
            decimal(value.num as f64 / value.denom as f64, 1)
        ))
    }
}

fn gps_coordinate(exif: &Exif, coordinate_tag: Tag, reference_tag: Tag) -> Option<f64> {
    let Value::Rational(parts) = &field(exif, coordinate_tag)?.value else {
        return None;
    };
    if parts.len() < 3 || parts[..3].iter().any(|part| part.denom == 0) {
        return None;
    }
    let mut coordinate = parts[0].num as f64 / parts[0].denom as f64
        + (parts[1].num as f64 / parts[1].denom as f64) / 60.0
        + (parts[2].num as f64 / parts[2].denom as f64) / 3600.0;
    let reference = text(exif, reference_tag)?.to_ascii_uppercase();
    match reference.as_str() {
        "S" | "W" => coordinate = -coordinate,
        "N" | "E" => {}
        _ => return None,
    }
    Some(coordinate)
}

fn gps_altitude(exif: &Exif) -> Option<f64> {
    let mut altitude = unsigned_rational(exif, Tag::GPSAltitude)?;
    if unsigned_integer(exif, Tag::GPSAltitudeRef) == Some(1) {
        altitude = -altitude;
    }
    Some(altitude)
}

fn color_space(exif: &Exif) -> Option<String> {
    match unsigned_integer(exif, Tag::ColorSpace)? {
        1 => Some("sRGB".into()),
        0xffff => Some("Uncalibrated".into()),
        value => Some(value.to_string()),
    }
}

fn dpi(exif: &Exif) -> Option<String> {
    let x = unsigned_rational(exif, Tag::XResolution)?;
    let y = unsigned_rational(exif, Tag::YResolution).unwrap_or(x);
    let unit = match unsigned_integer(exif, Tag::ResolutionUnit) {
        Some(2) => 1.0,
        Some(3) => 2.54,
        _ => return None,
    };
    let x = x * unit;
    let y = y * unit;
    if (x - y).abs() < 0.05 {
        Some(decimal(x, 1))
    } else {
        Some(format!("{} × {}", decimal(x, 1), decimal(y, 1)))
    }
}

fn xp_keywords(exif: &Exif) -> Option<String> {
    const XP_KEYWORDS: Tag = Tag(Context::Tiff, 0x9c9e);
    let bytes = match &field(exif, XP_KEYWORDS)?.value {
        Value::Byte(bytes) | Value::Undefined(bytes, _) => bytes,
        _ => return None,
    };
    let words = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .take_while(|word| *word != 0)
        .collect::<Vec<_>>();
    non_empty(String::from_utf16_lossy(&words).trim().to_owned())
}

fn orientation_name(value: u32) -> String {
    match value {
        1 => "Normal",
        2 => "Mirrored horizontally",
        3 => "Rotated 180°",
        4 => "Mirrored vertically",
        5 => "Mirrored horizontally and rotated 270°",
        6 => "Rotated 90°",
        7 => "Mirrored horizontally and rotated 90°",
        8 => "Rotated 270°",
        _ => "Unknown",
    }
    .into()
}

fn format_exposure_bias(value: f64) -> String {
    if value.abs() < 0.000_1 {
        "0 EV".into()
    } else {
        format!("{value:+.1} EV")
    }
}

fn decimal(value: f64, precision: usize) -> String {
    let value = format!("{value:.precision$}");
    value.trim_end_matches('0').trim_end_matches('.').to_owned()
}

fn non_empty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

fn gcd(mut left: u32, mut right: u32) -> u32 {
    while right != 0 {
        (left, right) = (right, left % right);
    }
    left
}

#[cfg(test)]
mod tests {
    #[test]
    fn document_writeback_is_rejected_before_touching_any_file() {
        let result = super::write_exif(
            std::path::Path::new("content://photos/document/42"),
            super::ExifEdits {
                artist: Some("Changed".into()),
                ..Default::default()
            },
        );
        assert!(matches!(
            result,
            Err(crate::error::AppError::DocumentWriteUnsupported)
        ));
    }
    use std::{fs, time::SystemTime};

    use image::{Rgb, RgbImage, Rgba, RgbaImage};

    use super::{
        commit_exif_batch, decimal, encode_xp_keywords, format_exposure_bias, gcd,
        orientation_name, read_exif, replace_with_rollback_using, write_exif, write_exif_batch,
        ExifBatchItem, ExifData, ExifEdits, ExifWriteGuard, SiblingTemporaryFile,
    };
    use crate::error::AppError;

    #[test]
    fn empty_data_serializes_to_the_frontend_contract() {
        let json = serde_json::to_value(ExifData::default()).expect("serialize empty EXIF");

        assert!(json["camera"]["model"].is_null());
        assert!(json["exposure"]["focalLength"].is_null());
        assert!(json["time"]["datetimeOriginal"].is_null());
        assert!(json["image"]["colorSpace"].is_null());
        assert!(json["location"].is_null());
        assert!(json["other"]["keywords"].is_null());
    }

    #[test]
    fn formats_display_values_without_noisy_zeroes() {
        assert_eq!(decimal(50.0, 1), "50");
        assert_eq!(decimal(2.8, 1), "2.8");
        assert_eq!(format_exposure_bias(1.0 / 3.0), "+0.3 EV");
        assert_eq!(format_exposure_bias(0.0), "0 EV");
        assert_eq!(gcd(2, 500), 2);
        assert_eq!(orientation_name(6), "Rotated 90°");
    }

    #[test]
    fn png_without_exif_returns_empty_data() {
        let directory = test_directory();
        fs::create_dir_all(&directory).expect("create test directory");
        let path = directory.join("without-exif.png");
        RgbaImage::from_pixel(2, 2, Rgba([20, 40, 60, 255]))
            .save(&path)
            .expect("write PNG");

        assert_eq!(
            read_exif(&path).expect("read empty EXIF"),
            ExifData::default()
        );

        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn editable_fields_write_sequentially_and_preserve_pixels() {
        let directory = test_directory();
        fs::create_dir_all(&directory).expect("create test directory");
        let path = directory.join("artist.jpg");
        RgbImage::from_pixel(8, 6, Rgb([20, 80, 140]))
            .save(&path)
            .expect("write JPEG");
        inject_software_exif(&path, "Still Test Suite");

        let pixels_before = image::open(&path).expect("decode before write").to_rgb8();
        let size_before = fs::metadata(&path).expect("metadata before write").len();

        write_exif(
            &path,
            ExifEdits {
                artist: Some("Test Artist".into()),
                ..ExifEdits::default()
            },
        )
        .expect("write Artist");
        write_exif(
            &path,
            ExifEdits {
                copyright: Some("© 2026 Test".into()),
                ..ExifEdits::default()
            },
        )
        .expect("write Copyright");
        write_exif(
            &path,
            ExifEdits {
                keywords: Some("风景, 旅行, 2026, 📷".into()),
                ..ExifEdits::default()
            },
        )
        .expect("write XPKeywords");

        let result = read_exif(&path).expect("read written EXIF");
        assert_eq!(result.other.artist.as_deref(), Some("Test Artist"));
        assert_eq!(result.other.copyright.as_deref(), Some("© 2026 Test"));
        assert_eq!(
            result.other.keywords.as_deref(),
            Some("风景, 旅行, 2026, 📷")
        );
        assert_eq!(result.other.software.as_deref(), Some("Still Test Suite"));
        assert_eq!(
            image::open(&path).expect("decode after write").to_rgb8(),
            pixels_before
        );
        let size_after = fs::metadata(&path).expect("metadata after write").len();
        assert!(size_before.abs_diff(size_after) < 1024);
        assert!(
            fs::read_dir(&directory)
                .expect("read test directory")
                .all(|entry| !entry
                    .expect("directory entry")
                    .file_name()
                    .to_string_lossy()
                    .contains(".still-")),
            "temporary EXIF files should be cleaned up"
        );

        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn xp_keywords_are_utf16le_and_null_terminated() {
        assert_eq!(
            encode_xp_keywords("风景, 📷"),
            vec![206, 152, 111, 102, 44, 0, 32, 0, 61, 216, 247, 220, 0, 0]
        );
    }

    #[test]
    fn rejects_a_second_in_process_write_to_the_same_file() {
        let directory = test_directory();
        fs::create_dir_all(&directory).expect("create test directory");
        let path = directory.join("locked.jpg");
        RgbImage::from_pixel(2, 2, Rgb([20, 80, 140]))
            .save(&path)
            .expect("write JPEG");

        let _first = ExifWriteGuard::acquire(&path).expect("acquire first writer");
        assert!(matches!(
            ExifWriteGuard::acquire(&path),
            Err(AppError::FileBusy)
        ));

        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn failed_exif_publication_restores_the_original() {
        let directory = test_directory();
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("photo.jpg");
        fs::write(&path, b"original").unwrap();
        let mut staged = SiblingTemporaryFile::copy_of(&path, "exif-write").unwrap();
        fs::write(staged.path(), b"updated").unwrap();
        let mut calls = 0;
        let result = replace_with_rollback_using(
            &path,
            &mut staged,
            |from, to| {
                calls += 1;
                if calls == 2 {
                    Err(std::io::Error::other("publish failed"))
                } else {
                    fs::rename(from, to)
                }
            },
            |path| fs::remove_file(path),
        );
        assert!(result.is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_exif_rollback_keeps_a_named_backup() {
        let directory = test_directory();
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("photo.jpg");
        fs::write(&path, b"original").unwrap();
        let mut staged = SiblingTemporaryFile::copy_of(&path, "exif-write").unwrap();
        let mut calls = 0;
        let result = replace_with_rollback_using(
            &path,
            &mut staged,
            |from, to| {
                calls += 1;
                if calls > 1 {
                    Err(std::io::Error::other("rename failed"))
                } else {
                    fs::rename(from, to)
                }
            },
            |path| fs::remove_file(path),
        );
        let Err(AppError::ExifRecoveryRequired { backup_path, .. }) = result else {
            panic!("expected a recoverable EXIF error");
        };
        assert_eq!(fs::read(backup_path).unwrap(), b"original");
        assert!(!path.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_exif_backup_cleanup_reports_success_with_warning() {
        let directory = test_directory();
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("photo.jpg");
        fs::write(&path, b"original").unwrap();
        let mut staged = SiblingTemporaryFile::copy_of(&path, "exif-write").unwrap();
        fs::write(staged.path(), b"updated").unwrap();
        let result = replace_with_rollback_using(
            &path,
            &mut staged,
            |from, to| fs::rename(from, to),
            |_| Err(std::io::Error::other("cleanup failed")),
        )
        .unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"updated");
        assert_eq!(
            fs::read(result.backup_cleanup_path.unwrap()).unwrap(),
            b"original"
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn batch_deduplicates_the_same_source_and_writes_each_file_once() {
        let directory = test_directory();
        fs::create_dir_all(&directory).unwrap();
        let first = directory.join("a.jpg");
        let second = directory.join("b.jpg");
        for path in [&first, &second] {
            RgbImage::from_pixel(3, 3, Rgb([20, 80, 140]))
                .save(path)
                .unwrap();
        }
        let items = [
            ExifBatchItem {
                id: "a1".into(),
                path: first.to_string_lossy().into_owned(),
            },
            ExifBatchItem {
                id: "a2".into(),
                path: first.to_string_lossy().into_owned(),
            },
            ExifBatchItem {
                id: "b".into(),
                path: second.to_string_lossy().into_owned(),
            },
        ];
        let result = write_exif_batch(
            &items,
            ExifEdits {
                artist: Some("Batch".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(result.source_count, 2);
        assert_eq!(result.photo_ids, ["a1", "a2", "b"]);
        assert!(result.backup_cleanup_paths.is_empty());
        for path in [&first, &second] {
            assert_eq!(
                read_exif(path).unwrap().other.artist.as_deref(),
                Some("Batch")
            );
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn batch_preparation_failure_does_not_edit_any_source() {
        let directory = test_directory();
        fs::create_dir_all(&directory).unwrap();
        let first = directory.join("a.jpg");
        let second = directory.join("b.jpg");
        RgbImage::from_pixel(3, 3, Rgb([20, 80, 140]))
            .save(&first)
            .unwrap();
        fs::write(&second, b"not an image").unwrap();
        let before = fs::read(&first).unwrap();
        let items = [
            ExifBatchItem {
                id: "a".into(),
                path: first.to_string_lossy().into_owned(),
            },
            ExifBatchItem {
                id: "b".into(),
                path: second.to_string_lossy().into_owned(),
            },
        ];
        assert!(matches!(
            write_exif_batch(
                &items,
                ExifEdits {
                    artist: Some("Batch".into()),
                    ..Default::default()
                }
            ),
            Err(AppError::ExifBatchFailed { .. })
        ));
        assert_eq!(fs::read(&first).unwrap(), before);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn batch_commit_failure_restores_previously_published_sources() {
        let directory = test_directory();
        fs::create_dir_all(&directory).unwrap();
        let mut prepared = Vec::new();
        for name in ["a.jpg", "b.jpg"] {
            let path = directory.join(name);
            fs::write(&path, format!("original-{name}")).unwrap();
            let staged = SiblingTemporaryFile::copy_of(&path, "exif-write").unwrap();
            fs::write(staged.path(), format!("updated-{name}")).unwrap();
            prepared.push((path, staged));
        }
        let mut calls = 0;
        let result = commit_exif_batch(prepared, |from, to| {
            calls += 1;
            if calls == 4 {
                Err(std::io::Error::other("second publish failed"))
            } else {
                fs::rename(from, to)
            }
        });
        assert!(matches!(result, Err(AppError::ExifBatchFailed { .. })));
        for name in ["a.jpg", "b.jpg"] {
            assert_eq!(
                fs::read(directory.join(name)).unwrap(),
                format!("original-{name}").as_bytes()
            );
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn batch_rollback_failure_keeps_the_original_backup() {
        let directory = test_directory();
        fs::create_dir_all(&directory).unwrap();
        let mut prepared = Vec::new();
        for name in ["a.jpg", "b.jpg"] {
            let path = directory.join(name);
            fs::write(&path, format!("original-{name}")).unwrap();
            let staged = SiblingTemporaryFile::copy_of(&path, "exif-write").unwrap();
            fs::write(staged.path(), format!("updated-{name}")).unwrap();
            prepared.push((path, staged));
        }
        let mut calls = 0;
        let result = commit_exif_batch(prepared, |from, to| {
            calls += 1;
            if calls == 4 || calls == 7 {
                Err(std::io::Error::other("injected failure"))
            } else {
                fs::rename(from, to)
            }
        });
        let Err(AppError::ExifBatchRecoveryRequired { details }) = result else {
            panic!("expected backup recovery details");
        };
        assert!(details.contains("exif-batch-backup"));
        let backups: Vec<_> = fs::read_dir(&directory)
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.to_string_lossy().contains("exif-batch-backup"))
            .collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read(&backups[0]).unwrap(), b"original-a.jpg");
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn rejects_read_only_files_with_a_stable_error() {
        let directory = test_directory();
        fs::create_dir_all(&directory).expect("create test directory");
        let path = directory.join("read-only.jpg");
        RgbImage::from_pixel(2, 2, Rgb([20, 80, 140]))
            .save(&path)
            .expect("write JPEG");
        let mut permissions = fs::metadata(&path).expect("read permissions").permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).expect("set read-only");

        assert!(matches!(
            write_exif(
                &path,
                ExifEdits {
                    artist: Some("Test".into()),
                    ..ExifEdits::default()
                }
            ),
            Err(AppError::FileReadOnly)
        ));

        let mut permissions = fs::metadata(&path).expect("read permissions").permissions();
        permissions.set_readonly(false);
        fs::set_permissions(&path, permissions).expect("restore permissions");
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    fn test_directory() -> std::path::PathBuf {
        static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        std::env::temp_dir().join(format!(
            "still-exif-test-{}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos(),
            SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ))
    }

    fn inject_software_exif(path: &std::path::Path, software: &str) {
        let mut text = software.as_bytes().to_vec();
        text.push(0);

        let mut tiff = Vec::new();
        tiff.extend_from_slice(b"II");
        tiff.extend_from_slice(&42u16.to_le_bytes());
        tiff.extend_from_slice(&8u32.to_le_bytes());
        tiff.extend_from_slice(&1u16.to_le_bytes());
        tiff.extend_from_slice(&0x0131u16.to_le_bytes());
        tiff.extend_from_slice(&2u16.to_le_bytes());
        tiff.extend_from_slice(&(text.len() as u32).to_le_bytes());
        tiff.extend_from_slice(&26u32.to_le_bytes());
        tiff.extend_from_slice(&0u32.to_le_bytes());
        tiff.extend_from_slice(&text);

        let mut payload = b"Exif\0\0".to_vec();
        payload.extend_from_slice(&tiff);
        let segment_length = u16::try_from(payload.len() + 2).expect("small EXIF fixture");
        let mut segment = vec![0xff, 0xe1];
        segment.extend_from_slice(&segment_length.to_be_bytes());
        segment.extend_from_slice(&payload);

        let bytes = fs::read(path).expect("read JPEG fixture");
        let mut with_exif = Vec::with_capacity(bytes.len() + segment.len());
        with_exif.extend_from_slice(&bytes[..2]);
        with_exif.extend_from_slice(&segment);
        with_exif.extend_from_slice(&bytes[2..]);
        fs::write(path, with_exif).expect("inject EXIF fixture");
    }
}
