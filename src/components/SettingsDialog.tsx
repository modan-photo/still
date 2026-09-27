import { Dialog, DialogContent, DialogTitle, IconButton, Switch } from '@mui/material';
import { useUIStore } from '../stores/uiStore';
import { Icon } from './Icons';

type SettingsDialogProps = { open: boolean; onClose: () => void };

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const systemFontsEnabled = useUIStore((state) => state.systemFontsEnabled);
  const setSystemFontsEnabled = useUIStore((state) => state.setSystemFontsEnabled);

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="settings-title">
    <DialogTitle id="settings-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
      <span>Application settings</span>
      <IconButton aria-label="Close settings" size="small" onClick={onClose}><Icon name="close" size={16} /></IconButton>
    </DialogTitle>
    <DialogContent sx={{ pb: 3 }}>
      <section className="rounded-lg border border-subtle bg-app-base p-4" aria-labelledby="font-settings-heading">
        <div className="flex items-start justify-between gap-5">
          <div>
            <h3 id="font-settings-heading" className="m-0 text-sm font-semibold text-primary">Use system fonts</h3>
            <p className="mb-0 mt-1 text-xs leading-5 text-secondary">Allow stamp fonts installed on this device. Keep this off for portable presets and identical rendering across computers.</p>
          </div>
          <Switch inputProps={{ 'aria-label': 'Use system fonts' }} checked={systemFontsEnabled} onChange={(event) => setSystemFontsEnabled(event.target.checked)} />
        </div>
        <p className="mb-0 mt-3 border-t border-subtle pt-3 text-[10px] leading-4 text-secondary">
          {systemFontsEnabled ? 'System fonts are available. They are enumerated once and cached for this session.' : 'Only the five fonts bundled with Still are available.'}
        </p>
      </section>
    </DialogContent>
  </Dialog>;
}
