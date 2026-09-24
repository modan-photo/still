import { create } from 'zustand';
import type { TaskProgress } from '../types/image';
interface TaskState {
  tasks: Record<string, TaskProgress>;
  receive: (task: TaskProgress) => void;
  dismiss: (id: string) => void;
}
export const useTaskStore = create<TaskState>((set) => ({
  tasks: {},
  receive: (task) => set((state) => {
    const previous = state.tasks[task.taskId];
    // Late events must not resurrect a task settled by its invoke response.
    if (previous && previous.status !== 'running') return state;
    const tasks = { ...state.tasks, [task.taskId]: { ...task, progress: Math.min(100, Math.max(0, task.progress)) } };
    const completed = Object.values(tasks).filter((entry) => entry.status !== 'running');
    for (const stale of completed.slice(0, Math.max(0, completed.length - 100))) delete tasks[stale.taskId];
    return { tasks };
  }),
  dismiss: (id) => set((state) => {
    if (state.tasks[id]?.status === 'running') return state;
    const tasks = { ...state.tasks }; delete tasks[id]; return { tasks };
  }),
}));
