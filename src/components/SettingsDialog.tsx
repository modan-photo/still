import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Switch,
  TextField,
} from '@mui/material';
import { useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useTranslation } from '../i18n/messages';
import type { MessageKey } from '../i18n/messages';
import {
  applyWindowSizePreset,
  captureCustomWindowSize,
  desktopWindowAvailable,
  type WindowSizeMode,
} from '../services/windowPreferences';
import type { SingleKeyAction } from '../services/shortcutPreferences';
import { Icon } from './Icons';

type SettingsDialogProps = { open: boolean; onClose: () => void };

const MODIFIER_SHORTCUTS = [
  { label: 'importPhotos', keys: 'Ctrl/⌘ + O' },
  { label: 'undoEdit', keys: 'Ctrl/⌘ + Z' },
  { label: 'redoEdit', keys: 'Ctrl/⌘ + Shift + Z / Ctrl/⌘ + Y' },
  { label: 'shortcutInspectorTabs', keys: 'Ctrl/⌘ + 1–5' },
] as const satisfies ReadonlyArray<{ label: MessageKey; keys: string }>;

const SINGLE_KEY_SHORTCUTS = [
  { id: 'grid', label: 'gridView', keys: 'G' },
  { id: 'remove', label: 'removeCurrentPhoto', keys: 'Delete / Backspace' },
  { id: 'inspector', label: 'shortcutToggleInspector', keys: 'Tab' },
  { id: 'photoNavigation', label: 'shortcutPhotoNavigation', keys: '← / →' },
] as const satisfies ReadonlyArray<{ id: SingleKeyAction; label: MessageKey; keys: string }>;

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const t = useTranslation();
  const systemFontsEnabled = useUIStore((state) => state.systemFontsEnabled);
  const setSystemFontsEnabled = useUIStore((state) => state.setSystemFontsEnabled);
  const singleKeyShortcutsEnabled = useUIStore((state) => state.singleKeyShortcutsEnabled);
  const setSingleKeyShortcutsEnabled = useUIStore((state) => state.setSingleKeyShortcutsEnabled);
  const singleKeyActions = useUIStore((state) => state.singleKeyActions);
  const setSingleKeyActionEnabled = useUIStore((state) => state.setSingleKeyActionEnabled);
  const gridShortcutKey = useUIStore((state) => state.gridShortcutKey);
  const setGridShortcutKey = useUIStore((state) => state.setGridShortcutKey);
  const photoNavigationKeys = useUIStore((state) => state.photoNavigationKeys);
  const setPhotoNavigationKeys = useUIStore((state) => state.setPhotoNavigationKeys);
  const language = useUIStore((state) => state.language);
  const setLanguage = useUIStore((state) => state.setLanguage);
  const windowSizePreset = useUIStore((state) => state.windowSizePreset);
  const setWindowSizePreset = useUIStore((state) => state.setWindowSizePreset);
  const [windowSizeError, setWindowSizeError] = useState(false);
  const [windowSizePending, setWindowSizePending] = useState(false);

  const changeWindowSize = async (preset: WindowSizeMode) => {
    setWindowSizeError(false);
    setWindowSizePending(true);
    try {
      if (preset === 'custom') await captureCustomWindowSize();
      else await applyWindowSizePreset(preset);
      setWindowSizePreset(preset);
    } catch (error) {
      console.warn('Unable to change the window size', error);
      setWindowSizeError(true);
    } finally {
      setWindowSizePending(false);
    }
  };

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
        {desktopWindowAvailable() && (
          <section
            className="mb-3 rounded-lg border border-subtle bg-app-base p-4"
            aria-labelledby="window-settings-heading"
          >
            <h3 id="window-settings-heading" className="m-0 text-sm font-semibold text-primary">
              {t('windowSize')}
            </h3>
            <p className="mb-3 mt-1 text-xs leading-5 text-secondary">
              {t('windowSizeDescription')}
            </p>
            <TextField
              select
              fullWidth
              size="small"
              label={t('windowSize')}
              value={windowSizePreset}
              disabled={windowSizePending}
              error={windowSizeError}
              helperText={windowSizeError ? t('windowSizeError') : undefined}
              inputProps={{ 'aria-label': t('windowSize') }}
              onChange={(event) => void changeWindowSize(event.target.value as WindowSizeMode)}
            >
              <MenuItem value="default">{t('windowSizeDefault')}</MenuItem>
              <MenuItem value="compact">{t('windowSizeCompact')}</MenuItem>
              <MenuItem value="spacious">{t('windowSizeSpacious')}</MenuItem>
              <MenuItem value="custom">{t('windowSizeCustom')}</MenuItem>
            </TextField>
          </section>
        )}
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
          <div className="mt-3 space-y-2 border-t border-subtle pt-3">
            {SINGLE_KEY_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.id} className="flex items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="text-primary">{t(shortcut.label)}</div>
                  {shortcut.id === 'grid' ? (
                    <TextField
                      select
                      size="small"
                      value={gridShortcutKey}
                      disabled={!singleKeyShortcutsEnabled || !singleKeyActions.grid}
                      inputProps={{ 'aria-label': `${t(shortcut.label)} ${t('shortcutKeys')}` }}
                      onChange={(event) =>
                        setGridShortcutKey(event.target.value === 'v' ? 'v' : 'g')
                      }
                      sx={{ mt: 0.5, minWidth: 90 }}
                    >
                      <MenuItem value="g">G</MenuItem>
                      <MenuItem value="v">V</MenuItem>
                    </TextField>
                  ) : shortcut.id === 'photoNavigation' ? (
                    <TextField
                      select
                      size="small"
                      value={photoNavigationKeys}
                      disabled={!singleKeyShortcutsEnabled || !singleKeyActions.photoNavigation}
                      inputProps={{ 'aria-label': `${t(shortcut.label)} ${t('shortcutKeys')}` }}
                      onChange={(event) =>
                        setPhotoNavigationKeys(event.target.value === 'jl' ? 'jl' : 'arrows')
                      }
                      sx={{ mt: 0.5, minWidth: 110 }}
                    >
                      <MenuItem value="arrows">← / →</MenuItem>
                      <MenuItem value="jl">J / L</MenuItem>
                    </TextField>
                  ) : (
                    <div className="font-mono text-secondary">{shortcut.keys}</div>
                  )}
                </div>
                <Switch
                  size="small"
                  inputProps={{ 'aria-label': t(shortcut.label) }}
                  disabled={!singleKeyShortcutsEnabled}
                  checked={singleKeyActions[shortcut.id]}
                  onChange={(event) => setSingleKeyActionEnabled(shortcut.id, event.target.checked)}
                />
              </div>
            ))}
          </div>
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
