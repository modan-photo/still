import { Button } from '@mui/material';
import { useTranslation } from '../i18n/messages';

export function PresetRecoveryNotice({
  kind,
  backupKey,
  onDismiss,
}: {
  kind: 'frame' | 'watermark';
  backupKey: string;
  onDismiss: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="rounded-sm border border-subtle bg-app-surface p-2" role="alert">
      <p className="m-0 text-xs leading-5 text-primary">
        {t(kind === 'frame' ? 'framePresetsRecovered' : 'stampPresetsRecovered', {
          key: backupKey,
        })}
      </p>
      <Button size="small" onClick={onDismiss}>
        {t('dismiss')}
      </Button>
    </div>
  );
}
