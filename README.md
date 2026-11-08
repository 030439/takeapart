# TakeApart

Hand-gesture controlled 3D exploration platform. Status: **Phase 6 (explode and assemble)**.

## Run
```bash
npm install
npm run typecheck
npm test
npm run dev
```

## Phase 1 contents
- Vite + React 19 + TypeScript + Tailwind v4, `@/` path alias
- Three-panel shell (model library / 3D workspace / interaction panel), collapsible below `lg`
- Model catalog with search, category filters, favorites and recents (Zustand; favorites and recents persist in localStorage)
- React Three Fiber viewport: orbit, zoom, reset (R), fullscreen (F), grid and label toggles, click-to-select parts, Esc to deselect
- Three **procedural demo objects**, flagged `isPlaceholder`. They are not real anatomy, engines or gearboxes.

## Phase 2 contents
- `CameraService`: getUserMedia, device list, typed errors (denied, no camera, in use, unsupported), disconnection detection, track release on stop
- `HandTrackingService`: MediaPipe Hand Landmarker, VIDEO mode, 2 hands, GPU delegate with CPU fallback, configurable confidences
- `HandTrackingController`: frame loop (rAF, throttled to target FPS, skips unchanged video frames), FPS and inference-time metrics
- `HandSkeleton`: canvas overlay with 21 landmarks, connections, fingertips, wrist and left/right labels with confidence
- Landmarks flow through a `FrameBus` (no React renders per frame); only low-frequency status goes into Zustand
- MediaPipe labels hands assuming a mirrored image. Raw frames are unmirrored, so labels are swapped in `normalize.ts`. Verify on your camera.
- `npm install` runs `scripts/setup-mediapipe.mjs`, which copies the WASM files to `public/mediapipe/wasm` and downloads `hand_landmarker.task` to `public/mediapipe/models`. If the download fails, save the file there manually.
- Detection, presence and tracking confidences are stored in settings but have no UI yet (Settings phase).

## Phase 3 contents
Pure TypeScript pipeline in `src/features/gestures` (no React, no MediaPipe imports):
`GestureDetector` (landmarks -> scale-invariant features: pinch ratio, finger extension angles, thumb openness)
-> `GestureRecognizer` (PINCH, POINT, OPEN_PALM, FIST; pinch uses enter/exit hysteresis)
-> `GestureSmoother` (landmark EMA + majority vote over N frames)
-> `GestureStateManager` (per-hand hold time, cooldown for fist/open palm, start/update/end events, hand-lost grace)
-> `GestureMapper` (events -> `grab | drag | release | inspect | inspect_end | assemble | explode` commands).
`GestureEngine` composes them. `gestureRuntime` feeds it from the hand frame bus and publishes `gestureFrameBus` and `commandBus`;
the right-hand panel shows live status through a throttled Zustand store.
- Defaults live in `DEFAULT_GESTURE_CONFIG`. Hold times: pinch 60 ms, point 120 ms, fist 350 ms, open palm 500 ms; cooldown 1000 ms.
- Sensitivity and minimum confidence have sliders; the other thresholds are settings-store fields without UI yet.
- Positions are in the unmirrored camera frame. Mirroring is applied when mapping to 3D (Phase 4).
- Thresholds were reasoned from landmark geometry and synthetic poses, not tuned on real hands. Expect to adjust them.

