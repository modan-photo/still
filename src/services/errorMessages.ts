/** Stable codes are the UI boundary; retain backend messages in report details. */
export function errorMessage(error: { code: string; message: string }): string {
  if (error.code === 'document_cleanup_required') return error.message;
  const messages: Record<string, string> = {
    cancelled: 'Operation cancelled.',
    file_busy: 'The file is in use. Close it in other applications and try again.',
    file_read_only: 'The file is read-only. Choose a writable location or change its permissions.',
    document_write_unsupported:
      'EXIF writeback to Android documents is not available yet. Your original photo has not been changed.',
    document_export_unsupported:
      'Export to Android document-provider locations is not available yet. No destination was written.',
    document_overwrite_unsupported:
      'Android document overwrite is unavailable. Choose Skip or Rename automatically.',
    io_error:
      'The file could not be written or read. Check the folder, permissions and available space.',
    image_error: 'The image could not be processed. It may be damaged or unsupported.',
    exif_error: 'The image metadata could not be processed.',
    resize_error: 'The image could not be resized. Try a smaller output size.',
    unsupported: 'This operation is unavailable here. Use the native Still application.',
  };
  return messages[error.code] ?? error.message;
}
