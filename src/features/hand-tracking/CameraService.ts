export type CameraErrorCode =
  | 'unsupported' | 'permission-denied' | 'no-camera' | 'in-use' | 'overconstrained' | 'unknown';

export class CameraError extends Error {
  constructor(public readonly code: CameraErrorCode, message: string) {
    super(message);
    this.name = 'CameraError';
  }
}

export function mapCameraError(e: unknown): CameraError {
  const name = e instanceof Error || e instanceof DOMException ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('permission-denied', 'Camera permission was denied. Allow camera access in your browser settings, then try again.');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new CameraError('no-camera', 'No camera was found. Connect a webcam and try again.');
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError('in-use', 'The camera could not be opened. Another app may be using it.');
    case 'OverconstrainedError':
      return new CameraError('overconstrained', 'The selected camera does not support the requested settings. Pick another camera or resolution.');
    default:
      return new CameraError('unknown', 'The camera failed to start.');
  }
}

export interface CameraOptions {
  deviceId?: string;
  width: number;
  height: number;
  frameRate: number;
}

export class CameraService {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async listDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  }

  async start(video: HTMLVideoElement, o: CameraOptions, onEnded?: () => void): Promise<void> {
    if (!CameraService.isSupported()) {
      throw new CameraError('unsupported', 'Camera access needs localhost or HTTPS and a browser with getUserMedia support.');
    }
    this.stop();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: o.deviceId ? { exact: o.deviceId } : undefined,
          facingMode: o.deviceId ? undefined : 'user',
          width: { ideal: o.width },
          height: { ideal: o.height },
          frameRate: { ideal: o.frameRate },
        },
        audio: false,
      });
    } catch (e) {
      throw mapCameraError(e);
    }
    this.stream = stream;
    this.video = video;
    stream.getVideoTracks().forEach((t) =>
      t.addEventListener('ended', () => { if (this.stream === stream) onEnded?.(); }),
    );
    video.srcObject = stream;
    video.muted = true;
    try {
      await video.play();
    } catch {
      this.stop();
      throw new CameraError('unknown', 'The camera stream could not be played.');
    }
  }

  /** Stops every track and detaches the stream so the camera light turns off. */
  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
  }
}
