import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Switch,
  TextField,
} from '@mui/material';
import { useUIStore } from '../stores/uiStore';
import { useTranslation } from '../i18n/messages';
import type { MessageKey } from '../i18n/messages';
import { Icon } from './Icons';

type SettingsDialogProps = { open: boolean; onClose: () => void };

const MODIFIER_SHORTCUTS = [
  { label: 'importPhotos', keys: 'Ctrl/⌘ + O' },
  { label: 'undoEdit', keys: 'Ctrl/⌘ + Z' },
  { label: 'redoEdit', keys: 'Ctrl/⌘ + Shift + Z / Ctrl/⌘ + Y' },
  { label: 'shortcutInspectorTabs', keys: 'Ctrl/⌘ + 1–5' },
] as const satisfies ReadonlyArray<{ label: MessageKey; keys: string }>;

const SINGLE_KEY_SHORTCUTS = [
  { label: 'gridView', keys: 'G' },
  { label: 'removeCurrentPhoto', keys: 'Delete / Backspace' },
  { label: 'shortcutToggleInspector', keys: 'Tab' },
  { label: 'shortcutPhotoNavigation', keys: '← / →' },
] as const satisfies ReadonlyArray<{ label: MessageKey; keys: string }>;

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const t = useTranslation();
  const systemFontsEnabled = useUIStore((state) => state.systemFontsEnabled);
  const setSystemFontsEnabled = useUIStore((state) => state.setSystemFontsEnabled);
  const singleKeyShortcutsEnabled = useUIStore((state) => state.singleKeyShortcutsEnabled);
  const setSingleKeyShortcutsEnabled = useUIStore((state) => state.setSingleKeyShortcutsEnabled);
  const language = useUIStore((state) => state.language);
  const setLanguage = useUIStore((state) => state.setLanguage);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="settings-title">
      <DialogTitle
        id="settings-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
      >
        <span>{t('settingsTitle')}</span>
        <IconButton aria-label={t('closeSettings')} size="small" onClick={onClose}>
          <Icon name="close" size={16} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        <section
          className="mb-3 rounded-lg border border-subtle bg-app-base p-4"
          aria-labelledby="language-settings-heading"
        >
          <h3 id="language-settings-heading" className="m-0 text-sm font-semibold text-primary">
            {t('language')}
          </h3>
          <p className="mb-3 mt-1 text-xs leading-5 text-secondary">{t('languageDescription')}</p>
          <TextField
            select
            fullWidth
            size="small"
            label={t('language')}
            value={language}
            inputProps={{ 'aria-label': t('language') }}
            onChange={(event) => setLanguage(event.target.value === 'zh' ? 'zh' : 'en')}
          >
            <MenuItem value="en">{t('english')}</MenuItem>
            <MenuItem value="zh">{t('chinese')}</MenuItem>
          </TextField>
        </section>
        <section
          className="mb-3 rounded-lg border border-subtle bg-app-base p-4"
          aria-labelledby="shortcut-settings-heading"
        >
          <h3 id="shortcut-settings-heading" className="m-0 text-sm font-semibold text-primary">
            {t('keyboardShortcuts')}
          </h3>
          <p className="mb-3 mt-1 text-xs leading-5 text-secondary">
            {t('keyboardShortcutsDescription')}
          </p>
          <dl className="m-0 space-y-2 text-xs">
            {MODIFIER_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.label} className="flex justify-between gap-3">
                <dt className="text-secondary">{t(shortcut.label)}</dt>
                <dd className="m-0 shrink-0 text-right font-mono text-primary">{shortcut.keys}</dd>
              </div>
            ))}
          </dl>
          <div className="my-3 border-t border-subtle" />
          <div className="flex items-start justify-between gap-5">
            <div>
              <h4 className="m-0 text-xs font-semibold text-primary">{t('singleKeyShortcuts')}</h4>
              <p className="mb-0 mt-1 text-xs leading-5 text-secondary">
                {t('singleKeyShortcutsDescription')}
              </p>
            </div>
            <Switch
              inputProps={{ 'aria-label': t('singleKeyShortcuts') }}
              checked={singleKeyShortcutsEnabled}
              onChange={(event) => setSingleKeyShortcutsEnabled(event.target.checked)}
            />
          </div>
          <dl className="mb-0 mt-3 space-y-2 text-xs" aria-disabled={!singleKeyShortcutsEnabled}>
            {SINGLE_KEY_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.label} className="flex justify-between gap-3">
                <dt className="text-secondary">{t(shortcut.label)}</dt>
                <dd className="m-0 shrink-0 text-right font-mono text-primary">{shortcut.keys}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section
          className="rounded-lg border border-subtle bg-app-base p-4"
          aria-labelledby="font-settings-heading"
        >
          <div className="flex items-start justify-between gap-5">
            <div>
              <h3 id="font-settings-heading" className="m-0 text-sm font-semibold text-primary">
                {t('systemFonts')}
              </h3>
              <p className="mb-0 mt-1 text-xs leading-5 text-secondary">
                {t('systemFontsDescription')}
              </p>
            </div>
            <Switch
              inputProps={{ 'aria-label': t('systemFonts') }}
              checked={systemFontsEnabled}
              onChange={(event) => setSystemFontsEnabled(event.target.checked)}
            />
          </div>
          <p className="mb-0 mt-3 border-t border-subtle pt-3 text-[10px] leading-4 text-secondary">
            {systemFontsEnabled ? t('systemFontsEnabled') : t('systemFontsDisabled')}
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
