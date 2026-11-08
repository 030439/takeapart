import { FpsMeter, RollingAverage } from '@/lib/metrics';
import { FrameBus } from '@/lib/FrameBus';
import { IDLE_STATUS, type TrackingStatus } from '@/stores/trackingStore';
import { CameraError, CameraService } from './CameraService';
import { HandTrackingService } from './HandTrackingService';
import type { HandFrame, TrackedHand } from './types';

export interface StartOptions {
  deviceId?: string;
  width: number;
  height: number;
  frameRate: number;
  targetFps: number;
  minDetection: number;
  minPresence: number;
  minTracking: number;
}

/** Latest hands, published every processed frame. Read by the overlay and, from Phase 3, the gesture engine. */
export const EMPTY_FRAME: HandFrame = { hands: [], aspect: 4 / 3, timestamp: 0 };
export const handFrameBus = new FrameBus<HandFrame>(EMPTY_FRAME);

/** Orchestrates camera, detector and the frame loop. Contains no React. */
export class HandTrackingController {
  private camera = new CameraService();
  private tracker = new HandTrackingService();
  private video: HTMLVideoElement | null = null;
  private running = false;
  private starting = false;
  private session = 0;
  private raf = 0;
  private lastVideoTime = -1;
  private lastRun = 0;
  private lastStats = 0;
  private targetFps = 30;
  private fps = new FpsMeter();
  private inference = new RollingAverage();
  private lastPresence = '';

  constructor(private readonly onStatus: (p: Partial<TrackingStatus>) => void) {}

  async start(video: HTMLVideoElement, o: StartOptions): Promise<void> {
    if (this.running || this.starting) return;
    this.starting = true;
    const session = ++this.session;
    this.video = video;
    this.targetFps = o.targetFps;
    this.onStatus({ camera: 'requesting', cameraError: null, trackerError: null });
    try {
      await this.camera.start(video, o, () => this.handleEnded());
    } catch (e) {
      this.starting = false;
      this.onStatus({ camera: 'error', cameraError: e instanceof CameraError ? e.message : 'The camera failed to start.' });
      return;
    }
    if (session !== this.session) { this.starting = false; return; }
    this.onStatus({ camera: 'active', tracker: 'loading' });
    void this.camera.listDevices().then((d) =>
      this.onStatus({ devices: d.map((x, i) => ({ id: x.deviceId, label: x.label || `Camera ${i + 1}` })) }),
    );
    try {
      await this.tracker.init(o);
    } catch (e) {
      this.starting = false;
      this.onStatus({ tracker: 'error', trackerError: e instanceof Error ? e.message : 'Hand tracking failed to start.' });
      return;
    }
    this.starting = false;
    if (session !== this.session) { this.tracker.dispose(); return; }
    this.fps.reset();
    this.inference.reset();
    this.lastVideoTime = -1;
    this.running = true;
    this.onStatus({ tracker: 'ready', delegate: this.tracker.delegate });
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Stops the loop, releases the camera and disposes the detector. Safe to call at any time. */
  stop(): void {
    this.session++;
    this.running = false;
    this.starting = false;
    cancelAnimationFrame(this.raf);
    this.tracker.dispose();
    this.camera.stop();
    this.video = null;
    this.lastPresence = '';
    handFrameBus.publish({ ...EMPTY_FRAME, timestamp: performance.now() });
    this.onStatus({ ...IDLE_STATUS, devices: [] });
  }

  private handleEnded(): void {
    this.stop();
    this.onStatus({ camera: 'error', cameraError: 'The camera was disconnected.' });
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const v = this.video;
    if (!v || v.readyState < 2 || v.videoWidth === 0) return;
    if (now - this.lastRun < 1000 / this.targetFps) return;
    if (v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    this.lastRun = now;

    const t0 = performance.now();
    let hands: TrackedHand[];
    try {
      hands = this.tracker.detect(v, t0);
    } catch (e) {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.onStatus({ tracker: 'error', trackerError: e instanceof Error ? e.message : 'Hand tracking failed.' });
      return;
    }
    const t1 = performance.now();
    this.inference.push(t1 - t0);
    this.fps.tick(t1);
    handFrameBus.publish({ hands, aspect: v.videoWidth / v.videoHeight, timestamp: t1 });

    const left = hands.find((h) => h.handedness === 'Left');
    const right = hands.find((h) => h.handedness === 'Right');
    const presence = `${!!left}${!!right}`;
    if (presence !== this.lastPresence || t1 - this.lastStats > 500) {
      this.lastPresence = presence;
      this.lastStats = t1;
      this.onStatus({
        left: !!left, right: !!right,
        leftScore: left?.score ?? 0, rightScore: right?.score ?? 0,
        fps: this.fps.fps, inferenceMs: this.inference.value,
      });
    }
  };
}
