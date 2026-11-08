import { useEffect, useState } from 'react';
import type { ModelMeta } from '@/types/model';
import { useModelRuntime } from '@/stores/modelRuntimeStore';
import { componentsFromMeta } from './catalog';
import { ModelLoadError, modelLoader, type LoadedModel } from './ModelLoader';

/** Loads the selected model, publishes status to the runtime store, and releases it on change or unmount. */
export function useModelSession(model: ModelMeta): { loaded: LoadedModel | null; retry: () => void } {
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const rt = useModelRuntime.getState();
    let cancelled = false;
    setLoaded(null);

    if (model.source === 'procedural') {
      rt.set({
        status: 'ready', progress: null, error: null, components: componentsFromMeta(model), stats: null,
        validation: { kind: 'multi-part', supportsComponents: true, meshCount: model.components.length, curatedCount: 0 },
      });
      return () => rt.reset();
    }

    rt.set({ status: 'loading', progress: null, error: null, components: [], validation: null, stats: null });
    modelLoader.retain(model.id);
    modelLoader
      .load(model, (p) => { if (!cancelled) useModelRuntime.getState().set({ progress: p }); })
      .then((m) => {
        if (cancelled) return;
        modelLoader.resetTransforms(m);
        setLoaded(m);
        useModelRuntime.getState().set({ status: 'ready', progress: 1, components: m.components, validation: m.validation, stats: m.stats });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        useModelRuntime.getState().set({ status: 'error', error: e instanceof ModelLoadError ? e.message : 'The model failed to load.' });
      });

    return () => {
      cancelled = true;
      modelLoader.release(model.id);
      useModelRuntime.getState().reset();
    };
  }, [model, attempt]);

  return { loaded, retry: () => setAttempt((n) => n + 1) };
}
