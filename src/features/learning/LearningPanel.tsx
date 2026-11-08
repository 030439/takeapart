import { useEffect, useMemo } from 'react';
import { BUILTIN_TUTORIALS } from './builtinTutorials';
import { resolveComponentRef, unresolvedSteps } from './componentRefs';
import { canAdvance, progressOf, tutorialStatus } from './tutorial';
import { useLearningStore } from '@/stores/learningStore';
import { useModelRuntime } from '@/stores/modelRuntimeStore';
import { useTrackingStore } from '@/stores/trackingStore';
import type { ModelMeta } from '@/types/model';
import type { Tutorial } from '@/types/learning';

const btn = 'rounded-lg border border-white/10 px-2.5 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent';
const primary = 'rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-bg hover:bg-accent2 disabled:opacity-40 disabled:hover:bg-accent';

function Bar({ fraction }: { fraction: number }) {
  return (
    <div className="h-1 overflow-hidden rounded bg-surface" role="progressbar" aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(fraction * 100)}%` }} />
    </div>
  );
}

function ActiveTutorial() {
  const { active, next, back, skip, exit, start } = useLearningStore();
  const components = useModelRuntime((m) => m.components);
  const cameraOn = useTrackingStore((s) => s.camera === 'active');
  if (!active) return null;
  const { tutorial: t, state: s, key } = active;
  const p = progressOf(t, s);

  if (s.finished) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-accent2">Tutorial complete</p>
        <p className="text-xs text-mute">
          {t.title}: {p.completed} of {p.total} steps done{p.skipped ? `, ${p.skipped} skipped` : ''}.
        </p>
        <Bar fraction={1} />
        <div className="flex gap-2">
          <button className={btn} onClick={back}>Back</button>
          <button className={btn} onClick={() => start(key, t, true)}>Restart</button>
          <button className={primary} onClick={exit}>Close</button>
        </div>
      </div>
    );
  }

  const step = t.steps[s.index];
  const done = s.done[s.index];
  const unresolved = unresolvedSteps(t, components).includes(s.index);
  const target = step.action.type === 'select' && step.action.component ? resolveComponentRef(components, step.action.component) : null;
  const last = s.index === t.steps.length - 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-mute">
        <span>{t.title}</span>
        <span>Step {s.index + 1} of {t.steps.length}</span>
      </div>
      <Bar fraction={p.completed / p.total} />
      <p className="text-sm font-medium">{step.title}</p>
      <p className="text-xs whitespace-pre-line text-mute">{step.text}</p>
      {target && <p className="text-[11px] text-sky-300">Look for the highlighted part: {target.name}</p>}
      {unresolved && <p className="text-[11px] text-amber-300">This model has no component named “{step.action.type === 'select' ? step.action.component : ''}”. You can skip this step.</p>}
      {step.action.type === 'hand' && !cameraOn && <p className="text-[11px] text-amber-300">Turn the camera on to try this gesture, or skip the step.</p>}
      {step.action.type !== 'read' && (
        <p className={`text-xs ${done ? 'text-accent2' : 'text-mute'}`} aria-live="polite">{done ? '✓ Done' : 'Waiting for you to do this…'}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={s.index === 0} onClick={back}>Back</button>
        <button className={primary} disabled={!canAdvance(t, s)} onClick={next}>{last ? 'Finish' : 'Next'}</button>
        {step.action.type !== 'read' && !done && <button className={btn} onClick={skip}>Skip step</button>}
        <button className={btn} onClick={exit}>Exit</button>
      </div>
    </div>
  );
}

function TutorialList({ model }: { model: ModelMeta }) {
  const { saved, start } = useLearningStore();
  const validation = useModelRuntime((m) => m.validation);
  const status = useModelRuntime((m) => m.status);
  const hasParts = validation?.supportsComponents === true;

  const items = useMemo(
    () => [
      ...(model.tutorials ?? []).map((t) => ({ key: `${model.id}:${t.id}`, t, scope: 'This model' })),
      ...BUILTIN_TUTORIALS.map((t) => ({ key: `app:${t.id}`, t, scope: 'App' })),
    ],
    [model],
  );

  const badge = (t: Tutorial, key: string) => {
    const st = tutorialStatus(t, saved[key]);
    if (st === 'completed') return <span className="text-accent2">Completed</span>;
    if (st === 'in-progress') return <span className="text-sky-300">{progressOf(t, saved[key]).completed}/{t.steps.length} steps</span>;
    return <span className="text-mute">{t.steps.length} steps</span>;
  };

  return (
    <ul className="flex flex-col gap-2">
      {items.map(({ key, t, scope }) => {
        const blocked = status !== 'ready' || (t.requiresComponents && !hasParts);
        const st = tutorialStatus(t, saved[key]);
        return (
          <li key={key} className="rounded-lg border border-white/10 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium">{t.title}</p>
                <p className="text-[11px] text-mute">{scope}{t.needsCamera ? ' · needs camera' : ''}</p>
              </div>
              <span className="shrink-0 text-[11px]">{badge(t, key)}</span>
            </div>
            {t.summary && <p className="mt-1 text-[11px] text-mute">{t.summary}</p>}
            {blocked && status === 'ready' && <p className="mt-1 text-[11px] text-amber-300">This model has no separate components for this tutorial.</p>}
            <div className="mt-2 flex gap-2">
              <button className={st === 'in-progress' ? primary : btn} disabled={blocked} onClick={() => start(key, t)}>
                {st === 'in-progress' ? 'Resume' : st === 'completed' ? 'Review' : 'Start'}
              </button>
              {st !== 'new' && <button className={btn} disabled={blocked} onClick={() => start(key, t, true)}>Restart</button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function LearningPanel({ model }: { model: ModelMeta }) {
  const active = useLearningStore((s) => s.active);
  const exit = useLearningStore((s) => s.exit);
  useEffect(() => { exit(); }, [model.id, exit]); // a tutorial belongs to the model it was started on

  return (
    <section className="rounded-xl border border-white/10 bg-card p-3">
      <h3 className="mb-2 text-sm font-medium">Learning</h3>
      {model.overview && <p className="mb-2 text-xs text-mute">{model.overview}</p>}
      {model.sources && model.sources.length > 0 && (
        <details className="mb-2 text-[11px] text-mute">
          <summary className="cursor-pointer">Sources ({model.sources.length})</summary>
          <ul className="mt-1 list-disc pl-4">{model.sources.map((s) => <li key={s}>{s}</li>)}</ul>
        </details>
      )}
      {active ? <ActiveTutorial /> : <TutorialList model={model} />}
      <p className="mt-2 text-[11px] text-mute">Descriptions appear only where the model’s metadata provides them.</p>
    </section>
  );
}
