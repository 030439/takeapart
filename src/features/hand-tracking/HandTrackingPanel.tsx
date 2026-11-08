import { useRef, useState, type ReactNode } from 'react';
import { Camera, CameraOff, ShieldCheck } from 'lucide-react';
import { useTrackingSettings, useTrackingStore } from '@/stores/trackingStore';
import { HandSkeleton } from './HandSkeleton';
import { useHandTracking } from './useHandTracking';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-mute">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function HandTrackingPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { start, stop } = useHandTracking(videoRef);
  const t = useTrackingStore();
  const s = useTrackingSettings();
  const [aspect, setAspect] = useState(4 / 3);

  const active = t.camera === 'active';
  const busy = t.camera === 'requesting' || t.tracker === 'loading';
  const cameraText = { off: 'Off', requesting: 'Waiting for permission', active: 'Active', error: t.cameraError ?? 'Error' }[t.camera];
  const trackerText =
    t.tracker === 'ready' ? `Running (${t.delegate})` : t.tracker === 'loading' ? 'Loading model' : t.tracker === 'error' ? 'Error' : 'Idle';
  const hand = (found: boolean, score: number) => (found ? `Detected ${Math.round(score * 100)}%` : 'Not detected');

  const changeCamera = async (id: string) => {
    s.set({ deviceId: id });
    if (active) { stop(); await start(); }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-card p-3">
      <h3 className="mb-2 text-sm font-medium">Hand tracking</h3>
      <div className="relative overflow-hidden rounded-lg bg-black" style={{ aspectRatio: aspect }}>
        <video
          ref={videoRef}
          playsInline
          muted
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
          }}
          className="absolute inset-0 size-full object-cover"
          style={{ transform: s.mirrored ? 'scaleX(-1)' : undefined }}
        />
        <HandSkeleton mirrored={s.mirrored} visible={s.showLandmarks && active} />
        {!active && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-mute">
            {t.camera === 'error' ? t.cameraError : 'Camera is off'}
          </div>
        )}
        {active && <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px]"><span className="size-1.5 rounded-full bg-red-500" />Live</span>}
      </div>

      <button
        onClick={active || busy ? stop : start}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active || busy ? 'border border-white/15 hover:bg-white/10' : 'bg-accent text-bg hover:bg-accent2'}`}
      >
        {active || busy ? <CameraOff size={16} /> : <Camera size={16} />}
        {active || busy ? 'Stop camera' : 'Enable camera'}
      </button>
      <p className="mt-2 flex gap-1.5 text-[11px] text-mute">
        <ShieldCheck size={14} className="shrink-0 text-accent2" />
        Video is processed in your browser. Frames and hand data are never uploaded or saved.
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        <Row label="Camera">{cameraText}</Row>
        <Row label="Tracking">{t.tracker === 'error' ? <span className="text-amber-300">{trackerText}</span> : trackerText}</Row>
        <Row label="Left hand">{hand(t.left, t.leftScore)}</Row>
        <Row label="Right hand">{hand(t.right, t.rightScore)}</Row>
        <Row label="Tracking FPS">{t.fps ? t.fps.toFixed(0) : '–'}</Row>
        <Row label="Inference">{t.inferenceMs ? `${t.inferenceMs.toFixed(1)} ms` : '–'}</Row>
      </div>
      {t.tracker === 'error' && <p className="mt-2 text-xs break-words text-amber-300">{t.trackerError}</p>}

      <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 text-xs">
        {t.devices.length > 1 && (
          <label className="flex items-center justify-between gap-2">
            <span className="text-mute">Camera</span>
            <select
              value={s.deviceId}
              onChange={(e) => void changeCamera(e.target.value)}
              className="max-w-40 rounded border border-white/10 bg-surface px-1.5 py-1"
            >
              <option value="">Default</option>
              {t.devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center justify-between">
          <span className="text-mute">Mirror preview</span>
          <input type="checkbox" className="accent-accent" checked={s.mirrored} onChange={(e) => s.set({ mirrored: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-mute">Show landmarks</span>
          <input type="checkbox" className="accent-accent" checked={s.showLandmarks} onChange={(e) => s.set({ showLandmarks: e.target.checked })} />
        </label>
        <p className="text-[11px] text-mute">Gesture recognition arrives in Phase 3.</p>
      </div>
    </section>
  );
}
