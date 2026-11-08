import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { normalizeResult } from './normalize';
import type { TrackedHand } from './types';

export const WASM_URL = '/mediapipe/wasm';
export const MODEL_URL = '/mediapipe/models/hand_landmarker.task';

export interface TrackerConfig {
  minDetection: number;
  minPresence: number;
  minTracking: number;
}

export class HandTrackingService {
  private landmarker: HandLandmarker | null = null;
  delegate: 'GPU' | 'CPU' | null = null;

  /** Vite serves index.html for missing public files, so check the content type as well as the status. */
  private async assertModelAvailable(): Promise<void> {
    const res = await fetch(MODEL_URL, { method: 'HEAD' }).catch(() => null);
    if (!res || !res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) {
      throw new Error(`Hand model not found at ${MODEL_URL}. Run "npm run setup:mediapipe" or download hand_landmarker.task manually.`);
    }
  }

  async init(cfg: TrackerConfig): Promise<void> {
    if (this.landmarker) return;
    await this.assertModelAvailable();
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const create = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: cfg.minDetection,
        minHandPresenceConfidence: cfg.minPresence,
        minTrackingConfidence: cfg.minTracking,
      });
    try {
      this.landmarker = await create('GPU');
      this.delegate = 'GPU';
    } catch {
      this.landmarker = await create('CPU');
      this.delegate = 'CPU';
    }
  }

  /** `timestampMs` must increase on every call. */
  detect(video: HTMLVideoElement, timestampMs: number): TrackedHand[] {
    if (!this.landmarker) return [];
    const result = this.landmarker.detectForVideo(video, timestampMs);
    return normalizeResult(result, timestampMs, true);
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.delegate = null;
  }
}
