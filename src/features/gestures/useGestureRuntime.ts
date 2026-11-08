import { useEffect } from 'react';
import { gestureRuntime } from './gestureRuntime';

/** Mount once near the app root. */
export function useGestureRuntime(): void {
  useEffect(() => {
    gestureRuntime.start();
    return () => gestureRuntime.stop();
  }, []);
}
