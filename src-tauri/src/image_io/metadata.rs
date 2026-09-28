use std::{
    fs,
    io::{Read, Write},
    path::Path,
};

use crc32fast::Hasher;
use flate2::{read::ZlibDecoder, write::ZlibEncoder, Compression};

use crate::{error::AppError, render::spec::OutputFormat};

#[derive(Default)]
pub struct ImageMetadata {
    pub exif: Option<Vec<u8>>,
    pub icc: Option<Vec<u8>>,
}

pub fn copy_metadata(
    source: &Path,
    encoded: &Path,
    format: OutputFormat,
    width: u32,
    height: u32,
    preserve_exif: bool,
    preserve_icc: bool,
) -> Result<(), AppError> {
    if !preserve_exif && !preserve_icc {
        return Ok(());
    }
    let bytes = fs::read(source)?;
    let mut metadata = extract(&bytes);
    if preserve_exif {
        if let Some(exif) = metadata.exif.as_mut() {
            normalize_orientation(exif);
        }
    } else {
        metadata.exif = None;
    }
    if !preserve_icc {
        metadata.icc = None;
    }
    if metadata.exif.is_none() && metadata.icc.is_none() {
        return Ok(());
    }

    let output = fs::read(encoded)?;
    let rewritten = match format {
        OutputFormat::Jpeg => inject_jpeg(&output, &metadata)?,
        OutputFormat::Png => inject_png(&output, &metadata)?,
        OutputFormat::Webp => inject_webp(&output, &metadata, width, height)?,
    };
    let mut file = fs::File::options()
        .write(true)
        .truncate(true)
        .open(encoded)?;
    file.write_all(&rewritten)?;
    file.sync_all()?;
    Ok(())
}

fn extract(bytes: &[u8]) -> ImageMetadata {
    if bytes.starts_with(&[0xff, 0xd8]) {
        extract_jpeg(bytes)
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        extract_png(bytes)
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        extract_webp(bytes)
    } else {
        ImageMetadata::default()
    }
}

fn extract_jpeg(bytes: &[u8]) -> ImageMetadata {
    let mut result = ImageMetadata::default();
    let mut icc_parts: Vec<(u8, Vec<u8>)> = Vec::new();
    let mut cursor = 2;
    while cursor + 4 <= bytes.len() && bytes[cursor] == 0xff {
        let marker = bytes[cursor + 1];
        if marker == 0xda || marker == 0xd9 {
            break;
        }
        let length = u16::from_be_bytes([bytes[cursor + 2], bytes[cursor + 3]]) as usize;
        if length < 2 || cursor + 2 + length > bytes.len() {
            break;
        }
        let payload = &bytes[cursor + 4..cursor + 2 + length];
        if marker == 0xe1 && payload.starts_with(b"Exif\0\0") {
            result.exif = Some(payload[6..].to_vec());
        } else if marker == 0xe2 && payload.starts_with(b"ICC_PROFILE\0") && payload.len() > 14 {
            icc_parts.push((payload[12], payload[14..].to_vec()));
        }
        cursor += length + 2;
    }
    if !icc_parts.is_empty() {
        icc_parts.sort_by_key(|part| part.0);
        result.icc = Some(icc_parts.into_iter().flat_map(|part| part.1).collect());
    }
    result
}

fn extract_png(bytes: &[u8]) -> ImageMetadata {
    let mut result = ImageMetadata::default();
    let mut cursor = 8;
    while cursor + 12 <= bytes.len() {
        let length = u32::from_be_bytes(bytes[cursor..cursor + 4].try_into().unwrap()) as usize;
        if cursor + 12 + length > bytes.len() {
            break;
        }
        let kind = &bytes[cursor + 4..cursor + 8];
        let data = &bytes[cursor + 8..cursor + 8 + length];
        if kind == b"eXIf" {
            result.exif = Some(data.to_vec());
        }
        if kind == b"iCCP" {
            if let Some(zero) = data.iter().position(|byte| *byte == 0) {
                if data.get(zero + 1) == Some(&0) {
                    let mut decoder = ZlibDecoder::new(&data[zero + 2..]);
                    let mut profile = Vec::new();
                    if decoder.read_to_end(&mut profile).is_ok() {
                        result.icc = Some(profile);
                    }
                }
            }
        }
        cursor += length + 12;
    }
    result
}

