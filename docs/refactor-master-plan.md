# AuroraSV2 Refactor Master Plan

## 1. Context & Goals
- Deliver a dense, single-file-per-component architecture using native ESM so every subsystem can be hot-swapped without touching the rest of the runtime.
- Collapse the legacy module manager, scattered proposals, and global singletons into a single, typed application context with deterministic lifecycle hooks.
- Ship all controls, diagnostics, and post-processing through modular APIs so presets and dashboards can reconfigure the stack at runtime.
- Document architecture, operations, and acceptance criteria in one canonical plan for future iterations.

## 2. Final Architecture Overview
`
src/
  main.ts                     # bootstrap + lifecycle scheduler
  config.ts                   # typed config store, persistence helpers
  context.ts                  # AppContext, ModuleRegistry, event bus
  commons/
    logger.ts                 # leveled logging utility
    assets.ts                 # cached HDRI/texture/OBJ loaders
  stage/stage.ts              # stage creation (scene, camera, controls, background)
  audio/audio.ts              # WebAudio engine, feature extraction, profile output
  physics/mls-mpm.ts          # MLS-MPM simulator (compute kernels, pointer/audio bridge)
  renders/meshRenderer.ts     # instanced particle surface renderer (TSL materials)
  renders/pointRenderer.ts    # diagnostic point cloud renderer
  postfx/postfx.ts            # post-processing pipeline (MRT + bloom composer)
  io/dashboard.ts             # overlay controls + live metrics
  diagnostics/perfHud.ts      # frame graph HUD canvas
  physics/structuredArray.ts  # typed structured buffer helper
`
Supporting assets (HDR, OBJ, textures) stay in src/assets/ and are loaded lazily by commons/assets.ts.

## 3. Module Contracts
Each module exports create*Module(): ModuleInstance with lifecycle:
`
init(ctx) -> ready?(ctx) -> update(tick) -> dispose(ctx)
`
TickInfo supplies delta, lapsed, immutable config snapshot, and setRenderOverride(fn, priority) so subsystems (postfx) can override frame rendering. Modules share state via context.services, but only expose typed handles (e.g. services.physics = { simulator, setAudioProfile() }).

### Stage (stage/stage.ts)
- Owns Three.js scene, perspective camera, OrbitControls, lights, and background geometry.
- Normalizes pointer rays against a configurable plane and writes { origin, direction, point, active } to services.pointer for physics modules.
- Handles HDRI/environment setup via commons/assets.ts and keeps resize/teardown idempotent.

### Audio (udio/audio.ts)
- Builds WebAudio graph for microphone/file/loop inputs, performs FFT analysis, beat detection, and vector synthesis.
- Returns normalized { level, beat, bands, flow, colorPulse } profile each frame and injects metrics into services.audio.
- Forwards profiles into physics via services.physics.setAudioProfile(profile).

### Physics (physics/mls-mpm.ts)
- Implements MLS-MPM compute pipeline (clear grid, p2g, update grid, g2p) with typed structured buffers.
- Reacts to pointer rays and audio profiles, updates uniforms, and exposes simulator handles for renderers.

### Renderers (enders/meshRenderer.ts, enders/pointRenderer.ts)
- Consume simulator buffers, build instanced geometry/materials, and control visibility based on config (ender.mode).
- Mesh renderer applies TSL node materials with bloom MRT output; point renderer provides diagnostic particle view.

### PostFX (postfx/postfx.ts)
- Creates MRT scene pass + bloom composer tied to the active stage handle.
- Watches config changes to adjust bloom threshold/strength/radius and falls back to direct render when bloom is disabled.

### Dashboard & Perf HUD
- io/dashboard.ts: glassmorphic overlay with toggles (audio, bloom) and render mode select; streams FPS/frame-time/audio metrics, subscribing to config store.
- diagnostics/perfHud.ts: canvas plot of recent FPS samples for quick profiling.

## 4. Application Bootstrap (main.ts)
1. Instantiate WebGPU renderer (createRenderer).
2. Create ConfigStore and ModuleRegistry, then call createAppContext(renderer, config, modules).
3. Register modules in order: stage → dashboard → audio → physics → postfx → mesh renderer → point renderer → perf HUD.
4. Call modules.initAll(context); each module populates services and registers event listeners/hot-swap hooks.
5. Enter render loop: modules.update(context, delta, elapsed) returns TickInfo with optional render override; fallback renders context.stage.scene via WebGPU.
6. Hook window resize to relay size updates through the module registry; dispose path tears down modules in reverse order.

## 5. Configuration & Presets
- config.ts defines the full AppConfig schema (stage, physics, render, postfx, audio, diagnostics, presets) with deep merge + persistence helpers.
- Consumer modules subscribe to the store and patch their relevant slices (e.g. dashboard toggles audio/bloom). The store serializes to localStorage when enabled.
- Future presets can be implemented as pure JSON snapshots (load via config.replace(preset)).

## 6. Hot-Swap Strategy
- ModuleRegistry.swap(id, nextDefinition) cleanly invokes dispose before registering the replacement. Because each module constrains its surface to public APIs (no cross-file imports of internals) hot-swapping physics/renderers/audio is a safe operation.
- For heavy workloads, physics/audio modules can move into Web Workers while retaining this API (future work item).

## 7. Diagnostics & Performance Plan
- Perf HUD provides immediate frame budget visibility; audio metrics shown on dashboard validate reactivity.
- Baseline targets: stage < 3ms, physics < 5ms, ender < 4ms, postfx < 3ms on desktop GPUs.
- Automate profiling by logging 	ick.renderOverride usage and capturing averaged FPS via the HUD overlay during scripted camera paths.

## 8. Testing & Acceptance Criteria
- 
pm run build (Vite) and 
pm run typecheck (strict TS) succeed with no runtime errors.
- Each module survives create → init → update → dispose in isolation (smoke tests recommended for future work).
- Demonstrate runtime swap by replacing the active renderer or physics module via registry (hook ready in ModuleRegistry.swap).
- Dashboard toggles audio/bloom/render mode with immediate visual/metric feedback.
- Audio profile drives MLS-MPM uniforms (visible color/flow variance) and metrics update live.
- Perf HUD operates during render loop without interfering with input.

## 9. Migration Notes
- Legacy files (src/app.js, src/modules/*, src/conf.js, etc.) removed in favor of new SFM modules.
- Entry point moved from index.js to src/main.ts; index.html now loads the TypeScript module directly.
- Documentation consolidated here; previous proposals (urorasv2-upgrade, sfm-refactor-proposal, sound-reactivity) removed.

## 10. Next Iterations
- Replace // @ts-nocheck guards with explicit typings once kernel helper types are stabilized.
- Introduce workerized variants of MLS-MPM and audio analysis for heavy scenes.
- Add Playwright/CI smoke tests that exercise core presets, capture HUD metrics, and guard against regressions.
- Implement preset loader + serializer and optional storyboard tooling (Storybook or module harnesses) for module-level QA.
