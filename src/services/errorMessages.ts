/** Stable codes are the UI boundary; retain backend messages in report details. */
import { translate, type MessageKey } from '../i18n/messages';
import { useUIStore } from '../stores/uiStore';

export function errorMessage(error: { code: string; message: string }): string {
  if (error.code === 'document_cleanup_required') return error.message;
  const messages: Record<string, MessageKey> = {
    cancelled: 'errorCancelled',
    file_busy: 'errorFileBusy',
    file_read_only: 'errorFileReadOnly',
    document_write_unsupported: 'errorDocumentWriteUnsupported',
    document_export_unsupported: 'errorDocumentExportUnsupported',
    document_overwrite_unsupported: 'errorDocumentOverwriteUnsupported',
    io_error: 'errorIo',
    image_error: 'errorImage',
    exif_error: 'errorExif',
    resize_error: 'errorResize',
    unsupported: 'errorUnsupported',
  };
  const key = messages[error.code];
  return key ? translate(useUIStore.getState().language, key) : error.message;
}
