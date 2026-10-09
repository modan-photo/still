import { Dialog, DialogContent, DialogTitle, IconButton, MenuItem, Switch, TextField } from '@mui/material';
import { useUIStore } from '../stores/uiStore';
import { useTranslation } from '../i18n/messages';
import { Icon } from './Icons';

type SettingsDialogProps = { open: boolean; onClose: () => void };

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const t = useTranslation();
  const systemFontsEnabled = useUIStore((state) => state.systemFontsEnabled);
  const setSystemFontsEnabled = useUIStore((state) => state.setSystemFontsEnabled);
  const language = useUIStore((state) => state.language);
  const setLanguage = useUIStore((state) => state.setLanguage);

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="settings-title">
    <DialogTitle id="settings-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
      <span>{t('settingsTitle')}</span>
      <IconButton aria-label={t('closeSettings')} size="small" onClick={onClose}><Icon name="close" size={16} /></IconButton>
    </DialogTitle>
    <DialogContent sx={{ pb: 3 }}>
      <section className="mb-3 rounded-lg border border-subtle bg-app-base p-4" aria-labelledby="language-settings-heading">
        <h3 id="language-settings-heading" className="m-0 text-sm font-semibold text-primary">{t('language')}</h3>
        <p className="mb-3 mt-1 text-xs leading-5 text-secondary">{t('languageDescription')}</p>
        <TextField
          select fullWidth size="small" label={t('language')} value={language}
          inputProps={{ 'aria-label': t('language') }}
          onChange={(event) => setLanguage(event.target.value === 'zh' ? 'zh' : 'en')}
        >
          <MenuItem value="en">{t('english')}</MenuItem>
          <MenuItem value="zh">{t('chinese')}</MenuItem>
        </TextField>
      </section>
      <section className="rounded-lg border border-subtle bg-app-base p-4" aria-labelledby="font-settings-heading">
        <div className="flex items-start justify-between gap-5">
          <div>
            <h3 id="font-settings-heading" className="m-0 text-sm font-semibold text-primary">{t('systemFonts')}</h3>
            <p className="mb-0 mt-1 text-xs leading-5 text-secondary">{t('systemFontsDescription')}</p>
          </div>
          <Switch inputProps={{ 'aria-label': t('systemFonts') }} checked={systemFontsEnabled} onChange={(event) => setSystemFontsEnabled(event.target.checked)} />
        </div>
        <p className="mb-0 mt-3 border-t border-subtle pt-3 text-[10px] leading-4 text-secondary">
          {systemFontsEnabled ? t('systemFontsEnabled') : t('systemFontsDisabled')}
        </p>
      </section>
    </DialogContent>
  </Dialog>;
}
