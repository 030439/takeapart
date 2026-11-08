import { useModelRuntime } from '@/stores/modelRuntimeStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const PRESETS = [25, 50, 75, 100];

export function ExplodeControls() {
  const level = useWorkspaceStore((s) => s.explodeTarget);
  const setExplode = useWorkspaceStore((s) => s.setExplode);
  const assemble = useWorkspaceStore((s) => s.assemble);
  const can = useModelRuntime((m) => m.validation?.supportsComponents === true);
  const pct = Math.round(level * 100);

  return (
    <div
      className="glass absolute bottom-16 left-1/2 flex max-w-[95%] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs"
      title={can ? undefined : 'This model has no separate components to explode.'}
    >
      <span className="text-mute">Explode</span>
      <input
        type="range" min={0} max={100} value={pct} disabled={!can} aria-label="Explosion amount"
        onChange={(e) => setExplode(+e.target.value / 100)}
        className="w-28 accent-accent disabled:opacity-40"
      />
      <span className="w-9 text-right tabular-nums">{pct}%</span>
      {PRESETS.map((p) => (
        <button
          key={p} disabled={!can} onClick={() => setExplode(p / 100)} aria-pressed={pct === p}
          className={`rounded-md border px-1.5 py-0.5 disabled:opacity-40 ${pct === p ? 'border-accent text-accent2' : 'border-white/10 text-mute hover:text-ink'}`}
        >
          {p}
        </button>
      ))}
      <button onClick={assemble} disabled={!can} className="rounded-lg bg-accent px-2.5 py-1 font-medium text-bg hover:bg-accent2 disabled:opacity-40">
        Assemble
      </button>
    </div>
  );
}
