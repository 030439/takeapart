import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { resolveComponentRef } from '@/features/learning/componentRefs';
import { getSnapshot } from '@/features/learning/snapshot';
import { applyEvent, backStep, isValidSession, newSession, nextStep, skipStep } from '@/features/learning/tutorial';
import type { LearningEvent, SessionState, Tutorial } from '@/types/learning';
import { useModelRuntime } from './modelRuntimeStore';
import { useWorkspaceStore } from './workspaceStore';

interface Active { key: string; tutorial: Tutorial; state: SessionState }

interface LearningStore {
  /** Progress by tutorial key. Persisted, so learners can resume and see what they have finished. */
  saved: Record<string, SessionState>;
  active: Active | null;
  start: (key: string, tutorial: Tutorial, restart?: boolean) => void;
  event: (e: LearningEvent) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  exit: () => void;
}

/** Highlights the part the current step asks for. */
function syncGuide(a: Active | null) {
  let id: string | null = null;
  if (a && !a.state.finished) {
    const act = a.tutorial.steps[a.state.index].action;
    if (act.type === 'select' && act.component) id = resolveComponentRef(useModelRuntime.getState().components, act.component)?.id ?? null;
  }
  useWorkspaceStore.getState().setGuide(id);
}

export const useLearningStore = create<LearningStore>()(
  persist(
    (set, get) => {
      const commit = (a: Active | null) => {
        set((s) => ({ active: a, saved: a ? { ...s.saved, [a.key]: a.state } : s.saved }));
        syncGuide(a);
      };
      const update = (fn: (a: Active) => SessionState) => {
        const a = get().active;
        if (!a) return;
        const state = fn(a);
        if (state !== a.state) commit({ ...a, state });
      };
      return {
        saved: {},
        active: null,
        start: (key, tutorial, restart = false) => {
          const prev = get().saved[key];
          const resume = !restart && isValidSession(tutorial, prev) && !prev.finished;
          commit({ key, tutorial, state: resume ? prev : newSession(tutorial, getSnapshot()) });
        },
        event: (e) => update((a) => applyEvent(a.tutorial, a.state, e)),
        next: () => update((a) => nextStep(a.tutorial, a.state, getSnapshot())),
        back: () => update((a) => backStep(a.state)),
        skip: () => update((a) => skipStep(a.tutorial, a.state, getSnapshot())),
        exit: () => { if (get().active) commit(null); },
      };
    },
    { name: 'takeapart-learning', partialize: (s) => ({ saved: s.saved }) },
  ),
);
