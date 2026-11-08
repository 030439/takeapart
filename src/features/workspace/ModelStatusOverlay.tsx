import { AlertTriangle, Loader2 } from 'lucide-react';
import { useModelRuntime } from '@/stores/modelRuntimeStore';

export function ModelStatusOverlay({ onRetry }: { onRetry: () => void }) {
  const { status, progress, error, validation } = useModelRuntime();

  if (status === 'loading') {
    return (
      <div className="absolute inset-0 grid place-items-center" role="status" aria-live="polite">
        <div className="glass flex w-64 flex-col items-center gap-3 rounded-xl p-5 text-sm">
          <Loader2 className="animate-spin text-accent2" size={22} />
          <span>Loading model{progress !== null ? ` ${Math.round(progress * 100)}%` : '…'}</span>
          <div className="h-1 w-full overflow-hidden rounded bg-surface">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress === null ? 30 : Math.round(progress * 100)}%` }} />
          </div>
        </div>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="absolute inset-0 grid place-items-center p-4" role="alert">
        <div className="glass flex max-w-sm flex-col items-center gap-3 rounded-xl p-5 text-center text-sm">
          <AlertTriangle className="text-amber-300" size={22} />
          <span>{error}</span>
          <button onClick={onRetry} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10">Try again</button>
        </div>
      </div>
    );
  }
  if (status === 'ready' && validation && !validation.supportsComponents) {
    return (
      <div className="glass absolute top-12 left-1/2 max-w-md -translate-x-1/2 rounded-lg px-3 py-2 text-center text-xs text-amber-300">
        {validation.message}
      </div>
    );
  }
  return null;
}
