import { alpha, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, SnackbarContent } from '@mui/material';
import { platform } from '@tauri-apps/plugin-os';
import { openPath } from '@tauri-apps/plugin-opener';
import { useState } from 'react';
import type { BatchExportReport } from '../types/export';

type Props = { report: BatchExportReport | null; open: boolean; onClose: () => void };

export function ExportCompletionNotice({ report, open, onClose }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!report) return null;
  const mobile = platform() === 'android';
  const summary = `Exported ${report.succeeded} · Failed ${report.failed}${report.skipped ? ` · Skipped ${report.skipped}` : ''}`;
  const showDetails = () => { onClose(); setDetailsOpen(true); };
  return <>
    <Snackbar open={open} autoHideDuration={8_000} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} onClose={(_, reason) => reason !== 'clickaway' && onClose()}>
      <SnackbarContent role="status" message={<div><div>{summary}</div>{mobile && <div className="mt-0.5 max-w-[52vw] truncate text-[11px] opacity-70">Saved to {report.outputDirectory}</div>}</div>}
        action={<div className="flex items-center">
          {report.failed > 0 && <Button size="small" onClick={showDetails}>Details</Button>}
          {!mobile && <Button size="small" onClick={() => void openPath(report.outputDirectory)}>Open folder</Button>}
        </div>}
        sx={(theme) => { const colors = theme.still.colors[theme.palette.mode]; return { minWidth: 0, color: colors.text.primary, backgroundColor: alpha(colors.bg.elevated, theme.still.glass.backgroundOpacity), backgroundImage: 'none', border: `1px solid ${colors.border.subtle}`, borderRadius: `${theme.still.radius.lg}px`, boxShadow: theme.still.shadow.elev3, backdropFilter: theme.still.glass.backdropFilter, '& .MuiSnackbarContent-action': { marginRight: 0 } }; }} />
    </Snackbar>
    <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} fullWidth maxWidth="sm" aria-labelledby="export-failures-title">
      <DialogTitle id="export-failures-title">Export report</DialogTitle>
      <DialogContent dividers>
        <div className="mb-4 text-sm text-secondary">{summary}</div>
        <div className="space-y-3">{report.failures.map((failure) => <div key={failure.sourcePath} className="rounded-md border border-subtle p-3"><div className="truncate text-sm text-primary" title={failure.sourcePath}>{failure.sourcePath.split(/[\\/]/).pop()}</div><div className="mt-1 text-xs leading-5 text-secondary">{failure.reason}</div></div>)}</div>
      </DialogContent>
      <DialogActions><Button onClick={() => setDetailsOpen(false)}>Close</Button></DialogActions>
    </Dialog>
  </>;
}
