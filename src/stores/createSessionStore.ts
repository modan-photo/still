import { create, type StateCreator, type StoreApi, type UseBoundStore } from 'zustand';

/** Reuse HMR memory while replacing actions with the current implementation. */
export function createSessionStore<T extends object>(
  initializer: StateCreator<T>,
  previous?: UseBoundStore<StoreApi<T>>,
): UseBoundStore<StoreApi<T>> {
  if (!previous) return create<T>()(initializer);

  const state = previous.getState();
  const refreshed = initializer(previous.setState, previous.getState, previous);
  for (const key of Object.keys(state) as Array<keyof T>) {
    if (key in refreshed && typeof state[key] !== 'function') refreshed[key] = state[key];
  }
  previous.setState(refreshed, true);
  return previous;
}