fn extract_webp(bytes: &[u8]) -> ImageMetadata {
    let mut result = ImageMetadata::default();
    let mut cursor = 12;
    while cursor + 8 <= bytes.len() {
        let length = u32::from_le_bytes(bytes[cursor + 4..cursor + 8].try_into().unwrap()) as usize;
        if cursor + 8 + length > bytes.len() {
            break;
        }
        let kind = &bytes[cursor..cursor + 4];
        let data = &bytes[cursor + 8..cursor + 8 + length];
        if kind == b"EXIF" {
            result.exif = Some(data.strip_prefix(b"Exif\0\0").unwrap_or(data).to_vec());
        }
        if kind == b"ICCP" {
            result.icc = Some(data.to_vec());
        }
        cursor += 8 + length + (length & 1);
    }
    result
}

fn normalize_orientation(tiff: &mut [u8]) {
    let tiff = if tiff.starts_with(b"Exif\0\0") {
        &mut tiff[6..]
    } else {
        tiff
    };
    if tiff.len() < 8 {
        return;
    }
    let little = &tiff[..2] == b"II";
    if !little && &tiff[..2] != b"MM" {
        return;
    }
    let read_u16 = |slice: &[u8]| {
        if little {
            u16::from_le_bytes([slice[0], slice[1]])
        } else {
            u16::from_be_bytes([slice[0], slice[1]])
        }
    };
    let read_u32 = |slice: &[u8]| {
        if little {
            u32::from_le_bytes(slice[..4].try_into().unwrap())
        } else {
            u32::from_be_bytes(slice[..4].try_into().unwrap())
        }
    };
    let offset = read_u32(&tiff[4..8]) as usize;
    if offset + 2 > tiff.len() {
        return;
    }
    let count = read_u16(&tiff[offset..offset + 2]) as usize;
    for index in 0..count {
        let entry = offset + 2 + index * 12;
        if entry + 12 > tiff.len() {
            return;
        }
        if read_u16(&tiff[entry..entry + 2]) == 0x0112 {
            let value = if little { [1, 0] } else { [0, 1] };
            tiff[entry + 8..entry + 10].copy_from_slice(&value);
            tiff[entry + 10..entry + 12].fill(0);
            return;
        }
    }
}

fn jpeg_segment(marker: u8, payload: &[u8]) -> Result<Vec<u8>, AppError> {
    let length = payload.len() + 2;
    if length > u16::MAX as usize {
        return Err(AppError::InvalidInput(
            "metadata segment is too large".into(),
        ));
    }
    let mut result = vec![0xff, marker];
    result.extend_from_slice(&(length as u16).to_be_bytes());
    result.extend_from_slice(payload);
    Ok(result)
}

fn inject_jpeg(output: &[u8], metadata: &ImageMetadata) -> Result<Vec<u8>, AppError> {
    if !output.starts_with(&[0xff, 0xd8]) {
        return Err(AppError::InvalidInput(
            "encoder produced an invalid JPEG".into(),
        ));
    }
    let mut result = Vec::with_capacity(
        output.len()
            + metadata.exif.as_ref().map_or(0, Vec::len)
            + metadata.icc.as_ref().map_or(0, Vec::len),
    );
    result.extend_from_slice(&output[..2]);
    if let Some(exif) = &metadata.exif {
        let mut payload = b"Exif\0\0".to_vec();
        payload.extend_from_slice(exif);
        result.extend_from_slice(&jpeg_segment(0xe1, &payload)?);
    }
    if let Some(icc) = &metadata.icc {
        const PART: usize = 65_519;
        let total = icc.len().div_ceil(PART);
        if total > 255 {
            return Err(AppError::InvalidInput("ICC profile is too large".into()));
        }
        for (index, chunk) in icc.chunks(PART).enumerate() {
            let mut payload = b"ICC_PROFILE\0".to_vec();
            payload.extend_from_slice(&[(index + 1) as u8, total as u8]);
            payload.extend_from_slice(chunk);
            result.extend_from_slice(&jpeg_segment(0xe2, &payload)?);
        }
    }
    result.extend_from_slice(&output[2..]);
    Ok(result)
}

fn png_chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut chunk = Vec::with_capacity(data.len() + 12);
    chunk.extend_from_slice(&(data.len() as u32).to_be_bytes());
    chunk.extend_from_slice(kind);
    chunk.extend_from_slice(data);
    let mut hasher = Hasher::new();
    hasher.update(kind);
    hasher.update(data);
    chunk.extend_from_slice(&hasher.finalize().to_be_bytes());
    chunk
}

