import { Alert, Box, Button, LinearProgress } from '@mui/material';
import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { cancelTask, normalizeError } from '../services/tauri/image';

export function TaskProgressBar() {
  const tasks = useTaskStore((state) => state.tasks);
  const dismiss = useTaskStore((state) => state.dismiss);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const active = Object.values(tasks).filter((task) => task.status === 'running');
  const failed = Object.values(tasks).find((task) => task.status === 'failed');
  const cancel = async () => {
    setCancelError(null);
    for (const task of active) {
      try { await cancelTask(task.taskId); } catch (error) {
        if (useTaskStore.getState().tasks[task.taskId]?.status === 'running') setCancelError(normalizeError(error).message);
      }
    }
  };
  return <Box sx={{ flexShrink: 0 }}>
    {active.length > 0 && <>
      <LinearProgress aria-label="Image processing progress" variant="determinate" value={active.reduce((sum, task) => sum + task.progress, 0) / active.length} sx={{ height: 3 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, fontSize: 12 }}>
        <span role="status">Processing {active.length} task(s)…</span><Button size="small" onClick={() => void cancel()}>Cancel active tasks</Button>
      </Box>
    </>}
    {failed && <Alert severity="error" onClose={() => dismiss(failed.taskId)}>{failed.error}</Alert>}
    {cancelError && <Alert severity="error" onClose={() => setCancelError(null)}>{cancelError}</Alert>}
  </Box>;
}
