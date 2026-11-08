import type { ReactNode } from 'react';
import { HandTrackingPanel } from '@/features/hand-tracking/HandTrackingPanel';
import { GesturePanel } from '@/features/gestures/GesturePanel';
import { HandControlPanel } from './HandControlPanel';
import { ParticlePanel } from '@/features/particle-engine/ParticlePanel';
import { LearningPanel } from '@/features/learning/LearningPanel';
import { parentOf, resolveRelated } from '@/features/learning/componentRefs';
import type { ComponentInfo, ModelMeta } from '@/types/model';
import { useModelRuntime } from '@/stores/modelRuntimeStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-card p-3">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Tree({ items, parentId, depth }: { items: ComponentInfo[]; parentId?: string; depth: number }) {
  const { selectedComponentId, selectComponent, guideComponentId } = useWorkspaceStore();
  return (
    <ul>
      {items.filter((p) => p.parentId === parentId).map((p) => (
        <li key={p.id}>
          {p.kind === 'assembly' ? (
            <div style={{ paddingLeft: 8 + depth * 14 }} className="py-1 text-xs font-medium text-ink">{p.name}</div>
          ) : (
            <button
              onClick={() => selectComponent(p.id)}
              style={{ paddingLeft: 8 + depth * 14 }}
              className={`w-full rounded py-1 pr-2 text-left text-xs ${selectedComponentId === p.id ? 'bg-accent/15 text-accent2' : 'text-mute hover:text-ink'} ${guideComponentId === p.id ? 'ring-1 ring-sky-400' : ''}`}
            >
              {p.name}
            </button>
          )}
          <Tree items={items} parentId={p.id} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

const Field = ({ label, value }: { label: string; value?: string }) =>
  value ? <p className="mt-1 text-xs text-mute"><span className="text-ink">{label}: </span>{value}</p> : null;

function Relations({ part, components }: { part: ComponentInfo; components: ComponentInfo[] }) {
  const select = useWorkspaceStore((s) => s.selectComponent);
  const links = resolveRelated(part, components);
  if (links.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-mute">
      <span className="text-ink">Related: </span>
      {links.map((l, i) => (
        <span key={`${l.label}-${i}`}>
          {i > 0 && ', '}
          {l.id ? <button className="text-accent2 underline-offset-2 hover:underline" onClick={() => select(l.id!)}>{l.label}</button> : l.label}
        </span>
      ))}
    </p>
  );
}

export function InteractionPanel({ model }: { model: ModelMeta }) {
  const selectedId = useWorkspaceStore((s) => s.selectedComponentId);
  const { components, validation, stats } = useModelRuntime();
  const part = components.find((c) => c.id === selectedId && c.kind === 'part');
  const hasText = part && (part.description || part.purpose || part.function);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <HandTrackingPanel />
      <GesturePanel />
      <HandControlPanel />
      <ParticlePanel />
      <Section title="Model">
        <p className="text-sm">{model.name}</p>
        <p className="mt-1 text-xs text-mute">{model.description}</p>
        {stats && (
          <p className="mt-2 text-[11px] text-mute">
            {stats.meshes} mesh{stats.meshes === 1 ? '' : 'es'} · {stats.triangles.toLocaleString()} triangles · loaded in {stats.loadMs} ms
          </p>
        )}
        {validation && !validation.supportsComponents && <p className="mt-2 text-xs text-amber-300">{validation.message}</p>}
      </Section>
      <Section title="Selected component">
        {part ? (
          <>
            <p className="text-sm">{part.name}</p>
            {part.name !== part.nodeName && <p className="text-[11px] text-mute">File node: {part.nodeName}</p>}
            <Field label="Part of" value={parentOf(part, components)?.name} />
            <Field label="Description" value={part.description} />
            <Field label="Purpose" value={part.purpose} />
            <Field label="Function" value={part.function} />
            <Relations part={part} components={components} />
            {!hasText && <p className="mt-1 text-xs text-mute">No curated description for this component.</p>}
          </>
        ) : (
          <p className="text-xs text-mute">Click a part in the viewport or the hierarchy.</p>
        )}
      </Section>
      <Section title="Component hierarchy">
        {components.length ? <Tree items={components} depth={0} /> : <p className="text-xs text-mute">No separate components.</p>}
      </Section>
      <LearningPanel model={model} />
    </div>
  );
}
