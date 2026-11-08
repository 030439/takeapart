import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { HandTrackingController } from './HandTrackingController';
import { useTrackingSettings, useTrackingStore } from '@/stores/trackingStore';

export function useHandTracking(videoRef: RefObject<HTMLVideoElement | null>) {
  const ref = useRef<HandTrackingController | null>(null);
  if (!ref.current) ref.current = new HandTrackingController((p) => useTrackingStore.getState().patch(p));

  useEffect(() => () => ref.current?.stop(), []);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const s = useTrackingSettings.getState();
    await ref.current!.start(video, {
      deviceId: s.deviceId || undefined,
      width: s.width, height: s.height, frameRate: s.frameRate, targetFps: s.targetFps,
      minDetection: s.minDetection, minPresence: s.minPresence, minTracking: s.minTracking,
    });
  }, [videoRef]);

  const stop = useCallback(() => ref.current?.stop(), []);
  return { start, stop };
}