fn inject_png(output: &[u8], metadata: &ImageMetadata) -> Result<Vec<u8>, AppError> {
    if output.len() < 33 || !output.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err(AppError::InvalidInput(
            "encoder produced an invalid PNG".into(),
        ));
    }
    let ihdr_end = 33;
    let mut result = Vec::with_capacity(output.len() + 1024);
    result.extend_from_slice(&output[..ihdr_end]);
    if let Some(icc) = &metadata.icc {
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(icc)?;
        let mut data = b"Still ICC\0\0".to_vec();
        data.extend_from_slice(&encoder.finish()?);
        result.extend_from_slice(&png_chunk(b"iCCP", &data));
    }
    if let Some(exif) = &metadata.exif {
        result.extend_from_slice(&png_chunk(b"eXIf", exif));
    }
    result.extend_from_slice(&output[ihdr_end..]);
    Ok(result)
}

fn webp_chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut result = Vec::with_capacity(data.len() + 9);
    result.extend_from_slice(kind);
    result.extend_from_slice(&(data.len() as u32).to_le_bytes());
    result.extend_from_slice(data);
    if data.len() & 1 == 1 {
        result.push(0);
    }
    result
}

fn inject_webp(
    output: &[u8],
    metadata: &ImageMetadata,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, AppError> {
    if output.len() < 12 || &output[..4] != b"RIFF" || &output[8..12] != b"WEBP" {
        return Err(AppError::InvalidInput(
            "encoder produced an invalid WebP".into(),
        ));
    }
    let mut body = Vec::new();
    let mut flags = if output[12..].windows(4).any(|chunk| chunk == b"ALPH") {
        0x10
    } else {
        0
    };
    if metadata.icc.is_some() {
        flags |= 0x20;
    }
    if metadata.exif.is_some() {
        flags |= 0x08;
    }
    let mut vp8x = vec![flags, 0, 0, 0];
    let w = width.saturating_sub(1).to_le_bytes();
    let h = height.saturating_sub(1).to_le_bytes();
    vp8x.extend_from_slice(&w[..3]);
    vp8x.extend_from_slice(&h[..3]);
    body.extend_from_slice(&webp_chunk(b"VP8X", &vp8x));
    if let Some(icc) = &metadata.icc {
        body.extend_from_slice(&webp_chunk(b"ICCP", icc));
    }
    let mut cursor = 12;
    while cursor + 8 <= output.len() {
        let length =
            u32::from_le_bytes(output[cursor + 4..cursor + 8].try_into().unwrap()) as usize;
        let end = cursor + 8 + length + (length & 1);
        if end > output.len() {
            break;
        }
        if &output[cursor..cursor + 4] != b"VP8X"
            && &output[cursor..cursor + 4] != b"ICCP"
            && &output[cursor..cursor + 4] != b"EXIF"
        {
            body.extend_from_slice(&output[cursor..end]);
        }
        cursor = end;
    }
    if let Some(exif) = &metadata.exif {
        body.extend_from_slice(&webp_chunk(b"EXIF", exif));
    }
    let mut result = b"RIFF".to_vec();
    result.extend_from_slice(&((body.len() + 4) as u32).to_le_bytes());
    result.extend_from_slice(b"WEBP");
    result.extend_from_slice(&body);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use crate::render::spec::OutputFormat;

    use super::{copy_metadata, extract, inject_jpeg, normalize_orientation, ImageMetadata};
    #[test]
    fn normalizes_little_endian_orientation() {
        let mut exif =
            b"II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0".to_vec();
        normalize_orientation(&mut exif);
        assert_eq!(&exif[18..20], &[1, 0]);
    }

    #[test]
    fn jpeg_copy_preserves_icc_and_normalizes_exif_orientation() {
        let directory = std::env::temp_dir().join(format!(
            "still-metadata-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let source = directory.join("source.jpg");
        let encoded = directory.join("encoded.jpg");
        let exif = b"II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0".to_vec();
        let icc = (0..80_000)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        fs::write(
            &source,
            inject_jpeg(
                &[0xff, 0xd8, 0xff, 0xd9],
                &ImageMetadata {
                    exif: Some(exif),
                    icc: Some(icc.clone()),
                },
            )
            .unwrap(),
        )
        .unwrap();
        fs::write(&encoded, [0xff, 0xd8, 0xff, 0xd9]).unwrap();
        copy_metadata(&source, &encoded, OutputFormat::Jpeg, 1, 1, true, true).unwrap();
        let copied = extract(&fs::read(&encoded).unwrap());
        assert_eq!(copied.icc.as_deref(), Some(icc.as_slice()));
        assert_eq!(&copied.exif.unwrap()[18..20], &[1, 0]);
        fs::remove_dir_all(directory).unwrap();
    }
}
