// Copies MediaPipe WASM files into public/ and downloads the hand model once.
// Never fails the install: prints manual instructions instead.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const WASM_SRC = 'node_modules/@mediapipe/tasks-vision/wasm';
const WASM_DST = 'public/mediapipe/wasm';
const MODEL_DST = 'public/mediapipe/models/hand_landmarker.task';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

if (existsSync(WASM_SRC)) {
  mkdirSync(WASM_DST, { recursive: true });
  cpSync(WASM_SRC, WASM_DST, { recursive: true });
  console.log('[mediapipe] WASM files copied to', WASM_DST);
} else {
  console.warn('[mediapipe] WASM source not found. Run npm install first.');
}

if (!existsSync(MODEL_DST)) {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync('public/mediapipe/models', { recursive: true });
    writeFileSync(MODEL_DST, Buffer.from(await res.arrayBuffer()));
    console.log('[mediapipe] Model downloaded to', MODEL_DST);
  } catch (e) {
    console.warn(`[mediapipe] Could not download the hand model (${e.message}).`);
    console.warn(`[mediapipe] Download ${MODEL_URL}`);
    console.warn(`[mediapipe] and save it as ${MODEL_DST}`);
  }
}
