import { useEffect, useMemo, useRef } from 'react';
import { Grid3x3, Maximize, RotateCcw, Sparkles, Tag, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react';
import type { ModelMeta } from '@/types/model';
import { Viewport, type ViewportActions } from './Viewport';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { HandCursors } from '@/features/three-engine/HandCursors';
import { useModelSession } from '@/features/models/useModelSession';
import { ModelStatusOverlay } from './ModelStatusOverlay';
import { ExplodeControls } from './ExplodeControls';
import { hasWebGL2 } from '@/features/particle-engine/support';
import { useParticleStore } from '@/stores/particleStore';

function Tool({ icon: Icon, label, onClick, active }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`grid size-9 place-items-center rounded-lg transition-colors hover:bg-white/10 ${active ? 'text-accent2' : 'text-mute'}`}
    >
      <Icon size={18} />
    </button>
  );
}

export function Workspace({ model }: { model: ModelMeta }) {
  const box = useRef<HTMLDivElement>(null);
  const actions = useRef<ViewportActions | null>(null);
  const { loaded, retry } = useModelSession(model);
  const webgl2 = useMemo(() => hasWebGL2(), []);
  const particleState = useParticleStore((s) => s.state);
  const paused = useWorkspaceStore((s) => s.paused);
  useEffect(() => { useParticleStore.getState().patch({ supported: webgl2 }); }, [webgl2]);
  const { gridVisible, labelsVisible, toggleGrid, toggleLabels, selectComponent, assemble, stepExplode, resetExplode } = useWorkspaceStore();

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen();
  };

  useEffect(() => { selectComponent(null); resetExplode(); }, [model.id, selectComponent, resetExplode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === 'r') actions.current?.reset();
      else if (k === 'f') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void box.current?.requestFullscreen();
      } else if (k === 'a') assemble();
      else if (k === 'e') stepExplode(e.shiftKey ? -1 : 1);
      else if (k === 'p') useParticleStore.getState().dispatch('toggle');
      else if (k === ' ') {
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) return;
        e.preventDefault();
        useWorkspaceStore.getState().togglePaused();
      } else if (k === 'escape') selectComponent(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectComponent, assemble, stepExplode]);

  return (
    <div ref={box} className="relative size-full bg-bg">
      {webgl2 ? (
        <Viewport model={model} loaded={loaded} actions={actions} />
      ) : (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-amber-300" role="alert">
          This browser does not support WebGL2, which TakeApart needs for the 3D view and the particle engine. Try a current version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.
        </div>
      )}
      {paused && <div className="glass absolute top-3 right-3 rounded-full px-3 py-1 text-xs">Paused (Space)</div>}
      <HandCursors />
      <ModelStatusOverlay onRetry={retry} />
      <ExplodeControls />
      {model.isPlaceholder && (
        <div className="glass absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs text-mute">
          Demo or test object, not a real model.
        </div>
      )}
      <div className="glass absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-xl p-1">
        <Tool icon={ZoomIn} label="Zoom in" onClick={() => actions.current?.zoom(0.85)} />
        <Tool icon={ZoomOut} label="Zoom out" onClick={() => actions.current?.zoom(1.15)} />
        <Tool icon={RotateCcw} label="Reset camera (R)" onClick={() => actions.current?.reset()} />
        <Tool icon={Grid3x3} label="Toggle grid" onClick={toggleGrid} active={gridVisible} />
        <Tool icon={Tag} label="Toggle labels" onClick={toggleLabels} active={labelsVisible} />
        <Tool icon={Sparkles} label="Particles (P)" onClick={() => useParticleStore.getState().dispatch('toggle')} active={particleState !== 'solid'} />
        <Tool icon={Maximize} label="Fullscreen (F)" onClick={toggleFullscreen} />
      </div>
    </div>
  );
}