## Phase 4 contents
Hand-driven 3D interaction in `src/features/three-engine`:
- `handMapping.ts`: camera-frame point -> viewport NDC (mirrored x, edge margin so the viewport edges are reachable, gain, clamped boundaries) and a cursor smoothing filter.
- `InteractionEngine.ts`: pure state machine behind a `SceneAdapter` interface (testable without Three.js).
  - Pinch on a part: select and drag it on a view-facing plane, grab offset preserved, part stays where released.
  - Pinch on empty space: rotate the model (yaw about vertical, pitch about the camera's right axis).
  - Point: highlight the part under the cursor, select it when the point activates.
  - Both hands pinching: spread/close zooms the camera, or scales the selected part if one is selected; twisting the hands rotates the model about the view axis.
  - After a two-hand gesture, the hand still pinching must release and pinch again, so nothing jumps.
  - Open palm (or key `A`): eased return of all parts and the model rotation to their original pose. Original transforms are stored in `ModelHandle.baseline` and never overwritten.
- `ThreeSceneAdapter.ts`: raycasting (translucent shells lose to solid parts behind them), plane projection, world/local conversion, scale clamping (0.3x to 3x), camera zoom within OrbitControls limits.
- `HandCursors.tsx`: overlay rings showing each hand's cursor (filled when pinching), updated outside React.
- Right panel: "Hand control" toggle, Reach and Cursor smoothing sliders, current mode.
- Mouse orbit, wheel zoom and click-to-select still work alongside hand control.

## Phase 5 contents
GLB/GLTF support, in `src/features/models`:
- `ModelLoader` (service): HEAD check (so a missing file is reported as "not found" rather than a parse error), GLTFLoader with progress, per-mesh material cloning (so highlighting one part never lights up others), validation, centring and scaling to a 2.4 unit box, triangle counts, LRU cache of 3 unused models, reference counting, full disposal of geometries, materials and textures.
- `modelStructure.ts` (pure): hierarchy extraction. Components are meshes; named groups holding 2+ meshes become assemblies; other groups are flattened. `validateStructure` enables component interaction only for models with 2+ meshes. A single merged mesh gets a clear limitation message and can still be rotated and zoomed, but its parts cannot be selected, dragged or scaled.
- Catalog: `public/models/manifest.json` (see `manifest.example.json`). Entries are validated; bad ones are skipped and listed in the library panel. Paths must be relative `.glb`/`.gltf` files.
- Curated text: put verified descriptions in the manifest's `components`, keyed by node name (spaces become underscores, as GLTFLoader does). Text is shown only if you supply it. Nothing is generated from mesh names.
- UI: loading indicator with progress, error panel with retry, mesh/triangle/load-time stats, hierarchy with assemblies, selected-component details (description, purpose, function, related).
- A generated test asset, `public/models/samples/multipart-sample.glb` (4 boxes, 2 assemblies; `npm run make:sample` rebuilds it), exercises the whole path. It is not a real machine.

**No real anatomy, engine or machine models are included.** Source licensed GLBs whose components are separate meshes, drop them under `public/models/<category>/`, and list them in the manifest.
Not supported yet: Draco/meshopt/KTX2 compressed files (needs decoder setup), per-component positions and materials as manifest overrides, and explode configuration (Phase 6).

## Phase 6 contents
Component explosion, in `src/features/explode-engine`:
- `explosionVectors.ts` (pure): a full-explosion offset per part, pointing away from the centre of the parts' bounding box. Farther parts travel 40% to 100% of the distance, so inner parts also separate. Parts exactly at the centre get a deterministic spread direction. Optional per-model axis mode (`x`, `y`, `z`) for stacked assemblies.
- `PoseSimulation.ts` (pure): `position = base + vector * amount + manual offset`. Base transforms are never modified, so any number of explode/assemble cycles returns exactly to the start. Dragging a part while exploded keeps its offset; scaling is clamped to 0.3x to 3x; any direct manipulation cancels an assemble in progress.
- `PoseController.ts` (Three.js): builds vectors from each mesh's bounding-box centre while the model is still assembled, converts them into each part's parent space (so scaled or rotated nodes in GLB files work), and applies results to meshes. Only positions and scales change; orientations are never touched.
- Controls: slider (0 to 100%), 25/50/75/100 presets, Assemble button; keys `E` (next preset, `Shift+E` previous) and `A` (assemble). Disabled for models without separate components.
- Hands: fist explodes to 100%, open palm assembles. **Point with both hands** and spread or close them to set the amount. A single point now selects only after a 200 ms hold, so it cannot fire before the second hand joins.
- Assemble also restores the model's rotation and any moved or scaled parts, with eased animation.
- Per-model config in `manifest.json`: `"explode": {"distance": 1.4, "axis": "radial"}`. Distance is in model units (models are scaled to about 2.4 across).
- Parts explode individually. Sub-assemblies do not move as a unit first.
- In Phase 7 the fist gesture is expected to switch to the particle transformation; the slider, `E` key and two-hand control stay.

## Not yet implemented
WebGL2 particles (7), learning mode (8), optimisation (9).
Explode, assemble and particle buttons are deliberately absent until their phases exist.
shadcn/ui is not installed yet (its CLI needs network); add it when first needed.

Also pending: mouse drag-to-move for individual parts, and the remaining keyboard shortcuts (P, Space).
