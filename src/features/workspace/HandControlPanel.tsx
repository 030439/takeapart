import { useModelRuntime } from '@/stores/modelRuntimeStore';
import { useInteractionSettings, useInteractionStatus } from '@/stores/interactionStore';

export function HandControlPanel() {
  const s = useInteractionSettings();
  const { mode, detail } = useInteractionStatus();
  const components = useModelRuntime((m) => m.components);
  const name = components.find((c) => c.id === detail)?.name;
  const status = {
    idle: 'Idle',
    inspecting: 'Inspecting',
    dragging: `Dragging ${name ?? 'part'}`,
    rotating: 'Rotating model',
    exploding: 'Adjusting explosion',
    'two-hand': name ? `Scaling ${name}` : 'Zooming and twisting',
  }[mode];

  return (
    <section className="rounded-xl border border-white/10 bg-card p-3">
      <h3 className="mb-2 text-sm font-medium">Hand control</h3>
      <label className="flex items-center justify-between text-xs">
        <span className="text-mute">Control the model with hands</span>
        <input type="checkbox" className="accent-accent" checked={s.enabled} onChange={(e) => s.set({ enabled: e.target.checked })} />
      </label>
      <p className="mt-2 text-xs">Mode: <span className="text-accent2">{s.enabled ? status : 'Off'}</span></p>
      <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 text-xs">
        <label className="flex items-center justify-between gap-3">
          <span className="text-mute">Reach</span>
          <input type="range" min={0.5} max={2} step={0.1} value={s.gain} className="w-28 accent-accent" onChange={(e) => s.set({ gain: +e.target.value })} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-mute">Cursor smoothing</span>
          <input type="range" min={0} max={0.9} step={0.05} value={s.cursorSmoothing} className="w-28 accent-accent" onChange={(e) => s.set({ cursorSmoothing: +e.target.value })} />
        </label>
        <ul className="list-disc pl-4 text-[11px] text-mute">
          <li>Pinch a part to drag it; pinch empty space to rotate the model.</li>
          <li>Point at a part to highlight and select it.</li>
          <li>Pinch with both hands: spread to zoom (or scale the selected part), twist to rotate.</li>
          <li>Point with both hands and spread or close them to set the explosion amount.</li>
          <li>Hold a fist to turn the model into particles (a second fist bursts them). Hold an open palm, or press A, to assemble.</li>
          <li>Press E to step the component explosion, P to toggle particles, Space to pause.</li>
        </ul>
      </div>
    </section>
  );
}
