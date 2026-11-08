import { PARTICLE_COUNTS } from './particlePresets';
import { useParticleStore } from '@/stores/particleStore';

const btn = 'rounded-lg border border-white/10 px-2.5 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent';

export function ParticlePanel() {
  const p = useParticleStore();
  const solid = p.state === 'solid';
  const b = p.benchmark;
  const stateText = solid ? 'Solid model' : p.busy ? 'Particles (moving)' : p.restKind === 'cloud' ? 'Particles (scattered)' : 'Particles (on the surface)';

  return (
    <section className="rounded-xl border border-white/10 bg-card p-3">
      <h3 className="mb-2 text-sm font-medium">Particles</h3>
      {!p.supported ? (
        <p className="text-xs text-amber-300">This browser has no WebGL2, which the particle engine needs. Particle effects are unavailable.</p>
      ) : (
        <>
          <p className="text-xs">State: <span className="text-accent2">{stateText}</span>{p.activeCount > 0 && <span className="text-mute"> · {p.activeCount.toLocaleString()} drawn</span>}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className={`${btn} bg-accent/15 text-accent2`} onClick={() => p.dispatch(solid ? 'dissolve' : 'reconstruct')}>
              {solid ? 'Turn into particles' : 'Reconstruct model'}
            </button>
            <button className={btn} disabled={solid} onClick={() => p.dispatch('burst')}>Burst</button>
            <button className={btn} disabled={solid} onClick={() => p.dispatch('disperse')}>Disperse</button>
            <button className={btn} disabled={solid} aria-pressed={p.attract} onClick={() => p.patch({ attract: !p.attract })}>
              Attract {p.attract ? 'on' : 'off'}
            </button>
          </div>
          <label className="mt-3 flex items-center justify-between gap-2 text-xs">
            <span className="text-mute">Density</span>
            <select value={p.count} onChange={(e) => p.patch({ count: +e.target.value })} className="rounded border border-white/10 bg-surface px-1.5 py-1">
              {PARTICLE_COUNTS.map((c) => <option key={c} value={c}>{c.toLocaleString()}</option>)}
            </select>
          </label>
          {p.count >= 250_000 && <p className="mt-1 text-[11px] text-amber-300">250,000 particles is heavy. Expect low frame rates on integrated graphics.</p>}
          <div className="mt-3 border-t border-white/10 pt-3">
            <button className={btn} disabled={b.running} onClick={() => p.dispatch('benchmark')}>{b.running ? 'Benchmarking…' : 'Benchmark this device'}</button>
            {b.running && b.label && <p className="mt-1 text-[11px] text-mute">{b.label}</p>}
            {b.error && <p className="mt-1 text-[11px] text-amber-300">{b.error}</p>}
            {b.results.length > 0 && (
              <table className="mt-2 w-full text-[11px]">
                <thead className="text-mute"><tr><th className="text-left font-normal">Particles</th><th className="text-right font-normal">FPS</th><th className="text-right font-normal">Frame</th><th className="text-right font-normal">Sampling</th></tr></thead>
                <tbody>
                  {b.results.map((r) => (
                    <tr key={r.count}><td>{r.count.toLocaleString()}</td><td className="text-right">{r.fps.toFixed(0)}</td><td className="text-right">{r.frameMs.toFixed(1)} ms</td><td className="text-right">{r.sampleMs.toFixed(0)} ms</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-1 text-[11px] text-mute">FPS is capped by your display's refresh rate, so every row can read the same until the GPU falls behind.</p>
          </div>
        </>
      )}
    </section>
  );
}
