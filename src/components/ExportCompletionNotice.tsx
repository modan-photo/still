import {
  Alert,
  alpha,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  SnackbarContent,
} from '@mui/material';
import { platform } from '@tauri-apps/plugin-os';
import { isTauri } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { useState } from 'react';
import type { BatchExportReport } from '../types/export';
import { errorMessage } from '../services/errorMessages';
import { normalizeError } from '../services/tauri/image';
import { useTranslation } from '../i18n/messages';

type Props = {
  report: BatchExportReport | null;
  open: boolean;
  onClose: () => void;
  canRetry: boolean;
  onRetry: () => void;
};

export function ExportCompletionNotice({ report, open, onClose, canRetry, onRetry }: Props) {
  const t = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  if (!report) return null;
  const mobile = isTauri() && platform() === 'android';
  const summary = [
    report.cancellationRequested ? t('cancelledSummary') : null,
    t('exportedSummary', { count: report.succeeded }),
    t('failedSummary', { count: report.failed }),
    report.skipped ? t('skippedSummary', { count: report.skipped }) : null,
    report.cancelled ? t('notExportedSummary', { count: report.cancelled }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const needsAttention = report.failed > 0 || report.cancellationRequested;
  const showDetails = () => {
    onClose();
    setFolderError(null);
    setDetailsOpen(true);
  };
  const retry = () => {
    setDetailsOpen(false);
    onClose();
    onRetry();
  };
  const openFolder = async () => {
    try {
      await openPath(report.outputDirectory);
    } catch (error) {
      setFolderError(errorMessage(normalizeError(error)));
      onClose();
      setDetailsOpen(true);
    }
  };
  return (
    <>
      <Snackbar
        open={open}
        autoHideDuration={needsAttention ? null : 8_000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        onClose={(_, reason) => reason !== 'clickaway' && onClose()}
      >
        <SnackbarContent
          role="status"
          message={
            <div>
              <div>{summary}</div>
              {mobile && (
                <div className="mt-0.5 max-w-[52vw] truncate text-[11px] opacity-70">
                  {t('savedTo', { path: report.outputDirectory })}
                </div>
              )}
            </div>
          }
          action={
            <div className="flex items-center">
              <Button size="small" onClick={showDetails}>
                {t('details')}
              </Button>
              {!mobile && (
                <Button size="small" onClick={() => void openFolder()}>
                  {t('openFolder')}
                </Button>
              )}
              <Button size="small" onClick={onClose}>
                {t('dismiss')}
              </Button>
            </div>
          }
          sx={(theme) => {
            const colors = theme.still.colors[theme.palette.mode];
            return {
              minWidth: 0,
              color: colors.text.primary,
              backgroundColor: alpha(colors.bg.elevated, theme.still.glass.backgroundOpacity),
              backgroundImage: 'none',
              border: `1px solid ${colors.border.subtle}`,
              borderRadius: `${theme.still.radius.lg}px`,
              boxShadow: theme.still.shadow.elev3,
              backdropFilter: theme.still.glass.backdropFilter,
              '& .MuiSnackbarContent-action': { marginRight: 0 },
            };
          }}
        />
      </Snackbar>
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="export-report-title"
      >
        <DialogTitle id="export-report-title">{t('exportReport')}</DialogTitle>
        <DialogContent dividers>
          <div className="mb-4 text-sm text-secondary">{summary}</div>
          {folderError && (
            <Alert severity="error" onClose={() => setFolderError(null)}>
              {folderError}
            </Alert>
          )}
          <div className="space-y-3">
            {report.results.map((item) => (
              <div key={item.itemId} className="rounded-md border border-subtle p-3">
                <div className="truncate text-sm text-primary" title={item.sourcePath}>
                  {item.sourcePath.split(/[\\/]/).pop()} ·{' '}
                  {t(
                    item.status === 'success'
                      ? 'statusSucceeded'
                      : item.status === 'failed'
                        ? 'statusFailed'
                        : item.status === 'skipped'
                          ? 'statusSkipped'
                          : 'statusCancelled',
                  )}
                </div>
                {item.outputPath && (
                  <div className="mt-1 break-all text-xs text-secondary">{item.outputPath}</div>
                )}
                {item.code && (
                  <div className="mt-1 text-xs leading-5 text-secondary">
                    {errorMessage({ code: item.code, message: item.message ?? '' })}
                  </div>
                )}
                {item.message && (
                  <details className="mt-1 text-xs text-secondary">
                    <summary>{t('technicalDetails')}</summary>
                    <div className="mt-1 break-all">
                      {item.code}: {item.message}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
          {canRetry && <p className="mb-0 text-xs leading-5 text-secondary">{t('retryHint')}</p>}
        </DialogContent>
        <DialogActions>
          {canRetry && <Button onClick={retry}>{t('retryUnfinished')}</Button>}
          <Button onClick={() => setDetailsOpen(false)}>{t('close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
