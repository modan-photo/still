import { Alert, Box, Button, LinearProgress } from '@mui/material';
import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { cancelTask, normalizeError } from '../services/tauri/image';
import { errorMessage } from '../services/errorMessages';
import { useTranslation } from '../i18n/messages';

export function TaskProgressBar() {
  const t = useTranslation();
  const tasks = useTaskStore((state) => state.tasks);
  const dismiss = useTaskStore((state) => state.dismiss);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const active = Object.values(tasks).filter((task) => task.status === 'running');
  const exportStage =
    active.length === 1 && active[0].operation === 'image_export_batch'
      ? /^(Preparing|Exporting) (\d+)\/(\d+)$/.exec(active[0].stage)
      : null;
  const failed = Object.values(tasks).find((task) => task.status === 'failed');
  const cancel = async () => {
    setCancelError(null);
    for (const task of active) {
      try {
        await cancelTask(task.taskId);
      } catch (error) {
        if (useTaskStore.getState().tasks[task.taskId]?.status === 'running')
          setCancelError(errorMessage(normalizeError(error)));
      }
    }
  };
  return (
    <Box sx={{ flexShrink: 0 }}>
      {active.length > 0 && (
        <>
          <LinearProgress
            aria-label={t('imageProcessingProgress')}
            variant="determinate"
            value={active.reduce((sum, task) => sum + task.progress, 0) / active.length}
            sx={{
              height: 3,
              '& .MuiLinearProgress-bar': { transition: 'transform 240ms var(--motion-easing)' },
            }}
          />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              fontSize: 12,
            }}
          >
            <span role="status">
              {exportStage
                ? t(exportStage[1] === 'Preparing' ? 'progressPreparing' : 'progressExporting', {
                    done: exportStage[2],
                    total: exportStage[3],
                  })
                : t('processingTasks', { count: active.length })}
            </span>
            <Button size="small" onClick={() => void cancel()}>
              {t('cancel')}
            </Button>
          </Box>
        </>
      )}
      {failed && (
        <Alert severity="error" onClose={() => dismiss(failed.taskId)}>
          {failed.error}
        </Alert>
      )}
      {cancelError && (
        <Alert severity="error" onClose={() => setCancelError(null)}>
          {cancelError}
        </Alert>
      )}
    </Box>
  );
}
