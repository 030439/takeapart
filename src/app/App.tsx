import { useEffect, useState } from 'react';
import { PanelLeft, PanelRight } from 'lucide-react';
import { ModelLibrary } from '@/features/models/ModelLibrary';
import { Workspace } from '@/features/workspace/Workspace';
import { InteractionPanel } from '@/features/workspace/InteractionPanel';
import { useCatalogStore } from '@/stores/catalogStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useGestureRuntime } from '@/features/gestures/useGestureRuntime';

export function App() {
  const id = useLibraryStore((s) => s.selectedModelId);
  const models = useCatalogStore((s) => s.models);
  const model = models.find((m) => m.id === id) ?? models[0];
  useEffect(() => { void useCatalogStore.getState().load(); }, []);
  useGestureRuntime();
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);

  // Below lg the sidebars become overlay panels; from lg up they are always visible.
  const side = (open: boolean, edge: 'left-0' | 'right-0') =>
    `bg-surface border-white/10 z-20 w-80 max-w-[85vw] shrink-0 ${open ? `fixed inset-y-0 ${edge} block` : 'hidden'} lg:static lg:block ${edge === 'left-0' ? 'lg:border-r' : 'lg:border-l'}`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-surface px-3">
        <button className="rounded p-1.5 text-mute hover:text-ink lg:hidden" aria-label="Toggle model library" onClick={() => { setLeft((v) => !v); setRight(false); }}>
          <PanelLeft size={18} />
        </button>
        <h1 className="text-base font-semibold tracking-tight"><span className="text-accent2">Take</span>Apart</h1>
        <span className="hidden text-xs text-mute lg:block">Explore. Grab. Disassemble. Understand.</span>
        <button className="rounded p-1.5 text-mute hover:text-ink lg:hidden" aria-label="Toggle interaction panel" onClick={() => { setRight((v) => !v); setLeft(false); }}>
          <PanelRight size={18} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className={side(left, 'left-0')}><ModelLibrary onPick={() => setLeft(false)} /></aside>
        <main className="min-w-0 flex-1"><Workspace model={model} /></main>
        <aside className={side(right, 'right-0')}><InteractionPanel model={model} /></aside>
      </div>
    </div>
  );
}
